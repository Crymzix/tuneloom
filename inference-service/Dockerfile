# Dockerfile for Inference Service on Cloud Run with L4 GPU
# Optimized for NVIDIA L4 GPU with CUDA 12.1

FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

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
COPY inference-server.py .
COPY src/ ./src/

# Set environment variables for optimal GPU performance
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
ENV TOKENIZERS_PARALLELISM=false

# Set HuggingFace cache to local directory
ENV HF_HOME=/tmp/hf_cache
ENV TRANSFORMERS_CACHE=/tmp/hf_cache
ENV HF_DATASETS_CACHE=/tmp/hf_cache

# Create cache directories
RUN mkdir -p /tmp/hf_cache /tmp/model_cache

# Set model cache directory
ENV MODEL_CACHE_DIR=/tmp/model_cache

# Run as non-root user for security (Cloud Run requirement)
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /tmp
USER appuser

# Expose port
EXPOSE 8080

# Entry point - run the inference server
ENTRYPOINT ["python", "inference-server.py"]
