"""0004 - per-user AI credentials (encrypted at rest)."""

from sqlalchemy.engine import Engine

from app.models.ai import UserAICredential


def up(engine: Engine) -> None:
    UserAICredential.__table__.create(bind=engine, checkfirst=True)
