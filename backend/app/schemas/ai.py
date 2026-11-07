"""Request models for user-owned AI configuration."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import StrictModel


class AICredentialRequest(StrictModel):
    api_key: str = Field(min_length=12, max_length=200, repr=False)
    model: Literal["deepseek-chat", "deepseek-reasoner"] = "deepseek-chat"
