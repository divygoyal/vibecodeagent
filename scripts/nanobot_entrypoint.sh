#!/bin/bash
# Nanobot entrypoint with Vertex Express provider injection.

PATCH_DIR="/tmp/nanobot_patch"
mkdir -p "$PATCH_DIR"

cp /app/nanobot_sitecustomize.py "$PATCH_DIR/sitecustomize.py"

export PYTHONPATH="$PATCH_DIR${PYTHONPATH:+:$PYTHONPATH}"

echo "[entrypoint] Vertex Express provider patch ready (timeout=${NANOBOT_REQUEST_TIMEOUT:-30}s)"
echo "[entrypoint] Starting nanobot gateway..."

exec nanobot gateway
