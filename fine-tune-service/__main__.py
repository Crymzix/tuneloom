"""
CLI entry point for the fine-tuning service.

This module provides command-line argument parsing and job execution.
It can be run as: python -m fine-tune-service
"""

import argparse
import sys

from .config import (
    JobConfig,
    TrainingConfig,
    LoRAConfig,
    QuantizationConfig,
    FineTuneJobConfig,
)
from .fine_tune_job import FineTuneJob


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Fine-tune LLM models on Cloud Run with LoRA/QLoRA",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # Required arguments
    required = parser.add_argument_group("required arguments")
    required.add_argument(
        "--base-model",
        type=str,
        required=True,
        help="HuggingFace model ID (e.g., google/gemma-2-2b). "
        "Will check GCS bucket at models/{id with / -> -} first, "
        "then fall back to HuggingFace Hub",
    )
    required.add_argument(
        "--output-model-name",
        type=str,
        required=True,
        help="Name for the fine-tuned model",
    )
    required.add_argument(
        "--training-data-path",
        type=str,
        required=True,
        help="GCS path to training data (JSONL format)",
    )
    required.add_argument(
        "--gcs-bucket",
        type=str,
        required=True,
        help="GCS bucket name",
    )
    required.add_argument(
        "--version-label",
        type=str,
        required=True,
        help="Version label for this fine-tune (e.g., v1, v2)",
    )

    # Job configuration
    job_group = parser.add_argument_group("job configuration")
    job_group.add_argument(
        "--job-id",
        type=str,
        default=None,
        help="Job ID for tracking status in Firestore",
    )
    job_group.add_argument(
        "--gcs-base-model-path",
        type=str,
        default=None,
        help="Explicit GCS path to base model (overrides auto-detection)",
    )
    job_group.add_argument(
        "--gcs-output-path",
        type=str,
        default=None,
        help="GCS output path (default: models/{output_model_name})",
    )
    job_group.add_argument(
        "--local-cache-dir",
        type=str,
        default="/tmp/finetune",
        help="Local cache directory",
    )
    job_group.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Do not cleanup cache after completion",
    )

    # Quantization
    quant_group = parser.add_argument_group("quantization")
    quant_group.add_argument(
        "--use-4bit",
        action="store_true",
        default=True,
        help="Use 4-bit quantization (QLoRA)",
    )
    quant_group.add_argument(
        "--use-8bit",
        action="store_true",
        default=False,
        help="Use 8-bit quantization",
    )
    quant_group.add_argument(
        "--no-quantization",
        action="store_true",
        help="Disable quantization",
    )

    # LoRA parameters
    lora_group = parser.add_argument_group("LoRA parameters")
    lora_group.add_argument(
        "--lora-r",
        type=int,
        default=16,
        help="LoRA rank",
    )
    lora_group.add_argument(
        "--lora-alpha",
        type=int,
        default=32,
        help="LoRA alpha",
    )
    lora_group.add_argument(
        "--lora-dropout",
        type=float,
        default=0.05,
        help="LoRA dropout rate",
    )

    # Training parameters
    train_group = parser.add_argument_group("training parameters")
    train_group.add_argument(
        "--learning-rate",
        type=float,
        default=5e-5,
        help="Learning rate",
    )
    train_group.add_argument(
        "--num-train-epochs",
        type=int,
        default=3,
        help="Number of training epochs",
    )
    train_group.add_argument(
        "--per-device-train-batch-size",
        type=int,
        default=4,
        help="Batch size per device",
    )
    train_group.add_argument(
        "--gradient-accumulation-steps",
        type=int,
        default=4,
        help="Gradient accumulation steps",
    )
    train_group.add_argument(
        "--max-seq-length",
        type=int,
        default=256,
        help="Maximum sequence length",
    )
    train_group.add_argument(
        "--warmup-steps",
        type=int,
        default=100,
        help="Warmup steps",
    )
    train_group.add_argument(
        "--logging-steps",
        type=int,
        default=10,
        help="Logging frequency",
    )
    train_group.add_argument(
        "--save-steps",
        type=int,
        default=100,
        help="Save checkpoint frequency",
    )
    train_group.add_argument(
        "--eval-steps",
        type=int,
        default=100,
        help="Evaluation frequency",
    )

    # Precision
    precision_group = parser.add_argument_group("precision")
    precision_group.add_argument(
        "--fp16",
        action="store_true",
        help="Use FP16 mixed precision",
    )
    precision_group.add_argument(
        "--bf16",
        action="store_true",
        default=True,
        help="Use BF16 mixed precision (default for L4)",
    )

    return parser.parse_args()


def create_config_from_args(args: argparse.Namespace) -> FineTuneJobConfig:
    """
    Create job configuration from parsed arguments.

    Args:
        args: Parsed command-line arguments

    Returns:
        Complete job configuration
    """
    # Job configuration
    job_config = JobConfig(
        base_model=args.base_model,
        output_model_name=args.output_model_name,
        training_data_path=args.training_data_path,
        gcs_bucket=args.gcs_bucket,
        version_label=args.version_label,
        job_id=args.job_id,
        gcs_base_model_path=args.gcs_base_model_path,
        gcs_output_path=args.gcs_output_path,
        local_cache_dir=args.local_cache_dir,
        cleanup_cache=not args.no_cleanup,
    )

    # Quantization configuration
    use_4bit = args.use_4bit and not args.no_quantization
    use_8bit = args.use_8bit and not args.no_quantization
    quantization_config = QuantizationConfig(
        use_4bit=use_4bit,
        use_8bit=use_8bit,
    )

    # LoRA configuration
    lora_config = LoRAConfig(
        r=args.lora_r,
        alpha=args.lora_alpha,
        dropout=args.lora_dropout,
    )

    # Training configuration
    training_config = TrainingConfig(
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        max_seq_length=args.max_seq_length,
        warmup_steps=args.warmup_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
        fp16=args.fp16,
        bf16=args.bf16,
    )

    return FineTuneJobConfig(
        job=job_config,
        training=training_config,
        lora=lora_config,
        quantization=quantization_config,
    )


def main() -> int:
    """
    Main entry point for the CLI.

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    try:
        # Parse arguments
        args = parse_args()

        # Create configuration
        config = create_config_from_args(args)

        # Create and run job
        job = FineTuneJob(config)
        job.run()

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
