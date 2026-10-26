# Local dev + verification kit

Run TrafficClaw (Next.js web + FastAPI admin) on this box with **realistic demo
Google data**, log in without OAuth, take screenshots and crawl every page.
Nothing here talks to production, Google, email, Telegram or payments.

> **RAM rule: bring a server up, take shots, bring it down; never leave it idle.**
> **Disk rule: delete your worktree's `web/.next` when your session of checks is done** (`rm -rf web/.next`; 0.4–1.4 GB each).
> (Production runs on this box. Max 2 dev servers at once; `up.sh` refuses below 2.5 GB free RAM
> or 3 GB free disk; `down.sh` deletes `web/.next` itself when / has under 8 GB free.)

```
scripts/dev/up.sh <name> <webPort> <adminPort> [--fresh]   start (idempotent)
node scripts/dev/login.mjs <webPort> [--user demo|demo2|admin]
node scripts/dev/shot.mjs <url> <out.png> [--state f] [--mobile] [--dark] [--full] [--wait ms]
node scripts/dev/crawl.mjs <webPort> <outDir> [--user u] [--only /a,/b] [--part k/n] [--desktop-only|--mobile-only]
scripts/dev/status.sh                                       list instances
scripts/dev/down.sh <name> [--purge]                        stop (and delete data)
```

## 1. Make a worktree (one per agent)

```bash
cd /root/projects/worktrees/trafficclaw-live
git worktree add /root/projects/worktrees/tc-<you> -b work/<you> work/live
# Share node_modules by hard links (no extra disk, ~1 s):
cp -al /root/projects/worktrees/trafficclaw-live/web/node_modules /root/projects/worktrees/tc-<you>/web/node_modules
```

Never `npm install` inside a hard-linked `node_modules` (it would modify the
shared files). If you need different packages: `rm -rf web/node_modules && npm ci`.
Never `next build` (disk is tight).

## 2. Pick ports (and get a dev slot)

Each agent takes one port pair: web **3101–3109**, admin **8101–8109** (same
last digit), and uses its own name. The kit itself uses `kit 3101 8101`.

**At most 2 `next dev` servers may run on this box at once, across all
worktrees.** `up.sh` takes one of two slot locks
(`/root/.trafficclaw-dev/slots/slot{1,2}.lock`); the running web server
holds it and the kernel releases it when the server stops or dies, so there
are no stale slots. If both are busy, `up.sh` waits up to
`TC_SLOT_WAIT_MIN` minutes (default 10) and then exits with
`no free dev slot` — nothing is started in that case. It also refuses to
start when `MemAvailable` is below 2500 MB. `down.sh` frees the
slot; `scripts/dev/status.sh` shows ports, pids and who holds each slot.

## 3. Start, log in, look

```bash
cd /root/projects/worktrees/tc-<you>            # the code that runs is the worktree you are in
scripts/dev/up.sh <you> 3102 8102               # ~15 s; first page compile takes 10–40 s more
node scripts/dev/login.mjs 3102                 # → /root/.trafficclaw-dev/<you>/state.json
node scripts/dev/shot.mjs http://localhost:3102/dashboard/analytics /tmp/a.png \
     --state /root/.trafficclaw-dev/<you>/state.json --full
node scripts/dev/crawl.mjs 3102 /tmp/crawl-<you> --only /dashboard/seo   # a few routes, desktop + mobile, report.md
scripts/dev/down.sh <you>                        # always stop when done (RAM is shared with production)
```

- A full crawl (all ~67 routes) compiles every page and grows `next dev` to ~3.5 GB:
  do it in halves with a restart in between (same outDir, reports merge):
  `crawl.mjs 3102 /tmp/c --part 1/2; down.sh <you>; up.sh <you> 3102 8102; crawl.mjs 3102 /tmp/c --part 2/2`.
  The crawl stops itself (exit 3) if free RAM drops below 1.8 GB.
- `up.sh` runs the code of the git worktree you are standing in (or `TC_REPO=/path`).
  It refuses to reuse a name that is running from another worktree or other ports.
- `--fresh` deletes that instance's admin DB (users, dashboards, shares …); run `login.mjs` again after it.
- Code changes hot-reload; no restart needed. Restart (`down` + `up`) after changing env or `instrumentation.ts`.
- Logs: `/root/.trafficclaw-dev/<name>/web.log` and `admin.log`.
- Free disk after you finish: `rm -rf web/.next` in your worktree, and `down.sh <name> --purge`.

