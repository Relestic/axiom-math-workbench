"""Request models for user-owned AI configuration and exercise discussion."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import StrictModel


class AICredentialRequest(StrictModel):
    api_key: str = Field(min_length=12, max_length=200, repr=False)
    model: Literal["deepseek-chat", "deepseek-reasoner"] = "deepseek-chat"


class ExerciseDiscussionRequest(StrictModel):
    exercise_id: str = Field(min_length=1, max_length=120)
    answer_text: str = Field(default="", max_length=12000)
    message: str = Field(default="", max_length=4000)
    history: list[dict] = Field(default_factory=list, max_length=16)


class ExerciseSubmitAIRequest(StrictModel):
    exercise_id: str = Field(min_length=1, max_length=120)
    answer_text: str = Field(min_length=1, max_length=12000)
    history: list[dict] = Field(default_factory=list, max_length=16)
    hints_used: int = Field(default=0, ge=0, le=20)
    solution_viewed: bool = False
