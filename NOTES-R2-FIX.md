# Round 2 / WS5: leaderboard and reliability fixes (tc/r2-fix, worktree tc-r2-fix, dev instance `r2fix` 3115/8115)

Plan: /root/projects/tc-redesign-research/round2/ROUND2.md (WS5), critique item 9.
Screenshots: /root/projects/tc-redesign-research/round2/candidate/fix/ (names follow round2/baseline/live_leaderboard-*.png).

## Commits (on tc/integrate 01a2a25)
| commit | what |
|---|---|
| 7c3bebc | daily in-process leaderboard refresh (scheduler + shared function + guard + off switch) |
| c49965b | honest freshness line, Trend / Open to columns dropped when empty, profile text |
| cf6ffee | demo `latency` fault |
| c302e30 | first portfolio sync never shows "HTTP 502" (retries, background POST, quiet client retry, flaky/502 faults) |
| f1376e8 | `/api/sites/directory` + site pages start without the live Google inventory |

## 1. Leaderboard refresh in production
Cause: nothing in production calls `/api/cron/leaderboard-refresh` (the board's newest `last_refreshed` was 65 days old,
so every row had no daily series: "No trend", and the freshness line said "updated 65 d ago" under "checked daily").

- `lib/leaderboard/refreshAll.ts`: the route's logic as `startLeaderboardRefresh({reason, minAgeMs})`. One run at a time per
  process (globalThis guard; a second caller gets `null`). Time budget 30 min, oldest numbers first, the rest soon after.
- `lib/leaderboard/refreshPlan.ts`: pure rules (which entries are due, when to look again). Tested.
- `lib/leaderboard/scheduledRefresh.ts` + `instrumentation.ts`: production only, off with `TC_LEADERBOARD_SCHEDULER=0`
  (also off in demo mode). First look 8-13 min after boot (the portfolio scheduler starts at 5), then once a day (24 h + up to
  30 min of jitter, jitter only adds). The scheduler passes `minAgeMs = 20 h`: an entry whose numbers are younger is left alone,
  so a deploy/restart, or an external cron that already ran, does not repeat the day's work. After a run that found everything
  fresh it wakes when the first entry becomes due (never sooner than 30 min).
- `GET /api/cron/leaderboard-refresh` (Bearer CRON_SECRET) calls the same function. Idempotent next to the scheduler: a run in
  progress answers `202 {running:true}` at once; `?minAgeHours=N` leaves entries refreshed less than N h ago; default is as
  before (every entry). Every step upserts, so overlapping callers only repeat work.
- admin `/api/leaderboard/refresh` now lists `last_refreshed` (additive; an older admin without it means "due"). Test 13 in
  `admin/tests/test_leaderboard_v3_api.py`.

Board display (`components/leaderboard`, `lib/leaderboard/{format,columns}.ts`):
- Freshness (`freshness()`): under 36 h "Updated 3 h ago" (the only level where the header says "checked daily"), up to 8 days an
  absolute date "Updated Oct 25", older "Last updated Aug 23" and the header badge drops "daily" (critique: never "daily" next to a
  65-day stamp). Same helper on the profile ("numbers updated 4 min ago").
