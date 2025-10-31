"""
Google Cloud Storage manager for model and data operations.

This module handles all interactions with Google Cloud Storage including
downloading models/data and uploading trained models.
"""

import logging
import os
from pathlib import Path
from typing import Optional

from google.cloud import storage

logger = logging.getLogger(__name__)


class GCSStorageManager:
    """Manager for Google Cloud Storage operations."""

    def __init__(self, bucket_name: str, mount_path: Optional[str] = None):
        """
        Initialize GCS storage manager.

        Args:
            bucket_name: Name of the GCS bucket to use
            mount_path: Optional path where GCS bucket is mounted via Cloud Storage FUSE
        """
        self.bucket_name = bucket_name
        self.mount_path = mount_path

        # Log if using mounted volume
        if self.mount_path:
            logger.info(f"Cloud Storage volume mounted at: {self.mount_path}")
            logger.info("Files will be read/written directly from/to mounted volume when available")

        # Initialize GCS client (used for fallback or when MOUNT_PATH not set)
        try:
            self.client = storage.Client()
            self.bucket = self.client.bucket(bucket_name)
            logger.info(f"Initialized GCS storage manager for bucket: {bucket_name}")
        except Exception as e:
            # Only raise error if MOUNT_PATH is not configured (no fallback available)
            if not self.mount_path:
                logger.error(f"GCS client initialization failed and no MOUNT_PATH configured: {e}")
                raise
            else:
                logger.warning(f"GCS client initialization failed, relying on mounted volume: {e}")
                self.client = None
                self.bucket = None

    def _get_mounted_path(self, gcs_path: str) -> Optional[Path]:
        """
        Get mounted volume path for a GCS path if available.

        Args:
            gcs_path: GCS path (without gs://bucket/)

        Returns:
            Path to mounted location if it exists, None otherwise
        """
        if not self.mount_path:
            return None

        mounted_path = Path(self.mount_path) / gcs_path
        if mounted_path.exists():
            logger.info(f"Found path in mounted volume: {mounted_path}")
            return mounted_path

        return None

    def blob_exists(self, gcs_path: str) -> bool:
        """
        Check if a blob exists in the bucket or mounted volume.

        Args:
            gcs_path: Path to the blob in GCS

        Returns:
            True if the blob exists, False otherwise
        """
        # Check mounted volume first
        mounted_path = self._get_mounted_path(gcs_path)
        if mounted_path and mounted_path.exists():
            return True

        # Fall back to GCS check
        if not self.bucket:
            return False

        blobs = list(self.bucket.list_blobs(prefix=gcs_path, max_results=1))
        return len(blobs) > 0

    def download_directory(self, gcs_path: str, local_path: Path) -> Path:
        """
        Get directory from mounted volume or download from GCS.

        If MOUNT_PATH is configured, returns the mounted path directly.
        Otherwise downloads from GCS to local_path.

        Args:
            gcs_path: GCS path prefix to download from
            local_path: Local directory to download to (unused if mounted)

        Returns:
            Path to the directory (mounted volume or local)

        Raises:
            FileNotFoundError: If no files are found at the GCS path or mounted volume
        """
        # Check if available in mounted volume
        mounted_path = self._get_mounted_path(gcs_path)
        if mounted_path and mounted_path.is_dir():
            logger.info(f"Using directory from mounted volume: {mounted_path}")
            return mounted_path

        # Fall back to downloading from GCS
        if not self.bucket:
            raise FileNotFoundError(
                f"Directory not found in mounted volume and GCS client not available: {gcs_path}"
            )

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
        Get file from mounted volume or download from GCS.

        If MOUNT_PATH is configured, returns the mounted path directly.
        Otherwise downloads from GCS to local_path.

        Args:
            gcs_path: GCS path to the file
            local_path: Local path to save the file (unused if mounted)

        Returns:
            Path to the file (mounted volume or local)

        Raises:
            FileNotFoundError: If the file does not exist in GCS or mounted volume
        """
        # Check if available in mounted volume
        mounted_path = self._get_mounted_path(gcs_path)
        if mounted_path and mounted_path.is_file():
            logger.info(f"Using file from mounted volume: {mounted_path}")
            return mounted_path

        # Fall back to downloading from GCS
        if not self.bucket:
            raise FileNotFoundError(
                f"File not found in mounted volume and GCS client not available: {gcs_path}"
            )

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
        Upload a directory to GCS using the GCS client API.

        Note: Always uses GCS client API for uploads, even if MOUNT_PATH is configured.
        GCS FUSE mounted volumes have filesystem limitations that cause permission errors
        during write operations.

        Args:
            local_path: Local directory to upload
            gcs_path: GCS path prefix to upload to

        Returns:
            Number of files uploaded

        Raises:
            FileNotFoundError: If the local directory does not exist
            RuntimeError: If GCS client is not available
        """
        if not local_path.exists():
            raise FileNotFoundError(f"Local directory not found: {local_path}")

        if not self.bucket:
            raise RuntimeError("Cannot upload: GCS client not available")

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
        Upload a single file to GCS using the GCS client API.

        Note: Always uses GCS client API for uploads, even if MOUNT_PATH is configured.
        GCS FUSE mounted volumes have filesystem limitations that cause permission errors
        during write operations.

        Args:
            local_path: Local file path
            gcs_path: GCS destination path

        Raises:
            FileNotFoundError: If the local file does not exist
            RuntimeError: If GCS client is not available
        """
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")

        if not self.bucket:
            raise RuntimeError("Cannot upload: GCS client not available")

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
