from __future__ import annotations

import shutil
import sys
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app import create_app  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.db import reset_db, session_scope  # noqa: E402
from app.models import CourseProgress, User  # noqa: E402
from app.seed.loader import seed_all  # noqa: E402

VAR = BACKEND / "var" / "pytest"
VAR.mkdir(parents=True, exist_ok=True)


@pytest.fixture()
def app():
    run_dir = VAR / uuid.uuid4().hex
    run_dir.mkdir(parents=True, exist_ok=True)
    application = create_app(
        {
            "database_url": "sqlite:///" + str(run_dir / "axiom.db"),
            "data_dir": run_dir,
            "testing": True,
            "worker_enabled": False,
            "worker_sync": True,
            "ai_provider": "mock",
            "secret_key": "test-secret-key",
            "admin_email": "admin@axiom.test",
            "admin_password": "admin-password-2026",
            "demo_invite_code": "AXIOM-TEST-INVITE",
            "auto_migrate": True,
            "seed_on_start": False,
        }
    )
    with application.app_context():
        with session_scope() as session:
            seed_all(session, application.config["AXIOM"], with_demo=True)
        # A second student for ownership checks.
        with session_scope() as session:
            if session.query(User).filter_by(email="second@axiom.test").first() is None:
                second = User(
                    email="second@axiom.test",
                    password_hash=hash_password("second-password-2026"),
                    display_name="第二学生",
                    role="student",
                    week=7,
                )
                session.add(second)
                session.flush()
                session.add(
                    CourseProgress(
                        user_id=second.id,
                        course_name=second.course_name,
                        week=7,
                        total_weeks=16,
                    )
                )
    for limiter in application.extensions["axiom_limiters"].values():
        limiter.reset()
    yield application
    reset_db()
    shutil.rmtree(run_dir, ignore_errors=True)


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


@pytest.fixture()
def student_headers(client):
    return login(client, "demo@axiom.local", "axiom-demo-2026")


@pytest.fixture()
def second_headers(client):
    return login(client, "second@axiom.test", "second-password-2026")


@pytest.fixture()
def admin_headers(client):
    return login(client, "admin@axiom.test", "admin-password-2026")
