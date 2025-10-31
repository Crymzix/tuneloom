"""
Memory monitoring utilities for dynamic model caching.

This module provides utilities for:
- Monitoring GPU memory (CUDA/MPS)
- Monitoring system RAM
- Estimating model memory requirements
- Calculating actual model memory usage
"""

import logging
import psutil
import torch
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


def get_available_gpu_memory() -> float:
    """
    Get available GPU memory in GB.

    Supports CUDA and MPS (Apple Silicon) devices.

    Returns:
        Available GPU memory in GB, or 0.0 if no GPU available
    """
    try:
        if torch.cuda.is_available():
            # CUDA device
            device_idx = torch.cuda.current_device()
            gpu_stats = torch.cuda.mem_get_info(device_idx)
            free_memory_bytes = gpu_stats[0]
            total_memory_bytes = gpu_stats[1]
            free_gb = free_memory_bytes / (1024**3)

            logger.debug(
                f"CUDA GPU {device_idx}: {free_gb:.2f}GB free of "
                f"{total_memory_bytes / (1024**3):.2f}GB total"
            )
            return free_gb

        elif torch.backends.mps.is_available():
            # MPS (Apple Silicon) - no direct memory query API
            # Use system memory as proxy
            vm = psutil.virtual_memory()
            free_gb = vm.available / (1024**3)
            logger.debug(f"MPS device: Using system memory as proxy: {free_gb:.2f}GB available")
            return free_gb

        else:
            logger.debug("No GPU available")
            return 0.0

    except Exception as e:
        logger.warning(f"Error getting GPU memory: {e}")
        return 0.0


def get_available_system_memory() -> float:
    """
    Get available system RAM in GB.

    Returns:
        Available RAM in GB
    """
    try:
        vm = psutil.virtual_memory()
        available_gb = vm.available / (1024**3)
        total_gb = vm.total / (1024**3)

        logger.debug(f"System RAM: {available_gb:.2f}GB free of {total_gb:.2f}GB total")
        return available_gb

    except Exception as e:
        logger.warning(f"Error getting system memory: {e}")
        return 0.0


def get_available_memory() -> Tuple[float, str]:
    """
    Get available memory and determine which type to use.

    Returns:
        Tuple of (available_memory_gb, memory_type) where memory_type is 'gpu' or 'cpu'
    """
    gpu_memory = get_available_gpu_memory()

    # If GPU available, use GPU memory; otherwise use system memory
    if gpu_memory > 0:
        return gpu_memory, 'gpu'
    else:
        return get_available_system_memory(), 'cpu'


def estimate_model_memory(
    model_id: str,
    precision: str = "fp16",
    config: Optional[dict] = None
) -> float:
    """
    Estimate model memory requirement in GB.

    This is a rough estimation based on model parameters and precision.
    For more accurate results, provide the model config with num_parameters.

    Args:
        model_id: Model identifier (e.g., "meta-llama/Llama-3-8B-Instruct")
        precision: Model precision ("fp32", "fp16", "bf16", "int8", "int4")
        config: Optional model config dict with parameter count

    Returns:
        Estimated memory requirement in GB
    """
    # Precision to bytes mapping
    precision_bytes = {
        "fp32": 4,
        "fp16": 2,
        "bf16": 2,
        "int8": 1,
        "int4": 0.5,
    }

    bytes_per_param = precision_bytes.get(precision.lower(), 2)  # Default to fp16

    # Try to extract parameter count from model_id or config
    num_params_billions = None

    if config and "num_parameters" in config:
        num_params_billions = config["num_parameters"] / 1e9
    else:
        # Try to parse from model_id
        # Supports: "8B", "8b" (billions), "270M", "270m" (millions)
        import re

        # Try billions first (e.g., "Llama-3-8B" -> 8 billion)
        match_b = re.search(r'(\d+\.?\d*)b', model_id.lower())
        if match_b:
            num_params_billions = float(match_b.group(1))
        else:
            # Try millions (e.g., "gemma-3-270m" -> 0.27 billion)
            match_m = re.search(r'(\d+\.?\d*)m', model_id.lower())
            if match_m:
                num_params_millions = float(match_m.group(1))
                num_params_billions = num_params_millions / 1000.0

    if num_params_billions is None:
        # Conservative default for unknown models
        logger.warning(
            f"Could not determine parameter count for {model_id}, "
            "using conservative estimate of 7B parameters"
        )
        num_params_billions = 7.0

    # Memory calculation: params * bytes_per_param * overhead_factor
    # Overhead factor accounts for:
    # - Optimizer states (if any)
    # - Activation memory
    # - KV cache
    # - Framework overhead
    overhead_factor = 1.2

    memory_gb = num_params_billions * bytes_per_param * overhead_factor

    logger.debug(
        f"Estimated memory for {model_id}: {memory_gb:.2f}GB "
        f"({num_params_billions}B params, {precision}, {overhead_factor}x overhead)"
    )

    return memory_gb


def get_model_actual_memory(model: torch.nn.Module) -> float:
    """
    Calculate actual memory usage of a loaded model in GB.

    Args:
        model: Loaded PyTorch model

    Returns:
        Actual memory usage in GB
    """
    try:
        # Get model parameter memory
        param_size = 0
        for param in model.parameters():
            param_size += param.nelement() * param.element_size()

        # Get buffer memory
        buffer_size = 0
        for buffer in model.buffers():
            buffer_size += buffer.nelement() * buffer.element_size()

        total_size_bytes = param_size + buffer_size
        total_size_gb = total_size_bytes / (1024**3)

        logger.debug(
            f"Model actual memory: {total_size_gb:.2f}GB "
            f"(params: {param_size / (1024**3):.2f}GB, buffers: {buffer_size / (1024**3):.2f}GB)"
        )

        return total_size_gb

    except Exception as e:
        logger.warning(f"Error calculating model memory: {e}")
        return 0.0


def clear_gpu_cache() -> None:
    """
    Clear GPU cache to free up memory.

    Calls appropriate cache clearing method based on device type.
    """
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.debug("Cleared CUDA cache")
        elif torch.backends.mps.is_available():
            torch.mps.empty_cache()
            logger.debug("Cleared MPS cache")
    except Exception as e:
        logger.warning(f"Error clearing GPU cache: {e}")


def format_memory_size(size_gb: float) -> str:
    """
    Format memory size for human-readable display.

    Args:
        size_gb: Size in GB

    Returns:
        Formatted string (e.g., "1.50GB", "512.00MB")
    """
    if size_gb >= 1.0:
        return f"{size_gb:.2f}GB"
    else:
        return f"{size_gb * 1024:.2f}MB"
