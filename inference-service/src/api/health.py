"""Health check and info endpoints."""

import time
import torch
from fastapi import APIRouter

from ..models.responses import ModelListResponse, ModelInfo
from ..core.model_manager import ModelManager

router = APIRouter()


def create_health_router(model_manager: ModelManager) -> APIRouter:
    """
    Create health check router with model manager dependency.

    Args:
        model_manager: Model manager instance

    Returns:
        APIRouter with health endpoints
    """

    @router.get("/")
    async def root():
        """Root endpoint with service information."""
        return {
            "service": "OpenAI-Compatible Inference Service",
            "version": "1.0.0",
            "platform": "Cloud Run with GPU",
            "status": "running",
            "gpu_available": torch.cuda.is_available(),
            "loaded_models": model_manager.list_loaded_models(),
        }

    @router.get("/health")
    async def health():
        """Health check endpoint."""
        return {
            "status": "healthy",
            "gpu_available": torch.cuda.is_available(),
            "loaded_models_count": len(model_manager.list_loaded_models()),
            "loaded_models": model_manager.list_loaded_models(),
        }

    @router.get("/v1/models", response_model=ModelListResponse)
    async def list_models():
        """List loaded models (OpenAI compatible)."""
        models = [
            ModelInfo(id=model_id, created=int(time.time()), owned_by="organization")
            for model_id in model_manager.list_loaded_models()
        ]
        return ModelListResponse(data=models)

    return router
