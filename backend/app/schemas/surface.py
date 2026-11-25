"""Schemas for the interactive 3D surface workspace."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import StrictModel

PALETTES = Literal["violet", "teal", "amber", "mono"]


class SurfaceView(StrictModel):
    azimuth: float = Field(default=45, ge=0, le=360)
    elevation: float = Field(default=28, ge=5, le=85)
    heightScale: float = Field(default=1, ge=0.2, le=3)
    zoom: float = Field(default=1, ge=0.5, le=2)


class SurfaceDisplay(StrictModel):
    opacity: float = Field(default=0.88, ge=0.2, le=1)
    wireframe: bool = True
    showAxes: bool = True
    palette: PALETTES = "violet"


class SurfaceScene(StrictModel):
    expression: str = Field(min_length=1, max_length=300)
    xMin: float = Field(default=-1.6, ge=-20, le=20)
    xMax: float = Field(default=1.6, ge=-20, le=20)
    yMin: float = Field(default=-1.6, ge=-20, le=20)
    yMax: float = Field(default=1.6, ge=-20, le=20)
    resolution: int = Field(default=30, ge=10, le=64)
    view: SurfaceView = Field(default_factory=SurfaceView)
    display: SurfaceDisplay = Field(default_factory=SurfaceDisplay)

    @field_validator("expression")
    @classmethod
    def _expression(cls, value: str) -> str:
        from ..adapters.math import MathError, compile_surface_expression

        try:
            compile_surface_expression(value)
        except MathError as exc:
            raise ValueError(str(exc)) from exc
        return value.strip()

    @model_validator(mode="after")
    def _ranges(self):
        if self.xMax - self.xMin < 0.2:
            raise ValueError("x 范围跨度至少为 0.2")
        if self.yMax - self.yMin < 0.2:
            raise ValueError("y 范围跨度至少为 0.2")
        return self


class SurfaceAIRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    scene: SurfaceScene
    history: list[dict] = Field(default_factory=list, max_length=16)
