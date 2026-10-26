# Shared helpers for scripts/dev/*.sh. Source it; do not run it.
# shellcheck shell=bash

TC_DEV_HOME="${TC_DEV_HOME:-/root/.trafficclaw-dev}"
TC_VENV="$TC_DEV_HOME/venv"
TC_DEV_ENV="$TC_DEV_HOME/dev.env"
DEV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fixed demo identities (Google "sub" values). login.mjs uses the same ones.
TC_SUPERADMIN_SUB="100000000000000000009"

log() { printf '[dev] %s\n' "$*" >&2; }
die() { printf '[dev] ERROR: %s\n' "$*" >&2; exit 1; }

is_repo_root() { [ -f "$1/web/package.json" ] && [ -f "$1/admin/main.py" ]; }

# The worktree to run from: $TC_REPO, else the git worktree you are standing
# in (if it is this repo), else the worktree that holds this script.
resolve_repo() {
    if [ -n "${TC_REPO:-}" ]; then
        is_repo_root "$TC_REPO" || die "TC_REPO=$TC_REPO is not a TrafficClaw worktree"
        (cd "$TC_REPO" && pwd)
        return
    fi
    local top
    top="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$top" ] && is_repo_root "$top"; then
        echo "$top"
        return
    fi
    (cd "$DEV_SCRIPT_DIR/../.." && pwd)
}

validate_name() {
    [[ "$1" =~ ^[a-z0-9][a-z0-9_-]{0,31}$ ]] || die "instance name must match [a-z0-9][a-z0-9_-]* (got '$1')"
}

validate_port() {
    [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ] || die "bad port '$1'"
}

ensure_home() {
    mkdir -p "$TC_DEV_HOME"
    chmod 700 "$TC_DEV_HOME"
}

# Generate dev secrets once. Safe when several agents call up.sh at the same time.
ensure_dev_env() {
    ensure_home
    (
        flock 9
        if [ ! -s "$TC_DEV_ENV" ]; then
            umask 077
            local fernet
            fernet="$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
            {
                echo "# TrafficClaw local dev secrets. Generated $(date -u +%FT%TZ) by scripts/dev/up.sh."
                echo "# Dev only. Never commit, never copy to production."
                echo "NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')"
                echo "ADMIN_API_KEY=dev-$(openssl rand -hex 24)"
                echo "OAUTH_TOKEN_ENC_KEY=$fernet"
                echo "CRON_SECRET=$(openssl rand -hex 24)"
                echo "SHARE_WATERMARK_SECRET=$(openssl rand -hex 24)"
                echo "SUPERADMIN_PASSWORD=$(openssl rand -hex 12)"
                echo "AITRAFFIC_BRIDGE_SECRET=$(openssl rand -hex 32)"
            } > "$TC_DEV_ENV.tmp"
            mv "$TC_DEV_ENV.tmp" "$TC_DEV_ENV"
            log "generated $TC_DEV_ENV"
        fi
        chmod 600 "$TC_DEV_ENV"
    ) 9>"$TC_DEV_HOME/.dev-env.lock"
}

load_dev_env() {
    set -a
    # shellcheck disable=SC1090
    . "$TC_DEV_ENV"
    set +a
}

# Shared Python venv for the admin API. Reinstalls when requirements change.
ensure_venv() {
    local repo="$1" req hash
    req="$repo/admin/requirements.txt"
    hash="$(sha256sum "$req" | cut -c1-16)"
    (
        flock 9
        if [ ! -x "$TC_VENV/bin/python" ]; then
            log "creating venv $TC_VENV"
            python3 -m venv "$TC_VENV"
        fi
        if [ "$(cat "$TC_VENV/.requirements-hash" 2>/dev/null)" != "$hash" ]; then
            log "installing admin requirements into venv"
            # greenlet: SQLAlchemy >= 2.1 no longer pulls it in, but the async
            # engine needs it (admin/requirements.txt does not list it).
            "$TC_VENV/bin/pip" install -q --disable-pip-version-check -r "$req" greenlet >&2
            echo "$hash" > "$TC_VENV/.requirements-hash"
        fi
    ) 9>"$TC_DEV_HOME/.venv.lock"
}

pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

read_pid() { cat "$1" 2>/dev/null || true; }

# Echo the pid stored in file $1 if that process is alive AND runs in
# directory $2. Guards against killing an unrelated process that reused a
# stale pid (this box also runs production).
owned_pid() {
    local pid
    pid="$(read_pid "$1")"
    pid_alive "$pid" || return 1
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$2" ] || return 1
    echo "$pid"
}

port_listening() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }

# Wait until a URL answers with any HTTP status. $3 = timeout seconds.
wait_http() {
    local url="$1" what="$2" timeout="${3:-120}" i=0 code
    while [ "$i" -lt "$timeout" ]; do
        code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$url" || true)"
        if [ -n "$code" ] && [ "$code" != "000" ]; then
            log "$what is up ($url → $code)"
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

# Find the instance directory whose web port is $1.
instance_for_port() {
    local f
    for f in "$TC_DEV_HOME"/*/instance.env; do
        [ -f "$f" ] || continue
        if grep -qx "WEB_PORT=$1" "$f"; then dirname "$f"; return 0; fi
    done
    return 1
}
