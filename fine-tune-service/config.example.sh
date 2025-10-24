#!/bin/bash
# Example configuration file for fine-tuning jobs
# Copy this file to config.sh and customize for your needs
# Usage: source config.sh && ./run_example.sh

# ============================================================================
# GCP Configuration
# ============================================================================
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export BUCKET_NAME="${PROJECT_ID}-models"

# ============================================================================
# Model Configuration
# ============================================================================

# Base model - choose from:
# - google/gemma-2-2b (2B parameters, recommended for most tasks)
# - google/gemma-2-9b (9B parameters, higher quality but slower)
# - google/gemma-2-27b (27B parameters, highest quality)
export BASE_MODEL="google/gemma-3-270m"

# Output model name (will be saved to GCS)
export OUTPUT_MODEL_NAME="my-finetuned-model"

# Training data path in GCS (relative to bucket)
export TRAINING_DATA_PATH="training-data/my-dataset.jsonl"

# ============================================================================
# Training Hyperparameters
# ============================================================================

# Number of training epochs (1-10, typical: 3-5)
export NUM_EPOCHS=3

# Learning rate (1e-5 to 5e-4, typical: 2e-4)
export LEARNING_RATE=2e-4

# ============================================================================
# LoRA Configuration
# ============================================================================

# LoRA rank (4-64, typical: 8-32)
# Higher rank = more trainable parameters = better quality but more memory
export LORA_R=16

# LoRA alpha (usually 2x the rank)
export LORA_ALPHA=32

# LoRA dropout (0.0-0.2, typical: 0.05)
export LORA_DROPOUT=0.05

# ============================================================================
# Batch Size and Memory
# ============================================================================

# Batch size per GPU (1-8, typical: 4 for L4)
# Reduce if you get OOM errors
export BATCH_SIZE=4

# Gradient accumulation steps (1-16, typical: 4-8)
# Effective batch size = BATCH_SIZE * GRAD_ACCUM
export GRAD_ACCUM=4

# Maximum sequence length (128-2048, typical: 512)
# Longer sequences use more memory
export MAX_SEQ_LENGTH=512

# ============================================================================
# Advanced Options
# ============================================================================

# Quantization (4bit, 8bit, or none)
# 4bit = QLoRA (most memory efficient, recommended)
# 8bit = LoRA with 8-bit quantization
# none = Full precision (requires more VRAM)
export QUANTIZATION="4bit"

# Warmup steps (0-500, typical: 100)
export WARMUP_STEPS=100

# Logging frequency
export LOGGING_STEPS=10

# Checkpoint save frequency
export SAVE_STEPS=100

# ============================================================================
# Weights & Biases (Optional)
# ============================================================================

# Enable W&B logging
export USE_WANDB=false

# W&B project name
export WANDB_PROJECT="gemma-finetune"

# W&B run name (optional, defaults to OUTPUT_MODEL_NAME)
export WANDB_RUN_NAME=""

# W&B API key (keep this secret!)
# export WANDB_API_KEY="your-wandb-api-key"

# ============================================================================
# GPU Configuration
# ============================================================================

# GPU type - options:
# - nvidia-l4 (24GB VRAM, ~$0.80/hour, recommended)
# - nvidia-tesla-t4 (16GB VRAM, ~$0.50/hour, budget option)
# - nvidia-a100 (40GB VRAM, ~$3.50/hour, fastest)
export GPU_TYPE="nvidia-l4"

# Job timeout in seconds (1800-7200, typical: 3600 = 1 hour)
export TIMEOUT=3600

# ============================================================================
# Notes
# ============================================================================

# Memory optimization tips:
# - Reduce BATCH_SIZE if OOM
# - Increase GRAD_ACCUM to maintain effective batch size
# - Reduce MAX_SEQ_LENGTH for long sequences
# - Use 4bit quantization
# - Reduce LORA_R

# Quality improvement tips:
# - Increase NUM_EPOCHS (but watch for overfitting)
# - Increase LORA_R and LORA_ALPHA
# - Tune LEARNING_RATE (try 1e-4, 2e-4, 5e-4)
# - Use more training data
# - Increase MAX_SEQ_LENGTH for context

# Speed optimization tips:
# - Use nvidia-a100 GPU
# - Increase BATCH_SIZE (if memory allows)
# - Reduce GRAD_ACCUM
# - Reduce SAVE_STEPS and LOGGING_STEPS
