"""Accounts, invites and refresh tokens."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from .base import Base, IdMixin, TimestampMixin, utcnow


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(80), nullable=False)
    role = Column(String(20), nullable=False, default="student")
    course_name = Column(String(80), nullable=False, default="数学分析 II")
    week = Column(Integer, nullable=False, default=7)
    total_weeks = Column(Integer, nullable=False, default=16)
    is_active = Column(Boolean, nullable=False, default=True)
    data_origin = Column(String(20), nullable=False, default="user")
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    settings = Column(JSON, nullable=False, default=dict)

    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class Invite(Base, IdMixin):
    __tablename__ = "invites"

    code_hash = Column(String(128), unique=True, nullable=False)
    code_prefix = Column(String(16), nullable=False)
    role = Column(String(20), nullable=False, default="student")
    note = Column(String(200), nullable=False, default="")
    created_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    used_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class RefreshToken(Base, IdMixin):
    __tablename__ = "refresh_tokens"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash = Column(String(128), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_id = Column(String(40), nullable=True)
    user_agent = Column(String(255), nullable=False, default="")
    ip = Column(String(64), nullable=False, default="")

    user = relationship("User", back_populates="refresh_tokens")


class AuthEvent(Base, IdMixin):
    __tablename__ = "auth_events"

    user_id = Column(String(40), nullable=True, index=True)
    email = Column(String(255), nullable=False, default="")
    kind = Column(String(40), nullable=False)
    ip = Column(String(64), nullable=False, default="")
    user_agent = Column(String(255), nullable=False, default="")
    detail = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
