"""
Firestore job tracker for monitoring fine-tuning job status.

This module handles all interactions with Firestore for tracking job progress,
updating status, and storing metadata.
"""

import logging
from typing import Optional, Dict, Any

import firebase_admin
from firebase_admin import firestore

logger = logging.getLogger(__name__)


class FirestoreJobTracker:
    """Tracker for fine-tuning job status in Firestore."""

    COLLECTION_NAME = "fine-tune-jobs"

    def __init__(self, job_id: Optional[str] = None):
        """
        Initialize Firestore job tracker.

        Args:
            job_id: Optional job ID for tracking. If None, tracking is disabled.
        """
        self.job_id = job_id
        self.enabled = job_id is not None

        if self.enabled:
            # Initialize Firebase Admin SDK if not already initialized
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()
            logger.info(f"Initialized Firestore job tracker for job ID: {job_id}")
        else:
            self.db = None
            logger.info("Firestore job tracking disabled (no job ID provided)")

    def update_status(
        self,
        status: str,
        message: Optional[str] = None,
        progress: Optional[float] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Update job status in Firestore.

        Args:
            status: Job status (e.g., "pending", "running", "completed", "failed")
            message: Optional status message
            progress: Optional progress value between 0.0 and 1.0
            error: Optional error message (for failed jobs)
            metadata: Optional metadata dictionary

        Note:
            If tracking is disabled (no job_id), this method does nothing.
        """
        if not self.enabled:
            return

        try:
            job_ref = self.db.collection(self.COLLECTION_NAME).document(self.job_id)
            update_data = {
                "status": status,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }

            if message:
                update_data["message"] = message
            if progress is not None:
                if not 0.0 <= progress <= 1.0:
                    logger.warning(f"Progress {progress} out of range [0, 1], clamping")
                    progress = max(0.0, min(1.0, progress))
                update_data["progress"] = progress
            if error:
                update_data["error"] = error
            if metadata:
                update_data["metadata"] = metadata

            job_ref.update(update_data)
            log_message = f"Updated job status: {status}"
            if message:
                log_message += f" - {message}"
            logger.info(log_message)

        except Exception as e:
            # Don't fail the job if we can't update status
            logger.warning(f"Failed to update job status in Firestore: {e}")

    def mark_running(self, message: str = "Job started", progress: float = 0.0) -> None:
        """Mark job as running."""
        self.update_status("running", message=message, progress=progress)

    def mark_completed(
        self, message: str = "Job completed successfully", metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Mark job as completed."""
        self.update_status("completed", message=message, progress=1.0, metadata=metadata)

    def mark_failed(self, error: str, message: str = "Job failed") -> None:
        """Mark job as failed."""
        self.update_status("failed", message=message, error=error)

    def update_progress(self, progress: float, message: Optional[str] = None) -> None:
        """Update job progress without changing status."""
        self.update_status("running", message=message, progress=progress)
