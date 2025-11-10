"""
Model manager for loading base models and configuring LoRA.

This module handles model loading from GCS or HuggingFace Hub,
tokenizer configuration, and LoRA setup.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from peft import LoraConfig

from .config import LoRAConfig, QuantizationConfig
from .storage import GCSStorageManager

logger = logging.getLogger(__name__)


class ModelManager:
    """Manager for model loading and LoRA configuration."""

    def __init__(
        self,
        storage_manager: GCSStorageManager,
        local_model_dir: Path,
        quantization_config: QuantizationConfig,
        lora_config: LoRAConfig,
    ):
        """
        Initialize model manager.

        Args:
            storage_manager: GCS storage manager instance
            local_model_dir: Local directory for caching models
            quantization_config: Quantization configuration
            lora_config: LoRA configuration
        """
        self.storage = storage_manager
        self.local_model_dir = local_model_dir
        self.quantization_config = quantization_config
        self.lora_config = lora_config

        self.local_model_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized model manager with cache dir: {local_model_dir}")

    def load_model(
        self,
        base_model: str,
        gcs_base_model_path: Optional[str] = None,
    ) -> Tuple[AutoModelForCausalLM, AutoTokenizer]:
        """
        Load base model and tokenizer from GCS or HuggingFace Hub.

        Args:
            base_model: HuggingFace model ID (e.g., "google/gemma-2-2b")
            gcs_base_model_path: Optional explicit GCS path to base model

        Returns:
            Tuple of (model, tokenizer)
        """
        logger.info("Loading base model...")
        logger.info(f"Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")

        model_name_or_path = self._get_model_path(base_model, gcs_base_model_path)
        tokenizer = self._load_tokenizer(model_name_or_path)
        model = self._load_model(model_name_or_path, tokenizer)

        logger.info("Base model loaded successfully")
        return model, tokenizer

    def _get_model_path(
        self, base_model: str, gcs_base_model_path: Optional[str] = None
    ) -> str:
        """
        Determine the model path (local or HuggingFace Hub).

        Args:
            base_model: HuggingFace model ID
            gcs_base_model_path: Optional explicit GCS path

        Returns:
            Path to the model (local directory or HuggingFace ID)
        """
        # If explicit GCS path provided, use it
        if gcs_base_model_path:
            logger.info(f"Using explicit GCS path: {gcs_base_model_path}")
            model_path = self.storage.download_directory(
                gcs_base_model_path, self.local_model_dir
            )
            return str(model_path)

        # Otherwise, check if model exists in GCS bucket
        model_id_gcs = base_model.replace("/", "-")
        gcs_model_path = f"models/{model_id_gcs}"

        logger.info(f"Checking for model in GCS at: {self.storage.get_gcs_uri(gcs_model_path)}")

        if self.storage.blob_exists(gcs_model_path):
            logger.info(f"Found base model in GCS, downloading...")
            model_path = self.storage.download_directory(
                gcs_model_path, self.local_model_dir
            )
            return str(model_path)

        # Model not in GCS, use HuggingFace Hub
        logger.info(f"Model not found in GCS, will use HuggingFace Hub: {base_model}")
        return base_model

    def _load_tokenizer(self, model_name_or_path: str) -> AutoTokenizer:
        """
        Load and configure tokenizer.

        Args:
            model_name_or_path: Path to model or HuggingFace ID

        Returns:
            Configured tokenizer
        """
        logger.info(f"Loading tokenizer from {model_name_or_path}")
        tokenizer = AutoTokenizer.from_pretrained(
            model_name_or_path,
            trust_remote_code=True,
            use_fast=True,
        )

        # Handle processor objects (e.g., Gemma3Processor for instruction-tuned models)
        # Processors wrap tokenizers and add chat templates/special formatting
        if hasattr(tokenizer, 'tokenizer'):
            logger.info(f"Detected processor object ({type(tokenizer).__name__}), extracting tokenizer")
            tokenizer = tokenizer.tokenizer

        # Set pad token if not present
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            tokenizer.pad_token_id = tokenizer.eos_token_id
            logger.info("Set pad_token to eos_token")

        # Set padding side for causal LM
        tokenizer.padding_side = "right"

        return tokenizer

    def _load_model(
        self, model_name_or_path: str, tokenizer: AutoTokenizer
    ) -> AutoModelForCausalLM:
        """
        Load and configure model with quantization.

        Args:
            model_name_or_path: Path to model or HuggingFace ID
            tokenizer: Configured tokenizer

        Returns:
            Loaded model
        """
        quantization_config = self._get_quantization_config()

        logger.info(f"Loading model from {model_name_or_path}")
        if quantization_config:
            logger.info(f"Using {self.quantization_config.quantization_type} quantization")

        model = AutoModelForCausalLM.from_pretrained(
            model_name_or_path,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True,
            attn_implementation="eager",
        )

        # Set pad_token_id on model config
        model.config.pad_token_id = tokenizer.pad_token_id

        return model

    def _get_quantization_config(self) -> Optional[BitsAndBytesConfig]:
        """
        Create quantization configuration based on settings.

        Returns:
            BitsAndBytesConfig or None if quantization is disabled
        """
        if not self.quantization_config.is_enabled:
            return None

        if self.quantization_config.use_4bit:
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
        elif self.quantization_config.use_8bit:
            return BitsAndBytesConfig(
                load_in_8bit=True,
            )

        return None

    def create_lora_config(self) -> LoraConfig:
        """
        Create LoRA configuration for PEFT.

        Returns:
            LoraConfig instance
        """
        logger.info("Setting up LoRA configuration...")

        config = LoraConfig(
            r=self.lora_config.r,
            lora_alpha=self.lora_config.alpha,
            target_modules=self.lora_config.target_modules,
            lora_dropout=self.lora_config.dropout,
            bias=self.lora_config.bias,
            task_type=self.lora_config.task_type,
            modules_to_save=list(self.lora_config.modules_to_save),
        )

        logger.info(
            f"LoRA config: r={self.lora_config.r}, "
            f"alpha={self.lora_config.alpha}, "
            f"dropout={self.lora_config.dropout}, "
            f"target_modules='{self.lora_config.target_modules}'"
        )

        return config
