#!/usr/bin/env bash
# Run the TrafficClaw checks on worker1 instead of the main VPS (which hosts production).
#
#   scripts/dev/worker1.sh sync  <worktree> [--name n]   rsync code to worker1, npm ci once per lockfile hash
#   scripts/dev/worker1.sh build <name>                  production `next build` on worker1
#   scripts/dev/worker1.sh up    <name> [N] [--first K]  N instances (default 4) from slot K (default: first free slot): web 3201.., admin 8201.., fresh DB each
#   scripts/dev/worker1.sh check <name> [all|crawl|mobile|scenarios|golden|mcp|multi] [--golden-base dirA,dirB]
#   scripts/dev/worker1.sh down  <name>
#   scripts/dev/worker1.sh run   <worktree> [what] [N]   sync + build + up + check + down in one go
#   scripts/dev/worker1.sh status | clean [--all]
#
# <name> is the worktree folder without a leading "tc-" (tc-integrate -> integrate) unless --name is given.
# Results of `check` come back to /root/projects/tc-redesign-research/worker1-runs/<name>-<timestamp>/.
# Step times are appended to worker1-runs/timings.log. See scripts/dev/WORKER1.md.
#
# Safety: everything on worker1 is inside /root/trafficclaw-test (override TC_W1_ROOT); no production secrets,
# no Google credentials, demo data only; instances bind 127.0.0.1 and run under nice -n 10.
set -euo pipefail

HOST="${TC_W1_HOST:-worker1}"
RROOT="${TC_W1_ROOT:-/root/trafficclaw-test}"
LOCAL_RUNS="${TC_W1_RUNS:-/root/projects/tc-redesign-research/worker1-runs}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST")

die() { printf '[worker1] ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[worker1] %s\n' "$*" >&2; }
validate_name() { [[ "${1:-}" =~ ^[a-z0-9][a-z0-9_-]{0,19}$ ]] || die "name must match [a-z0-9][a-z0-9_-]{0,19} (got '${1:-}')"; }
now() { date +%s.%N; }
secs() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }
record() { mkdir -p "$LOCAL_RUNS"; printf '%s\t%s\t%s\t%s s\n' "$(date -u +%FT%TZ)" "$1" "$2" "$3" >> "$LOCAL_RUNS/timings.log"; log "$1 $2: $3 s"; }

name_from() {
    local n; n="$(basename "$(cd "$1" && pwd)")"; n="${n#tc-}"
    n="$(echo "$n" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9_\n-' '-' | cut -c1-20)"
    echo "$n"
}

# Put the remote runner on worker1 (it ships with this script, so both always match).
push_runner() {
    "${SSH[@]}" "mkdir -p '$RROOT/bin' '$RROOT/src'" || die "cannot reach $HOST over ssh"
    rsync -a -e "ssh -o BatchMode=yes" "$HERE/worker1-remote.sh" "$HOST:$RROOT/bin/worker1-remote.sh"
}
remote() { "${SSH[@]}" "bash '$RROOT/bin/worker1-remote.sh' $*"; }

