'use client';

/**
 * Public shared overview (/share/<token>, layoutMode 'openpanel_overview', the
 * default for shares made in the old share studio). Light by default, ?theme=dark
 * through the head script (DESIGN 2.1). Same tokens and parts as the app.
 *
 * State lives in the URL (useShareOverviewState): range, metric, tabs, filters,
 * table/chart view. Clicking a row adds a filter; the chips under the controls
 * remove them.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    LineChart,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChartColumn, ExternalLink, TableProperties, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { eventDisplayName } from '@/lib/eventNames';
import { fmtAxis, fmtCompact, fmtDuration, fmtFull, fmtPercent, makeDateTickFormatter, type MetricFormat } from '@/lib/format';
import { categoricalColor, METRICS as METRIC_DEFS, type MetricKey } from '@/lib/metrics';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { Tooltip } from '@/components/ui/Tooltip';
import { Sparkline } from '@/components/charts/Sparkline';
import { ChartTooltipCard, type ChartTooltipRow } from '@/components/charts/ChartTooltip';
import { AXIS_LINE, AXIS_TICK, CURSOR, GRID_STROKE, dateTicks, maxOf, niceAxis, type AxisFormat } from '@/components/charts/axis';
import { dateAxisTick } from '@/components/charts/AxisTick';
import { sourceInfo } from '@/components/site/lib/sources';
import DatePicker, { getRangeLabel } from '@/components/DatePicker';
import { SHARE_CONTAINER, ShareBrand, ShareFooter, ShareHeader, SharePage } from '@/components/share/ShareChrome';
import { OverviewCountryFlag, OverviewValueIcon } from '@/components/share-overview/openpanel/OverviewIcons';
import {
    useShareOverviewState,
    type ShareOverviewEventTab,
    type ShareOverviewGeoTab,
    type ShareOverviewPagesTab,
    type ShareOverviewRange,
    type ShareOverviewSourcesTab,
    type ShareOverviewTechTab,
} from '@/components/share-overview/openpanel/useShareOverviewState';
import {
    SHARE_OVERVIEW_FILTER_NAMES,
    hasPageScopedFilter,
    serializeShareOverviewEventNames,
    serializeShareOverviewFilters,
    type ShareOverviewFilter,
} from '@/lib/shareOverviewFilters';
import { DEFAULT_SECTION_ORDER, type NormalizedShareConfig, type ShareSectionId } from '@/lib/shareTypes';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

/* ─── Metrics ─── */

type OverviewFormat = 'count' | 'percent' | 'duration' | 'decimal';

interface OverviewMetric {
    key: string;
    label: string;
    /** Colour family (DESIGN 2.3: derived metrics borrow their family colour). */
    family: MetricKey;
    format: OverviewFormat;
    better: 'up' | 'down';
}

/** Order matters: the URL `metric` param and the share's default metricIndex are indexes into it. */
const OVERVIEW_METRICS: OverviewMetric[] = [
    { key: 'unique_visitors', label: 'Visitors', family: 'users', format: 'count', better: 'up' },
    { key: 'total_sessions', label: 'Sessions', family: 'sessions', format: 'count', better: 'up' },
    { key: 'total_screen_views', label: 'Pageviews', family: 'pageviews', format: 'count', better: 'up' },
    { key: 'views_per_session', label: 'Pages per session', family: 'sessions', format: 'decimal', better: 'up' },
    { key: 'bounce_rate', label: 'Bounce rate', family: 'sessions', format: 'percent', better: 'down' },
    { key: 'avg_session_duration', label: 'Session duration', family: 'sessions', format: 'duration', better: 'up' },
    { key: 'new_users', label: 'New users', family: 'users', format: 'count', better: 'up' },
];

/** The stats API sends bounce rate as a percent number (35.2); lib/format wants ratios. */
function toDisplayValue(format: OverviewFormat, value: number) {
    return format === 'percent' ? value / 100 : value;
}

/** Table value cells are 64-72px wide: exact up to 999,999, compact (339B) beyond so huge counts stay inside. */
function fmtCell(n: number): string {
    return Math.abs(n) < 1_000_000 ? fmtFull(n) : fmtCompact(n);
}

function fmtOverview(format: OverviewFormat, value: number | null | undefined, opts: { compact?: boolean } = {}) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '–';
    if (format === 'percent') return fmtPercent(value / 100, { tile: opts.compact });
    if (format === 'duration') return fmtDuration(value);
    if (format === 'decimal') return value.toFixed(2);
    return opts.compact ? fmtCompact(value) : fmtFull(value);
}

/** MetricDelta format: percent -> points; ratios like pages per session -> percent change without the count noise floor. */
function deltaFormat(format: OverviewFormat): MetricFormat {
    if (format === 'percent') return 'percent';
    if (format === 'count') return 'count';
    return 'duration';
}

/* ─── Tabs and labels ─── */

const SOURCES_TABS: Array<{ value: ShareOverviewSourcesTab; label: string }> = [
    { value: 'referrer_name', label: 'Referrers' },
    { value: 'referrer', label: 'URLs' },
    { value: 'referrer_type', label: 'Types' },
    { value: 'utm_source', label: 'Source' },
    { value: 'utm_medium', label: 'Medium' },
    { value: 'utm_campaign', label: 'Campaign' },
    { value: 'utm_term', label: 'Term' },
    { value: 'utm_content', label: 'Content' },
];
const PAGES_TABS: Array<{ value: ShareOverviewPagesTab; label: string }> = [
    { value: 'page', label: 'Pages' },
    { value: 'entry', label: 'Entry pages' },
    { value: 'exit', label: 'Exit pages' },
];
const TECH_TABS: Array<{ value: ShareOverviewTechTab; label: string }> = [
    { value: 'device', label: 'Devices' },
    { value: 'browser', label: 'Browsers' },
    { value: 'browser_version', label: 'Browser versions' },
    { value: 'os', label: 'OS' },
    { value: 'os_version', label: 'OS versions' },
    { value: 'brand', label: 'Brands' },
    { value: 'model', label: 'Models' },
];
const GEO_TABS: Array<{ value: ShareOverviewGeoTab; label: string }> = [
    { value: 'country', label: 'Countries' },
    { value: 'region', label: 'Regions' },
    { value: 'city', label: 'Cities' },
];
const EVENT_TABS: Array<{ value: ShareOverviewEventTab; label: string }> = [
    { value: 'events', label: 'Events' },
    { value: 'conversions', label: 'Key events' },
    { value: 'link_out', label: 'Outbound links' },
];
const FILTER_LABELS: Record<string, string> = {
    referrer_name: 'Referrer',
    referrer: 'Referrer URL',
    referrer_type: 'Referrer type',
    utm_source: 'Source',
    utm_medium: 'Medium',
    utm_campaign: 'Campaign',
    utm_term: 'Term',
    utm_content: 'Content',
    device: 'Device',
    browser: 'Browser',
    browser_version: 'Browser version',
    os: 'OS',
    os_version: 'OS version',
    brand: 'Brand',
    model: 'Model',
    country: 'Country',
    region: 'Region',
    city: 'City',
    origin: 'Domain',
    path: 'Page',
    entry_path: 'Entry page',
    exit_path: 'Exit page',
    name: 'Event',
};

/* ─── API types ─── */

