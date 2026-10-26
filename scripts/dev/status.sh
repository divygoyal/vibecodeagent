#!/usr/bin/env bash
# List dev instances and whether their servers are running.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

printf '%-12s %-6s %-6s %-8s %-8s %s\n' NAME WEB ADMIN WEB-PID ADMIN-PID REPO
for f in "$TC_DEV_HOME"/*/instance.env; do
    [ -f "$f" ] || continue
    dir="$(dirname "$f")"
    name="$(basename "$dir")"
    web="$(sed -n 's/^WEB_PORT=//p' "$f")"
    admin="$(sed -n 's/^ADMIN_PORT=//p' "$f")"
    repo="$(sed -n 's/^REPO=//p' "$f")"
    wp="$(read_pid "$dir/web.pid")"; ap="$(read_pid "$dir/admin.pid")"
    pid_alive "$wp" || wp="-"
    pid_alive "$ap" || ap="-"
    printf '%-12s %-6s %-6s %-8s %-8s %s\n' "$name" "$web" "$admin" "$wp" "$ap" "$repo"
done

echo
echo "Next dev slots (max $TC_MAX_SLOTS on this box):"
mkdir -p "$TC_SLOTS_DIR"
slot_report
