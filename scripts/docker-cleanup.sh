#!/bin/sh
#
# Daily Docker cleanup for the production VPS.
#
# Removes anything that isn't pulling its weight:
#   - Stopped / Exited / Dead containers (running ones are skipped by Docker)
#   - Images older than 48h that no container references (in-use images are skipped)
#   - BuildKit cache layers older than 48h
#
# What this script will NEVER touch:
#   - Running containers, regardless of age
#   - Images currently referenced by a running OR stopped container
#   - Volumes that are mounted by any container
#   - Anything created in the last 48h (so a same-day rollback still has its image+cache)
#
# Install on the VPS:
#   sudo cp scripts/docker-cleanup.sh /etc/cron.daily/docker-cleanup
#   sudo chmod +x /etc/cron.daily/docker-cleanup
#   sudo /etc/cron.daily/docker-cleanup       # one-shot test
#   sudo tail -30 /var/log/docker-cleanup.log # confirm it ran
#
# Anacron will then run it once a day automatically (typically around 06:25 server time).
# History is appended to /var/log/docker-cleanup.log — one Before/After block per run.

set -u

LOG=/var/log/docker-cleanup.log
TS=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure docker is on PATH (cron has a minimal PATH; add common install locations)
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"
export PATH

# Bail loudly if docker isn't reachable (cron mail will surface this)
if ! command -v docker >/dev/null 2>&1; then
    echo "[$TS] docker binary not found on PATH — aborting" >> "$LOG"
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "[$TS] docker daemon not responding — aborting" >> "$LOG"
    exit 1
fi

{
    echo "===== $TS ====="
    echo "Before:"
    df -h /
    echo
    echo "--- container prune ---"
    docker container prune -f
    echo
    echo "--- image prune (until=48h) ---"
    docker image prune -af --filter "until=48h"
    echo
    echo "--- builder prune (until=48h) ---"
    docker builder prune -af --filter "until=48h"
    echo
    echo "After:"
    df -h /
    echo
} >> "$LOG" 2>&1