type StatsSeriesPoint = Record<string, number | string>;
type StatsResponse = {
    metrics: Record<string, number>;
    series: StatsSeriesPoint[];
};
type GenericItem = { prefix?: string; name: string; sessions: number; pageviews: number; revenue?: number };
type TopGenericResponse = { supported: boolean; label: string; primaryMetric?: 'sessions' | 'pageviews'; items: GenericItem[] };
type TopGenericSeriesResponse = {
    supported: boolean;
    label: string;
    primaryMetric?: 'sessions' | 'pageviews';
    items: Array<GenericItem & { data: Array<{ date: string; sessions: number; pageviews: number; revenue?: number }> }>;
};
type TopPagesResponse = {
    supported: boolean;
    items: Array<{
        origin: string;
        path: string;
        title: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
        bounceRate: number;
        avgSessionDuration: number;
    }>;
};
type TopEventsResponse = {
    events: Array<{ id: string; name: string; count: number }>;
    conversions: Array<{ id: string; name: string; count: number }>;
    linkOut: Array<{ id: string; name: string; count: number }>;
    supported: { conversions: boolean; linkOut: boolean };
};
type LiveResponse = {
    activeUsers: number;
    minuteCounts: Array<{ minute: string; sessionCount: number; visitorCount: number; timestamp: number; time: string; referrers: Array<{ referrer: string; count: number }> }>;
    referrers: Array<{ referrer: string; count: number }>;
    byCountry: Array<{ country: string; users: number }>;
    byCity: Array<{ city: string; country: string; users: number }>;
    byPage: Array<{ page: string; users: number }>;
};
type LiveVisitorsResponse = { activeUsers: number };
type LiveOverviewResponse = LiveResponse | LiveVisitorsResponse;
type LiveBar = { sessionCount: number; time: string };

function hasLiveBreakdown(data?: LiveOverviewResponse): data is LiveResponse {
    return Boolean(data && 'minuteCounts' in data);
}

/* ─── Runtime ─── */

type OverviewRuntime = {
    queryKey: string;
    apiBasePath: string;
    siteUrl?: string;
    views: number;
    embedMode?: boolean;
    config?: NormalizedShareConfig | null;
    /** Hides the brand strip in embeds. Server-gated by an HMAC on `_b`, so only our marketing site can set it. */
    hideOwnerLogo?: boolean;
};

const OverviewRuntimeContext = createContext<OverviewRuntime | null>(null);

function useOverviewRuntime() {
    const runtime = useContext(OverviewRuntimeContext);
    if (!runtime) throw new Error('Overview runtime missing');
    return runtime;
}

const LIVE_DATA_POLL_INTERVAL_MS = 15_000;
const LIVE_RECONCILE_INTERVAL_MS = 60_000;
const OVERVIEW_QUERY_STALE_MS = 30_000;
const TABLE_ROW_LIMIT = 10;
const LIVE_BAR_COUNT = 15;
const MAX_CHART_SERIES = 5;

function fetchJson<T>(url: string): Promise<T> {
    return fetch(url).then(async (response) => {
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.message || body.error || `Request failed (${response.status})`);
        }
        return response.json();
    });
}

function buildSearch({ filters, events, extra }: { filters: ShareOverviewFilter[]; events?: string[]; extra?: Record<string, string | undefined> }) {
    const search = new URLSearchParams();
    if (filters.length) search.set('f', serializeShareOverviewFilters(filters));
    if (events?.length) search.set('events', serializeShareOverviewEventNames(events));
    Object.entries(extra || {}).forEach(([key, value]) => {
        if (value) search.set(key, value);
    });
    return search.toString();
}

function buildOverviewUrl(
    runtime: OverviewRuntime,
    endpoint: string,
    { filters, events, extra }: { filters: ShareOverviewFilter[]; events?: string[]; extra?: Record<string, string | undefined> },
) {
    const search = buildSearch({ filters, events, extra });
    return `${runtime.apiBasePath}/${endpoint}${search ? `?${search}` : ''}`;
}

function bucketItems<T>(items: T[], targetCount: number) {
    if (items.length <= targetCount) return items.map((item) => [item]);
    return Array.from({ length: targetCount }, (_, bucketIndex) => {
        const start = Math.floor((bucketIndex * items.length) / targetCount);
        const end = Math.floor(((bucketIndex + 1) * items.length) / targetCount);
        return items.slice(start, Math.max(start + 1, end));
    }).filter((bucket) => bucket.length > 0);
}

function average(values: number[]) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function aggregateLiveBars(data: LiveResponse['minuteCounts']): LiveBar[] {
    return bucketItems(data, LIVE_BAR_COUNT).map((bucket) => {
        const first = bucket[0];
        const last = bucket[bucket.length - 1];
        return {
            sessionCount: Math.round(average(bucket.map((point) => point.sessionCount))),
            time: first.time === last.time ? last.time : `${first.time} – ${last.time}`,
        };
    });
}