### Users (`login.mjs --user`)

| user | who | data | workspace |
|---|---|---|---|
| `demo` (default) | Demo Owner, plan **pro**, 300 credits | all 8 GA4 properties + 10 GSC sites | Acme Analytics (`properties/412300101` + `sc-domain:acmeanalytics.example`) |
| `demo2` | Second Demo User, plan **free** | Puzzle Hub + Creative Prints (GA4), puzzlehub + recipenest (GSC) | Puzzle Hub |
| `admin` | Demo Admin, pro | same as demo | Search Metrics; is `ADMIN_GITHUB_ID` (→ `/admin`) and gets a superadmin token in sessionStorage (→ `/superadmin`) |

State files: `state.json` (demo), `state-demo2.json`, `state-admin.json` in the
instance dir. The first login of each user also seeds sample records through
the app's own API (3 annotations, 2 goals, 1 funnel, a custom dashboard + its
public link, a share link, an embed token, a leaderboard entry) and writes their
ids/tokens to `<instance>/seed.json`; `crawl.mjs` uses them for dynamic routes.
`--reseed` seeds again, `--no-seed` skips it.

`shot.mjs`/`crawl.mjs` hide the Next.js dev badge in images but report its
issue count (`devIssues`). Third-party noise (Tawk, Cloudflare beacon, GTM …)
is counted separately in crawl reports.

## 4. Demo data mode (`TC_DEMO_DATA=1`)

`up.sh` sets `TC_DEMO_DATA=1`. `web/src/instrumentation.ts` then installs a
fetch shim (`web/src/lib/demo/fetchShim.ts`) in the Next.js server. Every
server-side request to a Google data API is answered by a seeded generator in
`web/src/lib/demo/` — so `lib/googleApi.ts` **and** the ~20 routes that call
Google directly work unchanged, and new code that calls Google gets demo data
automatically:

| Google endpoint | demo answer |
|---|---|
| `oauth2.googleapis.com/token` | `demo-access:<account>` token |
| GA4 Admin `accountSummaries`, `properties/{id}`, `…/dataStreams` | catalogue below |
| GA4 Data `:runReport`, `:batchRunReports`, `:runRealtimeReport`, `/metadata`, cohorts | any dimensions/metrics/filters/orderBys/date ranges |
| Search Console `sites`, `searchAnalytics/query`, `sitemaps`, URL inspection | any of date/query/page/country/device/searchAppearance, filter groups, rowLimit/startRow |
| PageSpeed Insights, CrUX | deterministic Lighthouse / field data per URL |
| admin `POST /api/users/:id/exec` (`list-properties-json`, `list-sites-json`) | property / site lists for the user's demo account |

Requests with a non-demo bearer token are refused (401) and never leave the
box. Gemini/Vertex calls are not intercepted; with no key configured the AI
features show their normal "unavailable" path. It never runs when
`NODE_ENV=production`, and nothing changes when `TC_DEMO_DATA` is unset.

### Use the generator directly (new features, public demo page)

```ts
import { demoRunReport, demoRunRealtimeReport, demoSearchAnalytics, getDemoSites } from '@/lib/demo';
demoRunReport('properties/412300101', { dateRanges: [{ startDate: '27daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }] });
demoSearchAnalytics('sc-domain:acmeanalytics.example', { startDate: '2026-09-01', endDate: '2026-09-30', dimensions: ['query', 'device'] });
```

