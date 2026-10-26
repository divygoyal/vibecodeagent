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

## Admin restart needed on 8101
The auto-mode classifier blocked restarting the shared integrate admin; the running admin on 8101 still has the
pre-integration Python (no /connections endpoint, old site_links code, schema hook). Web code tolerates it.
Admin changes are verified by the migration-upgrade script on its own throwaway admin instead (below).

## Crawl
(see "Crawl results" below)

## Migration upgrade check
(see below)

## Open / for the coordinator
- Dead legacy components nothing imports (left for a cleanup pass): components/{AnnotationBadge,AnnotationModal,
  ChartAnnotations,ConfirmDialog,DemoModeBanner,DomainOverview,FixWithBotButton,FloatingAuditBanner,IntentBadge,
  KeywordDetailDrawer,OverviewDetailDrawer,OverviewInsights,PageDetailDrawer,ShareDashboardModal,SparklineCell,
  TableActionMenu,Toast,WorldMap}.tsx, components/analytics/* (except AnalyticsIcons, AnimatedCounter, DataRow,
  WorldMap), components/dashboard/*, components/domain-overview/*, components/workspace/*.
