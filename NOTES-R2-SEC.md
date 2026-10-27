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

## Next
1. Account deletion cascade (admin): delete-user must remove custom_dashboards + v2 versions, chat
   threads/messages/embeddings, leaderboard entries/profiles/daily/range stats/inquiries/audience,
   digests, alerts, embed tokens, MCP rows, portfolio rows, site action states. Check admin/models.py +
   migrations (see tc-r2-home/NOTES-R2-HOME.md). Add admin test: user with rows in every table -> delete -> none left.
2. Admin tests (NOTES-INTEGRATE command) + new test; MCP unit test (npx -y tsx --test tests/mcp/unit.test.ts).
3. Dev kit r2sec 3116/8116: login, /api/auth/session has no tokens; portfolio, site pages, dashboards,
   Ask, leaderboard join, MCP in demo mode; crawl clean. Then down.sh + rm -rf web/.next.
4. Final commit(s) + report.
