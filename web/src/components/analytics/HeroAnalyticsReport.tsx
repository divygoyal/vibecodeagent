'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    Check,
    ChevronDown,
    Download,
    Filter,
    GitCompare,
    Layers3,
    LineChart,
    Loader2,
    Search,
    Sparkles,
} from 'lucide-react';
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { DEFAULT_VISIBLE_METRICS, QUERY_COMPARE_MODES, QUERY_DIMENSION_META, QUERY_METRIC_META } from '@/lib/analyticsQueryMeta';
import type {
    AnalyticsCompareMode,
    AnalyticsQueryDescriptor,
    AnalyticsQueryDimension,
    AnalyticsQueryFilter,
    AnalyticsQueryMetaResponse,
    AnalyticsQueryMetric,
    AnalyticsQueryResponse,
    AnalyticsQueryVisualization,
    AnalyticsTimeBucket,
} from '@/types/analyticsWorkspace';
import type { DashboardFilters, FilterRule } from '@/stores/analyticsFilterStore';

const STORAGE_KEY = 'trafficclaw.analytics.hero.v3';
const CHART_TYPES: { value: AnalyticsQueryVisualization; label: string; icon: typeof LineChart }[] = [
    { value: 'line', label: 'Line', icon: LineChart },
    { value: 'area', label: 'Area', icon: LineChart },
    { value: 'bar', label: 'Bar', icon: BarChart3 },
    { value: 'combo', label: 'Combo', icon: Layers3 },
];
const BUCKET_OPTIONS: { value: AnalyticsTimeBucket; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
];
const SERIES_COLORS = ['#60a5fa', '#8b5cf6', '#f472b6', '#38bdf8', '#7c3aed', '#22d3ee'];
const METRIC_ACCENTS: Record<AnalyticsQueryMetric, string> = {
    activeUsers: '#49e0b7',
    totalUsers: '#60a5fa',
    newUsers: '#4ad5ff',
    returningUsers: '#a98dff',
    sessions: '#38bdf8',
    screenPageViews: '#a78bfa',
    eventCount: '#7c9cff',
    engagementRate: '#22c55e',
    bounceRate: '#fb7185',
    averageSessionDuration: '#68a9ff',
};

type HeroReportState = {
    visibleMetrics: AnalyticsQueryMetric[];
    selectedMetric: AnalyticsQueryMetric;
    secondaryMetric: AnalyticsQueryMetric | 'none';
    primaryDimension: AnalyticsQueryDimension;
    chartType: AnalyticsQueryVisualization;
    bucket: AnalyticsTimeBucket;
    compareMode: AnalyticsCompareMode;
    smoothing: boolean;
    annotations: boolean;
    orderBy: AnalyticsQueryMetric;
};

const DEFAULT_STATE: HeroReportState = {
    visibleMetrics: DEFAULT_VISIBLE_METRICS,
    selectedMetric: 'activeUsers',
    secondaryMetric: 'sessions',
    primaryDimension: 'sessionDefaultChannelGroup',
    chartType: 'combo',
    bucket: 'day',
    compareMode: 'off',
    smoothing: true,
    annotations: true,
    orderBy: 'activeUsers',
};

function compact(value: number) {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return Math.round(value).toLocaleString();
}

