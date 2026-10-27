# B3: Connect another Google account

Branch `tc/b3-accounts` (from `tc/integrate` 642e078). Owner-approved. Read-only, like Looker Studio /
Databox / Supermetrics: extra Google accounts are **data connections only**; who is signed in never changes.

## Owner action before release (required)

Add these to the Google OAuth client's **Authorized redirect URIs** (Google Cloud console > APIs & Services >
Credentials > the TrafficClaw web client):

- `https://trafficclaw.com/api/google/link/callback`
- `https://preview.trafficclaw.com/api/google/link/callback`

The URI is `NEXTAUTH_URL`'s origin + `/api/google/link/callback`. `GOOGLE_LINK_REDIRECT_URI` overrides the whole
URI if a proxy ever needs another path. No new scopes and no new client: same client id/secret, same consent
screen, so no extra Google verification.

## Design

- **Storage (admin, migration 024, additive).** `oauth_connections` gains `account_role` (NULL/primary or
  `linked`), `account_email`, `account_name`, `status` (`connected` / `needs_reconnect`). Linked rows are keyed by
  the Google `sub`. The existing row is the primary. Every older query is now primary-only
  (`google_accounts.primary_only()`): identity lookups (`get_user_by_identifier`, POST /api/users), `/oauth/google`,
  bot-container payloads, embeds, leaderboard. So signing in with a linked Google account never opens the owner's
  workspace (it gets its own user). `portfolio_assets` gains `connection_id` (NULL = primary) and `disconnected`.
- **Admin endpoints** (`admin/google_accounts.py`, X-API-Key): `GET /api/users/{id}/google/connections` (no tokens;
  counts + last sync from the store), `GET .../google/linked` (tokens, server-to-server only), `PUT/PATCH/DELETE
  .../google/linked/{sub}`. PUT refuses the primary (`409 same_as_primary`) and more than 10 (`409 limit`); never
  replaces a token with an empty one. DELETE removes the row and hides that account's portfolio rows (kept; a later
  sync that lists them again clears the flag). Account deletion already removes every `oauth_connections` row.
- **Link flow** (`lib/googleLink.ts`, `/api/google/link/start`, `/api/google/link/callback`): own authorization-code
  flow, not NextAuth. Same client and read-only scopes (`openid email profile` + `analytics.readonly` +
  `webmasters.readonly`; profile gives the display name), `access_type=offline`, `prompt=select_account consent`,
  `state` + PKCE S256, flow state in an encrypted (NextAuth JWE, own salt) HttpOnly SameSite=Lax cookie on
  `/api/google/link`, 10 min, deleted at the callback. The callback requires the same signed-in user, checks the
  id_token's iss/aud/exp (back-channel TLS response, OIDC 3.1.3.7), requires both data scopes, refuses the sign-in
  account (`?link=same`), updates an account linked before (`updated`), then starts a portfolio sync. Results come
  back as `?link=added|updated|same|cancelled|scopes|limit|expired|signed_out|failed` (toasts in Settings).
  Reconnect of an extra account: `/api/google/link/start?reconnect=<sub>` (login_hint = its email).
- **Union + routing** (`lib/sites/unionInventory.ts` pure, `lib/googleAccounts.ts` server-only): inventories of all
  connections merged, each asset tagged with `connectionId` (`primary` or the sub), duplicates credited to the
  primary, then the account linked first. `serverAuth.getGoogleCredentialsForAsset / getGoogleAccessTokenForAsset /
  getUserGoogleInventory`; background jobs use `storedCredentialsForAsset`. Users with no linked account take the
  old path (one cached admin lookup, no inventory call). Linked list cached 30 s; a refresh token Google rejects
  (`invalid_grant`, now tagged by `getValidAccessToken`) marks that account `needs_reconnect`; it is not called
  again until reconnected. Tokens stay server-only (`tests/authSession.test.mjs` passes).
- **Routed consumers:** portfolio sync (per-asset tokens, per-connection auth failures, a failing linked account's
  rows carried over rather than marked missing, message names the account to reconnect; range users), site context
  + `/api/site/*` (Actions gets a GA4 and a GSC token), `/api/analytics*`, `/api/seo*` (lists are the union),
  insights, alerts, overview, user report, MCP (`GoogleClient` routes per property/site; catalog and session sites
  are the union), dashboards engine (`getTokenFor`) and directory, leaderboard verify/refresh/join/me/sites and the
  scheduled refresh, AI chat (lists + tools + enriched snapshot), shares, weekly digest, report email, audit, site
  directory (live and store).
- **Not routed (primary only, by design or left for later):** embed realtime and leaderboard "live now" (the admin
  hands out the primary row's token), superadmin report generate, aitraffic bridge resources. A site in a linked
  account used there gets Google's 403 (no wrong data).
- **Disconnect** (`DELETE /api/google/connections/<sub>`, same-origin): deletes the tokens, hides its sites, drops the
  user's cached lists/site contexts/report data. The token is **not revoked at Google**: one grant per Google
  account + app, so revoking could cut a TrafficClaw user who signs in with that Google account. The dialog points
  to Google account permissions for full removal.
- **Primary revoked:** unchanged behaviour (page-wide "Reconnect Google"); the portfolio sync stops for all accounts
  until the sign-in account is reconnected.
- **Settings -> Google** (`GoogleTab.tsx`): accounts list (letter avatar, email, Sign-in account / Main account,
  Connected / Needs reconnect, GA4 and GSC counts after dedupe, last synced), Reconnect (primary: consent sign-in as
  before; extra: link flow), Disconnect with confirm, "Add another Google account".

## Demo / dev kit

- Demo accounts `multi` (Acme, DataViz) and `multi2` (Puzzle Hub, Health Insights, Creative Prints, Recipe Nest;
  Acme's GSC site in both). The demo shim answers the code exchange (`demo-code:<account>`, unsigned id_token,
  accepted only when `demoDataAllowed()`); `/api/google/link/start` skips Google in demo mode
  (`?demo_account=<key>`, `cancel` simulates a denial).
- `login.mjs --user multi` (multi2 linked), `check-multi-account.mjs <port>` (30 checks + screenshots),
  worker1 phase `multi`, `multi` in the scenario users, `worker1.sh up <name> N --first K` (run beside another
  worktree).

## Tests

- `admin/tests/test_google_accounts.py` (6): add/list/tokens only on the linked endpoint, a linked sub never
  resolves the owner and signs in as its own user, bot payload one Google, same-as-primary, keep stored token,
  status, disconnect hides + keeps rows + comes back, limit, account deletion.
- `web/tests/googleAccounts.test.mjs` (8): union + dedupe, no-linked fast path, per-asset routing (demo Google 403s a
  wrong token), revoked extra account, disconnect, sync with per-asset tokens, sync with a revoked extra account,
  link-flow PKCE/state/authorize URL/id_token.
- Old-schema upgrade checked in-process (642e078 admin creates the DB, this branch migrates it, twice).
