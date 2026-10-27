/**
 * Dashboard builder v2: document, widget, query and result types (BUILDER.md 6-8).
 * Isomorphic and dependency free: the editor, the viewer, the query engine, the
 * migration and the tests all import from here.
 */

export type Iso = string; // 'YYYY-MM-DD'
export type WidgetId = string;
export type PageId = string;
export type ControlId = string;
export type MetricId = string; // 'ga4:sessions' | 'gsc:clicks'
export type DimId = string; // canonical: 'date' | 'country' | 'query' | 'site' ...

// ── Sources ──────────────────────────────────────────────────────────────

/** A portfolio site: siteId = normalised host (lower case, no protocol, no www). */
export interface SiteRef {
    siteId: string;
    /** Optional pin, wins over the inventory pairing: 'properties/123'. */
    ga4?: string;
    /** Optional pin: 'sc-domain:acme.com' | 'https://www.acme.com/'. */
    gsc?: string;
}

export type SourceRef =
    | { type: 'default' }
    | ({ type: 'site' } & SiteRef)
    | { type: 'portfolio'; include: 'all' | 'starred' | string[]; exclude?: string[]; rollup?: 'sum' };

/** What a public viewer sees instead of a SourceRef: a name, never ids or URLs. */
export interface PublicSourceRef {
    type: 'site' | 'portfolio';
    label: string;
}

// ── Dates and controls ───────────────────────────────────────────────────

export type DatePresetId =
    | 'today' | 'yesterday' | '7d' | '14d' | '28d' | '30d' | '90d' | '3m' | '6m' | '12m' | '16m'
    | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter'
    | 'this_year' | 'last_year';

export type DateRangeSpec =
    | { kind: 'preset'; id: DatePresetId; includeToday?: boolean }
    | { kind: 'custom'; start: Iso; end: Iso }
    | { kind: 'rolling'; days: number; endOffsetDays?: number };

export type CompareSpec =
    | { mode: 'none' }
    | { mode: 'previous_period' }
    | { mode: 'previous_year'; align?: 'date' | 'weekday' }
    | { mode: 'custom'; start: Iso; end: Iso };

export type ControlScope =
    | { mode: 'all' }
    | { mode: 'pages'; pageIds: PageId[] }
    | { mode: 'widgets'; widgetIds: WidgetId[] };

export interface DateControl {
    id: 'date';
    type: 'date';
    default: DateRangeSpec;
    defaultCompare: CompareSpec;
    presets?: DatePresetId[];
    viewerCanChange: boolean;
    viewerCanCompare: boolean;
}

export interface FilterControl {
    id: ControlId;
    type: 'filter';
    label: string;
    dimension: DimId;
    ui: 'multiselect' | 'select' | 'chips' | 'search';
    default?: string[];
    source?: SourceRef;
    scope: ControlScope;
    viewerCanChange: boolean;
}

export interface SiteControl {
    id: ControlId;
    type: 'site';
    label: string;
    options: string[] | 'all';
    default: string;
    scope: ControlScope;
}

export interface MetricControl {
    id: ControlId;
    type: 'metric';
    label: string;
    options: MetricId[];
    default: MetricId;
    scope: ControlScope;
}

export type ControlDef = DateControl | FilterControl | SiteControl | MetricControl;

export type FilterOp = 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'starts' | 'ends' | 'regex' | 'not_regex';
export interface FilterClause { dimension: DimId; op: FilterOp; value: string | string[] }
export interface MetricClause { metric: MetricId; op: 'gt' | 'gte' | 'lt' | 'lte' | 'between'; value: number | [number, number] }

/** What a viewer has selected right now (URL state). */
export interface ControlState {
    date: { range: DateRangeSpec; compare: CompareSpec };
    filters: Record<ControlId, string[]>;
    interaction?: FilterClause[];
    site?: Record<ControlId, string>;
    metric?: Record<ControlId, MetricId>;
    pageId?: PageId;
}

