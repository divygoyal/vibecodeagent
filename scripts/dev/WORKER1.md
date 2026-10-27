# worker1: an isolated TrafficClaw test machine

The dev kit (see `README.md`) runs `next dev` next to production on the main VPS (16 GB RAM, 2-6 GB free).
`scripts/dev/worker1.sh` runs the same checks on **worker1** (8 cores, 31 GB, Ubuntu 24.04) against a
**production build**, several instances in parallel, so the VPS is not touched. The owner approved this (2026-10-27).

## Commands (run on the main VPS)

```bash
cd /root/projects/worktrees/tc-<you>
scripts/dev/worker1.sh sync  .                 # rsync code (no node_modules/.next/.git/.env*), npm ci once per lockfile hash
scripts/dev/worker1.sh build <name>            # production `next build` (~50 s)
scripts/dev/worker1.sh up    <name> [N] [--first K]  # N instances (default 4): web 3201.., admin 8201.. (3200+K.. with --first), fresh SQLite, demo users seeded (~15 s)
scripts/dev/worker1.sh check <name> [all|crawl|mobile|scenarios|golden|multi] [--golden-base dirA,dirB]
scripts/dev/worker1.sh down  <name>
scripts/dev/worker1.sh run   . [what] [N]      # sync + build + up + check + down
scripts/dev/worker1.sh status                  # load, memory, running instances, disk
scripts/dev/worker1.sh clean [--all]           # stop ours, delete results/.next/instance data (--all: also sources and node_modules caches)
```

`<name>` is the worktree folder without `tc-` (`tc-integrate` is `integrate`); `sync <path> --name x` overrides it.
`check` prints a summary (phase times, counts, load) and pulls everything to
`/root/projects/tc-redesign-research/worker1-runs/<name>-<timestamp>/`: `summary.md`/`summary.json`, the kit's
reports and logs (`crawl-p*.log`, `mobile-p*.log`, `scen-*.log`), crawl screenshots, `golden/`, `load.log`,
`timings.tsv`. Step times (sync, deps, build, up, check, pull) are appended to `worker1-runs/timings.log`.

What `check` does, on the N running instances at once (the slowest job is the phase time):
- **crawl**: `crawl.mjs --part k/N --desktop-only` per instance, plus `/admin` and `/superadmin` as admin.
  `/dashboard/styleguide` is skipped in crawl and mobile (dev-only page: production 404s it, and its skeleton demo is
  what made the VPS mobile run report loading=104); `TC_W1_KEEP_STYLEGUIDE=1` keeps it.
- **mobile**: `check-mobile.mjs --part k/N --no-shots` (360/390/414, light + dark).
- **scenarios**: `check-scenarios.mjs`, the 9 users of the main-VPS final gate spread over the instances
  (`TC_W1_SCEN_USERS=a,b,c` changes the list).
- **multi**: `check-multi-account.mjs` on the first instance: the `multi` user (two Google accounts, the second
  linked as a data connection) end to end: Settings list and screenshots, union directory and portfolio, account-2
  data, Disconnect in the UI, the demo link flow (added / same / cancelled / forged state), a revoked extra account.
- **golden**: two captures of the same build in parallel (a stability sample), then `compare` against the
  baselines given with `--golden-base` (exact pixels; a shot passes if it equals any baseline). It also compares the
  two captures with each other.

## What is on worker1 (all in `/root/trafficclaw-test`, about 3 GB with two builds)

