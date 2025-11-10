"""Inference engine for generating completions."""

import asyncio
import time
import uuid
from typing import AsyncGenerator, Union, List
from threading import Thread

import torch
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from transformers import TextIteratorStreamer, StoppingCriteriaList

from ..config import config
from ..models.requests import ChatCompletionRequest, CompletionRequest, Message
from ..models.responses import (
    ChatCompletionResponse,
    ChatCompletionChunk,
    CompletionResponse,
    CompletionChunk,
    Choice,
    StreamChoice,
    CompletionChoice,
    StreamCompletionChoice,
    Usage,
)
from ..utils.stopping_criteria import StopOnTokens
from ..utils.logging import get_logger
from .model_manager import ModelManager

logger = get_logger(__name__)


class InferenceEngine:
    """
    Handles inference operations for both chat and text completions.

    Supports streaming and non-streaming responses with custom stopping criteria.
    """

    def __init__(self, model_manager: ModelManager):
        """
        Initialize the inference engine.

        Args:
            model_manager: Model manager instance for loading models
        """
        self.model_manager = model_manager
        max_concurrent = config.get_max_concurrent()
        self.semaphore = asyncio.Semaphore(max_concurrent)

    def _prepare_prompt(self, messages: List[Message], tokenizer) -> str:
        """
        Convert messages to prompt using chat template.

        Args:
            messages: List of chat messages
            tokenizer: Tokenizer with chat template

        Returns:
            Formatted prompt string
        """
        # Try chat template if available
        if hasattr(tokenizer, "apply_chat_template"):
            try:
                msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
                return tokenizer.apply_chat_template(
                    msg_dicts, tokenize=False, add_generation_prompt=True
                )
            except Exception as e:
                logger.warning(f"Chat template failed: {e}, using fallback")

        # Fallback: simple concatenation
        prompt = ""
        for msg in messages:
            prompt += f"{msg.role}: {msg.content}\n"
        prompt += "assistant: "
        return prompt

    def _prepare_stop_sequences(self, request, tokenizer) -> List[str]:
        """
        Prepare stop strings from request or tokenizer defaults.

        Args:
            request: Request with optional stop parameter
            tokenizer: Tokenizer with optional default stop tokens

        Returns:
            List of stop strings
        """
        stop_strings = []
        if request.stop:
            if isinstance(request.stop, str):
                stop_strings = [request.stop]
            else:
                stop_strings = request.stop
        elif hasattr(tokenizer, "stop_tokens") and tokenizer.stop_tokens:
            stop_strings = tokenizer.stop_tokens
        return stop_strings

    def _encode_stop_sequences(self, stop_strings: List[str], tokenizer) -> List[List[int]]:
        """
        Encode stop strings into token ID sequences.

        Args:
            stop_strings: List of stop strings
            tokenizer: Tokenizer for encoding

        Returns:
            List of token ID sequences
        """
        stop_token_sequences = []
        for stop_str in stop_strings:
            encoded = tokenizer.encode(stop_str, add_special_tokens=False)
            if encoded:
                stop_token_sequences.append(encoded)
        return stop_token_sequences

    def _prepare_generation_kwargs(
        self, inputs, request, tokenizer, stop_token_sequences=None
    ) -> dict:
        """
        Prepare kwargs for model.generate().

        Args:
            inputs: Tokenized inputs
            request: Request with generation parameters
            tokenizer: Tokenizer
            stop_token_sequences: Optional stop token sequences

        Returns:
            Dictionary of generation kwargs
        """
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

        # Add stopping criteria if we have stop sequences
        if stop_token_sequences:
            stopping_criteria = StoppingCriteriaList(
                [StopOnTokens(stop_token_sequences, inputs.input_ids.shape[1])]
            )
            gen_kwargs["stopping_criteria"] = stopping_criteria

        # Add sampling safety parameters
        if gen_kwargs["do_sample"]:
            gen_kwargs["top_k"] = 40
            gen_kwargs["repetition_penalty"] = 1.15  # Increased to prevent loops
            # Enable logit renormalization for numerical stability
            gen_kwargs["renormalize_logits"] = True
        else:
            # For greedy decoding, force do_sample=False and add repetition penalty
            gen_kwargs["do_sample"] = False
            gen_kwargs["repetition_penalty"] = 1.1  # Prevent loops even in greedy mode
            gen_kwargs.pop("temperature", None)
            gen_kwargs.pop("top_p", None)

        return gen_kwargs

    def _handle_cuda_error(self, model_data: dict, model_id: str) -> None:
        """
        Handle CUDA errors by cleaning up GPU memory and unloading the corrupted model.

        CUDA errors can corrupt the GPU context, making it unusable for subsequent
        operations. This method attempts recovery by:
        1. Clearing CUDA cache
        2. Unloading the affected model from memory
        3. Forcing garbage collection

        Args:
            model_data: Model data dictionary
            model_id: Model identifier to unload
        """
        try:
            logger.warning(f"Handling CUDA error for model {model_id}")

            # Clear CUDA cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.info("Cleared CUDA cache")

            # Unload the corrupted model
            import asyncio
            loop = asyncio.get_event_loop()
            loop.create_task(self.model_manager.unload_model(model_id))
            logger.info(f"Scheduled unload of model {model_id}")

        except Exception as e:
            logger.error(f"Error during CUDA error handling: {e}", exc_info=True)

    async def generate_stream(
        self,
        model_data: dict,
        prompt: str,
        request: ChatCompletionRequest,
        request_id: str,
    ) -> AsyncGenerator[str, None]:
        """
        Generate streaming chat completion.

        Args:
            model_data: Dictionary with model and tokenizer
            prompt: Formatted prompt
            request: Chat completion request
            request_id: Unique request ID

        Yields:
            Server-sent event formatted chunks
        """
        model = model_data["model"]
        tokenizer = model_data["tokenizer"]

        # Tokenize
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)

        # Setup streamer
        streamer = TextIteratorStreamer(
            tokenizer, skip_prompt=True, skip_special_tokens=True
        )

        # Prepare stop sequences
        stop_strings = self._prepare_stop_sequences(request, tokenizer)
        stop_token_sequences = self._encode_stop_sequences(stop_strings, tokenizer)

        # Generation kwargs
        gen_kwargs = self._prepare_generation_kwargs(
            inputs, request, tokenizer, stop_token_sequences
        )
        gen_kwargs["streamer"] = streamer

        # Start generation in thread with error handling
        generation_error = []  # Store any exception from the thread

        def generate_with_error_handling():
            """Wrapper to catch exceptions in generation thread."""
            try:
                model.generate(**gen_kwargs)
            except Exception as e:
                generation_error.append(e)
                logger.error(f"Generation thread error: {e}", exc_info=True)
                # Signal streamer to stop
                streamer.end()

        thread = Thread(target=generate_with_error_handling)
        thread.start()

        # Stream tokens with timeout protection
        first_chunk = True
        accumulated_text = ""
        partial_stop_buffer = ""

        try:
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
                        choices=[
                            StreamChoice(
                                index=0,
                                delta=(
                                    {"role": "assistant", "content": current_chunk}
                                    if first_chunk
                                    else {"content": current_chunk}
                                ),
                                finish_reason=None,
                            )
                        ],
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
                choices=[StreamChoice(index=0, delta={}, finish_reason="stop")],
            )
            yield f"data: {final.model_dump_json()}\n\n"
            yield "data: [DONE]\n\n"

        finally:
            # Wait for thread to finish (with timeout)
            thread.join(timeout=5.0)

            # Check if generation thread had an error
            if generation_error:
                error = generation_error[0]
                logger.error(f"Generation failed with error: {error}")

                # If CUDA error, clear cache and potentially unload model
                if "CUDA" in str(error) or "cuda" in str(error):
                    logger.error("CUDA error detected - cleaning up GPU memory")
                    self._handle_cuda_error(model_data, request.model)

                # Re-raise the error
                raise error

            # Check if thread is still alive (timeout)
            if thread.is_alive():
                logger.error("Generation thread timeout - possible hang")
                raise TimeoutError("Generation timed out")

    async def generate(
        self, request: ChatCompletionRequest, auth_context: dict = None
    ) -> Union[ChatCompletionResponse, StreamingResponse]:
        """
        Generate chat completion.

        Args:
            request: Chat completion request
            auth_context: Optional authentication context with user/key info

        Returns:
            ChatCompletionResponse or StreamingResponse

        Raises:
            HTTPException: If generation fails
        """
        async with self.semaphore:
            try:
                # Log authenticated request
                if auth_context and auth_context.get("authenticated"):
                    logger.info(
                        f"Authenticated generation request: model={request.model}, "
                        f"userId={auth_context.get('userId')}, keyId={auth_context.get('keyId')}"
                    )

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
                        media_type="text/event-stream",
                    )

                # Non-streaming response
                inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(
                    model.device
                )
                prompt_tokens = inputs.input_ids.shape[1]

                # Prepare stop sequences
                stop_strings = self._prepare_stop_sequences(request, tokenizer)
                stop_token_sequences = self._encode_stop_sequences(stop_strings, tokenizer)

                # Generation with error handling
                gen_kwargs = self._prepare_generation_kwargs(
                    inputs, request, tokenizer, stop_token_sequences
                )

                try:
                    with torch.no_grad():
                        outputs = model.generate(**gen_kwargs)
                except RuntimeError as e:
                    # Handle CUDA errors
                    if "CUDA" in str(e) or "cuda" in str(e):
                        logger.error(f"CUDA error during generation: {e}")
                        self._handle_cuda_error(model_data, request.model)
                    raise

                # Decode
                generated_ids = outputs[0][inputs.input_ids.shape[1] :]
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
                    choices=[
                        Choice(
                            index=0,
                            message=Message(role="assistant", content=generated_text),
                            finish_reason="stop",
                        )
                    ],
                    usage=Usage(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens,
                    ),
                )

            except Exception as e:
                logger.error(f"Generation failed: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))

    async def generate_completion_stream(
        self,
        model_data: dict,
        prompt: str,
        request: CompletionRequest,
        request_id: str,
    ) -> AsyncGenerator[str, None]:
        """
        Generate streaming text completion.

        Args:
            model_data: Dictionary with model and tokenizer
            prompt: Input prompt
            request: Completion request
            request_id: Unique request ID

        Yields:
            Server-sent event formatted chunks
        """
        model = model_data["model"]
        tokenizer = model_data["tokenizer"]

        # Tokenize
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(model.device)

        # Setup streamer
        streamer = TextIteratorStreamer(
            tokenizer, skip_prompt=True, skip_special_tokens=True
        )

        # Generation kwargs
        gen_kwargs = self._prepare_generation_kwargs(inputs, request, tokenizer)
        gen_kwargs["streamer"] = streamer

        # Start generation in thread with error handling
        generation_error = []

        def generate_with_error_handling():
            """Wrapper to catch exceptions in generation thread."""
            try:
                model.generate(**gen_kwargs)
            except Exception as e:
                generation_error.append(e)
                logger.error(f"Generation thread error: {e}", exc_info=True)
                streamer.end()

        thread = Thread(target=generate_with_error_handling)
        thread.start()

        # Stream tokens
        try:
            for text in streamer:
                chunk = CompletionChunk(
                    id=request_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[
                        StreamCompletionChoice(index=0, text=text, finish_reason=None)
                    ],
                )
                yield f"data: {chunk.model_dump_json()}\n\n"

            # Final chunk
            final = CompletionChunk(
                id=request_id,
                created=int(time.time()),
                model=request.model,
                choices=[StreamCompletionChoice(index=0, text="", finish_reason="stop")],
            )
            yield f"data: {final.model_dump_json()}\n\n"
            yield "data: [DONE]\n\n"

        finally:
            # Wait for thread to finish (with timeout)
            thread.join(timeout=5.0)

            # Check if generation thread had an error
            if generation_error:
                error = generation_error[0]
                logger.error(f"Generation failed with error: {error}")

                # If CUDA error, clean up
                if "CUDA" in str(error) or "cuda" in str(error):
                    logger.error("CUDA error detected - cleaning up GPU memory")
                    self._handle_cuda_error(model_data, request.model)

                raise error

            # Check if thread is still alive (timeout)
            if thread.is_alive():
                logger.error("Generation thread timeout - possible hang")
                raise TimeoutError("Generation timed out")

    async def complete(
        self, request: CompletionRequest, auth_context: dict = None
    ) -> Union[CompletionResponse, StreamingResponse]:
        """
        Generate text completion (OpenAI /v1/completions compatible).

        Args:
            request: Completion request
            auth_context: Optional authentication context with user/key info

        Returns:
            CompletionResponse or StreamingResponse

        Raises:
            HTTPException: If generation fails
        """
        async with self.semaphore:
            try:
                # Log authenticated request
                if auth_context and auth_context.get("authenticated"):
                    logger.info(
                        f"Authenticated completion request: model={request.model}, "
                        f"userId={auth_context.get('userId')}, keyId={auth_context.get('keyId')}"
                    )

                # Load model
                model_data = await self.model_manager.load_model(request.model)
                model = model_data["model"]
                tokenizer = model_data["tokenizer"]

                # Handle prompt (can be string or list)
                if isinstance(request.prompt, list):
                    if len(request.prompt) > 1:
                        raise HTTPException(
                            status_code=400, detail="Only single prompt supported (n=1)"
                        )
                    prompt = request.prompt[0]
                else:
                    prompt = request.prompt

                request_id = f"cmpl-{uuid.uuid4().hex[:12]}"

                # Streaming response
                if request.stream:
                    return StreamingResponse(
                        self.generate_completion_stream(
                            model_data, prompt, request, request_id
                        ),
                        media_type="text/event-stream",
                    )

                # Non-streaming response
                inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(
                    model.device
                )
                prompt_tokens = inputs.input_ids.shape[1]

                gen_kwargs = self._prepare_generation_kwargs(inputs, request, tokenizer)

                try:
                    with torch.no_grad():
                        outputs = model.generate(**gen_kwargs)
                except RuntimeError as e:
                    # Handle CUDA errors
                    if "CUDA" in str(e) or "cuda" in str(e):
                        logger.error(f"CUDA error during generation: {e}")
                        self._handle_cuda_error(model_data, request.model)
                    raise

                # Decode
                generated_ids = outputs[0][inputs.input_ids.shape[1] :]
                generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
                completion_tokens = len(generated_ids)

                return CompletionResponse(
                    id=request_id,
                    created=int(time.time()),
                    model=request.model,
                    choices=[
                        CompletionChoice(
                            index=0, text=generated_text, finish_reason="stop"
                        )
                    ],
                    usage=Usage(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens,
                    ),
                )

            except Exception as e:
                logger.error(f"Completion failed: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))
