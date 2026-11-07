"""0003 — content version on textbooks (publish/withdraw snapshots)."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def up(engine: Engine) -> None:
    inspector = inspect(engine)
    if "textbooks" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("textbooks")}
    if "version" in columns:
        return
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE textbooks ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        )
