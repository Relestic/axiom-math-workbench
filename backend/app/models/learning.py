"""Exercises, attempts, notes, events and progress."""

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


class ExerciseTemplate(Base, IdMixin, TimestampMixin):
    __tablename__ = "exercise_templates"

    slug = Column(String(80), unique=True, nullable=False)
    topic_id = Column(String(40), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    family = Column(String(80), nullable=False, default="")
    skill = Column(String(40), nullable=False, default="定义理解")
    exercise_type = Column(String(40), nullable=False, default="proof")
    difficulty = Column(Integer, nullable=False, default=2)
    allowed_refs = Column(JSON, nullable=False, default=list)
    generator = Column(JSON, nullable=False, default=dict)
    review_status = Column(String(30), nullable=False, default="reviewed")
    version = Column(Integer, nullable=False, default=1)


class Exercise(Base, IdMixin, TimestampMixin):
    __tablename__ = "exercises"
    __table_args__ = (UniqueConstraint("code", name="uq_exercise_code"),)

    topic_id = Column(String(40), nullable=False, index=True)
    template_id = Column(
        String(40), ForeignKey("exercise_templates.id", ondelete="SET NULL"), nullable=True
    )
    code = Column(String(120), nullable=False)
    title = Column(Text, nullable=False)
    statement = Column(Text, nullable=False, default="")
    domain = Column(Text, nullable=False, default="")
    difficulty = Column(Integer, nullable=False, default=2)
    skill = Column(String(40), nullable=False, default="定义理解")
    exercise_type = Column(String(40), nullable=False, default="proof")
    allowed_refs = Column(JSON, nullable=False, default=list)
    hint = Column(Text, nullable=False, default="")
    solution_steps = Column(JSON, nullable=False, default=list)
    common_errors = Column(JSON, nullable=False, default=list)
    checks = Column(JSON, nullable=False, default=list)
    answer_check = Column(JSON, nullable=False, default=dict)
    source = Column(String(30), nullable=False, default="template")
    provenance = Column(JSON, nullable=False, default=dict)
    validation = Column(JSON, nullable=False, default=dict)
    review_status = Column(String(30), nullable=False, default="auto_checked")
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="published")
    published_at = Column(DateTime(timezone=True), nullable=True)

    template = relationship("ExerciseTemplate")


class Attempt(Base, IdMixin, TimestampMixin):
    __tablename__ = "attempts"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_attempt_idempotency"),
    )

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exercise_id = Column(
        String(40), ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    exercise_version = Column(Integer, nullable=False, default=1)
    answer_text = Column(Text, nullable=False, default="")
    answer_format = Column(String(20), nullable=False, default="text")
    assistance = Column(JSON, nullable=False, default=dict)
    self_rating = Column(String(20), nullable=False, default="pending")
    status = Column(String(30), nullable=False, default="submitted")
    feedback = Column(JSON, nullable=False, default=dict)
    ai_review = Column(JSON(none_as_null=True), nullable=True)
    score = Column(Integer, nullable=True)
    error_types = Column(JSON, nullable=False, default=list)
    idempotency_key = Column(String(120), nullable=True)
    data_origin = Column(String(20), nullable=False, default="user")

    exercise = relationship("Exercise")
    events = relationship(
        "AttemptEvent",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="AttemptEvent.created_at",
    )


class AttemptEvent(Base, IdMixin):
    __tablename__ = "attempt_events"

    attempt_id = Column(
        String(40), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id = Column(String(40), nullable=False, index=True)
    exercise_id = Column(String(40), nullable=False, index=True)
    type = Column(String(40), nullable=False)
    payload = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    attempt = relationship("Attempt", back_populates="events")


class Note(Base, IdMixin, TimestampMixin):
    __tablename__ = "notes"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text = Column(Text, nullable=False)
    concept_id = Column(String(40), nullable=True, index=True)
    tags = Column(JSON, nullable=False, default=list)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    data_origin = Column(String(20), nullable=False, default="user")


class Bookmark(Base, IdMixin):
    __tablename__ = "bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_bookmark"),
    )

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_type = Column(String(30), nullable=False)
    target_id = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class StudyEvent(Base, IdMixin):
    __tablename__ = "study_events"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(40), nullable=False, index=True)
    concept_id = Column(String(40), nullable=True, index=True)
    payload = Column(JSON, nullable=False, default=dict)
    data_origin = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class CourseProgress(Base, IdMixin, TimestampMixin):
    __tablename__ = "course_progress"
    __table_args__ = (UniqueConstraint("user_id", "course_name", name="uq_course_progress"),)

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_name = Column(String(80), nullable=False, default="数学分析 II")
    week = Column(Integer, nullable=False, default=7)
    total_weeks = Column(Integer, nullable=False, default=16)
    last_page = Column(String(60), nullable=False, default="dashboard")
    last_concept_id = Column(String(40), nullable=True)
    daily_goal = Column(Integer, nullable=False, default=8)
    plan_note = Column(Text, nullable=False, default="")


class DiagnosticQuestion(Base, IdMixin):
    __tablename__ = "diagnostic_questions"

    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False, default=list)
    correct_index = Column(Integer, nullable=False, default=0)
    reason = Column(Text, nullable=False, default="")
    concept_id = Column(String(40), nullable=True)
    skill = Column(String(40), nullable=False, default="定义理解")
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="published")


class DiagnosticRun(Base, IdMixin):
    __tablename__ = "diagnostic_runs"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    answers = Column(JSON, nullable=False, default=dict)
    correct_count = Column(Integer, nullable=False, default=0)
    result = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
