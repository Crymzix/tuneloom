# Fine-Tune Service - Cloud Run Job for Gemma Models

A production-ready fine-tuning service for Gemma models that runs as a Cloud Run
Job with NVIDIA L4 GPU support. This service downloads base models and training
data from Google Cloud Storage, fine-tunes using LoRA/QLoRA, and saves the
resulting model back to GCS.

## Features

- **GPU-Accelerated Training**: Optimized for NVIDIA L4 GPU (24GB VRAM)
- **Memory-Efficient**: Uses QLoRA (4-bit quantization) for efficient training
- **GCS Integration**: Seamless integration with Google Cloud Storage for models
  and data
- **Flexible Training**: Support for various training data formats
- **Production-Ready**: Automatic cleanup, error handling, and monitoring
- **Cost-Effective**: Pay only for execution time, scales to zero when not
  running
- **Weights & Biases**: Optional experiment tracking and monitoring

## Architecture

```
┌─────────────────────┐
│   Training Data     │
│   (GCS Bucket)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Base Model        │
│ (GCS or HF Hub)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Cloud Run Job      │
│  (L4 GPU)           │
│  - Load data        │
│  - Fine-tune        │
│  - QLoRA/LoRA       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Fine-tuned Model   │
│  (GCS Bucket)       │
│  - Adapter weights  │
│  - Merged model     │
└─────────────────────┘
```

## Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Docker** installed locally
3. **gcloud CLI** configured and authenticated
4. **GCS Bucket** for storing models and data

## Quick Start

### 1. Deploy the Service

```bash
cd fine-tune-service

# Set your GCP project ID
export PROJECT_ID="your-project-id"
export BUCKET_NAME="your-bucket-name"  # Optional, defaults to {PROJECT_ID}-models

# Deploy
./deploy.sh
```

This will:

- Enable required GCP APIs
- Create Artifact Registry repository
- Build and push Docker image
- Create Cloud Run Job with L4 GPU

### 2. Prepare Training Data

Create a JSONL file with your training data. The service supports three formats:

**Format 1: Plain Text**

```jsonl
{"text": "Your training text here..."}
{"text": "Another training example..."}
```

**Format 2: Chat Messages**

```jsonl
{"messages": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]}
{"messages": [{"role": "user", "content": "How are you?"}, {"role": "assistant", "content": "I'm doing well!"}]}
```

**Format 3: Instruction-Following**

```jsonl
{"instruction": "Translate to French", "output": "Bonjour"}
{"instruction": "Summarize this", "output": "Summary..."}
```

Upload to GCS:

```bash
gsutil cp training_data.jsonl gs://${BUCKET_NAME}/training-data/my-dataset.jsonl
```

### 3. Run Fine-Tuning Job

**Using a HuggingFace Hub model:**

```bash
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=google/gemma-2-2b" \
    --args="--output-model-name=my-finetuned-gemma" \
    --args="--training-data-path=training-data/my-dataset.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--num-train-epochs=3" \
    --args="--learning-rate=2e-4"
```

**Using a GCS-hosted base model:**

```bash
# First, upload base model to GCS
gsutil -m cp -r /path/to/base-model gs://${BUCKET_NAME}/base-models/gemma-2-2b/

# Then run fine-tuning
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=gemma-2-2b" \
    --args="--gcs-base-model-path=base-models/gemma-2-2b" \
    --args="--output-model-name=my-finetuned-gemma" \
    --args="--training-data-path=training-data/my-dataset.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}"
```

### 4. Monitor Progress

```bash
# List executions
gcloud run jobs executions list --job=finetune-job --region=europe-west1

# View logs (replace EXECUTION_NAME with actual execution name from above)
gcloud run jobs executions logs read EXECUTION_NAME --region=europe-west1 --follow
```

### 5. Use Fine-Tuned Model

After training completes, the model is saved to GCS:

- `gs://{BUCKET_NAME}/models/{output-model-name}/adapter/` - LoRA adapter
  weights only
- `gs://{BUCKET_NAME}/models/{output-model-name}/merged/` - Full model with
  merged weights

Use with the inference service:

```bash
# The merged model is ready to use with the inference service
# Just reference it by name: my-finetuned-gemma
```

## Configuration Options

### Model Arguments

| Argument                | Description                       | Default  |
| ----------------------- | --------------------------------- | -------- |
| `--base-model`          | HuggingFace model ID              | Required |
| `--output-model-name`   | Name for fine-tuned model         | Required |
| `--gcs-base-model-path` | GCS path to base model (optional) | None     |

### Training Data

| Argument               | Description                       | Default  |
| ---------------------- | --------------------------------- | -------- |
| `--training-data-path` | GCS path to training data (JSONL) | Required |
| `--gcs-bucket`         | GCS bucket name                   | Required |
| `--max-seq-length`     | Maximum sequence length           | 512      |

### LoRA Parameters

| Argument         | Description                          | Default |
| ---------------- | ------------------------------------ | ------- |
| `--lora-r`       | LoRA rank (higher = more parameters) | 16      |
| `--lora-alpha`   | LoRA alpha (scaling factor)          | 32      |
| `--lora-dropout` | LoRA dropout rate                    | 0.05    |

### Training Parameters

| Argument                        | Description            | Default |
| ------------------------------- | ---------------------- | ------- |
| `--learning-rate`               | Learning rate          | 2e-4    |
| `--num-train-epochs`            | Number of epochs       | 3       |
| `--per-device-train-batch-size` | Batch size per GPU     | 4       |
| `--gradient-accumulation-steps` | Gradient accumulation  | 4       |
| `--warmup-steps`                | Number of warmup steps | 100     |

### Quantization

