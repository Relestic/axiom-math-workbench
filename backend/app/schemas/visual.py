"""Request models for visualization scenes and AI-assisted editing."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import StrictModel

PARAM_RE = re.compile(r"^[a-df-wz]$")
CURVE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,24}$")
MODE = Literal["graph", "continuity", "derivative", "integral", "taylor"]


class CurveModel(StrictModel):
    id: str
    expression: str = Field(min_length=1, max_length=300)
    label: str = Field(default="", max_length=60)
    visible: bool = True
    domainMin: float | None = Field(default=None, ge=-10000, le=10000)
    domainMax: float | None = Field(default=None, ge=-10000, le=10000)
    leftOpen: bool = False
    rightOpen: bool = False

    @field_validator("id")
    @classmethod
    def _id(cls, value: str) -> str:
        if not CURVE_ID_RE.match(value):
            raise ValueError("函数编号只能包含字母、数字、下划线和连字符，长度 1–24")
        return value

    @model_validator(mode="after")
    def _domain(self):
        if (
            self.domainMin is not None
            and self.domainMax is not None
            and self.domainMin >= self.domainMax
        ):
            raise ValueError("函数定义域下限必须小于上限")
        return self


class ParameterModel(StrictModel):
    name: str
    value: float = Field(ge=-10000, le=10000)
    min: float = Field(ge=-10000, le=10000)
    max: float = Field(ge=-10000, le=10000)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not PARAM_RE.match(value):
            raise ValueError("参数名只能是一个小写字母（a–d、f–w、z 中之一）")
        return value

    @model_validator(mode="after")
    def _range(self):
        if self.min >= self.max:
            raise ValueError(f"参数 {self.name} 的下限必须小于上限")
        if not (self.min <= self.value <= self.max):
            raise ValueError(f"参数 {self.name} 的当前值必须在其范围内")
        return self


class SceneModel(StrictModel):
    curves: list[CurveModel] = Field(min_length=1, max_length=4)
    activeId: str = Field(min_length=1, max_length=24)
    parameters: list[ParameterModel] = Field(default_factory=list, max_length=8)
    mode: MODE = "graph"
    xMin: float = Field(ge=-10000, le=10000)
    xMax: float = Field(ge=-10000, le=10000)
    yMin: float = Field(ge=-10000, le=10000)
    yMax: float = Field(ge=-10000, le=10000)
    x0: float = Field(default=0, ge=-10000, le=10000)
    epsilon: float = Field(default=0.3, ge=0.001, le=100)
    delta: float = Field(default=0.2, ge=0.001, le=100)
    h: float = Field(default=0.25, ge=0.0001, le=100)
    integralStart: float = Field(default=0, ge=-10000, le=10000)
    integralEnd: float = Field(default=1, ge=-10000, le=10000)
    subdivisions: int = Field(default=20, ge=4, le=200)
    order: int = Field(default=3, ge=1, le=5)

    @model_validator(mode="after")
    def _coherence(self):
        if self.xMax - self.xMin < 0.01:
            raise ValueError("x 轴范围跨度至少为 0.01")
        if self.yMax - self.yMin < 0.01:
            raise ValueError("y 轴范围跨度至少为 0.01")
        if self.integralStart >= self.integralEnd:
            raise ValueError("积分起点必须小于终点")
        ids = [curve.id for curve in self.curves]
        if len(set(ids)) != len(ids):
            raise ValueError("函数编号不能重复")
        if self.activeId not in ids:
            raise ValueError("当前函数不存在")
        names = [parameter.name for parameter in self.parameters]
        if len(set(names)) != len(names):
            raise ValueError("参数名称不能重复")
        return self


class ValidateSceneRequest(StrictModel):
    scene: SceneModel


class SceneCreateRequest(StrictModel):
    title: str = Field(default="", max_length=160)
    template_slug: str | None = Field(default=None, max_length=80)
    scene: SceneModel | None = None

    @model_validator(mode="after")
    def _content(self):
        if self.scene is None and not self.template_slug:
            raise ValueError("scene 与 template_slug 至少提供一个")
        return self


class SceneUpdateRequest(StrictModel):
    scene: SceneModel
    expected_version: int | None = Field(default=None, ge=1)


class ObservationCreateRequest(StrictModel):
    text: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=10)


class ConversationCreateRequest(StrictModel):
    title: str = Field(default="图像对话", max_length=200)
    scene_id: str | None = Field(default=None, max_length=40)


CONVERSATION_ACTIONS = Literal[
    "search_concepts",
    "focus_concept",
    "expand_relations",
    "open_source",
    "open_classic_case",
    "open_visualization",
    "update_visualization",
    "open_proof_step",
    "generate_exercises",
    "submit_attempt",
    "show_hint",
    "show_solution",
    "undo_action",
]


class ConversationActionRequest(StrictModel):
    action: CONVERSATION_ACTIONS
    params: dict = Field(default_factory=dict)
    message: str = Field(default="", max_length=500)


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = Field(default=None, max_length=40)
    scene: SceneModel | None = None
    history: list[dict] = Field(default_factory=list, max_length=16)


class AIPlotRequest(StrictModel):
    """Matches the legacy frontend contract at POST /api/ai/plot."""

    message: str = Field(min_length=1, max_length=2000)
    scene: SceneModel
    history: list[dict] = Field(default_factory=list, max_length=16)
    context: dict | None = None


class InterpretRequest(StrictModel):
    scene: SceneModel
    question: str = Field(default="", max_length=500)
    template_slug: str | None = Field(default=None, max_length=80)


class GenerateExercisesRequest(StrictModel):
    topic_id: str = Field(min_length=1, max_length=40)
    skill: str | None = Field(default=None, max_length=40)
    difficulty: int = Field(default=3, ge=1, le=5)
    count: int = Field(default=3, ge=1, le=10)
    focus: str = Field(default="", max_length=500)


class GenerateCounterexamplesRequest(StrictModel):
    proposition_id: str | None = Field(default=None, max_length=40)
    concept_id: str | None = Field(default=None, max_length=40)
    count: int = Field(default=3, ge=1, le=6)

    @model_validator(mode="after")
    def _target(self):
        if not self.proposition_id and not self.concept_id:
            raise ValueError("proposition_id 与 concept_id 至少提供一个")
        return self


class AttemptFeedbackRequest(StrictModel):
    force: bool = False


class VisualAnalysisQuery(StrictModel):
    expression: str = Field(min_length=1, max_length=300)
    x0: float = Field(default=0, ge=-10000, le=10000)
    epsilon: float = Field(default=0.3, ge=0.001, le=100)
    delta: float = Field(default=0.2, ge=0.001, le=100)
    x_min: float = Field(default=-3, ge=-10000, le=10000)
    x_max: float = Field(default=3, ge=-10000, le=10000)
    order: int = Field(default=3, ge=1, le=5)
    subdivisions: int = Field(default=20, ge=4, le=200)

    @model_validator(mode="after")
    def _range(self):
        if self.x_min >= self.x_max:
            raise ValueError("x_min must be smaller than x_max")
        return self
