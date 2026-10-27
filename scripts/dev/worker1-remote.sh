#!/usr/bin/env bash
# Runs ON worker1. Called by scripts/dev/worker1.sh over ssh; do not run it by hand on the main VPS.
#
#   worker1-remote.sh deps  <name>              npm ci once per lockfile hash (cached node_modules) + admin venv
#   worker1-remote.sh build <name>              production `next build`
#   worker1-remote.sh up    <name> [N]          N instances (default 4): web 3201.. + admin 8201.., fresh DB, demo users
#   worker1-remote.sh check <name> [what] [out] crawl|mobile|scenarios|golden|multi|all, results into <out>
#   worker1-remote.sh down  <name>
#   worker1-remote.sh status
#   worker1-remote.sh clean [--all]
#
# Everything lives in /root/trafficclaw-test (override: TC_W1_ROOT). Nothing outside it is written, and
# no process of worker1's other projects is touched: we only signal pids from our own pid files after
# checking that the process runs in our own directory. Every process runs under `env -i`, `nice -n 10`,
# bound to 127.0.0.1, with fresh dev-only secrets (dev.env) and demo data only.
set -euo pipefail

ROOT="${TC_W1_ROOT:-/root/trafficclaw-test}"
SAFE_PATH="$ROOT/node/bin:/usr/bin:/bin"     # NOT /usr/local/bin: that node belongs to another project
export PATH="$SAFE_PATH"
export HOME="$ROOT/home" TMPDIR="$ROOT/tmp" npm_config_cache="$ROOT/home/.npm"
DEV_HOME="$ROOT/dev-home"
SRC_ROOT="$ROOT/src"
PORT_BASE_WEB=3200
PORT_BASE_ADMIN=8200
MAX_N=10
MIN_MEM_MB="${TC_W1_MIN_MEM_MB:-6000}"
CHROME_DEFAULT="$(ls -d /root/ai-tutor-render/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -n 1 || true)"
CHROME="${TC_CHROME:-$CHROME_DEFAULT}"

