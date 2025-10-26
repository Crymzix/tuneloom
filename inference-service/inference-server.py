"""
Production OpenAI-Compatible Inference Service for Cloud Run
Loads models dynamically from Google Cloud Storage
Optimized for Cloud Run with GPU
"""

import os
import asyncio
import logging
from typing import Dict, List, Optional, Union, AsyncGenerator
from contextlib import asynccontextmanager
import uuid
import time

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer, StoppingCriteria, StoppingCriteriaList
from threading import Thread
import uvicorn
from dotenv import load_dotenv

# Load environment variables from .env file for local development
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

class Config:
    # GCS Configuration
    GCS_BUCKET = os.getenv("GCS_BUCKET", "your-models-bucket")
    GCS_MODEL_PREFIX = os.getenv("GCS_MODEL_PREFIX", "models/")
    
    # Model Cache Configuration
    LOCAL_MODEL_CACHE = os.getenv("LOCAL_MODEL_CACHE", "/tmp/model_cache")
    MAX_CACHED_MODELS = int(os.getenv("MAX_CACHED_MODELS", "2"))  # Cloud Run: keep small

    # Server Configuration - Cloud Run optimized
    MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "50"))
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "300"))

    # Override for local development
    @staticmethod
    def get_max_concurrent():
        if Config.IS_LOCAL:
            return 1  # Only 1 concurrent request for local testing
        return Config.MAX_CONCURRENT_REQUESTS

    @staticmethod
    def get_max_cached_models():
        if Config.IS_LOCAL:
            return 1  # Only keep 1 model in memory locally
        return Config.MAX_CACHED_MODELS
    
    # Model Configuration
    DEFAULT_MAX_TOKENS = int(os.getenv("DEFAULT_MAX_TOKENS", "512"))
    DEFAULT_TEMPERATURE = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))
    
    # GPU Configuration
    # Detect Apple Silicon MPS support for local testing
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        DEVICE = "mps"
        TORCH_DTYPE = torch.float32  # MPS has numerical issues with fp16, use fp32
    elif torch.cuda.is_available():
        DEVICE = "cuda"
        TORCH_DTYPE = torch.float16
    else:
        DEVICE = "cpu"
        TORCH_DTYPE = torch.float32

    # Local development optimizations
    IS_LOCAL = os.getenv("LOCAL_DEV", "false").lower() == "true"

config = Config()

# ============================================================================
# Custom Stopping Criteria
# ============================================================================

class StopOnTokens(StoppingCriteria):
    """Custom stopping criteria that stops generation when specific token sequences are encountered"""

    def __init__(self, stop_token_ids: List[List[int]], prompt_length: int):
        """
        Args:
            stop_token_ids: List of token ID sequences to stop on
            prompt_length: Length of the prompt tokens (to skip checking the prompt)
        """
        self.stop_token_ids = stop_token_ids
        self.prompt_length = prompt_length

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> bool:
        """Check if any stop sequence appears in the generated tokens"""
        # Only check the newly generated tokens (skip the prompt)
        generated_ids = input_ids[0, self.prompt_length:]

        # Check each stop sequence
        for stop_ids in self.stop_token_ids:
            stop_len = len(stop_ids)
            if len(generated_ids) >= stop_len:
                # Check if the last N tokens match the stop sequence
                if generated_ids[-stop_len:].tolist() == stop_ids:
                    return True

        return False

# ============================================================================
# Request/Response Models (OpenAI Compatible)
# ============================================================================

class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: bool = False
    top_p: float = Field(default=1.0, ge=0, le=1)
    stop: Optional[Union[str, List[str]]] = None

class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class Choice(BaseModel):
    index: int
    message: Message
    finish_reason: str

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Choice]
    usage: Usage

class StreamChoice(BaseModel):
    index: int
    delta: Dict[str, str]
    finish_reason: Optional[str] = None

class ChatCompletionChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    created: int
    model: str
    choices: List[StreamChoice]

class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str = "organization"

class ModelListResponse(BaseModel):
    object: str = "list"
    data: List[ModelInfo]

class CompletionRequest(BaseModel):
    model: str
    prompt: Union[str, List[str]]
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: bool = False
    top_p: float = Field(default=1.0, ge=0, le=1)
    stop: Optional[Union[str, List[str]]] = None

