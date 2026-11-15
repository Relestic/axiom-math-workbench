"""Per-user prompt rules and correction examples for the Word reader."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text

from .base import Base, IdMixin, TimestampMixin


class ReaderRule(Base, IdMixin, TimestampMixin):
    __tablename__ = "reader_rules"

    user_id = Column(
        String(40),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task = Column(String(30), nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    version = Column(Integer, nullable=False, default=1)
    active = Column(Boolean, nullable=False, default=True)


class ReaderExample(Base, IdMixin, TimestampMixin):
    __tablename__ = "reader_examples"

    user_id = Column(
        String(40),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task = Column(String(30), nullable=False, default="recognition", index=True)
    block_text = Column(Text, nullable=False, default="")
    exact_text = Column(Text, nullable=False, default="")
    target = Column(String(120), nullable=False, default="")
    visualization_id = Column(String(120), nullable=False, default="")
    reason = Column(Text, nullable=False, default="")
    source = Column(String(30), nullable=False, default="correction")
