# OpenAI-Compatible Inference Service

A production-ready inference service for serving fine-tuned language models from
Google Cloud Storage. Optimized for Google Cloud Run with GPU support and
compatible with OpenAI's API specification.

## Features

- **OpenAI API Compatible**: Drop-in replacement for OpenAI's chat and
  completion endpoints
- **Cloud Storage Integration**: Automatically loads models from Google Cloud
  Storage
- **GPU Optimized**: Supports NVIDIA CUDA, Apple Silicon MPS, and CPU inference
- **Streaming Support**: Real-time token streaming for better UX
- **Smart Caching**: LRU model caching with configurable limits
- **Production Ready**: Comprehensive logging, error handling, and health checks
- **Clean Architecture**: Modular design with clear separation of concerns

## Architecture

```
inference-service/
├── src/                          # Main package
│   ├── __init__.py
│   ├── __main__.py              # Module entry point
│   ├── config.py                # Configuration management
│   ├── models/                  # Pydantic models
│   │   ├── __init__.py
│   │   ├── requests.py         # Request models
│   │   └── responses.py        # Response models
│   ├── core/                    # Core business logic
│   │   ├── __init__.py
│   │   ├── model_manager.py   # Model loading/caching
│   │   └── inference_engine.py # Inference logic
│   ├── utils/                   # Utilities
│   │   ├── __init__.py
│   │   ├── logging.py          # Logging setup
│   │   └── stopping_criteria.py # Custom stopping criteria
│   └── api/                     # API routes
│       ├── __init__.py
│       ├── app.py              # FastAPI app setup
│       ├── health.py           # Health/info endpoints
│       ├── completions.py      # Completion endpoints
│       └── admin.py            # Admin endpoints
├── inference-server.py          # Entry point (backward compatibility)
├── requirements.txt
└── README.md
```

## Installation

1. Clone the repository:

```bash
cd inference-service
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up environment variables (create a `.env` file):

```env
# Required
GCS_BUCKET=your-models-bucket
GCS_MODEL_PREFIX=models/

# Optional - defaults shown
LOCAL_MODEL_CACHE=/tmp/model_cache
MAX_CACHED_MODELS=2
MAX_CONCURRENT_REQUESTS=50
REQUEST_TIMEOUT=300
DEFAULT_MAX_TOKENS=512
DEFAULT_TEMPERATURE=0.7

# For local development
LOCAL_DEV=true
PORT=8080
```

## Usage

### Running the Server

**Option 1: Direct script execution**

```bash
python inference-server.py
```

**Option 2: Run as module**

```bash
python -m src
```

The server will start on `http://0.0.0.0:8080` (or the port specified in the
`PORT` environment variable).

### API Endpoints

#### Chat Completions (OpenAI Compatible)

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 512,
    "stream": false
  }'
```

#### Text Completions (OpenAI Compatible)

```bash
curl -X POST http://localhost:8080/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "prompt": "Once upon a time",
    "temperature": 0.7,
    "max_tokens": 512
  }'
```

#### Streaming

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
```

#### Health Check

```bash
curl http://localhost:8080/health
```

#### List Models

```bash
curl http://localhost:8080/v1/models
```

#### Admin: Unload Model

```bash
curl -X POST http://localhost:8080/admin/unload/your-model-name
```

#### Admin: Get Stats

```bash
curl http://localhost:8080/admin/stats
```

## Configuration

### Environment Variables

| Variable                  | Description                                | Default              |
| ------------------------- | ------------------------------------------ | -------------------- |
| `GCS_BUCKET`              | Google Cloud Storage bucket name           | `your-models-bucket` |
| `GCS_MODEL_PREFIX`        | Prefix for model paths in GCS              | `models/`            |
| `LOCAL_MODEL_CACHE`       | Local cache directory for models           | `/tmp/model_cache`   |
| `MAX_CACHED_MODELS`       | Maximum number of models to keep in memory | `2`                  |
| `MAX_CONCURRENT_REQUESTS` | Maximum concurrent inference requests      | `50`                 |
| `REQUEST_TIMEOUT`         | Request timeout in seconds                 | `300`                |
| `DEFAULT_MAX_TOKENS`      | Default max tokens for generation          | `512`                |
| `DEFAULT_TEMPERATURE`     | Default temperature for generation         | `0.7`                |
| `LOCAL_DEV`               | Enable local development mode              | `false`              |
| `PORT`                    | Server port                                | `8080`               |

