"""Admin endpoints for service management."""

import time
import asyncio
import torch
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from pydantic import BaseModel

from ..config import config
from ..core.model_manager import ModelManager
from .middleware.auth import verify_api_key

router = APIRouter()


class PrewarmRequest(BaseModel):
    """Request model for pre-warming models."""
    model_ids: List[str]
    parallel: bool = True  # Load models in parallel or sequentially


def create_admin_router(model_manager: ModelManager) -> APIRouter:
    """
    Create admin router with model manager dependency.

    Args:
        model_manager: Model manager instance

    Returns:
        APIRouter with admin endpoints
    """

    @router.post("/admin/unload/{model_id}")
    async def unload_model(
        model_id: str,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Manually unload a model - Requires authentication.

        Note: Only authenticated users can access admin endpoints.
        In local dev mode with auth disabled, this is accessible without credentials.
        """
        # Additional check: You may want to restrict admin endpoints to specific users
        # For now, any authenticated user can use admin endpoints
        await model_manager.unload_model(model_id)
        return {
            "message": f"Model {model_id} unloaded",
            "requestedBy": auth.get("userId")
        }

    @router.get("/admin/stats")
    async def get_stats(auth: Dict[str, Any] = Depends(verify_api_key)):
        """
        Get service statistics - Requires authentication.

        Note: Only authenticated users can access admin endpoints.
        In local dev mode with auth disabled, this is accessible without credentials.
        """
        stats = {
            "loaded_models": model_manager.list_loaded_models(),
            "model_count": len(model_manager.list_loaded_models()),
            "max_concurrent_requests": config.MAX_CONCURRENT_REQUESTS,
            "gcs_bucket": config.GCS_BUCKET,
        }

        if torch.cuda.is_available():
            stats.update(
                {
                    "gpu": {
                        "name": torch.cuda.get_device_name(0),
                        "total_memory_gb": torch.cuda.get_device_properties(0).total_memory
                        / 1e9,
                        "allocated_memory_gb": torch.cuda.memory_allocated(0) / 1e9,
                        "free_memory_gb": (
                            torch.cuda.get_device_properties(0).total_memory
                            - torch.cuda.memory_allocated(0)
                        )
                        / 1e9,
                    }
                }
            )

        return stats

    @router.post("/admin/invalidate-cache/{model_name}")
    async def invalidate_model_cache(
        model_name: str,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Invalidate version cache for a model and optionally unload it.

        This forces the inference service to re-resolve the active version
        from Firestore on the next request. Useful after activating a new version.

        Args:
            model_name: Name of the model to invalidate cache for

        Note: Requires authentication.
        """
        # Invalidate version cache
        was_cached = model_manager.version_resolver.invalidate_cache(model_name)

        # Optionally unload the model to force reload
        was_loaded = model_name in model_manager.list_loaded_models()
        if was_loaded:
            await model_manager.unload_model(model_name)

        return {
            "message": f"Cache invalidated for {model_name}",
            "version_cache_cleared": was_cached,
            "model_unloaded": was_loaded,
            "requestedBy": auth.get("userId")
        }

    @router.post("/admin/clear-all-version-cache")
    async def clear_all_version_cache(
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Clear all cached version data.

        Forces all subsequent requests to re-resolve active versions from Firestore.

        Note: Requires authentication.
        """
        cleared_count = model_manager.version_resolver.clear_cache()

        return {
            "message": "All version cache cleared",
            "entries_cleared": cleared_count,
            "requestedBy": auth.get("userId")
        }

    @router.get("/admin/version-cache-stats")
    async def get_version_cache_stats(
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Get version cache statistics.

        Shows which models have cached version info and cache age.

        Note: Requires authentication.
        """
        cache_stats = model_manager.version_resolver.get_cache_stats()

        return {
            **cache_stats,
            "requestedBy": auth.get("userId")
        }

    @router.post("/admin/prewarm")
    async def prewarm_models(
        request: PrewarmRequest,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Pre-warm (pre-load) one or more models into memory.

        This endpoint allows you to load models before they are needed,
        reducing latency for the first inference request. Useful for:
        - Warming up instances after deployment
        - Loading frequently-used models during startup
        - Preparing models during low-traffic periods

        Args:
            request: PrewarmRequest containing list of model IDs and load strategy
                - model_ids: List of model identifiers to load
                - parallel: If True, load models in parallel (default: True)

        Returns:
            Status for each model including load time and success/failure

        Note: Requires authentication with BASE_MODEL_API_KEY.
        """
        start_time = time.time()
        results = []

        async def load_single_model(model_id: str) -> Dict[str, Any]:
            """Load a single model and return its status."""
            model_start = time.time()

            # Strip slashes from model ID
            normalized_model_id = model_id.replace("/", "-")

            try:
                await model_manager.load_model(normalized_model_id)
                load_time = time.time() - model_start
                return {
                    "model_id": model_id,
                    "normalized_model_id": normalized_model_id,
                    "status": "success",
                    "load_time_seconds": round(load_time, 2),
                    "message": f"Model loaded successfully in {round(load_time, 2)}s"
                }
            except Exception as e:
                load_time = time.time() - model_start
                return {
                    "model_id": model_id,
                    "normalized_model_id": normalized_model_id,
                    "status": "error",
                    "load_time_seconds": round(load_time, 2),
                    "error": str(e),
                    "message": f"Failed to load model: {str(e)}"
                }

        # Load models based on strategy
        if request.parallel:
            # Load all models in parallel
            tasks = [load_single_model(model_id) for model_id in request.model_ids]
            results = await asyncio.gather(*tasks)
        else:
            # Load models sequentially
            for model_id in request.model_ids:
                result = await load_single_model(model_id)
                results.append(result)

        total_time = time.time() - start_time
        success_count = sum(1 for r in results if r["status"] == "success")
        error_count = len(results) - success_count

        return {
            "message": f"Pre-warming complete: {success_count} succeeded, {error_count} failed",
            "total_time_seconds": round(total_time, 2),
            "parallel": request.parallel,
            "models_requested": len(request.model_ids),
            "models_loaded": success_count,
            "models_failed": error_count,
            "results": results,
            "requestedBy": auth.get("userId")
        }

    return router