// ── Layout, theme, document ──────────────────────────────────────────────

export interface LayoutItem { i: WidgetId; x: number; y: number; w: number; h: number }
export interface GridLayouts { lg: LayoutItem[]; md?: LayoutItem[]; sm?: LayoutItem[] }
export interface PageDef { id: PageId; title: string; icon?: string; layouts: GridLayouts; hidden?: boolean }

export interface ThemeV2 {
    mode: 'light' | 'dark' | 'auto';
    header: {
        show: boolean;
        title?: string;
        subtitle?: string;
        companyName?: string;
        logoUrl?: string;
        logoPosition: 'left' | 'center' | 'right';
        showDates: boolean;
    };
    badge: { show: boolean };
    legacy?: Record<string, unknown>;
    // ── round 2 (all optional; missing = today's look) ──
    /** Theme preset (lib/builder/themes.ts). Missing = 'trafficclaw'. */
    id?: 'trafficclaw' | 'executive' | 'analyst' | 'midnight' | 'paper' | 'sunrise' | 'studio' | 'contrast';
    density?: 'compact' | 'comfortable' | 'airy';
    card?: 'elevated' | 'outlined' | 'flat' | 'ruled' | 'glass';
    pattern?: 'none' | 'dots' | 'grid' | 'glow';
    font?: 'geist' | 'system' | 'serif-headings' | 'mono-numbers';
    palette?: 'standard' | 'contrast';
    /** White-label kit: one brand colour (derived into accessible tokens), dark logo, credits. */
    brand?: BrandKit;
    /** Cover page above page one and as the first PDF page. */
    cover?: CoverPage;
}

export interface BrandKit {
    /** '#rrggbb' only. */
    color?: string;
    /** https only; used when the dashboard renders dark. */
    logoDarkUrl?: string;
    /** Up to 160 characters, at the bottom of the report and in the PDF footer. */
    footer?: string;
    preparedFor?: string;
    preparedBy?: string;
}

export interface CoverPage {
    enabled: boolean;
    layout: 'left' | 'center' | 'split';
    /** {{name}}, {{site}} and {{date_range}} are filled in. */
    title?: string;
    subtitle?: string;
    /** https only (split layout). */
    imageUrl?: string;
    /** The first KPI strip of page one under the title. */
    showKpis?: boolean;
}

export interface DashboardSettings {
    widthMode: 'contained' | 'full';
    autoRefreshSec: 0 | 300 | 900 | 1800 | 3600;
    timezone?: string;
    /** TV mode (round 2): page rotation in seconds (0 = off) and whether filters hide. */
    tv?: { rotateSec: 0 | 15 | 30 | 60 | 120; hideControls: boolean };
}

export interface DashboardDocV2 {
    schemaVersion: 2;
    name: string;
    description?: string;
    defaultSource: Exclude<SourceRef, { type: 'default' }>;
    controls: ControlDef[];
    pages: PageDef[];
    widgets: Record<WidgetId, WidgetDef>;
    theme: ThemeV2;
    settings: DashboardSettings;
    meta: {
        createdFrom?: string;
        migratedFromV1?: { at: string; propertyId: string; siteUrl?: string };
    };
}

// ── Widgets ──────────────────────────────────────────────────────────────

export interface NumberFormat {
    kind?: 'auto' | 'integer' | 'decimal' | 'percent' | 'duration' | 'currency' | 'position';
    decimals?: number;
    compact?: boolean;
    currency?: string;
}

export interface MetricRef { id: MetricId; label?: string; format?: NumberFormat }

export interface WidgetStyle {
    background?: 'surface' | 'transparent';
    border?: boolean;
    padding?: 'none' | 'sm' | 'md';
    titleAlign?: 'left' | 'center';
    titleSize?: 'sm' | 'md' | 'lg';
    numberFormat?: 'auto' | 'compact' | 'full';
}