function duration(seconds: number) {
    const safe = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(safe / 60)}m ${safe % 60}s`;
}

function metricMeta(metric: AnalyticsQueryMetric, fallbackLabel?: string) {
    return QUERY_METRIC_META.find((item) => item.value === metric) || {
        value: metric,
        label: fallbackLabel || metric,
        category: 'Metric',
        format: 'number' as const,
    };
}

function metricValue(metric: AnalyticsQueryMetric, value: number) {
    const meta = metricMeta(metric);
    if (meta.format === 'percent') return `${Number(value || 0).toFixed(1)}%`;
    if (meta.format === 'duration') return duration(value);
    return compact(value);
}

function metricDelta(value: number, previous: number) {
    if (!previous) return null;
    return Number((((value - previous) / previous) * 100).toFixed(1));
}

function rollingAverage(data: number[], index: number, size = 3) {
    const start = Math.max(0, index - size + 1);
    const sample = data.slice(start, index + 1);
    return sample.reduce((sum, value) => sum + value, 0) / Math.max(sample.length, 1);
}

function comparisonModeLabel(mode: AnalyticsCompareMode) {
    return QUERY_COMPARE_MODES.find((item) => item.value === mode)?.label || 'Off';
}

function bucketLabel(bucket: AnalyticsTimeBucket) {
    return bucket === 'month' ? 'month' : bucket === 'week' ? 'week' : 'day';
}

function metricAccent(metric: AnalyticsQueryMetric) {
    return METRIC_ACCENTS[metric] || '#60a5fa';
}

function normalizeSecondaryMetric(
    selectedMetric: AnalyticsQueryMetric,
    visibleMetrics: AnalyticsQueryMetric[],
    currentSecondary: AnalyticsQueryMetric | 'none',
) {
    if (currentSecondary !== 'none' && currentSecondary !== selectedMetric && visibleMetrics.includes(currentSecondary)) {
        return currentSecondary;
    }

    return visibleMetrics.find((metric) => metric !== selectedMetric) || 'none';
}

function mapSimpleFilters(filters: DashboardFilters): AnalyticsQueryFilter[] {
    const entries: Array<[keyof DashboardFilters, AnalyticsQueryDimension]> = [
        ['country', 'country'],
        ['device', 'deviceCategory'],
        ['channel', 'sessionDefaultChannelGroup'],
        ['page', 'pagePath'],
        ['referrer', 'sessionSource'],
        ['browser', 'browser'],
        ['os', 'operatingSystem'],
    ];

    return entries.flatMap(([key, fieldName]) => {
        const values = filters[key];
        if (!values.length) return [];
        return [{
            fieldName,
            operator: 'inList' as const,
            value: values,
        }];
    });
}

function mapAdvancedFilters(filters: FilterRule[]): AnalyticsQueryFilter[] {
    const fieldMap = {
        country: 'country',
        device: 'deviceCategory',
        channel: 'sessionDefaultChannelGroup',
        page: 'pagePath',
        referrer: 'sessionSource',
        browser: 'browser',
        os: 'operatingSystem',
    } as const satisfies Partial<Record<FilterRule['parameter'], AnalyticsQueryDimension>>;

    return filters.flatMap((filter) => {
        const fieldName = fieldMap[filter.parameter as keyof typeof fieldMap];
        if (!fieldName) return [];
        return [{
            fieldName,
            operator:
                filter.type === 'equals'
                    ? 'equals'
                    : filter.type === 'contains'
                        ? 'contains'
                        : filter.type === 'not_equals'
                            ? 'notEquals'
                            : 'notContains',
            value: filter.value,
        } as AnalyticsQueryFilter];
    });
}

function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open, onClose]);

    return ref;
}

function MetricPicker({
    open,
    activeMetric,
    onClose,
    onSelect,
    metrics,
}: {
    open: boolean;
    activeMetric: AnalyticsQueryMetric;
    onClose: () => void;
    onSelect: (metric: AnalyticsQueryMetric) => void;
    metrics: AnalyticsQueryMetaResponse['metrics'];
}) {
    const [search, setSearch] = useState('');
    const ref = useOutsideClose<HTMLDivElement>(open, () => {
        setSearch('');
        onClose();
    });

    if (!open) return null;

    const query = search.trim().toLowerCase();
    const grouped = metrics.reduce<Record<string, typeof metrics>>((acc, metric) => {
        if (
            query &&
            !metric.label.toLowerCase().includes(query) &&
            !metric.category.toLowerCase().includes(query)
        ) {
            return acc;
        }
        acc[metric.category] = acc[metric.category] || [];
        acc[metric.category].push(metric);
        return acc;
    }, {});
    const groupEntries = Object.entries(grouped);

    return (
        <div ref={ref} className="analytics-picker-menu absolute left-0 top-full z-40 mt-2 w-[320px] overflow-hidden">
            <div className="analytics-picker-search">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search metrics"
                    className="analytics-picker-input"
                />
            </div>
            <div className="max-h-[320px] overflow-y-auto py-2">
                {groupEntries.length === 0 && (
                    <div className="px-4 py-5 text-sm text-zinc-400">
                        No metrics match <span className="text-zinc-200">&quot;{search}&quot;</span>.
                    </div>
                )}
                {groupEntries.map(([group, items]) => (
                    <div key={group} className="px-2 pb-2">
                        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{group}</div>
                        {items.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    onSelect(item.value);
                                    onClose();
                                }}
                                className={`analytics-picker-option ${activeMetric === item.value ? 'is-active' : ''}`}
                            >
                                <div>
                                    <div className="text-sm font-medium text-zinc-100">{item.label}</div>
                                    <div className="text-xs text-zinc-400">{item.category}</div>
                                </div>
                                {activeMetric === item.value && <Check className="h-4 w-4 text-[var(--analytics-mint)]" />}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

type ReportTooltipProps = {
    active?: boolean;
    payload?: Array<{
        dataKey?: string;
        value?: number | string;
        color?: string;
        payload?: Record<string, unknown>;
        name?: string;
    }>;
    label?: string;
    metric: AnalyticsQueryMetric;
    compareMode: AnalyticsCompareMode;
    bucket: AnalyticsTimeBucket;
    secondaryMetric?: AnalyticsQueryMetric | 'none';
    secondaryLabel?: string;
    showRolling?: boolean;
};

function ReportTooltip({
    active,
    payload,
    label,
    metric,
    compareMode,
    bucket,
    secondaryMetric,
    secondaryLabel,
    showRolling,
}: ReportTooltipProps) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const total = payload.find((item) => item.dataKey === 'total');
    const secondary = payload.find((item) => item.dataKey === 'secondaryValue');
    const rolling = payload.find((item) => item.dataKey === 'rollingAverage');
    const compare = payload.find((item) => item.dataKey === 'compareTotal');
    const segmentLines = payload.filter((item) => String(item.dataKey || '').startsWith('comparison_'));
    const rowLines = payload.filter((item) => String(item.dataKey || '').startsWith('series_'));
    const previousPoint = Number(row?.previousTotal || 0);
    const previousDelta =
        previousPoint !== 0 && total?.value != null
            ? metricDelta(Number(total.value || 0), previousPoint)
            : null;
    const rollingDelta =
        rolling?.value != null && Number(rolling.value) !== 0 && total?.value != null
            ? metricDelta(Number(total.value || 0), Number(rolling.value || 0))
            : null;
    const delta =
        compare?.value != null && Number(compare.value) !== 0
            ? metricDelta(Number(total?.value || 0), Number(compare.value || 0))
            : null;

    return (
        <div className="analytics-report-tooltip">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-white">{label}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">{String(row?.status || 'steady')}</div>
                </div>
                <Sparkles className="h-4 w-4 text-[var(--analytics-blue)]" />
            </div>
            <div className="space-y-2">
                {total && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-300">{metricMeta(metric).label}</span>
                        <strong className="text-white">{metricValue(metric, Number(total.value || 0))}</strong>
                    </div>
                )}
                {secondary && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">{secondaryLabel || 'Support metric'}</span>
                        <strong className="text-zinc-100">
                            {secondaryMetric && secondaryMetric !== 'none'
                                ? metricValue(secondaryMetric, Number(secondary.value || 0))
                                : compact(Number(secondary.value || 0))}
                        </strong>
                    </div>
                )}
                {previousDelta != null && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">Vs previous {bucketLabel(bucket)}</span>
                        <strong className={previousDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {previousDelta > 0 ? '+' : ''}{previousDelta.toFixed(1)}%
                        </strong>
                    </div>
                )}
                {showRolling && rolling && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">Rolling average</span>
                        <strong className="text-zinc-100">{metricValue(metric, Number(rolling.value || 0))}</strong>
                    </div>
                )}
                {showRolling && rollingDelta != null && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">Vs rolling average</span>
                        <strong className={rollingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {rollingDelta > 0 ? '+' : ''}{rollingDelta.toFixed(1)}%
                        </strong>
                    </div>
                )}
                {compareMode !== 'off' && compare && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">{compareMode === 'previousYear' ? 'Previous year' : 'Previous period'}</span>
                        <strong className="text-zinc-100">{metricValue(metric, Number(compare.value || 0))}</strong>
                    </div>
                )}
                {delta != null && (
                    <div className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">Delta vs compare</span>
                        <strong className={delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </strong>
                    </div>
                )}
                {segmentLines.map((entry) => (
                    <div key={entry.dataKey} className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">{entry.name}</span>
                        <strong className="text-zinc-100">{metricValue(metric, Number(entry.value || 0))}</strong>
                    </div>
                ))}
                {rowLines.map((entry) => (
                    <div key={entry.dataKey} className="analytics-report-tooltip-row">
                        <span className="text-zinc-400">{entry.name}</span>
                        <strong className="text-zinc-100">{metricValue(metric, Number(entry.value || 0))}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function HeroAnalyticsReport({
    propertyId,
    range,
    filters,
    advancedFilters,
    externalMetric,
    onMetricChange,
    onExport,
}: {
    propertyId?: string;
    range: string;
    filters: DashboardFilters;
    advancedFilters: FilterRule[];
    externalMetric?: AnalyticsQueryMetric;
    onMetricChange?: (metric: AnalyticsQueryMetric) => void;
    onExport?: () => void;
}) {
    const [state, setState] = useState<HeroReportState>(DEFAULT_STATE);
    const [meta, setMeta] = useState<AnalyticsQueryMetaResponse | null>(null);
    const [data, setData] = useState<AnalyticsQueryResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pickerIndex, setPickerIndex] = useState<number | null>(null);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<HeroReportState>;
            setState((current) => ({
                ...current,
                ...parsed,
                visibleMetrics: Array.isArray(parsed.visibleMetrics) && parsed.visibleMetrics.length === 4
                    ? parsed.visibleMetrics
                    : current.visibleMetrics,
            }));
        } catch {}
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    useEffect(() => {
        let cancelled = false;
        async function loadMeta() {
            try {
                const response = await fetch('/api/analytics/query/meta');
                if (!response.ok) return;
                const json = await response.json();
                if (!cancelled) setMeta(json as AnalyticsQueryMetaResponse);
            } catch {}
        }
        void loadMeta();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!externalMetric) return;
        setState((current) => {
            const visibleMetrics = current.visibleMetrics.includes(externalMetric)
                ? current.visibleMetrics
                : [externalMetric, ...current.visibleMetrics.filter((item) => item !== externalMetric)].slice(0, 4);
            const secondaryMetric = normalizeSecondaryMetric(externalMetric, visibleMetrics, current.secondaryMetric);
            return {
                ...current,
                visibleMetrics,
                selectedMetric: externalMetric,
                secondaryMetric,
                orderBy: externalMetric,
            };
        });
    }, [externalMetric]);

    const queryFilters = useMemo(
        () => [...mapSimpleFilters(filters), ...mapAdvancedFilters(advancedFilters)],
        [advancedFilters, filters],
    );
    const metricCatalog = meta?.metrics || QUERY_METRIC_META;
    const dimensionCatalog = meta?.dimensions || QUERY_DIMENSION_META;
    const visibleMetrics = state.visibleMetrics;
    const resolvedSecondaryMetric = normalizeSecondaryMetric(state.selectedMetric, visibleMetrics, state.secondaryMetric);
    const secondaryAccent = resolvedSecondaryMetric === 'none' ? '#64748b' : metricAccent(resolvedSecondaryMetric);
    const secondaryLabel = resolvedSecondaryMetric === 'none' ? 'Support metric' : metricMeta(resolvedSecondaryMetric).label;
    const rowPlotValueById = useMemo(() => {
        if (!data) return new Map<string, string>();
        return new Map(data.table.map((row) => [row.id, row.primaryValue]));
    }, [data]);
    const selectedPlotRows = useMemo(() => selectedRows
        .map((rowId) => ({
            rowId,
            plotValue: rowPlotValueById.get(rowId),
        }))
        .filter((row): row is { rowId: string; plotValue: string } => Boolean(row.plotValue)), [rowPlotValueById, selectedRows]);

    const descriptor = useMemo<AnalyticsQueryDescriptor>(() => ({
        propertyId,
        primaryDimension: state.primaryDimension,
        metrics: state.visibleMetrics,
        visibleMetrics: state.visibleMetrics,
        selectedMetric: state.selectedMetric,
        secondaryMetric: state.chartType === 'combo' && resolvedSecondaryMetric !== 'none' ? resolvedSecondaryMetric : null,
        range,
        bucket: state.bucket,
        compareMode: state.compareMode,
        limit: 12,
        orderBy: state.orderBy,
        visualization: state.chartType,
        plotRows: selectedPlotRows.map((row) => row.plotValue),
        filters: queryFilters,
    }), [propertyId, queryFilters, range, resolvedSecondaryMetric, selectedPlotRows, state]);

    useEffect(() => {
        if (!propertyId) return;

        const controller = new AbortController();
        async function runQuery() {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch('/api/analytics/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(descriptor),
                    signal: controller.signal,
                });
                const json = await response.json();
                if (!response.ok) throw new Error(json.error || 'Failed to load report');
                setData(json as AnalyticsQueryResponse);
            } catch (fetchError: unknown) {
                if (controller.signal.aborted) return;
                setError(fetchError instanceof Error ? fetchError.message : 'Failed to load report');
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }

        void runQuery();
        return () => controller.abort();
    }, [descriptor, propertyId]);

    const chartRows = useMemo(() => {
        if (!data) return [];
        const totals = data.trend.map((item) => Number(item.total || 0));
        return data.trend.map((item, index) => {
            const currentRollingAverage = rollingAverage(totals, index);
            const row: Record<string, string | number | undefined> = {
                key: item.key || item.label,
                label: item.label,
                total: item.total,
                compareTotal: item.compareTotal,
                secondaryValue: item.secondaryValue,
                previousTotal: index > 0 ? data.trend[index - 1]?.total : undefined,
                rollingAverage: Number(currentRollingAverage.toFixed(1)),
                status: item.status || (
                    Math.abs(Number(item.total || 0) - currentRollingAverage) > Math.max(currentRollingAverage * 0.18, 1)
                        ? Number(item.total || 0) >= currentRollingAverage
                            ? 'Spike'
                            : 'Cooling'
                        : 'Steady'
                ),
            };

            selectedPlotRows.forEach((entry, rowIndex) => {
                row[`series_${rowIndex}`] = item.series?.[entry.plotValue] || 0;
            });

            Object.entries(item.comparisonTotals || {}).forEach(([name, value], comparisonIndex) => {
                row[`comparison_${comparisonIndex}`] = value;
                row[`comparison_label_${comparisonIndex}`] = name;
            });

            return row;
        });
    }, [data, selectedPlotRows]);

    useEffect(() => {
        if (!data) return;
        const validIds = new Set(data.table.map((row) => row.id));
        setSelectedRows((current) => {
            const next = current.filter((rowId) => validIds.has(rowId)).slice(0, 5);
            if (next.length === current.length && next.every((rowId, index) => rowId === current[index])) {
                return current;
            }
            return next;
        });
    }, [data]);

    function updateMetricSlot(index: number, metric: AnalyticsQueryMetric) {
        setState((current) => {
            const next = [...current.visibleMetrics];
            next[index] = metric;
            const deduped = Array.from(new Set(next));
            const backfill = DEFAULT_VISIBLE_METRICS.filter((item) => !deduped.includes(item));
            const visibleMetrics = [...deduped, ...backfill].slice(0, 4);
            return {
                ...current,
                visibleMetrics,
                selectedMetric: metric,
                secondaryMetric: normalizeSecondaryMetric(metric, visibleMetrics, current.secondaryMetric),
                orderBy: metric,
            };
        });
        onMetricChange?.(metric);
    }

    function activateMetric(metric: AnalyticsQueryMetric) {
        setState((current) => {
            const secondaryMetric = normalizeSecondaryMetric(metric, current.visibleMetrics, current.secondaryMetric);
            return {
                ...current,
                selectedMetric: metric,
                secondaryMetric,
                orderBy: metric,
            };
        });
        onMetricChange?.(metric);
    }

    function toggleRow(rowId: string) {
        setSelectedRows((current) => {
            if (current.includes(rowId)) return current.filter((entry) => entry !== rowId);
            if (current.length >= 5) return current;
            return [...current, rowId];
        });
    }

    const activeFilterCount = queryFilters.length;
    const secondaryMetricOptions = visibleMetrics.filter((metric) => metric !== state.selectedMetric);
    const comparisonLineKeys = chartRows.length
        ? Object.keys(chartRows[0]).filter((key) => key.startsWith('comparison_') && !key.includes('_label_'))
        : [];
    const selectedAccent = metricAccent(state.selectedMetric);

    return (
        <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <div className="analytics-kicker">
                        <span className="analytics-dot bg-[var(--analytics-blue)] text-[var(--analytics-blue)]" />
                        Traffic report
                    </div>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Performance over time</h2>
                    <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                        Track the main trend, swap metrics fast, and plot segments without leaving the page.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                        <span className="analytics-note-pill subtle text-xs">
                            <Filter className="h-3.5 w-3.5 text-[var(--analytics-cyan)]" />
                            {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
                        </span>
                    )}
                    <button type="button" className="analytics-toolbar-btn text-[11px]" onClick={onExport}>
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </button>
                </div>
            </div>

            <div className="mt-4">
                <div className="analytics-report-stage">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                        {visibleMetrics.map((metric, index) => {
                            const total = data?.summary?.[metric] || 0;
                            const previous = data?.summary?.[`prev_${metric}`] || 0;
                            const delta = metricDelta(total, previous);
                            const isActive = state.selectedMetric === metric;
                            const accent = metricAccent(metric);
                            return (
                                <div
                                    key={`${metric}-${index}`}
                                    className={`analytics-report-metric-slot ${isActive ? 'is-active' : ''}`}
                                    style={{ borderColor: isActive ? `${accent}55` : undefined, boxShadow: isActive ? `0 16px 38px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.04)` : undefined }}
                                >
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => activateMetric(metric)}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                                        {metricMeta(metric).label}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-3 text-[clamp(1.55rem,2.5vw,2.2rem)] font-semibold leading-none tracking-tight text-white tabular-nums">
                                                {metricValue(metric, total)}
                                            </div>
                                            <div className={`mt-2 text-xs font-medium tabular-nums ${delta == null ? 'text-zinc-500' : delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {delta == null ? 'No comparison' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Change ${metricMeta(metric).label}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setPickerIndex((current) => current === index ? null : index);
                                            }}
                                            className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-zinc-500 transition hover:border-white/[0.12] hover:text-zinc-200"
                                        >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                        </button>
                                        <MetricPicker
                                            key={`${index}-${metric}-${pickerIndex === index ? 'open' : 'closed'}`}
                                            open={pickerIndex === index}
                                            activeMetric={metric}
                                            onClose={() => setPickerIndex(null)}
                                            onSelect={(nextMetric) => updateMetricSlot(index, nextMetric)}
                                            metrics={metricCatalog}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 analytics-report-controls">
                        <label className="analytics-control-stack">
                            <span className="analytics-chart-stat-label">Dimension</span>
                            <select
                                value={state.primaryDimension}
                                onChange={(event) => {
                                    setSelectedRows([]);
                                    setState((current) => ({
                                        ...current,
                                        primaryDimension: event.target.value as AnalyticsQueryDimension,
                                    }));
                                }}
                                className="analytics-control-select"
                            >
                                {dimensionCatalog.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="analytics-control-stack">
                            <span className="analytics-chart-stat-label">Compare</span>
                            <select
                                value={state.compareMode}
                                onChange={(event) => setState((current) => ({ ...current, compareMode: event.target.value as AnalyticsCompareMode }))}
                                className="analytics-control-select"
                            >
                                {QUERY_COMPARE_MODES.filter((item) => item.value !== 'segments').map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="analytics-control-stack">
                            <span className="analytics-chart-stat-label">Granularity</span>
                            <select
                                value={state.bucket}
                                onChange={(event) => setState((current) => ({ ...current, bucket: event.target.value as AnalyticsTimeBucket }))}
                                className="analytics-control-select"
                            >
                                {BUCKET_OPTIONS.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="analytics-control-stack">
                            <span className="analytics-chart-stat-label">Secondary metric</span>
                            <select
                                value={resolvedSecondaryMetric}
                                onChange={(event) => setState((current) => ({ ...current, secondaryMetric: event.target.value as AnalyticsQueryMetric | 'none' }))}
                                className="analytics-control-select"
                            >
                                <option value="none">None</option>
                                {secondaryMetricOptions.map((item) => (
                                    <option key={item} value={item}>{metricMeta(item).label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <div className="analytics-toggle-row">
                            {CHART_TYPES.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setState((current) => ({ ...current, chartType: option.value }))}
                                    className={`analytics-toolbar-btn text-[11px] ${state.chartType === option.value ? 'is-active' : ''}`}
                                >
                                    <option.icon className="h-3.5 w-3.5" />
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, smoothing: !current.smoothing }))}
                            className={`analytics-toolbar-btn text-[11px] ${state.smoothing ? 'is-active' : ''}`}
                        >
                            Smooth
                        </button>
                        <button
                            type="button"
                            onClick={() => setState((current) => ({ ...current, annotations: !current.annotations }))}
                            className={`analytics-toolbar-btn text-[11px] ${state.annotations ? 'is-active' : ''}`}
                        >
                            Notes
                        </button>
                        <span className="analytics-note-pill subtle text-[11px]">
                            <GitCompare className="h-3.5 w-3.5 text-[var(--analytics-blue)]" />
                            {comparisonModeLabel(state.compareMode)}
                        </span>
                    </div>

                    <div className="mt-5 analytics-report-chart-surface">
                        <div className="h-[360px] lg:h-[410px]">
                        {error ? (
                            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-500">{error}</div>
                        ) : isLoading && !data ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartRows} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                                    <defs>
                                        <linearGradient id="hero-total-fill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={selectedAccent} stopOpacity={0.28} />
                                            <stop offset="100%" stopColor={selectedAccent} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="hero-secondary-fill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={secondaryAccent} stopOpacity={0.42} />
                                            <stop offset="100%" stopColor={secondaryAccent} stopOpacity={0.04} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 6" />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#7c89a0' }}
                                        minTickGap={16}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: '#7c89a0' }}
                                        tickFormatter={(value: number) => metricMeta(state.selectedMetric).format === 'percent' ? `${Math.round(value)}%` : compact(value)}
                                        width={52}
                                    />
                                    {state.chartType === 'combo' && resolvedSecondaryMetric !== 'none' && (
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fill: '#66758d' }}
                                            tickFormatter={(value: number) => compact(value)}
                                            width={44}
                                        />
                                    )}
                                    <Tooltip
                                        cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeDasharray: '4 6' }}
                                        content={
                                            <ReportTooltip
                                                metric={state.selectedMetric}
                                                compareMode={state.compareMode}
                                                bucket={state.bucket}
                                                secondaryMetric={resolvedSecondaryMetric}
                                                secondaryLabel={secondaryLabel}
                                                showRolling={state.smoothing}
                                            />
                                        }
                                    />

                                    {state.chartType === 'combo' && resolvedSecondaryMetric !== 'none' && selectedRows.length === 0 && (
                                        <Bar
                                            yAxisId="right"
                                            dataKey="secondaryValue"
                                            name={secondaryLabel}
                                            fill="url(#hero-secondary-fill)"
                                            radius={[8, 8, 0, 0]}
                                            barSize={16}
                                        />
                                    )}

                                    {state.compareMode !== 'off' && (
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="compareTotal"
                                            name={state.compareMode === 'previousYear' ? 'Previous year' : 'Previous period'}
                                            stroke="rgba(154, 166, 187, 0.92)"
                                            strokeDasharray="4 4"
                                            strokeWidth={1.8}
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                        />
                                    )}

                                    {state.smoothing && (
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="rollingAverage"
                                            name="Rolling average"
                                            stroke="rgba(202, 214, 232, 0.42)"
                                            strokeWidth={1.35}
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                        />
                                    )}

                                    {comparisonLineKeys.map((key, index) => (
                                        <Line
                                            key={key}
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey={key}
                                            name={String(chartRows[0]?.[`comparison_label_${index}`] || `Comparison ${index + 1}`)}
                                            stroke={SERIES_COLORS[index + 2]}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                        />
                                    ))}

                                    {selectedPlotRows.map((row, index) => (
                                        <Line
                                            key={row.rowId}
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey={`series_${index}`}
                                            name={row.plotValue}
                                            stroke={SERIES_COLORS[index + 1]}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                        />
                                    ))}

                                    {state.chartType === 'area' || state.chartType === 'combo' ? (
                                        <Area
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="total"
                                            name={metricMeta(state.selectedMetric).label}
                                            stroke={selectedAccent}
                                            fill="url(#hero-total-fill)"
                                            strokeWidth={3}
                                            dot={false}
                                            activeDot={{ r: 4.5, fill: selectedAccent, stroke: '#ffffff', strokeWidth: 1.5 }}
                                        />
                                    ) : state.chartType === 'bar' ? (
                                        <Bar
                                            yAxisId="left"
                                            dataKey="total"
                                            name={metricMeta(state.selectedMetric).label}
                                            fill={selectedAccent}
                                            radius={[8, 8, 0, 0]}
                                            barSize={18}
                                        />
                                    ) : (
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="total"
                                            name={metricMeta(state.selectedMetric).label}
                                            stroke={selectedAccent}
                                            strokeWidth={3}
                                            dot={false}
                                            activeDot={{ r: 4.5, fill: selectedAccent, stroke: '#ffffff', strokeWidth: 1.5 }}
                                        />
                                    )}

                                    {state.annotations && (data?.annotationHints || []).map((hint) => (
                                        <ReferenceDot
                                            key={hint.key}
                                            yAxisId="left"
                                            x={chartRows.find((row) => row.key === hint.key)?.label || hint.key}
                                            y={hint.total}
                                            r={4}
                                            fill={hint.label === 'Spike' ? selectedAccent : '#8b5cf6'}
                                            stroke="#ffffff"
                                            strokeWidth={1.2}
                                            label={{ value: hint.label, position: 'top', fill: '#8ea0bb', fontSize: 10 }}
                                        />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="analytics-note-pill subtle text-[11px]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedAccent }} />
                        Total trend
                    </span>
                    {state.chartType === 'combo' && resolvedSecondaryMetric !== 'none' && selectedRows.length === 0 && (
                        <span className="analytics-note-pill subtle text-[11px]">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: secondaryAccent }} />
                            {secondaryLabel} bars
                        </span>
                    )}
                    {selectedRows.length > 0 && (
                        <span className="analytics-note-pill subtle text-[11px]">
                            <Sparkles className="h-3.5 w-3.5 text-[var(--analytics-violet)]" />
                            {selectedRows.length} plotted row{selectedRows.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>

                <div className="mt-4 overflow-hidden rounded-[18px] analytics-report-table-shell">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Detail table</div>
                            <div className="text-xs text-zinc-500">
                                Select up to 5 rows to plot against the total trend.
                            </div>
                        </div>
                        <span className="analytics-note-pill subtle text-[11px]">
                            {dimensionCatalog.find((item) => item.value === state.primaryDimension)?.label || 'Dimension'}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="analytics-report-table min-w-full">
                            <thead>
                                <tr>
                                    <th />
                                    <th>{dimensionCatalog.find((item) => item.value === state.primaryDimension)?.label || 'Dimension'}</th>
                                    {visibleMetrics.map((metric) => (
                                        <th key={metric}>
                                            <button
                                                type="button"
                                                onClick={() => setState((current) => ({ ...current, orderBy: metric }))}
                                                className={`analytics-report-table-head ${state.orderBy === metric ? 'is-active' : ''}`}
                                            >
                                                {metricMeta(metric).label}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data?.totalRow && (
                                    <tr className="is-total">
                                        <td />
                                        <td>{data.totalRow.primaryValue}</td>
                                        {visibleMetrics.map((metric) => (
                                            <td key={metric}>{metricValue(metric, data.totalRow?.metrics?.[metric] || 0)}</td>
                                        ))}
                                    </tr>
                                )}
                                {(data?.table || []).map((row) => {
                                    const active = selectedRows.includes(row.id);
                                    return (
                                        <tr key={row.id} className={active ? 'is-selected' : ''}>
                                            <td>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRow(row.id)}
                                                    className={`analytics-row-toggle ${active ? 'is-active' : ''}`}
                                                >
                                                    {active && <Check className="h-3.5 w-3.5" />}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-white">{row.primaryValue}</span>
                                                    {row.secondaryValue && <span className="text-xs text-zinc-500">{row.secondaryValue}</span>}
                                                </div>
                                            </td>
                                            {visibleMetrics.map((metric) => (
                                                <td key={`${row.id}-${metric}`}>{metricValue(metric, row.metrics?.[metric] || 0)}</td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
