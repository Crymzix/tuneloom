"""Admin endpoints for service management."""

import torch
from fastapi import APIRouter

from ..config import config
from ..core.model_manager import ModelManager

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
    async def unload_model(model_id: str):
        """Manually unload a model."""
        await model_manager.unload_model(model_id)
        return {"message": f"Model {model_id} unloaded"}

    @router.get("/admin/stats")
    async def get_stats():
        """Get service statistics."""
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

    return router