- Trend column only if some row has two real points; Open to column only if some row has an offer or priced ad slots; the Offers
  tab always keeps it and has its own empty state ("No site is open to offers yet"). A row without data shows one dash, not
  "No trend". The grid has four shapes (container-query classes, so the owner's one-row preview works too).
- Profile: "Listed for N days" removed (About has "Listed since"), no "new" chip when there is no previous period.

Evidence (dev kit, demo Google):
- legacy-like state (daily series deleted, offers off, `last_refreshed` 65 days ago): `fix-leaderboard-stale-1440.png` /
  `-390.png`: header "Verified owners", "Last updated Aug 23", no Trend or Open to column, no empty cells.
- cron route by hand: 15 entries, `successCount 15`, 1.1 s; concurrent second call `202 running`; `?minAgeHours=6` right after:
  `skippedFresh 15, attempted 0, nextDueMs 21587448`. Unauthenticated: 401.
- after the refresh, before any owner opts in to offers: `fix-leaderboard-refreshed-no-offers-1440.png` / `-390.png`
  (sparklines, no Open to column).
- full board: `live_leaderboard-1440.png`, `live_leaderboard-390.png`, profile `live_leaderboard-profile-1440.png` / `-390.png`,
  offers tab `fix-leaderboard-offers-1440.png`.

## 2. First portfolio sync must never show "HTTP 502"
Reproduced with the new fault `flaky` (user `fflaky`): Google's front end answers an HTML 502 on the first tries; the whole
first sync ended as `error` on all 18 assets with the tooltip "HTTP 502" (`last_error` stored raw).

- `lib/portfolio/sync.ts`: a transient failure (5xx, dropped connection, timeout; not 429/403/401) is retried silently, 3 more
  times per request (0.7/2/5 s); assets that still failed stay `syncing` for two more rounds (5 s and 15 s later, one retry per
  request); only a failure that survives that is stored, with a plain message ("Google had a temporary problem. Will retry
  shortly." / "Google did not answer in time. ..."). A backfill continues where it stopped.
- `lib/sites/fetchInventory.ts`: the account/site listing retries too, and says "Google had a temporary problem" instead of "HTTP 502".
- `lib/portfolio/adminStore.ts`: a 5xx ("database is locked" while a first sync writes) or a dropped connection is retried twice;
  timeouts only for reads.
- `POST /api/portfolio/sync` answers 202 `{started, syncing:true}` at once; the token is fetched inside the sync, which is
  registered as running first (`SyncOptions.accessToken` may be a function). `wait:true` keeps the old synchronous behaviour.
  GET `/api/portfolio` loads the token and the snapshot in parallel.
- `PortfolioPage`: a failed load (proxy 502 page, offline) retries after 1/2/4/8 s and shows an error only after 3 failures in a
  row, with a plain message ("TrafficClaw is busy for a moment. Try again shortly."); until then it keeps what it has / the skeleton.

Evidence (r2fix):
| scenario | before | after |
|---|---|---|
| `fflaky` first sync | `state=ready`, 18 of 18 assets `error`, tooltip "HTTP 502", sync over in 0.4 s | 18 of 18 `synced`, never an error, `syncing` for 20 s (ga4=40, gsc=50 Google calls incl. retries) |
| `fflakyall` (lists flaky too) | (first_sync fails at Google) | sites appear after 7 s, 11 of 11 synced in 37 s |
| `f502` (permanent) | error in 0.4 s, "HTTP 502" | `syncing` for 84 s, then 11 `error` with "Google had a temporary problem. Will retry shortly."; retried on the usual back-off |
| browser, `/api/portfolio` answers 502 twice | "HTTP 502" banner | no error on screen, third try works |
| browser, `/api/portfolio` always 502 | "HTTP 502" | error only after the 3rd failure (7.6 s), "TrafficClaw is busy for a moment" (`fix-portfolio-repeated-failure-1440.png`) |

Tests: `tests/portfolioFirstSync.test.mjs` (fake Google + admin at fetch level: 502s cleared by retries, extra rounds keep the
asset syncing, permanent failure text, 429/403 not retried, listing retry, lazy token, store retries).
Poll helper used: scratchpad ws5/poll.mjs (GET /api/portfolio every second, prints state changes).

## 3. Slow first load of site pages
Cause: `/dashboard/s/<host>` rendered a skeleton until the whole live inventory was in: `/api/connections`, then the Search
Console list and the GA4 list (both `useRegisteredSWR`, so gated), and the pairing, then the page could mount and start its data
requests. The data routes themselves (`/api/site/gsc|ga4`) need only the site and the property.

- new `GET /api/sites/directory` (`lib/sites/directoryServer.ts`): the two Google lists in parallel, through the same
  per-user caches as `/api/seo?mode=list` and `/api/analytics?mode=list` (5 min, in-flight calls shared), plus the stored pairing
  read fresh. Failures: plain message + code per list, remembered for 10 s only; `?refresh=1` skips the cache.
- `?source=store`: the same shape from the portfolio store alone (one local call). WorkspaceProvider fires both as soon as the
  session is authenticated, builds the directory from the fast one until the live answer arrives (same builder, same route keys),
  and keeps it when Google lists nothing.
- `SiteRouteGuard`: `(loading && !site) || ...`: renders as soon as the host is in the directory. A host nobody knows still waits
  for the live answer before "We couldn't find ..." is allowed.
- Not changed: `useRegisteredSWR` gating (1.5 s) for the old pages; `/api/seo` and `/api/analytics` validate the site against the
  (cached) list before the dashboard call, so their first call still pays the list once (the new endpoint warms that cache).
  A user whose portfolio store is empty (first ever visit) still waits for the live lists, as before.

Timings (Playwright, fresh browser, dev server so ~1.7-2.5 s of every number is dev hydration; Google faked with
`tc_demo_faults=list:latency:4000,gsc:latency:800,ga4:latency:800`; "data visible" = Search tiles show numbers;
script: scratchpad ws5/loadtime.mjs):
| run | before | after |
|---|---|---|
| S1 cold server cache (lists 4 s) | **8.11 s** (lists 2.8-6.9 s, data 7.1-8.1 s) | **4.16 s** (data starts at 3.1 s, the directory call is still pending) |
| S2 warm server cache | 3.17 s | 2.34 s |
| S3 no latency | 4.88 s | 2.21 s |
With real latencies the saving is the whole list time plus the sequential chain; the page no longer depends on how slow Google's
account listing is.

## How to re-check
- `cd web && npx tsc --noEmit && npm test` (97 tests) and `npm run check:rsc`.
- `scripts/dev/up.sh r2fix 3115 8115; node scripts/dev/login.mjs 3115 --user fflaky` then poll `/api/portfolio`.
- Leaderboard: `curl -H "Authorization: Bearer $(grep ^CRON_SECRET /root/.trafficclaw-dev/dev.env | cut -d= -f2)" localhost:3115/api/cron/leaderboard-refresh`.
- Dev kit additions: faults `502`, `flaky[:n]`, `latency[:ms]`; users `f502 fflaky fflakyall fslow` (README §7).

## Open / for the coordinator
- Production env: nothing to set. `TC_LEADERBOARD_SCHEDULER=0` turns the scheduler off. The first refresh runs 8-13 min after the
  next boot. Entries whose Google tokens are revoked keep failing every day (they keep their old `last_refreshed`; the board's
  "Updated" uses the newest one).
- The board's `updated_at` is the newest `last_refreshed` of any entry; per-row staleness is not shown.
- `useSiteList` / `usePropertyList` are no longer used by the shell (the Ask page still uses `usePropertyList`; same server cache).
- The old `/api/portfolio/pairs` route stays (nothing in the shell calls it any more).
