#!/usr/bin/env bash
# Start a local TrafficClaw dev instance (admin API + Next.js dev) with demo data.
#
#   scripts/dev/up.sh <name> <webPort> <adminPort> [--fresh]
#
# - Runs the code of the worktree you are in (or $TC_REPO).
# - Data, logs and pids live in /root/.trafficclaw-dev/<name>/ (never in the repo).
# - --fresh deletes that instance's admin DB first.
# - Idempotent: running it again leaves healthy processes alone.
# See scripts/dev/README.md.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 3 ] || die "usage: up.sh <name> <webPort> <adminPort> [--fresh]"
NAME="$1"; WEB_PORT="$2"; ADMIN_PORT="$3"; FRESH="${4:-}"
validate_name "$NAME"; validate_port "$WEB_PORT"; validate_port "$ADMIN_PORT"
[ "$WEB_PORT" != "$ADMIN_PORT" ] || die "web and admin ports must differ"

REPO="$(resolve_repo)"
INST="$TC_DEV_HOME/$NAME"
ensure_home
mkdir -p "$INST"
chmod 700 "$INST"

# One instance = one pair of ports and one worktree.
if [ -f "$INST/instance.env" ]; then
    prev_web="$(sed -n 's/^WEB_PORT=//p' "$INST/instance.env")"
    prev_admin="$(sed -n 's/^ADMIN_PORT=//p' "$INST/instance.env")"
    prev_repo="$(sed -n 's/^REPO=//p' "$INST/instance.env")"
    running=0
    owned_pid "$INST/web.pid" "$prev_repo/web" >/dev/null && running=1
    owned_pid "$INST/admin.pid" "$INST" >/dev/null && running=1
    if [ "$running" = 1 ] && { [ "$prev_web" != "$WEB_PORT" ] || [ "$prev_admin" != "$ADMIN_PORT" ] || [ "$prev_repo" != "$REPO" ]; }; then
        die "instance '$NAME' is already running on $prev_web/$prev_admin from $prev_repo. Run scripts/dev/down.sh $NAME first."
    fi
fi
other="$(instance_for_port "$WEB_PORT" || true)"
if [ -n "$other" ] && [ "$other" != "$INST" ] && port_listening "$WEB_PORT"; then
    die "web port $WEB_PORT is used by instance $(basename "$other")"
fi

[ -d "$REPO/web/node_modules/next" ] || die "$REPO/web/node_modules is missing. Run 'npm ci' in $REPO/web, or hard-link it: cp -al <other-worktree>/web/node_modules $REPO/web/node_modules"

ensure_dev_env
load_dev_env
ensure_venv "$REPO"

cat > "$INST/instance.env" <<EOF
NAME=$NAME
REPO=$REPO
WEB_PORT=$WEB_PORT
ADMIN_PORT=$ADMIN_PORT
WEB_URL=http://localhost:$WEB_PORT
ADMIN_URL=http://127.0.0.1:$ADMIN_PORT
EOF

BASE_ENV=(PATH="/usr/local/bin:/usr/bin:/bin" HOME="$HOME" LANG=C.UTF-8 TZ=UTC TC_DEMO_DATA=1)

# ─── Admin API ───
admin_pid="$(owned_pid "$INST/admin.pid" "$INST" || true)"
if [ -n "$admin_pid" ] && port_listening "$ADMIN_PORT"; then
    log "admin already running (pid $admin_pid, port $ADMIN_PORT)"
