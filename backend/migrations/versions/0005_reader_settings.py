"""0005 - reader prompt rules and correction examples."""

from sqlalchemy.engine import Engine

from app.models.reader import ReaderExample, ReaderRule


def up(engine: Engine) -> None:
    ReaderRule.__table__.create(bind=engine, checkfirst=True)
    ReaderExample.__table__.create(bind=engine, checkfirst=True)
