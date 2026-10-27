# Sweep notes (tc/sweep, worktree tc-sweep, from tc/integrate a265184)

Goal: no old dark UI left that a user can reach. Restyle what is reachable with the tokens and
components/ui + components/charts, delete what is not.

Hands off (integration engineer owns them): shell/AppShell, CreditWelcome, WorkspaceIncompleteBanner,
ui/Select, ui/Drawer, ui/Modal, the dashboards create dialog.

How reachability was checked: an import-graph script walks static and dynamic imports from every
app/** page/layout/error/route file plus middleware.ts and instrumentation.ts, then lists reachable
files that still use zinc/black/hex-dark/emerald/cyan/white-alpha/glass classes.

## Commits
- 3dd6bc2 delete 65 unreachable files (old drawers, annotation modal, domain overview, workspace
  tools, mobile dashboard bits, analytics table/drilldown, their stores and hooks).
- 5082dab /dashboard/weekly -> /dashboard/settings?tab=notifications (DESIGN 4.3 names that target;
  the weekly report switch lives there). Weekly page, components/weekly/*, old components/EmptyState,
  lib/weeklyDigestClient deleted. LEGACY_ROUTE_PREFIXES = [].
- cafce53 components/shell/CommandPalette (DESIGN 3.23), mounted by Topbar (has the workspace sites);
  old components/CommandPalette and its providers mount removed. ErrorBoundary, dashboard/error.tsx,
  OfflineBanner on tokens.
- 58741ff components/share/ShareChrome (SharePage, ShareHeader, ShareFooter, ShareNotFound,
  SHARE_CONTAINER); DatePicker on ui/DropdownMenu; WorldMap light; DataRow/AnalyticsIcons on tokens.
- badc7e0 legacy-layout share (SharedDashboardClient), Umami share, shared events report (forks).
- 4b0fed6 shared overview rebuilt on the kit (KPI tiles + comparison chart, breakdown cards with
  tabs/search/heat tables/chart view/View all drawers, filter chips, realtime card with WorldMap).
  Globe, fake visitor feed and fake "est. value" removed; share-studio preview hooks and the unused
  dashboard mode removed. share/[token]/page.tsx, ShareConversionBar, SharePromoPopup on tokens.
  Logo, AnimatedCounter, DataRow, DashboardHoverSurface deleted (no users).
- 11bbd14 /embed/<id> realtime map light by default (positron base, no stars), dark with ?theme=dark;
  popup no longer shows hash-made session time / visit counts.
- 3166037 dead dark status classes in lib/adSlots; PDF export default background light.

## Left on purpose
- components/shell/LegacyFrame.tsx + isLegacyRoute(): AppShell still imports them (hands off). With the
  empty prefix list the branch never renders; delete both and the `.legacy` rules in styles/legacy.css
  when AppShell is next edited.
- styles/legacy.css: many classes now unused (dashboard-hover-*, data-row, glass-card, glow-*). Prune later.
- CreditWelcome (`var(--dropdown-bg)`), WorkspaceIncompleteBanner: integration engineer.
- Not UI: email HTML (adSlotsAnnouncementEmail dark email, reportEmail colours), lib/oauth/authorize.ts
  consent HTML (light, OS dark), superadmin Telegram fields (internal ops), chat citation labels for the
  GitHub tools (backend tools still exist), demo-workspace sample page names.
- API routes only the deleted UI called (insights, annotations, domain-overview, weekly-digests …) stay.

## Checks
tsc clean, eslint clean on all touched files, npm test 38/38. No dev server on this branch (RAM);
visual check pending on the merged preview: /share/bd140953166c57c430afb24eee12d2df (demo token on
integrate), /share/<token>/events, /embed/acme?token=…, ⌘K in the app, /dashboard/weekly redirect.
