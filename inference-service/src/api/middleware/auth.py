"""Authentication middleware for API key validation."""

import hashlib
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.cloud import firestore
from datetime import datetime
from cachetools import TTLCache

from ...utils.logging import get_logger
from ...config import config

logger = get_logger(__name__)

# Security scheme
security = HTTPBearer(auto_error=False)

# Cache configuration
CACHE_TTL = 1800  # 30 minutes - adjust based on your needs
CACHE_MAX_SIZE = 1000  # Maximum number of keys to cache


class AuthMiddleware:
    """
    Middleware for API key authentication.

    Validates API keys against Firestore and enforces model-level access control.
    """

    def __init__(self):
        """Initialize auth middleware with Firestore client."""
        self.db = None
        self.require_auth = config.REQUIRE_AUTH
        self.base_model_key = config.BASE_MODEL_API_KEY

        # Initialize in-memory cache for API keys
        # Keys expire after CACHE_TTL seconds
        self.key_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL)
        logger.info(f"API key cache initialized (TTL={CACHE_TTL}s, max_size={CACHE_MAX_SIZE})")

        # Only initialize Firestore if auth is required
        if self.require_auth:
            try:
                self.db = firestore.Client()
                logger.info("Firestore client initialized for authentication")
            except Exception as e:
                logger.error(f"Failed to initialize Firestore client: {e}")
                if not config.IS_LOCAL:
                    raise

    def _extract_model_from_path(self, path: str) -> Optional[str]:
        """
        Extract model name from request path.

        Supports patterns:
        - /v1/{model_name}/chat/completions
        - /v1/{model_name}/completions

        Args:
            path: Request URL path

        Returns:
            Model name if found in path, None otherwise
        """
        path_parts = path.strip("/").split("/")

        # Check for /v1/{model}/chat/completions or /v1/{model}/completions
        if len(path_parts) >= 2 and path_parts[0] == "v1":
            potential_model = path_parts[1]
            # Don't treat these as model names
            if potential_model not in ["chat", "completions", "models"]:
                return potential_model

        return None

    async def verify_api_key(
        self,
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = None
    ) -> Dict[str, Any]:
        """
        Verify API key from Authorization header.

        Args:
            request: FastAPI request object
            credentials: HTTP Bearer credentials

        Returns:
            Authentication context dictionary with user/model info

        Raises:
            HTTPException: If authentication fails
        """
        # Skip auth for health endpoints
        if request.url.path in ["/", "/health", "/v1/models"]:
            return {"authenticated": False, "reason": "health_endpoint"}

        # Local development bypass
        if not self.require_auth:
            logger.debug("Auth bypass enabled for local development")
            return {"authenticated": False, "bypass": True, "reason": "local_dev"}

        # Extract API key from Authorization header
        if not credentials:
            logger.warning(f"Missing Authorization header for {request.url.path}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header. Use: Authorization: Bearer <api_key>",
                headers={"WWW-Authenticate": "Bearer"},
            )

        api_key = credentials.credentials

        # Validate key format (should start with sk_ or ak_)
        if not (api_key.startswith("sk_") or api_key.startswith("ak_")):
            logger.warning(f"Invalid API key format from {request.client.host}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key format"
            )

        # Check if this is a base model request using the static key
        if api_key == self.base_model_key and self.base_model_key:
            logger.info(f"Base model static key used from {request.client.host}")
            return {
                "authenticated": True,
                "type": "base",
                "modelId": "*",  # Access to all base models
                "userId": None,
                "keyId": "base_static_key"
            }

        # Hash the provided key for comparison
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Check cache first
        cached_key_data = self.key_cache.get(key_hash)

        if cached_key_data:
            logger.debug(f"API key found in cache: {key_hash[:8]}...")
            key_data = cached_key_data["data"]
            key_doc_id = cached_key_data["id"]
        else:
            # Cache miss - query Firestore
            logger.debug(f"Cache miss for API key: {key_hash[:8]}..., querying Firestore")
            try:
                api_keys_ref = self.db.collection("api-keys")
                query = api_keys_ref.where("keyHash", "==", key_hash).where("isActive", "==", True).limit(1)
                results = query.stream()

                key_doc = None
                for doc in results:
                    key_doc = doc
                    break

                if not key_doc:
                    logger.warning(f"Invalid or inactive API key attempted from {request.client.host}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid or inactive API key"
                    )

                key_data = key_doc.to_dict()
                key_doc_id = key_doc.id

                # Store in cache
                self.key_cache[key_hash] = {
                    "data": key_data,
                    "id": key_doc_id
                }
                logger.debug(f"Cached API key data for {key_hash[:8]}...")

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Firestore query error: {e}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Authentication service error"
                )

            # Check expiration
            expires_at = key_data.get("expiresAt")
            if expires_at:
                # Convert Firestore timestamp to datetime if needed
                if hasattr(expires_at, 'timestamp'):
                    expires_at = datetime.fromtimestamp(expires_at.timestamp())

                if expires_at < datetime.now():
                    logger.warning(f"Expired API key attempted from {request.client.host}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="API key has expired"
                    )

            # Extract requested model from path
            requested_model = self._extract_model_from_path(request.url.path)

            # Validate model access
            allowed_model = key_data.get("modelName")

            # If a specific model is in the path, verify access
            if requested_model and allowed_model != "*":
                if allowed_model != requested_model:
                    logger.warning(
                        f"Access denied: key for '{allowed_model}' attempted to access '{requested_model}'"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"API key does not have access to model '{requested_model}'"
                    )

            logger.info(
                f"Authenticated request: keyId={key_doc_id}, userId={key_data.get('userId')}, "
                f"model={requested_model or allowed_model}"
            )

            return {
                "authenticated": True,
                "type": key_data.get("type"),
                "modelId": allowed_model,
                "userId": key_data.get("userId"),
                "keyId": key_doc_id,
                "requestedModel": requested_model
            }


# Global auth middleware instance
auth_middleware = AuthMiddleware()


async def verify_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    Dependency function for route authentication.

    Usage in routes:
        @router.post("/endpoint")
        async def endpoint(auth: dict = Depends(verify_api_key)):
            # auth contains user context
            pass
    """
    return await auth_middleware.verify_api_key(request, credentials)