| Path | What |
|---|---|
| `node/` | private Node 22.22.0 (tarball). worker1's own `/usr/local/bin/node` is another project's (Node 26) and is never used. |
| `venv/` | Python 3.12 venv with `admin/requirements.txt` (made `--without-pip`, pip from get-pip.py; no apt, no ensurepip). Reinstalled when the requirements hash changes. |
| `pw/` | the `playwright` 1.62.0 **node** package only (no browser download). `TC_PLAYWRIGHT_DIR` points here. |
| Chromium | reused **read-only** from `/root/ai-tutor-render/ms-playwright/chromium-1234` (151.0.7922.34, the same branch as the main VPS's Chrome 151). `TC_CHROME` points at it. Nothing is written there: Chromium's profile lives in our `home/` and `tmp/`. |
| `fontconfig/` | `fonts.conf` = the AI-tutor box's config (the main VPS's fonts, so layout checks measure the same text widths), with its cache dir moved to ours. The font files themselves are read from `/root/ai-tutor-render/fonts` (read-only). |
| `dev.env` (mode 600) | fresh dev-only secrets: NEXTAUTH_SECRET, ADMIN_API_KEY, OAUTH_TOKEN_ENC_KEY, CRON_SECRET, SHARE_WATERMARK_SECRET, SUPERADMIN_PASSWORD, AITRAFFIC_BRIDGE_SECRET. Not copied from anywhere. |
| `src/<name>/` | the synced code. `web/node_modules` is a hard-link copy of `cache/nm-<lockhash>/node_modules`. |
| `cache/` | `nm-<hash>/` (the two newest lockfile hashes). |
| `dev-home/<name>-<i>/` | per instance: fresh `admin.db`, logs, pid files, login states, `seed.json`. The kit's `TC_DEV_HOME` points at `dev-home/`. |
| `results/`, `golden-base/`, `bin/` | run output (deleted after it is pulled), staged golden baselines, the remote runner. |

**apt packages installed: none. System files and services changed: none.** No production secret, no Google OAuth
credential, no user data: demo data only (`TC_DEMO_DATA=1`), Docker stub mode for the admin
(`DOCKER_HOST` points at a missing socket, as in the kit), Google client ids are dummies.

Rules it follows: only ports 3201-3210 and 8201-8210 on 127.0.0.1 (it refuses to start if one is taken); every
process under `env -i`, `nice -n 10` and `setsid`; stop/kill only pids from its own pid files after checking the
process runs in our directory; one build at a time (`build.lock`), builds refused under 8 GB free RAM; no
instances under 6 GB free RAM. The other projects on worker1 (autopilot-repo, deepflast-worker, workday-engine,
workday-live, jobs, docker on 80/443/6001/6002/8000/8080, `/root/.cache/*`, the AI-tutor box's own files) are never touched.

## Why a production build needs one switch

`TC_DEMO_DATA=1` is refused when `NODE_ENV=production`, and `next start` is production. `web/src/lib/demo/gate.ts`
(`demoDataAllowed()`, used by `instrumentation.ts` and the audit route) now also accepts
`TC_ALLOW_DEMO_IN_PROD_BUILD=1`, **only** when `NEXTAUTH_URL`'s host is `localhost`, `127.0.0.1` or `[::1]`. The flag is
unset everywhere except `worker1-remote.sh`, and a real deployment has a public `NEXTAUTH_URL`, so setting it by
mistake in production still changes nothing. Tests: `web/tests/demoGate.test.mjs`.

## Differences from the VPS `next dev` checks

- Production build: no dev overlay (`devIssues` is always 0), no on-demand compile, so pages answer in 3-5 s instead
  of 5-10 s and the "still loading" flags caused by slow compiles are gone. Static pages are prerendered. It is closer
  to what users get, but a finding that only exists in dev mode will not show up here, and the reverse.
- `next start` prints a warning about `output: 'standalone'` and works anyway.
- `NEXT_PUBLIC_SITE_URL` is unset at build (as in a normal build), so canonical URLs say `https://trafficclaw.com`.
- Demo data is deterministic per UTC day, so compare golden shots taken on the same day.

## Measured (2026-10-27, tc/integrate, 4 instances)

Crawl 68 s, mobile 158 s, scenarios 393 s, golden 172 s; sync 1 s, build 49 s, up 12 s. The same crawl + mobile + scenarios took
42:35 on the main VPS. Peak load on worker1 6.0 (mean 2.5), at least 25 GB RAM free throughout.
Full table and findings: `/root/projects/tc-redesign-research/worker1-runs/BENCHMARK.md`.

## Troubleshooting

- `status` shows what runs. `ssh worker1 'tail -n 50 /root/trafficclaw-test/dev-home/<name>-1/web.log'` for a server log.
- A failed `build` keeps its log at `/root/trafficclaw-test/results/build-<name>.log`.
- A new Playwright/Chrome version on the AI-tutor box: our `pw/` package stays at 1.62.0; if its Chromium directory name
  changes the runner picks the highest `chromium-*` automatically.
- Remove everything: `scripts/dev/worker1.sh clean --all`, then `ssh worker1 'rm -rf /root/trafficclaw-test'`.