export interface WidgetBase<T extends string, C> {
    id: WidgetId;
    type: T;
    title?: string;
    description?: string;
    showTitle?: boolean;
    source: SourceRef;
    config: C;
    style?: WidgetStyle;
    dateOverride?: { range?: DateRangeSpec; compare?: CompareSpec };
    filters?: FilterClause[];
    ignoreControls?: ControlId[];
    interactions?: { clickToFilter?: boolean };
    mobile?: { hidden?: boolean; minHeight?: number };
}

export interface ComparisonDisplay {
    show: boolean;
    display: 'percent' | 'absolute' | 'both';
    goodDirection?: 'up' | 'down' | 'neutral';
    label?: string;
}
export interface SparklineConfig { show: boolean; kind: 'line' | 'area' | 'bars' }

export interface ScorecardConfig {
    metric: MetricRef;
    comparison: ComparisonDisplay;
    sparkline: SparklineConfig;
    align?: 'left' | 'center';
    /** Goal for the period: progress bar and colour under the number (round 2). */
    target?: { value: number; label?: string };
}
export type ScorecardWidget = WidgetBase<'scorecard', ScorecardConfig>;

export interface KpiStripConfig {
    metrics: MetricRef[];
    comparison: ComparisonDisplay;
    sparkline: SparklineConfig;
    columns?: 'auto' | 2 | 3 | 4 | 6;
}
export type KpiStripWidget = WidgetBase<'kpi-strip', KpiStripConfig>;

export interface SeriesDef { metric: MetricRef; kind: 'line' | 'area' | 'bar'; axis?: 'left' | 'right' }
export interface TimeSeriesConfig {
    granularity: 'auto' | 'day' | 'week' | 'month';
    series: SeriesDef[];
    mode: 'auto' | 'overlay' | 'split';
    breakdown?: { dimension: DimId; top: number; other: boolean };
    compare: 'inherit' | 'off';
    stacked: boolean | 'percent';
    smooth: boolean;
    showPoints: boolean | 'hover';
    legend: 'auto' | 'top' | 'bottom' | 'none';
    yAxis: { min?: 'zero' | 'auto' };
    markPreliminary: boolean;
}
export type TimeSeriesWidget = WidgetBase<'timeseries', TimeSeriesConfig>;

export interface BarConfig {
    dimension: DimId;
    metrics: MetricRef[];
    stackBy?: DimId;
    variant: 'list' | 'chart';
    orientation: 'horizontal' | 'vertical';
    stacked: boolean | 'percent';
    sort: { by: MetricId | 'dimension'; dir: 'asc' | 'desc' };
    top: number;
    other: boolean;
    showValues: boolean;
    showShare: boolean;
    compare: 'inherit' | 'off';
    colorBy: 'series' | 'category';
}
export type BarWidget = WidgetBase<'bar', BarConfig>;

export interface PieConfig {
    dimension: DimId;
    metric: MetricRef;
    top: number;
    other: boolean;
    donut: boolean;
    centerLabel: 'total' | 'none';
    legend: 'right' | 'bottom' | 'none';
    showPercent: boolean;
}
export type PieWidget = WidgetBase<'pie', PieConfig>;

export interface TableColumn {
    id: string;
    kind: 'dimension' | 'metric';
    ref: DimId | MetricId;
    label?: string;
    visual: 'none' | 'bar' | 'heat' | 'delta';
    showDelta?: boolean;
    format?: NumberFormat;
    width?: number | 'auto';
    align?: 'left' | 'right' | 'center';
    hidden?: boolean;
    pin?: 'left';
    link?: boolean;
}
export interface ConditionalRule {
    column: string;
    op: 'gt' | 'gte' | 'lt' | 'lte' | 'between';
    value: number | [number, number];
    style: 'good' | 'bad' | 'warn';
    /** Test the value (default) or its relative change vs the comparison period (-0.2 = 20 % drop). */
    on?: 'value' | 'change';
}
export interface TableConfig {
    dimensions: DimId[];
    columns: TableColumn[];
    sort: { by: string; dir: 'asc' | 'desc' };
    pagination: boolean;
    pageSize: 5 | 10 | 25 | 50 | 100;
    maxRows: number;
    search: boolean;
    totalsRow: boolean;
    rowNumbers: boolean;
    density: 'compact' | 'comfortable';
    rowFilters?: MetricClause[];
    download: boolean;
    rules?: ConditionalRule[];
    /** Sort by change vs the comparison period ("Rising pages"). */
    sortByChange?: boolean;
}
export type TableWidget = WidgetBase<'table', TableConfig>;

