"""Declarative teaching diagrams. Only these geometric primitives reach the renderer."""
import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DiagramModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def omit_absent_fields(cls, value):
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("可选图解字段应省略或提供有效值")
        return value


class ViewBox(DiagramModel):
    xMin: float
    xMax: float
    yMin: float
    yMax: float

    @model_validator(mode="after")
    def valid_span(self):
        for span in (self.xMax - self.xMin, self.yMax - self.yMin):
            if span <= 0 or not math.isfinite(span):
                raise ValueError("图解坐标跨度必须是有限正数")
        return self


NodeId = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,32}$")]
Label = Annotated[str, Field(max_length=160)]
Pair = Annotated[list[float], Field(min_length=2, max_length=2)]


class Tick(DiagramModel):
    axis: Literal["x", "y"]
    at: float
    label: Label


class Axes(DiagramModel):
    show: bool
    xLabel: Label | None = None
    yLabel: Label | None = None
    ticks: list[Tick] = Field(default_factory=list, max_length=80)


class Node(DiagramModel):
    id: NodeId
    tone: Literal["primary", "teal", "amber", "rose", "muted"] = "primary"


class Shape(Node):
    label: Label | None = None


class Curve(Shape):
    kind: Literal["curve"]
    points: list[Pair] = Field(min_length=2, max_length=40)
    smooth: bool = False
    dashed: bool = False


class Segment(Shape):
    kind: Literal["segment"]
    start: Pair = Field(alias="from")
    to: Pair
    dashed: bool = False
    arrow: bool = False


class Point(Shape):
    kind: Literal["point"]
    x: float
    y: float
    hollow: bool = False


class Pattern(Shape):
    kind: Literal["pattern"]
    preset: Literal["dirichlet_layers", "thomae_stems", "step_bars"]
    xMin: float
    xMax: float
    yHigh: float = 1
    yLow: float = 0
    density: int = Field(default=16, ge=4, le=40)


class Region(Shape):
    kind: Literal["region"]
    xMin: float
    xMax: float
    yMin: float
    yMax: float


class TextLabel(Node):
    kind: Literal["label"]
    x: float
    y: float
    text: Label


DiagramNode = Annotated[Curve | Segment | Point | Pattern | Region | TextLabel, Field(discriminator="kind")]


class DiagramScene(DiagramModel):
    version: Literal[1]
    title: str = Field(max_length=80)
    caption: str = Field(max_length=240)
    viewBox: ViewBox
    axes: Axes | None = None
    nodes: list[DiagramNode] = Field(max_length=24)

    @model_validator(mode="after")
    def unique_nodes(self):
        if len({node.id for node in self.nodes}) != len(self.nodes):
            raise ValueError("图元编号重复")
        return self


class DiagramRequest(DiagramModel):
    message: str = Field(min_length=1, max_length=2000)


DIAGRAM_FORMAT = """
图解为 JSON 对象 {version:1,title(最多80字),caption(最多240字),viewBox:{xMin,xMax,yMin,yMax},
axes?:{show,xLabel?,yLabel?,ticks?:[{axis:"x"或"y",at,label}]},nodes:[...]}。轴范围递增。
最多24个图元，每个有唯一 id（1–32位英文、数字、下划线或连字符），可选 tone 为 primary/teal/amber/rose/muted。
kind 为 curve 时用 points（2–40个[x,y]）、smooth?、dashed?；segment 用 from、to 坐标对和 arrow?、dashed?；
point 用 x,y,hollow?；pattern 用 preset（dirichlet_layers/thomae_stems/step_bars）、xMin,xMax,yHigh?,yLow?,density?（4–40整数）；
region 用 xMin,xMax,yMin,yMax；label 用 x,y,text。除 label 外均可含 label 文字。数学标签用 $...$。
只绘概念关系，稠密点用有限示意并在 caption 说明；不要输出 SVG、HTML、代码或未知字段。"""