class CompletionChoice(BaseModel):
    index: int
    text: str
    finish_reason: str

class CompletionResponse(BaseModel):
    id: str
    object: str = "text_completion"
    created: int
    model: str
    choices: List[CompletionChoice]
    usage: Usage

class StreamCompletionChoice(BaseModel):
    index: int
    text: str
    finish_reason: Optional[str] = None

class CompletionChunk(BaseModel):
    id: str
    object: str = "text_completion.chunk"
    created: int
    model: str
    choices: List[StreamCompletionChoice]

# ============================================================================
# Model Manager
# ============================================================================

class ModelManager:
    def __init__(self):
        self.models: Dict[str, dict] = {}
        self.model_access_times: Dict[str, float] = {}
        self.loading_locks: Dict[str, asyncio.Lock] = {}
        self._ensure_cache_dir()
        
        # Initialize GCS client
        try:
            from google.cloud import storage
            self.gcs_client = storage.Client()
            self.bucket = self.gcs_client.bucket(config.GCS_BUCKET)
            logger.info(f"Connected to GCS bucket: {config.GCS_BUCKET}")
        except Exception as e:
            logger.error(f"GCS client initialization failed: {e}")
            raise RuntimeError(f"Cannot initialize GCS client: {e}")
    
    def _ensure_cache_dir(self):
        """Create cache directory if it doesn't exist"""
        os.makedirs(config.LOCAL_MODEL_CACHE, exist_ok=True)
    
    def _get_local_model_path(self, model_id: str) -> str:
        """Get local path for cached model"""
        return os.path.join(config.LOCAL_MODEL_CACHE, model_id.replace("/", "-"))
    
    def _get_gcs_model_path(self, model_id: str) -> str:
        """Get GCS path for model - convert slashes to hyphens for GCS storage"""
        formatted_model_id = model_id.replace("/", "-")
        return f"{config.GCS_MODEL_PREFIX}{formatted_model_id}"
    
    async def _download_from_gcs(self, model_id: str) -> str:
        """Download model from GCS to local cache"""
        local_path = self._get_local_model_path(model_id)
        
        # Check if already cached
        if os.path.exists(local_path) and os.path.isdir(local_path):
            logger.info(f"Model {model_id} found in local cache")
            return local_path
        
        logger.info(f"Downloading model {model_id} from GCS...")
        gcs_path = self._get_gcs_model_path(model_id)
        logger.info(f"Getting model from path {gcs_path} from GCS...")
        try:
            # List all blobs with the model prefix
            blobs = list(self.bucket.list_blobs(prefix=gcs_path))
            
            if not blobs:
                raise FileNotFoundError(f"Model {model_id} not found in GCS at {gcs_path}")
            
            os.makedirs(local_path, exist_ok=True)
            
            # Download files
            for blob in blobs:
                # Get relative path within model directory
                relative_path = blob.name[len(gcs_path):].lstrip('/')
                if not relative_path:
                    continue
                
                local_file_path = os.path.join(local_path, relative_path)
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                
                blob.download_to_filename(local_file_path)
                logger.debug(f"Downloaded {blob.name}")
            
            logger.info(f"Model {model_id} downloaded successfully")
            return local_path
            
        except Exception as e:
            logger.error(f"Failed to download model {model_id}: {e}")
            # Cleanup partial download
            if os.path.exists(local_path):
                import shutil
                shutil.rmtree(local_path)
            raise
    
    def _evict_lru_model(self):
        """Evict least recently used model"""
        max_models = config.get_max_cached_models()
        if len(self.models) < max_models:
            return
        
        # Find LRU model
        lru_model = min(self.model_access_times.items(), key=lambda x: x[1])
        model_id = lru_model[0]
        
        logger.info(f"Evicting LRU model: {model_id}")
        
        # Cleanup
        if model_id in self.models:
            del self.models[model_id]
            del self.model_access_times[model_id]
            if model_id in self.loading_locks:
                del self.loading_locks[model_id]
        
        # Clear GPU cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    async def load_model(self, model_id: str) -> dict:
        """Load model from GCS or cache"""
        # Check if model is already loaded
        if model_id in self.models:
            self.model_access_times[model_id] = time.time()
            logger.info(f"Using cached model: {model_id}")
            return self.models[model_id]
        
        # Create lock for this model if it doesn't exist
        if model_id not in self.loading_locks:
            self.loading_locks[model_id] = asyncio.Lock()
        
        # Acquire lock to prevent duplicate loading
        async with self.loading_locks[model_id]:
            # Double-check if model was loaded while waiting
            if model_id in self.models:
                self.model_access_times[model_id] = time.time()
                return self.models[model_id]
            
            # Evict LRU model if cache is full
            self._evict_lru_model()
            
            logger.info(f"Loading model: {model_id}")
            
            try:
                # Download from GCS
                local_path = await self._download_from_gcs(model_id)
                
                # Load tokenizer
                tokenizer = AutoTokenizer.from_pretrained(
                    local_path,
                    local_files_only=True,
                    trust_remote_code=True
                )

                # Ensure tokenizer has pad token (critical for generation)
                if tokenizer.pad_token is None:
                    tokenizer.pad_token = tokenizer.eos_token
                    logger.info(f"Set pad_token to eos_token for {model_id}")

                # Set default chat template if none exists
                if not hasattr(tokenizer, 'chat_template') or tokenizer.chat_template is None:
                    # Use a simple but effective default chat template with proper stop tokens
                    tokenizer.chat_template = (
                        "{% for message in messages %}"
                        "{% if message['role'] == 'system' %}{{ message['content'] + '\\n\\n' }}"
                        "{% elif message['role'] == 'user' %}{{ 'User: ' + message['content'] + '\\n' }}"
                        "{% elif message['role'] == 'assistant' %}{{ 'Assistant: ' + message['content'] + '\\n' }}"
                        "{% endif %}"
                        "{% endfor %}"
                        "{% if add_generation_prompt %}{{ 'Assistant:' }}{% endif %}"
                    )
                    logger.info(f"Set default chat template for {model_id}")

                    # Set stop tokens to prevent multi-turn hallucination
                    if not hasattr(tokenizer, 'stop_tokens') or tokenizer.stop_tokens is None:
                        # Common stop patterns that indicate the start of a new turn
                        tokenizer.stop_tokens = ["User:", "\\nUser:", "\\n\\nUser:"]
                        logger.info(f"Set stop tokens for {model_id}: {tokenizer.stop_tokens}")
                
                # Load model with optimizations for device type
                load_kwargs = {
                    "local_files_only": True,
                    "trust_remote_code": True,
                    "low_cpu_mem_usage": True
                }

                # Device-specific optimizations
                if config.DEVICE == "mps":
                    # Apple Silicon MPS: use fp32 for numerical stability
                    load_kwargs["torch_dtype"] = torch.float32
                    model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                    model = model.to(config.DEVICE)
                elif config.DEVICE == "cuda":
                    # NVIDIA GPU: use device_map and fp16
                    load_kwargs["torch_dtype"] = torch.float16
                    load_kwargs["device_map"] = "auto"
                    model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                else:
                    # CPU: use full precision, consider 8-bit if available
                    if config.IS_LOCAL:
                        # For local testing on CPU, try to use 8-bit quantization
                        try:
                            load_kwargs["load_in_8bit"] = True
                            model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                        except Exception as e:
                            logger.warning(f"8-bit loading failed: {e}, using fp32")
                            load_kwargs.pop("load_in_8bit", None)
                            load_kwargs["torch_dtype"] = torch.float32
                            model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                    else:
                        load_kwargs["torch_dtype"] = torch.float32
                        load_kwargs["device_map"] = "auto"
                        model = AutoModelForCausalLM.from_pretrained(local_path, **load_kwargs)
                
                # Cache model
                self.models[model_id] = {
                    "model": model,
                    "tokenizer": tokenizer,
                    "device": config.DEVICE
                }
                self.model_access_times[model_id] = time.time()
                
                logger.info(f"Model {model_id} loaded successfully")
                return self.models[model_id]
                
            except Exception as e:
                logger.error(f"Failed to load model {model_id}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to load model {model_id}: {str(e)}"
                )
    
    def list_loaded_models(self) -> List[str]:
        """List currently loaded models"""
        return list(self.models.keys())
    
    async def unload_model(self, model_id: str):
        """Manually unload a model"""
        if model_id in self.models:
            logger.info(f"Unloading model: {model_id}")
            del self.models[model_id]
            if model_id in self.model_access_times:
                del self.model_access_times[model_id]
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

