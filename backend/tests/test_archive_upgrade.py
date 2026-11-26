import hashlib
import io
import json
import sqlite3
import zipfile
from contextlib import closing

from app.db import get_engine


def test_phase_one_archive_upgrades_only_its_temporary_database(app, client, tmp_path):
    app.config["AXIOM"].local_mode = True
    archive = client.get("/api/v1/archive/export")
    with zipfile.ZipFile(io.BytesIO(archive.data)) as exported:
        metadata = json.loads(exported.read("learning.json"))
        path = tmp_path / "old.sqlite"
        path.write_bytes(exported.read("learning.sqlite"))
    with closing(sqlite3.connect(path)) as conn:
        assert "ai_review" in {row[1] for row in conn.execute("PRAGMA table_info(attempts)")}
        conn.execute("ALTER TABLE attempts DROP COLUMN ai_review")
        conn.execute("DELETE FROM schema_migrations WHERE revision='0004_attempt_ai_review'")
        conn.execute("UPDATE users SET display_name='旧档学习者' WHERE email='demo@axiom.local'")
        conn.commit()
    data = path.read_bytes()
    metadata["database_sha256"] = hashlib.sha256(data).hexdigest()
    metadata["storage"] = {"axiom-last-page":"proof"}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target:
        target.writestr("learning.sqlite", data)
        target.writestr("learning.json", json.dumps(metadata))
    def restore(query):
        return client.post("/api/v1/archive/import" + query, data={"archive":(io.BytesIO(buffer.getvalue()),"learning.zip")})
    def name():
        with get_engine().connect() as live:
            return live.exec_driver_sql("SELECT display_name FROM users WHERE email='demo@axiom.local'").scalar()
    assert restore("?validate=1").json == {"storage":metadata["storage"]}
    assert name() != "旧档学习者"
    assert restore("").status_code == 200
    assert name() == "旧档学习者"
    assert restore("").status_code == 200
