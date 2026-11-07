"""Shared Pydantic request models."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class PageQuery(StrictModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=100000)

    @property
    def capped_limit(self) -> int:
        return min(self.limit, 100)


class EmailField(StrictModel):
    email: str = Field(min_length=5, max_length=255)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_RE.match(value):
            raise ValueError("邮箱格式不正确")
        return value


def validate_password(value: str) -> str:
    if len(value) < 10:
        raise ValueError("密码至少需要 10 个字符")
    if len(value) > 200:
        raise ValueError("密码过长")
    return value


class DeletedResponse(StrictModel):
    deleted: bool = True


class PageMeta(StrictModel):
    total: int
    limit: int
    offset: int
    next_offset: int | None = None


class ScopeLiteral(StrictModel):
    scope: Literal["all", "mvp", "prerequisite", "extension"] = "all"


JsonDict = dict[str, Any]
