"""Schemas for Word-reader analysis, rules and correction examples."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import StrictModel

ReaderTask = Literal["recognition", "image", "qa"]


class ReaderBlockIn(StrictModel):
    block_id: str = Field(min_length=1, max_length=80)
    section_title: str = Field(default="", max_length=240)
    text: str = Field(min_length=1, max_length=12000)


class ReaderVisualizationIn(StrictModel):
    id: str = Field(min_length=1, max_length=120)
    label: str = Field(default="", max_length=240)
    concept_id: str = Field(default="", max_length=120)
    case_id: str = Field(default="explore", max_length=30)
    focus: list[str] = Field(default_factory=list, max_length=10)


class ReaderAnalyzeRequest(StrictModel):
    document_name: str = Field(min_length=1, max_length=240)
    doc_id: str = Field(min_length=1, max_length=120)
    parser_version: str = Field(min_length=1, max_length=80)
    blocks: list[ReaderBlockIn] = Field(min_length=1, max_length=40)
    visualizations: list[ReaderVisualizationIn] = Field(min_length=1, max_length=40)
    max_candidates: int = Field(default=12, ge=1, le=60)


class ReaderRuleUpdate(StrictModel):
    content: str = Field(min_length=1, max_length=12000)


class ReaderExampleCreate(StrictModel):
    task: ReaderTask = "recognition"
    block_text: str = Field(default="", max_length=5000)
    exact_text: str = Field(min_length=1, max_length=500)
    target: str = Field(default="", max_length=120)
    visualization_id: str = Field(default="", max_length=120)
    reason: str = Field(default="", max_length=1000)
    source: str = Field(default="correction", max_length=30)


class AnalyzeCandidate(StrictModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    block_id: str = Field(min_length=1, max_length=80)
    exact_text: str = Field(min_length=1, max_length=500)
    occurrence: int | None = Field(default=None, ge=1, le=100)
    concept_id: str = Field(default="", max_length=120)
    visualization_id: str = Field(min_length=1, max_length=120)
    case_id: str = Field(default="explore", max_length=30)
    focus: list[str] = Field(default_factory=list, max_length=10)
    label: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=1000)
    status: str = Field(default="candidate", max_length=30)


class AnalyzeEnvelope(StrictModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    candidates: list[AnalyzeCandidate] = Field(default_factory=list, max_length=60)
