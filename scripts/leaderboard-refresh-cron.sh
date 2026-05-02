#!/usr/bin/env bash
# Daily leaderboard refresh trigger.
#
# Hits the web app's /api/cron/leaderboard-refresh endpoint with the bearer secret.
# Schedule this via Coolify's "Scheduled Task" feature, a systemd timer, or system cron.
#
# Required env:
#   WEB_BASE_URL   - e.g. https://trafficclaw.com
#   CRON_SECRET    - same secret the web app verifies in route.ts
#
# Cron entry (runs daily at 03:00 UTC):
#   0 3 * * * /opt/trafficclaw/scripts/leaderboard-refresh-cron.sh >> /var/log/leaderboard-refresh.log 2>&1
#
# Coolify scheduled task config:
#   Command: /opt/trafficclaw/scripts/leaderboard-refresh-cron.sh
#   Frequency: 0 3 * * *
#   Container: web

set -euo pipefail

if [[ -z "${WEB_BASE_URL:-}" ]]; then
    echo "WEB_BASE_URL is not set" >&2
    exit 1
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
    echo "CRON_SECRET is not set" >&2
    exit 1
fi

curl --silent --show-error --fail-with-body \
    --max-time 600 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${WEB_BASE_URL%/}/api/cron/leaderboard-refresh"
