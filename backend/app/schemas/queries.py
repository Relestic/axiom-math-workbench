from __future__ import annotations

from .common import PageQuery, StrictModel
from pydantic import Field


class ClassicListQuery(PageQuery):
    concept_id: str | None = Field(default=None, max_length=40)
    kind: str | None = Field(default=None, max_length=30)


class AttemptListQuery(PageQuery):
    topic: str | None = Field(default=None, max_length=40)
    self_rating: str | None = Field(default=None, max_length=20)


class NoteListQuery(PageQuery):
    q: str | None = Field(default=None, max_length=120)
    concept_id: str | None = Field(default=None, max_length=40)


class ReportListQuery(PageQuery):
    status: str | None = Field(default=None, max_length=20)
