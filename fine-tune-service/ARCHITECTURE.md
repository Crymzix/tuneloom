# Fine-Tune Service Architecture

This document describes the architecture and design principles of the refactored fine-tune service.

## Overview

The fine-tune service has been refactored from a monolithic 675-line file into a clean, modular architecture with clear separation of concerns. This makes the codebase more maintainable, testable, and production-ready for open source release.

## Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Testability**: Components can be tested in isolation with clear interfaces
3. **Type Safety**: Extensive use of type hints and immutable dataclasses
4. **Error Handling**: Proper exception handling and logging throughout
5. **Configuration as Data**: Configuration is separated from logic using dataclasses
6. **Dependency Injection**: Components receive dependencies through constructors

## Module Structure

```
fine-tune-service/
├── __init__.py              # Package exports and version
├── __main__.py              # CLI entry point
├── config.py                # Configuration dataclasses
├── storage.py               # GCS storage operations
├── job_tracker.py           # Firestore job status tracking
├── model_manager.py         # Model loading & LoRA setup
├── data_manager.py          # Training data operations
├── trainer.py               # Training execution
└── fine_tune_job.py         # Main orchestrator
```

## Component Responsibilities

### config.py
**Purpose**: Configuration management

Contains immutable dataclasses for all configuration:
- `QuantizationConfig`: 4-bit/8-bit quantization settings
- `LoRAConfig`: LoRA hyperparameters
- `TrainingConfig`: Training hyperparameters
- `JobConfig`: Job metadata and paths
- `FineTuneJobConfig`: Complete configuration container

**Key Features**:
- Validation in `__post_init__` methods
- Computed properties for derived values
- Immutable (frozen) for safety
- Type-safe with full type hints

### storage.py
**Purpose**: Google Cloud Storage abstraction

`GCSStorageManager` handles all GCS operations:
- Download files and directories from GCS
- Upload files and directories to GCS
- Check blob existence
- Generate GCS URIs

**Key Features**:
- Clean abstraction over GCS API
- Proper error handling with FileNotFoundError
- Comprehensive logging
- Single responsibility (storage only)

### job_tracker.py
**Purpose**: Job status tracking

`FirestoreJobTracker` manages Firestore integration:
- Update job status and progress
- Store error messages and metadata
- Convenience methods: `mark_running()`, `mark_completed()`, `mark_failed()`
- Gracefully handles disabled tracking (no job_id)

