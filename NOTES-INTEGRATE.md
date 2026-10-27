# Integration notes (tc/integrate, worktree tc-integrate, dev instance `integrate` 3101/8101)

work/live + tc/foundation, mcp, portfolio, leaderboard, builder, marketing (first merges, before this file),
then tc/sitepages (aac6aa8) and tc/apppages (41f825b). Specs: /root/projects/tc-redesign-research/.
The worktree is shared with a robustness agent: commit with `git commit -- <paths>` only.

## Done (commit, what)
- 84e175b One pairing store: `portfolio_assets.pairing_override` (GA4 rows). `web/src/lib/sites/pairingStore.ts`
  (loadPairingOverrides / setPairingOverride / invalidate) is read by the portfolio sync, the MCP site resolver and the
  Connect AI site list, and written by the portfolio pairing dialog. `mcp_site_links` removed (no writer ever existed,
  never deployed): table dropped from 019, admin endpoints + delete-cascade line removed, `adminStore.getSiteLinks` gone.
- 18fa18f Root metadata/JSON-LD for "All your sites. One screen. Free."; theme-color light #ffffff + dark #0b0c0f
  (media variants); manifest colours. Old dark og-image.png fallback dropped (marketing pages have their own OG).
- 70c782a TC_ALLOWED_EMAILS allowlist (signIn callback, case-insensitive, Google email must be verified; unset = everyone)
  -> /preview-private ("This preview is private", noindex). lib/accessAllowlist.ts + tests/accessAllowlist.test.mjs.
- d7bc20f TC_NOINDEX=1: robots Disallow /, empty sitemap (both read per request), X-Robots-Tag noindex,nofollow via
  next.config headers (build time).
- aac6aa8 merge tc/sitepages: site_action_states created at admin startup and deleted with the user; removed unused
  components/seo, components/analytics/subpages, components/audit.
- eba0802 GA4-only sites: "Search Console · not connected"; crawl.mjs `--host` fills /dashboard/s/[host].
- fdebc54 Light public shell: TEMP dark strip gone from (marketing)/leaderboard/layout.tsx, /ai top padding, light
  marketing error boundary, new site-wide light 404 (app/not-found.tsx). Redirects (next.config):
  /features -> /#product, /demo/telegram* -> /demo, /dashboard/settings?tab=leaderboard -> /dashboard/leaderboard
  (`has` query); /dashboard/ai-chat -> /dashboard/ask was already there (foundation). /features stub page deleted.
- 41f825b merge tc/apppages: nav.ts keeps both branches' LEGACY_ROUTE_PREFIXES removals (only /dashboard/weekly left);
  deleted settings/{LeaderboardOptIn,AdSlotsEditor,AdSlotRequestsInbox}.tsx, components/AIChatbot.tsx and the 9
  components/chat files only it used.
- 154a91d First portfolio sync right after sign-in: on a 404 "User not found" from the store it registers the user
  (ensureAdminUserSynced, session captured in the request) and retries once.
- a265184 No more container polling: useConnections() -> /api/connections -> admin GET /api/users/{id}/connections
  (no Docker lookup); /api/container removed; docker_manager.get_container_status returns status "disabled" in stub mode.
- 245b9bd + e9b7746 Light one-time welcome modal (5 free Ask messages, "Got it"); Google banner only when Google is not
  connected at all (not on setup or the portfolio home). Select/DropdownMenu/Popover content z-75 (was 50, under the
  Drawer 60 / Modal 70 overlays: taps in sheets hit the overlay); Modal/Drawer/nav drawer hide the Tawk bubble while open.
  Verified with Playwright touch emulation (create sheet Site select, share Expiry, pairing dialog).
- 689acf0 44px workarounds removed (globals.css scoped revert, connect-ai/touchFix.ts); legacy.css already skips
  .tc-root/.tc-ui. Segmented controls stay 30px at 390px with touch.
