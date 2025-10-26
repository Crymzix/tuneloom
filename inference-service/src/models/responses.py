"""Response models for the API."""

from typing import Dict, List, Optional
from pydantic import BaseModel


class Usage(BaseModel):
    """Token usage information."""

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class Choice(BaseModel):
    """A single completion choice."""

    index: int
    message: "Message"
    finish_reason: str


class ChatCompletionResponse(BaseModel):
    """Response for chat completion."""

    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Choice]
    usage: Usage


class StreamChoice(BaseModel):
    """A single streaming completion choice."""

    index: int
    delta: Dict[str, str]
    finish_reason: Optional[str] = None


class ChatCompletionChunk(BaseModel):
    """A chunk of streaming chat completion."""

    id: str
    object: str = "chat.completion.chunk"
    created: int
    model: str
    choices: List[StreamChoice]


class ModelInfo(BaseModel):
    """Information about a model."""

    id: str
    object: str = "model"
    created: int
    owned_by: str = "organization"


class ModelListResponse(BaseModel):
    """List of available models."""

    object: str = "list"
    data: List[ModelInfo]


class CompletionChoice(BaseModel):
    """A single text completion choice."""

    index: int
    text: str
    finish_reason: str


class CompletionResponse(BaseModel):
    """Response for text completion."""

    id: str
    object: str = "text_completion"
    created: int
    model: str
    choices: List[CompletionChoice]
    usage: Usage


class StreamCompletionChoice(BaseModel):
    """A single streaming text completion choice."""

    index: int
    text: str
    finish_reason: Optional[str] = None


class CompletionChunk(BaseModel):
    """A chunk of streaming text completion."""

    id: str
    object: str = "text_completion.chunk"
    created: int
    model: str
    choices: List[StreamCompletionChoice]


# Import Message for forward reference resolution
from .requests import Message

Choice.model_rebuild()
