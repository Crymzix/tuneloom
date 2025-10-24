"""
Fine-tuning Job for LLM Models on Cloud Run with L4 GPU
Loads base model and training data from GCS, fine-tunes with LoRA/QLoRA, and saves back to GCS
"""

import os
import json
import logging
import argparse
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    PeftModel,
)
from datasets import load_dataset, Dataset
from google.cloud import storage
import wandb

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FineTuneJob:
    """Fine-tuning job for Gemma models with GCS integration"""

    def __init__(
        self,
        base_model: str,
        output_model_name: str,
        training_data_path: str,
        gcs_bucket: str,
        gcs_base_model_path: Optional[str] = None,
        gcs_output_path: Optional[str] = None,
        local_cache_dir: str = "/tmp/finetune",
        use_4bit: bool = True,
        use_8bit: bool = False,
        lora_r: int = 16,
        lora_alpha: int = 32,
        lora_dropout: float = 0.05,
        learning_rate: float = 2e-4,
        num_train_epochs: int = 3,
        per_device_train_batch_size: int = 4,
        gradient_accumulation_steps: int = 4,
        max_seq_length: int = 512,
        warmup_steps: int = 100,
        logging_steps: int = 10,
        save_steps: int = 100,
        eval_steps: int = 100,
        fp16: bool = False,
        bf16: bool = True,
        use_wandb: bool = False,
        wandb_project: Optional[str] = None,
        wandb_run_name: Optional[str] = None,
    ):
        """
        Initialize fine-tuning job

        Args:
            base_model: HuggingFace model ID (e.g., google/gemma-3-270m)
                       Will first check GCS bucket at models/{model_id with / -> -}
                       Falls back to HuggingFace Hub if not found in GCS
            output_model_name: Name for the fine-tuned model
            training_data_path: GCS path to training data (jsonl format)
            gcs_bucket: GCS bucket name
            gcs_base_model_path: Optional explicit GCS path to base model (overrides auto-detection)
            gcs_output_path: GCS path prefix for output (default: models/{output_model_name})
            local_cache_dir: Local directory for caching models and data
            use_4bit: Use 4-bit quantization (QLoRA)
            use_8bit: Use 8-bit quantization (LoRA with 8-bit)
            lora_r: LoRA rank
            lora_alpha: LoRA alpha parameter
            lora_dropout: LoRA dropout rate
            learning_rate: Learning rate for training
            num_train_epochs: Number of training epochs
            per_device_train_batch_size: Batch size per device
            gradient_accumulation_steps: Gradient accumulation steps
            max_seq_length: Maximum sequence length
            warmup_steps: Number of warmup steps
            logging_steps: Log every N steps
            save_steps: Save checkpoint every N steps
            eval_steps: Evaluate every N steps
            fp16: Use FP16 mixed precision
            bf16: Use BF16 mixed precision
            use_wandb: Enable Weights & Biases logging
            wandb_project: W&B project name
            wandb_run_name: W&B run name
        """
        self.base_model = base_model
        self.output_model_name = output_model_name
        self.training_data_path = training_data_path
        self.gcs_bucket = gcs_bucket
        self.gcs_base_model_path = gcs_base_model_path
        self.gcs_output_path = gcs_output_path or f"models/{output_model_name}"

        # Local paths
        self.local_cache_dir = Path(local_cache_dir)
        self.local_base_model_dir = self.local_cache_dir / "base_model"
        self.local_data_dir = self.local_cache_dir / "data"
        self.local_output_dir = self.local_cache_dir / "output"

        # Create directories
        for directory in [self.local_base_model_dir, self.local_data_dir, self.local_output_dir]:
            directory.mkdir(parents=True, exist_ok=True)

        # Quantization config
        self.use_4bit = use_4bit
        self.use_8bit = use_8bit

        # LoRA config
        self.lora_r = lora_r
        self.lora_alpha = lora_alpha
        self.lora_dropout = lora_dropout

        # Training config
        self.learning_rate = learning_rate
        self.num_train_epochs = num_train_epochs
        self.per_device_train_batch_size = per_device_train_batch_size
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.max_seq_length = max_seq_length
        self.warmup_steps = warmup_steps
        self.logging_steps = logging_steps
        self.save_steps = save_steps
        self.eval_steps = eval_steps
        self.fp16 = fp16
        self.bf16 = bf16

        # W&B config
        self.use_wandb = use_wandb
        self.wandb_project = wandb_project
        self.wandb_run_name = wandb_run_name

        # Initialize GCS client
        self.gcs_client = storage.Client()
        self.bucket = self.gcs_client.bucket(self.gcs_bucket)

        logger.info(f"Initialized FineTuneJob for {output_model_name}")
        logger.info(f"Base model: {base_model}")
        logger.info(f"Training data: gs://{gcs_bucket}/{training_data_path}")
        logger.info(f"Output path: gs://{gcs_bucket}/{self.gcs_output_path}")
        logger.info(f"Quantization: {'4-bit' if use_4bit else '8-bit' if use_8bit else 'None'}")
        logger.info(f"Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")

    def download_from_gcs(self, gcs_path: str, local_path: Path) -> Path:
        """Download files from GCS to local directory"""
        logger.info(f"Downloading from gs://{self.gcs_bucket}/{gcs_path} to {local_path}")

        # List all blobs with the prefix
        blobs = list(self.bucket.list_blobs(prefix=gcs_path))

        if not blobs:
            raise FileNotFoundError(f"No files found at gs://{self.gcs_bucket}/{gcs_path}")

        local_path.mkdir(parents=True, exist_ok=True)

        for blob in blobs:
            # Get relative path within the prefix
            relative_path = blob.name[len(gcs_path):].lstrip('/')
            if not relative_path:
                continue

            local_file_path = local_path / relative_path
            local_file_path.parent.mkdir(parents=True, exist_ok=True)

            blob.download_to_filename(str(local_file_path))
            logger.debug(f"Downloaded {blob.name}")

        logger.info(f"Download complete: {len(blobs)} files")
        return local_path

    def upload_to_gcs(self, local_path: Path, gcs_path: str):
        """Upload directory to GCS"""
        logger.info(f"Uploading {local_path} to gs://{self.gcs_bucket}/{gcs_path}")

        # Get all files in directory
        files = list(local_path.rglob("*"))
        files = [f for f in files if f.is_file()]

        for file_path in files:
            # Get relative path from local_path
            relative_path = file_path.relative_to(local_path)
            gcs_file_path = f"{gcs_path}/{relative_path}".replace("\\", "/")

            blob = self.bucket.blob(gcs_file_path)
            blob.upload_from_filename(str(file_path))
            logger.debug(f"Uploaded {gcs_file_path}")

        logger.info(f"Upload complete: {len(files)} files to gs://{self.gcs_bucket}/{gcs_path}")

    def load_base_model(self) -> tuple[AutoModelForCausalLM, AutoTokenizer]:
        """Load base model from GCS or HuggingFace Hub"""
        logger.info("Loading base model...")

        # Download from GCS if path provided, or construct path from base_model ID
        if self.gcs_base_model_path:
            # Explicitly provided GCS path
            model_path = self.download_from_gcs(
                self.gcs_base_model_path,
                self.local_base_model_dir
            )
            model_name_or_path = str(model_path)
        else:
            # Convert base_model ID to GCS path format (slashes -> hyphens)
            # e.g., "google/gemma-3-270m" -> "google-gemma-3-270m"
            model_id_gcs = self.base_model.replace("/", "-")
            gcs_model_path = f"models/{model_id_gcs}"

            # Check if model exists in GCS bucket
            logger.info(f"Checking for base model in GCS at: gs://{self.gcs_bucket}/{gcs_model_path}")
            blobs = list(self.bucket.list_blobs(prefix=gcs_model_path, max_results=1))

            if blobs:
                # Model exists in GCS, download it
                logger.info(f"Found base model in GCS bucket, downloading from gs://{self.gcs_bucket}/{gcs_model_path}")
                model_path = self.download_from_gcs(
                    gcs_model_path,
                    self.local_base_model_dir
                )
                model_name_or_path = str(model_path)
            else:
                # Model not in GCS, use HuggingFace Hub
                logger.info(f"Base model not found in GCS, will download from HuggingFace Hub: {self.base_model}")
                model_name_or_path = self.base_model

        # Load tokenizer
        logger.info(f"Loading tokenizer from {model_name_or_path}")
        tokenizer = AutoTokenizer.from_pretrained(
            model_name_or_path,
            trust_remote_code=True,
            use_fast=True,
        )

        # Set pad token if not present
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
            logger.info("Set pad_token to eos_token")

        # Configure quantization
        quantization_config = None
        if self.use_4bit:
            logger.info("Using 4-bit quantization (QLoRA)")
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16 if self.bf16 else torch.float16,
                bnb_4bit_use_double_quant=True,  # Nested quantization for more memory savings
            )
        elif self.use_8bit:
            logger.info("Using 8-bit quantization")
            quantization_config = BitsAndBytesConfig(
                load_in_8bit=True,
            )

        # Load model
        logger.info(f"Loading model from {model_name_or_path}")
        model = AutoModelForCausalLM.from_pretrained(
            model_name_or_path,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if self.bf16 else torch.float16,
            use_cache=False,  # Disable cache for training
        )

        # Prepare model for k-bit training if using quantization
        if self.use_4bit or self.use_8bit:
            logger.info("Preparing model for k-bit training...")
            model = prepare_model_for_kbit_training(model)

        logger.info("Base model loaded successfully")
        return model, tokenizer

    def setup_lora(self, model: AutoModelForCausalLM) -> PeftModel:
        """Setup LoRA configuration and wrap model"""
        logger.info("Setting up LoRA...")

        # LoRA config optimized for Gemma
        lora_config = LoraConfig(
            r=self.lora_r,
            lora_alpha=self.lora_alpha,
            lora_dropout=self.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=[
                "q_proj",
                "k_proj",
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
            ],
            # Save embeddings and lm_head for better adaptation
            modules_to_save=["embed_tokens", "lm_head"],
        )

        logger.info(f"LoRA config: r={self.lora_r}, alpha={self.lora_alpha}, dropout={self.lora_dropout}")

        # Wrap model with PEFT
        model = get_peft_model(model, lora_config)

        # Print trainable parameters
        trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
        total_params = sum(p.numel() for p in model.parameters())
        trainable_pct = 100 * trainable_params / total_params

        logger.info(f"Trainable parameters: {trainable_params:,} ({trainable_pct:.2f}%)")
        logger.info(f"Total parameters: {total_params:,}")

        return model

    def load_training_data(self, tokenizer: AutoTokenizer) -> Dataset:
        """Load and prepare training data from GCS"""
        logger.info("Loading training data...")

        # Download training data
        local_data_file = self.local_data_dir / "training_data.jsonl"

        blob = self.bucket.blob(self.training_data_path)
        blob.download_to_filename(str(local_data_file))
        logger.info(f"Downloaded training data: {local_data_file}")

        # Load dataset
        dataset = load_dataset('json', data_files=str(local_data_file), split='train')
        logger.info(f"Loaded {len(dataset)} training examples")

        # Tokenize dataset
        def tokenize_function(examples):
            """Tokenize examples for causal language modeling"""
            # Handle different formats
            if "text" in examples:
                texts = examples["text"]
            elif "messages" in examples:
                # Convert chat messages to text
                texts = []
                for messages in examples["messages"]:
                    if isinstance(messages, str):
                        messages = json.loads(messages)

                    # Apply chat template
                    text = tokenizer.apply_chat_template(
                        messages,
                        tokenize=False,
                        add_generation_prompt=False
                    )
                    texts.append(text)
            elif "instruction" in examples:
                # Instruction-following format
                texts = []
                for i in range(len(examples["instruction"])):
                    instruction = examples["instruction"][i]
                    output = examples.get("output", [""])[i]
                    text = f"Instruction: {instruction}\n\nResponse: {output}"
                    texts.append(text)
            else:
                raise ValueError("Dataset must have 'text', 'messages', or 'instruction' field")

            # Tokenize
            result = tokenizer(
                texts,
                truncation=True,
                max_length=self.max_seq_length,
                padding=False,  # Don't pad here, let data collator handle it
            )

            # For causal LM, labels are the same as input_ids
            result["labels"] = result["input_ids"].copy()

            return result

        logger.info("Tokenizing dataset...")
        tokenized_dataset = dataset.map(
            tokenize_function,
            batched=True,
            remove_columns=dataset.column_names,
            desc="Tokenizing"
        )

        logger.info(f"Tokenized {len(tokenized_dataset)} examples")
        return tokenized_dataset

    def train(self, model: PeftModel, tokenizer: AutoTokenizer, train_dataset: Dataset):
        """Train the model"""
        logger.info("Setting up training...")

        # Initialize W&B if enabled
        if self.use_wandb:
            wandb.init(
                project=self.wandb_project or "gemma-finetune",
                name=self.wandb_run_name or self.output_model_name,
                config={
                    "base_model": self.base_model,
                    "lora_r": self.lora_r,
                    "lora_alpha": self.lora_alpha,
                    "learning_rate": self.learning_rate,
                    "epochs": self.num_train_epochs,
                    "batch_size": self.per_device_train_batch_size,
                    "gradient_accumulation_steps": self.gradient_accumulation_steps,
                }
            )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=str(self.local_output_dir),
            num_train_epochs=self.num_train_epochs,
            per_device_train_batch_size=self.per_device_train_batch_size,
            gradient_accumulation_steps=self.gradient_accumulation_steps,
            learning_rate=self.learning_rate,
            warmup_steps=self.warmup_steps,
            logging_steps=self.logging_steps,
            save_steps=self.save_steps,
            save_total_limit=2,  # Keep only 2 checkpoints to save space
            fp16=self.fp16,
            bf16=self.bf16,
            optim="paged_adamw_8bit" if (self.use_4bit or self.use_8bit) else "adamw_torch",
            lr_scheduler_type="cosine",
            max_grad_norm=1.0,
            report_to="wandb" if self.use_wandb else "none",
            logging_first_step=True,
            load_best_model_at_end=False,
            ddp_find_unused_parameters=False,
            group_by_length=True,  # Group sequences of similar length for efficiency
            dataloader_num_workers=4,
            remove_unused_columns=False,
        )

        # Data collator for language modeling
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=tokenizer,
            mlm=False,  # Causal LM, not masked LM
        )

        # Initialize trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            data_collator=data_collator,
        )

        # Train
        logger.info("Starting training...")
        logger.info(f"Training for {self.num_train_epochs} epochs")
        logger.info(f"Total steps: {len(train_dataset) // (self.per_device_train_batch_size * self.gradient_accumulation_steps) * self.num_train_epochs}")

        trainer.train()

        logger.info("Training complete!")

        # Finish W&B run
        if self.use_wandb:
            wandb.finish()

        return trainer

    def save_model(self, model: PeftModel, tokenizer: AutoTokenizer):
        """Save fine-tuned model and upload to GCS"""
        logger.info("Saving model...")

        # Save model locally
        model.save_pretrained(str(self.local_output_dir / "adapter"))
        tokenizer.save_pretrained(str(self.local_output_dir / "adapter"))

        logger.info(f"Model saved locally to {self.local_output_dir / 'adapter'}")

        # Optionally merge adapters with base model for deployment
        logger.info("Merging LoRA adapters with base model...")
        merged_model = model.merge_and_unload()

        merged_dir = self.local_output_dir / "merged"
        merged_model.save_pretrained(str(merged_dir))
        tokenizer.save_pretrained(str(merged_dir))

        logger.info(f"Merged model saved to {merged_dir}")

        # Upload to GCS
        logger.info("Uploading adapter model to GCS...")
        self.upload_to_gcs(
            self.local_output_dir / "adapter",
            f"{self.gcs_output_path}/adapter"
        )

        logger.info("Uploading merged model to GCS...")
        self.upload_to_gcs(
            merged_dir,
            f"{self.gcs_output_path}/merged"
        )

        logger.info(f"Model uploaded to gs://{self.gcs_bucket}/{self.gcs_output_path}")

        # Save training config
        config = {
            "base_model": self.base_model,
            "output_model_name": self.output_model_name,
            "lora_r": self.lora_r,
            "lora_alpha": self.lora_alpha,
            "lora_dropout": self.lora_dropout,
            "learning_rate": self.learning_rate,
            "num_train_epochs": self.num_train_epochs,
            "max_seq_length": self.max_seq_length,
        }

        config_file = self.local_output_dir / "training_config.json"
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)

        blob = self.bucket.blob(f"{self.gcs_output_path}/training_config.json")
        blob.upload_from_filename(str(config_file))

        logger.info("Training config saved")

    def run(self):
        """Execute the complete fine-tuning pipeline"""
        try:
            logger.info("=" * 80)
            logger.info("Starting Fine-Tuning Job")
            logger.info("=" * 80)

            # Load base model
            model, tokenizer = self.load_base_model()

            # Setup LoRA
            model = self.setup_lora(model)

            # Load training data
            train_dataset = self.load_training_data(tokenizer)

            # Train
            self.train(model, tokenizer, train_dataset)

            # Save model
            self.save_model(model, tokenizer)

            logger.info("=" * 80)
            logger.info("Fine-Tuning Job Complete!")
            logger.info(f"Output: gs://{self.gcs_bucket}/{self.gcs_output_path}")
            logger.info("=" * 80)

        except Exception as e:
            logger.error(f"Fine-tuning job failed: {e}", exc_info=True)
            raise
        finally:
            # Cleanup local cache to free disk space
            if os.getenv("CLEANUP_CACHE", "true").lower() == "true":
                logger.info("Cleaning up local cache...")
                shutil.rmtree(self.local_cache_dir, ignore_errors=True)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Fine-tune Gemma models on Cloud Run")

    # Required arguments
    parser.add_argument("--base-model", type=str, required=True,
                       help="HuggingFace model ID (e.g., google/gemma-2-2b). "
                            "Will check GCS bucket at models/{id with / -> -} first, "
                            "then fall back to HuggingFace Hub")
    parser.add_argument("--output-model-name", type=str, required=True,
                       help="Name for the fine-tuned model")
    parser.add_argument("--training-data-path", type=str, required=True,
                       help="GCS path to training data (JSONL format)")
    parser.add_argument("--gcs-bucket", type=str, required=True,
                       help="GCS bucket name")

    # Optional arguments
    parser.add_argument("--gcs-base-model-path", type=str, default=None,
                       help="Explicit GCS path to base model (overrides auto-detection from --base-model)")
    parser.add_argument("--gcs-output-path", type=str, default=None,
                       help="GCS output path (default: models/{output_model_name})")
    parser.add_argument("--local-cache-dir", type=str, default="/tmp/finetune",
                       help="Local cache directory")

    # Quantization
    parser.add_argument("--use-4bit", action="store_true", default=True,
                       help="Use 4-bit quantization (QLoRA)")
    parser.add_argument("--use-8bit", action="store_true", default=False,
                       help="Use 8-bit quantization")
    parser.add_argument("--no-quantization", action="store_true",
                       help="Disable quantization")

    # LoRA parameters
    parser.add_argument("--lora-r", type=int, default=16,
                       help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=32,
                       help="LoRA alpha")
    parser.add_argument("--lora-dropout", type=float, default=0.05,
                       help="LoRA dropout")

    # Training parameters
    parser.add_argument("--learning-rate", type=float, default=2e-4,
                       help="Learning rate")
    parser.add_argument("--num-train-epochs", type=int, default=3,
                       help="Number of training epochs")
    parser.add_argument("--per-device-train-batch-size", type=int, default=4,
                       help="Batch size per device")
    parser.add_argument("--gradient-accumulation-steps", type=int, default=4,
                       help="Gradient accumulation steps")
    parser.add_argument("--max-seq-length", type=int, default=512,
                       help="Maximum sequence length")
    parser.add_argument("--warmup-steps", type=int, default=100,
                       help="Warmup steps")
    parser.add_argument("--logging-steps", type=int, default=10,
                       help="Logging frequency")
    parser.add_argument("--save-steps", type=int, default=100,
                       help="Save checkpoint frequency")

    # Precision
    parser.add_argument("--fp16", action="store_true",
                       help="Use FP16 mixed precision")
    parser.add_argument("--bf16", action="store_true", default=True,
                       help="Use BF16 mixed precision (default for L4)")

    # Weights & Biases
    parser.add_argument("--use-wandb", action="store_true",
                       help="Enable W&B logging")
    parser.add_argument("--wandb-project", type=str, default=None,
                       help="W&B project name")
    parser.add_argument("--wandb-run-name", type=str, default=None,
                       help="W&B run name")

    args = parser.parse_args()

    # Handle quantization flags
    use_4bit = args.use_4bit and not args.no_quantization
    use_8bit = args.use_8bit and not args.no_quantization

    # Create and run job
    job = FineTuneJob(
        base_model=args.base_model,
        output_model_name=args.output_model_name,
        training_data_path=args.training_data_path,
        gcs_bucket=args.gcs_bucket,
        gcs_base_model_path=args.gcs_base_model_path,
        gcs_output_path=args.gcs_output_path,
        local_cache_dir=args.local_cache_dir,
        use_4bit=use_4bit,
        use_8bit=use_8bit,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        max_seq_length=args.max_seq_length,
        warmup_steps=args.warmup_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        fp16=args.fp16,
        bf16=args.bf16,
        use_wandb=args.use_wandb,
        wandb_project=args.wandb_project,
        wandb_run_name=args.wandb_run_name,
    )

    job.run()


if __name__ == "__main__":
    main()
