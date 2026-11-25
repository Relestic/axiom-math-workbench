import hashlib
import io
import json
import zipfile

from app.db import get_engine


def upload(client, payload, preview=False):
    return client.post("/api/v1/archive/import" + ("?validate=1" if preview else ""),
                       data={"archive": (io.BytesIO(payload), "learning.zip")})


def test_archive_roundtrip_and_validation(app, client):
    app.config["AXIOM"].local_mode = True
    storage = {"axiom-offline-bookmarks": '["uniform"]', "axiom-draft-uniform-2": "ε"}
    exported = client.post("/api/v1/archive/export", json={"storage": storage})
    assert exported.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exported.data)) as archive:
        assert set(archive.namelist()) == {"learning.sqlite", "learning.json"}
        manifest = json.loads(archive.read("learning.json"))
        assert manifest["storage"] == storage
    engine = get_engine()
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE users SET display_name='archive-test' WHERE email='demo@axiom.local'")
    assert upload(client, exported.data, preview=True).get_json()["storage"] == storage
    with engine.connect() as conn:
        assert conn.exec_driver_sql("SELECT display_name FROM users WHERE email='demo@axiom.local'").scalar() == "archive-test"
    assert upload(client, exported.data).get_json() == {"ok": True}
    with engine.connect() as conn:
        assert conn.exec_driver_sql("SELECT display_name FROM users WHERE email='demo@axiom.local'").scalar() != "archive-test"
    assert upload(client, b"invalid").status_code == 422
    assert client.post("/api/v1/archive/export", json={"storage":{"axiom-api-session":"private"}}).status_code == 422


def test_archive_is_private(app, client):
    app.config["AXIOM"].local_mode = False
    assert client.get("/api/v1/archive/export").status_code in (403, 404)
    app.config["AXIOM"].local_mode = True
    assert client.get("/api/v1/archive/export", headers={"Origin":"https://example.org"}).status_code == 403



def test_archive_portable_pdf_attachment(app, client):
    from app.db import session_scope
    from app.models import Asset

    config = app.config["AXIOM"]
    config.local_mode = True
    content = b"%PDF-1.4\nAxiom test"
    digest = hashlib.sha256(content).hexdigest()
    source = config.data_dir / "uploads" / "original.pdf"
    source.parent.mkdir(exist_ok=True)
    source.write_bytes(content)
    with session_scope() as session:
        session.add(Asset(kind="pdf", filename="lecture.pdf", mime="application/pdf",
                          sha256=digest, size_bytes=len(content), storage_path=str(source)))
    saved = client.get("/api/v1/archive/export")
    assert saved.status_code == 200
    source.unlink()
    assert upload(client, saved.data).status_code == 200
    with session_scope() as session:
        from pathlib import Path
        restored = Path(session.query(Asset).filter_by(sha256=digest).one().storage_path)
        assert restored.is_relative_to(config.data_dir / "uploads")
        assert restored.read_bytes() == content
