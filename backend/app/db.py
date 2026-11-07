"""Database engine and session management.

SQLite is the default so the service starts with zero infrastructure. The same
models run on PostgreSQL by setting AXIOM_DB_URL; JSON columns map to JSONB via
the SQLAlchemy JSON type on PostgreSQL.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from flask import g, has_app_context
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None
_engine_url: str | None = None


def _sqlite_pragmas(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def create_db_engine(database_url: str) -> Engine:
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):
        event.listen(engine, "connect", _sqlite_pragmas)
    return engine


def init_db(database_url: str, *, force: bool = False) -> Engine:
    """Initialise the module-level engine. Tests call this per app instance."""

    global _engine, _session_factory, _engine_url
    if _engine is not None and _engine_url == database_url and not force:
        return _engine
    if _engine is not None:
        _engine.dispose()
    _engine = create_db_engine(database_url)
    _engine_url = database_url
    _session_factory = sessionmaker(
        bind=_engine, expire_on_commit=False, autoflush=False, future=True
    )
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("database has not been initialised")
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    if _session_factory is None:
        raise RuntimeError("database has not been initialised")
    return _session_factory


def get_session() -> Session:
    """Request-scoped session, closed by the Flask teardown hook."""

    if not has_app_context():
        return get_session_factory()()
    if "db_session" not in g:
        g.db_session = get_session_factory()()
    return g.db_session


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transaction scope for workers, CLI and background jobs."""

    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def close_session(_exc: BaseException | None = None) -> None:
    if has_app_context() and "db_session" in g:
        session = g.db_session
        g.pop("db_session", None)
        try:
            session.close()
        finally:
            pass


def reset_db() -> None:
    """Drop module state; used by tests."""

    global _engine, _session_factory, _engine_url
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
    _engine_url = None
