"""
Configuration management for the inference service.

Loads configuration from environment variables with sensible defaults.
"""

import os
import torch
from dotenv import load_dotenv

# Load environment variables from .env file for local development
load_dotenv()


class Config:
    """Application configuration loaded from environment variables."""

    # GCS Configuration
    GCS_BUCKET = os.getenv("GCS_BUCKET", "your-models-bucket")
    GCS_MODEL_PREFIX = os.getenv("GCS_MODEL_PREFIX", "models/")

    # Model Cache Configuration
    LOCAL_MODEL_CACHE = os.getenv("LOCAL_MODEL_CACHE", "/tmp/model_cache")
    MAX_CACHED_MODELS = int(os.getenv("MAX_CACHED_MODELS", "2"))  # Cloud Run: keep small

    # Server Configuration - Cloud Run optimized
    MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "50"))
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "300"))

    # Model Configuration
    DEFAULT_MAX_TOKENS = int(os.getenv("DEFAULT_MAX_TOKENS", "512"))
    DEFAULT_TEMPERATURE = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))

    # Local development mode flag
    IS_LOCAL = os.getenv("LOCAL_DEV", "false").lower() == "true"

    # GPU/Device Configuration
    # Detect Apple Silicon MPS support for local testing
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        DEVICE = "mps"
        TORCH_DTYPE = torch.float32  # MPS has numerical issues with fp16, use fp32
    elif torch.cuda.is_available():
        DEVICE = "cuda"
        TORCH_DTYPE = torch.float16
    else:
        DEVICE = "cpu"
        TORCH_DTYPE = torch.float32

    @staticmethod
    def get_max_concurrent() -> int:
        """Get max concurrent requests based on environment."""
        if Config.IS_LOCAL:
            return 1  # Only 1 concurrent request for local testing
        return Config.MAX_CONCURRENT_REQUESTS

    @staticmethod
    def get_max_cached_models() -> int:
        """Get max cached models based on environment."""
        if Config.IS_LOCAL:
            return 1  # Only keep 1 model in memory locally
        return Config.MAX_CACHED_MODELS


# Global config instance
config = Config()
