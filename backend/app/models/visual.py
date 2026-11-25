"""Visualization templates, user scenes, versions and conversations."""

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


class VisualTemplate(Base, IdMixin, TimestampMixin):
    __tablename__ = "visual_templates"

    slug = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    family = Column(String(80), nullable=False, default="")
    goal = Column(Text, nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    scene = Column(JSON, nullable=False, default=dict)
    meta = Column(JSON, nullable=False, default=dict)
    concept_ids = Column(JSON, nullable=False, default=list)
    proof_step_ref = Column(String(200), nullable=False, default="")
    supported_range = Column(Text, nullable=False, default="")
    display_limits = Column(Text, nullable=False, default="")
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="published")


class VisualScene(Base, IdMixin, TimestampMixin):
    __tablename__ = "visual_scenes"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id = Column(
        String(40), ForeignKey("visual_templates.id", ondelete="SET NULL"), nullable=True
    )
    title = Column(String(160), nullable=False, default="")
    scene = Column(JSON, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True)
    data_origin = Column(String(20), nullable=False, default="user")

    template = relationship("VisualTemplate")
    versions = relationship(
        "SceneVersion",
        back_populates="parent_scene",
        cascade="all, delete-orphan",
        order_by="SceneVersion.version",
    )
    observations = relationship(
        "Observation",
        back_populates="scene",
        cascade="all, delete-orphan",
        order_by="Observation.created_at",
    )


class SceneVersion(Base, IdMixin):
    __tablename__ = "scene_versions"
    __table_args__ = (UniqueConstraint("scene_id", "version", name="uq_scene_version"),)

    scene_id = Column(
        String(40), ForeignKey("visual_scenes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version = Column(Integer, nullable=False)
    scene = Column(JSON, nullable=False, default=dict)
    origin = Column(String(30), nullable=False, default="user")
    message = Column(Text, nullable=False, default="")
    created_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    parent_scene = relationship("VisualScene", back_populates="versions")

class Observation(Base, IdMixin):
    __tablename__ = "observations"

    scene_id = Column(
        String(40), ForeignKey("visual_scenes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    tags = Column(JSON, nullable=False, default=list)
    data_origin = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    scene = relationship("VisualScene", back_populates="observations")


class Conversation(Base, IdMixin, TimestampMixin):
    __tablename__ = "conversations"

    user_id = Column(
        String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(200), nullable=False, default="图像对话")
    scene_id = Column(
        String(40), ForeignKey("visual_scenes.id", ondelete="SET NULL"), nullable=True
    )
    context = Column(JSON, nullable=False, default=dict)
    data_origin = Column(String(20), nullable=False, default="user")

    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.created_at",
    )
    scene = relationship("VisualScene")


class ConversationMessage(Base, IdMixin):
    __tablename__ = "conversation_messages"

    conversation_id = Column(
        String(40), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False, default="")
    action = Column(JSON, nullable=False, default=dict)
    state_version = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")
