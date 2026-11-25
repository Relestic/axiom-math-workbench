"""Request models for accounts and invites."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from .common import StrictModel, validate_password


class RegisterRequest(StrictModel):
    invite_code: str = Field(min_length=4, max_length=80)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(min_length=1, max_length=40)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        from .common import EMAIL_RE

        value = value.strip().lower()
        if not EMAIL_RE.match(value):
            raise ValueError("邮箱格式不正确")
        return value

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return validate_password(value)


class LoginRequest(StrictModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.strip().lower()


class RefreshRequest(StrictModel):
    refresh_token: str = Field(min_length=20, max_length=300)


class LogoutRequest(StrictModel):
    refresh_token: str | None = Field(default=None, max_length=300)


class UpdateMeRequest(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    course_name: str | None = Field(default=None, min_length=1, max_length=80)
    week: int | None = Field(default=None, ge=1, le=60)
    total_weeks: int | None = Field(default=None, ge=1, le=60)
    daily_goal: int | None = Field(default=None, ge=1, le=50)


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)

    @field_validator("new_password")
    @classmethod
    def _password(cls, value: str) -> str:
        return validate_password(value)


class InviteCreateRequest(StrictModel):
    role: Literal["student", "admin"] = "student"
    note: str = Field(default="", max_length=200)
    expires_in_days: int = Field(default=14, ge=1, le=365)
