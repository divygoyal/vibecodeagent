# Sweep notes (tc/sweep, worktree tc-sweep, from tc/integrate a265184)

Goal: no old dark UI left that a user can reach. Restyle what is reachable with the tokens and
components/ui + components/charts, delete what is not.

Hands off (integration engineer owns them): shell/AppShell, CreditWelcome, WorkspaceIncompleteBanner,
ui/Select, ui/Drawer, ui/Modal, the dashboards create dialog.

How reachability was checked: an import-graph script (scratchpad graph.mjs) walks static and dynamic
imports from every app/** page/layout/error/route file plus middleware.ts and instrumentation.ts.

## Done
- Deleted 65 unreachable files: old components (AnnotationModal, ChartAnnotations, ConfirmDialog,
  DemoModeBanner, DomainOverview + domain-overview/*, FixWithBotButton, KeywordDetailDrawer,
  OverviewDetailDrawer, OverviewInsights, PageDetailDrawer, ShareDashboardModal, TableActionMenu,
  WorldMap (root), Toast, SparklineCell, IntentBadge, FloatingAuditBanner, AnnotationBadge,
  analytics/{AIInsightEngine, AnalyticsIntelligenceCards, AnalyticsTable, DrilldownDrawer,
  FilterBuilder, GlassCard, LiveVisitorDrawer, RealtimeGlobe, SkeletonLoader},
  dashboard/{ActionCard, GoalProgress, KPICard, LastUpdated, MobileExportModal, MobileQuickStats,
  RecentActivity}, workspace/*), their stores (analyticsFilterStore, annotationStore) and dead
  helpers (connectorIntent, exportUtils, github-auth, safeJson, seoAiPrompts, shareUrls,
  useAnalyticsIntelligenceData, useAnalyticsSubpageData, useKeyboardShortcuts, usePullToRefresh).
  API routes those components called are left alone (out of scope).

## Remaining list (reachable legacy UI)
- weekly page + components/weekly/* + old components/EmptyState
- CommandPalette (mounted in app/providers.tsx)
- ErrorBoundary, dashboard/error.tsx, OfflineBanner
- /share/[token]: page.tsx, SharedDashboardClient, SharedOverviewClient, SharedEventsReportClient,
  SharedUmamiClient, OverviewIcons, ShareConversionBar, SharePromoPopup, DatePicker,
  analytics/{WorldMap, AnalyticsIcons, DataRow}
