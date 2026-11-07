"""Textbook, curriculum, proof and classic-case content."""

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


class Textbook(Base, IdMixin, TimestampMixin):
    __tablename__ = "textbooks"

    slug = Column(String(80), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    edition = Column(String(80), nullable=False, default="")
    author = Column(String(160), nullable=False, default="")
    subject = Column(String(80), nullable=False, default="数学分析")
    is_primary = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="draft")
    page_count = Column(Integer, nullable=True)
    parse_state = Column(String(30), nullable=False, default="not_uploaded")
    parse_meta = Column(JSON, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    source_note = Column(Text, nullable=False, default="")
    data_origin = Column(String(20), nullable=False, default="seed")

    chapters = relationship(
        "Chapter", back_populates="textbook", cascade="all, delete-orphan", order_by="Chapter.sort_order"
    )


class Chapter(Base, IdMixin, TimestampMixin):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("textbook_id", "number", name="uq_chapter_number"),)

    textbook_id = Column(
        String(40), ForeignKey("textbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number = Column(Integer, nullable=False)
    title = Column(String(160), nullable=False)
    summary = Column(Text, nullable=False, default="")
    week_start = Column(Integer, nullable=True)
    week_end = Column(Integer, nullable=True)
    source_page_start = Column(Integer, nullable=True)
    source_page_end = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="published")

    textbook = relationship("Textbook", back_populates="chapters")
    sections = relationship(
        "Section", back_populates="chapter", cascade="all, delete-orphan", order_by="Section.sort_order"
    )
    concepts = relationship("Concept", back_populates="chapter")


class Section(Base, IdMixin, TimestampMixin):
    __tablename__ = "sections"

    chapter_id = Column(
        String(40), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(200), nullable=False)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    printed_page_start = Column(Integer, nullable=True)
    printed_page_end = Column(Integer, nullable=True)
    text = Column(Text, nullable=False, default="")
    anchors = Column(JSON, nullable=False, default=list)
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="published")
    version = Column(Integer, nullable=False, default=1)

    chapter = relationship("Chapter", back_populates="sections")


class Concept(Base, IdMixin, TimestampMixin):
    __tablename__ = "concepts"

    chapter_id = Column(String(40), ForeignKey("chapters.id", ondelete="SET NULL"), index=True)
    name = Column(String(160), nullable=False)
    short_name = Column(String(80), nullable=False, default="")
    english_name = Column(String(160), nullable=False, default="")
    kind = Column(String(30), nullable=False, default="definition")
    scope = Column(String(30), nullable=False, default="mvp_core")
    summary = Column(Text, nullable=False, default="")
    definition = Column(Text, nullable=False, default="")
    formula = Column(Text, nullable=False, default="")
    quantifiers = Column(JSON, nullable=False, default=list)
    symbols = Column(JSON, nullable=False, default=list)
    conditions = Column(JSON, nullable=False, default=list)
    goals = Column(JSON, nullable=False, default=list)
    prerequisites = Column(JSON, nullable=False, default=list)
    tags = Column(JSON, nullable=False, default=list)
    week = Column(Integer, nullable=True)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    review_status = Column(String(30), nullable=False, default="draft")
    version = Column(Integer, nullable=False, default=1)
    data_origin = Column(String(20), nullable=False, default="seed")
    created_by_id = Column(String(40), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    chapter = relationship("Chapter", back_populates="concepts")
    proofs = relationship("Proof", back_populates="concept", cascade="all, delete-orphan")
    propositions = relationship("Proposition", back_populates="concept")
    classics = relationship("Classic", back_populates="concept")


class Proof(Base, IdMixin, TimestampMixin):
    __tablename__ = "proofs"

    concept_id = Column(
        String(40), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(200), nullable=False)
    idea = Column(Text, nullable=False, default="")
    steps = Column(JSON, nullable=False, default=list)
    key_construction = Column(Text, nullable=False, default="")
    tools = Column(JSON, nullable=False, default=list)
    source_page = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="published")
    review_status = Column(String(30), nullable=False, default="reviewed")
    version = Column(Integer, nullable=False, default=1)

    concept = relationship("Concept", back_populates="proofs")


class Proposition(Base, IdMixin, TimestampMixin):
    __tablename__ = "propositions"

    concept_id = Column(String(40), ForeignKey("concepts.id", ondelete="SET NULL"), index=True)
    statement = Column(Text, nullable=False)
    truth = Column(String(20), nullable=False, default="undetermined")
    given_text = Column(Text, nullable=False, default="")
    desired_text = Column(Text, nullable=False, default="")
    missing_conditions = Column(JSON, nullable=False, default=list)
    explanation = Column(Text, nullable=False, default="")
    source_page = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="published")
    review_status = Column(String(30), nullable=False, default="reviewed")
    version = Column(Integer, nullable=False, default=1)

    concept = relationship("Concept", back_populates="propositions")


class Classic(Base, IdMixin, TimestampMixin):
    __tablename__ = "classics"

    slug = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    english_name = Column(String(200), nullable=False, default="")
    kind = Column(String(30), nullable=False, default="example")
    object_definition = Column(Text, nullable=False, default="")
    properties = Column(JSON, nullable=False, default=list)
    refutes_proposition_id = Column(
        String(40), ForeignKey("propositions.id", ondelete="SET NULL"), nullable=True
    )
    refutes_text = Column(Text, nullable=False, default="")
    concept_id = Column(String(40), ForeignKey("concepts.id", ondelete="SET NULL"), index=True)
    source_title = Column(String(200), nullable=False, default="")
    source_url = Column(String(500), nullable=False, default="")
    source_page = Column(Integer, nullable=True)
    image_kind = Column(String(30), nullable=False, default="redrawn")
    license = Column(String(120), nullable=False, default="项目重绘")
    historical_note = Column(Text, nullable=False, default="")
    display_limit = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default="published")
    review_status = Column(String(30), nullable=False, default="reviewed")
    version = Column(Integer, nullable=False, default=1)
    data_origin = Column(String(20), nullable=False, default="seed")

    concept = relationship("Concept", back_populates="classics")


class Tool(Base, IdMixin):
    __tablename__ = "tools"

    slug = Column(String(80), unique=True, nullable=False)
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=False, default="")
    unlock_week = Column(Integer, nullable=False, default=1)
    scope = Column(String(30), nullable=False, default="mvp_core")
    status = Column(String(20), nullable=False, default="published")


class Asset(Base, IdMixin):
    __tablename__ = "assets"

    owner_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    kind = Column(String(30), nullable=False, default="file")
    filename = Column(String(255), nullable=False)
    mime = Column(String(120), nullable=False, default="application/octet-stream")
    size_bytes = Column(Integer, nullable=False, default=0)
    sha256 = Column(String(64), nullable=False, index=True)
    storage_path = Column(String(500), nullable=False)
    visibility = Column(String(20), nullable=False, default="private")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ContentRevision(Base, IdMixin):
    __tablename__ = "content_revisions"

    target_type = Column(String(40), nullable=False, index=True)
    target_id = Column(String(40), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False, default=dict)
    status = Column(String(30), nullable=False, default="draft")
    note = Column(Text, nullable=False, default="")
    created_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by_id = Column(String(40), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
