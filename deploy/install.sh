#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required: https://docs.docker.com/engine/install/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
fi

secret="$(openssl rand -base64 48 | tr -d '\n')"
admin_password="$(openssl rand -hex 16)"
invite_code="ONLINE-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')"
admin_email="${AXIOM_ADMIN_EMAIL:-admin@example.com}"
ai_key="${AI_API_KEY:-}"

if [ -z "$ai_key" ]; then
  read -r -s -p "DeepSeek API key (Enter to skip AI for now): " ai_key || true
  echo
fi

python3 - "$secret" "$admin_password" "$invite_code" "$admin_email" "$ai_key" <<'PY'
import sys
from pathlib import Path

secret, admin_password, invite_code, admin_email, ai_key = sys.argv[1:6]
path = Path("deploy/.env")
lines = path.read_text(encoding="utf-8").splitlines()
values = {
    "AXIOM_SECRET_KEY": secret,
    "AXIOM_ADMIN_EMAIL": admin_email,
    "AXIOM_ADMIN_PASSWORD": admin_password,
    "AXIOM_DEMO_INVITE_CODE": invite_code,
    "AI_API_KEY": ai_key,
}
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0].strip()
    if key in values:
        out.append(f"{key}={values[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in values.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print("Generated deploy/.env; admin password was written there.")
PY

docker compose --env-file deploy/.env up -d --build
echo
echo "Waiting for Axiom health check..."
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8080/api/health || {
  echo "Health check failed. Run: docker compose logs -f axiom" >&2
  exit 1
}
echo
echo "Axiom is running at http://SERVER_IP:8080/"
echo "Demo student: demo@axiom.local / axiom-demo-2026"
echo "Admin credentials are in deploy/.env (do not commit this file)."
echo "Next: put Caddy/Nginx with HTTPS in front, see deploy/README.md."