export interface GeoConfig {
    level: 'country';
    metric: MetricRef;
    scale: { kind: 'sequential'; bins: 'quantile' | 'linear' | 'log'; steps: 5 | 7 };
    projection: 'naturalEarth' | 'mercator';
    topList: 0 | 5 | 10;
    showLegend: boolean;
    zoomRegion: 'world' | 'europe' | 'asia' | 'africa' | 'north-america' | 'south-america' | 'oceania';
}
export type GeoWidget = WidgetBase<'geo', GeoConfig>;

export interface TextConfig {
    markdown: string;
    role: 'heading' | 'subheading' | 'body' | 'note' | 'callout';
    align: 'left' | 'center' | 'right';
    variables: boolean;
}
export type TextWidget = WidgetBase<'text', TextConfig>;

export interface ImageConfig {
    src: string;
    alt: string;
    fit: 'contain' | 'cover';
    href?: string;
    radius?: 'none' | 'sm' | 'md' | 'full';
}
export type ImageWidget = WidgetBase<'image', ImageConfig>;

export interface SectionConfig { title: string; subtitle?: string; divider: boolean; icon?: string; align: 'left' | 'center' }
export type SectionWidget = WidgetBase<'section', SectionConfig>;

export interface PortfolioGridConfig {
    metrics: MetricRef[];
    sort: { by: MetricId | 'name' | 'change'; dir: 'asc' | 'desc' };
    show: 'cards' | 'compact';
    limit: number;
    columns: 'auto' | 1 | 2 | 3 | 4;
    sparkline: boolean;
    alerts: boolean;
    onClick: 'open-site' | 'filter-dashboard' | 'none';
}
export type PortfolioGridWidget = WidgetBase<'portfolio-grid', PortfolioGridConfig>;

export type WidgetDef =
    | ScorecardWidget | KpiStripWidget | TimeSeriesWidget | BarWidget | PieWidget | TableWidget
    | GeoWidget | TextWidget | ImageWidget | SectionWidget | PortfolioGridWidget;

export type WidgetType = WidgetDef['type'];

/** Widget config by type, for generic helpers. */
export type WidgetOf<T extends WidgetType> = Extract<WidgetDef, { type: T }>;

// ── Records and sharing ──────────────────────────────────────────────────

export interface ShareState {
    enabled: boolean;
    token?: string | null;
    hasPassword: boolean;
    allowCopy: boolean;
    badge: boolean;
    viewerControls: { date: boolean; compare: boolean; filters: boolean };
    embed: { enabled: boolean; allowedOrigins: string[] };
    expiresAt?: string | null;
}

export interface DashboardRecord {
    id: string;
    rev: number;
    schemaVersion: 1 | 2;
    doc: DashboardDocV2;
    share: ShareState;
    isTemplate: boolean;
    views: number;
    createdAt: string | null;
    updatedAt: string | null;
}

/** What /view/[token] receives: no owner, no ids, no site URLs. */
export interface PublicDashboard {
    name: string;
    requiresPassword: boolean;
    unlocked: boolean;
    doc?: PublicDashboardDoc;
    share?: Pick<ShareState, 'allowCopy' | 'badge' | 'viewerControls'>;
    rev?: number;
}
export type PublicDashboardDoc = Omit<DashboardDocV2, 'defaultSource' | 'widgets' | 'meta'> & {
    defaultSource: PublicSourceRef;
    widgets: Record<WidgetId, Omit<WidgetDef, 'source'> & { source: PublicSourceRef | { type: 'default' } }>;
    meta: Record<string, never>;
};

