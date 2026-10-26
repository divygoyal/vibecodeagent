# Foundation notes (tc/foundation, worktree tc-foundation, dev ports 3103/8103, instance `foundation`)

Specs: /root/projects/tc-redesign-research/{DESIGN,PRODUCT}.md. Screenshots go to
/root/projects/tc-redesign-research/shots/foundation/.

## Done
- 176a55f tokens.css, globals.css, styles/legacy.css, theme script (lib/themeScript.ts + lib/theme.ts),
  radix-ui 1.6.7 copied in (new dirs only, hard links untouched), lib/cn, lib/format (+tests),
  lib/metrics, lib/dateRange (+tests), `npm test` (node --test tests/*.test.mjs).
- 7ea0a0b components/ui/* and components/charts/* (barrels '@/components/ui', '@/components/charts'),
  /api/favicon, Toaster + TooltipProvider in app/providers.tsx.
- d898cb6 shell: components/shell/* (AppShell, Sidebar, SiteSwitcher, Topbar, PageHeader, DateRangeControl +
  useDateRange, UserMenu, MobileTabBar, LegacyFrame, WorkspaceProvider + workspaceContext, useCurrentSite,
  nav.ts), dashboard layout -> AppShell, /dashboard/s/[host]/{,traffic,search,pages,actions}, Portfolio stub,
  ai-chat -> ask, leaderboard + connect-ai placeholders, middleware gate + tc_site redirects, GitHub repo
  scope dropped, /dashboard/styleguide.
- 85bddd8 + 1571ecf clutter removal + next.config redirects + Telegram copy.

## Next
- Dev server (instance foundation 3103/8103; wait for a free slot: max 2 on the box), login, fix runtime
  issues, screenshots (styleguide + shell pages, 1280/390, light/dark) to research/shots/foundation/,
  crawl (in parts), full lint on touched files, rm -rf web/.next, down.sh foundation.

## Decisions (keep)
- Legacy CSS: move globals.css to styles/legacy.css, but (a) drop its `@import "tailwindcss"`,
  (b) neutralise every `[data-theme='light']` rule (rename to `[data-legacy-theme='light']`), because
  data-theme=light is now the new default and those `!important` rules would hit new components,
  (c) drop font vars from its `@theme inline`, (d) remove legacy `.skeleton` (new `skeleton` utility wins).
  Override legacy focus ring / scrollbar / body bg after the legacy import in globals.css
  (`body:has(.tc-root)` gets canvas). Keep body font-size unchanged for legacy pages; `.tc-root` sets 14px.
- Legacy pages inside the new shell are wrapped in `<LegacyFrame>` (`data-theme="dark"` + legacy black bg),
  driven by a route-prefix list `LEGACY_ROUTE_PREFIXES` in components/shell; owners delete their prefix
  when they migrate. `/dashboard/s/**` routes render their own PageHeader + LegacyFrame.
- Workspace context: extract from dashboard layout into components/shell/WorkspaceProvider.tsx;
  layout.tsx keeps re-exporting `useWorkspace` / `useRegistration` (14 call sites import from '../layout').
- Range: canonical presets 24h|7d|28d|3m|6m|12m|16m|this_month|last_month|custom (URL `?range=&compare=`, nuqs,
  saved to workspace). Legacy context `range` stays a legacy key (7d/14d/30d/60d/90d/6m/12m/...);
  map new->legacy (28d->30d, 3m->90d, 16m->12m, 24h->today). Also add 28d/3m/16m cases to
  googleApi resolveRange/resolvePrevRange (additive).
- Site routes: /dashboard/s/[host] (overview = analytics main content), /traffic?tab= (AnalyticsFrame
  extracted from analytics/layout.tsx, tabs link to ?tab=), /search (seo page), /pages (analytics/pages),
  /actions (audit page). [host] = lowercase host, no www; `--2` suffix on collisions.
  Old /dashboard/analytics/*, /seo, /audit: middleware 307 using cookie `tc_site` (validated host);
  without cookie a client fallback in the old layout redirects once the workspace resolves.
  Use 307 (not 308) for cookie-dependent redirects.
- Static permanent redirects in next.config: bot, setup-bot, blog, x-api, reddit-api, globe -> /dashboard;
  /dashboard/share* -> /dashboard/dashboards (check dashboard/share/[token] first); /dashboard/weekly ->
  /dashboard/settings?tab=notifications; /dashboard/ai-chat -> /dashboard/ask (move the page to ask/,
  update internal links incl. lib/askAi.ts); /x, /reddit, /globe, /embed/x/*, /embed/reddit/*, /demo/telegram*,
  /share-popup-preview. Keep /dashboard/docs (task lists Docs in sidebar; strip Telegram from it).
  Leave /features and /sponsor to the marketing stream.
- components/globe is still used by analytics/realtime, embed/[siteId], SharedOverviewClient: keep it.
  share-studio is imported by SharedOverviewClient and dashboard/share/[token]: check before deleting.
  InteractiveGlobe and TelegramChatSimulation look unused outside removed pages: re-grep, then delete.

## Next (in order, commit after each)
1. radix-ui install (above); tokens.css + globals.css + legacy.css; theme script (localStorage `tc-theme`)
   in app/layout.tsx; marketing layout wrapper data-theme=light; lib/cn.ts, lib/metrics.ts, lib/format.ts
   + tests (node --test via tsx or plain TS test runner), lib/dateRange.ts.
2. components/ui/* primitives. 3. components/charts/*. 4. /dashboard/styleguide (404 in production).
5. Shell (AppShell, Sidebar, SiteSwitcher, Topbar, PageHeader, DateRangeControl, MobileTabBar, UserMenu,
   LegacyFrame, WorkspaceProvider) + new dashboard layout.
6. Site routes, Portfolio stub (/dashboard "Portfolio coming"), /dashboard/ask, middleware gate change
   (Google connected -> /dashboard even before setup), cookie.
7. Clutter removal + redirects + copy (Telegram out of sign-up/onboarding/docs; GitHub `repo` scope out).
8. Sonner Toaster theming. 9. tsc, lint, tests, dev kit screenshots (1280/390, light/dark), crawl.
