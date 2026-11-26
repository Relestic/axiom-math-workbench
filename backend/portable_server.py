"""Single-machine entry point for the complete portable distribution."""
from __future__ import annotations

import os
import secrets
import threading
import webbrowser
from pathlib import Path

from dotenv import load_dotenv
from flask import abort, request, send_from_directory
from werkzeug.serving import make_server

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
if not (WEB / "index.html").is_file():
    WEB = ROOT / "frontend" / "dist-portable"
if not (WEB / "index.html").is_file():
    raise RuntimeError("Build the frontend with node scripts/build-portable.mjs before starting Axiom.")
load_dotenv(ROOT / "backend" / ".env", override=False)
DATA = Path(os.environ.get("AXIOM_DATA_DIR") or ROOT / "data").resolve()
DATA.mkdir(parents=True, exist_ok=True)
secret_path = DATA / "session-secret.txt"
if not secret_path.exists():
    secret_path.write_text(secrets.token_urlsafe(48), encoding="utf8")

from app import create_app
from app.db import session_scope
from app.seed.loader import seed_all

port = int(os.environ.get("AXIOM_PORT", "5186"))
if not 1024 <= port <= 65535:
    raise RuntimeError("AXIOM_PORT must be between 1024 and 65535")
app = create_app({
    "local_mode": True,
    "data_dir": DATA,
    "database_url": "sqlite:///" + str(DATA / "axiom.db"),
    "secret_key": secret_path.read_text(encoding="utf8"),
    "cors_origins": [f"http://127.0.0.1:{port}", f"http://localhost:{port}"],
    "docs_enabled": False,
})
with app.app_context(), session_scope() as session:
    seed_all(session, app.config["AXIOM"], with_demo=True)


@app.before_request
def local_requests_only():
    allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
    if request.host not in allowed:
        abort(403)
    origin = request.headers.get("Origin")
    if origin and origin not in {f"http://{host}" for host in allowed}:
        abort(403)


def index():
    return send_from_directory(WEB, "index.html")


app.view_functions["index"] = index


@app.get("/<path:path>")
def static_file(path: str):
    target = (WEB / path).resolve()
    if path.startswith("api/") or WEB.resolve() not in target.parents or not target.is_file():
        abort(404)
    return send_from_directory(WEB, path)


if __name__ == "__main__":
    try:
        server = make_server("127.0.0.1", port, app, threaded=True)
    except (OSError, SystemExit):
        print(f"Port {port} is unavailable. Close another Axiom window or change AXIOM_PORT in .env.", flush=True)
        raise SystemExit(1)
    url = f"http://127.0.0.1:{port}/"
    print(f"Axiom is ready: {url}\nKeep this window open. Press Ctrl+C to stop.", flush=True)
    if os.environ.get("AXIOM_NO_OPEN") != "1":
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
