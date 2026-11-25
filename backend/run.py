"""Development server entry point.

    python run.py

For a single-machine trial, run behind an HTTPS reverse proxy and set
AXIOM_ENV=production with a strong secret and admin password.
"""

from __future__ import annotations

import os

from app import create_app

host = os.environ.get("AXIOM_HOST", "127.0.0.1")
app = create_app({"local_mode": __name__ == "__main__" and host == "127.0.0.1"})


if __name__ == "__main__":
    port = int(os.environ.get("AXIOM_PORT", "8000"))
    debug = os.environ.get("AXIOM_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug, threaded=True, use_reloader=debug)
