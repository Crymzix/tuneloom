#!/bin/bash

# Cloud Run Inference Service Deployment Script
# Usage: ./deploy.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Cloud Run Inference Service Deployment ===${NC}\n"

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-inference-service}"
BUCKET_NAME="${BUCKET_NAME:-}"
IMAGE_NAME="inference-service"

# GPU Configuration
GPU_TYPE="${GPU_TYPE:-nvidia-l4}"  # Options: nvidia-l4, nvidia-tesla-t4, nvidia-a100
GPU_COUNT="${GPU_COUNT:-1}"
MEMORY="${MEMORY:-16Gi}"
CPU="${CPU:-4}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"  # Set to 0 to scale to zero
CONCURRENCY="${CONCURRENCY:-10}"  # Requests per instance

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
echo "  Service: $SERVICE_NAME"
echo "  Bucket: $BUCKET_NAME"
echo "  GPU Type: $GPU_TYPE"
echo "  Memory: $MEMORY"
echo "  Concurrency: $CONCURRENCY per instance"
echo "  Max Instances: $MAX_INSTANCES"
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
# Step 2: Create GCS bucket
# ============================================================================

echo -e "${GREEN}Step 2: Setting up GCS bucket...${NC}"
if gsutil ls gs://${BUCKET_NAME} >/dev/null 2>&1; then
    echo "  ✓ Bucket already exists"
else
    echo "  Creating bucket..."
    gsutil mb -p ${PROJECT_ID} -l ${REGION} gs://${BUCKET_NAME}
    echo "  ✓ Bucket created"
fi

# ============================================================================
# Step 3: Create Artifact Registry
# ============================================================================

echo -e "${GREEN}Step 3: Setting up Artifact Registry...${NC}"
REPO_NAME="inference"

if gcloud artifacts repositories describe ${REPO_NAME} \
    --location=${REGION} >/dev/null 2>&1; then
    echo "  ✓ Repository already exists"
else
    echo "  Creating Artifact Registry repository..."
    gcloud artifacts repositories create ${REPO_NAME} \
        --repository-format=docker \
        --location=${REGION} \
        --description="Inference service images"
    echo "  ✓ Repository created"
fi

# Configure Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# ============================================================================
# Step 4: Build and push Docker image
# ============================================================================

echo -e "${GREEN}Step 4: Building and pushing Docker image...${NC}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

echo "  Building image..."
docker build -t ${IMAGE_URI} .

echo "  Pushing to Artifact Registry..."
docker push ${IMAGE_URI}
echo "  ✓ Image pushed"

# ============================================================================
# Step 5: Deploy to Cloud Run
# ============================================================================

echo -e "${GREEN}Step 5: Deploying to Cloud Run with GPU...${NC}"

gcloud run deploy ${SERVICE_NAME} \
    --image=${IMAGE_URI} \
    --region=${REGION} \
    --platform=managed \
    --gpu=${GPU_COUNT} \
    --gpu-type=${GPU_TYPE} \
    --memory=${MEMORY} \
    --cpu=${CPU} \
    --timeout=300 \
    --concurrency=${CONCURRENCY} \
    --max-instances=${MAX_INSTANCES} \
    --min-instances=${MIN_INSTANCES} \
    --port=8080 \
    --allow-unauthenticated \
    --set-env-vars="GCS_BUCKET=${BUCKET_NAME},GCS_MODEL_PREFIX=models/,MAX_CACHED_MODELS=2,MAX_CONCURRENT_REQUESTS=50"

# ============================================================================
# Step 6: Get service URL
# ============================================================================

echo -e "${GREEN}Step 6: Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --format='value(status.url)')

# ============================================================================
# Deployment Complete
# ============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🎉  Deployment Complete Successfully! 🎉              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Service URL:${NC}"
echo "  ${SERVICE_URL}"
echo ""
echo -e "${GREEN}API Endpoint:${NC}"
echo "  ${SERVICE_URL}/v1/chat/completions"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo -e "${GREEN}1. Upload your fine-tuned models to GCS:${NC}"
echo "   gsutil -m cp -r /path/to/your/model gs://${BUCKET_NAME}/models/model-name/"
echo ""
echo -e "${GREEN}2. Test the health endpoint:${NC}"
echo "   curl ${SERVICE_URL}/health"
echo ""
echo -e "${GREEN}3. Make your first inference request:${NC}"
echo "   curl ${SERVICE_URL}/v1/chat/completions \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{"
echo "       \"model\": \"model-name\","
echo "       \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}],"
echo "       \"max_tokens\": 50"
echo "     }'"
echo ""
echo -e "${GREEN}4. Or use the OpenAI Python SDK:${NC}"
echo "   from openai import OpenAI"
echo "   client = OpenAI(base_url=\"${SERVICE_URL}/v1\", api_key=\"dummy\")"
echo "   response = client.chat.completions.create("
echo "       model=\"model-name\","
echo "       messages=[{\"role\": \"user\", \"content\": \"Hello!\"}]"
echo "   )"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Cost Information:${NC}"
echo ""

case $GPU_TYPE in
    nvidia-l4)
        echo "  GPU: ~\$0.80/hour (nvidia-l4 - 24GB)"
        ;;
    nvidia-tesla-t4)
        echo "  GPU: ~\$0.50/hour (nvidia-tesla-t4 - 16GB)"
        ;;
    nvidia-a100)
        echo "  GPU: ~\$3.50/hour (nvidia-a100 - 40GB)"
        ;;
esac

echo "  Charged only for request processing time"
if [ "$MIN_INSTANCES" = "0" ]; then
    echo "  ✓ Scales to zero when idle (no charges when not in use)"
else
    echo "  Min instances: $MIN_INSTANCES (always running)"
fi
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Monitoring:${NC}"
echo ""
echo "  View logs:"
echo "  gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --limit=50"
echo ""
echo "  View in Cloud Console:"
echo "  https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}/logs?project=${PROJECT_ID}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo ""