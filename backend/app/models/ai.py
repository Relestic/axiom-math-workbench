"""Per-user model credentials.

Only the encrypted key is persisted. The plaintext key is never returned by an
API response and is never written to ModelCall/error records.
"""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, String, Text, UniqueConstraint

from .base import Base, IdMixin, TimestampMixin


class UserAICredential(Base, IdMixin, TimestampMixin):
    __tablename__ = "user_ai_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_ai_credential_user"),
    )

    user_id = Column(
        String(40),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider = Column(String(30), nullable=False, default="deepseek")
    model = Column(String(120), nullable=False, default="deepseek-chat")
    encrypted_api_key = Column(Text, nullable=False)
    key_hint = Column(String(24), nullable=False, default="")
