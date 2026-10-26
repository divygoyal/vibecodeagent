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
- Done in the first dev session: screenshots of shell pages (portfolio, s/acmeanalytics.example/search, dashboards,
  ask, settings) + full-page styleguide, light/dark x 1280/390, in research/shots/foundation/. Console clean except
  Tawk (3rd party) and a PRE-EXISTING settings hydration mismatch (settings/page.tsx referralLink uses window during render).
- Still to do (one short dev session; wait for a free slot, max 2): look at styleguide shots and fix visual issues;
  crawl (node scripts/dev/crawl.mjs 3103 <dir> --part 1/2 ... ) and confirm removed routes redirect; then
  rm -rf web/.next; scripts/dev/down.sh foundation.
- Commits since b511550: faa53c8 (Geist on html, chart mobile cap), 9cef58d (setup lands on Portfolio), 76145ba (sidebar
  column full height), ac5a6a7 (legacy 44px rule scoped to old pages), plus the WIP commit below (favicon 204, sidebar
  scroll, collision labels, Tawk offset).

## Component API (for other streams)
Import from '@/components/ui', '@/components/charts', or the file. Shell pieces from '@/components/shell/<File>'.

ui:
- Button {variant: primary|secondary|ghost|subtle|danger|link|google, size: sm|md|lg|xl, icon?, trailingIcon? (LucideIcon),
  iconOnly? (+aria-label), loading?, asChild? (style a <Link>)}; buttonClasses(opts); GoogleMark
- Badge {variant: outline|neutral|brand|up|down|warn|info|sponsored}; PropertyKindBadge {siteUrl}
- Pill {tone, dot?, icon?}; StatusPill {status: synced|syncing|stale|error|not_connected, label?, progress?, tooltip?, onClick?};
  VerifiedBadge {label?, tooltip?}
- Card {padding: none|sm|md|lg, interactive?, as?}; CardLink {href, padding}; CardHeader {title, description?, actions?, as?}; CardFooter
- StatCard {metric, value, previous?, label?, comparisonLabel?, info?, sparkline?, sparklineDates?, size: md|lg, loading?}
- KpiStrip {items: {metric,value,previous?,label?,loading?}[], selected, onSelect, comparisonLabel?, children (chart)}
- MetricDelta {current, previous, metric? | format?+better?, variant: text|chip, size: sm|md, comparisonLabel?}; DeltaArrow; deltaFor()
- SegmentedControl<T> {options: {value,label,icon?,ariaLabel?}[], value: T|null, onChange, variant: brand|neutral, size: sm|md, ariaLabel}
- Select<T> {value, onValueChange, options: {value,label,textValue?,icon?}[], label? ("Sort:"), placeholder?, size, ariaLabel?}
- SearchInput {value, onValueChange, slashShortcut?=true, size}; useDebouncedValue(v, 120)
- Tabs<T> {items: {value,label,count?,icon?,href?}[], value, onValueChange?, variant: underline|pills, ariaLabel}
- Table<T> {columns: {key,header,cell,align?,sortable?,sortValue?,firstSortDir?,width?,heat?:{metric,value}}[], rows, rowKey,
  sort?/onSortChange? | defaultSort?, onRowClick?, density, loading?, empty?, toolbar?, pagination?: {pageSize,page?,onPageChange?,total?,pageSizes?,onPageSizeChange?}, footer?, caption?}
- EmptyState {icon?, title, description?, actions?, variant: page|card|inline}
- Skeleton {className, delay?=150, rounded}; SkeletonText {lines}
- Toaster (mounted in providers); toast (re-export of sonner)
- Modal {open, onOpenChange, title, description?, footer?, size: sm|md|lg|xl, trigger?}; ConfirmModal {…, confirmLabel, onConfirm, danger?}
- Drawer {open, onOpenChange, title, subtitle?, footer?, width: default|wide, side: right|left}
- Tooltip {content, children (one focusable element), side?, align?, disabled?}; TooltipProvider (in providers)
- Popover, PopoverTrigger, PopoverContent {align, side, className}
- DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem {icon?, shortcut?, destructive?}, …CheckboxItem, …RadioGroup/RadioItem,
  …Label, …Separator, …Sub/SubTrigger/SubContent
- Switch {checked, onCheckedChange, label?, description?, size}; Checkbox {checked: boolean|'indeterminate', onCheckedChange, label?};
  RadioGroup {value, onValueChange, options, ariaLabel}
- Banner {variant: info|success|warn|danger|neutral, title?, children, actions?, onDismiss?}
- Favicon {host (any form), size: 16|20|24|32|64}; Avatar {name, src?, size}; Kbd
charts:
- Sparkline {series: {metric, values, label?}[] (1-2), dates?, height (72|56|40|28), area: first|none, interactive?}
- TimeSeriesChart {data (rows with `date`), series: {metric,key,compareKey?,label?}[], mode: single|overlay|split, partialFrom?, annotations?, height, compareDateKey?, ariaLabel?}
- ChartCard {title, subtitle?, actions?, height: compact|default|large|px, state: ready|loading|refetching|empty|error, empty?, error?, footer?, onDownloadCsv?, onAddToDashboard?, onAskAi?, tableView?}
- BarList {items: {key,label,text?,value,icon?,href?}[], metric|'neutral', limit=8, showShare?, onItemClick?, labelHeader?, viewAllTitle?, loading?}
- Donut {items: {key,label,value,color?}[], centerLabel?, format?, size?, legend: right|bottom}
- ChartTooltipCard {title?, subtitle?, rows: {key,label,color,value,dashed?,delta?}[], partial?}; MetricTooltip
lib: format.ts (fmtFull, fmtCompact, fmtAxis, fmtPercent(ratio,{tile}), fmtPosition, fmtDuration, fmtValue, computeDelta, fmtDelta,
  fmtDeltaPoints, fmtDeltaPosition, fmtDateRange, fmtDay, fmtDayLong, makeDateTickFormatter, toDate); metrics.ts (METRICS, MetricKey,
  fmtMetric, metricDelta, publicLabel, categoricalColor, channelColor, deviceColor); dateRange.ts; cn.ts; theme.ts.
shell:
- Page title/actions: render <PageHeader title subtitle? icon? badges? actions? tabs? backHref? note?/> first in the page;
  put <DateRangeControl /> last in actions. useBreadcrumbTitle('Name') sets the last breadcrumb.
- Current site: useCurrentSite() -> {site: {host,label,gscSiteUrl,gscKind,ga4PropertyId,ga4Name}|null, sites, loading, fromRoute,
  section, selectSite(entry,{navigate?,section?})}. Hrefs: siteHref(host, section) from shell/nav.ts.
- Date range: useDateRange() -> {value {preset,compare,from?,to?}, setValue, setPreset, setCompare, resolved {start,end,days,prevStart,prevEnd}
  (GA4), resolvedSearch (GSC, lag 2 days), label, compareLabel, legacyRange}.
- Old pages: useWorkspace()/useRegistration() from '@/components/shell/workspaceContext' (also re-exported by dashboard/layout).
- Migrating an old page: delete its prefix from LEGACY_ROUTE_PREFIXES in components/shell/nav.ts.