function formatDateLabel(value: string | number, interval: string, long = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    if (interval === 'hour') {
        return long
            ? date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (interval === 'month') return date.toLocaleDateString('en-US', { month: 'short', year: long ? 'numeric' : '2-digit' });
    return date.toLocaleDateString('en-US', long ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

function seriesValue(point: StatsSeriesPoint, key: string) {
    const value = point[key];
    return typeof value === 'number' ? value : 0;
}

function normalizePagePath(path: string) {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
}

function buildPageHref(origin?: string, path?: string, siteUrl?: string) {
    const normalizedPath = normalizePagePath(path || '/');
    if (origin && origin !== '(not set)') {
        const host = origin.startsWith('http://') || origin.startsWith('https://') ? origin : `https://${origin}`;
        return `${host.replace(/\/$/, '')}${normalizedPath}`;
    }
    if (siteUrl && /^https?:\/\//.test(siteUrl)) return `${siteUrl.replace(/\/$/, '')}${normalizedPath}`;
    return normalizedPath;
}

function useDebouncedLiveValue(value: number, delay: number, reconcileMs: number) {
    const [displayValue, setDisplayValue] = useState(value);
    const latestValueRef = useRef(value);

    useEffect(() => {
        latestValueRef.current = value;
        const timeoutId = window.setTimeout(() => setDisplayValue(value), delay);
        return () => window.clearTimeout(timeoutId);
    }, [delay, value]);

    useEffect(() => {
        const intervalId = window.setInterval(() => setDisplayValue(latestValueRef.current), reconcileMs);
        return () => window.clearInterval(intervalId);
    }, [reconcileMs]);

    return displayValue;
}

/** Columns holding a traffic source: shown with the app's names ("(direct)" -> "Direct", "google" -> "Google"). */
const SOURCE_COLUMNS = new Set(['referrer_name', 'utm_source']);

function formatValueLabel(column: string, value: string) {
    if (SOURCE_COLUMNS.has(column)) return sourceInfo(value).label;
    if (!value) return '(not set)';
    if (column === 'referrer' || column === 'referrer_name' || column === 'origin') {
        return value.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
    return value;
}

function matchesSearch(text: string, query: string) {
    const needle = query.trim().toLowerCase();
    return !needle || text.toLowerCase().includes(needle);
}

/* ─── Small parts ─── */

function LiveDot({ active }: { active: boolean }) {
    return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', active ? 'bg-up animate-live-dot' : 'bg-fg-faint')} />;
}

function LivePill({ activeUsers }: { activeUsers: number }) {
    return (
        <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 text-body-sm shadow-xs">
            <LiveDot active={activeUsers > 0} />
            <span className="font-medium text-fg tabular-nums">{fmtCompact(activeUsers)}</span>
            <span className="text-fg-muted max-sm:hidden">live now</span>
        </span>
    );
}

/** Loading / error / empty states inside a panel body; keeps the panel height steady. */
function PanelState({ loading, error, empty, emptyText = 'No data in this period', children }: {
    loading: boolean;
    error: Error | null;
    empty: boolean;
    emptyText?: string;
    children: ReactNode;
}) {
    if (loading) {
        return (
            <div className="flex flex-col gap-1 p-4" aria-busy>
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex h-8 items-center gap-3">
                        <Skeleton className="h-6 rounded-md" style={{ width: `${82 - i * 11}%` }} />
                        <Skeleton className="ml-auto h-3 w-10" />
                    </div>
                ))}
            </div>
        );
    }
    if (error) {
        return <EmptyState variant="inline" icon={AlertTriangle} title="Could not load this list" description={error.message} />;
    }
    if (empty) return <EmptyState variant="inline" title={emptyText} />;
    return <>{children}</>;
}

/** A breakdown card: pill tabs, search, body, footer. */
function Panel({ tabs, tab, onTab, search, onSearch, searchLabel, children, footer, className }: {
    tabs: Array<{ value: string; label: string; disabled?: boolean }>;
    tab: string;
    onTab: (value: string) => void;
    search: string;
    onSearch: (value: string) => void;
    searchLabel: string;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
}) {
    return (
        <Card as="section" padding="none" className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
            <div className="flex flex-col gap-2 border-b border-border-subtle p-3">
                <Tabs variant="pills" items={tabs} value={tab} onValueChange={onTab} ariaLabel={searchLabel} />
                <SearchInput size="sm" value={search} onValueChange={onSearch} placeholder={`Search ${searchLabel.toLowerCase()}`} slashShortcut={false} aria-label={`Search ${searchLabel.toLowerCase()}`} />
            </div>
            <div className="min-h-[360px] flex-1">{children}</div>
            {footer ? <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">{footer}</div> : null}
        </Card>
    );
}

function ViewToggle({ disabled }: { disabled?: boolean }) {
    const { view, setView } = useShareOverviewState();
    if (disabled) return null;
    return (
        <SegmentedControl
            size="sm"
            variant="neutral"
            ariaLabel="Show as"
            value={view}
            onChange={(v) => setView(v)}
            options={[
                { value: 'table', label: 'Table', icon: TableProperties },
                { value: 'chart', label: 'Chart', icon: ChartColumn },
            ]}
        />
    );
}

/* ─── Breakdown table ─── */

type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir } | null;

interface BreakdownColumn<T> {
    key: string;
    header: string;
    value: (row: T) => number;
    format?: (row: T) => string;
    /** Hidden below 768px. */
    desktopOnly?: boolean;
}

interface BreakdownTableProps<T> {
    rows: T[];
    rowKey: (row: T) => string;
    labelHeader: string;
    label: (row: T) => ReactNode;
    labelText: (row: T) => string;
    columns: BreakdownColumn<T>[];
    /** Heat bar colour (metric family) and value (defaults to the first column). */
    heatMetric: MetricKey | 'neutral';
    onRowClick?: (row: T) => void;
    isSelected?: (row: T) => boolean;
    limit?: number | null;
    defaultSort?: SortState;
    rowTitle?: string;
}

function BreakdownTable<T>({ rows, rowKey, labelHeader, label, labelText, columns, heatMetric, onRowClick, isSelected, limit = TABLE_ROW_LIMIT, defaultSort = null, rowTitle }: BreakdownTableProps<T>) {
    const [sort, setSort] = useState<SortState>(defaultSort);
    const sorted = useMemo(() => {
        if (!sort) return rows;
        const mult = sort.dir === 'desc' ? -1 : 1;
        if (sort.key === '__label') {
            const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
            return [...rows].sort((a, b) => collator.compare(labelText(a), labelText(b)) * mult);
        }
        const col = columns.find((c) => c.key === sort.key);
        if (!col) return rows;
        return [...rows].sort((a, b) => (col.value(a) - col.value(b)) * mult);
    }, [rows, sort, columns, labelText]);
    const visible = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
    const heatValue = columns[0]?.value;
    const max = Math.max(1, ...visible.map((r) => heatValue?.(r) ?? 0));
    const heat = heatMetric === 'neutral' ? 'heatbar-neutral' : METRIC_DEFS[heatMetric].heatbar;
    // Phones lay out only the columns they show (desktopOnly ones are hidden there), so a page title gets the room.
    const phoneCols = columns.filter((c) => !c.desktopOnly).length;
    const grid = cn(
        'grid items-center gap-3 px-4',
        phoneCols <= 1 ? 'grid-cols-[minmax(0,1fr)_72px]' : 'grid-cols-[minmax(0,1fr)_64px_64px]',
        columns.length >= 3 && 'md:grid-cols-[minmax(0,1fr)_72px_72px_84px]',
        columns.length === 2 && 'md:grid-cols-[minmax(0,1fr)_72px_72px]',
    );

    const toggle = (key: string) => {
        setSort((s) => {
            if (!s || s.key !== key) return { key, dir: key === '__label' ? 'asc' : 'desc' };
            if (s.dir === (key === '__label' ? 'asc' : 'desc')) return { key, dir: key === '__label' ? 'desc' : 'asc' };
            return null;
        });
    };
    const sortIcon = (key: string) => {
        const Icon = sort?.key === key ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
        return <Icon aria-hidden size={12} className={sort?.key === key ? 'text-fg' : 'text-fg-faint'} />;
    };
    const ariaSort = (key: string) => (sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined);

    return (
        <div role="table" aria-label={labelHeader} className="text-body-sm">
            <div role="row" className={cn(grid, 'h-9 border-b border-border-subtle text-meta font-medium text-fg-muted')}>
                <span role="columnheader" aria-sort={ariaSort('__label')}>
                    <button type="button" onClick={() => toggle('__label')} className="tap-area inline-flex items-center gap-1 hover:text-fg">
                        {labelHeader}{sortIcon('__label')}
                    </button>
                </span>
                {columns.map((c) => (
                    <span key={c.key} role="columnheader" aria-sort={ariaSort(c.key)} className={cn('text-right', c.desktopOnly && 'max-md:hidden')}>
                        <button type="button" onClick={() => toggle(c.key)} className="tap-area ml-auto inline-flex items-center gap-1 hover:text-fg">
                            {c.header}{sortIcon(c.key)}
                        </button>
                    </span>
                ))}
            </div>
            <div role="rowgroup">
                {visible.map((row) => {
                    const selected = isSelected?.(row) ?? false;
                    const pct = heatValue ? (heatValue(row) / max) * 100 : 0;
                    const content = (
                        <>
                            <span role="cell" className="relative flex h-7 min-w-0 items-center">
                                <span aria-hidden className={cn('absolute inset-y-0 left-0 rounded-md', heat)} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                                <span className="relative flex min-w-0 items-center gap-2 px-2">{label(row)}</span>
                            </span>
                            {columns.map((c) => (
                                <span
                                    key={c.key}
                                    role="cell"
                                    title={c.format ? undefined : fmtFull(c.value(row))}
                                    className={cn('min-w-0 truncate text-right text-fg tabular-nums', c.desktopOnly && 'max-md:hidden')}
                                >
                                    {c.format ? c.format(row) : fmtCell(c.value(row))}
                                </span>
                            ))}
                        </>
                    );
                    return onRowClick ? (
                        <div
                            key={rowKey(row)}
                            role="row"
                            tabIndex={0}
                            aria-selected={selected}
                            title={rowTitle}
                            onClick={() => onRowClick(row)}
                            onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onRowClick(row);
                                }
                            }}
                            className={cn(grid, 'h-9 cursor-pointer transition-colors duration-120 focus-visible:-outline-offset-2', selected ? 'bg-brand-soft' : 'hover:bg-subtle')}
                        >
                            {content}
                        </div>
                    ) : (
                        <div key={rowKey(row)} role="row" className={cn(grid, 'h-9')}>{content}</div>
                    );
                })}
            </div>
        </div>
    );
}

