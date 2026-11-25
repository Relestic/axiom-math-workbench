"""0001 — baseline schema generated from the SQLAlchemy metadata."""

from sqlalchemy.engine import Engine

from app.models import Base


def up(engine: Engine) -> None:
    Base.metadata.create_all(engine)
