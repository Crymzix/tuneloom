"""Model loading and caching management."""

import os
import time
import json
import asyncio
from typing import Dict, Optional
from pathlib import Path
from fastapi import HTTPException
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

from ..config import config
from ..utils.logging import get_logger
from ..utils import memory
from .version_resolver import VersionResolver

logger = get_logger(__name__)


class ModelManager:
    """
    Manages model loading, caching, and lifecycle.

    Handles downloading models from GCS, local caching, and LRU eviction
    when memory limits are reached.
    """

    def __init__(self):
        """Initialize the model manager."""
        # Legacy cache for base models and fine-tuned models
        self.models: Dict[str, dict] = {}
        self.model_access_times: Dict[str, float] = {}
        self.loading_locks: Dict[str, asyncio.Lock] = {}

        # Two-tier cache: base models and adapters
        self.base_models: Dict[str, dict] = {}  # Cache base models separately
        self.base_model_access_times: Dict[str, float] = {}
        self.model_configs: Dict[str, dict] = {}  # Cache training configs

        self._ensure_cache_dir()

        # Initialize version resolver for custom model versioning
        self.version_resolver = VersionResolver(cache_ttl=900)  # 15 minute cache
        logger.info("Initialized version resolver for custom model versioning")

        # Log if using mounted volume
        if config.MOUNT_PATH:
            logger.info(f"Cloud Storage volume mounted at: {config.MOUNT_PATH}")
            logger.info("Models will be read directly from mounted volume when available")

        # Initialize GCS client (used for fallback when MOUNT_PATH not set or model not found)
        try:
            from google.cloud import storage

            self.gcs_client = storage.Client()
            self.bucket = self.gcs_client.bucket(config.GCS_BUCKET)
            logger.info(f"Connected to GCS bucket: {config.GCS_BUCKET}")
        except Exception as e:
            # Only raise error if MOUNT_PATH is not configured (no fallback available)
            if not config.MOUNT_PATH:
                logger.error(f"GCS client initialization failed and no MOUNT_PATH configured: {e}")
                raise RuntimeError(f"Cannot initialize GCS client: {e}")
            else:
                logger.warning(f"GCS client initialization failed, relying on mounted volume: {e}")
                self.gcs_client = None
                self.bucket = None

    def _ensure_cache_dir(self) -> None:
        """Create cache directory if it doesn't exist."""
        os.makedirs(config.LOCAL_MODEL_CACHE, exist_ok=True)

    def _get_local_model_path(self, model_id: str) -> str:
        """
        Get local path for cached model.

        Args:
            model_id: Model identifier

        Returns:
            Local filesystem path
        """
        return os.path.join(config.LOCAL_MODEL_CACHE, model_id.replace("/", "-"))

    def _get_gcs_model_path(self, model_id: str) -> str:
        """
        Get GCS path for model with version resolution.

        For custom fine-tuned models (no slashes), resolves the active version
        and returns path: models/{modelName}/{versionLabel}

        For base models (contains '/'), returns path: models/{modelId with / -> -}

        Args:
            model_id: Model identifier

        Returns:
            GCS path
        """
        # Check if this is a custom fine-tuned model (no slashes)
        if "/" not in model_id:
            # Resolve active version for custom models
            try:
                version_label = self.version_resolver.get_active_version_label(model_id)
                if version_label:
                    path = f"{config.GCS_MODEL_PREFIX}{model_id}/{version_label}"
                    logger.info(f"Resolved custom model {model_id} to versioned path: {path}")
                    return path
            except Exception as e:
                logger.error(f"Failed to resolve version for {model_id}: {e}")
                # Fall back to non-versioned path for backward compatibility
                logger.warning(f"Falling back to non-versioned path for {model_id}")

        # Base model from HuggingFace or fallback
        formatted_model_id = model_id.replace("/", "-")
        return f"{config.GCS_MODEL_PREFIX}{formatted_model_id}"

    def _get_mounted_model_path(self, model_id: str) -> str | None:
        """
        Get mounted volume path for model if MOUNT_PATH is configured.

        For custom models, resolves active version and checks versioned path.
        For base models, checks standard path.

        Args:
            model_id: Model identifier

        Returns:
            Mounted path if available and model exists, None otherwise
        """
        if not config.MOUNT_PATH:
            return None

        # For custom fine-tuned models (no slashes), check versioned path
        if "/" not in model_id:
            try:
                version_label = self.version_resolver.get_active_version_label(model_id)
                if version_label:
                    # Check versioned path: models/{modelName}/{versionLabel}
                    versioned_path = os.path.join(
                        config.MOUNT_PATH,
                        config.GCS_MODEL_PREFIX.rstrip("/"),
                        model_id,
                        version_label
                    )

                    if os.path.exists(versioned_path) and os.path.isdir(versioned_path):
                        if self._is_valid_model_directory(versioned_path):
                            logger.info(f"Found versioned model {model_id}/{version_label} in mounted volume at {versioned_path}")
                            return versioned_path
            except Exception as e:
                logger.warning(f"Failed to resolve version for mounted model {model_id}: {e}")

        # For base models or fallback
        formatted_model_id = model_id.replace("/", "-")
        base_path = os.path.join(config.MOUNT_PATH, config.GCS_MODEL_PREFIX.rstrip("/"), formatted_model_id)

        # Check if base model directory exists
        if os.path.exists(base_path) and os.path.isdir(base_path):
            if self._is_valid_model_directory(base_path):
                logger.info(f"Found model {model_id} in mounted volume at {base_path}")
                return base_path

        return None

    def _is_valid_model_directory(self, path: str) -> bool:
        """
        Check if directory contains valid model files.

        Supports both single-file models and sharded models.

        Args:
            path: Directory path to check

        Returns:
            True if directory contains model files
        """
        # Check for config.json
        has_config = os.path.exists(os.path.join(path, "config.json"))

        if not has_config:
            logger.warning(f"Validation failed: config.json not found in {path}")
            return False

        # Check for model weight files (single-file or sharded)
        try:
            files = os.listdir(path)

            # Single-file model patterns
            single_file_patterns = ["pytorch_model.bin", "model.safetensors"]
            has_single_file = any(f in files for f in single_file_patterns)

            # Index file patterns (for sharded models)
            index_patterns = ["pytorch_model.bin.index.json", "model.safetensors.index.json"]
            has_index = any(f in files for f in index_patterns)

            # Sharded model patterns (check if any files match the pattern)
            has_sharded = any(
                f.startswith("model-") and f.endswith(".safetensors") or
                f.startswith("pytorch_model-") and f.endswith(".bin")
                for f in files
            )

            has_weights = has_single_file or has_index or has_sharded

            if not has_weights:
                logger.warning(f"Validation failed: No model weight files found in {path}")
                logger.warning(f"Directory contains {len(files)} files: {files[:20]}")
                logger.warning(f"Expected single-file models, index files, or sharded models")
            else:
                logger.debug(f"Model validation passed for {path}")

            return has_weights

        except Exception as e:
            logger.error(f"Failed to validate model directory {path}: {e}")
            return False

    async def _download_from_gcs(self, model_id: str) -> str:
        """
        Get model path from mounted volume or download from GCS to local cache.

        If MOUNT_PATH is configured, will attempt to use mounted volume first
        before falling back to GCS download.

        Args:
            model_id: Model identifier

        Returns:
            Path to model (mounted volume or local cache)

        Raises:
            FileNotFoundError: If model not found in mounted volume or GCS
        """
        # First, check if model is available in mounted volume
        mounted_path = self._get_mounted_model_path(model_id)
        if mounted_path:
            logger.info(f"Using model from mounted volume: {mounted_path}")
            return mounted_path

        # Fall back to local cache + GCS download
        local_path = self._get_local_model_path(model_id)

        # Check if already cached
        if os.path.exists(local_path) and os.path.isdir(local_path):
            logger.info(f"Model {model_id} found in local cache")
            return local_path

        # If GCS client is not available, we can't download
        if not self.bucket:
            raise FileNotFoundError(
                f"Model {model_id} not found in mounted volume and GCS client not available"
            )

        logger.info(f"Downloading model {model_id} from GCS...")
        gcs_path = self._get_gcs_model_path(model_id)

        try:
            # List all blobs with the model prefix
            blobs = list(self.bucket.list_blobs(prefix=gcs_path))

            if not blobs:
                raise FileNotFoundError(f"Model {model_id} not found in GCS at {gcs_path}")

            os.makedirs(local_path, exist_ok=True)

            # Download files
            for blob in blobs:
                # Get relative path within model directory
                relative_path = blob.name[len(gcs_path) :].lstrip("/")
                if not relative_path:
                    continue

                local_file_path = os.path.join(local_path, relative_path)
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)

                blob.download_to_filename(local_file_path)
                logger.debug(f"Downloaded {blob.name}")

            logger.info(f"Model {model_id} downloaded successfully")
            return local_path

        except Exception as e:
            logger.error(f"Failed to download model {model_id}: {e}")
            # Cleanup partial download
            if os.path.exists(local_path):
                import shutil

                shutil.rmtree(local_path)
            raise

    async def _load_training_config(self, model_id: str) -> Optional[dict]:
        """
        Load training_config.json for a fine-tuned model.

        Checks mounted volume first, then local cache, then GCS.

        Args:
            model_id: Model identifier

        Returns:
            Training config dict if found, None otherwise
        """
        # Check if already cached
        if model_id in self.model_configs:
            logger.debug(f"Using cached training config for {model_id}")
            return self.model_configs[model_id]

        config_filename = "training_config.json"

        # Try mounted volume first
        if config.MOUNT_PATH:
            formatted_model_id = model_id.replace("/", "-")
            mounted_config_path = os.path.join(
                config.MOUNT_PATH,
                config.GCS_MODEL_PREFIX.rstrip("/"),
                formatted_model_id,
                config_filename
            )
            if os.path.exists(mounted_config_path):
                logger.info(f"Loading training config from mounted volume: {mounted_config_path}")
                with open(mounted_config_path, 'r') as f:
                    config_dict = json.load(f)
                    self.model_configs[model_id] = config_dict
                    return config_dict

        # Try local cache
        local_model_path = self._get_local_model_path(model_id)
        local_config_path = os.path.join(local_model_path, config_filename)
        if os.path.exists(local_config_path):
            logger.info(f"Loading training config from local cache: {local_config_path}")
            with open(local_config_path, 'r') as f:
                config_dict = json.load(f)
                self.model_configs[model_id] = config_dict
                return config_dict

        # Try GCS
        if self.bucket:
            gcs_path = self._get_gcs_model_path(model_id)
            gcs_config_path = f"{gcs_path}/{config_filename}"

            try:
                blob = self.bucket.blob(gcs_config_path)
                if blob.exists():
                    logger.info(f"Downloading training config from GCS: {gcs_config_path}")
                    config_str = blob.download_as_text()
                    config_dict = json.loads(config_str)
                    self.model_configs[model_id] = config_dict
                    return config_dict
            except Exception as e:
                logger.debug(f"Error loading training config from GCS: {e}")

        logger.debug(f"No training config found for {model_id}")
        return None

    async def _is_fine_tuned_model(self, model_id: str) -> bool:
        """
        Check if model is a fine-tuned model by looking for training_config.json.

        Args:
            model_id: Model identifier

        Returns:
            True if model has training_config.json (is fine-tuned), False otherwise
        """
        training_config = await self._load_training_config(model_id)
        return training_config is not None

    def _get_adapter_path(self, model_id: str) -> Optional[str]:
        """
        Get path to adapter directory from mounted volume or local cache.

        Args:
            model_id: Model identifier

        Returns:
            Path to adapter directory if it exists, None otherwise
        """
        # Check mounted volume first
        if config.MOUNT_PATH:
            formatted_model_id = model_id.replace("/", "-")
            mounted_adapter_path = os.path.join(
                config.MOUNT_PATH,
                config.GCS_MODEL_PREFIX.rstrip("/"),
                formatted_model_id,
                "adapter"
            )
            if os.path.exists(mounted_adapter_path) and os.path.isdir(mounted_adapter_path):
                logger.info(f"Found adapter in mounted volume: {mounted_adapter_path}")
                return mounted_adapter_path

        # Check local cache
        local_model_path = self._get_local_model_path(model_id)
        local_adapter_path = os.path.join(local_model_path, "adapter")
        if os.path.exists(local_adapter_path) and os.path.isdir(local_adapter_path):
            logger.info(f"Found adapter in local cache: {local_adapter_path}")
            return local_adapter_path

        return None

    async def _download_adapter(self, model_id: str) -> str:
        """
        Download adapter from GCS to local cache.

        Args:
            model_id: Model identifier

        Returns:
            Path to downloaded adapter directory

        Raises:
            FileNotFoundError: If adapter not found in GCS
        """
        # Check if adapter already exists locally
        existing_path = self._get_adapter_path(model_id)
        if existing_path:
            return existing_path

        if not self.bucket:
            raise FileNotFoundError(
                f"Adapter for {model_id} not found locally and GCS client not available"
            )

        logger.info(f"Downloading adapter for {model_id} from GCS...")
        gcs_path = self._get_gcs_model_path(model_id)
        gcs_adapter_path = f"{gcs_path}/adapter"

        # Check if adapter exists in GCS
        adapter_blobs = list(self.bucket.list_blobs(prefix=gcs_adapter_path, max_results=1))
        if not adapter_blobs:
            raise FileNotFoundError(f"Adapter not found in GCS at {gcs_adapter_path}")

        # Download adapter to local cache
        local_model_path = self._get_local_model_path(model_id)
        local_adapter_path = os.path.join(local_model_path, "adapter")
        os.makedirs(local_adapter_path, exist_ok=True)

        try:
            # List and download all adapter files
            blobs = list(self.bucket.list_blobs(prefix=gcs_adapter_path))
            for blob in blobs:
                relative_path = blob.name[len(gcs_adapter_path):].lstrip("/")
                if not relative_path:
                    continue

                local_file_path = os.path.join(local_adapter_path, relative_path)
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                blob.download_to_filename(local_file_path)
                logger.debug(f"Downloaded {blob.name}")

            logger.info(f"Adapter downloaded successfully to {local_adapter_path}")
            return local_adapter_path

        except Exception as e:
            logger.error(f"Failed to download adapter for {model_id}: {e}")
            # Cleanup partial download
            if os.path.exists(local_adapter_path):
                import shutil
                shutil.rmtree(local_adapter_path)
            raise

    async def _load_base_model(self, base_model_id: str) -> dict:
        """
        Load base model if not already cached.

        Args:
            base_model_id: Base model identifier

        Returns:
            Dictionary containing model, tokenizer, and device info
        """
        # Check if base model is already loaded
        if base_model_id in self.base_models:
            self.base_model_access_times[base_model_id] = time.time()
            logger.info(f"Using cached base model: {base_model_id}")
            return self.base_models[base_model_id]

        logger.info(f"Loading base model: {base_model_id}")

        # Download from GCS
        local_path = await self._download_from_gcs(base_model_id)

        # Estimate memory for base model
        if config.DEVICE == "cuda" and torch.cuda.is_bf16_supported():
            precision = "bf16"
        elif config.DEVICE == "mps":
            precision = "fp32"
        else:
            precision = "fp32"

        estimated_memory = memory.estimate_model_memory(base_model_id, precision)
        logger.info(f"Estimated base model memory: {memory.format_memory_size(estimated_memory)}")

        # Evict models if needed
        self._evict_for_memory(estimated_memory)

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            local_path, local_files_only=True, trust_remote_code=True
        )

        # Configure tokenizer
        self._configure_tokenizer(tokenizer, base_model_id)

        # Load model
        model = self._load_model_to_device(local_path)

        # Calculate actual memory usage
        actual_memory = memory.get_model_actual_memory(model)
        logger.info(f"Actual base model memory: {memory.format_memory_size(actual_memory)}")

        # Cache base model
        self.base_models[base_model_id] = {
            "model": model,
            "tokenizer": tokenizer,
            "device": config.DEVICE,
            "memory_gb": actual_memory,
        }
        self.base_model_access_times[base_model_id] = time.time()

        logger.info(f"Base model {base_model_id} loaded successfully")
        return self.base_models[base_model_id]

    async def _load_and_apply_adapter(
        self, model_id: str, base_model: torch.nn.Module, adapter_path: str
    ) -> torch.nn.Module:
        """
        Load LoRA adapter and apply to base model using PEFT.

        Args:
            model_id: Fine-tuned model identifier (for logging)
            base_model: Base model to apply adapter to
            adapter_path: Path to adapter directory

        Returns:
            Model with adapter applied
        """
        logger.info(f"Applying adapter to base model for {model_id}")

        try:
            # Load adapter using PEFT
            model_with_adapter = PeftModel.from_pretrained(
                base_model,
                adapter_path,
                is_trainable=False  # For inference only
            )

            logger.info(f"Adapter applied successfully for {model_id}")
            return model_with_adapter

        except Exception as e:
            logger.error(f"Failed to apply adapter for {model_id}: {e}")
            raise

    def _get_fine_tuned_models_using_base(self, base_model_id: str) -> list:
        """
        Get list of fine-tuned models that reference a specific base model.

        Args:
            base_model_id: Base model identifier

        Returns:
            List of fine-tuned model IDs using this base model
        """
        using_models = []
        for model_id, model_dict in self.models.items():
            if model_dict.get("base_model_id") == base_model_id:
                using_models.append(model_id)
        return using_models

    def _evict_lru_model(self) -> None:
        """
        Evict least recently used model.

        Prioritizes evicting fine-tuned models over base models.
        Never evicts a base model if fine-tuned models are still using it.
        """
        if not self.models and not self.base_models:
            return

        # First, try to evict fine-tuned models (cheaper to reload)
        fine_tuned_models = {
            model_id: access_time
            for model_id, access_time in self.model_access_times.items()
            if "base_model_id" in self.models.get(model_id, {})
        }

        if fine_tuned_models:
            # Evict LRU fine-tuned model
            lru_model = min(fine_tuned_models.items(), key=lambda x: x[1])
            model_id = lru_model[0]

            logger.info(f"Evicting LRU fine-tuned model: {model_id}")

            if "memory_gb" in self.models[model_id]:
                freed_memory = self.models[model_id]["memory_gb"]
                logger.info(f"Freeing {memory.format_memory_size(freed_memory)} by evicting {model_id}")

            del self.models[model_id]
            del self.model_access_times[model_id]
            if model_id in self.loading_locks:
                del self.loading_locks[model_id]

            memory.clear_gpu_cache()
            return

        # If no fine-tuned models, evict regular models
        if self.models:
            lru_model = min(self.model_access_times.items(), key=lambda x: x[1])
            model_id = lru_model[0]

            logger.info(f"Evicting LRU model: {model_id}")

            if "memory_gb" in self.models[model_id]:
                freed_memory = self.models[model_id]["memory_gb"]
                logger.info(f"Freeing {memory.format_memory_size(freed_memory)} by evicting {model_id}")

            del self.models[model_id]
            del self.model_access_times[model_id]
            if model_id in self.loading_locks:
                del self.loading_locks[model_id]

            memory.clear_gpu_cache()
            return

        # Last resort: evict base models (but only if no fine-tuned models are using them)
        if self.base_models:
            for base_model_id, access_time in sorted(
                self.base_model_access_times.items(), key=lambda x: x[1]
            ):
                # Check if any fine-tuned models are using this base model
                using_models = self._get_fine_tuned_models_using_base(base_model_id)
                if not using_models:
                    logger.info(f"Evicting base model: {base_model_id}")

                    if "memory_gb" in self.base_models[base_model_id]:
                        freed_memory = self.base_models[base_model_id]["memory_gb"]
                        logger.info(f"Freeing {memory.format_memory_size(freed_memory)} by evicting {base_model_id}")

                    del self.base_models[base_model_id]
                    del self.base_model_access_times[base_model_id]
                    memory.clear_gpu_cache()
                    return

            logger.warning("Cannot evict base models - all are in use by fine-tuned models")

    def _evict_for_memory(self, required_gb: float) -> None:
        """
        Evict LRU models until we have enough memory available.

        Args:
            required_gb: Amount of memory required in GB
        """
        # Get current available memory
        available_memory, mem_type = memory.get_available_memory()

        logger.info(
            f"Memory check: {memory.format_memory_size(available_memory)} available ({mem_type}), "
            f"{memory.format_memory_size(required_gb)} required"
        )

        # Calculate how much we need to free
        min_free = config.MIN_FREE_MEMORY_GB
        total_needed = required_gb + min_free

        if available_memory >= total_needed:
            logger.info("Sufficient memory available, no eviction needed")
            return

        # We need to evict models to free up memory
        memory_to_free = total_needed - available_memory
        logger.info(f"Need to free {memory.format_memory_size(memory_to_free)}")

        # Evict LRU models until we have enough memory
        evicted_count = 0
        while available_memory < total_needed and self.models:
            self._evict_lru_model()
            evicted_count += 1

            # Re-check available memory
            available_memory, _ = memory.get_available_memory()

            if evicted_count >= len(self.models) + 1:
                # Safety check to prevent infinite loop
                logger.warning("Evicted all models but still insufficient memory")
                break

        if evicted_count > 0:
            logger.info(
                f"Evicted {evicted_count} model(s), "
                f"{memory.format_memory_size(available_memory)} now available"
            )

    def _configure_tokenizer(self, tokenizer, model_id: str):
        """
        Configure tokenizer with necessary defaults.

        Args:
            tokenizer: Tokenizer to configure
            model_id: Model identifier for logging
        """
        # Ensure tokenizer has pad token (critical for generation)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            logger.info(f"Set pad_token to eos_token for {model_id}")

        # Check if model has native chat template
        has_chat_template = hasattr(tokenizer, "chat_template") and tokenizer.chat_template is not None

        if not has_chat_template:
            # Use a simple but effective default chat template with proper stop tokens
            tokenizer.chat_template = (
                "{% for message in messages %}"
                "{% if message['role'] == 'system' %}{{ message['content'] + '\\n\\n' }}"
                "{% elif message['role'] == 'user' %}{{ 'User: ' + message['content'] + '\\n' }}"
                "{% elif message['role'] == 'assistant' %}{{ 'Assistant: ' + message['content'] + '\\n' }}"
                "{% endif %}"
                "{% endfor %}"
                "{% if add_generation_prompt %}{{ 'Assistant:' }}{% endif %}"
            )
            logger.info(f"Set default chat template for {model_id}")

        # Always set stop tokens to prevent multi-turn hallucination
        # This is critical even for models with native chat templates
        if not hasattr(tokenizer, "stop_tokens") or tokenizer.stop_tokens is None:
            # Detect model-specific stop tokens based on chat template or model name
            stop_tokens = self._get_stop_tokens_for_model(tokenizer, model_id)

            # Validate that stop tokens are in the tokenizer's vocabulary
            validated_stop_tokens = []
            for stop_token in stop_tokens:
                # Try to encode the stop token
                encoded = tokenizer.encode(stop_token, add_special_tokens=False)
                if encoded:
                    validated_stop_tokens.append(stop_token)
                    logger.debug(f"Stop token '{stop_token}' encoded as {encoded}")
                else:
                    logger.warning(f"Stop token '{stop_token}' not in vocabulary, skipping")

            # If no valid stop tokens, use a safer default
            if not validated_stop_tokens:
                logger.warning(f"No valid stop tokens found for {model_id}, using fallback")
                validated_stop_tokens = ["\n\n", "\n"]

            tokenizer.stop_tokens = validated_stop_tokens
            logger.info(f"Set stop tokens for {model_id}: {tokenizer.stop_tokens}")

    def _get_stop_tokens_for_model(self, tokenizer, model_id: str) -> list:
        """
        Determine appropriate stop tokens based on model type and chat template.

        Args:
            tokenizer: Tokenizer with chat template
            model_id: Model identifier

        Returns:
            List of stop token strings
        """
        # First, check if tokenizer has additional_special_tokens that might include stop tokens
        stop_tokens = []
        if hasattr(tokenizer, "additional_special_tokens"):
            # Look for common stop token patterns in special tokens
            for token in tokenizer.additional_special_tokens:
                if "im_end" in token or "end_of_turn" in token or token == "</s>":
                    stop_tokens.append(token)

        # If we found special tokens, use them
        if stop_tokens:
            logger.info(f"Found stop tokens in special tokens for {model_id}: {stop_tokens}")
            return stop_tokens

        # Check if model has a chat template we can analyze
        if hasattr(tokenizer, "chat_template") and tokenizer.chat_template:
            chat_template = tokenizer.chat_template

            # Qwen models use ChatML format with <|im_start|> and <|im_end|> markers
            # The model generates: <|im_start|>assistant\nResponse<|im_end|>
            # So we need to stop when we see <|im_end|> (marks end of assistant turn)
            if "im_start" in chat_template or "qwen" in model_id.lower():
                return ["<|im_end|>"]

            # Gemma and similar models often use specific role markers
            if "gemma" in model_id.lower():
                # Gemma uses turn-based markers
                return ["<start_of_turn>", "<end_of_turn>"]

            # Llama-style chat templates
            if "[INST]" in chat_template or "llama" in model_id.lower():
                return ["[/INST]"]

            # Check for common user/assistant markers in template
            if "user" in chat_template.lower() and "assistant" in chat_template.lower():
                if "<|user|>" in chat_template or "<|assistant|>" in chat_template:
                    return ["<|user|>", "<|assistant|>"]

        # Generic fallback stop tokens that work for most chat formats
        # Include variations to catch the start of a new turn
        return ["User:", "\nUser:", "\n\nUser:", "user:", "\nuser:"]

    def _load_model_to_device(self, local_path: str) -> torch.nn.Module:
        """
        Load model to appropriate device with optimizations.

        Args:
            local_path: Local path to model files

        Returns:
            Loaded model
        """
        load_kwargs = {
            "local_files_only": True,
            "trust_remote_code": True,
            "low_cpu_mem_usage": True,
        }

        # Device-specific optimizations
        if config.DEVICE == "mps":
            # Apple Silicon MPS: use fp32 for numerical stability
            load_kwargs["torch_dtype"] = torch.float32
            model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
            model = model.to(config.DEVICE)
        elif config.DEVICE == "cuda":
            # NVIDIA GPU: use bfloat16 for better numerical stability than float16
            # bfloat16 has same memory footprint as fp16 but wider exponent range (like fp32)
            # This prevents the inf/nan issues seen with fp16 during sampling
            if torch.cuda.is_bf16_supported():
                logger.info("Using bfloat16 for CUDA (better numerical stability)")
                load_kwargs["torch_dtype"] = torch.bfloat16
            else:
                # Fallback to fp32 if bfloat16 not supported (unlikely on modern GPUs)
                logger.warning("bfloat16 not supported, falling back to fp32")
                load_kwargs["torch_dtype"] = torch.float32
            load_kwargs["device_map"] = "auto"
            model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
        else:
            # CPU: use full precision, consider 8-bit if available
            if config.IS_LOCAL:
                # For local testing on CPU, try to use 8-bit quantization
                try:
                    load_kwargs["load_in_8bit"] = True
                    model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                except Exception as e:
                    logger.warning(f"8-bit loading failed: {e}, using fp32")
                    load_kwargs.pop("load_in_8bit", None)
                    load_kwargs["torch_dtype"] = torch.float32
                    model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
            else:
                load_kwargs["torch_dtype"] = torch.float32
                load_kwargs["device_map"] = "auto"
                model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)

        return model

    async def load_model(self, model_id: str) -> dict:
        """
        Load model from GCS or cache.

        Supports both base models and fine-tuned models with adapters.
        For fine-tuned models, loads base model and applies adapter using PEFT.

        Args:
            model_id: Model identifier

        Returns:
            Dictionary containing model, tokenizer, and device info

        Raises:
            HTTPException: If model loading fails
        """
        # Check if model is already loaded
        if model_id in self.models:
            self.model_access_times[model_id] = time.time()
            logger.info(f"Using cached model: {model_id}")
            return self.models[model_id]

        # Create lock for this model if it doesn't exist
        if model_id not in self.loading_locks:
            self.loading_locks[model_id] = asyncio.Lock()

        # Acquire lock to prevent duplicate loading
        async with self.loading_locks[model_id]:
            # Double-check if model was loaded while waiting
            if model_id in self.models:
                self.model_access_times[model_id] = time.time()
                return self.models[model_id]

            logger.info(f"Loading model: {model_id}")

            try:
                # Check if this is a fine-tuned model
                is_fine_tuned = await self._is_fine_tuned_model(model_id)

                if is_fine_tuned:
                    # Load fine-tuned model with adapter
                    logger.info(f"Detected fine-tuned model: {model_id}")

                    # Get training config to find base model
                    training_config = await self._load_training_config(model_id)
                    base_model_id = training_config.get("base_model")

                    if not base_model_id:
                        raise ValueError(f"Training config for {model_id} missing 'base_model' field")

                    logger.info(f"Base model for {model_id}: {base_model_id}")

                    # Load base model (will use cache if already loaded)
                    base_model_dict = await self._load_base_model(base_model_id)

                    # Download adapter
                    adapter_path = await self._download_adapter(model_id)

                    # Apply adapter to base model
                    model_with_adapter = await self._load_and_apply_adapter(
                        model_id,
                        base_model_dict["model"],
                        adapter_path
                    )

                    # Estimate adapter memory (adapters are tiny, ~50MB)
                    adapter_memory = 0.05  # Approximate 50MB

                    # Cache the fine-tuned model
                    self.models[model_id] = {
                        "model": model_with_adapter,
                        "tokenizer": base_model_dict["tokenizer"],  # Reuse base tokenizer
                        "device": config.DEVICE,
                        "memory_gb": adapter_memory,  # Only count adapter memory
                        "base_model_id": base_model_id,  # Track which base model this uses
                    }
                    self.model_access_times[model_id] = time.time()

                    logger.info(f"Fine-tuned model {model_id} loaded successfully with adapter")
                    return self.models[model_id]

                else:
                    # Load as base model (standard model loading)
                    logger.info(f"Loading as base model: {model_id}")

                    # Download from GCS
                    local_path = await self._download_from_gcs(model_id)
                    logger.info(f"Model {model_id} downloaded to {local_path}")

                    # Estimate model memory requirement
                    if config.DEVICE == "cuda" and torch.cuda.is_bf16_supported():
                        precision = "bf16"
                    elif config.DEVICE == "mps":
                        precision = "fp32"
                    else:
                        precision = "fp32"

                    estimated_memory = memory.estimate_model_memory(model_id, precision)
                    logger.info(f"Estimated memory requirement: {memory.format_memory_size(estimated_memory)}")

                    # Evict models if needed to make room
                    self._evict_for_memory(estimated_memory)

                    # Load tokenizer
                    tokenizer = AutoTokenizer.from_pretrained(
                        local_path, local_files_only=True, trust_remote_code=True
                    )

                    # Configure tokenizer
                    self._configure_tokenizer(tokenizer, model_id)

                    # Load model
                    model = self._load_model_to_device(local_path)

                    # Calculate actual memory usage
                    actual_memory = memory.get_model_actual_memory(model)
                    logger.info(f"Actual memory usage: {memory.format_memory_size(actual_memory)}")

                    # Cache model with memory tracking
                    self.models[model_id] = {
                        "model": model,
                        "tokenizer": tokenizer,
                        "device": config.DEVICE,
                        "memory_gb": actual_memory,
                    }
                    self.model_access_times[model_id] = time.time()

                    logger.info(f"Model {model_id} loaded successfully")
                    return self.models[model_id]

            except Exception as e:
                logger.error(f"Failed to load model {model_id}: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Failed to load model {model_id}: {str(e)}"
                )

    def list_loaded_models(self) -> list:
        """
        List currently loaded models.

        Returns:
            List of model IDs
        """
        return list(self.models.keys())

    async def unload_model(self, model_id: str) -> None:
        """
        Manually unload a model.

        Args:
            model_id: Model identifier
        """
        if model_id in self.models:
            logger.info(f"Unloading model: {model_id}")
            del self.models[model_id]
            if model_id in self.model_access_times:
                del self.model_access_times[model_id]
            memory.clear_gpu_cache()