**Key Features**:
- Non-blocking (failures don't stop the job)
- Clean status lifecycle management
- Progress validation (0.0 to 1.0)
- Timestamp management

### model_manager.py
**Purpose**: Model loading and LoRA configuration

`ModelManager` handles:
- Loading models from GCS or HuggingFace Hub
- Tokenizer configuration
- Quantization setup (4-bit/8-bit)
- LoRA configuration creation

**Key Features**:
- Intelligent model path resolution (GCS → HuggingFace fallback)
- Proper tokenizer padding configuration
- Clean quantization abstractions
- Separation of concerns (model loading only)

### data_manager.py
**Purpose**: Training data management

`DataManager` handles:
- Downloading training data from GCS
- Loading datasets with HuggingFace datasets library
- Formatting data for different input formats
- Train/test splitting

**Key Features**:
- Support for multiple data formats (text, messages, instruction, input/output)
- Chat template application for conversational data
- Configurable train/test split
- Clear error messages for unsupported formats

### trainer.py
**Purpose**: Model training execution

`ModelTrainer` handles:
- Training loop execution with SFTTrainer
- Saving adapter models
- Merging and saving full models
- Uploading trained models to GCS

**Key Features**:
- Clean SFTConfig creation from TrainingConfig
- Separate adapter and merged model outputs
- Training configuration serialization
- Comprehensive logging

### fine_tune_job.py
**Purpose**: Orchestration

`FineTuneJob` coordinates all components:
- Initializes all managers with proper dependencies
- Executes the complete pipeline
- Handles errors and cleanup
- Provides high-level job lifecycle management

**Key Features**:
- Clean orchestration without business logic
- Proper error propagation
- Automatic cleanup
- Progress tracking throughout pipeline

### __main__.py
**Purpose**: CLI entry point

Provides command-line interface:
- Argument parsing with argparse
- Configuration creation from CLI arguments
- Job execution
- Exit code handling

**Key Features**:
- Organized argument groups
- Default value handling
- Configuration validation
- Clean separation from business logic

## Data Flow

```
User → CLI (__main__.py)
         ↓
    Configuration (config.py)
         ↓
    FineTuneJob (fine_tune_job.py) ← Orchestrator
         ↓
    ┌────┴────┬────────┬────────┬────────┐
    ↓         ↓        ↓        ↓        ↓
Storage  JobTracker  Model   Data   Trainer
Manager              Manager Manager
```

## Usage Patterns

### As a Package
```python
from fine_tune_service import FineTuneJob, FineTuneJobConfig
from fine_tune_service.config import JobConfig

config = FineTuneJobConfig(
    job=JobConfig(
        base_model="google/gemma-2-2b",
        output_model_name="my-model",
        training_data_path="data/train.jsonl",
        gcs_bucket="my-bucket",
    )
)

job = FineTuneJob(config)
job.run()
```

### As a CLI
```bash
python -m fine-tune-service \
  --base-model google/gemma-2-2b \
  --output-model-name my-model \
  --training-data-path data/train.jsonl \
  --gcs-bucket my-bucket
```

### Individual Components
```python
from fine_tune_service import GCSStorageManager

storage = GCSStorageManager("my-bucket")
storage.download_file("models/gemma-2-2b/config.json", Path("./config.json"))
```

## Testing Strategy

The modular architecture enables comprehensive testing:

1. **Unit Tests**: Test each component in isolation
   - Mock GCS/Firestore clients
   - Test configuration validation
   - Test data formatting logic

2. **Integration Tests**: Test component interactions
   - Storage → Model Manager
   - Data Manager → Trainer
   - End-to-end pipeline

3. **Mocking**: Clean interfaces make mocking easy
   - `GCSStorageManager` can be mocked for model tests
   - `FirestoreJobTracker` can be disabled for local testing

## Production Readiness Checklist

- ✅ Clear separation of concerns
- ✅ Type hints throughout
- ✅ Comprehensive logging
- ✅ Error handling and cleanup
- ✅ Configuration validation
- ✅ Immutable configurations
- ✅ Documentation and docstrings
- ✅ Package structure with __init__.py
- ✅ CLI entry point
- ✅ Dockerfile updated for new structure

## Migration from Old Code

The old monolithic `fine_tune_job.py` has been split into:

| Old Code | New Module | Responsibility |
|----------|------------|----------------|
| `__init__` params | `config.py` | Configuration |
| `download_from_gcs()` | `storage.py` | GCS operations |
| `upload_to_gcs()` | `storage.py` | GCS operations |
| `update_job_status()` | `job_tracker.py` | Firestore tracking |
| `load_base_model()` | `model_manager.py` | Model loading |
| `setup_lora()` | `model_manager.py` | LoRA config |
| `load_training_data()` | `data_manager.py` | Data loading |
| `train()` | `trainer.py` | Training |
| `save_model()` | `trainer.py` | Model saving |
| `run()` | `fine_tune_job.py` | Orchestration |
| `main()` | `__main__.py` | CLI entry |

## Benefits of New Architecture

1. **Maintainability**: Changes to one component don't affect others
2. **Testability**: Each component can be tested independently
3. **Readability**: Clear module names and responsibilities
4. **Reusability**: Components can be used in other projects
5. **Scalability**: Easy to add new features or swap implementations
6. **Documentation**: Clear structure makes documentation easier
7. **Onboarding**: New developers can understand components individually
8. **Open Source Ready**: Professional structure suitable for public release

## Future Enhancements

Potential improvements enabled by this architecture:

1. **Alternative Storage Backends**: Swap GCS for S3, Azure Blob, etc.
2. **Alternative Tracking**: Replace Firestore with other databases
3. **Multiple Training Frameworks**: Support different training libraries
4. **Plugin System**: Easy to add new data formats or model types
5. **Advanced Testing**: Comprehensive test suite with mocks
6. **Performance Monitoring**: Add metrics collection components
7. **Distributed Training**: Extend trainer for multi-GPU setups
