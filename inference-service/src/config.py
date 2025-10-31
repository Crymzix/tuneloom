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

    # Cloud Storage FUSE mount path (if volume is mounted via Cloud Console)
    # If set, models will be read directly from mounted volume instead of downloading
    MOUNT_PATH = os.getenv("MOUNT_PATH", None)

    # Model Cache Configuration
    LOCAL_MODEL_CACHE = os.getenv("LOCAL_MODEL_CACHE", "/tmp/model_cache")

    # Soft limit: Start evicting models when memory usage exceeds this fraction (0.0-1.0)
    MEMORY_SOFT_LIMIT = float(os.getenv("MEMORY_SOFT_LIMIT", "0.8"))  # 80% of available memory
    # Hard limit: Minimum free memory to maintain (in GB)
    MIN_FREE_MEMORY_GB = float(os.getenv("MIN_FREE_MEMORY_GB", "2.0"))  # Keep 2GB free

    # Server Configuration - Cloud Run optimized
    MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "50"))
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "300"))

    # Model Configuration
    DEFAULT_MAX_TOKENS = int(os.getenv("DEFAULT_MAX_TOKENS", "512"))
    DEFAULT_TEMPERATURE = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))

    # Local development mode flag
    IS_LOCAL = os.getenv("LOCAL_DEV", "false").lower() == "true"

    # Authentication Configuration
    REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() == "true"
    BASE_MODEL_API_KEY = os.getenv("BASE_MODEL_API_KEY", None)  # Static key for base models

    # GPU/Device Configuration
    # Detect Apple Silicon MPS support for local testing
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        DEVICE = "mps"
        TORCH_DTYPE = torch.float32  # MPS has numerical issues with fp16, use fp32
    elif torch.cuda.is_available():
        DEVICE = "cuda"
        # Use bfloat16 for better numerical stability than float16
        # bfloat16 has same memory footprint but wider exponent range (like fp32)
        if torch.cuda.is_bf16_supported():
            TORCH_DTYPE = torch.bfloat16
        else:
            TORCH_DTYPE = torch.float32
    else:
        DEVICE = "cpu"
        TORCH_DTYPE = torch.float32

    @staticmethod
    def get_max_concurrent() -> int:
        """Get max concurrent requests based on environment."""
        if Config.IS_LOCAL:
            return 1  # Only 1 concurrent request for local testing
        return Config.MAX_CONCURRENT_REQUESTS


# Global config instance
config = Config()