function RowLabel({ icon, prefix, text, hint, trailing }: { icon?: ReactNode; prefix?: string | null; text: string; hint?: string; trailing?: ReactNode }) {
    return (
        <>
            {icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
            {prefix ? <span className="max-w-[40%] shrink-0 truncate text-fg-muted">{prefix} /</span> : null}
            <span className="truncate text-fg" title={hint}>{text}</span>
            {trailing}
        </>
    );
}

/* ─── Charts ─── */

/** Bounce rate arrives as 35.2 (a percent number): a plain round axis; the tick formatter adds the %. */
const AXIS_FORMAT: Record<OverviewFormat, AxisFormat> = { count: 'count', percent: 'number', duration: 'duration', decimal: 'number' };

/** Width of an element (ResizeObserver), so date ticks thin to fit. */
function useBoxWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [el, setEl] = useState<T | null>(null);
    const [w, setW] = useState(0);
    useEffect(() => {
        if (!el) return;
        // A ResizeObserver reports the first size right after observe().
        const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [setEl, w];
}

function OverviewChart({ data, metric, interval, height = 260 }: { data: StatsSeriesPoint[]; metric: OverviewMetric; interval: string; height?: number }) {
    const color = METRIC_DEFS[metric.family].color;
    const gradientId = `ov-fill-${metric.key}`;
    const rows = useMemo(
        () => data.map((p) => ({ date: String(p.date), value: seriesValue(p, metric.key), prev: seriesValue(p, `prev_${metric.key}`) })),
        [data, metric.key],
    );
    const yFmt = (v: number) => (metric.format === 'count' ? fmtAxis(v) : metric.format === 'decimal' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : fmtOverview(metric.format, v, { compact: true }));
    // The app's axis rules (components/charts/axis.ts, round 4 audit #6): round steps (0 / 1K / 2K / 3K)
    // and evenly spaced dates anchored on the last day, thinned to the plot width.
    const [figRef, figW] = useBoxWidth<HTMLElement>();
    const y = useMemo(() => niceAxis(maxOf(rows, ['value', 'prev']), { format: AXIS_FORMAT[metric.format] }), [rows, metric.format]);
    const dates = useMemo(() => rows.map((r) => r.date), [rows]);
    const xTicks = useMemo(() => dateTicks(dates, { width: (figW || 640) - 60 }), [dates, figW]);
    const xTick = useMemo(() => {
        const sameDay = interval === 'hour' && dates.length > 1 && dates[0].slice(0, 10) === dates[dates.length - 1].slice(0, 10);
        const days = makeDateTickFormatter(dates);
        const format = sameDay ? (v: string) => formatDateLabel(v, 'hour') : interval === 'month' ? (v: string) => formatDateLabel(v, 'month') : (v: string, i: number) => days(v, i);
        return dateAxisTick({ first: dates[0], last: dates[dates.length - 1], ticks: xTicks, format });
    }, [dates, xTicks, interval]);

    const renderTooltip = (props: TooltipContentProps<number, string>) => {
        if (!props.active || !props.payload?.length) return null;
        const row = props.payload[0]?.payload as { date: string; value: number; prev: number } | undefined;
        if (!row) return null;
        const tRows: ChartTooltipRow[] = [
            {
                key: 'cur',
                label: 'This period',
                color,
                value: fmtOverview(metric.format, row.value),
                delta: (
                    <MetricDelta
                        current={toDisplayValue(metric.format, row.value)}
                        previous={toDisplayValue(metric.format, row.prev)}
                        format={deltaFormat(metric.format)}
                        better={metric.better}
                    />
                ),
            },
            { key: 'prev', label: 'Previous period', color, dashed: true, value: fmtOverview(metric.format, row.prev) },
        ];
        return <ChartTooltipCard title={formatDateLabel(row.date, interval, true)} rows={tRows} />;
    };

    return (
        <figure
            ref={figRef}
            aria-label={`${metric.label} over time, compared with the previous period`}
            className="relative m-0 h-[var(--ov-h)] max-md:h-[min(var(--ov-h),220px)]"
            style={{ ['--ov-h' as string]: `${height}px` }}
        >
            <ComposedChart responsive data={rows} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} style={{ stopOpacity: 'var(--tc-chart-fill-top)' }} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="date" ticks={xTicks} interval={0} tick={xTick} tickLine={false} axisLine={AXIS_LINE} tickMargin={8} />
                <YAxis width={44} domain={y.domain} ticks={y.ticks} interval={0} tickFormatter={yFmt} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <RTooltip content={renderTooltip} cursor={CURSOR} isAnimationActive={false} offset={12} />
                <Line dataKey="prev" type="monotone" stroke={color} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.5} dot={false} activeDot={false} isAnimationActive={false} name="Previous period" />
                <Area dataKey="value" type="monotone" stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} activeDot={false} tooltipType="none" />
                <Line
                    dataKey="value"
                    type="monotone"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={rows.length === 1 ? { r: 3, fill: color, strokeWidth: 0 } : false}
                    activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                    name={metric.label}
                />
            </ComposedChart>
        </figure>
    );
}

