# Architecture Documentation

## Overview

This document describes the architecture of the OpenAI-Compatible Inference Service after the reorganization for production readiness and open-source distribution.

## Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Modularity**: Code is organized into packages that can be independently tested and maintained
3. **Testability**: Clear interfaces and dependency injection make testing easier
4. **Extensibility**: New features can be added without modifying existing code
5. **Production Ready**: Comprehensive error handling, logging, and monitoring

## Directory Structure

```
inference-service/
├── src/                          # Main application package
│   ├── __init__.py              # Package initialization
│   ├── __main__.py              # Module entry point
│   ├── config.py                # Configuration management
│   │
│   ├── models/                  # Data models (Pydantic)
│   │   ├── __init__.py
│   │   ├── requests.py         # API request models
│   │   └── responses.py        # API response models
│   │
│   ├── core/                    # Core business logic
│   │   ├── __init__.py
│   │   ├── model_manager.py   # Model loading, caching, lifecycle
│   │   └── inference_engine.py # Text generation, streaming
│   │
│   ├── utils/                   # Utilities and helpers
│   │   ├── __init__.py
│   │   ├── logging.py          # Logging configuration
│   │   └── stopping_criteria.py # Custom generation stopping logic
│   │
│   └── api/                     # API layer (FastAPI)
│       ├── __init__.py
│       ├── app.py              # Application factory
│       ├── health.py           # Health check endpoints
│       ├── completions.py      # Completion endpoints
│       └── admin.py            # Admin/management endpoints
│
├── inference-server.py          # Backward-compatible entry point
├── requirements.txt             # Python dependencies
├── README.md                    # User documentation
└── ARCHITECTURE.md              # This file

```

## Module Responsibilities

### Configuration (`src/config.py`)

**Responsibility**: Centralized configuration management

**Key Features**:
- Environment variable parsing with defaults
- Device detection (CUDA, MPS, CPU)
- Environment-specific settings (local vs. production)
- Type-safe configuration access

**Dependencies**: None (leaf module)

### Models (`src/models/`)

**Responsibility**: Data validation and serialization

**Key Components**:
- `requests.py`: Request models (ChatCompletionRequest, CompletionRequest, Message)
- `responses.py`: Response models (ChatCompletionResponse, Usage, Choice, etc.)

**Key Features**:
- Pydantic models for automatic validation
- OpenAI API compatibility
- Type safety and documentation

**Dependencies**: Pydantic

### Core Business Logic (`src/core/`)

#### Model Manager (`src/core/model_manager.py`)

**Responsibility**: Model lifecycle management

**Key Features**:
- GCS model downloading with retry logic
- LRU caching with configurable limits
- Thread-safe model loading with locks
- Tokenizer configuration and defaults
- Device-specific optimization (CUDA, MPS, CPU)
- Memory management and cleanup

**Key Methods**:
- `load_model(model_id)`: Load or retrieve cached model
- `unload_model(model_id)`: Manually remove model from cache
- `list_loaded_models()`: Get currently loaded models

**Dependencies**:
- PyTorch, Transformers
- Google Cloud Storage client
- Config

#### Inference Engine (`src/core/inference_engine.py`)

**Responsibility**: Text generation and streaming

**Key Features**:
- Chat and text completion generation
- Streaming support with SSE (Server-Sent Events)
- Custom stopping criteria
- Concurrent request limiting with semaphores
- Stop sequence handling
- Temperature and sampling parameter management

**Key Methods**:
- `generate(request)`: Chat completion (streaming or non-streaming)
- `complete(request)`: Text completion (streaming or non-streaming)
- `generate_stream()`: Streaming response generator
- `generate_completion_stream()`: Text completion streaming

**Dependencies**:
- Model Manager
- Pydantic models
- PyTorch, Transformers

### Utilities (`src/utils/`)

**Responsibility**: Reusable helper functions and classes

**Key Components**:
- `logging.py`: Logging setup and configuration
- `stopping_criteria.py`: Custom stopping criteria for generation

**Key Features**:
- Centralized logging configuration
- Token-based stopping logic for multi-turn prevention
- Reusable across different modules

### API Layer (`src/api/`)

**Responsibility**: HTTP API and routing

#### Application Factory (`src/api/app.py`)

**Key Features**:
- FastAPI application creation
- Dependency injection setup
- Lifespan management (startup/shutdown)
- Router registration

#### Routers

- **Health Router** (`health.py`): Health checks, service info, model listing
- **Completions Router** (`completions.py`): Chat and text completion endpoints
- **Admin Router** (`admin.py`): Administrative operations (stats, model unloading)

**Key Features**:
- OpenAI API compatibility
- Dependency injection for core components
- Clear endpoint organization

## Data Flow

### Model Loading Flow

```
API Request → Inference Engine → Model Manager → GCS Download → Local Cache → PyTorch Model
                                       ↓
                                   LRU Cache Check
                                       ↓
                                 Lock Acquisition
                                       ↓
                              Tokenizer Configuration
                                       ↓
                              Device Optimization
```

### Inference Flow (Non-Streaming)

```
HTTP Request → Pydantic Validation → Inference Engine → Model Manager (get model)
                                             ↓
                                      Prepare Prompt
                                             ↓
                                      Tokenization
                                             ↓
                                    Generation (PyTorch)
                                             ↓
                                       Decoding
                                             ↓
                                  Stop Sequence Removal
                                             ↓
                                    Response Assembly
                                             ↓
                                      HTTP Response
```

