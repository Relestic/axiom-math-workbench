"""Single-port public demo server: Flask API plus the built same-origin frontend.

    python online_server.py

This is intentionally separate from run.py. It is for a temporary public preview,
not for production. The API and the SPA share one origin so a tunnel only needs
one port and the browser does not require CORS.

Before starting it, point AXIOM_DB_URL at a disposable demo database and set
strong AXIOM_SECRET_KEY / AXIOM_ADMIN_PASSWORD values. See README section 13.
"""

from __future__ import annotations

import gzip
import mimetypes
import os
from pathlib import Path

try:
    import brotli
except ImportError:  # pragma: no cover - optional acceleration
    brotli = None

from dotenv import load_dotenv
from flask import Flask, abort, request, send_from_directory

ROOT = Path(__file__).resolve().parent
DIST = (ROOT.parent / "frontend" / "dist-online").resolve()
COMPRESSIBLE = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".html": "text/html",
}

# Keep the public demo credentials out of backend/.env so local tests and the
# normal 启动后端.cmd flow keep using the development defaults.
load_dotenv(ROOT / ".env.online", override=True)

from app import create_app  # noqa: E402  (must load env before app import)


def prepare_gzip() -> None:
    """Precompress large assets for slow/free tunnels.

    Chrome consistently stalled on the 368 KB main JS bundle through a free
    tunnel, while Python requests succeeded. Shipping the same bytes as gzip
    keeps the browser transfer around 117 KB and avoids that class of proxy
    buffering problem. .gz files are ignored by the source build.
    """

    for path in DIST.rglob("*"):
        if not path.is_file() or path.suffix not in COMPRESSIBLE:
            continue
        if path.stat().st_size < 1024:
            continue
        target = path.with_name(path.name + ".gz")
        if not target.is_file() or target.stat().st_mtime < path.stat().st_mtime:
            target.write_bytes(gzip.compress(path.read_bytes(), compresslevel=9))
        if brotli is not None:
            br_target = path.with_name(path.name + ".br")
            if not br_target.is_file() or br_target.stat().st_mtime < path.stat().st_mtime:
                br_target.write_bytes(brotli.compress(path.read_bytes(), quality=11))


def compressed(path: str):
    """Return a brotli/gzip response when the browser advertises support."""

    if Path(path).suffix == ".js":
        # Some free tunnels buffer/recompress JS and leave module requests
        # pending in Chrome; let the tunnel pass the original bytes instead.
        return None
    accepted = request.headers.get("Accept-Encoding", "").lower()
    if brotli is not None and "br" in accepted:
        target = DIST / (path + ".br")
        if target.is_file():
            response = send_from_directory(DIST, path + ".br", conditional=True)
            response.headers["Content-Encoding"] = "br"
            response.headers["Content-Type"] = COMPRESSIBLE.get(
                Path(path).suffix,
                mimetypes.guess_type(path)[0] or "application/octet-stream",
            )
            response.headers["Vary"] = "Accept-Encoding"
            response.headers.pop("Content-Disposition", None)
            return response
    if "gzip" not in accepted:
        return None
    target = DIST / (path + ".gz")
    if not target.is_file():
        return None
    response = send_from_directory(DIST, path + ".gz", conditional=True)
    response.headers["Content-Encoding"] = "gzip"
    response.headers["Content-Type"] = COMPRESSIBLE.get(
        Path(path).suffix, mimetypes.guess_type(path)[0] or "application/octet-stream"
    )
    response.headers["Vary"] = "Accept-Encoding"
    response.headers.pop("Content-Disposition", None)
    return response


def attach_spa(app: Flask) -> None:
    if not (DIST / "index.html").is_file():
        raise RuntimeError(
            "frontend/dist-online 不存在；先构建在线版前端："
            "cd frontend && VITE_API_BASE=__SAME_ORIGIN__ npx vite build --outDir dist-online"
        )
    prepare_gzip()
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 3600

    @app.after_request
    def static_cache_headers(response):
        if response.mimetype == "text/html":
            response.headers["Cache-Control"] = "no-store"
        elif response.status_code == 200 and response.mimetype in {
            "text/css",
            "application/javascript",
            "image/svg+xml",
        }:
            response.headers.setdefault("Cache-Control", "public, max-age=3600")
        return response

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        # Never turn a typo in an API URL into a 200 HTML page.
        if path == "api" or path.startswith("api/"):
            abort(404)
        target = (DIST / path).resolve()
        if path and target.is_file() and str(target).startswith(str(DIST)):
            return compressed(path) or send_from_directory(DIST, path)
        return compressed("index.html") or send_from_directory(
            DIST, "index.html", conditional=True
        )

    # create_app() registers a JSON landing page at "/" first. Flask keeps the
    # first matching rule, so point that existing endpoint at the SPA instead
    # of trying to add a second "/" route.
    def index():
        return compressed("index.html") or send_from_directory(
            DIST, "index.html", conditional=True
        )

    app.view_functions["index"] = index


app = create_app()
attach_spa(app)


if __name__ == "__main__":
    host = os.environ.get("AXIOM_ONLINE_HOST", "127.0.0.1")
    port = int(os.environ.get("AXIOM_ONLINE_PORT", "8080"))
    app.run(host=host, port=port, debug=False, threaded=True, use_reloader=False)