/** Top items over time (the table's "Chart" view): top 5 lines in categorical colours. */
function BreakdownLineChart({ items, interval, metric = 'sessions', column }: {
    items: TopGenericSeriesResponse['items'];
    interval: string;
    metric?: 'sessions' | 'pageviews';
    column: string;
}) {
    const top = useMemo(() => items.slice(0, MAX_CHART_SERIES), [items]);
    const keyOf = (item: GenericItem) => (item.prefix ? `${item.prefix}:${item.name}` : item.name);
    const data = useMemo(() => {
        const dates = new Set<string>();
        top.forEach((item) => item.data.forEach((p) => dates.add(p.date)));
        return Array.from(dates).sort().map((date) => {
            const row: Record<string, string | number> = { date };
            top.forEach((item) => {
                const point = item.data.find((p) => p.date === date);
                row[keyOf(item)] = metric === 'pageviews' ? point?.pageviews || 0 : point?.sessions || 0;
            });
            return row;
        });
    }, [top, metric]);

    const [boxRef, boxW] = useBoxWidth<HTMLDivElement>();
    const xTicks = useMemo(() => dateTicks(data.map((r) => String(r.date)), { width: (boxW || 640) - 80 }), [data, boxW]);
    const yAxis = useMemo(() => niceAxis(maxOf(data, top.map(keyOf)), { format: 'count' }), [data, top]);

    const renderTooltip = (props: TooltipContentProps<number, string>) => {
        if (!props.active || !props.payload?.length) return null;
        const rows: ChartTooltipRow[] = props.payload.map((p, i) => ({
            key: String(p.dataKey ?? i),
            label: <span className="block max-w-[180px] truncate">{formatValueLabel(column, String(p.name).split(':').join(' / '))}</span>,
            color: String(p.color),
            value: fmtFull(Number(p.value || 0)),
        }));
        return <ChartTooltipCard title={formatDateLabel(String(props.label ?? ''), interval, true)} rows={rows} />;
    };

    return (
        <div ref={boxRef} className="p-4">
            <figure aria-label={`Top ${top.length} over time`} className="m-0 h-[280px] max-md:h-[220px]">
                <LineChart responsive data={data} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                    <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={(v) => formatDateLabel(String(v), interval)} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} tickMargin={8} />
                    <YAxis width={40} domain={yAxis.domain} ticks={yAxis.ticks} interval={0} tickFormatter={(v: number) => fmtAxis(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <RTooltip content={renderTooltip} cursor={{ stroke: 'var(--color-chart-cursor)', strokeWidth: 1 }} isAnimationActive={false} offset={12} />
                    {top.map((item, i) => (
                        <Line key={keyOf(item)} type="monotone" dataKey={keyOf(item)} name={keyOf(item)} stroke={categoricalColor(i)} strokeWidth={2} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />
                    ))}
                </LineChart>
            </figure>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta text-fg-secondary">
                {top.map((item, i) => (
                    <li key={keyOf(item)} className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: categoricalColor(i) }} />
                        <span className="max-w-[200px] truncate">{item.prefix ? `${formatValueLabel(column, item.prefix)} / ` : ''}{formatValueLabel(column, item.name)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ─── Metrics section ─── */

/**
 * Live tile: the same visitors-right-now number as the header pill (round 4 audit #6: it used to
 * show sessions in the last 30 minutes next to a different "live now"), with sessions per minute
 * as the bars underneath.
 */
function LiveTile({ data, total }: { data?: LiveOverviewResponse; total: number }) {
    const hasBreakdown = hasLiveBreakdown(data);
    const bars = useMemo(() => (hasBreakdown ? aggregateLiveBars(data.minuteCounts) : []), [data, hasBreakdown]);
    const max = Math.max(1, ...bars.map((b) => b.sessionCount));
    const topReferrers = hasBreakdown ? data.referrers.slice(0, 2) : [];
    return (
        <div className="flex min-h-[132px] flex-col p-4">
            <span className="flex items-center gap-2">
                <LiveDot active={total > 0} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">Visitors right now</span>
            </span>
            <span className="mt-1 block text-stat text-fg tabular-nums">{fmtCompact(total)}</span>
            {topReferrers.length ? (
                <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted">
                    {topReferrers.map((r) => (
                        <span key={r.referrer} className="inline-flex min-w-0 items-center gap-1">
                            <OverviewValueIcon column="referrer_name" value={r.referrer} />
                            <span className="max-w-[90px] truncate">{formatValueLabel('referrer_name', r.referrer)}</span>
                            <span className="tabular-nums">{fmtCompact(r.count)}</span>
                        </span>
                    ))}
                </span>
            ) : null}
            {bars.length ? (
                <div className="mt-auto flex h-7 items-end gap-0.5 pt-2" aria-hidden title="Sessions per minute, last 30 minutes">
                    {bars.map((b, i) => (
                        <span
                            key={i}
                            title={`${b.time}: ${b.sessionCount} sessions`}
                            className="min-h-0.5 flex-1 rounded-[2px]"
                            style={{ height: `${Math.max(8, (b.sessionCount / max) * 100)}%`, background: 'var(--color-m-sessions)', opacity: 0.35 + (0.65 * (i + 1)) / bars.length }}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function OverviewMetrics({ liveData, liveVisitors }: { liveData?: LiveOverviewResponse; liveVisitors: number }) {
    const runtime = useOverviewRuntime();
    const { range, interval, metric, setMetric, startDate, endDate, filters, eventNames } = useShareOverviewState();
    const pageScoped = hasPageScopedFilter(filters);

    const statsQuery = useQuery<StatsResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'stats', range, interval, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'stats', {
            filters,
            events: eventNames,
            extra: { range, overrideInterval: interval, start: startDate || undefined, end: endDate || undefined },
        })),
        placeholderData: keepPreviousData,
        staleTime: OVERVIEW_QUERY_STALE_MS,
    });

    const selectedIndex = OVERVIEW_METRICS[metric] ? metric : 0;
    const selected = OVERVIEW_METRICS[selectedIndex];
    const data = useMemo(() => statsQuery.data?.series ?? [], [statsQuery.data?.series]);
    const loading = statsQuery.isLoading && !statsQuery.data;
    const refetching = statsQuery.isFetching && !loading;

    return (
        <Card as="section" padding="none" className="overflow-hidden md:col-span-2" aria-label="Key metrics">
            <div role="tablist" aria-label="Metrics" className="grid grid-cols-2 md:grid-cols-4">
                {OVERVIEW_METRICS.map((m, i) => {
                    const active = i === selectedIndex;
                    const color = METRIC_DEFS[m.family].color;
                    const current = statsQuery.data?.metrics[m.key] ?? null;
                    const previous = statsQuery.data?.metrics[`prev_${m.key}`] ?? null;
                    return (
                        <button
                            key={m.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setMetric(i)}
                            className={cn(
                                'relative flex min-h-[132px] min-w-0 flex-col border-b border-border-subtle p-4 text-left',
                                'transition-colors duration-120 ease-standard focus-visible:-outline-offset-2',
                                // Right borders: 2 columns on phones, 4 from md (no conflicting utilities).
                                i % 2 === 0 ? 'border-r' : i % 4 === 1 ? 'md:border-r' : '',
                                active ? 'bg-surface-sunken' : 'hover:bg-subtle/60',
                            )}
                        >
                            <span className="flex items-center gap-2">
                                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                                <span className="truncate text-body-sm font-medium text-fg-secondary">{m.label}</span>
                            </span>
                            {loading ? (
                                <>
                                    <Skeleton className="mt-2 h-7 w-20" />
                                    <Skeleton className="mt-1.5 h-3.5 w-12" />
                                </>
                            ) : (
                                <>
                                    <span className={cn('mt-1 block min-w-0 truncate text-stat tabular-nums text-fg', refetching && 'opacity-60')}>{fmtOverview(m.format, current, { compact: true })}</span>
                                    <span className="mt-0.5 block">
                                        <MetricDelta
                                            current={current === null ? null : toDisplayValue(m.format, current)}
                                            previous={previous === null ? null : toDisplayValue(m.format, previous)}
                                            format={deltaFormat(m.format)}
                                            better={m.better}
                                            comparisonLabel="versus the previous period"
                                        />
                                    </span>
                                </>
                            )}
                            {data.length > 1 ? (
                                <span className="mt-auto block pt-2">
                                    <Sparkline series={[{ metric: m.family, values: data.map((p) => seriesValue(p, m.key)) }]} height={28} interactive={false} />
                                </span>
                            ) : null}
                            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: color }} /> : null}
                        </button>
                    );
                })}
                <div className="border-b border-border-subtle">
                    <LiveTile data={liveData} total={liveVisitors} />
                </div>
            </div>
            <div role="tabpanel" className="p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-title-sm text-fg">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: METRIC_DEFS[selected.family].color }} />
                        {selected.label}
                    </span>
                    <span className={cn('text-meta', pageScoped ? 'text-warn' : 'text-fg-muted')}>
                        {pageScoped
                            ? 'Page filters are on: some session numbers are limited'
                            : `${getRangeLabel(range)}, compared with the previous period`}
                    </span>
                </div>
                {loading ? (
                    <Skeleton className="h-[260px] w-full max-md:h-[220px]" />
                ) : statsQuery.error && !statsQuery.data ? (
                    <EmptyState variant="inline" icon={AlertTriangle} title="Could not load the chart" description={statsQuery.error.message} />
                ) : !data.length ? (
                    <EmptyState variant="inline" title="No data in this period" description="Try a longer range." />
                ) : (
                    <div className={cn('transition-opacity duration-120', refetching && 'opacity-60')}>
                        <OverviewChart data={data} metric={selected} interval={interval} />
                    </div>
                )}
            </div>
        </Card>
    );
}

/* ─── Generic breakdown widget (sources, devices, geo) ─── */

function useGenericBreakdown(column: string, enabledChart: boolean) {
    const runtime = useOverviewRuntime();
    const { range, interval, startDate, endDate, filters, eventNames } = useShareOverviewState();
    const query = useQuery<TopGenericResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'top-generic', column, range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic', {
            filters,
            events: eventNames,
            extra: { column, range, start: startDate || undefined, end: endDate || undefined },
        })),
    });
    const seriesQuery = useQuery<TopGenericSeriesResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'top-generic-series', column, range, interval, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic-series', {
            filters,
            events: eventNames,
            extra: { column, range, overrideInterval: interval, start: startDate || undefined, end: endDate || undefined },
        })),
        enabled: enabledChart,
    });
    return { query, seriesQuery, interval };
}

