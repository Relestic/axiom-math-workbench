"""Background jobs, model usage, reports and audit records."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .base import Base, IdMixin, TimestampMixin, utcnow


class Job(Base, IdMixin):
    __tablename__ = "jobs"

    type = Column(String(60), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="queued", index=True)
    payload = Column(JSON, nullable=False, default=dict)
    result = Column(JSON, nullable=False, default=dict)
    error = Column(Text, nullable=False, default="")
    progress = Column(Integer, nullable=False, default=0)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=2)
    idempotency_key = Column(String(120), nullable=True, index=True)
    created_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    timeout_seconds = Column(Integer, nullable=False, default=600)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    data_origin = Column(String(20), nullable=False, default="user")


class ModelCall(Base, IdMixin):
    __tablename__ = "model_calls"

    user_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    job_id = Column(String(40), ForeignKey("jobs.id", ondelete="SET NULL"), index=True)
    provider = Column(String(80), nullable=False, default="")
    model = Column(String(120), nullable=False, default="")
    purpose = Column(String(60), nullable=False, default="")
    prompt_version = Column(String(60), nullable=False, default="")
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="ok")
    cost_estimate = Column(Integer, nullable=False, default=0)  # in 1e-6 currency units
    error = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    job = relationship("Job")


class Report(Base, IdMixin, TimestampMixin):
    __tablename__ = "reports"

    user_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    target_type = Column(String(40), nullable=False)
    target_id = Column(String(80), nullable=False)
    kind = Column(String(40), nullable=False, default="other")
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open", index=True)
    admin_note = Column(Text, nullable=False, default="")
    resolved_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class IdempotencyRecord(Base, IdMixin):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", "key", name="uq_idempotency"),
    )

    user_id = Column(String(40), nullable=False, index=True)
    endpoint = Column(String(120), nullable=False)
    key = Column(String(120), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_status = Column(Integer, nullable=False)
    response_body = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditLog(Base, IdMixin):
    __tablename__ = "audit_logs"

    actor_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action = Column(String(80), nullable=False, index=True)
    target_type = Column(String(40), nullable=False, default="")
    target_id = Column(String(60), nullable=False, default="")
    detail = Column(JSON, nullable=False, default=dict)
    request_id = Column(String(40), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
