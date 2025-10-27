"""Completion endpoints (chat and text)."""

from fastapi import APIRouter, Depends, Request
from typing import Dict, Any

from ..models.requests import ChatCompletionRequest, CompletionRequest
from ..core.inference_engine import InferenceEngine
from .middleware.auth import verify_api_key

router = APIRouter()


def create_completions_router(inference_engine: InferenceEngine) -> APIRouter:
    """
    Create completions router with inference engine dependency.

    Args:
        inference_engine: Inference engine instance

    Returns:
        APIRouter with completion endpoints
    """

    @router.post("/v1/chat/completions")
    async def chat_completions(
        request: ChatCompletionRequest,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """Chat completions endpoint (OpenAI compatible) - Requires authentication."""
        return await inference_engine.generate(request, auth_context=auth)

    @router.post("/v1/completions")
    async def completions(
        request: CompletionRequest,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """Text completions endpoint (OpenAI compatible) - Requires authentication."""
        return await inference_engine.complete(request, auth_context=auth)

    @router.post("/v1/{model_name}/chat/completions")
    async def model_chat_completions(
        model_name: str,
        request: ChatCompletionRequest,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Model-specific chat completions endpoint.

        Allows calling with model in URL: /v1/{model_name}/chat/completions
        This is useful for fine-tuned models with dedicated endpoints.
        """
        # Override model in request with model from URL
        request.model = model_name
        return await inference_engine.generate(request, auth_context=auth)

    @router.post("/v1/{model_name}/completions")
    async def model_completions(
        model_name: str,
        request: CompletionRequest,
        auth: Dict[str, Any] = Depends(verify_api_key)
    ):
        """
        Model-specific text completions endpoint.

        Allows calling with model in URL: /v1/{model_name}/completions
        """
        # Override model in request with model from URL
        request.model = model_name
        return await inference_engine.complete(request, auth_context=auth)

    return router
