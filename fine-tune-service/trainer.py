"""
Trainer module for executing fine-tuning and saving models.

This module handles the training loop using SFTTrainer and model saving
(both adapter and merged versions).
"""

import json
import logging
from pathlib import Path
from typing import Optional

from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainerCallback, TrainerState, TrainerControl, TrainingArguments
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

from .config import TrainingConfig
from .storage import GCSStorageManager

logger = logging.getLogger(__name__)


class TrainingProgressCallback(TrainerCallback):
    """
    Custom callback to track and report training progress.

    Maps training progress (0.0 to 1.0) to job progress (0.4 to 0.9).
    """

    PROGRESS_START = 0.4  # Training starts at 40% overall progress
    PROGRESS_END = 0.9    # Training ends at 90% overall progress
    PROGRESS_RANGE = PROGRESS_END - PROGRESS_START  # 0.5 (50%)

    def __init__(self, job_tracker):
        """
        Initialize the progress callback.

        Args:
            job_tracker: FirestoreJobTracker instance to update progress
        """
        self.job_tracker = job_tracker
        self.last_reported_progress = None

    def _calculate_overall_progress(self, training_progress: float) -> float:
        """
        Map training progress (0.0-1.0) to overall job progress (0.4-0.9).

        Args:
            training_progress: Training completion percentage (0.0 to 1.0)

        Returns:
            Overall job progress (0.4 to 0.9)
        """
        return self.PROGRESS_START + (training_progress * self.PROGRESS_RANGE)

    def _should_report_progress(self, progress: float) -> bool:
        """
        Determine if progress update should be reported.

        Only report if progress changed by at least 1% to avoid excessive updates.

        Args:
            progress: Current progress value

        Returns:
            True if progress should be reported
        """
        if self.last_reported_progress is None:
            return True
        return abs(progress - self.last_reported_progress) >= 0.01

    def on_train_begin(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called at the beginning of training."""
        logger.info(f"Training started - Total epochs: {args.num_train_epochs}, Max steps: {state.max_steps}")
        self.job_tracker.update_progress(self.PROGRESS_START, "Training model - Starting...")
        self.last_reported_progress = self.PROGRESS_START

    def on_epoch_end(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called at the end of each epoch."""
        if state.epoch is not None:
            # Calculate training progress based on completed epochs
            training_progress = state.epoch / args.num_train_epochs
            overall_progress = self._calculate_overall_progress(training_progress)

            if self._should_report_progress(overall_progress):
                epoch_num = int(state.epoch)
                message = f"Training model - Epoch {epoch_num}/{args.num_train_epochs} completed"
                logger.info(f"{message} (progress: {overall_progress:.2%})")
                self.job_tracker.update_progress(overall_progress, message)
                self.last_reported_progress = overall_progress

    def on_log(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, logs=None, **kwargs):
        """Called when logging occurs (based on logging_steps or logging_strategy)."""
        if logs and state.epoch is not None:
            # Calculate training progress
            training_progress = state.epoch / args.num_train_epochs
            overall_progress = self._calculate_overall_progress(training_progress)

            # Log detailed training metrics
            log_data = {
                "step": state.global_step,
                "epoch": f"{state.epoch:.2f}",
                "progress": f"{overall_progress:.2%}",
            }
            if "loss" in logs:
                log_data["loss"] = f"{logs['loss']:.4f}"
            if "learning_rate" in logs:
                log_data["lr"] = f"{logs['learning_rate']:.2e}"

            logger.info(f"Training metrics: {log_data}")

            # Update progress if significant change
            if self._should_report_progress(overall_progress):
                message = f"Training model - Epoch {state.epoch:.1f}/{args.num_train_epochs}"
                self.job_tracker.update_progress(overall_progress, message)
                self.last_reported_progress = overall_progress

    def on_train_end(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, **kwargs):
        """Called at the end of training."""
        logger.info("Training completed successfully!")
        # Don't update to 0.9 here - let the main job flow handle it


class ModelTrainer:
    """Trainer for fine-tuning models with LoRA/QLoRA."""

    def __init__(
        self,
        storage_manager: GCSStorageManager,
        local_output_dir: Path,
        training_config: TrainingConfig,
        job_tracker = None,
    ):
        """
        Initialize model trainer.

        Args:
            storage_manager: GCS storage manager instance
            local_output_dir: Local directory for saving outputs
            training_config: Training configuration
            job_tracker: Optional FirestoreJobTracker for progress updates
        """
        self.storage = storage_manager
        self.local_output_dir = local_output_dir
        self.training_config = training_config
        self.job_tracker = job_tracker

        self.local_output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized trainer with output dir: {local_output_dir}")

    def train(
        self,
        model: AutoModelForCausalLM,
        train_dataset: Dataset,
        eval_dataset: Dataset,
        lora_config: LoraConfig,
    ) -> SFTTrainer:
        """
        Train the model using SFTTrainer.

        Args:
            model: Model to train
            train_dataset: Training dataset
            eval_dataset: Evaluation dataset
            lora_config: LoRA configuration

        Returns:
            Trained SFTTrainer instance
        """
        logger.info("Setting up training...")

        training_args = self._create_training_args()

        # Create progress callback if job tracker is available
        callbacks = []
        if self.job_tracker:
            progress_callback = TrainingProgressCallback(self.job_tracker)
            callbacks.append(progress_callback)
            logger.info("Progress tracking callback enabled")

        trainer = self._create_trainer(
            model, train_dataset, eval_dataset, lora_config, training_args, callbacks
        )

        logger.info("Starting training...")
        logger.info(f"Training for {self.training_config.num_train_epochs} epochs")
        logger.info(f"Total training examples: {len(train_dataset)}")
        logger.info(f"Total evaluation examples: {len(eval_dataset)}")

        trainer.train()

        logger.info("Training complete!")
        return trainer

    def save_and_upload_model(
        self,
        trainer: SFTTrainer,
        tokenizer: AutoTokenizer,
        gcs_output_path: str,
        training_config_dict: dict,
    ) -> None:
        """
        Save fine-tuned model (adapter and merged) and upload to GCS.

        Args:
            trainer: Trained SFTTrainer instance
            tokenizer: Tokenizer to save
            gcs_output_path: GCS path prefix for outputs
            training_config_dict: Training configuration dictionary to save
        """
        logger.info("Saving model...")

        # Save adapter model
        adapter_dir = self._save_adapter_model(trainer, tokenizer)

        # Save merged model
        merged_dir = self._save_merged_model(trainer, tokenizer)

        # Upload to GCS
        self._upload_models(adapter_dir, merged_dir, gcs_output_path)

        # Save and upload training config
        self._save_training_config(training_config_dict, gcs_output_path)

        logger.info(f"Model uploaded to {self.storage.get_gcs_uri(gcs_output_path)}")

    def _create_training_args(self) -> SFTConfig:
        """
        Create training arguments from configuration.

        Returns:
            SFTConfig instance
        """
        return SFTConfig(
            output_dir=str(self.local_output_dir),
            num_train_epochs=self.training_config.num_train_epochs,
            per_device_train_batch_size=self.training_config.per_device_train_batch_size,
            learning_rate=self.training_config.learning_rate,
            max_length=self.training_config.max_seq_length,
            logging_strategy=self.training_config.logging_strategy,
            eval_strategy=self.training_config.eval_strategy,
            save_strategy=self.training_config.save_strategy,
            lr_scheduler_type=self.training_config.lr_scheduler_type,
            gradient_checkpointing=self.training_config.gradient_checkpointing,
            packing=self.training_config.packing,
            optim=self.training_config.optim,
            report_to=self.training_config.report_to,
            weight_decay=self.training_config.weight_decay,
        )

    def _create_trainer(
        self,
        model: AutoModelForCausalLM,
        train_dataset: Dataset,
        eval_dataset: Dataset,
        lora_config: LoraConfig,
        training_args: SFTConfig,
        callbacks: list = None,
    ) -> SFTTrainer:
        """
        Create SFTTrainer instance.

        Args:
            model: Model to train
            train_dataset: Training dataset
            eval_dataset: Evaluation dataset
            lora_config: LoRA configuration
            training_args: Training arguments
            callbacks: Optional list of callbacks

        Returns:
            SFTTrainer instance
        """
        return SFTTrainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            peft_config=lora_config,
            callbacks=callbacks,
        )

    def _save_adapter_model(
        self, trainer: SFTTrainer, tokenizer: AutoTokenizer
    ) -> Path:
        """
        Save LoRA adapter model.

        Args:
            trainer: Trained SFTTrainer instance
            tokenizer: Tokenizer to save

        Returns:
            Path to saved adapter directory
        """
        adapter_dir = self.local_output_dir / "adapter"
        trainer.save_model(str(adapter_dir))
        tokenizer.save_pretrained(str(adapter_dir))
        logger.info(f"LoRA adapters saved locally to {adapter_dir}")
        return adapter_dir

    def _save_merged_model(
        self, trainer: SFTTrainer, tokenizer: AutoTokenizer
    ) -> Path:
        """
        Save merged model (base model + adapters).

        Args:
            trainer: Trained SFTTrainer instance
            tokenizer: Tokenizer to save

        Returns:
            Path to saved merged directory
        """
        logger.info("Merging LoRA adapters with base model...")
        model = trainer.model.merge_and_unload()

        merged_dir = self.local_output_dir / "merged"
        model.save_pretrained(str(merged_dir))
        tokenizer.save_pretrained(str(merged_dir))
        logger.info(f"Merged model saved to {merged_dir}")
        return merged_dir

    def _upload_models(
        self, adapter_dir: Path, merged_dir: Path, gcs_output_path: str
    ) -> None:
        """
        Upload adapter and merged models to GCS.

        Args:
            adapter_dir: Local adapter directory
            merged_dir: Local merged directory
            gcs_output_path: GCS path prefix
        """
        logger.info("Uploading adapter model to GCS...")
        self.storage.upload_directory(adapter_dir, f"{gcs_output_path}/adapter")

        logger.info("Uploading merged model to GCS...")
        self.storage.upload_directory(merged_dir, f"{gcs_output_path}/merged")

    def _save_training_config(
        self, config_dict: dict, gcs_output_path: str
    ) -> None:
        """
        Save training configuration to GCS.

        Args:
            config_dict: Configuration dictionary
            gcs_output_path: GCS path prefix
        """
        config_file = self.local_output_dir / "training_config.json"
        with open(config_file, "w") as f:
            json.dump(config_dict, f, indent=2)

        self.storage.upload_file(
            config_file, f"{gcs_output_path}/training_config.json"
        )
        logger.info("Training config saved")
