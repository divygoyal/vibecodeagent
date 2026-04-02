'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    BarChart3,
    Compass,
    FileText,
    Filter,
    Globe,
    Layers3,
    LineChart,
    Loader2,
    Route,
    Table2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { useAnalyticsContext } from '../layout';
import {
    BrowserIcon,
    ChannelIcon,
    CountryFlag,
    DeviceIcon,
    OSIcon,
    ReferrerIcon,
} from '@/components/analytics/AnalyticsIcons';
import type {
    AnalyticsQueryDescriptor,
    AnalyticsQueryDimension,
    AnalyticsQueryMetric,
    AnalyticsQueryResponse,
    AnalyticsQueryVisualization,
    AnalyticsTimeBucket,
} from '@/types/analyticsWorkspace';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

const DIMENSION_OPTIONS: { value: AnalyticsQueryDimension; label: string }[] = [
    { value: 'sessionDefaultChannelGroup', label: 'Channel Group' },
    { value: 'sessionSource', label: 'Source' },
    { value: 'sessionMedium', label: 'Medium' },
    { value: 'country', label: 'Country' },
    { value: 'city', label: 'City' },
    { value: 'browser', label: 'Browser' },
    { value: 'deviceCategory', label: 'Device' },
    { value: 'operatingSystem', label: 'Operating System' },
    { value: 'pagePath', label: 'Page Path' },
    { value: 'landingPagePlusQueryString', label: 'Landing Page' },
    { value: 'language', label: 'Language' },
];

const METRIC_OPTIONS: { value: AnalyticsQueryMetric; label: string }[] = [
    { value: 'activeUsers', label: 'Users' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'screenPageViews', label: 'Page Views' },
    { value: 'bounceRate', label: 'Bounce Rate' },
    { value: 'averageSessionDuration', label: 'Avg Duration' },
    { value: 'newUsers', label: 'New Users' },
];

const VISUAL_OPTIONS: { value: AnalyticsQueryVisualization; label: string; icon: LucideIcon }[] = [
    { value: 'table', label: 'Table', icon: Table2 },
    { value: 'line', label: 'Line', icon: LineChart },
    { value: 'bar', label: 'Bar', icon: BarChart3 },
    { value: 'combo', label: 'Combo', icon: Layers3 },
    { value: 'geo', label: 'Geo', icon: Globe },
];

const BUCKET_OPTIONS: { value: AnalyticsTimeBucket; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
];

