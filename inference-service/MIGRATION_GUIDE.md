# Migration Guide

## Overview

This guide helps you understand the reorganization of the inference service and
how to work with the new modular structure.

## What Changed?

### Before (Monolithic)

```
inference-service/
├── inference-server.py    # 1016 lines - everything in one file
├── requirements.txt
└── scripts/
```

### After (Modular)

```
inference-service/
├── src/                   # New modular package structure
│   ├── config.py
│   ├── models/
│   ├── core/
│   ├── utils/
│   └── api/
├── inference-server.py    # Now a thin wrapper (35 lines)
├── requirements.txt       # Unchanged
├── README.md              # Comprehensive documentation
├── ARCHITECTURE.md        # Architecture documentation
└── MIGRATION_GUIDE.md     # This file
```

## Benefits of the New Structure

1. **Better Organization**: Code is logically grouped by responsibility
2. **Easier Testing**: Isolated modules can be tested independently
3. **Improved Collaboration**: Multiple developers can work on different modules
4. **Better IDE Support**: Proper package structure enables better autocomplete
5. **Production Ready**: Professional structure suitable for open source
6. **Maintainability**: Changes are isolated to specific modules
7. **Documentation**: Clear separation makes it easier to document

## Module Mapping

Here's where everything from the original file moved to:

| Original Section         | New Location                     | Lines |
| ------------------------ | -------------------------------- | ----- |
| Configuration            | `src/config.py`                  | ~70   |
| StopOnTokens             | `src/utils/stopping_criteria.py` | ~50   |
| Pydantic Request Models  | `src/models/requests.py`         | ~30   |
| Pydantic Response Models | `src/models/responses.py`        | ~110  |
| ModelManager             | `src/core/model_manager.py`      | ~330  |
| InferenceEngine          | `src/core/inference_engine.py`   | ~500  |
| Health Endpoints         | `src/api/health.py`              | ~50   |
| Completion Endpoints     | `src/api/completions.py`         | ~30   |
| Admin Endpoints          | `src/api/admin.py`               | ~60   |
| App Setup                | `src/api/app.py`                 | ~70   |
| Logging Setup            | `src/utils/logging.py`           | ~30   |
| Main Entry               | `src/__main__.py`                | ~30   |
| Wrapper                  | `inference-server.py`            | ~35   |

## Running the Service

### No Changes Required!

The service runs exactly the same way as before:

```bash
# This still works
python inference-server.py
```

### New Option Available

You can now also run as a Python module:

```bash
# Alternative way to run
python -m src
```

Both methods are equivalent and will start the same service.

## API Compatibility

**100% backward compatible** - All API endpoints remain the same:

- `GET /` - Service info
- `GET /health` - Health check
- `GET /v1/models` - List models
- `POST /v1/chat/completions` - Chat completions
- `POST /v1/completions` - Text completions
- `POST /admin/unload/{model_id}` - Unload model
- `GET /admin/stats` - Statistics

## Environment Variables

No changes - all environment variables work exactly as before:

```env
GCS_BUCKET=your-models-bucket
GCS_MODEL_PREFIX=models/
LOCAL_MODEL_CACHE=/tmp/model_cache
MAX_CACHED_MODELS=2
MAX_CONCURRENT_REQUESTS=50
REQUEST_TIMEOUT=300
DEFAULT_MAX_TOKENS=512
DEFAULT_TEMPERATURE=0.7
LOCAL_DEV=true
PORT=8080
```

## Dependencies

No changes to `requirements.txt` - all dependencies remain the same.

## For Developers: Working with the New Structure

### Importing Modules

```python
# Configuration
from src.config import config

# Models
from src.models import ChatCompletionRequest, Message
from src.models.responses import ChatCompletionResponse

# Core components
from src.core import ModelManager, InferenceEngine

# Utils
from src.utils import get_logger, StopOnTokens

# API
from src.api import create_app
```

### Adding a New Feature

**Example: Add a new endpoint for model statistics**

1. **Create the endpoint** in the appropriate router:

```python
# src/api/admin.py
@router.get("/admin/model-stats/{model_id}")
async def get_model_stats(model_id: str):
    # Your implementation
    return {"model_id": model_id, "stats": {...}}
```

2. **No changes needed to `app.py`** - the router is already registered!

### Modifying Existing Logic

**Example: Change model loading behavior**

Edit `src/core/model_manager.py`:

