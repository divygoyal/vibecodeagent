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

echo
echo "Disk: $(disk_free_mb) MB free on /  (up.sh needs $TC_MIN_DISK_MB MB; down.sh deletes web/.next below $TC_CLEAN_NEXT_BELOW_MB MB)"
echo "RAM:  $(mem_available_mb) MB available (up.sh needs $TC_MIN_AVAILABLE_MB MB)"
echo "web/.next build caches:"
{
    for f in "$TC_DEV_HOME"/*/instance.env; do [ -f "$f" ] && sed -n 's/^REPO=//p' "$f"; done
    for d in /root/projects/worktrees/*/; do [ -d "$d/web" ] && echo "${d%/}"; done
} | sort -u | while read -r repo; do
    [ -d "$repo/web/.next" ] && printf '  %-8s %s\n' "$(du -sh "$repo/web/.next" 2>/dev/null | cut -f1)" "$repo/web/.next"
done
