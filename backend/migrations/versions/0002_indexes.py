"""0002 — composite indexes used by the queue and progress aggregations."""

from sqlalchemy.engine import Engine
from sqlalchemy import text


def up(engine: Engine) -> None:
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_jobs_queue ON jobs (status, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_attempts_user_created ON attempts (user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_study_events_user_created ON study_events (user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_notes_user_updated ON notes (user_id, updated_at)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