Pure functions, seeded RNG, no network. Same inputs on the same day give the
same numbers (today's partial day is a fixed 55 %; realtime changes each minute).
A Google endpoint the shim does not know returns 501 and logs
`[demo-data] unhandled Google request …` in `web.log` — add a case to
`fetchShim.ts` (and the generator) when you hit one.

### Catalogue (16 months of daily data back from today)

| Site | GA4 property | Search Console | Shape |
|---|---|---|---|
| Acme Analytics – SaaS | `properties/412300101` | `sc-domain:acmeanalytics.example` (includes docs. subdomain pages) | growing ~180 → 2,400 users/day |
| Health Insights – blog | `properties/412300102` | `https://www.healthinsights.example/` | declining + core-update drop ~5 months ago |
| DataViz Pro – B2B SaaS | `properties/412300103` | `sc-domain:datavizpro.example` | steady, strong weekday pattern |
| Puzzle Hub – games | `properties/412300104` | `https://puzzlehub.example/` | spiky (viral spikes, one 9 days ago) |
| Search Metrics – SEO tool | `properties/412300105` | `sc-domain:searchmetrics.example` | large (~14k/day), seasonal dips |
| Design Studio – agency | `properties/412300106` | `https://www.designstudio.example/` | brand-new (launched 44 days ago) |
| Split Expenses – app | `properties/412300107` | `sc-domain:splitexpenses.example` | near-zero, many empty days |
| Creative Prints – shop | `properties/412300108` | – (GA4 only) | holiday peaks, revenue/purchases |
| Acme Docs | – | `https://docs.acmeanalytics.example/` (GSC only) | growing |
| Recipe Nest | – | `sc-domain:recipenest.example` (GSC only) | seasonal (Thanksgiving/Christmas) |
| Health Insights (old http) | – | `http://healthinsights.example/` (GSC only) | near-zero |

GA4 accounts: *Acme Holdings* (acme, dataviz, searchmetrics), *Side Projects*
(puzzle, designstudio, splitexpenses), *Client Sites* (health, creativeprints).
Search Console data stops 2 days before today (1 day with `dataState: 'all'`),
like the real API. Edit sites, shapes and topics in `web/src/lib/demo/catalog.ts`.

## 5. What up.sh sets up

- `/root/.trafficclaw-dev/` (mode 700): `venv/` (admin Python deps, shared),
  `dev.env` (mode 600: NEXTAUTH_SECRET, ADMIN_API_KEY, OAUTH_TOKEN_ENC_KEY,
  CRON_SECRET, SHARE_WATERMARK_SECRET, SUPERADMIN_PASSWORD, AITRAFFIC_BRIDGE_SECRET —
  generated once, dev only), and one dir per instance (`admin.db`, logs, pids, states, seed).
- Both servers start under `env -i` (nothing leaks in from your shell), bound to 127.0.0.1.
- The admin runs with `DOCKER_HOST` pointing at a missing socket, so it is in
  Docker stub mode and never sees the production containers.
- Not configured on purpose: Gemini/Vertex, Brevo, Telegram, Dodo, Twitter/X,
  GitHub app, Coolify, Upstash, Umami, Brave. Features that need them show
  their fallback. Google/GitHub client ids are dummies (OAuth buttons go nowhere).
- `next dev` gets `NODE_OPTIONS=--max-old-space-size=1536` and a Turbopack cache
  target of 1 GB (`TC_TURBOPACK_MEMORY_LIMIT_MB`, read by `web/next.config.ts`,
  unset in production). Expect 1–2.5 GB RSS per instance once many routes are
  compiled (a full crawl compiles all of them, ~3 GB). **The box also runs
  production: run `down.sh` as soon as you have your screenshots.**

Harmless warnings in `web.log`: "Next.js inferred your workspace root …
/root/package-lock.json" and "middleware file convention is deprecated".

## 6. Leaderboard seed (public board for screenshots and tests)

`login.mjs` (demo user, first run) also seeds a populated public leaderboard: 15 listings
(13 ranked across 10 categories, 2 left on "Pending verification" to show the fix-it messages),
with a mix of exact / range / hidden privacy, ad slots and offers in the inbox. It goes
through the real routes (`POST /api/leaderboard/me`, PATCH, publish) and runs the daily cron
once, so the whole pipeline runs against the demo Google generator. Skip it with `--no-board`.

```bash
node scripts/dev/seed-leaderboard.mjs 3105          # idempotent; run again to refresh
python3 scripts/dev/check_leaderboard_privacy.py 3105 <instance>   # fails on any leak of hidden/banded values
curl -H "Authorization: Bearer $(grep ^CRON_SECRET /root/.trafficclaw-dev/dev.env | cut -d= -f2)" \
     http://localhost:3105/api/cron/leaderboard-refresh   # the daily refresh, by hand
```

The community sites (PixelForge, ByteBrief, ShipFast, LearnLoop, Promptly, Green Grocer, Quiet Labs)
live in `web/src/lib/demo/catalog.ts`, each with its own demo Google account `founder-<key>`.
Quiet Labs has restricted Search Console access on purpose.
