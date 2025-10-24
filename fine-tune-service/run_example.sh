#!/bin/bash

# Example script to run a fine-tuning job
# Customize the parameters below for your use case

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration - CUSTOMIZE THESE
PROJECT_ID="${PROJECT_ID:-your-project-id}"
BUCKET_NAME="${BUCKET_NAME:-${PROJECT_ID}-models}"
REGION="${REGION:-us-central1}"
JOB_NAME="finetune-job"

# Training configuration - CUSTOMIZE THESE
BASE_MODEL="google/gemma-2-2b"
OUTPUT_MODEL_NAME="my-finetuned-gemma"
TRAINING_DATA_PATH="training-data/example_training_data.jsonl"

# Advanced parameters (optional)
NUM_EPOCHS=3
LEARNING_RATE=2e-4
LORA_R=16
LORA_ALPHA=32
BATCH_SIZE=4
GRAD_ACCUM=4

echo -e "${GREEN}=== Fine-Tuning Job Execution ===${NC}\n"

# Validate configuration
if [ "$PROJECT_ID" = "your-project-id" ]; then
    echo -e "${YELLOW}Warning: Please set PROJECT_ID environment variable${NC}"
    echo "Usage: PROJECT_ID=your-project ./run_example.sh"
    exit 1
fi

echo "Configuration:"
echo "  Project: $PROJECT_ID"
echo "  Bucket: $BUCKET_NAME"
echo "  Region: $REGION"
echo "  Base Model: $BASE_MODEL"
echo "  Output Model: $OUTPUT_MODEL_NAME"
echo "  Training Data: gs://${BUCKET_NAME}/${TRAINING_DATA_PATH}"
echo ""

# Optional: Upload example training data
read -p "Upload example training data to GCS? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Uploading example_training_data.jsonl to GCS..."
    gsutil cp example_training_data.jsonl gs://${BUCKET_NAME}/${TRAINING_DATA_PATH}
    echo -e "${GREEN}✓ Upload complete${NC}\n"
fi

echo "Executing fine-tuning job..."
echo ""

gcloud run jobs execute ${JOB_NAME} \
    --region=${REGION} \
    --args="--base-model=${BASE_MODEL}" \
    --args="--output-model-name=${OUTPUT_MODEL_NAME}" \
    --args="--training-data-path=${TRAINING_DATA_PATH}" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--num-train-epochs=${NUM_EPOCHS}" \
    --args="--learning-rate=${LEARNING_RATE}" \
    --args="--lora-r=${LORA_R}" \
    --args="--lora-alpha=${LORA_ALPHA}" \
    --args="--per-device-train-batch-size=${BATCH_SIZE}" \
    --args="--gradient-accumulation-steps=${GRAD_ACCUM}"

echo ""
echo -e "${GREEN}✓ Job submitted successfully!${NC}"
echo ""
echo "Monitor progress:"
echo "  gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION}"
echo ""
echo "View logs (replace EXECUTION_NAME with actual name):"
echo "  gcloud run jobs executions logs read EXECUTION_NAME --region=${REGION} --follow"
echo ""
