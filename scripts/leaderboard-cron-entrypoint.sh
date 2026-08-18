#!/bin/sh
# Entrypoint for the alpine-based leaderboard-cron container.
# Installs curl, registers a daily cron job, runs crond in the foreground.

set -eu

apk add --no-cache curl tzdata >/dev/null

# Daily at 03:00 UTC. crond reads from /etc/crontabs/root.
mkdir -p /etc/crontabs
echo "0 3 * * * WEB_BASE_URL=${WEB_BASE_URL} CRON_SECRET=${CRON_SECRET} /bin/sh /usr/local/bin/leaderboard-refresh.sh >> /var/log/leaderboard-cron.log 2>&1" > /etc/crontabs/root

mkdir -p /var/log
touch /var/log/leaderboard-cron.log

echo "[leaderboard-cron] starting crond — refresh fires daily at 03:00 UTC"
exec crond -f -l 8 -L /var/log/leaderboard-cron.log