### Inference Flow (Streaming)

```
HTTP Request → Pydantic Validation → Inference Engine → Model Manager (get model)
                                             ↓
                                      Prepare Prompt
                                             ↓
                                      Tokenization
                                             ↓
                              Start Generation Thread
                                             ↓
                                   TextIteratorStreamer
                                             ↓
                              SSE Chunks (real-time) ────→ Client
                                             ↓
                                  Stop Sequence Detection
                                             ↓
                                      Final Chunk
                                             ↓
                                        [DONE]
```

## Key Design Patterns

### 1. Factory Pattern
- `create_app()` in `app.py` creates and configures the FastAPI application
- Allows for different configurations (testing, production, etc.)

### 2. Dependency Injection
- Routers receive dependencies (ModelManager, InferenceEngine) at creation time
- Makes testing easier and reduces coupling

### 3. Singleton Configuration
- Single `config` instance shared across modules
- Lazy initialization for GCS client in ModelManager

### 4. LRU Cache
- Least Recently Used eviction policy for models
- Access time tracking for intelligent eviction

### 5. Thread Pool for Streaming
- Separate thread for model generation during streaming
- Non-blocking main event loop

### 6. Semaphore for Concurrency Control
- Limits concurrent inference requests
- Prevents resource exhaustion

## Extension Points

### Adding a New API Endpoint

1. Create endpoint function in appropriate router file
2. Use dependency injection to access core components
3. Add to router in `app.py` if creating new router

Example:
```python
# In src/api/completions.py
@router.post("/v1/custom-endpoint")
async def custom_endpoint(request: CustomRequest):
    return await inference_engine.custom_method(request)
```

### Adding a New Configuration Option

1. Add to `Config` class in `config.py`
2. Access via `config.NEW_OPTION` in other modules

Example:
```python
# In src/config.py
class Config:
    NEW_OPTION = os.getenv("NEW_OPTION", "default")
```

### Adding Custom Model Loading Logic

1. Extend `ModelManager._load_model_to_device()` method
2. Add device-specific logic
3. Update configuration for new device type

### Adding Custom Stopping Criteria

1. Create new class in `utils/stopping_criteria.py`
2. Inherit from `StoppingCriteria`
3. Use in `InferenceEngine._prepare_generation_kwargs()`

## Testing Strategy

### Unit Tests
- Test individual functions in isolation
- Mock external dependencies (GCS, PyTorch)
- Focus on `utils/`, `models/`, and `config.py`

### Integration Tests
- Test component interactions
- Test API endpoints end-to-end
- Use test fixtures for models

### Load Tests
- Concurrent request handling
- Memory usage under load
- Model caching behavior

## Performance Considerations

### Memory Management
- LRU cache prevents unbounded memory growth
- Explicit GPU cache clearing on model eviction
- Configurable cache size for different environments

### Concurrency
- Semaphore limits concurrent requests
- Async/await for I/O operations
- Thread pool for CPU-intensive generation

### Optimization Opportunities
- Model quantization (8-bit for CPU)
- Flash Attention for long contexts
- Batch inference for multiple requests
- Model compilation (torch.compile)

## Security Considerations

### Input Validation
- Pydantic models validate all inputs
- Parameter bounds (temperature, max_tokens)
- Model ID sanitization for GCS paths

### Resource Limits
- Max concurrent requests
- Request timeout
- Model cache size

### Authentication
- TODO: Add authentication middleware
- TODO: API key validation
- TODO: Rate limiting per user

## Monitoring and Observability

### Logging
- Structured logging with timestamps
- Log levels (DEBUG, INFO, WARNING, ERROR)
- Request/response logging

### Health Checks
- `/health` endpoint for liveness
- `/admin/stats` for detailed metrics
- GPU memory usage tracking

### Metrics (Future)
- Request latency histograms
- Token throughput
- Cache hit rate
- Model load times

## Deployment

### Local Development
```bash
LOCAL_DEV=true python inference-server.py
```

### Production (Cloud Run)
```bash
gcloud run deploy --image gcr.io/PROJECT/inference-service
```

### Docker
```bash
docker build -t inference-service .
docker run -p 8080:8080 inference-service
```

## Migration from Monolithic Structure

The original single-file `inference-server.py` (1016 lines) has been refactored into:

- **17 focused modules** with clear responsibilities
- **Average ~200 lines per module** (vs. 1016 in monolith)
- **Improved testability** through dependency injection
- **Better IDE support** with explicit imports
- **Easier onboarding** for new contributors

### Backward Compatibility

The original `inference-server.py` is now a thin wrapper that imports from `src/`, ensuring existing deployment scripts continue to work.

## Future Enhancements

1. **Authentication**: Add API key validation and user management
2. **Rate Limiting**: Per-user request throttling
3. **Metrics**: Prometheus metrics export
4. **Batch Processing**: Process multiple requests in single forward pass
5. **Model Warmup**: Pre-load popular models on startup
6. **A/B Testing**: Support for model variants
7. **Caching**: Response caching for identical requests
8. **Distributed**: Multi-instance coordination for large models
