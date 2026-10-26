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
- 890b76d `shot.mjs`/`crawl.mjs --dark` produced light pages (theme is `localStorage['tc-theme']`); pw.newContext sets it.

## Server log audit (integrate + preview web.log)
| signature | count | cause | status |
|---|---|---|---|
| `Functions cannot be passed directly to Client Components` `{formatValue: function}` / `render: function ArrowRight` | 26 dev, 42 preview | BarList formatValue and Button icons from Server Components | fixed 6db24d7, 25cbc9b; guarded by check:rsc |
| `ChunkLoadError` / `Cannot find module .next/server/chunks/ssr/…` / `Could not find the module … in the React Client Manifest` (preview) | ~300 | `.next` was rebuilt under a running `next start`; the old process asks for chunk files that no longer exist | process: stop the preview, build, start (or build into a fresh dir). Production (Coolify image) is not affected |
| `"next start" does not work with "output: standalone"` (preview) | 4 | preview runs `next start` on a standalone build | harmless for a preview; production uses the standalone server |
| `[AUDIENCE] Gemini topics failed: 403 … Gemini API has not been used in project …` (preview) | 2 | the preview's Gemini key belongs to a GCP project with the Generative Language API disabled | config: enable the API on that project or use the production key; AI features fall back meanwhile |
| `Element type is invalid … got: object` on `GET /?callbackUrl=/dashboard…` (dev) | 42 | dev server only: SSR of the static home page with some `callbackUrl` values (e.g. /dashboard, /leaderboard; not /dash, /admin) | not reproducible on the preview build (200, banner renders); Turbopack dev artifact. Marketing boundary now shows Reload/Go home if it ever happens |
| `Module … ShareConversionBar.tsx [app-ssr] was instantiated … deleted in an HMR update` (dev) | 1 | HMR race while the sweep branch was merged | harmless (dev only) |
| `Server is approaching the used memory threshold, restarting` (dev) | 11 | full crawls compile every route (child reaches ~4.5 GB) | dev only; check scripts wait and retry |
| `middleware file convention is deprecated` / `inferred your workspace root` | 15 | Next 16 rename / lockfile in /root | harmless (README) |
| MCP `{"evt":"mcp_tool",…"status":"error:rate_limited|site_not_in_grant|…"}` | ~25 | structured logs of the MCP tests' expected refusals | harmless |

## Open
(see the end of this file after the final sweep)
