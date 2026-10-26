#!/usr/bin/env bash
# Stop a dev instance started by up.sh.
#
#   scripts/dev/down.sh <name> [--purge]
#
# --purge also deletes /root/.trafficclaw-dev/<name>/ (DB, logs, login state).
# Only processes recorded in that instance's pid files are touched.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 1 ] || die "usage: down.sh <name> [--purge]"
NAME="$1"; PURGE="${2:-}"
validate_name "$NAME"
INST="$TC_DEV_HOME/$NAME"
[ -d "$INST" ] || die "no instance '$NAME' in $TC_DEV_HOME"

REPO="$(sed -n 's/^REPO=//p' "$INST/instance.env" 2>/dev/null || true)"

stop_one() {
    local what="$1" cwd="$2" pidfile="$INST/$1.pid" pid i
    if ! pid="$(owned_pid "$pidfile" "$cwd")"; then
        rm -f "$pidfile"
        log "$what not running"
        return
    fi
    # up.sh starts each server with setsid, so the pid is also the process group.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for i in $(seq 1 20); do
        pid_alive "$pid" || break
        sleep 0.5
    done
    if pid_alive "$pid"; then
        kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
    log "$what stopped (pid $pid)"
}

stop_one web "$REPO/web"
stop_one admin "$INST"

# The slot lock dies with the web server; tidy its owner note.
slot="$(cat "$INST/web.slot" 2>/dev/null || true)"
if [ -n "$slot" ]; then
    if slot_free "$slot"; then
        rm -f "$TC_SLOTS_DIR/slot$slot.owner"
        log "released dev slot $slot"
    else
        log "dev slot $slot is still held (a server process is still exiting?)"
    fi
    rm -f "$INST/web.slot"
fi

if [ "$PURGE" = "--purge" ]; then
    rm -rf "$INST"
    log "purged $INST"
fi