```python
def _load_model_to_device(self, local_path: str) -> torch.nn.Module:
    # Add your custom logic here
    # The change is isolated to this one method
    pass
```

### Adding Configuration

**Example: Add a new config option**

1. Edit `src/config.py`:

```python
class Config:
    NEW_FEATURE_ENABLED = os.getenv("NEW_FEATURE_ENABLED", "false").lower() == "true"
```

2. Use it anywhere:

```python
from src.config import config

if config.NEW_FEATURE_ENABLED:
    # Do something
    pass
```

## Testing

### Unit Testing Individual Modules

```python
# test_config.py
import os
os.environ["GCS_BUCKET"] = "test-bucket"
from src.config import config

def test_config_loading():
    assert config.GCS_BUCKET == "test-bucket"
```

```python
# test_model_manager.py
from unittest.mock import Mock
from src.core.model_manager import ModelManager

def test_model_manager():
    manager = ModelManager()
    # Test in isolation
```

### Integration Testing

```python
# test_api.py
from fastapi.testclient import TestClient
from src.api.app import create_app

def test_health_endpoint():
    app = create_app()
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
```

## Common Tasks

### Task 1: Add Logging to a Module

```python
from src.utils import get_logger

logger = get_logger(__name__)

def my_function():
    logger.info("Starting my function")
    # Your code
    logger.debug("Debug information")
```

### Task 2: Access Configuration

```python
from src.config import config

def setup():
    bucket = config.GCS_BUCKET
    device = config.DEVICE
    is_local = config.IS_LOCAL
```

### Task 3: Create a New Model

```python
# src/models/requests.py
from pydantic import BaseModel

class CustomRequest(BaseModel):
    model: str
    custom_param: str
```

### Task 4: Use ModelManager

```python
from src.core import ModelManager

manager = ModelManager()
model_data = await manager.load_model("my-model")
model = model_data["model"]
tokenizer = model_data["tokenizer"]
```

## Deployment

### Docker (Unchanged)

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "inference-server.py"]
```

### Cloud Run (Unchanged)

```bash
gcloud builds submit --tag gcr.io/PROJECT/inference-service
gcloud run deploy inference-service --image gcr.io/PROJECT/inference-service
```

## Troubleshooting

### Import Errors

**Problem**: `ModuleNotFoundError: No module named 'src'`

**Solution**: Make sure you're running from the `inference-service` directory:

```bash
cd inference-service
python inference-server.py
```

### Configuration Not Loading

**Problem**: Environment variables not being read

**Solution**: The `.env` file is loaded automatically. Make sure it's in the
same directory as `inference-server.py`.

### Old Code Still Running

**Problem**: Changes not reflected when running

**Solution**:

1. Stop the server
2. Clear Python cache: `find . -type d -name __pycache__ -exec rm -rf {} +`
3. Restart the server

## Best Practices

### 1. Keep Modules Focused

Each module should have a single, clear responsibility.

### 2. Use Type Hints

All new code should include proper type hints:

```python
def process_model(model_id: str) -> dict:
    pass
```

### 3. Document Public APIs

Add docstrings to all public functions and classes:

```python
def load_model(self, model_id: str) -> dict:
    """
    Load model from GCS or cache.

    Args:
        model_id: Unique model identifier

    Returns:
        Dictionary with model and tokenizer
    """
```

### 4. Handle Errors Gracefully

Use appropriate exception handling:

```python
try:
    result = await operation()
except SpecificError as e:
    logger.error(f"Operation failed: {e}")
    raise HTTPException(status_code=500, detail=str(e))
```

### 5. Log Important Events

```python
logger.info("Model loaded successfully")
logger.warning("Cache limit reached, evicting LRU")
logger.error("Failed to download from GCS", exc_info=True)
```

## Rollback Plan

If you need to rollback to the original monolithic structure:

1. The original code is preserved in git history
2. Check out the previous commit:

```bash
git log --oneline  # Find the commit before reorganization
git checkout <commit-hash> inference-server.py
```

However, the new structure maintains 100% compatibility, so rollback should not
be necessary.

## Questions?

- Check [README.md](README.md) for usage documentation
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for design details
- Review the code - it's well-commented and organized!

## Summary

The reorganization:

- ✅ Maintains 100% backward compatibility
- ✅ Improves code organization and maintainability
- ✅ Makes testing easier
- ✅ Follows Python best practices
- ✅ Ready for open source contribution
- ✅ Production-ready structure

**No breaking changes** - everything works exactly as before, just better
organized!
