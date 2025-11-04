"""
Fine-tuning Job Orchestrator for LLM Models.

This module orchestrates the complete fine-tuning pipeline by coordinating
specialized components for storage, job tracking, model management, data loading,
and training execution.
"""

import os
import logging
import shutil
import json
from pathlib import Path
from urllib import request as urllib_request
from urllib.error import URLError

from .config import FineTuneJobConfig
from .storage import GCSStorageManager
from .job_tracker import FirestoreJobTracker
from .model_manager import ModelManager
from .data_manager import DataManager
from .trainer import ModelTrainer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FineTuneJob:
    """
    Orchestrator for fine-tuning jobs.

    This class coordinates all components of the fine-tuning pipeline:
    storage, job tracking, model management, data loading, and training.
    """

    def __init__(self, config: FineTuneJobConfig):
        """
        Initialize fine-tuning job orchestrator.

        Args:
            config: Complete job configuration
        """
        self.config = config

        # Setup local directories
        self.local_cache_dir = Path(config.job.local_cache_dir)
        self.local_model_dir = self.local_cache_dir / "base_model"
        self.local_data_dir = self.local_cache_dir / "data"
        self.local_output_dir = self.local_cache_dir / "output"

        # Get MOUNT_PATH from environment variable
        mount_path = os.getenv("MOUNT_PATH", None)

        # Initialize components
        self.storage = GCSStorageManager(config.job.gcs_bucket, mount_path=mount_path)
        self.job_tracker = FirestoreJobTracker(config.job.job_id)
        self.model_manager = ModelManager(
            self.storage,
            self.local_model_dir,
            config.quantization,
            config.lora,
        )
        self.data_manager = DataManager(self.storage, self.local_data_dir)
        self.trainer = ModelTrainer(
            self.storage,
            self.local_output_dir,
            config.training,
            self.job_tracker,  # Pass job tracker for progress updates
        )

        # Log initialization
        self._log_initialization()

    def run(self) -> None:
        """Execute the complete fine-tuning pipeline."""
        try:
            logger.info("=" * 80)
            logger.info("Starting Fine-Tuning Job")
            logger.info("=" * 80)

            # Initialize
            self.job_tracker.mark_running("Initializing fine-tuning job", progress=0.0)

            # Load base model
            self.job_tracker.update_progress(0.1, "Loading base model")
            model, tokenizer = self.model_manager.load_model(
                self.config.job.base_model,
                self.config.job.gcs_base_model_path,
            )

            # Setup LoRA configuration
            self.job_tracker.update_progress(0.2, "Setting up LoRA configuration")
            lora_config = self.model_manager.create_lora_config()

            # Load training data
            self.job_tracker.update_progress(0.3, "Loading training data")
            dataset_splits = self.data_manager.load_training_data(
                self.config.job.training_data_path,
                tokenizer,
            )

            # Train
            self.job_tracker.update_progress(0.4, "Training model")
            trainer = self.trainer.train(
                model,
                dataset_splits["train"],
                dataset_splits["test"],
                lora_config,
            )

            # Save and upload model
            self.job_tracker.update_progress(0.9, "Saving and uploading model")
            self.trainer.save_and_upload_model(
                trainer,
                tokenizer,
                self.config.job.effective_gcs_output_path,
                self.config.to_dict(),
            )

            # Complete
            output_uri = self.storage.get_gcs_uri(
                self.config.job.effective_gcs_output_path
            )
            self.job_tracker.mark_completed(
                metadata={
                    "outputPath": output_uri,
                    "modelName": self.config.job.output_model_name,
                }
            )

            # Send webhook notification
            self._send_webhook_notification(success=True)

            logger.info("=" * 80)
            logger.info("Fine-Tuning Job Complete!")
            logger.info(f"Output: {output_uri}")
            logger.info("=" * 80)

        except Exception as e:
            logger.error(f"Fine-tuning job failed: {e}", exc_info=True)
            self.job_tracker.mark_failed(str(e))
            # Send webhook notification on failure
            self._send_webhook_notification(success=False)
            raise
        finally:
            self._cleanup()

    def _log_initialization(self) -> None:
        """Log job initialization details."""
        logger.info(f"Initialized FineTuneJob for {self.config.job.output_model_name}")
        if self.config.job.job_id:
            logger.info(f"Job ID: {self.config.job.job_id}")
        logger.info(f"Base model: {self.config.job.base_model}")
        logger.info(
            f"Training data: {self.storage.get_gcs_uri(self.config.job.training_data_path)}"
        )
        logger.info(
            f"Output path: {self.storage.get_gcs_uri(self.config.job.effective_gcs_output_path)}"
        )
        logger.info(
            f"Quantization: {self.config.quantization.quantization_type or 'None'}"
        )

    def _send_webhook_notification(self, success: bool) -> None:
        """
        Send webhook notification to external service.

        Args:
            success: True if job completed successfully, False if it failed
        """
        try:
            webhook_url = self.config.job.webhook_url
            logger.info(f"Sending webhook notification to {webhook_url}")

            # Prepare payload
            payload = {
                "success": success
            }
            json_data = json.dumps(payload).encode('utf-8')

            # Create and send request
            req = urllib_request.Request(
                webhook_url,
                data=json_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib_request.urlopen(req, timeout=10) as response:
                logger.info(f"Webhook notification sent successfully (status: {response.getcode()})")
        except URLError as e:
            logger.error(f"Failed to send webhook notification: {e}")
        except Exception as e:
            logger.error(f"Unexpected error sending webhook notification: {e}")

    def _cleanup(self) -> None:
        """Cleanup local cache to free disk space."""
        if self.config.job.cleanup_cache:
            logger.info("Cleaning up local cache...")
            shutil.rmtree(self.local_cache_dir, ignore_errors=True)
