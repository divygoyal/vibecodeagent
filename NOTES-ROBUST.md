# Robustness notes (tc/integrate, dev instance `integrate` 3101/8101)

Goal: no "Something went wrong", nothing cut off on a phone, a clear state for every Google failure.
Reports and screenshots: `/root/projects/tc-redesign-research/robust/`. Shared worktree: commits use
`git commit -- <paths>` only.

## Checks (all in scripts/dev, see README §7–8)
| command | what |
|---|---|
| `cd web && npm run check:rsc` | TypeScript-API scan of every Server Component module (app entries + non-client imports, per binding through barrels): JSX props to Client Components / host elements that are functions, `.bind`, class instances (URL, RegExp, Error, Intl, user classes) or contain one. Client references and JSX are fine; Date/Map/Set are notes. Fixture test `tests/check-rsc-props.test.mjs`. Catches both earlier crashes on their parent commits (25cbc9b Button icons, 6db24d7 BarList formatValue). |
| `node scripts/dev/check-mobile.mjs 3101` | every route at 360/390/414, touch, light + dark (`/dashboard`); sideways scroll, elements past the edge (outermost; scroll containers exempt), text/controls cut by overflow:hidden, own text clipped without ellipsis, tap targets < 32px (pseudo-element hit areas count; tabindex-only tooltip spans do not), fixed elements over the tab bar and content behind it at the page end, error boundary, NaN/undefined/Infinity/[object Object]/Invalid Date on screen, spinners still up after 20 s, /api 5xx or non-JSON errors. `--paths`, `--cookie tc_demo_faults=…`, `--user`, `--state none`. Retries a page when the dev server restarts. |
| `node scripts/dev/check-scenarios.mjs 3101` | logs in as each scenario user and runs check-mobile on 18 app pages; `cookie:<spec>` users run public pages logged out with the fault cookie. Table: `robust/scenarios.md`. |
| `node scripts/dev/check-api.mjs 3101` | GET every /api route (side-effect GETs skipped) under each fault; flags HTML/empty answers, 5xx without a message, hangs. `robust/api-<user>.md`. |
| `node scripts/dev/seed-dashboards.mjs 3101 --user u` | one dashboard per template + the every-widget showcase via the app API; prints paths for `check-mobile --paths`. |
| `cd web && npm run check:all -- --base http://localhost:3101 [--full]` | tsc, ESLint on files changed since the work/live merge-base (fails only on errors the branch added, per file and rule), npm test, check:rsc, check-mobile (key routes at 360/390; all with --full). |

## Demo faults and scenario users
`web/src/lib/demo/faults.ts`: `TC_DEMO_FAULTS` env, `tc_demo_faults` cookie, or a `~spec` suffix on a demo token.
Faults 403, 429, 500, timeout[:ms], empty, revoked, huge; scopes ga4, gsc, psi, list, all (default: every data call,
lists still work). The token refresh keeps the suffix. Unit tests: `tests/demoFaults.test.mjs`.
New demo accounts in catalog.ts: empty, one, ga4only, gsconly, many (200 generated sites outside getDemoSites(), some
with 90-character hosts). login.mjs users: those plus nogoogle (GitHub sign-in, no token stored), nocredits, f403 f429
f500 ftimeout fempty frevoked fhuge (the demo account's sites with that fault).

## Fixed (commit, what)
- e4473a3, ddb59dc Home hero cards, leaderboard, MCP and dashboard sections overflowed at 360–390px: single-column grids
  had an implicit `auto` track sized by the widest unbreakable content (cards, BarList values, buttons) and
  `main{overflow-x:clip}` / BrowserFrame `overflow:hidden` cut them. `grid-cols-1` (minmax(0,1fr)) + `min-w-0`.
- 64997fe Leaderboard profile breakdowns ran 60px off a 360px screen (same cause), `md:grid-cols-[3fr_2fr]` →
  minmax(0,…). Touch-only (`pointer-coarse:`) hit areas, no desktop change: Switch, Checkbox, table sort headers,
  SegmentedControl, link buttons ("View all"), stat/scorecard info icons, Suggested fix, brand link, offer pills; pill
  Tabs 32px; footer and similar-site links 32px rows.
- bdfbaa9 Error boundaries in the new design via `components/app/ErrorScreen.tsx`: dashboard (inside the shell),
  site segment `/dashboard/s/[host]` (new), marketing, global-error (light canvas + brand). Reload (full load), Go home /
  Go to Portfolio, Error ID; each hit logs to the console, Clarity and the server log (`POST /api/client-error`,
  4 KB cap, 20/min per IP): `[client-error] scope=… digest=… path=… message=…`.
- 1ad06b9 Portfolio: a Google account with 0 properties stayed on "Finding your sites" forever (needsSync([]) is
  always true, so every poll started a sync and `syncing` never cleared); an inventory that failed at Google did the
  same while re-listing on every poll. Now: "no sites" after an empty sync (re-check after 10 min or Check again),
  "Couldn't reach Google" + Try again after a failed one (retry after 60 s).
- 8b2ae64 Portfolio with a property Google refuses (403) re-ran the whole sync every 2 s while the page was open (18
  Google calls per poll, spinner forever): never-synced `no_access` assets had no back-off in isDue(). Now 30 min (Sync
  now forces). The exact-users report backs off 5 min after a failed run (429/5xx) instead of restarting per poll.
- 7f67727 Search tab: with a failed summary (429/403/500) the four metric tiles kept skeletons forever; now a dash (the
  chart shows the error and Try again).
- 7ebd3f4 ChunkLoadError (a tab opened before a deploy asks for chunks the new build no longer has) showed "Something went
  wrong"; the error screen now reloads once (60 s guard in sessionStorage) for chunk-load errors.
- cce8bdc Dashboards: the pie widget's donut and legend were cut top and bottom on phones (legend below needs more
  height than the cell); the donut leaves room for 3 legend rows and the rest folds into "Other".
