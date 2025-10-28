# Dockerfile for Fine-Tuning Gemma on Cloud Run with L4 GPU
# Optimized for NVIDIA L4 GPU with CUDA 12.1

FROM nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    git \
    wget \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create symbolic links for python
RUN ln -s /usr/bin/python3.10 /usr/bin/python

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA 12.1 support
# Using PyTorch 2.5.1 with CUDA 12.4 (compatible with CUDA 12.1 runtime)
RUN pip install --no-cache-dir \
    torch==2.5.1 \
    torchvision==0.20.1 \
    torchaudio==2.5.1 \
    --index-url https://download.pytorch.org/whl/cu124

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY __init__.py .
COPY __main__.py .
COPY config.py .
COPY storage.py .
COPY job_tracker.py .
COPY model_manager.py .
COPY data_manager.py .
COPY trainer.py .
COPY fine_tune_job.py .

# Set environment variables for optimal GPU performance
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
ENV TOKENIZERS_PARALLELISM=false

# Create cache directory
RUN mkdir -p /tmp/finetune

# Set HuggingFace cache to local directory
ENV HF_HOME=/tmp/finetune/hf_cache
ENV TRANSFORMERS_CACHE=/tmp/finetune/hf_cache
ENV HF_DATASETS_CACHE=/tmp/finetune/hf_cache

# Run as non-root user for security (Cloud Run requirement)
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /tmp/finetune
USER appuser

# Entry point - run as a module
ENTRYPOINT ["python", "-m", "__main__"]
