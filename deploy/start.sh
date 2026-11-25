#!/bin/sh
set -eu

# Idempotent migrations/seed; safe to run on every container restart.
python -m app.cli init
python -m app.cli seed --demo
exec python online_server.py