- f716de8 Site filter chips (Striking distance, Declining, …) 32px on touch.
- c652a0d check-mobile: timeouts on every page call (a page call hung the dashboards run for 20 min).
- 890b76d `shot.mjs`/`crawl.mjs --dark` produced light pages (theme is `localStorage['tc-theme']`); pw.newContext sets it.

## Server log audit (integrate + preview web.log)
| signature | count | cause | status |
|---|---|---|---|
| `Functions cannot be passed directly to Client Components` `{formatValue: function}` / `render: function ArrowRight` | 26 dev, 42 preview | BarList formatValue and Button icons from Server Components | fixed 6db24d7, 25cbc9b; guarded by check:rsc |
| `ChunkLoadError` / `Cannot find module .next/server/chunks/ssr/…` / `Could not find the module … in the React Client Manifest` (preview) | ~300 | `.next` was rebuilt under a running `next start`; the old process asks for chunk files that no longer exist | process: stop the preview, build, start (or build into a fresh dir). Production (Coolify image) is not affected |
| `"next start" does not work with "output: standalone"` (preview) | 4 | preview runs `next start` on a standalone build | harmless for a preview; production uses the standalone server |
| `[AUDIENCE] Gemini topics failed: 403 … Gemini API has not been used in project …` (preview) | 2 | the preview's Gemini key belongs to a GCP project with the Generative Language API disabled | config: enable the API on that project or use the production key; AI features fall back meanwhile |
| `Element type is invalid … got: object` (SSR) / `Lazy element type must resolve to a class or function` (browser) on `GET /?…` (dev) | 42+ | dev server only, still there after a clean `.next`: the home page 500s for some query-string lengths (`?foo=/xxxxxxxxxxxxxxxx` 16–20 chars fails, 15 or 24+ passes; `?callbackUrl=/dashboard` fails, `/dash` passes). Depends only on the URL length, not on the param or the sign-in banner, and only on `/` (a copy of the page at another path never fails): a byte-offset bug in dev streaming of the 430 KB page | production build unaffected (`/` is static; preview returns 200 and the banner renders). Watch item; the marketing boundary shows Reload/Go home if it ever happens |
| `Module … ShareConversionBar.tsx [app-ssr] was instantiated … deleted in an HMR update` (dev) | 1 | HMR race while the sweep branch was merged | harmless (dev only) |
| `Server is approaching the used memory threshold, restarting` (dev) | 11 | full crawls compile every route (child reaches ~4.5 GB) | dev only; check scripts wait and retry |
| `middleware file convention is deprecated` / `inferred your workspace root` | 15 | Next 16 rename / lockfile in /root | harmless (README) |
| MCP `{"evt":"mcp_tool",…"status":"error:rate_limited|site_not_in_grant|…"}` | ~25 | structured logs of the MCP tests' expected refusals | harmless |

