"""
Google Cloud Storage manager for model and data operations.

This module handles all interactions with Google Cloud Storage including
downloading models/data and uploading trained models.
"""

import logging
from pathlib import Path
from typing import Optional

from google.cloud import storage

logger = logging.getLogger(__name__)


class GCSStorageManager:
    """Manager for Google Cloud Storage operations."""

    def __init__(self, bucket_name: str):
        """
        Initialize GCS storage manager.

        Args:
            bucket_name: Name of the GCS bucket to use
        """
        self.bucket_name = bucket_name
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)
        logger.info(f"Initialized GCS storage manager for bucket: {bucket_name}")

    def blob_exists(self, gcs_path: str) -> bool:
        """
        Check if a blob exists in the bucket.

        Args:
            gcs_path: Path to the blob in GCS

        Returns:
            True if the blob exists, False otherwise
        """
        blobs = list(self.bucket.list_blobs(prefix=gcs_path, max_results=1))
        return len(blobs) > 0

    def download_directory(self, gcs_path: str, local_path: Path) -> Path:
        """
        Download all files from a GCS directory to a local directory.

        Args:
            gcs_path: GCS path prefix to download from
            local_path: Local directory to download to

        Returns:
            Path to the local directory

        Raises:
            FileNotFoundError: If no files are found at the GCS path
        """
        logger.info(f"Downloading from gs://{self.bucket_name}/{gcs_path} to {local_path}")

        blobs = list(self.bucket.list_blobs(prefix=gcs_path))

        if not blobs:
            raise FileNotFoundError(
                f"No files found at gs://{self.bucket_name}/{gcs_path}"
            )

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

    def download_file(self, gcs_path: str, local_path: Path) -> Path:
        """
        Download a single file from GCS.

        Args:
            gcs_path: GCS path to the file
            local_path: Local path to save the file

        Returns:
            Path to the downloaded file

        Raises:
            FileNotFoundError: If the file does not exist in GCS
        """
        logger.info(f"Downloading file gs://{self.bucket_name}/{gcs_path} to {local_path}")

        blob = self.bucket.blob(gcs_path)
        if not blob.exists():
            raise FileNotFoundError(
                f"File not found at gs://{self.bucket_name}/{gcs_path}"
            )

        local_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(local_path))

        logger.info(f"File downloaded successfully")
        return local_path

    def upload_directory(self, local_path: Path, gcs_path: str) -> int:
        """
        Upload a directory to GCS.

        Args:
            local_path: Local directory to upload
            gcs_path: GCS path prefix to upload to

        Returns:
            Number of files uploaded

        Raises:
            FileNotFoundError: If the local directory does not exist
        """
        if not local_path.exists():
            raise FileNotFoundError(f"Local directory not found: {local_path}")

        logger.info(f"Uploading {local_path} to gs://{self.bucket_name}/{gcs_path}")

        files = list(local_path.rglob("*"))
        files = [f for f in files if f.is_file()]

        for file_path in files:
            relative_path = file_path.relative_to(local_path)
            gcs_file_path = f"{gcs_path}/{relative_path}".replace("\\", "/")

            blob = self.bucket.blob(gcs_file_path)
            blob.upload_from_filename(str(file_path))
            logger.debug(f"Uploaded {gcs_file_path}")

        logger.info(
            f"Upload complete: {len(files)} files to gs://{self.bucket_name}/{gcs_path}"
        )
        return len(files)

    def upload_file(self, local_path: Path, gcs_path: str) -> None:
        """
        Upload a single file to GCS.

        Args:
            local_path: Local file path
            gcs_path: GCS destination path

        Raises:
            FileNotFoundError: If the local file does not exist
        """
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")

        logger.info(f"Uploading file {local_path} to gs://{self.bucket_name}/{gcs_path}")

        blob = self.bucket.blob(gcs_path)
        blob.upload_from_filename(str(local_path))

        logger.info("File uploaded successfully")

    def get_gcs_uri(self, gcs_path: str) -> str:
        """
        Get the full GCS URI for a path.

        Args:
            gcs_path: Path within the bucket

        Returns:
            Full GCS URI (gs://bucket/path)
        """
        return f"gs://{self.bucket_name}/{gcs_path}"