# ============================================================================
# Inference Engine
# ============================================================================

class InferenceEngine:
    def __init__(self, model_manager: ModelManager):
        self.model_manager = model_manager
        max_concurrent = config.get_max_concurrent()
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    def _prepare_prompt(self, messages: List[Message], tokenizer) -> str:
        """Convert messages to prompt"""
        # Try chat template if available
        if hasattr(tokenizer, 'apply_chat_template'):
            try:
                msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
                return tokenizer.apply_chat_template(
                    msg_dicts,
                    tokenize=False,
                    add_generation_prompt=True
                )
            except Exception as e:
                logger.warning(f"Chat template failed: {e}, using fallback")
        
        # Fallback: simple concatenation
        prompt = ""
        for msg in messages:
            prompt += f"{msg.role}: {msg.content}\n"
        prompt += "assistant: "
        return prompt
    
    async def generate_stream(
        self,
        model_data: dict,
        prompt: str,
        request: ChatCompletionRequest,
        request_id: str
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response"""
        model = model_data["model"]
        tokenizer = model_data["tokenizer"]

        # Tokenize
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)

        # Setup streamer
        streamer = TextIteratorStreamer(
            tokenizer,
            skip_prompt=True,
            skip_special_tokens=True
        )

        # Prepare stop strings (from request or default chat stop tokens)
        stop_strings = []
        if request.stop:
            if isinstance(request.stop, str):
                stop_strings = [request.stop]
            else:
                stop_strings = request.stop
        elif hasattr(tokenizer, 'stop_tokens') and tokenizer.stop_tokens:
            stop_strings = tokenizer.stop_tokens

        # Convert stop strings to token ID sequences
        stop_token_sequences = []
        if stop_strings:
            for stop_str in stop_strings:
                # Encode each stop string and get the token IDs
                encoded = tokenizer.encode(stop_str, add_special_tokens=False)
                if encoded:
                    stop_token_sequences.append(encoded)

        # Create stopping criteria if we have stop sequences
        stopping_criteria = None
        if stop_token_sequences:
            stopping_criteria = StoppingCriteriaList([
                StopOnTokens(stop_token_sequences, inputs.input_ids.shape[1])
            ])

        # Generation kwargs
        gen_kwargs = {
            "input_ids": inputs.input_ids,
            "attention_mask": inputs.attention_mask,  # Explicitly pass attention mask
            "max_new_tokens": request.max_tokens,
            "temperature": max(request.temperature, 0.1),  # Higher minimum for stability
            "do_sample": request.temperature > 0,
            "top_p": request.top_p,
            "streamer": streamer,
            "pad_token_id": tokenizer.pad_token_id or tokenizer.eos_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "use_cache": True,
        }

        # Add stopping criteria if we have stop sequences
        if stopping_criteria:
            gen_kwargs["stopping_criteria"] = stopping_criteria

        # Add sampling safety parameters to prevent NaN/Inf
        if gen_kwargs["do_sample"]:
            gen_kwargs["top_k"] = 40  # Limit vocabulary for stability
            gen_kwargs["repetition_penalty"] = 1.1  # Prevent repetition loops
        else:
            # For greedy decoding (temperature=0), force do_sample=False
            gen_kwargs["do_sample"] = False
            gen_kwargs.pop("temperature", None)
            gen_kwargs.pop("top_p", None)
        
        # Start generation in thread
        thread = Thread(target=model.generate, kwargs=gen_kwargs)
        thread.start()
        
        # Stream tokens
        first_chunk = True
        accumulated_text = ""
        partial_stop_buffer = ""

        for text in streamer:
            # Add buffered partial stop token back if it wasn't a stop
            if partial_stop_buffer:
                text = partial_stop_buffer + text
                partial_stop_buffer = ""

            accumulated_text += text
            current_chunk = text

            # Check if we've hit a complete stop string
            should_stop = False
            for stop_str in stop_strings:
                if stop_str in accumulated_text:
                    # Find where the stop string starts in accumulated text
                    stop_pos = accumulated_text.index(stop_str)
                    # Calculate how much of current chunk to keep
                    keep_len = max(0, stop_pos - (len(accumulated_text) - len(text)))
                    current_chunk = text[:keep_len]
                    should_stop = True
                    break

            # Check if current text might be start of a stop string (partial match)
            if not should_stop and stop_strings:
                for stop_str in stop_strings:
                    # Check if the end of accumulated_text matches the start of stop_str
                    for i in range(1, min(len(stop_str), len(accumulated_text)) + 1):
                        if accumulated_text.endswith(stop_str[:i]):
                            # We have a partial match, buffer it and don't send yet
                            buffer_size = i
                            if len(current_chunk) >= buffer_size:
                                partial_stop_buffer = current_chunk[-buffer_size:]
                                current_chunk = current_chunk[:-buffer_size]
                            break
                    if partial_stop_buffer:
                        break

            # Only yield if we have text to send
            if current_chunk:
                chunk = ChatCompletionChunk(
                    id=request_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[StreamChoice(
                        index=0,
                        delta={"role": "assistant", "content": current_chunk} if first_chunk else {"content": current_chunk},
                        finish_reason=None
                    )]
                )
                first_chunk = False
                yield f"data: {chunk.model_dump_json()}\n\n"

            if should_stop:
                break
        
        # Final chunk
        final = ChatCompletionChunk(
            id=request_id,
            created=int(time.time()),
            model=request.model,
            choices=[StreamChoice(index=0, delta={}, finish_reason="stop")]
        )
        yield f"data: {final.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"
        
        thread.join()
    
    async def generate(
        self,
        request: ChatCompletionRequest
    ) -> Union[ChatCompletionResponse, StreamingResponse]:
        """Generate completion"""
        async with self.semaphore:
            try:
                # Load model
                model_data = await self.model_manager.load_model(request.model)
                model = model_data["model"]
                tokenizer = model_data["tokenizer"]
                
                # Prepare prompt
                prompt = self._prepare_prompt(request.messages, tokenizer)
                request_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
                
                # Streaming response
                if request.stream:
                    return StreamingResponse(
                        self.generate_stream(model_data, prompt, request, request_id),
                        media_type="text/event-stream"
                    )
                
                # Non-streaming response
                inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)
                prompt_tokens = inputs.input_ids.shape[1]

                # Prepare stop strings (from request or default chat stop tokens)
                stop_strings = []
                if request.stop:
                    if isinstance(request.stop, str):
                        stop_strings = [request.stop]
                    else:
                        stop_strings = request.stop
                elif hasattr(tokenizer, 'stop_tokens') and tokenizer.stop_tokens:
                    stop_strings = tokenizer.stop_tokens

                # Convert stop strings to token ID sequences
                stop_token_sequences = []
                if stop_strings:
                    for stop_str in stop_strings:
                        # Encode each stop string and get the token IDs
                        encoded = tokenizer.encode(stop_str, add_special_tokens=False)
                        if encoded:
                            stop_token_sequences.append(encoded)

                # Create stopping criteria if we have stop sequences
                stopping_criteria = None
                if stop_token_sequences:
                    stopping_criteria = StoppingCriteriaList([
                        StopOnTokens(stop_token_sequences, inputs.input_ids.shape[1])
                    ])

                gen_kwargs = {
                    "input_ids": inputs.input_ids,
                    "attention_mask": inputs.attention_mask,  # Explicitly pass attention mask
                    "max_new_tokens": request.max_tokens,
                    "temperature": max(request.temperature, 0.1),  # Higher minimum for stability
                    "do_sample": request.temperature > 0,
                    "top_p": request.top_p,
                    "pad_token_id": tokenizer.pad_token_id or tokenizer.eos_token_id,
                    "eos_token_id": tokenizer.eos_token_id,
                    "use_cache": True,
                }

                # Add stopping criteria if we have stop sequences
                if stopping_criteria:
                    gen_kwargs["stopping_criteria"] = stopping_criteria

                # Add sampling safety parameters to prevent NaN/Inf
                if gen_kwargs["do_sample"]:
                    gen_kwargs["top_k"] = 40  # Limit vocabulary for stability
                    gen_kwargs["repetition_penalty"] = 1.1  # Prevent repetition loops
                else:
                    # For greedy decoding (temperature=0), force do_sample=False
                    gen_kwargs["do_sample"] = False
                    gen_kwargs.pop("temperature", None)
                    gen_kwargs.pop("top_p", None)

                with torch.no_grad():
                    outputs = model.generate(**gen_kwargs)

                # Decode
                generated_ids = outputs[0][inputs.input_ids.shape[1]:]
                generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)

                # Remove stop strings from the generated text
                for stop_str in stop_strings:
                    if stop_str in generated_text:
                        generated_text = generated_text.split(stop_str)[0]
                        break

                completion_tokens = len(generated_ids)

                return ChatCompletionResponse(
                    id=request_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[Choice(
                        index=0,
                        message=Message(role="assistant", content=generated_text),
                        finish_reason="stop"
                    )],
                    usage=Usage(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens
                    )
                )
                
            except Exception as e:
                logger.error(f"Generation failed: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))

    async def generate_completion_stream(
        self,
        model_data: dict,
        prompt: str,
        request: CompletionRequest,
        request_id: str
    ) -> AsyncGenerator[str, None]:
        """Generate streaming text completion"""
        model = model_data["model"]
        tokenizer = model_data["tokenizer"]

        # Tokenize
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)

        # Setup streamer
        streamer = TextIteratorStreamer(
            tokenizer,
            skip_prompt=True,
            skip_special_tokens=True
        )

        # Generation kwargs
        gen_kwargs = {
            "input_ids": inputs.input_ids,
            "attention_mask": inputs.attention_mask,
            "max_new_tokens": request.max_tokens,
            "temperature": max(request.temperature, 0.1),
            "do_sample": request.temperature > 0,
            "top_p": request.top_p,
            "streamer": streamer,
            "pad_token_id": tokenizer.pad_token_id or tokenizer.eos_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "use_cache": True,
        }

        # Add sampling safety parameters
        if gen_kwargs["do_sample"]:
            gen_kwargs["top_k"] = 40
            gen_kwargs["repetition_penalty"] = 1.1
        else:
            gen_kwargs["do_sample"] = False
            gen_kwargs.pop("temperature", None)
            gen_kwargs.pop("top_p", None)

        # Start generation in thread
        thread = Thread(target=model.generate, kwargs=gen_kwargs)
        thread.start()

        # Stream tokens
        for text in streamer:
            chunk = CompletionChunk(
                id=request_id,
                created=int(time.time()),
                model=request.model,
                choices=[StreamCompletionChoice(
                    index=0,
                    text=text,
                    finish_reason=None
                )]
            )
            yield f"data: {chunk.model_dump_json()}\n\n"

        # Final chunk
        final = CompletionChunk(
            id=request_id,
            created=int(time.time()),
            model=request.model,
            choices=[StreamCompletionChoice(index=0, text="", finish_reason="stop")]
        )
        yield f"data: {final.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"

        thread.join()

    async def complete(
        self,
        request: CompletionRequest
    ) -> Union[CompletionResponse, StreamingResponse]:
        """Generate text completion (OpenAI /v1/completions compatible)"""
        async with self.semaphore:
            try:
                # Load model
                model_data = await self.model_manager.load_model(request.model)
                model = model_data["model"]
                tokenizer = model_data["tokenizer"]

                # Handle prompt (can be string or list)
                if isinstance(request.prompt, list):
                    if len(request.prompt) > 1:
                        raise HTTPException(
                            status_code=400,
                            detail="Only single prompt supported (n=1)"
                        )
                    prompt = request.prompt[0]
                else:
                    prompt = request.prompt

                request_id = f"cmpl-{uuid.uuid4().hex[:12]}"

                # Streaming response
                if request.stream:
                    return StreamingResponse(
                        self.generate_completion_stream(model_data, prompt, request, request_id),
                        media_type="text/event-stream"
                    )

                # Non-streaming response
                inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)
                prompt_tokens = inputs.input_ids.shape[1]

                gen_kwargs = {
                    "input_ids": inputs.input_ids,
                    "attention_mask": inputs.attention_mask,
                    "max_new_tokens": request.max_tokens,
                    "temperature": max(request.temperature, 0.1),
                    "do_sample": request.temperature > 0,
                    "top_p": request.top_p,
                    "pad_token_id": tokenizer.pad_token_id or tokenizer.eos_token_id,
                    "eos_token_id": tokenizer.eos_token_id,
                    "use_cache": True,
                }

                # Add sampling safety parameters
                if gen_kwargs["do_sample"]:
                    gen_kwargs["top_k"] = 40
                    gen_kwargs["repetition_penalty"] = 1.1
                else:
                    gen_kwargs["do_sample"] = False
                    gen_kwargs.pop("temperature", None)
                    gen_kwargs.pop("top_p", None)

                with torch.no_grad():
                    outputs = model.generate(**gen_kwargs)

                # Decode
                generated_ids = outputs[0][inputs.input_ids.shape[1]:]
                generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
                completion_tokens = len(generated_ids)

                return CompletionResponse(
                    id=request_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[CompletionChoice(
                        index=0,
                        text=generated_text,
                        finish_reason="stop"
                    )],
                    usage=Usage(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens
                    )
                )

            except Exception as e:
                logger.error(f"Completion failed: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# FastAPI Application
# ============================================================================

# Global instances
model_manager = ModelManager()
inference_engine = InferenceEngine(model_manager)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("Starting inference service...")
    logger.info(f"Local dev mode: {config.IS_LOCAL}")
    logger.info(f"Device: {config.DEVICE}")
    logger.info(f"Dtype: {config.TORCH_DTYPE}")
    logger.info(f"CUDA available: {torch.cuda.is_available()}")
    logger.info(f"MPS available: {torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else False}")

    if torch.cuda.is_available():
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    logger.info(f"GCS Bucket: {config.GCS_BUCKET}")
    logger.info(f"Max concurrent requests: {config.get_max_concurrent()}")
    logger.info(f"Max cached models: {config.get_max_cached_models()}")
    yield
    logger.info("Shutting down inference service...")

app = FastAPI(
    title="OpenAI-Compatible Inference Service",
    description="Production inference service for Cloud Run with GPU",
    version="1.0.0",
    lifespan=lifespan
)

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "OpenAI-Compatible Inference Service",
        "version": "1.0.0",
        "platform": "Cloud Run with GPU",
        "status": "running",
        "gpu_available": torch.cuda.is_available(),
        "loaded_models": model_manager.list_loaded_models()
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "loaded_models_count": len(model_manager.list_loaded_models()),
        "loaded_models": model_manager.list_loaded_models()
    }

@app.get("/v1/models", response_model=ModelListResponse)
async def list_models():
    """List loaded models (OpenAI compatible)"""
    models = [
        ModelInfo(
            id=model_id,
            created=int(time.time()),
            owned_by="organization"
        )
        for model_id in model_manager.list_loaded_models()
    ]
    return ModelListResponse(data=models)

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """Chat completions endpoint (OpenAI compatible)"""
    return await inference_engine.generate(request)

@app.post("/v1/completions")
async def completions(request: CompletionRequest):
    """Text completions endpoint (OpenAI compatible)"""
    return await inference_engine.complete(request)

@app.post("/admin/unload/{model_id}")
async def unload_model(model_id: str):
    """Manually unload a model"""
    await model_manager.unload_model(model_id)
    return {"message": f"Model {model_id} unloaded"}

@app.get("/admin/stats")
async def get_stats():
    """Get service statistics"""
    stats = {
        "loaded_models": model_manager.list_loaded_models(),
        "model_count": len(model_manager.list_loaded_models()),
        "max_concurrent_requests": config.MAX_CONCURRENT_REQUESTS,
        "max_cached_models": config.MAX_CACHED_MODELS,
        "gcs_bucket": config.GCS_BUCKET,
    }
    
    if torch.cuda.is_available():
        stats.update({
            "gpu": {
                "name": torch.cuda.get_device_name(0),
                "total_memory_gb": torch.cuda.get_device_properties(0).total_memory / 1e9,
                "allocated_memory_gb": torch.cuda.memory_allocated(0) / 1e9,
                "free_memory_gb": (torch.cuda.get_device_properties(0).total_memory - 
                                  torch.cuda.memory_allocated(0)) / 1e9
            }
        })
    
    return stats

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        timeout_keep_alive=config.REQUEST_TIMEOUT
    )