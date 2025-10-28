"""
Fine-Tune Service - Production-ready LLM fine-tuning on Cloud Run.

This package provides a modular, production-ready framework for fine-tuning
large language models using LoRA/QLoRA on Google Cloud Platform.

Main Components:
    - config: Configuration dataclasses for all job parameters
    - storage: GCS storage manager for model and data operations
    - job_tracker: Firestore integration for job status tracking
    - model_manager: Model loading and LoRA configuration
    - data_manager: Training data loading and formatting
    - trainer: Model training and saving
    - fine_tune_job: Main orchestrator that coordinates all components

Example:
    >>> from fine_tune_service import FineTuneJob, FineTuneJobConfig
    >>> from fine_tune_service.config import JobConfig, TrainingConfig
    >>>
    >>> config = FineTuneJobConfig(
    ...     job=JobConfig(
    ...         base_model="google/gemma-2-2b",
    ...         output_model_name="my-fine-tuned-model",
    ...         training_data_path="training-data/data.jsonl",
    ...         gcs_bucket="my-bucket",
    ...     )
    ... )
    >>> job = FineTuneJob(config)
    >>> job.run()
"""

from .config import (
    JobConfig,
    TrainingConfig,
    LoRAConfig,
    QuantizationConfig,
    FineTuneJobConfig,
)
from .fine_tune_job import FineTuneJob
from .storage import GCSStorageManager
from .job_tracker import FirestoreJobTracker
from .model_manager import ModelManager
from .data_manager import DataManager
from .trainer import ModelTrainer

__version__ = "1.0.0"

__all__ = [
    # Main entry point
    "FineTuneJob",
    # Configuration
    "JobConfig",
    "TrainingConfig",
    "LoRAConfig",
    "QuantizationConfig",
    "FineTuneJobConfig",
    # Components (for advanced usage)
    "GCSStorageManager",
    "FirestoreJobTracker",
    "ModelManager",
    "DataManager",
    "ModelTrainer",
]
