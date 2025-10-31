"""Admin endpoints for service management."""

import torch
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any

from ..config import config
from ..core.model_manager import ModelManager
from .middleware.auth import verify_api_key

router = APIRouter()


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
            "max_cached_models": config.MAX_CACHED_MODELS,
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

    return router
