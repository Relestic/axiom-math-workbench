"""Request models for catalog, content, graph and admin authoring."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from .common import PageQuery, StrictModel

Scope = Literal["mvp_core", "mvp_optional", "prerequisite", "v1_extension"]
Status = Literal["draft", "published", "withdrawn"]
ReviewStatus = Literal["draft", "auto_checked", "reviewed", "withdrawn"]
Relation = Literal[
    "belongs_to",
    "equivalent_to",
    "prerequisite_for",
    "uses_in_proof",
    "implies",
    "example_of",
    "counterexample_to",
    "illustrates",
    "contrasts_with",
    "generalizes",
    "exercises",
]


class ConceptListQuery(PageQuery):
    chapter: str | None = Field(default=None, max_length=40)
    scope: Scope | None = None
    kind: str | None = Field(default=None, max_length=30)
    query: str | None = Field(default=None, max_length=120)
    include_extension: bool = False


class SearchQuery(StrictModel):
    q: str = Field(min_length=1, max_length=120)
    limit: int = Field(default=20, ge=1, le=50)
    types: str = Field(default="concept,classic,proposition,proof,exercise", max_length=120)


class GraphQuery(StrictModel):
    scope: Literal["course", "all"] = "course"
    include_examples: bool = True
    include_extensions: bool = False
    unlocked_only: bool = False
    relation: Relation | None = None


class GraphPathQuery(StrictModel):
    from_node: str = Field(min_length=1, max_length=40)
    to_node: str = Field(min_length=1, max_length=40)
    max_depth: int = Field(default=6, ge=1, le=12)


class TextbookCreateRequest(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    edition: str = Field(default="", max_length=80)
    author: str = Field(default="", max_length=160)
    subject: str = Field(default="数学分析", max_length=80)
    page_count: int | None = Field(default=None, ge=1, le=5000)
    source_note: str = Field(default="", max_length=2000)


class ChapterCreateRequest(StrictModel):
    number: int = Field(ge=1, le=200)
    title: str = Field(min_length=1, max_length=160)
    summary: str = Field(default="", max_length=4000)
    week_start: int | None = Field(default=None, ge=1, le=60)
    week_end: int | None = Field(default=None, ge=1, le=60)
    source_page_start: int | None = Field(default=None, ge=1, le=5000)
    source_page_end: int | None = Field(default=None, ge=1, le=5000)
    sort_order: int = Field(default=0, ge=0, le=1000)

    @model_validator(mode="after")
    def _weeks(self):
        if (
            self.week_start is not None
            and self.week_end is not None
            and self.week_start > self.week_end
        ):
            raise ValueError("week_start must not exceed week_end")
        return self


class SectionCreateRequest(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    page_start: int | None = Field(default=None, ge=1, le=5000)
    page_end: int | None = Field(default=None, ge=1, le=5000)
    printed_page_start: int | None = Field(default=None, ge=1, le=5000)
    printed_page_end: int | None = Field(default=None, ge=1, le=5000)
    text: str = Field(default="", max_length=200000)
    anchors: list[dict[str, Any]] = Field(default_factory=list)
    sort_order: int = Field(default=0, ge=0, le=1000)


class SectionUpdateRequest(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    page_start: int | None = Field(default=None, ge=1, le=5000)
    page_end: int | None = Field(default=None, ge=1, le=5000)
    text: str | None = Field(default=None, max_length=200000)
    anchors: list[dict[str, Any]] | None = None
    status: Status | None = None


class ConceptUpsertRequest(StrictModel):
    id: str | None = Field(default=None, min_length=2, max_length=40, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    chapter_id: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=160)
    short_name: str = Field(default="", max_length=80)
    english_name: str = Field(default="", max_length=160)
    kind: Literal["definition", "theorem", "method", "prerequisite", "extension"] = "definition"
    scope: Scope = "mvp_core"
    summary: str = Field(default="", max_length=4000)
    definition: str = Field(default="", max_length=20000)
    formula: str = Field(default="", max_length=4000)
    quantifiers: list[dict[str, Any]] = Field(default_factory=list)
    symbols: list[dict[str, Any]] = Field(default_factory=list)
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    week: int | None = Field(default=None, ge=1, le=60)
    page_start: int | None = Field(default=None, ge=1, le=5000)
    page_end: int | None = Field(default=None, ge=1, le=5000)
    status: Status = "draft"
    review_status: ReviewStatus = "draft"
    sort_order: int = Field(default=0, ge=0, le=1000)


class ProofCreateRequest(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    idea: str = Field(default="", max_length=8000)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    key_construction: str = Field(default="", max_length=4000)
    tools: list[str] = Field(default_factory=list)
    source_page: int | None = Field(default=None, ge=1, le=5000)
    review_status: ReviewStatus = "reviewed"


class PropositionCreateRequest(StrictModel):
    statement: str = Field(min_length=1, max_length=4000)
    truth: Literal["true", "false", "undetermined"] = "undetermined"
    given_text: str = Field(default="", max_length=2000)
    desired_text: str = Field(default="", max_length=2000)
    missing_conditions: list[str] = Field(default_factory=list)
    explanation: str = Field(default="", max_length=8000)
    source_page: int | None = Field(default=None, ge=1, le=5000)


class ClassicCreateRequest(StrictModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    name: str = Field(min_length=1, max_length=200)
    english_name: str = Field(default="", max_length=200)
    kind: Literal["example", "counterexample", "theorem", "construction"] = "example"
    object_definition: str = Field(default="", max_length=8000)
    properties: list[dict[str, Any]] = Field(default_factory=list)
    refutes_proposition_id: str | None = Field(default=None, max_length=40)
    refutes_text: str = Field(default="", max_length=4000)
    concept_id: str | None = Field(default=None, max_length=40)
    source_title: str = Field(default="", max_length=200)
    source_url: str = Field(default="", max_length=500)
    source_page: int | None = Field(default=None, ge=1, le=5000)
    image_kind: Literal["historical", "textbook", "redrawn", "interactive"] = "redrawn"
    license: str = Field(default="项目重绘", max_length=120)
    historical_note: str = Field(default="", max_length=8000)
    display_limit: str = Field(default="", max_length=2000)


class ExerciseCreateRequest(StrictModel):
    topic_id: str = Field(min_length=1, max_length=40)
    code: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    title: str = Field(min_length=1, max_length=2000)
    statement: str = Field(default="", max_length=8000)
    domain: str = Field(default="", max_length=2000)
    difficulty: int = Field(default=2, ge=1, le=5)
    skill: Literal[
        "定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移", "计算与论证"
    ] = "独立证明"
    exercise_type: Literal[
        "definition", "judge", "proof_completion", "proof", "condition_variant", "computation", "transfer"
    ] = "proof"
    allowed_refs: list[str] = Field(default_factory=list)
    hint: str = Field(default="", max_length=4000)
    solution_steps: list[dict[str, Any]] = Field(default_factory=list)
    common_errors: list[dict[str, Any]] = Field(default_factory=list)
    checks: list[str] = Field(default_factory=list)
    answer_check: dict[str, Any] = Field(default_factory=dict)
    source: Literal["textbook", "adapted", "template", "ai", "manual"] = "manual"
    review_status: ReviewStatus = "draft"


class PublishRequest(StrictModel):
    status: Status
    note: str = Field(default="", max_length=2000)


class GraphNodeCreateRequest(StrictModel):
    id: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    name: str = Field(min_length=1, max_length=160)
    kind: Literal["concept", "case", "extension", "prerequisite"] = "concept"
    scope: Scope = "mvp_core"
    description: str = Field(default="", max_length=1000)
    detail: str = Field(default="", max_length=4000)
    concept_id: str | None = Field(default=None, max_length=40)
    classic_id: str | None = Field(default=None, max_length=40)
    x: float = Field(default=0, ge=-5000, le=5000)
    y: float = Field(default=0, ge=-5000, le=5000)
    page: int | None = Field(default=None, ge=1, le=5000)
    week: int | None = Field(default=None, ge=1, le=60)


class GraphEdgeCreateRequest(StrictModel):
    from_node_id: str = Field(min_length=1, max_length=40)
    to_node_id: str = Field(min_length=1, max_length=40)
    relation: Relation
    condition: str = Field(default="", max_length=2000)
    evidence: str = Field(default="", max_length=2000)
    source_page: int | None = Field(default=None, ge=1, le=5000)
    provenance: Literal["textbook", "manual", "ai"] = "manual"
    review_status: ReviewStatus = "reviewed"


class ImportSection(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    page_start: int | None = Field(default=None, ge=1, le=5000)
    page_end: int | None = Field(default=None, ge=1, le=5000)
    text: str = Field(default="", max_length=200000)


class ImportChapter(StrictModel):
    number: int = Field(ge=1, le=200)
    title: str = Field(min_length=1, max_length=160)
    summary: str = Field(default="", max_length=4000)
    source_page_start: int | None = Field(default=None, ge=1, le=5000)
    source_page_end: int | None = Field(default=None, ge=1, le=5000)
    sections: list[ImportSection] = Field(default_factory=list)


class ImportTextRequest(StrictModel):
    textbook_slug: str = Field(min_length=2, max_length=80)
    chapters: list[ImportChapter] = Field(min_length=1, max_length=100)
    replace: bool = False
