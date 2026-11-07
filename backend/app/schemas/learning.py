"""Request models for exercises, attempts, progress, notes and reports."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from .common import PageQuery, StrictModel


class ExerciseListQuery(PageQuery):
    topic: str | None = Field(default=None, max_length=40)
    skill: str | None = Field(default=None, max_length=40)
    difficulty: int | None = Field(default=None, ge=1, le=5)
    type: str | None = Field(default=None, max_length=40)
    q: str | None = Field(default=None, max_length=120)


class AttemptCreateRequest(StrictModel):
    exercise_id: str = Field(min_length=1, max_length=40)
    answer_text: str = Field(min_length=1, max_length=20000)
    answer_format: Literal["text", "latex", "plain"] = "text"
    hints_used: int = Field(default=0, ge=0, le=100)
    solution_viewed: bool = False
    self_rating: Literal["pending", "understood", "revisit"] = "pending"
    idempotency_key: str | None = Field(default=None, max_length=120)


class AttemptPatchRequest(StrictModel):
    self_rating: Literal["pending", "understood", "revisit"] | None = None


class EventRequest(StrictModel):
    type: Literal["hint_view", "solution_view", "answer_draft", "page_view", "scene_view"]
    payload: dict = Field(default_factory=dict)


class PracticeMapQuery(StrictModel):
    textbook_slug: str | None = Field(default=None, max_length=80)
    weeks: int = Field(default=8, ge=1, le=32)


class ProgressQuery(StrictModel):
    days: int = Field(default=30, ge=1, le=365)


class DiagnosticSubmitRequest(StrictModel):
    answers: dict[str, int] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _answers(self):
        if len(self.answers) > 50:
            raise ValueError("answers is too large")
        for key, value in self.answers.items():
            if not isinstance(key, str) or not (0 <= value <= 20):
                raise ValueError("answers must map question ids to option indexes")
        return self


class NoteCreateRequest(StrictModel):
    text: str = Field(min_length=1, max_length=20000)
    concept_id: str | None = Field(default=None, max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=10)


class NoteUpdateRequest(StrictModel):
    text: str | None = Field(default=None, min_length=1, max_length=20000)
    concept_id: str | None = Field(default=None, max_length=40)
    tags: list[str] | None = Field(default=None, max_length=10)


class BookmarkCreateRequest(StrictModel):
    target_type: Literal["concept", "classic", "proof", "exercise", "scene"] = "concept"
    target_id: str = Field(min_length=1, max_length=80)


class ReportCreateRequest(StrictModel):
    target_type: Literal["concept", "classic", "proof", "exercise", "scene", "other"] = "other"
    target_id: str = Field(default="", max_length=80)
    kind: Literal["wrong_answer", "proof_doubt", "visual_issue", "source_error", "other"] = "other"
    message: str = Field(min_length=5, max_length=8000)


class ReportResolveRequest(StrictModel):
    status: Literal["triaged", "resolved", "rejected"] = "resolved"
    admin_note: str = Field(default="", max_length=4000)


class JobListQuery(PageQuery):
    status: str | None = Field(default=None, max_length=30)
    type: str | None = Field(default=None, max_length=60)
