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
)
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer
from datasets import load_dataset, Dataset
from google.cloud import storage
import firebase_admin
from firebase_admin import firestore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FineTuneJob:
    """Fine-tuning job for models with GCS integration"""

    def __init__(
        self,
        base_model: str,
        output_model_name: str,
        training_data_path: str,
        gcs_bucket: str,
        job_id: Optional[str] = None,
        gcs_base_model_path: Optional[str] = None,
        gcs_output_path: Optional[str] = None,
        local_cache_dir: str = "/tmp/finetune",
        use_4bit: bool = True,
        use_8bit: bool = False,
        lora_r: int = 16,
        lora_alpha: int = 32,
        lora_dropout: float = 0.05,
        learning_rate: float = 5e-5,
        num_train_epochs: int = 3,
        per_device_train_batch_size: int = 4,
        gradient_accumulation_steps: int = 4,
        max_seq_length: int = 256,
        warmup_steps: int = 100,
        logging_steps: int = 10,
        save_steps: int = 100,
        eval_steps: int = 100,
        fp16: bool = False,
        bf16: bool = True,
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
            job_id: Optional job ID for tracking status in Firestore
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
        """
        self.base_model = base_model
        self.output_model_name = output_model_name
        self.training_data_path = training_data_path
        self.gcs_bucket = gcs_bucket
        self.job_id = job_id
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

        # Initialize GCS client
        self.gcs_client = storage.Client()
        self.bucket = self.gcs_client.bucket(self.gcs_bucket)

        # Initialize Firebase Admin SDK
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        self.firestore_db = firestore.client()

        logger.info(f"Initialized FineTuneJob for {output_model_name}")
        if self.job_id:
            logger.info(f"Job ID: {job_id}")
        logger.info(f"Base model: {base_model}")
        logger.info(f"Training data: gs://{gcs_bucket}/{training_data_path}")
        logger.info(f"Output path: gs://{gcs_bucket}/{self.gcs_output_path}")
        logger.info(f"Quantization: {'4-bit' if use_4bit else '8-bit' if use_8bit else 'None'}")
        logger.info(f"Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")

    def update_job_status(
        self,
        status: str,
        message: Optional[str] = None,
        progress: Optional[float] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Update job status in Firestore"""
        if not self.job_id:
            return

        try:
            job_ref = self.firestore_db.collection('fine-tune-jobs').document(self.job_id)
            update_data = {
                'status': status,
                'updated_at': firestore.SERVER_TIMESTAMP,
            }

            if message:
                update_data['message'] = message
            if progress is not None:
                update_data['progress'] = progress
            if error:
                update_data['error'] = error
            if metadata:
                update_data['metadata'] = metadata

            job_ref.update(update_data)
            logger.info(f"Updated job status: {status}" + (f" - {message}" if message else ""))
        except Exception as e:
            logger.warning(f"Failed to update job status in Firestore: {e}")

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
            tokenizer.pad_token_id = tokenizer.eos_token_id
            logger.info("Set pad_token to eos_token")

        # Set padding side for causal LM (pad on the right)
        tokenizer.padding_side = "right"

        # Configure quantization
        quantization_config = None
        if self.use_4bit:
            logger.info("Using 4-bit quantization (QLoRA)")
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
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
            attn_implementation='eager',
        )

        # Set pad_token_id on model config
        model.config.pad_token_id = tokenizer.pad_token_id

        logger.info("Base model loaded successfully")
        return model, tokenizer

    def setup_lora(self) -> LoraConfig:
        """Setup LoRA configuration"""
        logger.info("Setting up LoRA configuration...")

        # LoRA config
        lora_config = LoraConfig(
            r=self.lora_r,
            lora_alpha=self.lora_alpha,
            target_modules="all-linear",  # Target all linear layers
            lora_dropout=self.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM",
            modules_to_save=["lm_head", "embed_tokens"],  # Save the lm_head and embed_tokens as you train the special tokens
        )

        logger.info(f"LoRA config: r={self.lora_r}, alpha={self.lora_alpha}, dropout={self.lora_dropout}, target_modules='all-linear'")

        return lora_config

    def load_training_data(self, tokenizer: AutoTokenizer) -> Dict[str, Dataset]:
        """Load and prepare training data from GCS with train/test split"""
        logger.info("Loading training data...")

        # Download training data
        local_data_file = self.local_data_dir / "training_data.jsonl"

        blob = self.bucket.blob(self.training_data_path)
        blob.download_to_filename(str(local_data_file))
        logger.info(f"Downloaded training data: {local_data_file}")

        # Load dataset
        dataset = load_dataset('json', data_files=str(local_data_file), split='train')
        logger.info(f"Loaded {len(dataset)} training examples")

        # Process dataset to extract text from different formats
        def format_text(examples):
            """Format examples to text field for SFTTrainer"""
            texts = []

            # Handle different formats
            if "text" in examples:
                texts = examples["text"]
            elif "messages" in examples:
                # Convert chat messages to text
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
                for i in range(len(examples["instruction"])):
                    instruction = examples["instruction"][i]
                    output = examples.get("output", [""])[i]
                    text = f"Instruction: {instruction}\n\nResponse: {output}"
                    texts.append(text)
            elif "input" in examples and "output" in examples:
                # Input-output format
                for i in range(len(examples["input"])):
                    input_text = examples["input"][i]
                    output_text = examples["output"][i]
                    text = f"{input_text}\n{output_text}"
                    texts.append(text)
            else:
                raise ValueError("Dataset must have 'text', 'messages', 'instruction', or 'input'/'output' fields")

            return {"text": texts}

        logger.info("Formatting dataset...")
        formatted_dataset = dataset.map(
            format_text,
            batched=True,
            remove_columns=dataset.column_names,
            desc="Formatting"
        )

        # Split dataset into train and test (90/10 split)
        logger.info("Splitting dataset into train and test sets...")
        dataset_splits = formatted_dataset.train_test_split(test_size=0.1, seed=42)

        logger.info(f"Train examples: {len(dataset_splits['train'])}")
        logger.info(f"Test examples: {len(dataset_splits['test'])}")

        return dataset_splits

    def train(
        self,
        model: AutoModelForCausalLM,
        train_dataset: Dataset,
        eval_dataset: Dataset,
        lora_config: LoraConfig
    ):
        """Train the model with SFTTrainer"""
        logger.info("Setting up training...")

        # SFT Training arguments (following cookbook approach)
        training_args = SFTConfig(
            output_dir=str(self.local_output_dir),
            num_train_epochs=self.num_train_epochs,
            per_device_train_batch_size=self.per_device_train_batch_size,
            logging_strategy="epoch",
            eval_strategy="epoch",
            save_strategy="epoch",
            learning_rate=self.learning_rate,
            lr_scheduler_type="constant",
            max_length=self.max_seq_length,
            gradient_checkpointing=False,
            packing=False,
            optim="adamw_torch_fused",
            report_to="none",
            weight_decay=0.01,
        )

        # Initialize SFT trainer
        trainer = SFTTrainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            peft_config=lora_config,
        )

        # Train
        logger.info("Starting training...")
        logger.info(f"Training for {self.num_train_epochs} epochs")
        logger.info(f"Total training examples: {len(train_dataset)}")
        logger.info(f"Total evaluation examples: {len(eval_dataset)}")

        trainer.train()

        logger.info("Training complete!")

        return trainer

    def save_model(self, trainer: SFTTrainer, tokenizer: AutoTokenizer):
        """Save fine-tuned model and upload to GCS"""
        logger.info("Saving model...")

        # Save adapter model locally (trainer saves to output_dir by default)
        adapter_dir = self.local_output_dir / "adapter"
        trainer.save_model(str(adapter_dir))
        tokenizer.save_pretrained(str(adapter_dir))

        logger.info(f"LoRA adapters saved locally to {adapter_dir}")

        # Merge adapters with base model for deployment
        logger.info("Merging LoRA adapters with base model...")
        model = trainer.model.merge_and_unload()

        merged_dir = self.local_output_dir / "merged"
        model.save_pretrained(str(merged_dir))
        tokenizer.save_pretrained(str(merged_dir))

        logger.info(f"Merged model saved to {merged_dir}")

        # Upload to GCS
        logger.info("Uploading adapter model to GCS...")
        self.upload_to_gcs(
            adapter_dir,
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

            # Update status: starting
            self.update_job_status("running", "Initializing fine-tuning job", progress=0.0)

            # Load base model
            self.update_job_status("running", "Loading base model", progress=0.1)
            model, tokenizer = self.load_base_model()

            # Setup LoRA config
            self.update_job_status("running", "Setting up LoRA configuration", progress=0.2)
            lora_config = self.setup_lora()

            # Load training data
            self.update_job_status("running", "Loading training data", progress=0.3)
            dataset_splits = self.load_training_data(tokenizer)
            train_dataset = dataset_splits['train']
            eval_dataset = dataset_splits['test']

            # Train
            self.update_job_status("running", "Training model", progress=0.4)
            trainer = self.train(model, train_dataset, eval_dataset, lora_config)

            # Save model
            self.update_job_status("running", "Saving and uploading model", progress=0.9)
            self.save_model(trainer, tokenizer)

            # Complete
            self.update_job_status(
                "completed",
                "Fine-tuning job completed successfully",
                progress=1.0,
                metadata={
                    "output_path": f"gs://{self.gcs_bucket}/{self.gcs_output_path}",
                    "model_name": self.output_model_name
                }
            )

            logger.info("=" * 80)
            logger.info("Fine-Tuning Job Complete!")
            logger.info(f"Output: gs://{self.gcs_bucket}/{self.gcs_output_path}")
            logger.info("=" * 80)

        except Exception as e:
            logger.error(f"Fine-tuning job failed: {e}", exc_info=True)
            self.update_job_status("failed", "Fine-tuning job failed", error=str(e))
            raise
        finally:
            # Cleanup local cache to free disk space
            if os.getenv("CLEANUP_CACHE", "true").lower() == "true":
                logger.info("Cleaning up local cache...")
                shutil.rmtree(self.local_cache_dir, ignore_errors=True)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Fine-tune models on Cloud Run")

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
    parser.add_argument("--job-id", type=str, default=None,
                       help="Job ID for tracking status in Firestore")
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
    parser.add_argument("--learning-rate", type=float, default=5e-5,
                       help="Learning rate")
    parser.add_argument("--num-train-epochs", type=int, default=3,
                       help="Number of training epochs")
    parser.add_argument("--per-device-train-batch-size", type=int, default=4,
                       help="Batch size per device")
    parser.add_argument("--gradient-accumulation-steps", type=int, default=4,
                       help="Gradient accumulation steps")
    parser.add_argument("--max-seq-length", type=int, default=256,
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
        job_id=args.job_id,
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
    )

    job.run()


if __name__ == "__main__":
    main()