else
    if [ -n "$admin_pid" ]; then kill -TERM -- "-$admin_pid" 2>/dev/null || true; sleep 1; fi
    port_listening "$ADMIN_PORT" && die "admin port $ADMIN_PORT is in use by another process"
    if [ "$FRESH" = "--fresh" ]; then
        log "--fresh: removing $INST/admin.db"
        rm -f "$INST/admin.db" "$INST/admin.db-journal" "$INST/admin.db-wal" "$INST/admin.db-shm" "$INST"/state*.json "$INST/seed.json"
    fi
    mkdir -p "$INST/clawbot-data"
    echo "=== $(date -u +%FT%TZ) start admin from $REPO ===" >> "$INST/admin.log"
    (
        cd "$INST"
        # env -i: nothing from this shell (or production) leaks in. DOCKER_HOST
        # points at a socket that does not exist, so the admin runs in Docker
        # stub mode and never sees the production containers.
        env -i "${BASE_ENV[@]}" \
            PYTHONUNBUFFERED=1 \
            DATABASE_URL="sqlite+aiosqlite:///$INST/admin.db" \
            ADMIN_API_KEY="$ADMIN_API_KEY" \
            OAUTH_TOKEN_ENC_KEY="$OAUTH_TOKEN_ENC_KEY" \
            DOCKER_HOST="unix://$INST/no-docker.sock" \
            DATA_DIR="$INST/clawbot-data" \
            PLUGINS_DIR="$REPO/plugins" \
            CORS_ORIGINS="http://localhost:$WEB_PORT" \
            PUBLIC_DASHBOARD_URL="http://localhost:$WEB_PORT/dashboard" \
            setsid "$TC_VENV/bin/python" -m uvicorn main:app --app-dir "$REPO/admin" --host 127.0.0.1 --port "$ADMIN_PORT" \
            >> "$INST/admin.log" 2>&1 < /dev/null &
        echo $! > "$INST/admin.pid"
    )
    wait_http "http://127.0.0.1:$ADMIN_PORT/health" "admin API" 60 || { tail -n 30 "$INST/admin.log" >&2; die "admin API did not start (log: $INST/admin.log)"; }
fi

# ─── Next.js dev ───
web_pid="$(owned_pid "$INST/web.pid" "$REPO/web" || true)"
if [ -n "$web_pid" ] && port_listening "$WEB_PORT"; then
    log "web already running (pid $web_pid, port $WEB_PORT)"
else
    if [ -n "$web_pid" ]; then kill -TERM -- "-$web_pid" 2>/dev/null || true; sleep 1; fi
    port_listening "$WEB_PORT" && die "web port $WEB_PORT is in use by another process"
    echo "=== $(date -u +%FT%TZ) start web from $REPO ===" >> "$INST/web.log"
    (
        cd "$REPO/web"
        env -i "${BASE_ENV[@]}" \
            NODE_OPTIONS="--max-old-space-size=1536" \
            NEXT_TELEMETRY_DISABLED=1 \
            NEXTAUTH_URL="http://localhost:$WEB_PORT" \
            NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
            ADMIN_API_URL="http://127.0.0.1:$ADMIN_PORT" \
            ADMIN_API_KEY="$ADMIN_API_KEY" \
            CRON_SECRET="$CRON_SECRET" \
            SHARE_WATERMARK_SECRET="$SHARE_WATERMARK_SECRET" \
            SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
            AITRAFFIC_BRIDGE_SECRET="$AITRAFFIC_BRIDGE_SECRET" \
            ADMIN_GITHUB_ID="$TC_SUPERADMIN_SUB" \
            GOOGLE_CLIENT_ID="demo-google-client-id.apps.googleusercontent.com" \
            GOOGLE_CLIENT_SECRET="demo-google-client-secret" \
            GITHUB_ID="demo-github-client-id" \
            GITHUB_SECRET="demo-github-client-secret" \
            CRUX_API_KEY="demo-crux-key" \
            PUBLIC_DASHBOARD_URL="http://localhost:$WEB_PORT/dashboard" \
            PUBLIC_DASHBOARD_BASE_URL="http://localhost:$WEB_PORT" \
            NEXT_PUBLIC_SITE_URL="http://localhost:$WEB_PORT" \
            setsid node_modules/.bin/next dev -p "$WEB_PORT" -H 127.0.0.1 \
            >> "$INST/web.log" 2>&1 < /dev/null &
        echo $! > "$INST/web.pid"
    )
    wait_http "http://localhost:$WEB_PORT/api/auth/providers" "web (next dev)" 240 || { tail -n 40 "$INST/web.log" >&2; die "next dev did not start (log: $INST/web.log)"; }
fi

cat <<EOF
[dev] instance '$NAME' ready
      web    http://localhost:$WEB_PORT   (log $INST/web.log)
      admin  http://127.0.0.1:$ADMIN_PORT (log $INST/admin.log)
      repo   $REPO
      next:  node $DEV_SCRIPT_DIR/login.mjs $WEB_PORT
EOF