log() { printf '[w1] %s\n' "$*" >&2; }
die() { printf '[w1] ERROR: %s\n' "$*" >&2; exit 1; }
validate_name() { [[ "${1:-}" =~ ^[a-z0-9][a-z0-9_-]{0,19}$ ]] || die "name must match [a-z0-9][a-z0-9_-]{0,19} (got '${1:-}')"; }
mem_available_mb() { awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo; }
load1() { cut -d' ' -f1 /proc/loadavg; }
port_listening() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
read_pid() { cat "$1" 2>/dev/null || true; }
# pid in file $1 if it is alive AND runs in directory $2 (never signal a recycled pid).
owned_pid() { local pid; pid="$(read_pid "$1")"; pid_alive "$pid" || return 1; [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$2" ] || return 1; echo "$pid"; }
inst_dir() { echo "$DEV_HOME/$1-$2"; }
web_port() { echo $((PORT_BASE_WEB + $1)); }
admin_port() { echo $((PORT_BASE_ADMIN + $1)); }
wait_http() {
    local url="$1" what="$2" timeout="${3:-120}" i=0 code
    while [ "$i" -lt "$timeout" ]; do
        code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$url" || true)"
        if [ -n "$code" ] && [ "$code" != "000" ]; then return 0; fi
        sleep 1; i=$((i + 1))
    done
    return 1
}
now() { date +%s.%N; }
elapsed() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }

# Instances of <name> that have a pid file (1..MAX_N).
instances_of() {
    local name="$1" i
    for i in $(seq 1 "$MAX_N"); do [ -d "$(inst_dir "$name" "$i")" ] && echo "$i"; done
}
running_instances() {
    local name="$1" i d src
    src="$SRC_ROOT/$name"
    for i in $(instances_of "$name"); do
        d="$(inst_dir "$name" "$i")"
        if owned_pid "$d/web.pid" "$src/web" >/dev/null && port_listening "$(web_port "$i")"; then echo "$i"; fi
    done
}

ensure_dev_home() {
    mkdir -p "$DEV_HOME" "$ROOT/results" "$ROOT/cache" "$ROOT/home" "$ROOT/tmp"
    chmod 700 "$DEV_HOME"
    [ -s "$ROOT/dev.env" ] || die "$ROOT/dev.env is missing"
    ln -sfn "$ROOT/dev.env" "$DEV_HOME/dev.env"      # login.mjs / the kit read dev.env from the dev home
}
load_dev_env() { set -a; . "$ROOT/dev.env"; set +a; }

# ─────────────────────────────── deps ───────────────────────────────
cmd_deps() {
    local name="$1" src="$SRC_ROOT/$1" hash cache
    [ -f "$src/web/package-lock.json" ] || die "no source at $src (run worker1.sh sync first)"
    mkdir -p "$ROOT/cache" "$ROOT/home"
    exec 9>"$ROOT/cache/deps.lock"; flock 9
    hash="$(sha256sum "$src/web/package-lock.json" | cut -c1-16)"
    cache="$ROOT/cache/nm-$hash"
    if [ ! -d "$cache/node_modules" ]; then
        local t0; t0="$(now)"
        log "npm ci (lockfile $hash, first time)"
        rm -rf "$cache.tmp"; mkdir -p "$cache.tmp"
        cp "$src/web/package.json" "$src/web/package-lock.json" "$cache.tmp/"
        (cd "$cache.tmp" && nice -n 10 npm ci --no-audit --no-fund --loglevel=error >&2)
        echo "$hash" > "$cache.tmp/node_modules/.tc-hash"
        rm -rf "$cache"; mv "$cache.tmp" "$cache"
        log "npm ci took $(elapsed "$t0") s"
        echo "npm_ci_secs=$(elapsed "$t0")"
    else
        log "node_modules cache hit ($hash)"
        echo "npm_ci_secs=0"
    fi
    if [ "$(cat "$src/web/node_modules/.tc-hash" 2>/dev/null)" != "$hash" ]; then
        rm -rf "$src/web/node_modules"
        cp -al "$cache/node_modules" "$src/web/node_modules"      # hard links: no extra disk, ~1 s
        log "linked node_modules ($hash) into $name"
    fi
    # keep only the 2 newest caches
    ls -dt "$ROOT"/cache/nm-* 2>/dev/null | grep -v '\.tmp$' | tail -n +3 | while read -r old; do
        # never delete a cache a source tree still links to (hard links keep the files alive anyway)
        rm -rf "$old"
    done
    # admin venv
    local req rhash
    req="$src/admin/requirements.txt"; rhash="$(sha256sum "$req" | cut -c1-16)"
    if [ ! -x "$ROOT/venv/bin/python" ]; then die "$ROOT/venv is missing"; fi
    if [ "$(cat "$ROOT/venv/.requirements-hash" 2>/dev/null)" != "$rhash" ]; then
        log "installing admin requirements into the venv"
        "$ROOT/venv/bin/pip" install -q --disable-pip-version-check -r "$req" >&2
        echo "$rhash" > "$ROOT/venv/.requirements-hash"
    fi
    flock -u 9
}

# ─────────────────────────────── build ──────────────────────────────
cmd_build() {
    local name="$1" src="$SRC_ROOT/$1"
    [ -d "$src/web/node_modules/next" ] || die "node_modules missing in $src/web (run worker1.sh sync first)"
    if [ -n "$(running_instances "$name")" ]; then die "instances of '$name' are running; run worker1.sh down $name first (a build replaces .next under them)"; fi
    mkdir -p "$ROOT/results"
    exec 8>"$ROOT/build.lock"; flock 8
    local avail; avail="$(mem_available_mb)"
    [ "$avail" -ge 8000 ] || die "only ${avail} MB RAM available (need 8000 for a build)"
    log "next build ($name), load $(load1), ${avail} MB free"
    (
        cd "$src/web"
        env -i PATH="$SAFE_PATH" HOME="$HOME" TMPDIR="$TMPDIR" LANG=C.UTF-8 TZ=UTC \
            NODE_OPTIONS="--max-old-space-size=6144" NEXT_TELEMETRY_DISABLED=1 \
            nice -n 10 node_modules/.bin/next build
    ) 2>&1 | tee "$ROOT/results/build-$name.log" | grep -vE '^\s*$' | tail -n 25 >&2
    [ -f "$src/web/.next/BUILD_ID" ] || die "build failed (log: $ROOT/results/build-$name.log)"
    flock -u 8
}

# ──────────────────────────────── up ────────────────────────────────
start_admin() {
    local name="$1" i="$2" src="$SRC_ROOT/$1" d wp ap
    d="$(inst_dir "$name" "$i")"; wp="$(web_port "$i")"; ap="$(admin_port "$i")"
    mkdir -p "$d/clawbot-data"
    (
        cd "$d"
        env -i PATH="$SAFE_PATH" HOME="$HOME" TMPDIR="$TMPDIR" LANG=C.UTF-8 TZ=UTC TC_DEMO_DATA=1 \
            PYTHONUNBUFFERED=1 \
            DATABASE_URL="sqlite+aiosqlite:///$d/admin.db" \
            ADMIN_API_KEY="$ADMIN_API_KEY" OAUTH_TOKEN_ENC_KEY="$OAUTH_TOKEN_ENC_KEY" \
            DOCKER_HOST="unix://$d/no-docker.sock" \
            DATA_DIR="$d/clawbot-data" PLUGINS_DIR="$src/plugins" \
            CORS_ORIGINS="http://localhost:$wp" PUBLIC_DASHBOARD_URL="http://localhost:$wp/dashboard" \
            setsid nice -n 10 "$ROOT/venv/bin/python" -m uvicorn main:app --app-dir "$src/admin" --host 127.0.0.1 --port "$ap" \
            >> "$d/admin.log" 2>&1 < /dev/null &
        echo $! > "$d/admin.pid"
    )
}
start_web() {
    local name="$1" i="$2" src="$SRC_ROOT/$1" d wp ap
    d="$(inst_dir "$name" "$i")"; wp="$(web_port "$i")"; ap="$(admin_port "$i")"
    (
        cd "$src/web"
        # NODE_ENV=production + TC_ALLOW_DEMO_IN_PROD_BUILD: demo data in a real production server, honoured only
        # because NEXTAUTH_URL is localhost (web/src/lib/demo/gate.ts).
        env -i PATH="$SAFE_PATH" HOME="$HOME" TMPDIR="$TMPDIR" LANG=C.UTF-8 TZ=UTC TC_DEMO_DATA=1 \
            NODE_ENV=production TC_ALLOW_DEMO_IN_PROD_BUILD=1 \
            NODE_OPTIONS="--max-old-space-size=2048" NEXT_TELEMETRY_DISABLED=1 \
            NEXTAUTH_URL="http://localhost:$wp" NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
            ADMIN_API_URL="http://127.0.0.1:$ap" ADMIN_API_KEY="$ADMIN_API_KEY" \
            CRON_SECRET="$CRON_SECRET" SHARE_WATERMARK_SECRET="$SHARE_WATERMARK_SECRET" \
            SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" AITRAFFIC_BRIDGE_SECRET="$AITRAFFIC_BRIDGE_SECRET" \
            ADMIN_GITHUB_ID="100000000000000000009" \
            GOOGLE_CLIENT_ID="demo-google-client-id.apps.googleusercontent.com" GOOGLE_CLIENT_SECRET="demo-google-client-secret" \
            GITHUB_ID="demo-github-client-id" GITHUB_SECRET="demo-github-client-secret" CRUX_API_KEY="demo-crux-key" \
            PUBLIC_DASHBOARD_URL="http://localhost:$wp/dashboard" PUBLIC_DASHBOARD_BASE_URL="http://localhost:$wp" \
            setsid nice -n 10 node_modules/.bin/next start -p "$wp" -H 127.0.0.1 \
            >> "$d/web.log" 2>&1 < /dev/null &
        echo $! > "$d/web.pid"
    )
}

stop_instance() {
    local name="$1" i="$2" d src what pidfile cwd pid k
    d="$(inst_dir "$name" "$i")"; src="$SRC_ROOT/$name"
    for what in web admin; do
        pidfile="$d/$what.pid"; cwd="$d"; [ "$what" = web ] && cwd="$src/web"
        if pid="$(owned_pid "$pidfile" "$cwd")"; then
            kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
            for k in $(seq 1 20); do pid_alive "$pid" || break; sleep 0.5; done
            if pid_alive "$pid"; then kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; fi
        fi
        rm -f "$pidfile"
    done
}

cmd_down() {
    local name="$1" i
    for i in $(instances_of "$name"); do stop_instance "$name" "$i"; log "stopped $name-$i"; done
}

cmd_up() {
    local name="$1" n="${2:-4}" first="${3:-1}" src="$SRC_ROOT/$1" i t0 avail
    [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "$MAX_N" ] || die "N must be 1..$MAX_N"
    # --first K: instances K..K+N-1 (ports 3200+K..), so two worktrees can run side by side.
    [[ "$first" =~ ^[0-9]+$ ]] && [ "$first" -ge 1 ] && [ $((first + n - 1)) -le "$MAX_N" ] || die "first + N - 1 must be <= $MAX_N"
    [ -f "$src/web/.next/BUILD_ID" ] || die "no production build in $src/web/.next (run worker1.sh build $name)"
    [ -d "$src/web/node_modules/next" ] || die "node_modules missing"
    ensure_dev_home; load_dev_env
    cmd_down "$name"
    avail="$(mem_available_mb)"; [ "$avail" -ge "$MIN_MEM_MB" ] || die "only ${avail} MB RAM available (need $MIN_MEM_MB)"
    for i in $(seq "$first" $((first + n - 1))); do
        for p in "$(web_port "$i")" "$(admin_port "$i")"; do
            port_listening "$p" && die "port $p is already in use on worker1 (not ours); refusing to start"
        done
    done
    t0="$(now)"
    for i in $(seq "$first" $((first + n - 1))); do
        local d; d="$(inst_dir "$name" "$i")"
        rm -rf "$d"; mkdir -p "$d"; chmod 700 "$d"
        cat > "$d/instance.env" <<EOF
NAME=$name-$i
REPO=$src
WEB_PORT=$(web_port "$i")
ADMIN_PORT=$(admin_port "$i")
WEB_URL=http://localhost:$(web_port "$i")
ADMIN_URL=http://127.0.0.1:$(admin_port "$i")
EOF
        start_admin "$name" "$i"
    done
    for i in $(seq "$first" $((first + n - 1))); do
        wait_http "http://127.0.0.1:$(admin_port "$i")/health" "admin $i" 90 || { tail -n 20 "$(inst_dir "$name" "$i")/admin.log" >&2; die "admin $i did not start"; }
        start_web "$name" "$i"
    done
    for i in $(seq "$first" $((first + n - 1))); do
        wait_http "http://localhost:$(web_port "$i")/api/auth/providers" "web $i" 120 || { tail -n 30 "$(inst_dir "$name" "$i")/web.log" >&2; die "web $i did not start"; }
    done
    echo "start_secs=$(elapsed "$t0")"
    # Seed the three demo users on every instance (in parallel across instances).
    t0="$(now)"
    local pids=() failed=0
    for i in $(seq "$first" $((first + n - 1))); do
        (
            for u in demo demo2 admin; do
                env -i PATH="$SAFE_PATH" HOME="$HOME" TMPDIR="$TMPDIR" LANG=C.UTF-8 TZ=UTC TC_DEV_HOME="$DEV_HOME" \
                    nice -n 10 node "$src/scripts/dev/login.mjs" "$(web_port "$i")" --user "$u" >> "$(inst_dir "$name" "$i")/login.log" 2>&1 || exit 1
            done
        ) &
        pids+=($!)
    done
    for p in "${pids[@]}"; do wait "$p" || failed=1; done
    [ "$failed" = 0 ] || { for i in $(seq "$first" $((first + n - 1))); do tail -n 8 "$(inst_dir "$name" "$i")/login.log" >&2; done; die "seeding demo users failed"; }
    echo "seed_secs=$(elapsed "$t0")"
    log "$n instance(s) of '$name' ready: web $(web_port 1)..$(web_port "$n"), admin $(admin_port 1)..$(admin_port "$n")"
}

# ─────────────────────────────── check ──────────────────────────────
# One phase = the same check on every running instance, in parallel; the phase time is the slowest job.
RES=""
phase_start() { PH_NAME="$1"; PH_T0="$(now)"; PH_PIDS=(); PH_FAIL=0; echo "$1 $(date +%T)" >> "$RES/phase-marks.txt"; }
phase_job() { "$@" & PH_PIDS+=($!); }
phase_end() {
    local p
    for p in "${PH_PIDS[@]}"; do wait "$p" || PH_FAIL=1; done
    printf '%s\t%s\t%s\n' "$PH_NAME" "$(elapsed "$PH_T0")" "$PH_FAIL" >> "$RES/timings.tsv"
    log "phase $PH_NAME: $(elapsed "$PH_T0") s (a job exited non-zero: $PH_FAIL)"
}
# chk <logfile> <script> <args...>: a kit script on the private node, under nice, env -i, output to the log.
chk() {
    local logfile="$1"; shift
    env -i PATH="$SAFE_PATH" HOME="$HOME" TMPDIR="$TMPDIR" LANG=C.UTF-8 TZ=UTC \
        TC_DEV_HOME="$DEV_HOME" TC_PLAYWRIGHT_DIR="$ROOT/pw/node_modules/playwright" TC_CHROME="$CHROME" \
        FONTCONFIG_FILE="$ROOT/fontconfig/fonts.conf" \
        nice -n 10 node "$@" > "$logfile" 2>&1
}
# The jobs (each runs in its own subshell; they never abort on a failing check, the exit code is collected).
# /dashboard/styleguide is a development-only page: production answers it with notFound() (shown as the error
# boundary), and in dev its skeleton demo is what made the VPS mobile run report loading=104. Skipped here unless
# TC_W1_KEEP_STYLEGUIDE=1. (--part splits the route list after --skip, so every other page is still covered once.)
skip_args() { [ "${TC_W1_KEEP_STYLEGUIDE:-0}" = 1 ] || echo "--skip /dashboard/styleguide"; }
job_crawl() {   # k n port
    local k="$1" n="$2" port="$3" rc=0
    chk "$RES/crawl-p$k.log" "$KIT/crawl.mjs" "$port" "$RES/crawl-demo/p$k" --part "$k/$n" --desktop-only $(skip_args) || rc=1
    if [ "$k" = "$n" ]; then chk "$RES/crawl-admin.log" "$KIT/crawl.mjs" "$port" "$RES/crawl-admin" --user admin --only /admin,/superadmin --desktop-only || rc=1; fi
    return "$rc"
}
job_mobile() { chk "$RES/mobile-p$1.log" "$KIT/check-mobile.mjs" "$3" --label "p$1" --out "$RES/mobile" --part "$1/$2" --no-shots $(skip_args); }
job_scen() { chk "$RES/scen-$1.log" "$KIT/check-scenarios.mjs" "$3" --users "$4" --out "$RES/scenarios/u$1"; }
job_multi() { chk "$RES/multi.log" "$KIT/check-multi-account.mjs" "$1" --out "$RES/multi"; }   # port (linked Google accounts e2e)
job_golden() { chk "$RES/golden-capture-$1.log" "$KIT/dash-golden.mjs" capture "$2" "$RES/golden/cand$1"; }

cmd_check() {
    local name="$1" what="${2:-all}" out="${3:-}" src="$SRC_ROOT/$1"
    [ -n "$out" ] || out="$ROOT/results/$name-$(date -u +%Y%m%d-%H%M%S)"
    local insts=() n idx k i
    mapfile -t insts < <(running_instances "$name")
    n="${#insts[@]}"
    [ "$n" -ge 1 ] || die "no running instances of '$name' (worker1.sh up $name)"
    [ -x "$CHROME" ] || die "no Chromium found (TC_CHROME or /root/ai-tutor-render/ms-playwright)"
    [ -d "$ROOT/pw/node_modules/playwright" ] || die "playwright node package missing in $ROOT/pw"
    ensure_dev_home
    KIT="$src/scripts/dev"
    RES="$out"; mkdir -p "$RES"; : > "$RES/timings.tsv"; : > "$RES/phase-marks.txt"
    echo "# time load1 memavail_mb phase" > "$RES/load.log"
    ( while sleep 5; do echo "$(date +%T) $(load1) $(mem_available_mb) $(tail -n 1 "$RES/phase-marks.txt" | cut -d' ' -f1)" >> "$RES/load.log"; done ) &
    local sampler=$!
    trap 'kill "$sampler" 2>/dev/null || true' EXIT
    export SAFE_PATH HOME TMPDIR DEV_HOME ROOT CHROME RES KIT
    log "check '$what' on $n instance(s); chrome $CHROME; results $RES"
    local all=0; [ "$what" = all ] && all=1

    if [ "$all" = 1 ] || [ "$what" = crawl ]; then
        phase_start crawl
        for idx in "${!insts[@]}"; do phase_job job_crawl "$((idx + 1))" "$n" "$(web_port "${insts[$idx]}")"; done
        phase_end
    fi
    if [ "$all" = 1 ] || [ "$what" = mobile ]; then
        phase_start mobile
        for idx in "${!insts[@]}"; do phase_job job_mobile "$((idx + 1))" "$n" "$(web_port "${insts[$idx]}")"; done
        phase_end
    fi
    if [ "$all" = 1 ] || [ "$what" = scenarios ]; then
        phase_start scenarios
        local users=(empty nogoogle f403 f429 f500 ftimeout fempty frevoked fhuge)   # the users of the main-VPS final gate
        if [ -n "${TC_W1_SCEN_USERS:-}" ]; then IFS=, read -r -a users <<< "$TC_W1_SCEN_USERS"; fi
        for idx in "${!insts[@]}"; do
            local mine="" u
            for u in "${!users[@]}"; do [ $((u % n)) -eq "$idx" ] && mine="${mine:+$mine,}${users[$u]}"; done
            [ -n "$mine" ] || continue
            phase_job job_scen "$((idx + 1))" "$n" "$(web_port "${insts[$idx]}")" "$mine"
        done
        phase_end
    fi
    if [ "$all" = 1 ] || [ "$what" = multi ]; then
        # "Connect another Google account" end to end as the `multi` user (one instance is enough).
        phase_start multi
        phase_job job_multi "$(web_port "${insts[0]}")"
        phase_end
    fi
    if [ "$all" = 1 ] || [ "$what" = golden ]; then
        # Two captures of the same build in parallel (like base/base2 on the VPS: a stability sample), then
        # a compare against baselines staged by worker1.sh in golden-base/<name>/ (TC_W1_GOLDEN_BASE, comma list).
        phase_start golden
        for idx in 0 1; do [ -n "${insts[$idx]:-}" ] && phase_job job_golden "$((idx + 1))" "$(web_port "${insts[$idx]}")"; done
        phase_end
        if [ -n "${TC_W1_GOLDEN_BASE:-}" ] && [ -d "$RES/golden/cand1" ]; then
            local bases=() b blist
            IFS=, read -r -a bases <<< "$TC_W1_GOLDEN_BASE"
            for b in "${!bases[@]}"; do bases[$b]="$ROOT/golden-base/$name/${bases[$b]}"; done
            blist="$(IFS=,; echo "${bases[*]}")"
            phase_start golden-compare
            chk "$RES/golden-compare.log" "$KIT/dash-golden.mjs" compare "$blist" "$RES/golden/cand1" --diff "$RES/golden/diff" || PH_FAIL=1
            printf '%s\t%s\t%s\n' "$PH_NAME" "$(elapsed "$PH_T0")" "$PH_FAIL" >> "$RES/timings.tsv"
        fi
        if [ -d "$RES/golden/cand2" ]; then
            chk "$RES/golden-selfcompare.log" "$KIT/dash-golden.mjs" compare "$RES/golden/cand2" "$RES/golden/cand1" --diff "$RES/golden/diff-self" || true
        fi
    fi
    kill "$sampler" 2>/dev/null || true; trap - EXIT
    node "$KIT/worker1-summarize.mjs" "$RES" --name "$name" --instances "$n" > "$RES/summary.json" 2> "$RES/summary.md" || log "summary failed"
    cat "$RES/summary.md"
    echo "RESULTS_DIR=$RES"
}

# ─────────────────────────────── status / clean ─────────────────────
cmd_status() {
    local d name i
    echo "load: $(cat /proc/loadavg)   MemAvailable: $(mem_available_mb) MB"
    for d in "$DEV_HOME"/*-[0-9]*/; do
        [ -f "${d}instance.env" ] || continue
        name="$(sed -n 's/^NAME=//p' "${d}instance.env")"
        local repo web wp ap; repo="$(sed -n 's/^REPO=//p' "${d}instance.env")"; wp="$(sed -n 's/^WEB_PORT=//p' "${d}instance.env")"; ap="$(sed -n 's/^ADMIN_PORT=//p' "${d}instance.env")"
        web="$(owned_pid "${d}web.pid" "$repo/web" || true)"
        echo "$name web=$wp pid=${web:-down} admin=$ap pid=$(owned_pid "${d}admin.pid" "${d%/}" || echo down)"
    done
    du -sh "$ROOT" 2>/dev/null | sed 's/^/size: /'
    ls "$SRC_ROOT" 2>/dev/null | sed 's/^/src: /'
}

cmd_clean() {
    local all="${1:-}" d name
    for d in "$DEV_HOME"/*-[0-9]*/; do
        [ -f "${d}instance.env" ] || continue
        name="$(sed -n 's/^NAME=//p' "${d}instance.env")"; name="${name%-*}"
        cmd_down "$name"
    done
    rm -rf "$DEV_HOME"/*-[0-9]* "$ROOT/results" "$ROOT/golden-base" "$ROOT/tmp"/* 2>/dev/null || true
    for d in "$SRC_ROOT"/*/; do [ -d "$d" ] && rm -rf "${d}web/.next"; done
    if [ "$all" = "--all" ]; then rm -rf "$SRC_ROOT"/* "$ROOT/cache"/* 2>/dev/null || true; fi
    log "clean done ($all). Toolchain (node, venv, pw, fontconfig, dev.env) kept."
}

cmd="${1:-}"; shift || true
case "$cmd" in
    deps)   validate_name "${1:-}"; cmd_deps "$1" ;;
    build)  validate_name "${1:-}"; cmd_build "$1" ;;
    up)     validate_name "${1:-}"; cmd_up "$1" "${2:-4}" "${3:-1}" ;;
    down)   validate_name "${1:-}"; ensure_dev_home; cmd_down "$1" ;;
    check)  validate_name "${1:-}"; cmd_check "$1" "${2:-all}" "${3:-}" ;;
    status) ensure_dev_home; cmd_status ;;
    clean)  ensure_dev_home; cmd_clean "${1:-}" ;;
    *) die "usage: worker1-remote.sh deps|build|up|down|check|status|clean ..." ;;
esac