### Device Selection

The service automatically detects the best available device:

1. **NVIDIA GPU** (CUDA): Uses `float16` for optimal performance
2. **Apple Silicon** (MPS): Uses `float32` for numerical stability
3. **CPU**: Uses `float32`, with optional 8-bit quantization for local
   development

## Model Storage in GCS

Models should be stored in Google Cloud Storage with the following structure:

```
gs://your-models-bucket/
└── models/
    └── your-model-name/
        ├── config.json
        ├── tokenizer_config.json
        ├── tokenizer.json
        ├── special_tokens_map.json
        ├── pytorch_model.bin (or model.safetensors)
        └── ... (other model files)
```

**Note**: Model names with slashes (e.g., `org/model-name`) are automatically
converted to hyphens (e.g., `org-model-name`) for GCS compatibility.

## Development

### Project Structure Principles

- **`src/config.py`**: Centralized configuration management
- **`src/models/`**: Pydantic models for API validation
- **`src/core/`**: Business logic (model management, inference)
- **`src/utils/`**: Reusable utilities
- **`src/api/`**: API routes and application setup

### Adding New Features

1. **New API endpoint**: Add to appropriate router in `src/api/`
2. **New model**: Add to `src/models/requests.py` or `responses.py`
3. **New configuration**: Add to `src/config.py`
4. **New utility**: Add to `src/utils/`

### Running Tests

```bash
# Example: Test the health endpoint
curl http://localhost:8080/health

# Example: Test model loading
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "test-model",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10
  }'
```

## Deployment

### Google Cloud Run

1. Build and push container:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/inference-service
```

2. Deploy to Cloud Run:

```bash
gcloud run deploy inference-service \
  --image gcr.io/YOUR_PROJECT/inference-service \
  --platform managed \
  --region europe-west1 \
  --memory 16Gi \
  --cpu 4 \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --set-env-vars GCS_BUCKET=your-models-bucket \
  --timeout 300 \
  --concurrency 50
```

### Docker

Create a `Dockerfile`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "inference-server.py"]
```

Build and run:

```bash
docker build -t inference-service .
docker run -p 8080:8080 --env-file .env inference-service
```

## Performance Optimization

### Model Caching

- Models are cached in memory using LRU eviction
- Adjust `MAX_CACHED_MODELS` based on available memory
- Use `POST /admin/unload/{model_id}` to manually free memory

### Concurrent Requests

- Controlled by `MAX_CONCURRENT_REQUESTS` environment variable
- In local dev mode, defaults to 1 for resource constraints
- For production with GPU, increase to 50+ based on your hardware

### GPU Memory

- CUDA: Automatically uses `device_map="auto"` for multi-GPU
- Memory is cleared when models are evicted or unloaded
- Monitor with `GET /admin/stats`

## Troubleshooting

### Model Not Found

- Verify model exists in GCS: `gsutil ls gs://your-bucket/models/your-model/`
- Check `GCS_BUCKET` and `GCS_MODEL_PREFIX` environment variables
- Ensure proper authentication for GCS access

### Out of Memory

- Reduce `MAX_CACHED_MODELS`
- Use smaller models
- Enable 8-bit quantization for CPU inference (local dev mode)
- Unload unused models: `POST /admin/unload/{model_id}`

### Slow Inference

- Verify GPU is being used: check `/health` endpoint
- Reduce `max_tokens` in requests
- Use streaming for better perceived performance
- Check concurrent request limits

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Support

[Add support information here]
