"""Completion endpoints (chat and text)."""

from fastapi import APIRouter

from ..models.requests import ChatCompletionRequest, CompletionRequest
from ..core.inference_engine import InferenceEngine

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
    async def chat_completions(request: ChatCompletionRequest):
        """Chat completions endpoint (OpenAI compatible)."""
        return await inference_engine.generate(request)

    @router.post("/v1/completions")
    async def completions(request: CompletionRequest):
        """Text completions endpoint (OpenAI compatible)."""
        return await inference_engine.complete(request)

    return router
