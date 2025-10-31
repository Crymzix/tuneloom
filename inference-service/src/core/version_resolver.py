"""
Version resolver for determining active model versions.

Resolves which version of a model should be used for inference
by querying Firestore and caching results for performance.
"""

import time
from typing import Dict, Tuple, Optional
from google.cloud import firestore

from ..utils.logging import get_logger

logger = get_logger(__name__)


class VersionResolver:
    """
    Resolves active model versions with intelligent caching.

    Queries Firestore to determine which version of a model is currently
    active and caches results to minimize database queries.
    """

    def __init__(self, cache_ttl: int = 900):
        """
        Initialize version resolver.

        Args:
            cache_ttl: Cache time-to-live in seconds (default: 900 = 15 minutes)
        """
        self.db = firestore.Client()
        self.cache: Dict[str, Tuple[str, float]] = {}
        self.cache_ttl = cache_ttl
        logger.info(f"Initialized VersionResolver with {cache_ttl}s cache TTL")

    def get_active_version_label(self, model_name: str) -> Optional[str]:
        """
        Get the active version label for a model.

        Checks cache first, then queries Firestore if needed.
        Returns None for base models (contains '/') which don't have versions.

        Args:
            model_name: Name of the model

        Returns:
            Version label (e.g., 'v1', 'v2') or None if not a custom model

        Raises:
            ValueError: If model not found or has no active version
        """
        # Base models (e.g., 'meta-llama/Llama-3.2-1B') don't have versions
        if "/" in model_name:
            logger.debug(f"Model {model_name} is a base model, no version resolution needed")
            return None

        # Check cache first
        if model_name in self.cache:
            version_label, cached_at = self.cache[model_name]
            age = time.time() - cached_at

            if age < self.cache_ttl:
                logger.debug(f"Cache hit for {model_name}: {version_label} (age: {age:.1f}s)")
                return version_label
            else:
                logger.debug(f"Cache expired for {model_name} (age: {age:.1f}s)")

        # Query Firestore
        logger.info(f"Querying Firestore for active version of {model_name}")
        version_label = self._query_active_version(model_name)

        # Cache result
        self.cache[model_name] = (version_label, time.time())
        logger.info(f"Cached active version for {model_name}: {version_label}")

        return version_label

    def _query_active_version(self, model_name: str) -> str:
        """
        Query Firestore for the active version of a model.

        Args:
            model_name: Name of the model

        Returns:
            Version label

        Raises:
            ValueError: If model not found or has no active version
        """
        try:
            # Query for model document by name
            models_ref = self.db.collection('models')
            query = models_ref.where('name', '==', model_name).limit(1)
            docs = list(query.stream())

            if not docs:
                raise ValueError(f"Model not found: {model_name}")

            model_doc = docs[0]
            model_data = model_doc.to_dict()
            active_version_id = model_data.get('activeVersionId')

            if not active_version_id:
                raise ValueError(
                    f"Model {model_name} has no active version. "
                    "Please activate a version in the web interface."
                )

            # Get version details from subcollection
            version_ref = model_doc.reference.collection('versions').document(active_version_id)
            version_doc = version_ref.get()

            if not version_doc.exists:
                raise ValueError(
                    f"Active version {active_version_id} not found for model {model_name}"
                )

            version_data = version_doc.to_dict()
            version_label = version_data.get('versionLabel')

            if not version_label:
                raise ValueError(
                    f"Version {active_version_id} missing versionLabel for model {model_name}"
                )

            logger.debug(f"Resolved {model_name} -> {version_label} (version ID: {active_version_id})")
            return version_label

        except Exception as e:
            logger.error(f"Failed to query active version for {model_name}: {e}")
            raise

    def invalidate_cache(self, model_name: str) -> bool:
        """
        Invalidate cached version for a specific model.

        Useful when a model version has been changed and we want
        to force a fresh lookup on the next request.

        Args:
            model_name: Name of the model

        Returns:
            True if cache entry was removed, False if not in cache
        """
        if model_name in self.cache:
            del self.cache[model_name]
            logger.info(f"Invalidated cache for {model_name}")
            return True
        else:
            logger.debug(f"No cache entry to invalidate for {model_name}")
            return False

    def clear_cache(self) -> int:
        """
        Clear all cached version data.

        Returns:
            Number of entries cleared
        """
        count = len(self.cache)
        self.cache.clear()
        logger.info(f"Cleared {count} cached version entries")
        return count

    def get_cache_stats(self) -> Dict[str, any]:
        """
        Get cache statistics for monitoring.

        Returns:
            Dictionary with cache statistics
        """
        return {
            "cached_models": len(self.cache),
            "cache_ttl": self.cache_ttl,
            "models": [
                {
                    "name": name,
                    "version": label,
                    "age_seconds": time.time() - cached_at,
                }
                for name, (label, cached_at) in self.cache.items()
            ],
        }