const DEFAULT_DESCRIPTOR: AnalyticsQueryDescriptor = {
    primaryDimension: 'sessionDefaultChannelGroup',
    metrics: ['activeUsers', 'sessions'],
    range: '30d',
    bucket: 'day',
    compare: true,
    limit: 12,
    visualization: 'combo',
    plotRows: [],
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

function metricValue(metric: AnalyticsQueryMetric, value: number) {
    if (metric === 'bounceRate') return `${value.toFixed(1)}%`;
    if (metric === 'averageSessionDuration') return duration(value);
    return compact(value);
}

function metricLabel(metric: AnalyticsQueryMetric) {
    return METRIC_OPTIONS.find((item) => item.value === metric)?.label || metric;
}

function SelectField({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="analytics-control-select"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}

function getDimensionIcon(
    dimension: AnalyticsQueryDimension,
    row: { primaryValue: string; secondaryValue?: string },
) {
    if (dimension === 'country') return <CountryFlag country={row.primaryValue} />;
    if (dimension === 'city') return <CountryFlag country={row.secondaryValue || row.primaryValue} />;
    if (dimension === 'browser') return <BrowserIcon browser={row.primaryValue} />;
    if (dimension === 'deviceCategory') return <DeviceIcon device={row.primaryValue} />;
    if (dimension === 'operatingSystem') return <OSIcon os={row.primaryValue} />;
    if (dimension === 'sessionDefaultChannelGroup') return <ChannelIcon channel={row.primaryValue} />;
    if (dimension === 'sessionSource') return <ReferrerIcon referrer={row.primaryValue} />;
    if (dimension === 'sessionMedium') return <Filter className="h-4 w-4 text-zinc-400" />;
    return <FileText className="h-4 w-4 text-zinc-400" />;
}

export default function AnalyticsExplorePage() {
    const { selectedProperty, range } = useAnalyticsContext();
    const [descriptor, setDescriptor] = useState<AnalyticsQueryDescriptor>({ ...DEFAULT_DESCRIPTOR, range });
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [data, setData] = useState<AnalyticsQueryResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const queryDescriptor = useMemo(() => ({ ...descriptor, range }), [descriptor, range]);

    useEffect(() => {
        if (!selectedProperty) return;

        const controller = new AbortController();
        const payload = {
            ...queryDescriptor,
            propertyId: selectedProperty,
            plotRows: selectedRows,
        };

        async function runQuery() {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/analytics/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                const json = await response.json();
                if (!response.ok) throw new Error(json.error || 'Failed to load exploration data');
                setData(json as AnalyticsQueryResponse);
            } catch (fetchError: unknown) {
                if (controller.signal.aborted) return;
                setError(fetchError instanceof Error ? fetchError.message : 'Failed to load exploration data');
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }

        void runQuery();

        return () => controller.abort();
    }, [queryDescriptor, selectedProperty, selectedRows]);

    const selectedMetric = descriptor.metrics[0];
    const chartData = useMemo(() => {
        if (!data) return [];
        return data.trend.map((point) => {
            const row: Record<string, number | string | undefined> = {
                label: point.label,
                total: point.total,
                compareTotal: point.compareTotal,
            };
            selectedRows.forEach((value, index) => {
                row[`series_${index}`] = point.series?.[value] || 0;
            });
            return row;
        });
    }, [data, selectedRows]);

    const topCountries = useMemo(() => {
        if (!data || descriptor.primaryDimension !== 'country') return [];
        return data.table.map((row) => ({
            country: row.primaryValue,
            users: row.metrics[selectedMetric] || 0,
        }));
    }, [data, descriptor.primaryDimension, selectedMetric]);

    const topCities = useMemo(() => {
        if (!data || descriptor.primaryDimension !== 'city') return [];
        return data.table.map((row) => ({
            city: row.primaryValue,
            country: row.secondaryValue || 'Unknown',
            users: row.metrics[selectedMetric] || 0,
        }));
    }, [data, descriptor.primaryDimension, selectedMetric]);

    function applyPreset(next: Partial<AnalyticsQueryDescriptor>) {
        setSelectedRows([]);
        setDescriptor((current) => ({
            ...current,
            ...next,
            range,
        }));
    }

    function toggleRow(value: string) {
        setSelectedRows((current) => {
            if (current.includes(value)) return current.filter((entry) => entry !== value);
            if (current.length >= 5) return current;
            return [...current, value];
        });
    }

    return (
        <div className="analytics-main-page space-y-4 overflow-hidden pb-5 sm:space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
                <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="analytics-kicker">
                                <span className="analytics-dot bg-[var(--analytics-cyan)] text-[var(--analytics-cyan)]" />
                                Exploration Studio
                            </div>
                            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Build a custom analytics cut</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                                This is the first step toward a GA-style exploration workspace: change dimensions, switch metrics, plot rows, and compare signals without leaving TrafficClaw.
                            </p>
                        </div>
                        <Compass className="mt-1 h-5 w-5 text-[var(--analytics-cyan)]" />
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <button type="button" className="analytics-preset-card" onClick={() => applyPreset({ primaryDimension: 'sessionDefaultChannelGroup', metrics: ['activeUsers', 'sessions'], visualization: 'combo' })}>
                            <span className="analytics-chart-stat-label">Preset</span>
                            <span className="mt-1 block text-sm font-semibold text-white">Traffic Acquisition</span>
                            <span className="mt-1 block text-xs text-zinc-500">Channel groups with overlay-ready trend lines.</span>
                        </button>
                        <button type="button" className="analytics-preset-card" onClick={() => applyPreset({ primaryDimension: 'pagePath', metrics: ['screenPageViews', 'activeUsers'], visualization: 'bar' })}>
                            <span className="analytics-chart-stat-label">Preset</span>
                            <span className="mt-1 block text-sm font-semibold text-white">Content Performance</span>
                            <span className="mt-1 block text-xs text-zinc-500">Switch to pages and compare view depth quickly.</span>
                        </button>
                        <button type="button" className="analytics-preset-card" onClick={() => applyPreset({ primaryDimension: 'browser', metrics: ['sessions', 'activeUsers'], visualization: 'table' })}>
                            <span className="analytics-chart-stat-label">Preset</span>
                            <span className="mt-1 block text-sm font-semibold text-white">Browser Mix</span>
                            <span className="mt-1 block text-xs text-zinc-500">Inspect technology skew with session-weighted ranking.</span>
                        </button>
                        <button type="button" className="analytics-preset-card" onClick={() => applyPreset({ primaryDimension: 'country', metrics: ['activeUsers', 'sessions'], visualization: 'geo' })}>
                            <span className="analytics-chart-stat-label">Preset</span>
                            <span className="mt-1 block text-sm font-semibold text-white">Geo Reach</span>
                            <span className="mt-1 block text-xs text-zinc-500">Map country-level traffic and compare spread.</span>
                        </button>
                    </div>
                </div>

                <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
                    <div className="analytics-kicker">
                        <span className="analytics-dot bg-[var(--analytics-violet)] text-[var(--analytics-violet)]" />
                        Deep Dives
                    </div>
                    <div className="mt-4 space-y-3">
                        <Link href="/dashboard/analytics/funnels" className="analytics-route-card">
                            <Route className="h-4 w-4 text-[var(--analytics-amber)]" />
                            <div>
                                <div className="text-sm font-semibold text-white">Funnels Workspace</div>
                                <div className="text-xs text-zinc-500">Use the dedicated funnel report for stepped conversion analysis.</div>
                            </div>
                        </Link>
                        <Link href="/dashboard/analytics/retention" className="analytics-route-card">
                            <Layers3 className="h-4 w-4 text-[var(--analytics-violet)]" />
                            <div>
                                <div className="text-sm font-semibold text-white">Retention Cohorts</div>
                                <div className="text-xs text-zinc-500">Open the cohort view for repeat-visit behavior over time.</div>
                            </div>
                        </Link>
                        <Link href="/dashboard/analytics/journeys" className="analytics-route-card">
                            <Compass className="h-4 w-4 text-[var(--analytics-mint)]" />
                            <div>
                                <div className="text-sm font-semibold text-white">Journey Analysis</div>
                                <div className="text-xs text-zinc-500">Follow landing-to-exit behavior with the journey report.</div>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div>
                        <span className="analytics-chart-stat-label">Primary dimension</span>
                        <div className="mt-2">
                            <SelectField
                                value={descriptor.primaryDimension}
                                onChange={(value) => {
                                    setSelectedRows([]);
                                    setDescriptor((current) => ({
                                        ...current,
                                        primaryDimension: value as AnalyticsQueryDimension,
                                        secondaryDimension: current.secondaryDimension === value ? undefined : current.secondaryDimension,
                                        visualization: current.visualization === 'geo' && !['country', 'city'].includes(value) ? 'table' : current.visualization,
                                    }));
                                }}
                                options={DIMENSION_OPTIONS}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="analytics-chart-stat-label">Secondary dimension</span>
                        <div className="mt-2">
                            <SelectField
                                value={descriptor.secondaryDimension || 'none'}
                                onChange={(value) => setDescriptor((current) => ({
                                    ...current,
                                    secondaryDimension: value === 'none' ? undefined : value as AnalyticsQueryDimension,
                                }))}
                                options={[{ value: 'none', label: 'None' }, ...DIMENSION_OPTIONS.filter((option) => option.value !== descriptor.primaryDimension)]}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="analytics-chart-stat-label">Metric</span>
                        <div className="mt-2">
                            <SelectField
                                value={descriptor.metrics[0]}
                                onChange={(value) => setDescriptor((current) => ({ ...current, metrics: [value as AnalyticsQueryMetric, current.metrics[1] || 'sessions'] }))}
                                options={METRIC_OPTIONS}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="analytics-chart-stat-label">Visualization</span>
                        <div className="mt-2">
                            <SelectField
                                value={descriptor.visualization || 'table'}
                                onChange={(value) => setDescriptor((current) => ({ ...current, visualization: value as AnalyticsQueryVisualization }))}
                                options={VISUAL_OPTIONS
                                    .filter((option) => option.value !== 'geo' || ['country', 'city'].includes(descriptor.primaryDimension))
                                    .map((option) => ({ value: option.value, label: option.label }))}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="analytics-chart-stat-label">Granularity</span>
                        <div className="mt-2">
                            <SelectField
                                value={descriptor.bucket || 'day'}
                                onChange={(value) => setDescriptor((current) => ({ ...current, bucket: value as AnalyticsTimeBucket }))}
                                options={BUCKET_OPTIONS}
                            />
                        </div>
                    </div>
                    <div>
                        <span className="analytics-chart-stat-label">Compare</span>
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDescriptor((current) => ({ ...current, compare: !current.compare }))}
                                className={`analytics-toolbar-btn h-[40px] w-full justify-center text-xs ${descriptor.compare ? 'is-active' : ''}`}
                            >
                                Previous period
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
                <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="analytics-kicker">
                                <span className="analytics-dot bg-[var(--analytics-amber)] text-[var(--analytics-amber)]" />
                                Query visualization
                            </div>
                            <h2 className="mt-2 text-lg font-semibold text-white">{metricLabel(selectedMetric)} by {DIMENSION_OPTIONS.find((item) => item.value === descriptor.primaryDimension)?.label}</h2>
                        </div>
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
                    </div>

                    <div className="mt-4 analytics-chart-stage px-2 py-4 sm:px-3">
                        {error ? (
                            <div className="analytics-empty-state min-h-[360px]">
                                <div>
                                    <p className="text-sm font-medium text-white">Exploration query failed</p>
                                    <p className="mt-2 text-xs text-zinc-500">{error}</p>
                                </div>
                            </div>
                        ) : descriptor.visualization === 'geo' ? (
                            <div className="h-[360px] overflow-hidden rounded-[18px] border border-white/[0.05]">
                                <WorldMap byCountry={topCountries} byCity={descriptor.primaryDimension === 'city' ? topCities : []} />
                            </div>
                        ) : (
                            <div className="h-[360px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 8" />
                                        <XAxis dataKey="label" tick={{ fill: '#6f788d', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
                                        <YAxis tick={{ fill: '#6f788d', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => metricValue(selectedMetric, value)} width={58} />
                                        <Tooltip
                                            contentStyle={{
                                                background: 'rgba(10,13,19,0.98)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: 16,
                                                boxShadow: '0 16px 44px rgba(0,0,0,0.35)',
                                            }}
                                            formatter={(value: number | string | undefined, name: string | undefined) => [metricValue(selectedMetric, Number(value || 0)), name || metricLabel(selectedMetric)]}
                                        />
                                        {(descriptor.visualization === 'bar' || descriptor.visualization === 'combo') && (
                                            <Bar dataKey="total" fill="rgba(255,180,84,0.72)" radius={[8, 8, 0, 0]} barSize={18} />
                                        )}
                                        {(descriptor.visualization === 'line' || descriptor.visualization === 'combo') && (
                                            <Line type="monotone" dataKey="total" stroke="#49e0b7" strokeWidth={2.8} dot={false} />
                                        )}
                                        {descriptor.visualization === 'table' && (
                                            <Line type="monotone" dataKey="total" stroke="#49e0b7" strokeWidth={2.8} dot={false} />
                                        )}
                                        {selectedRows.map((row, index) => (
                                            <Line
                                                key={row}
                                                type="monotone"
                                                dataKey={`series_${index}`}
                                                stroke={['#a98dff', '#68a9ff', '#ffb454', '#fb7396', '#4ad5ff'][index] || '#a98dff'}
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        ))}
                                        {descriptor.compare && (
                                            <Line type="monotone" dataKey="compareTotal" stroke="rgba(167,176,191,0.72)" strokeDasharray="4 6" strokeWidth={1.7} dot={false} />
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {data && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="analytics-chart-insight-card">
                                <span className="analytics-chart-stat-label">Current total</span>
                                <div className="mt-2 text-lg font-semibold text-white">{metricValue(selectedMetric, data.summary[selectedMetric] || 0)}</div>
                            </div>
                            <div className="analytics-chart-insight-card">
                                <span className="analytics-chart-stat-label">Previous total</span>
                                <div className="mt-2 text-lg font-semibold text-white">
                                    {descriptor.compare ? metricValue(selectedMetric, data.summary[`prev_${selectedMetric}`] || 0) : 'Compare off'}
                                </div>
                            </div>
                            <div className="analytics-chart-insight-card">
                                <span className="analytics-chart-stat-label">Delta</span>
                                <div className="mt-2 text-lg font-semibold text-white">
                                    {descriptor.compare ? `${data.summary[`delta_${selectedMetric}`] || 0}%` : 'Compare off'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="premium-card analytics-surface-card overflow-hidden p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="analytics-kicker">
                                <span className="analytics-dot bg-[var(--analytics-mint)] text-[var(--analytics-mint)]" />
                                Ranked results
                            </div>
                            <h2 className="mt-2 text-lg font-semibold text-white">Plot up to five rows</h2>
                            <p className="mt-1 text-xs text-zinc-500">Select rows to overlay them onto the trend chart, similar to GA4 plot rows.</p>
                        </div>
                        <span className="analytics-note-pill subtle text-xs">{selectedRows.length}/5 selected</span>
                    </div>

                    <div className="mt-4 space-y-1 max-h-[560px] overflow-y-auto pr-1 scrollbar-hide">
                        {data?.table.map((row) => {
                            const active = selectedRows.includes(row.primaryValue);
                            const primaryMetricValue = row.metrics[selectedMetric] || 0;
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => toggleRow(row.primaryValue)}
                                    className={`analytics-explore-row ${active ? 'is-active' : ''}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`analytics-row-check ${active ? 'is-active' : ''}`} />
                                        {getDimensionIcon(descriptor.primaryDimension, row)}
                                        <div className="min-w-0 text-left">
                                            <div className="truncate text-sm font-medium text-white">{row.primaryValue}</div>
                                            {row.secondaryValue && <div className="truncate text-[11px] text-zinc-500">{row.secondaryValue}</div>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold tabular-nums text-white">{metricValue(selectedMetric, primaryMetricValue)}</div>
                                        {descriptor.metrics[1] && (
                                            <div className="text-[11px] text-zinc-500">
                                                {metricLabel(descriptor.metrics[1])}: {metricValue(descriptor.metrics[1], row.metrics[descriptor.metrics[1]] || 0)}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}

                        {!isLoading && !data?.table.length && (
                            <div className="analytics-empty-state min-h-[280px]">
                                <div>
                                    <p className="text-sm font-medium text-white">No rows returned</p>
                                    <p className="mt-2 text-xs text-zinc-500">Try a broader range or a different dimension.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
