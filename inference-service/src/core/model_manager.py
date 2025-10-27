"""Model loading and caching management."""

import os
import time
import asyncio
from typing import Dict
from fastapi import HTTPException
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from ..config import config
from ..utils.logging import get_logger

logger = get_logger(__name__)


class ModelManager:
    """
    Manages model loading, caching, and lifecycle.

    Handles downloading models from GCS, local caching, and LRU eviction
    when memory limits are reached.
    """

    def __init__(self):
        """Initialize the model manager."""
        self.models: Dict[str, dict] = {}
        self.model_access_times: Dict[str, float] = {}
        self.loading_locks: Dict[str, asyncio.Lock] = {}
        self._ensure_cache_dir()

        # Initialize GCS client
        try:
            from google.cloud import storage

            self.gcs_client = storage.Client()
            self.bucket = self.gcs_client.bucket(config.GCS_BUCKET)
            logger.info(f"Connected to GCS bucket: {config.GCS_BUCKET}")
        except Exception as e:
            logger.error(f"GCS client initialization failed: {e}")
            raise RuntimeError(f"Cannot initialize GCS client: {e}")

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
        Get GCS path for model.

        Converts slashes to hyphens for GCS storage compatibility.

        Args:
            model_id: Model identifier

        Returns:
            GCS path
        """
        formatted_model_id = model_id.replace("/", "-")
        return f"{config.GCS_MODEL_PREFIX}{formatted_model_id}"

    async def _download_from_gcs(self, model_id: str) -> str:
        """
        Download model from GCS to local cache.

        Args:
            model_id: Model identifier

        Returns:
            Local path to downloaded model

        Raises:
            FileNotFoundError: If model not found in GCS
        """
        local_path = self._get_local_model_path(model_id)

        # Check if already cached
        if os.path.exists(local_path) and os.path.isdir(local_path):
            logger.info(f"Model {model_id} found in local cache")
            # Check if merged subdirectory exists in cache
            merged_path = os.path.join(local_path, "merged")
            if os.path.exists(merged_path) and os.path.isdir(merged_path):
                logger.info(f"Using cached merged subdirectory: {merged_path}")
                return merged_path
            return local_path

        logger.info(f"Downloading model {model_id} from GCS...")
        gcs_path = self._get_gcs_model_path(model_id)

        # Check if fine-tuned model has a merged subdirectory in GCS
        gcs_merged_path = f"{gcs_path}/merged"
        merged_blobs = list(self.bucket.list_blobs(prefix=gcs_merged_path, max_results=1))

        if merged_blobs:
            logger.info(f"Found merged subdirectory in GCS for {model_id}, using {gcs_merged_path}")
            gcs_path = gcs_merged_path
            # Adjust local path to point to merged subdirectory
            local_path = os.path.join(local_path, "merged")
        else:
            logger.info(f"Getting model from path {gcs_path} from GCS...")

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

    def _evict_lru_model(self) -> None:
        """Evict least recently used model if cache is full."""
        max_models = config.get_max_cached_models()
        if len(self.models) < max_models:
            return

        # Find LRU model
        lru_model = min(self.model_access_times.items(), key=lambda x: x[1])
        model_id = lru_model[0]

        logger.info(f"Evicting LRU model: {model_id}")

        # Cleanup
        if model_id in self.models:
            del self.models[model_id]
            del self.model_access_times[model_id]
            if model_id in self.loading_locks:
                del self.loading_locks[model_id]

        # Clear GPU cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

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
            # NVIDIA GPU: use device_map and fp16
            load_kwargs["torch_dtype"] = torch.float16
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

        Uses LRU caching and prevents duplicate loading with locks.

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

            # Evict LRU model if cache is full
            self._evict_lru_model()

            logger.info(f"Loading model: {model_id}")

            try:
                # Download from GCS (will return merged path if it exists)
                local_path = await self._download_from_gcs(model_id)

                # Load tokenizer
                tokenizer = AutoTokenizer.from_pretrained(
                    local_path, local_files_only=True, trust_remote_code=True
                )

                # Configure tokenizer
                self._configure_tokenizer(tokenizer, model_id)

                # Load model
                model = self._load_model_to_device(local_path)

                # Cache model
                self.models[model_id] = {
                    "model": model,
                    "tokenizer": tokenizer,
                    "device": config.DEVICE,
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
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