function GenericBreakdownWidget<T extends string>({ tabs, tab, setTab, title, onRowClick, renderIcon, footerNote }: {
    tabs: Array<{ value: T; label: string }>;
    tab: T;
    setTab: (value: T) => void;
    title: string;
    onRowClick: (row: GenericItem) => void;
    renderIcon: (row: GenericItem) => ReactNode;
    footerNote?: string;
}) {
    const { view, hasFilter } = useShareOverviewState();
    const [search, setSearch] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const { query, seriesQuery, interval } = useGenericBreakdown(tab, view === 'chart');
    const primary = query.data?.primaryMetric || 'sessions';
    const secondary = primary === 'pageviews' ? 'sessions' : 'pageviews';
    const supported = query.data?.supported !== false;

    const rows = useMemo(
        () => (query.data?.items || []).filter((item) => matchesSearch(`${item.prefix || ''} ${item.name} ${formatValueLabel(tab, item.name)}`, search)),
        [query.data?.items, search, tab],
    );
    const chartItems = useMemo(
        () => (seriesQuery.data?.items || []).filter((item) => matchesSearch(`${item.prefix || ''} ${item.name}`, search)),
        [seriesQuery.data?.items, search],
    );
    const showRevenue = rows.some((row) => Number(row.revenue || 0) > 0);
    const tabLabel = tabs.find((t) => t.value === tab)?.label ?? title;
    const columns: BreakdownColumn<GenericItem>[] = [
        { key: 'primary', header: primary === 'pageviews' ? 'Pageviews' : 'Sessions', value: (r) => Number(r[primary] || 0) },
        { key: 'secondary', header: secondary === 'pageviews' ? 'Pageviews' : 'Sessions', value: (r) => Number(r[secondary] || 0) },
        ...(showRevenue ? [{
            key: 'revenue', header: 'Revenue', desktopOnly: true, value: (r: GenericItem) => Number(r.revenue || 0),
            format: (r: GenericItem) => (r.revenue ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(r.revenue) : '–'),
        }] : []),
    ];
    const table = (limit: number | null) => (
        <BreakdownTable
            rows={rows}
            rowKey={(r) => `${r.prefix || ''}-${r.name}`}
            labelHeader={FILTER_LABELS[tab] || tabLabel}
            label={(r) => (
                <RowLabel
                    icon={renderIcon(r)}
                    prefix={r.prefix ? formatValueLabel(tab, r.prefix) : null}
                    text={formatValueLabel(tab, r.name)}
                />
            )}
            labelText={(r) => (r.prefix ? `${formatValueLabel(tab, r.prefix)} / ${formatValueLabel(tab, r.name)}` : formatValueLabel(tab, r.name))}
            columns={columns}
            heatMetric={primary === 'pageviews' ? 'pageviews' : 'sessions'}
            onRowClick={supported ? onRowClick : undefined}
            isSelected={(r) => hasFilter(tab as ShareOverviewFilter['name'], r.name)}
            limit={limit}
            rowTitle="Filter by this"
        />
    );

    const chartView = view === 'chart' && supported;
    return (
        <>
            <Panel
                tabs={tabs}
                tab={tab}
                onTab={(v) => setTab(v as T)}
                search={search}
                onSearch={setSearch}
                searchLabel={tabLabel}
                footer={(
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)} disabled={!rows.length}>View all</Button>
                        {!supported ? <span className="text-meta text-fg-muted">Limited for this property</span> : footerNote ? <span className="text-meta text-fg-muted max-md:hidden">{footerNote}</span> : null}
                        <span className="ml-auto"><ViewToggle disabled={!supported} /></span>
                    </>
                )}
            >
                <PanelState
                    loading={chartView ? seriesQuery.isLoading && !seriesQuery.data : query.isLoading && !query.data}
                    error={(chartView ? seriesQuery.error : query.error) || null}
                    empty={chartView ? !chartItems.length : !rows.length}
                >
                    {chartView ? <BreakdownLineChart items={chartItems} interval={interval} metric={primary} column={tab} /> : table(TABLE_ROW_LIMIT)}
                </PanelState>
            </Panel>
            <Drawer open={detailsOpen} onOpenChange={setDetailsOpen} width="wide" title={`${title}: ${tabLabel.toLowerCase()}`} subtitle="Same range and filters as the page. Select a row to filter by it.">
                {table(null)}
            </Drawer>
        </>
    );
}

function TopSourcesWidget() {
    const { sourcesTab, setSourcesTab, addFilter } = useShareOverviewState();
    return (
        <GenericBreakdownWidget
            title="Sources"
            tabs={SOURCES_TABS}
            tab={sourcesTab}
            setTab={setSourcesTab}
            onRowClick={(row) => addFilter(sourcesTab, row.name)}
            renderIcon={(row) => <OverviewValueIcon column={sourcesTab} value={row.prefix || row.name} />}
        />
    );
}

function TopDevicesWidget() {
    const { techTab, setTechTab, addFilter } = useShareOverviewState();
    return (
        <GenericBreakdownWidget
            title="Devices"
            tabs={TECH_TABS}
            tab={techTab}
            setTab={setTechTab}
            onRowClick={(row) => addFilter(techTab, row.name)}
            renderIcon={(row) => <OverviewValueIcon column={techTab} value={row.prefix || row.name} />}
        />
    );
}

function TopGeoTableWidget() {
    const { geoTab, setGeoTab, addFilter } = useShareOverviewState();
    return (
        <GenericBreakdownWidget
            title="Locations"
            tabs={GEO_TABS}
            tab={geoTab}
            setTab={setGeoTab}
            onRowClick={(row) => {
                addFilter(geoTab, row.name);
                if (geoTab === 'country') setGeoTab('region');
                else if (geoTab === 'region') setGeoTab('city');
            }}
            renderIcon={(row) => <OverviewCountryFlag country={row.prefix || row.name} />}
        />
    );
}

/* ─── Pages ─── */

type PageRow = TopPagesResponse['items'][number];