## Results (robust/ reports)
- Mobile, all routes, 360/390/414, light + dark app routes: `mobile-demo.md` (baseline, after the home fixes) and
  `mobile-final.md` (65 route/theme pairs re-run before the stop; the rest of the marketing/share/tools routes were
  clean in the baseline). Baseline real issues: leaderboard profile 99 elements off-screen, every dashboard with a pie
  widget 12 clipped; home before ddb59dc 48 off-screen + 18 clipped. Final: 0 overflow / off-screen / clipped / text
  clipped / tab-bar overlaps; tap targets under 32px 1542 -> 343 on the same pages (summed over 3 widths).
- Scenarios (`scenarios.md`, 390px, 18 app pages × 14 users + 4 cookie runs × 10 public pages): no error boundary, no
  NaN/undefined. Remaining flags are explained: L on f403/f429 = before 8b2ae64/7f67727 (re-checked by hand after:
  syncing false, tiles show a dash), L on ftimeout/many = a real first sync still running (15 s timeouts, 200 sites),
  E on ga4only/ftimeout = dev-server restart / HMR ChunkLoadError (now auto-reloads), A on frevoked dashboards = HTML
  500s during the Turbopack crash, j = JSON 5xx with a message (fine).
- Dashboards: 9 templates + every-widget showcase, light/dark, 3 widths (`mobile-dash-none.md`, stopped at 14/20 by a
  hung page call, now guarded) and 390px under 403/429/500/empty/huge/revoked/timeout (`mobile-dash-*.md`): every
  widget shows data, an empty state or an error with Try again. The builder's 60 s circuit breaker shows "Google is
  rate limiting this property" for a minute after 3 server errors (by design).
- Leaderboard: all 13 public profiles + embeds (light, 5 dark), join, advertise, unknown slug: `mobile-leaderboard.md`.
- Not finished (stopped for the usage limit): `check-api.mjs` over every GET route × faults, the re-run of the fixed
  scenario pages, and the last ~16 routes of `mobile-final`. Run: `node scripts/dev/check-api.mjs 3101`,
  `node scripts/dev/check-scenarios.mjs 3101 --users f403,f429,ftimeout`, `node scripts/dev/check-mobile.mjs 3101 --label final`.

## Open (severity)
- Medium (sweep area, report only): `/api/share/<token>/overview/stats` answers 500 with an empty body when Google
  fails (429/500 cookie runs on /share/<token>); should be JSON 4xx/5xx with a message.
- Low: with counts × 10M (`cookie:huge`) public share/view pages show 81 text-spill spots (numbers wider than their
  box, not clipped); check `mobile-scen-cookie-huge.md`.
- Medium: a sync interrupted by a restart or deploy leaves assets `syncing`; the portfolio then reports `syncing` and
  polls every 2 s for up to 15 min (SYNC_STUCK_S in build.ts/sync.ts) before a new sync runs. With one web process,
  "syncing in the store but no sync running in this process" means interrupted and could resync at once; not changed
  here because it assumes a single instance.
- Low: the Tawk.to greeting ("Hi! How can we help?" + two buttons) opens over half of a phone screen on every app page
  and hides content (seen in every mobile screenshot). Tawk dashboard setting: turn the greeting off on mobile.
- Low: `/api/analytics?mode=list` and `/api/seo?mode=list` answer 502 with the raw Google JSON inside `error`
  (`Google API error 401: {"error":…}`), also for a revoked token where 401 + "Reconnect Google" would be right. JSON,
  not shown in the UI.
- Low: standalone text links are 18–20px tall ("Open the full demo", "See pricing", breadcrumbs) and the marketing logo
  link 28px; footer, toggles, tabs, table headers, segmented controls and pills are fixed (touch only).
- Low (dev only): `/` 500s for some URL lengths (see the log table). Prod build unaffected.
- Info: ~70 responsive grids still have no `grid-cols-1` base; none overflowed with the tested data (90-character hosts
  at 390px, counts × 10M at 360px), but unusual content could. Fix as found: `grid-cols-1` / `minmax(0,…)`.
- Info: the synthetic `nogoogle` user (GitHub session without a token) gets 503 from /api/auth/register-provider
  (`missing-session-data`, handled as degraded); a real GitHub sign-in carries a token.