| Argument            | Description                    | Default |
| ------------------- | ------------------------------ | ------- |
| `--use-4bit`        | Use 4-bit quantization (QLoRA) | True    |
| `--use-8bit`        | Use 8-bit quantization         | False   |
| `--no-quantization` | Disable quantization           | False   |

### Precision

| Argument | Description              | Default |
| -------- | ------------------------ | ------- |
| `--bf16` | Use BF16 mixed precision | True    |
| `--fp16` | Use FP16 mixed precision | False   |

### Monitoring

| Argument           | Description                     | Default |
| ------------------ | ------------------------------- | ------- |
| `--use-wandb`      | Enable Weights & Biases logging | False   |
| `--wandb-project`  | W&B project name                | None    |
| `--wandb-run-name` | W&B run name                    | None    |

## Example Use Cases

### 1. Quick Fine-Tune (Small Dataset)

```bash
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=google/gemma-2-2b" \
    --args="--output-model-name=quick-test" \
    --args="--training-data-path=training-data/small.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--num-train-epochs=1"
```

### 2. High-Quality Fine-Tune (Larger Dataset)

```bash
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=google/gemma-2-2b" \
    --args="--output-model-name=high-quality-model" \
    --args="--training-data-path=training-data/large.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--num-train-epochs=5" \
    --args="--lora-r=32" \
    --args="--lora-alpha=64" \
    --args="--per-device-train-batch-size=2" \
    --args="--gradient-accumulation-steps=8"
```

### 3. Long Context Fine-Tune

```bash
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=google/gemma-2-2b" \
    --args="--output-model-name=long-context-model" \
    --args="--training-data-path=training-data/dataset.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--max-seq-length=2048" \
    --args="--per-device-train-batch-size=1" \
    --args="--gradient-accumulation-steps=16"
```

### 4. With W&B Monitoring

```bash
gcloud run jobs execute finetune-job \
    --region=europe-west1 \
    --args="--base-model=google/gemma-2-2b" \
    --args="--output-model-name=monitored-model" \
    --args="--training-data-path=training-data/dataset.jsonl" \
    --args="--gcs-bucket=${BUCKET_NAME}" \
    --args="--use-wandb" \
    --args="--wandb-project=gemma-experiments" \
    --args="--wandb-run-name=experiment-1" \
    --set-env-vars="WANDB_API_KEY=your-wandb-key"
```

## Cost Estimation

**GPU Costs (NVIDIA L4):**

- ~$0.80/hour for L4 GPU
- Typical fine-tuning: 30-60 minutes
- Estimated cost per job: $0.40 - $0.80

**Storage Costs:**

- Training data: Minimal (usually < 1GB)
- Base model: $0.02/GB/month (cached)
- Fine-tuned model: ~$0.10-0.20/month for adapter weights

**Total estimated cost per fine-tuning job: $0.50 - $1.00**

## Troubleshooting

### Out of Memory (OOM) Errors

If you encounter OOM errors, try:

1. **Reduce batch size:**

```bash
--args="--per-device-train-batch-size=2"
```

2. **Increase gradient accumulation:**

```bash
--args="--gradient-accumulation-steps=8"
```

3. **Reduce sequence length:**

```bash
--args="--max-seq-length=256"
```

4. **Reduce LoRA rank:**

```bash
--args="--lora-r=8"
```

### Job Timeout

If jobs timeout, increase the timeout in `deploy.sh`:

```bash
TIMEOUT="${TIMEOUT:-7200}"  # 2 hours
```

### Slow Training

To speed up training:

- Increase batch size (if memory allows)
- Reduce gradient accumulation steps
- Use larger GPU (A100 for faster training)

## Advanced Topics

### Custom Training Data Preprocessing

Edit [fine_tune_job.py](fine_tune_job.py:238) to customize data preprocessing:

```python
def tokenize_function(examples):
    # Your custom preprocessing here
    pass
```

### Multi-GPU Training

To use multiple GPUs, update the deployment script:

```bash
GPU_COUNT="${GPU_COUNT:-2}"
```

Note: Multi-GPU support requires additional configuration in the training
script.

### Using Different Models

The service works with any causal language model from HuggingFace:

- `google/gemma-2-2b`
- `google/gemma-2-9b`
- `meta-llama/Llama-2-7b-hf`
- Any other compatible model

## Integration with Inference Service

After fine-tuning, deploy to the inference service:

```bash
cd ../inference-service

# The inference service will automatically load from GCS
# Just use the model name in your API calls
```

Example API call:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-inference-service-url/v1",
    api_key="dummy"
)

response = client.chat.completions.create(
    model="my-finetuned-gemma",  # Your fine-tuned model name
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
```

## Directory Structure

```
fine-tune-service/
├── fine_tune_job.py    # Main training script
├── requirements.txt    # Python dependencies
├── Dockerfile          # Container image
├── deploy.sh          # Deployment script
└── README.md          # This file
```

## Security Best Practices

1. **Service Account**: Use a dedicated service account with minimal permissions
2. **Secrets**: Use Secret Manager for sensitive data (W&B keys, etc.)
3. **Network**: Configure VPC if needed for private access
4. **IAM**: Follow principle of least privilege

## Monitoring and Logging

### View Logs in Cloud Console

https://console.cloud.google.com/run/jobs/details/europe-west1/finetune-job

### Programmatic Log Access

```python
from google.cloud import logging

client = logging.Client()
logger = client.logger('run.googleapis.com/stdout')

for entry in logger.list_entries():
    print(entry.payload)
```

## Support

For issues or questions:

1. Check Cloud Run logs for error messages
2. Verify GCS paths and permissions
3. Ensure training data format is correct
4. Review GPU memory requirements

## License

This service is part of the ModelSmith project.