function TopPagesWidget() {
    const runtime = useOverviewRuntime();
    const { range, startDate, endDate, filters, eventNames, addFilter, hasFilter, pagesTab, setPagesTab, showDomain, setShowDomain } = useShareOverviewState();
    const [search, setSearch] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);

    const query = useQuery<TopPagesResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'top-pages', pagesTab, range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-pages', {
            filters,
            events: eventNames,
            extra: { mode: pagesTab, range, start: startDate || undefined, end: endDate || undefined },
        })),
    });

    const rows = useMemo(
        () => (query.data?.items || []).filter((item) => matchesSearch(`${item.path} ${item.title}`, search)),
        [query.data?.items, search],
    );
    const showRevenue = rows.some((item) => Number(item.revenue || 0) > 0);
    const filterName = pagesTab === 'page' ? 'path' : pagesTab === 'entry' ? 'entry_path' : 'exit_path';
    const tabLabel = PAGES_TABS.find((t) => t.value === pagesTab)?.label ?? 'Pages';
    const hasOrigin = (row: PageRow) => Boolean(row.origin && row.origin !== '(not set)');
    const columns: BreakdownColumn<PageRow>[] = [
        { key: 'primary', header: pagesTab === 'page' ? 'Views' : pagesTab === 'entry' ? 'Entries' : 'Exits', value: (r) => (pagesTab === 'page' ? r.pageviews : r.sessions) },
        // Phones show one number per page, so the title is readable (it was cut at about 15 characters).
        pagesTab === 'page'
            ? { key: 'secondary', header: 'Sessions', desktopOnly: true, value: (r) => r.sessions }
            : { key: 'secondary', header: 'Bounce', desktopOnly: true, value: (r) => r.bounceRate, format: (r) => fmtPercent(r.bounceRate / 100) },
        ...(showRevenue ? [{
            key: 'revenue', header: 'Revenue', desktopOnly: true, value: (r: PageRow) => Number(r.revenue || 0),
            format: (r: PageRow) => (r.revenue ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(r.revenue) : '–'),
        }] : []),
    ];
    const table = (limit: number | null) => (
        <BreakdownTable
            rows={rows}
            rowKey={(r) => `${pagesTab}:${r.origin}:${r.path}`}
            labelHeader="Page"
            label={(r) => {
                const href = buildPageHref(r.origin, r.path, runtime.siteUrl);
                return (
                    <RowLabel
                        icon={<OverviewValueIcon column="origin" value={hasOrigin(r) ? r.origin : r.path} />}
                        prefix={showDomain && hasOrigin(r) ? formatValueLabel('origin', r.origin) : null}
                        text={r.path}
                        trailing={href.startsWith('http') ? (
                            <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Open ${r.path}`}
                                className="shrink-0 text-fg-faint hover:text-fg"
                            >
                                <ExternalLink aria-hidden size={12} strokeWidth={1.75} />
                            </a>
                        ) : null}
                    />
                );
            }}
            labelText={(r) => r.path}
            columns={columns}
            heatMetric="pageviews"
            onRowClick={(r) => {
                addFilter(filterName, r.path);
                if (hasOrigin(r)) addFilter('origin', r.origin);
            }}
            isSelected={(r) => hasFilter(filterName, r.path) && (!hasOrigin(r) || hasFilter('origin', r.origin))}
            limit={limit}
            defaultSort={{ key: 'primary', dir: 'desc' }}
            rowTitle="Filter by this page"
        />
    );

    return (
        <>
            <Panel
                tabs={PAGES_TABS}
                tab={pagesTab}
                onTab={(v) => setPagesTab(v as ShareOverviewPagesTab)}
                search={search}
                onSearch={setSearch}
                searchLabel={tabLabel}
                footer={(
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)} disabled={!rows.length}>View all</Button>
                        <Button variant="ghost" size="sm" className="ml-auto" aria-pressed={showDomain} onClick={() => setShowDomain(!showDomain)}>
                            {showDomain ? 'Hide domain' : 'Show domain'}
                        </Button>
                    </>
                )}
            >
                <PanelState loading={query.isLoading && !query.data} error={query.error || null} empty={!rows.length}>
                    {table(TABLE_ROW_LIMIT)}
                </PanelState>
            </Panel>
            <Drawer open={detailsOpen} onOpenChange={setDetailsOpen} width="wide" title={tabLabel} subtitle="Same range and filters as the page. Select a row to filter by it.">
                {table(null)}
            </Drawer>
        </>
    );
}

/* ─── Events ─── */

type EventRow = TopEventsResponse['events'][number];

function TopEventsWidget({ token }: { token: string }) {
    const router = useRouter();
    const { range, startDate, endDate, filters, eventNames, eventTab, setEventTab } = useShareOverviewState();
    const [search, setSearch] = useState('');

    const query = useQuery<TopEventsResponse, Error>({
        queryKey: ['share-overview', token, 'top-events', range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(`/api/share/${token}/overview/top-events?${buildSearch({
            filters,
            events: eventNames,
            extra: { range, start: startDate || undefined, end: endDate || undefined },
        })}`),
    });

    const items = useMemo(() => {
        if (!query.data) return [];
        if (eventTab === 'conversions') return query.data.conversions;
        if (eventTab === 'link_out') return query.data.linkOut;
        return query.data.events;
    }, [eventTab, query.data]);
    const rows = useMemo(() => items.filter((item) => matchesSearch(item.name, search)), [items, search]);
    const unsupported =
        (eventTab === 'conversions' && query.data?.supported.conversions === false)
        || (eventTab === 'link_out' && query.data?.supported.linkOut === false);
    const tabLabel = EVENT_TABS.find((t) => t.value === eventTab)?.label ?? 'Events';

    function openEventReport(eventName?: string) {
        const nextEvents = eventName ? Array.from(new Set([...eventNames, eventName])) : eventNames;
        const search = buildSearch({
            filters,
            events: nextEvents,
            extra: { range, start: startDate || undefined, end: endDate || undefined, ev: eventTab },
        });
        router.push(`/share/${token}/events${search ? `?${search}` : ''}`);
    }

    return (
        <Panel
            tabs={EVENT_TABS.map((t) => ({
                ...t,
                disabled: (t.value === 'conversions' && query.data?.supported.conversions === false) || (t.value === 'link_out' && query.data?.supported.linkOut === false),
            }))}
            tab={eventTab}
            onTab={(v) => setEventTab(v as ShareOverviewEventTab)}
            search={search}
            onSearch={setSearch}
            searchLabel={tabLabel}
            footer={(
                <>
                    <Button variant="ghost" size="sm" onClick={() => openEventReport()} disabled={!rows.length}>Event report</Button>
                    <span className="text-meta text-fg-muted max-md:hidden">
                        {unsupported ? `${tabLabel} are not available for this property` : 'Select an event to open its report'}
                    </span>
                </>
            )}
        >
            <PanelState
                loading={query.isLoading && !query.data}
                error={query.error || null}
                empty={!rows.length}
                emptyText={unsupported ? `${tabLabel} are not available for this property` : 'No events in this period'}
            >
                <BreakdownTable<EventRow>
                    rows={rows}
                    rowKey={(r) => r.id}
                    labelHeader={eventTab === 'events' ? 'Event' : eventTab === 'conversions' ? 'Key event' : 'Link'}
                    label={(r) => (
                        <RowLabel
                            icon={<OverviewValueIcon column={eventTab === 'link_out' ? 'link_out' : eventTab === 'conversions' ? 'conversions' : 'event'} value={r.name} />}
                            // Readable names for clients ("Page view"); the GA4 name shows on hover. Links stay URLs.
                            text={eventTab === 'link_out' ? r.name : eventDisplayName(r.name)}
                            hint={eventTab === 'link_out' ? undefined : r.name}
                        />
                    )}
                    labelText={(r) => (eventTab === 'link_out' ? r.name : `${eventDisplayName(r.name)} ${r.name}`)}
                    columns={[{ key: 'count', header: 'Count', value: (r) => r.count }]}
                    heatMetric="conversions"
                    onRowClick={(r) => openEventReport(r.name)}
                    isSelected={(r) => eventNames.includes(r.name)}
                    defaultSort={{ key: 'count', dir: 'desc' }}
                    rowTitle="Open the event report"
                />
            </PanelState>
        </Panel>
    );
}

/* ─── Realtime map ─── */

function RealtimeWidget({ liveData, loading, error }: { liveData?: LiveResponse; loading: boolean; error: Error | null }) {
    const { addFilter, setGeoTab, getFilterValues } = useShareOverviewState();
    const byCountry = useMemo(() => (liveData?.byCountry || []).filter((r) => r.country && r.users > 0), [liveData]);
    const byCity = useMemo(() => (liveData?.byCity || []).filter((r) => r.city && r.country && r.users > 0), [liveData]);
    const topReferrers = (liveData?.referrers || []).slice(0, 4);
    const topPages = (liveData?.byPage || []).slice(0, 5);
    const activeCountry = getFilterValues('country')[0] || null;
    const activeUsers = liveData?.activeUsers || 0;

    function onBubble(name: string, type: 'country' | 'city') {
        if (type === 'city') {
            addFilter('city', name);
            setGeoTab('city');
            return;
        }
        addFilter('country', name);
        setGeoTab('region');
    }

    return (
        <Card as="section" padding="none" className="flex min-w-0 flex-col overflow-hidden" aria-label="Realtime">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                <h2 className="text-title-sm text-fg">Realtime</h2>
                <span className="inline-flex items-center gap-2 text-body-sm text-fg-secondary">
                    <LiveDot active={activeUsers > 0} />
                    <span className="font-medium text-fg tabular-nums">{fmtFull(activeUsers)}</span> visitors now
                </span>
            </div>
            {loading && !liveData ? (
                <Skeleton className="m-4 h-[260px]" />
            ) : error && !liveData ? (
                <EmptyState variant="inline" icon={AlertTriangle} title="Could not load realtime data" description={error.message} />
            ) : !byCountry.length && !byCity.length ? (
                <EmptyState variant="card" title="Nobody on the site right now" description="Visitors from the last 30 minutes show up here." />
            ) : (
                <>
                    <div className="h-[260px] border-b border-border-subtle max-md:h-[200px]">
                        <WorldMap byCountry={byCountry} byCity={byCity} activeCountry={activeCountry} onBubbleClick={onBubble} />
                    </div>
                    <div className="grid gap-4 p-4 text-body-sm grid-cols-1 sm:grid-cols-2">
                        <div className="min-w-0 space-y-3">
                            {topReferrers.length ? (
                                <div>
                                    <p className="mb-1.5 text-meta font-medium text-fg-muted">Referrers</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {topReferrers.map((r) => (
                                            <span key={r.referrer} className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-subtle px-2.5 text-meta text-fg-secondary">
                                                <OverviewValueIcon column="referrer_name" value={r.referrer} />
                                                <span className="truncate">{formatValueLabel('referrer_name', r.referrer)}</span>
                                                <span className="text-fg-muted tabular-nums">{fmtCompact(r.count)}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {byCountry.length ? (
                                <div>
                                    <p className="mb-1.5 text-meta font-medium text-fg-muted">Countries</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {byCountry.slice(0, 4).map((c) => (
                                            <button
                                                key={c.country}
                                                type="button"
                                                onClick={() => onBubble(c.country, 'country')}
                                                className="tap-area inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-subtle px-2.5 text-meta text-fg-secondary hover:bg-subtle-strong"
                                            >
                                                <OverviewCountryFlag country={c.country} />
                                                <span className="truncate">{c.country}</span>
                                                <span className="text-fg-muted tabular-nums">{fmtCompact(c.users)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        {topPages.length ? (
                            <div className="min-w-0">
                                <p className="mb-1.5 text-meta font-medium text-fg-muted">Active pages</p>
                                <ul className="flex flex-col gap-1">
                                    {topPages.map((p) => (
                                        <li key={p.page} className="flex min-w-0 items-center justify-between gap-3">
                                            <span className="truncate text-fg">{p.page || '/'}</span>
                                            <span className="shrink-0 text-fg-muted tabular-nums">{fmtFull(p.users)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                </>
            )}
        </Card>
    );
}

/* ─── Filter chips ─── */

function ActiveFilters() {
    const { filters, setFilters, removeFilter, eventNames, removeEventName, setEventNames } = useShareOverviewState();
    const chips = [
        ...filters.flatMap((f) => f.value.map((value) => ({
            key: `${f.name}:${value}`,
            label: `${FILTER_LABELS[f.name] || f.name} ${f.operator === 'isNot' ? 'is not' : f.operator === 'contains' ? 'contains' : 'is'}`,
            value: formatValueLabel(f.name, value),
            remove: () => removeFilter(f.name, value),
        }))),
        ...eventNames.map((name) => ({ key: `event:${name}`, label: 'Event is', value: name, remove: () => removeEventName(name) })),
    ];
    if (!chips.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
                <span key={c.key} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface pr-1 pl-2.5 text-meta">
                    <span className="text-fg-muted">{c.label}</span>
                    <span className="truncate font-medium text-fg">{c.value}</span>
                    <Tooltip content="Remove filter">
                        <button type="button" onClick={c.remove} aria-label={`Remove filter ${c.label} ${c.value}`} className="flex size-5 items-center justify-center rounded-full text-fg-muted hover:bg-subtle hover:text-fg">
                            <X aria-hidden size={12} />
                        </button>
                    </Tooltip>
                </span>
            ))}
            <Button variant="link" size="sm" onClick={() => { setFilters([]); setEventNames([]); }}>Clear all</Button>
        </div>
    );
}

/* ─── Page ─── */

function ShareOverviewPage() {
    const runtime = useOverviewRuntime();
    const isEmbed = Boolean(runtime.embedMode);
    const searchParams = useSearchParams();
    const { range, setRange, setInterval, setMetric, filters, eventNames, upsertFilter, getFilterValues } = useShareOverviewState();
    const didSeedDefaultsRef = useRef(false);

    const branding = runtime.config?.branding ?? { logoUrl: null, companyName: null, showWatermark: true };
    const sectionOrder: ShareSectionId[] = runtime.config?.sectionOrder?.length ? runtime.config.sectionOrder : DEFAULT_SECTION_ORDER;
    const sectionVisibility = runtime.config?.sectionVisibility ?? null;

    /* Seed the share's defaults (range / interval / metric / filter) once, only when the URL has none. */
    useEffect(() => {
        if (didSeedDefaultsRef.current) return;
        const cfgDefaults = runtime.config?.defaults;
        if (!cfgDefaults) return;
        didSeedDefaultsRef.current = true;

        if (cfgDefaults.range && !searchParams.has('range') && !searchParams.has('start') && !searchParams.has('end')) {
            setRange(cfgDefaults.range as ShareOverviewRange);
        }
        if (cfgDefaults.interval && cfgDefaults.interval !== 'auto' && !searchParams.has('overrideInterval') && !searchParams.has('interval')) {
            setInterval(cfgDefaults.interval);
        }
        if (typeof cfgDefaults.metricIndex === 'number' && cfgDefaults.metricIndex >= 0 && !searchParams.has('metric')) {
            setMetric(cfgDefaults.metricIndex);
        }
        if (cfgDefaults.filter && !searchParams.has('f') && !searchParams.has('filters')) {
            const dim = cfgDefaults.filter.dimension as ShareOverviewFilter['name'];
            if (SHARE_OVERVIEW_FILTER_NAMES.includes(dim) && !getFilterValues(dim).includes(cfgDefaults.filter.value)) {
                upsertFilter({ name: dim, operator: 'is', value: [cfgDefaults.filter.value] });
            }
        }
    }, [runtime.config, searchParams, setRange, setInterval, setMetric, upsertFilter, getFilterValues]);

    const liveQuery = useQuery<LiveOverviewResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'live', filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'live', { filters, events: eventNames })),
        placeholderData: keepPreviousData,
        staleTime: LIVE_DATA_POLL_INTERVAL_MS,
        refetchInterval: LIVE_DATA_POLL_INTERVAL_MS,
    });
    const liveVisitors = useDebouncedLiveValue(liveQuery.data?.activeUsers || 0, 1_000, LIVE_RECONCILE_INTERVAL_MS);

    const renderSection = (id: ShareSectionId) => {
        switch (id) {
            case 'metrics':
                return <OverviewMetrics key={id} liveData={liveQuery.data} liveVisitors={liveVisitors} />;
            case 'sources':
                return <TopSourcesWidget key={id} />;
            case 'geo':
                return <TopGeoTableWidget key={id} />;
            case 'devices':
                return <TopDevicesWidget key={id} />;
            case 'pages':
                return <TopPagesWidget key={id} />;
            case 'events':
                return <TopEventsWidget key={id} token={runtime.queryKey} />;
            case 'liveGeo':
                return (
                    <RealtimeWidget
                        key={id}
                        liveData={hasLiveBreakdown(liveQuery.data) ? liveQuery.data : undefined}
                        loading={liveQuery.isLoading}
                        error={liveQuery.error || null}
                    />
                );
            default:
                return null;
        }
    };
    const isVisible = (id: ShareSectionId) => (sectionVisibility ? sectionVisibility[id] !== false : true);

    const controls = (
        <div className={cn('z-20 border-b border-border-subtle bg-canvas', !isEmbed && 'sticky top-0')}>
            <div className={cn(SHARE_CONTAINER, 'flex flex-col gap-2 py-3')}>
                {isEmbed && !runtime.hideOwnerLogo ? (
                    <div className="flex items-center"><ShareBrand branding={branding} size={20} /></div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                    <DatePicker range={range} setRange={(value) => setRange(value as ShareOverviewRange)} chevrons={false} />
                    <LivePill activeUsers={liveVisitors} />
                </div>
                <ActiveFilters />
            </div>
        </div>
    );

    return (
        <SharePage>
            {isEmbed ? null : <ShareHeader siteUrl={runtime.siteUrl} views={runtime.views} branding={branding} label="Shared analytics" />}
            {controls}
            <main className={cn(SHARE_CONTAINER, 'grid gap-4 py-4 md:grid-cols-2 md:py-6')}>
                {sectionOrder.map((id) => (isVisible(id) ? renderSection(id) : null))}
            </main>
            {branding.showWatermark ? <ShareFooter compact={isEmbed} /> : null}
        </SharePage>
    );
}

export default function SharedOverviewClient({
    token,
    siteUrl,
    views = 0,
    embedMode = false,
    config = null,
    hideOwnerLogo = false,
}: {
    token: string;
    siteUrl?: string;
    views?: number;
    embedMode?: boolean;
    config?: NormalizedShareConfig | null;
    hideOwnerLogo?: boolean;
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: OVERVIEW_QUERY_STALE_MS,
                gcTime: 10 * 60 * 1000,
                placeholderData: keepPreviousData,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    }));
    const runtime = useMemo<OverviewRuntime>(() => ({
        queryKey: token,
        apiBasePath: `/api/share/${token}/overview`,
        siteUrl,
        views,
        embedMode,
        config,
        hideOwnerLogo,
    }), [config, embedMode, hideOwnerLogo, siteUrl, token, views]);

    return (
        <QueryClientProvider client={queryClient}>
            <NuqsAdapter>
                <OverviewRuntimeContext.Provider value={runtime}>
                    <ShareOverviewPage />
                </OverviewRuntimeContext.Provider>
            </NuqsAdapter>
        </QueryClientProvider>
    );
}
