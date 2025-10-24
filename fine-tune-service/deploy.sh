#!/bin/bash

# Cloud Run Job Deployment Script for Fine-Tuning Service
# Usage: ./deploy.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== Cloud Run Fine-Tuning Job Deployment ===${NC}\n"

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
JOB_NAME="${JOB_NAME:-finetune-job}"
BUCKET_NAME="${BUCKET_NAME:-}"
IMAGE_NAME="finetune-service"

# GPU Configuration - Optimized for L4
GPU_TYPE="${GPU_TYPE:-nvidia-l4}"  # L4 is best for fine-tuning (24GB VRAM)
GPU_COUNT="${GPU_COUNT:-1}"
MEMORY="${MEMORY:-32Gi}"  # 32GB RAM for L4
CPU="${CPU:-8}"  # 8 vCPUs for L4
TIMEOUT="${TIMEOUT:-3600}"  # 1 hour default timeout
MAX_RETRIES="${MAX_RETRIES:-0}"  # Don't retry by default

# Validate configuration
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: PROJECT_ID is required${NC}"
    echo "Usage: PROJECT_ID=your-project ./deploy.sh"
    echo "Or: export PROJECT_ID=your-project && ./deploy.sh"
    exit 1
fi

if [ -z "$BUCKET_NAME" ]; then
    BUCKET_NAME="${PROJECT_ID}.firebasestorage.app"
    echo -e "${YELLOW}Using default bucket name: ${BUCKET_NAME}${NC}"
fi

echo "Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Job Name: $JOB_NAME"
echo "  Bucket: $BUCKET_NAME"
echo "  GPU Type: $GPU_TYPE"
echo "  GPU Count: $GPU_COUNT"
echo "  Memory: $MEMORY"
echo "  CPU: $CPU"
echo "  Timeout: ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"
echo ""

# ============================================================================
# Step 1: Set up GCP project
# ============================================================================

echo -e "${GREEN}Step 1: Setting up GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "  Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    storage.googleapis.com

# ============================================================================
# Step 2: Ensure GCS bucket exists
# ============================================================================

echo -e "${GREEN}Step 2: Checking GCS bucket...${NC}"
if gsutil ls gs://${BUCKET_NAME} >/dev/null 2>&1; then
    echo "  ✓ Bucket exists"
else
    echo "  Creating bucket..."
    gsutil mb -p ${PROJECT_ID} -l ${REGION} gs://${BUCKET_NAME}
    echo "  ✓ Bucket created"
fi

# ============================================================================
# Step 3: Create Artifact Registry
# ============================================================================

echo -e "${GREEN}Step 3: Setting up Artifact Registry...${NC}"
REPO_NAME="finetune"

if gcloud artifacts repositories describe ${REPO_NAME} \
    --location=${REGION} >/dev/null 2>&1; then
    echo "  ✓ Repository already exists"
else
    echo "  Creating Artifact Registry repository..."
    gcloud artifacts repositories create ${REPO_NAME} \
        --repository-format=docker \
        --location=${REGION} \
        --description="Fine-tuning service images"
    echo "  ✓ Repository created"
fi

# Configure Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# ============================================================================
# Step 4: Build and push Docker image
# ============================================================================

echo -e "${GREEN}Step 4: Building and pushing Docker image...${NC}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

echo "  Building image (this may take several minutes)..."
docker build -t ${IMAGE_URI} .

echo "  Pushing to Artifact Registry..."
docker push ${IMAGE_URI}
echo "  ✓ Image pushed"

# ============================================================================
# Step 5: Create/Update Cloud Run Job
# ============================================================================

echo -e "${GREEN}Step 5: Creating/Updating Cloud Run Job...${NC}"

# Check if job exists
if gcloud run jobs describe ${JOB_NAME} --region=${REGION} >/dev/null 2>&1; then
    echo "  Updating existing job..."
    ACTION="update"
else
    echo "  Creating new job..."
    ACTION="create"
fi

gcloud run jobs ${ACTION} ${JOB_NAME} \
    --image=${IMAGE_URI} \
    --region=${REGION} \
    --task-timeout=${TIMEOUT}s \
    --max-retries=${MAX_RETRIES} \
    --gpu=${GPU_COUNT} \
    --gpu-type=${GPU_TYPE} \
    --no-gpu-zonal-redundancy \
    --memory=${MEMORY} \
    --cpu=${CPU} \
    --set-env-vars="CLEANUP_CACHE=true"

echo "  ✓ Job ${ACTION}d successfully"

