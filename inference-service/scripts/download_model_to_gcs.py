#!/usr/bin/env python3
"""
Script to download a model from Hugging Face Hub and upload it to Google Cloud Storage.

Prerequisites:
    pip install huggingface-hub google-cloud-storage python-dotenv

Environment Setup:
    - Create a .env file with your credentials (see example below)
    - Or set environment variables manually
    - Authenticate with GCP: gcloud auth application-default login
    - Or set GOOGLE_APPLICATION_CREDENTIALS in .env file

Example .env file:
    HF_TOKEN=hf_your_huggingface_token_here
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
    GCS_BUCKET=my-ml-models
"""

import os
import argparse
from pathlib import Path
from huggingface_hub import snapshot_download
from google.cloud import storage
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def download_model_from_hf(model_id, local_dir, hf_token=None):
    """
    Download a model from Hugging Face Hub.
    
    Args:
        model_id: HuggingFace model ID (e.g., 'google/gemma-3-270m-it')
        local_dir: Local directory to save the model
        hf_token: HuggingFace access token (optional)
    
    Returns:
        Path to downloaded model directory
    """
    logger.info(f"Downloading model '{model_id}' from Hugging Face...")
    
    try:
        model_path = snapshot_download(
            repo_id=model_id,
            local_dir=local_dir,
            token=hf_token,
            resume_download=True
        )
        logger.info(f"Model downloaded successfully to: {model_path}")
        return model_path
    except Exception as e:
        logger.error(f"Error downloading model: {e}")
        raise


def upload_directory_to_gcs(local_path, bucket_name, gcs_prefix):
    """
    Upload a local directory to Google Cloud Storage.
    
    Args:
        local_path: Path to local directory
        bucket_name: GCS bucket name
        gcs_prefix: Prefix/folder path in GCS (e.g., 'models/gemma-3-270m')
    """
    logger.info(f"Uploading to GCS bucket '{bucket_name}' with prefix '{gcs_prefix}'...")
    
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        local_path = Path(local_path)
        files_uploaded = 0
        
        # Walk through all files in the directory
        for file_path in local_path.rglob('*'):
            if file_path.is_file():
                # Calculate relative path for GCS
                relative_path = file_path.relative_to(local_path)
                gcs_path = f"{gcs_prefix}/{relative_path}".replace('\\', '/')
                
                # Upload file
                blob = bucket.blob(gcs_path)
                blob.upload_from_filename(str(file_path))
                files_uploaded += 1
                logger.info(f"Uploaded: {gcs_path}")
        
        logger.info(f"Successfully uploaded {files_uploaded} files to GCS")
        logger.info(f"GCS location: gs://{bucket_name}/{gcs_prefix}/")
        
    except Exception as e:
        logger.error(f"Error uploading to GCS: {e}")
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Download a model from Hugging Face and upload to Google Cloud Storage"
    )
    parser.add_argument(
        "--model-id",
        type=str,
        required=True,
        help="HuggingFace model ID (e.g., 'google/gemma-3-270m-it')"
    )
    parser.add_argument(
        "--bucket-name",
        type=str,
        default=None,
        help="GCS bucket name (or set GCS_BUCKET in .env)"
    )
    parser.add_argument(
        "--gcs-prefix",
        type=str,
        default="models",
        help="Prefix/folder path in GCS (default: 'models')"
    )
    parser.add_argument(
        "--local-dir",
        type=str,
        default="./downloaded_model",
        help="Local directory to temporarily store the model (default: './downloaded_model')"
    )
    parser.add_argument(
        "--hf-token",
        type=str,
        default=None,
        help="HuggingFace access token (or set HF_TOKEN env var)"
    )
    parser.add_argument(
        "--keep-local",
        action="store_true",
        help="Keep local copy after uploading to GCS"
    )

    args = parser.parse_args()

    # Get HF token from args or environment
    hf_token = args.hf_token or os.getenv('HF_TOKEN')

    # Get bucket name from args or environment
    bucket_name = args.bucket_name or os.getenv('GCS_BUCKET')
    if not bucket_name:
        logger.error("Bucket name must be provided via --bucket-name or GCS_BUCKET in .env")
        exit(1)

    # Sanitize model ID for use as a folder name (replace / and \ with -)
    sanitized_model_id = args.model_id.replace('/', '-').replace('\\', '-')

    # Construct the full GCS prefix: models/model-id
    gcs_prefix = f"{args.gcs_prefix}/{sanitized_model_id}".replace('\\', '/')

    try:
        # Step 1: Download from Hugging Face
        model_path = download_model_from_hf(
            model_id=args.model_id,
            local_dir=args.local_dir,
            hf_token=hf_token
        )

        # Step 2: Upload to GCS
        upload_directory_to_gcs(
            local_path=model_path,
            bucket_name=bucket_name,
            gcs_prefix=gcs_prefix
        )
        
        # Step 3: Clean up local files if requested
        if not args.keep_local:
            import shutil
            logger.info(f"Cleaning up local directory: {model_path}")
            shutil.rmtree(model_path)
            logger.info("Local files removed")
        else:
            logger.info(f"Local files kept at: {model_path}")
        
        logger.info("Process completed successfully!")
        
    except Exception as e:
        logger.error(f"Process failed: {e}")
        exit(1)


if __name__ == "__main__":
    main()