// ── Query API ────────────────────────────────────────────────────────────

export interface DashboardQueryRequest {
    dashboardId?: string;
    pageId?: PageId;
    widgetIds?: WidgetId[];
    widgets?: WidgetDef[];
    defaultSource?: SourceRef;
    controlDefs?: ControlDef[];
    controls: ControlState;
    fresh?: boolean;
}

export interface ResolvedDates { range: { start: Iso; end: Iso }; compare?: { start: Iso; end: Iso }; timezone: string; today: Iso }

export interface DashboardQueryResponse {
    results: Record<WidgetId, WidgetResult>;
    resolved: ResolvedDates;
    meta: { durationMs: number; google: { ga4Calls: number; gscCalls: number; ga4Reports: number }; cache: { hit: number; stale: number; miss: number } };
}

export type WidgetResult = WidgetResultOk | WidgetResultError;

export interface DataColumn {
    id: string;
    kind: 'dimension' | 'metric';
    label: string;
}

export type CellValue = string | number | null;

export interface DataFrame {
    columns: DataColumn[];
    /** Dimension cells 'd:<dimId>'; metrics 'm:<metricId>'; comparison 'm:<metricId>:prev'. */
    rows: Array<Record<string, CellValue>>;
    totals?: Record<string, number | null>;
    rowCount?: number;
    truncated?: boolean;
    /** Wide frames (breakdowns, stacks): the series keys in order, e.g. 'b:Organic Search'. */
    seriesKeys?: string[];
    /** Display names for 'site' values (and site series keys): siteId -> name. */
    labels?: Record<string, string>;
}

export interface ResultFlags {
    stale?: boolean;
    sampled?: { pct: number };
    thresholded?: boolean;
    otherRow?: boolean;
    preliminaryFrom?: Iso;
    filtersIgnored?: ControlId[];
    sitesFailed?: string[];
    usersSummed?: boolean;
    /** Families the source lacks for some of the widget's metrics (those show '–'). */
    missingFamilies?: Array<'ga4' | 'gsc'>;
    sortedWithinTop?: number;
    currency?: string;
}

export interface WidgetResultOk {
    status: 'ok';
    fetchedAt: string;
    cache: 'hit' | 'stale' | 'miss';
    parts: Record<string, DataFrame>;
    flags: ResultFlags;
    /** Display name of the source ("acme.com", "All sites"). */
    sourceLabel?: string;
}

export type WidgetErrorCode =
    | 'NOT_CONNECTED' | 'NO_ACCESS' | 'NO_GA4_SOURCE' | 'NO_GSC_SOURCE' | 'INCOMPATIBLE' | 'UNSUPPORTED_FOR_PORTFOLIO'
    | 'QUOTA' | 'UPSTREAM' | 'INVALID' | 'DEMO_UNSUPPORTED';

export interface WidgetResultError {
    status: 'error';
    code: WidgetErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSec?: number;
    hint?: { action: 'reconnect' | 'choose-source' | 'change-metric' | 'wait'; detail?: string };
    stale?: WidgetResultOk;
    sourceLabel?: string;
}

/** Compiled form of one data need of a widget (isomorphic compileWidget output). */
export interface WidgetQuery {
    part: string;
    source: SourceRef;
    metrics: MetricId[];
    dimensions: DimId[];
    granularity?: 'day' | 'week' | 'month';
    filters: FilterClause[];
    having?: MetricClause[];
    sort?: { by: MetricId | DimId; dir: 'asc' | 'desc' };
    limit?: number;
    offset?: number;
    top?: { n: number; other: boolean };
    totals?: boolean;
    compare: boolean;
    /** Zero-fill the date axis and align the comparison by day index. */
    fillDates?: boolean;
    /** Second dimension pivoted into series columns (time series breakdown, stacked bar). */
    pivot?: { dimension: DimId; top: number; other: boolean };
    searchType?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
}
