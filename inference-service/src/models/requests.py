"""Request models for the API."""

from typing import List, Optional, Union
from pydantic import BaseModel, Field


class Message(BaseModel):
    """A chat message with role and content."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Request for chat completion (OpenAI compatible)."""

    model: str
    messages: List[Message]
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: bool = False
    top_p: float = Field(default=1.0, ge=0, le=1)
    stop: Optional[Union[str, List[str]]] = None


class CompletionRequest(BaseModel):
    """Request for text completion (OpenAI compatible)."""

    model: str
    prompt: Union[str, List[str]]
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=512, ge=1)
    stream: bool = False
    top_p: float = Field(default=1.0, ge=0, le=1)
    stop: Optional[Union[str, List[str]]] = None