- Favicons: foundation's neutral approach is what is merged (/api/favicon 204 when no icon, grey letter tile in
  <Favicon>; marketing SiteIcon letter tile for .example). No console errors in the crawls.
- eb9b7ca Marketing hero + /demo use buildDemoPortfolio() (the app's builder): 11 sites (was 18), normalized host titles,
  http/www as VariantChip, sample dashboards use the portfolio windows and the card totals; /demo/[slug] = demo account sites.
- f98e885 Leaderboard "New" badge: < 14 days and none at all when more than a third of the board qualifies (fresh seeds).
- b89c838 Superadmin Leaderboard tab: "Offers and inquiries" panel (existing /api/lb/superadmin/inquiries).
- feb240a /api/ad-slots/requests: honeypot `website`, 5/IP/hour, 20/slot/day, <= 2 links.
- Dev only: web/.env.development.local (gitignored) copied from tc-mcp (TC_MCP_ENABLED=1, loopback CIMD) so /mcp,
  /oauth and Connect AI run on 3101. MCP flow test against 3101: 28/28.

## Later commits
- 085bcaa merge tc/sweep (old dark UI swept; superadmin offers panel kept). d9f81c8 LegacyFrame/isLegacyRoute/.legacy
  removed. 0a08ba0 styles/legacy.css pruned 1637 -> 216 lines (dead classes, all [data-legacy-theme] rules, orphan
  keyframes; library + element rules kept). 96fb53d share overview favicons via /api/favicon.
- d978878 scripts/dev/check_migrations.py (below). afaf129 no new lint errors in changed files.
- Checked by hand on 3101: /share/<token> (+/events), /view, /embed/demo, /embed/d, /embed/leaderboard all 200 with
  0 problems desktop+mobile; Cmd/Ctrl+K palette (search, Enter navigates, Esc closes); /dashboard/weekly(/*) 308 ->
  /dashboard/settings?tab=notifications; leaderboard privacy audit 21,356 assertions OK; builder public API 9/9;
  MCP flow 28/28.

## Production env vars (merged from the NOTES files; matches research/DEPLOY.md)
- Add (web): `TC_MCP_ENABLED=1` (MCP server, OAuth, Connect AI), `TC_MCP_ISSUER=https://trafficclaw.com`.
- Must already exist, leave unchanged: `NEXTAUTH_URL` (absolute URLs: badges, widget/share snippets,
  /preview-private redirect), `NEXTAUTH_SECRET`, `CRON_SECRET`, `ADMIN_API_URL`, `ADMIN_API_KEY`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Do NOT add or change `OAUTH_TOKEN_ENC_KEY`** (web or admin), and do not rotate `ADMIN_API_KEY`: production
  encrypts the stored Google tokens with a key derived from ADMIN_API_KEY (admin/security/token_crypto.py
  `load_fernet()`), so a new key makes every stored token unreadable. Checked: the new admin code adds no
  encrypted columns of its own. MCP stores only SHA-256 hashes of its access/refresh tokens, API keys and
  auth codes (mcp_api.py), and the leaderboard live lookup reads Google tokens through the existing
  `OAuthConnection` model (EncryptedToken -> load_fernet()). The dev kit sets OAUTH_TOKEN_ENC_KEY only
  because its throwaway admin has no production key to match.
- New daily cron (`Authorization: Bearer $CRON_SECRET`): GET /api/cron/portfolio-sync. The leaderboard refresh
  (/api/cron/leaderboard-refresh) keeps its existing schedule.
- Optional: `TC_MCP_TXN_SECRET` (defaults to NEXTAUTH_SECRET), `TC_MCP_DEMO=0` (turn off anonymous demo grants),
  `TC_MCP_ACCESS_TTL`, `TC_MCP_DCR_LIMIT`.
- Preview only (never production): `TC_ALLOWED_EMAILS=...`, `TC_NOINDEX=1` (set at build time AND runtime).
- Never in production: `TC_DEMO_DATA`, `TC_DEMO_FAULTS`, `TC_MCP_DEV_CIMD_LOOPBACK`, `TC_ALLOWED_EMAILS`, `TC_NOINDEX`.
- Owner/ops (from MCP notes): Google consent wording, Cloudflare WAF skip for /mcp, /oauth, /.well-known; MCP directory
  submissions.

## Final checks (2026-10-26, HEAD after 4438622)
- `npx tsc --noEmit`: exit 0, no errors.
- `npm run lint`: `✖ 5809 problems (546 errors, 5263 warnings)` repo-wide, all in old code. Files changed since
  work/live (501): no new errors. The only files with errors are googleApi.ts (64), api/ai-chat/route.ts (51),
  useDashboardData.ts (2) and api/auth/callback/github-app/route.ts (1), with the same counts as on work/live.
- `npm test`: `# tests 48 # pass 48 # fail 0`.
- Admin: `python -m unittest admin.tests.test_leaderboard_core admin.tests.test_leaderboard_v3_api
  admin.tests.test_plugin_security` -> `Ran 41 tests ... OK`.
- MCP unit `tests/mcp/unit.test.ts` 22/22; MCP flow on 3101 28/28; builder `tests/builder/query.test.ts` 11/11,
  `tests/builder/public-api.mjs 3101 integrate` 9/9; leaderboard privacy audit OK (21,356 assertions);
  migration upgrade check 37/37.

## QA pass (research/QA-REPORT.md has a Status column per item)
- d3ea4b5 QA-08 setup pairing: the site directory pairs from the portfolio store (GET /api/portfolio/pairs);
  the saved workspace selection no longer forces a pair. tests/sitePairing.test.mjs: portfolio cards, MCP
  list_sites and the directory agree on the demo account; card slugs = directory route keys.
- 9151df7 QA-02 GA4-only cards link to /dashboard/s/ga4-<id>; same-host order matches the portfolio.
- e69ab8a QA-03 view grid = editor grid (12 cols from 900px, v1 md/sm derived), v1 scorecards get sparklines.
- b29ef82 QA-04 board rows use container queries (preview column stacks).
- QA-05 Done/Undo verified after the admin restart.
- P2s: f266a22 + 2988e7a titles, fa09a46 live count, d2db97f "Site · host", 8a9b4e2 editor, bf164b8 focus return +
  embed gating/preview, dd81510 star label/badges/Export CSV, 6cb49b9 pinned sidebar account block + one skip
  link, a9ccd61 /dashboard/site, d6c85af Actions "Show more", 1775eef collapsed preview on phones, 5f4ec28 nav +
  nowrap ranges, de8cbf2 Connect AI URL once, 77ebc56 superadmin wording.
- Still open: QA-22 (product call), QA-17 (robustness agent). QA-01 and QA-18: see "QA-01 and QA-18" below.
- Also: 4438622 /admin shows "Admins only" to non-admins; e9b7746 Select/menus in sheets (z-75) + Tawk hidden
  under sheets; 245b9bd light welcome + Google banner; 154a91d first sync registers the user; a265184 no
  container polling (/api/connections).

## Dev servers
The coordinator restarted the integrate admin and web (current code) after the merges; web/.next was cleared
after a Turbopack panic. Admin changes are also covered by the migration-upgrade script (own throwaway admins).

## Crawl (final, 2026-10-26 on HEAD 2c5ae57, scripts/dev/crawl.mjs 3101, 3 parts + admin)
- demo: 65 routes x desktop+mobile, every route 200, no 500s. Problems left: /admin as demo = one expected 403
  ("Admins only" page); /view and /embed/d with the seed's old public token = 404 (the builder public-API test
  rotated it; seed.json now has the new token, both 200); /share/<token> desktop hit a dev-server memory restart
  mid-load (ChunkLoadError / connection reset; clean on re-run and on mobile).
- admin: /admin and /superadmin 0 problems.
- /dashboard/s/** checked for a GA4+GSC site, a GSC-only site and a GA4-only site (ga4-<id>): all 200, 0 problems.
- Known dev-only issues: next dev restarts itself under memory pressure during full crawls (19 times this
  session), which shows up as connection resets. (QA-01 and QA-18 are resolved, see below.)

## QA-01 and QA-18 (2026-10-27)
- QA-01, aba2bbe, our bug: `Button`'s renderIcon treated anything that is not a valid element as a component.
  `trailingIcon={<ArrowRight />}` from a Server Component can arrive as an RSC lazy node (`"$L<id>"` when that
  row is not ready yet, `"$<id>"` when it is), so `<Icon />` made React resolve the lazy as an element type and
  get the `<svg>` element ("Lazy element type must resolve to a class or function", 500). RSC timing, which the
  query length shifts, decides `$L` vs `$`; production prerenders `/`, but any dynamic page could hit it. Found by
  hooking react-dom's lazy error in Playwright (pendingProps = renderIcon's `{aria-hidden,size:18,strokeWidth}`).
  Fix: components/ui/iconProp.ts `isIconComponent` (function/forwardRef/memo only), tests/iconProp.test.mjs.
  Check: `/?callbackUrl=` + /dashboard, /dashboard/analytics, /ask, /dashboards, /s/nope, /leaderboard all 200;
  `/?foo=/x...` lengths 1-60 all 200; no console errors in the browser.
- QA-18, not a code bug: a dev race. Reproduced the exact warning on demand (EmptyState className diff) by
  holding the page's JS chunks, editing a component, letting another request rebuild, then releasing: the HTML
  came from the old file and the same chunk URLs served the new one. QA hit it at 20:05-20:07 during the
  tc/sweep merge, the robustness crawl at 20:16 right after the legacy-shell removal. On stable code: 0 warnings
  in 120+ fresh 390px loads of traffic?tab=realtime, ?tab=journeys and /pages (light, dark, 6x CPU, random
  chunk/API delays). Crawl while nobody edits the worktree, or re-load once after edits.
- Found on the way, ccf193f: the server render and first client render of every /dashboard/s/<host> page showed
  "We couldn't find <host>" until the session loaded (no session on the server => no Google => empty directory
  "loaded"), and cleared the tc_site cookie in that window. siteDirectoryLoading now stays true until the session
  and /api/connections say whether Google is connected; unknown hosts and GitHub-only users still get the
  not-found state after load.

## Migration upgrade check (019-023)
`/root/.trafficclaw-dev/venv/bin/python scripts/dev/check_migrations.py` (own throwaway admins on 8130/8131, temp dir,
Docker stub mode). Builds an old-schema DB with admin/ from live commit 1b62be9 (user, 2 v1 dashboards with a public
share, a verified + a pending leaderboard entry via the old API), upgrades a COPY in place with this worktree's admin,
starts it a second time, then deletes a second user. Result 2026-10-26: **37/37 passed** -
additive (every old table/column kept, row counts unchanged), all 019-023 tables + the 022 columns created,
mcp_site_links not created, user/dashboards/public share link/leaderboard entries survive (verified entry ranked by
grace, pending entry a numberless shell, owner sees both), /connections works, container status no error in stub mode,
second start: no traceback, identical schema and counts; delete-user removes portfolio_assets, site_action_states and
mcp_tokens rows and leaves the other user alone.

## Open / for the coordinator
- Dead legacy components nothing imports (left for a cleanup pass): components/{AnnotationBadge,AnnotationModal,
  ChartAnnotations,ConfirmDialog,DemoModeBanner,DomainOverview,FixWithBotButton,FloatingAuditBanner,IntentBadge,
  KeywordDetailDrawer,OverviewDetailDrawer,OverviewInsights,PageDetailDrawer,ShareDashboardModal,SparklineCell,
  TableActionMenu,Toast,WorldMap}.tsx, components/analytics/* (except AnalyticsIcons, AnimatedCounter, DataRow,
  WorldMap), components/dashboard/*, components/domain-overview/*, components/workspace/*.

## Google sign-in: consent only when needed (2026-10-27, owner-approved)
Problem: the Google provider asked `access_type=offline&prompt=consent` on every sign-in, so Google issued a new
refresh token each time and silently revoked the oldest past ~100 per account + client (preview and live share one
client). Now (web/src/lib/googleConsent.ts, wired in lib/auth.ts):

| Sign-in | Google returns | Stored token (admin DB, by Google sub) | Result |
|---|---|---|---|
| Default button (`prompt=select_account`, offline) | refresh token (Google showed consent: first grant, grant revoked, new scopes) | any | store the new one |
| Default button | none | works (one refresh call to Google says OK) | keep the stored one (copied into the JWT) |
| Default button | none | none stored | redirect once to `/connect-google?auto=1` -> consent sign-in (first-time connect) |
| Default button | none | Google says `invalid_grant` (revoked/evicted) | same redirect (reason `revoked`) |
| Default button | none, grant lacks GA/GSC scope | any | same redirect (reason `scope_upgrade`) |
| Default button | none | admin or Google unreachable | keep (server code reads the DB per request) |
| Any of the redirects again within 10 min (cookie `tc_g_consent` set by /connect-google) | none | none/revoked | sign in anyway; the access token works ~1 h, then the existing Reconnect state (google_reauth) |
| Reconnect / Connect Google buttons (`prompt: 'select_account consent'`, unchanged) | refresh token | any | store the new one |

An empty refresh token never overwrites a stored one: jwt() (`nonEmptyToken`), adminUserSync (omits
`refresh_token`), admin `POST /api/users` (already), `POST /api/users/{id}/sync` and `PATCH /api/users/{id}` (now
`has_non_empty_token`). serverAuth.getGoogleCredentialsForRequest fills a missing JWT refresh token from the DB.
Tokens stay server-only (tests/authSession.test.mjs passes). Tests: tests/googleConsent.test.mjs (decision table,
demo token endpoint incl. frevoked's invalid_grant), admin/tests/test_oauth_token_keep.py.

Noticed, not changed: NextAuth v4 calls jwt() with a fresh token on every OAuth sign-in, so the "secondary connect
keeps the primary identity" branch in jwt() never sees an earlier primaryProvider. Connect-GitHub-after-Google makes
GitHub the session identity; Google tokens are then read from the DB.

### How to test with real Google on the preview (later; worker1 has no real OAuth)
Do it after the owner's review, on a preview deploy of this commit. Use a test Google account that has GA4/GSC.
Check the web log for `[Auth] Google sign-in needs consent (...)` lines and the superadmin user page
("Refresh token" pill) after each step.
1. Returning user: sign out, "Continue with Google". Expect only the account chooser, no consent screen, and a
   dashboard with data. At https://myaccount.google.com/connections the app's grant stays; no new refresh token is
   issued (data still loads after 1 h+, because the stored token is kept).
2. First connect: remove the app at myaccount.google.com/connections (this revokes the grant), sign in. Google shows
   consent by itself (grant gone) and returns a refresh token: no redirect, data loads.
3. Stored token missing: in the preview admin DB clear `oauth_connections.refresh_token` for that user (or delete the
   google row), sign out, sign in. Expect a short "Taking you to Google" page, then the consent screen, then the
   dashboard; the DB has a refresh token again.
4. Scope upgrade: on a consent screen untick Search Console (the token is stored as granted). The next default
   sign-in redirects once to consent; untick again and sign-in completes without a loop; Search Console calls then
   fail as no-access (403), not as a dead end.
5. Reconnect button (Settings > Google): always shows consent; afterwards the DB token is the new one.
6. Count check: repeat step 1 ten times; myaccount.google.com/connections should still list one grant and the token
   from step 2/3 keeps working (before this change each sign-in minted a new one).
