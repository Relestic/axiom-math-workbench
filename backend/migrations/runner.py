"""Tiny forward-only migration runner.

The production plan in ``readme.md`` names Alembic. Alembic is not available in
the offline review environment, so this runner provides the same operational
contract: ordered revisions, a ``schema_migrations`` ledger, and idempotent
forward application. Swapping in Alembic later only requires replacing this file.
"""

from __future__ import annotations

import importlib
import pkgutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.models import Base

VERSIONS_PACKAGE = "migrations.versions"


def _ensure_ledger(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    revision VARCHAR(80) PRIMARY KEY,
                    applied_at VARCHAR(40) NOT NULL
                )
                """
            )
        )


def _applied(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT revision FROM schema_migrations")).fetchall()
    return {row[0] for row in rows}


def discover() -> list[tuple[str, object]]:
    package = importlib.import_module(VERSIONS_PACKAGE)
    found: list[tuple[str, object]] = []
    for info in pkgutil.iter_modules(package.__path__):
        if not info.name[:1].isdigit():
            continue
        module = importlib.import_module(f"{VERSIONS_PACKAGE}.{info.name}")
        up = getattr(module, "up", None)
        if up is None:
            continue
        found.append((info.name, up))
    return sorted(found, key=lambda item: item[0])


def migrate(engine: Engine) -> list[str]:
    Base.metadata.create_all(engine)
    _ensure_ledger(engine)
    applied = _applied(engine)
    executed: list[str] = []
    for revision, up in discover():
        if revision in applied:
            continue
        up(engine)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO schema_migrations (revision, applied_at) VALUES (:r, :t)"
                ),
                {"r": revision, "t": datetime.now(timezone.utc).isoformat()},
            )
        executed.append(revision)
    return executed


def current(engine: Engine) -> list[str]:
    try:
        return sorted(_applied(engine))
    except Exception:
        return []


def reset_ledger(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS schema_migrations"))