# ============================================================================
# Deployment Complete
# ============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🎉  Deployment Complete Successfully! 🎉              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Job Name:${NC} ${JOB_NAME}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo -e "${GREEN}1. Prepare your training data:${NC}"
echo "   Upload training data (JSONL format) to GCS:"
echo "   gsutil cp training_data.jsonl gs://${BUCKET_NAME}/training-data/my-dataset.jsonl"
echo ""
echo -e "${GREEN}2. (Optional) Upload a base model to GCS:${NC}"
echo "   If not using HuggingFace Hub, upload your base model:"
echo "   gsutil -m cp -r /path/to/base-model gs://${BUCKET_NAME}/base-models/gemma-2-2b/"
echo ""
echo -e "${GREEN}3. Execute the fine-tuning job:${NC}"
echo ""
echo -e "${BLUE}   # Using HuggingFace Hub model:${NC}"
echo "   gcloud run jobs execute ${JOB_NAME} \\"
echo "       --region=${REGION} \\"
echo "       --args=\"--base-model=google/gemma-2-2b\" \\"
echo "       --args=\"--output-model-name=my-finetuned-model\" \\"
echo "       --args=\"--training-data-path=training-data/my-dataset.jsonl\" \\"
echo "       --args=\"--gcs-bucket=${BUCKET_NAME}\" \\"
echo "       --args=\"--num-train-epochs=3\" \\"
echo "       --args=\"--learning-rate=2e-4\""
echo ""
echo -e "${BLUE}   # Using GCS-hosted base model:${NC}"
echo "   gcloud run jobs execute ${JOB_NAME} \\"
echo "       --region=${REGION} \\"
echo "       --args=\"--base-model=gemma-2-2b\" \\"
echo "       --args=\"--gcs-base-model-path=base-models/gemma-2-2b\" \\"
echo "       --args=\"--output-model-name=my-finetuned-model\" \\"
echo "       --args=\"--training-data-path=training-data/my-dataset.jsonl\" \\"
echo "       --args=\"--gcs-bucket=${BUCKET_NAME}\""
echo ""
echo -e "${GREEN}4. Monitor the job:${NC}"
echo "   gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION}"
echo ""
echo "   # Get logs for a specific execution"
echo "   gcloud run jobs executions logs read EXECUTION_NAME --region=${REGION}"
echo ""
echo -e "${GREEN}5. Deploy the fine-tuned model:${NC}"
echo "   After training completes, deploy to the inference service:"
echo "   gsutil ls gs://${BUCKET_NAME}/models/my-finetuned-model/merged/"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Training Data Format:${NC}"
echo ""
echo "Your training data should be in JSONL format with one of these structures:"
echo ""
echo -e "${BLUE}Format 1: Plain text${NC}"
echo '{"text": "Your training text here..."}'
echo ""
echo -e "${BLUE}Format 2: Chat messages${NC}"
echo '{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'
echo ""
echo -e "${BLUE}Format 3: Instruction-following${NC}"
echo '{"instruction": "...", "output": "..."}'
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Cost Information:${NC}"
echo ""

case $GPU_TYPE in
    nvidia-l4)
        HOURLY_COST=0.80
        VRAM="24GB"
        ;;
    nvidia-tesla-t4)
        HOURLY_COST=0.50
        VRAM="16GB"
        ;;
    nvidia-a100)
        HOURLY_COST=3.50
        VRAM="40GB"
        ;;
esac

echo "  GPU: ~\$${HOURLY_COST}/hour (${GPU_TYPE} - ${VRAM} VRAM)"
echo "  Charged only for job execution time"
echo "  Timeout: $(($TIMEOUT / 60)) minutes (~\$$(echo "scale=2; $HOURLY_COST * $TIMEOUT / 3600" | bc))"
echo ""
echo -e "${YELLOW}Tip:${NC} Fine-tuning typically takes 30-60 minutes for small datasets"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Monitoring:${NC}"
echo ""
echo "  View in Cloud Console:"
echo "  https://console.cloud.google.com/run/jobs/details/${REGION}/${JOB_NAME}?project=${PROJECT_ID}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Advanced Options:${NC}"
echo ""
echo "  Enable W&B logging:"
echo "  gcloud run jobs execute ${JOB_NAME} \\"
echo "      --region=${REGION} \\"
echo "      --args=\"--base-model=google/gemma-2-2b\" \\"
echo "      --args=\"--output-model-name=my-model\" \\"
echo "      --args=\"--training-data-path=training-data/dataset.jsonl\" \\"
echo "      --args=\"--gcs-bucket=${BUCKET_NAME}\" \\"
echo "      --args=\"--use-wandb\" \\"
echo "      --args=\"--wandb-project=gemma-finetune\" \\"
echo "      --set-env-vars=\"WANDB_API_KEY=your-key\""
echo ""
echo "  Adjust LoRA parameters:"
echo "      --args=\"--lora-r=32\" \\"
echo "      --args=\"--lora-alpha=64\" \\"
echo "      --args=\"--lora-dropout=0.1\""
echo ""
echo "  Adjust training parameters:"
echo "      --args=\"--per-device-train-batch-size=8\" \\"
echo "      --args=\"--gradient-accumulation-steps=2\" \\"
echo "      --args=\"--max-seq-length=1024\""
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo ""
