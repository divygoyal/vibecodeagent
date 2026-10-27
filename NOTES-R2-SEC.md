# R2-SEC: OAuth tokens out of the browser session + full account deletion

Branch tc/r2-sec (from tc/integrate). Dev instance name r2sec, ports 3116/8116.

## Done (commit "WIP r2-sec: tokens out of the browser session")
- lib/authSession.ts (pure): sessionCallback, publicSessionUser (id, name, email, image, provider,
  hasGoogle, hasGithub, workspaceSetupCompleted; nothing else), serverAuthUser (adds tokens, account ids,
  githubLogin, username; server-only). lib/auth.ts uses `session: sessionCallback`.
- lib/serverAuth.ts (server-only): getAuthJwt(req?), getServerAuthUser(req?), getServerAuthSession(req?),
  getGoogleCredentialsForRequest(req, userId) (JWT only when its id == userId, then admin DB; no req = DB only),
  getGoogleAccessTokenForRequest(req, userId) (adds getValidAccessToken).
- adminUserSync AdminSyncSession = { user: ServerAuthUser } (public session no longer type-checks there).
- Call sites switched: register-provider, setup-bot, share (GET now takes req), provision POST, github,
  github/repos, ai-chat, leaderboard/join (POST+PUT, now also DB fallback), leaderboard/session.ts
  (-> all /api/leaderboard/me/* routes), mcp/session.ts (+dashboardApi, ai-connections/keys,
  oauth/authorize/decision casts removed), portfolio/auth.ts (googleAccessFor -> helper,
  sessionUserRegistrar), site/_lib/context.ts, analyticsOverviewServer.ts, analytics (route, realtime,
  journeys, retention), alerts, insights, report/user-generate, seo (route, cannibalization,
  keyword-detail, mobile-gap, opportunities, page-detail, winners-losers). Client: useDashboardData
  uses hasGoogle/hasGithub.
- middleware.ts left as is (edge, reads JWT server-side only; no session exposure).
- Checked: admin GET /api/users/{id}, /api/users list, profile serializers return no tokens; consent page
  passes only name/email; no 'use client' module imports lib/auth/serverAuth.
- tests/authSession.test.mjs (8 tests): session callback output has no *Token key/value, exact key set,
  stale fields dropped, primary identity, server view keeps tokens, auth.ts wiring, client import graph
  never names googleRefreshToken/googleAccessToken/githubAccessToken (verified it fails on a regression).
- tsc exit 0; npm test 69/69; eslint on changed files: no new errors (counts equal or lower per file).

## Done (part 2, commit "fix(admin): delete-user removes every row of the user")
- admin/user_delete.py delete_user_rows(db, user_id): USER_TABLES (user_id), PUBLISHER_TABLES
  (publisher_user_id), ENTRY_TABLES (children of the user's leaderboard entries), THREAD_TABLES (children of the
  user's chat threads), custom_dashboard_versions (dashboard_id). Skips tables missing on older SQLite DBs.
  main.py DELETE /api/users/{id} calls it (replaces the separate MCP/portfolio/site-action/OAuth deletes).
- Not deleted (no user link): contact_queries (by email, from the public contact form), mcp_oauth_clients.
- admin/tests/test_user_delete.py: introspects every SQLite table with user_id / publisher_user_id / entry_id /
  thread_id / dashboard_id, inserts a row for two users, deletes one via the API, asserts none of theirs is left
  and the other user's rows remain; also fails if a table with user_id is missing from USER_TABLES.
  Verified it fails against the old main.py (leaderboard_entries, chat_threads, ... left behind).
- Admin suite (leaderboard_core, leaderboard_v3_api, plugin_security, user_delete): Ran 42 tests OK.
  MCP unit tests 22/22. npm test 69/69. tsc exit 0.

## Dev-kit check
- 2026-10-27 10:06-10:11 UTC, r2sec 3116/8116 (demo user): /api/auth/session =
  {id,name,email,image:null,provider:"google",hasGoogle:true,hasGithub:false,workspaceSetupCompleted:true}, no token
  key or demo-access/demo-refresh value. login.mjs seeding (dashboards, share, embed, leaderboard entry) OK.
  200 with data: /api/portfolio (first_sync -> ready), /api/connections, /api/leaderboard/me, /api/leaderboard/me/sites,
  /api/ai-connections, /api/site/gsc, /api/analytics, /api/seo, /api/insights; register-provider {"registered":true,"synced":true}.
- Crawl (desktop): 16 routes, 0 uncaught / console errors / failed requests (portfolio, site traffic tabs,
  pages, audit, Ask, Connect AI, dashboards + a dashboard). It stopped early because the box had little free RAM
  (other dev servers running), not because of a page error. Server down, web/.next removed.

## Not done / follow-ups
- middleware.ts still reads googleAccessToken off the JWT (edge, server-only; fine).
- MCP consent page and the leaderboard join POST were not driven end to end on the dev kit. They are covered by
  type checks and the shared helper, and the seeded leaderboard entry went through POST /api/leaderboard/me.
- The "## Next" list above is finished.