cmd_sync() {
    local wt="${1:-}"; shift || true
    [ -d "$wt" ] || die "usage: worker1.sh sync <worktree> [--name n]"
    wt="$(cd "$wt" && pwd)"
    [ -f "$wt/web/package.json" ] && [ -f "$wt/admin/main.py" ] || die "$wt is not a TrafficClaw worktree"
    local name; name="$(name_from "$wt")"
    while [ $# -gt 0 ]; do case "$1" in --name) name="$2"; shift 2 ;; *) die "unknown option $1" ;; esac; done
    validate_name "$name"
    push_runner
    local t0; t0="$(now)"
    rsync -a --delete --stats -e "ssh -o BatchMode=yes" \
        --exclude=node_modules --exclude=.next --exclude=.git \
        --exclude='.env' --exclude='.env.*' --exclude=.venv --exclude=venv --exclude=__pycache__ --exclude='*.pyc' \
        --exclude='*.tsbuildinfo' --exclude=.DS_Store \
        "$wt/" "$HOST:$RROOT/src/$name/" | grep -E 'Number of (regular )?files transferred|Total transferred file size' >&2 || true
    record sync "$name" "$(secs "$t0")"
    t0="$(now)"
    remote deps "$name" >&2
    record deps "$name" "$(secs "$t0")"
    echo "$name"
}

cmd_build() {
    local name="${1:-}"; validate_name "$name"
    push_runner
    local t0; t0="$(now)"
    remote build "$name"
    record build "$name" "$(secs "$t0")"
}

cmd_up() {
    local name="${1:-}" n="${2:-4}" first=""; validate_name "$name"
    # --first K: start at instance K (ports 3200+K, 8200+K). Without it the runner takes the first free run of N slots.
    if [ "${3:-}" = "--first" ]; then first="${4:-}"; [[ "$first" =~ ^[0-9]+$ ]] || die "--first needs a number"; fi
    push_runner
    local t0; t0="$(now)"
    remote up "$name" "$n" "$first"
    record up "$name" "$(secs "$t0")"
}

cmd_down() { local name="${1:-}"; validate_name "$name"; push_runner; remote down "$name"; }

cmd_check() {
    local name="${1:-}" what="all" gbase=""; validate_name "$name"; shift || true
    while [ $# -gt 0 ]; do
        case "$1" in
            all|crawl|mobile|scenarios|golden|mcp|multi) what="$1"; shift ;;
            --golden-base) gbase="$2"; shift 2 ;;
            *) die "unknown option $1" ;;
        esac
    done
    push_runner
    local envs="" bases=() b d
    if [ -n "$gbase" ]; then
        IFS=, read -r -a bases <<< "$gbase"
        local names=()
        for b in "${bases[@]}"; do
            [ -d "$b" ] || die "golden base $b is not a directory"
            d="$(basename "$b")"; names+=("$d")
            "${SSH[@]}" "mkdir -p '$RROOT/golden-base/$name/$d'"
            rsync -a --delete -e "ssh -o BatchMode=yes" "$b/" "$HOST:$RROOT/golden-base/$name/$d/"
        done
        envs="TC_W1_GOLDEN_BASE=$(IFS=,; echo "${names[*]}")"
    fi
    [ -n "${TC_W1_SCEN_USERS:-}" ] && envs="$envs TC_W1_SCEN_USERS=$TC_W1_SCEN_USERS"
    local stamp t0 outlog rdir local_dir
    stamp="$(date -u +%Y%m%d-%H%M%S)"
    local_dir="$LOCAL_RUNS/$name-$stamp"
    mkdir -p "$local_dir"
    outlog="$local_dir/remote-check.log"
    t0="$(now)"
    # No stdin and the log tee'd: the summary at the end is what you read.
    "${SSH[@]}" "env $envs bash '$RROOT/bin/worker1-remote.sh' check '$name' '$what' '$RROOT/results/$name-$stamp'" 2>&1 < /dev/null | tee "$outlog" || true
    record check "$name/$what" "$(secs "$t0")"
    rdir="$RROOT/results/$name-$stamp"
    t0="$(now)"
    if "${SSH[@]}" "test -d '$rdir'"; then
        rsync -a -e "ssh -o BatchMode=yes" "$HOST:$rdir/" "$local_dir/"
        record pull "$name" "$(secs "$t0")"
        "${SSH[@]}" "rm -rf '$rdir'"
        log "results: $local_dir"
    else
        die "no results on $HOST ($rdir); see $outlog"
    fi
    grep -q . "$local_dir/timings.tsv" 2>/dev/null || die "check produced no phases; see $outlog"
}

cmd_run() {
    local wt="${1:-}" what="${2:-all}" n="${3:-4}" name
    name="$(cmd_sync "$wt")"
    cmd_build "$name"
    cmd_up "$name" "$n"
    trap 'cmd_down "$name" >/dev/null 2>&1 || true' EXIT
    cmd_check "$name" "$what"
    cmd_down "$name"
    trap - EXIT
}

cmd="${1:-}"; shift || true
case "$cmd" in
    sync)   cmd_sync "$@" ;;
    build)  cmd_build "$@" ;;
    up)     cmd_up "$@" ;;
    down)   cmd_down "$@" ;;
    check)  cmd_check "$@" ;;
    run)    cmd_run "$@" ;;
    status) push_runner; remote status ;;
    clean)  push_runner; remote clean "${1:-}" ;;
    *) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
