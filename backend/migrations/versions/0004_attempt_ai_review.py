"""Persist optional step-by-step reviews on existing proof attempts."""
from sqlalchemy import inspect
from sqlalchemy.engine import Engine


def up(engine: Engine) -> None:
    if "ai_review" not in {c["name"] for c in inspect(engine).get_columns("attempts")}:
        with engine.begin() as conn:
            conn.exec_driver_sql("ALTER TABLE attempts ADD COLUMN ai_review JSON")
