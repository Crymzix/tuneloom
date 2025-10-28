"""
Configuration dataclasses for fine-tuning jobs.

This module contains all configuration classes used throughout the fine-tuning pipeline.
Each configuration class is immutable (frozen) and uses type hints for clarity.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class QuantizationConfig:
    """Configuration for model quantization."""

    use_4bit: bool = True
    use_8bit: bool = False

    def __post_init__(self):
        """Validate quantization settings."""
        if self.use_4bit and self.use_8bit:
            raise ValueError("Cannot use both 4-bit and 8-bit quantization")

    @property
    def is_enabled(self) -> bool:
        """Check if any quantization is enabled."""
        return self.use_4bit or self.use_8bit

    @property
    def quantization_type(self) -> Optional[str]:
        """Get the quantization type as a string."""
        if self.use_4bit:
            return "4-bit"
        elif self.use_8bit:
            return "8-bit"
        return None


@dataclass(frozen=True)
class LoRAConfig:
    """Configuration for LoRA (Low-Rank Adaptation) parameters."""

    r: int = 16
    alpha: int = 32
    dropout: float = 0.05
    target_modules: str = "all-linear"
    bias: str = "none"
    task_type: str = "CAUSAL_LM"
    modules_to_save: tuple[str, ...] = ("lm_head", "embed_tokens")

    def __post_init__(self):
        """Validate LoRA configuration."""
        if self.r <= 0:
            raise ValueError(f"LoRA rank must be positive, got {self.r}")
        if self.alpha <= 0:
            raise ValueError(f"LoRA alpha must be positive, got {self.alpha}")
        if not 0 <= self.dropout < 1:
            raise ValueError(f"LoRA dropout must be in [0, 1), got {self.dropout}")


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration for training parameters."""

    learning_rate: float = 5e-5
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 4
    gradient_accumulation_steps: int = 4
    max_seq_length: int = 256
    warmup_steps: int = 100
    logging_steps: int = 10
    save_steps: int = 100
    eval_steps: int = 100
    fp16: bool = False
    bf16: bool = True
    weight_decay: float = 0.01
    lr_scheduler_type: str = "constant"
    optim: str = "adamw_torch_fused"
    gradient_checkpointing: bool = False
    packing: bool = False
    logging_strategy: str = "epoch"
    eval_strategy: str = "epoch"
    save_strategy: str = "epoch"
    report_to: str = "none"

    def __post_init__(self):
        """Validate training configuration."""
        if self.learning_rate <= 0:
            raise ValueError(f"Learning rate must be positive, got {self.learning_rate}")
        if self.num_train_epochs <= 0:
            raise ValueError(f"Number of epochs must be positive, got {self.num_train_epochs}")
        if self.per_device_train_batch_size <= 0:
            raise ValueError(f"Batch size must be positive, got {self.per_device_train_batch_size}")
        if self.fp16 and self.bf16:
            raise ValueError("Cannot use both FP16 and BF16 precision")


@dataclass(frozen=True)
class JobConfig:
    """Configuration for the fine-tuning job."""

    base_model: str
    output_model_name: str
    training_data_path: str
    gcs_bucket: str
    job_id: Optional[str] = None
    gcs_base_model_path: Optional[str] = None
    gcs_output_path: Optional[str] = None
    local_cache_dir: str = "/tmp/finetune"
    cleanup_cache: bool = True

    def __post_init__(self):
        """Validate job configuration."""
        if not self.base_model:
            raise ValueError("base_model cannot be empty")
        if not self.output_model_name:
            raise ValueError("output_model_name cannot be empty")
        if not self.training_data_path:
            raise ValueError("training_data_path cannot be empty")
        if not self.gcs_bucket:
            raise ValueError("gcs_bucket cannot be empty")

    @property
    def effective_gcs_output_path(self) -> str:
        """Get the effective GCS output path."""
        return self.gcs_output_path or f"models/{self.output_model_name}"

    @property
    def gcs_model_id(self) -> str:
        """Convert base_model ID to GCS path format (slashes -> hyphens)."""
        return self.base_model.replace("/", "-")


@dataclass
class FineTuneJobConfig:
    """Complete configuration for a fine-tuning job.

    This is a convenience class that combines all configuration types.
    """

    job: JobConfig
    training: TrainingConfig = field(default_factory=TrainingConfig)
    lora: LoRAConfig = field(default_factory=LoRAConfig)
    quantization: QuantizationConfig = field(default_factory=QuantizationConfig)

    def to_dict(self) -> dict:
        """Convert configuration to a dictionary for serialization."""
        return {
            "base_model": self.job.base_model,
            "output_model_name": self.job.output_model_name,
            "lora_r": self.lora.r,
            "lora_alpha": self.lora.alpha,
            "lora_dropout": self.lora.dropout,
            "learning_rate": self.training.learning_rate,
            "num_train_epochs": self.training.num_train_epochs,
            "max_seq_length": self.training.max_seq_length,
            "quantization": self.quantization.quantization_type,
        }
