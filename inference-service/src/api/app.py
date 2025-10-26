"""FastAPI application factory and setup."""

from contextlib import asynccontextmanager
import torch
from fastapi import FastAPI

from ..config import config
from ..core.model_manager import ModelManager
from ..core.inference_engine import InferenceEngine
from ..utils.logging import setup_logging, get_logger
from .health import create_health_router
from .completions import create_completions_router
from .admin import create_admin_router

# Setup logging
setup_logging()
logger = get_logger(__name__)


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application
    """
    # Initialize core components
    model_manager = ModelManager()
    inference_engine = InferenceEngine(model_manager)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Startup and shutdown events."""
        logger.info("Starting inference service...")
        logger.info(f"Local dev mode: {config.IS_LOCAL}")
        logger.info(f"Device: {config.DEVICE}")
        logger.info(f"Dtype: {config.TORCH_DTYPE}")
        logger.info(f"CUDA available: {torch.cuda.is_available()}")
        logger.info(
            f"MPS available: {torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else False}"
        )

        if torch.cuda.is_available():
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
            logger.info(
                f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB"
            )

        logger.info(f"GCS Bucket: {config.GCS_BUCKET}")
        logger.info(f"Max concurrent requests: {config.get_max_concurrent()}")
        logger.info(f"Max cached models: {config.get_max_cached_models()}")
        yield
        logger.info("Shutting down inference service...")

    # Create FastAPI app
    app = FastAPI(
        title="OpenAI-Compatible Inference Service",
        description="Production inference service for Cloud Run with GPU",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Register routers
    health_router = create_health_router(model_manager)
    completions_router = create_completions_router(inference_engine)
    admin_router = create_admin_router(model_manager)

    app.include_router(health_router, tags=["Health"])
    app.include_router(completions_router, tags=["Completions"])
    app.include_router(admin_router, tags=["Admin"])

    return app
