'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { useState, useMemo, useRef, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { AreaChart, Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    TrendingUp,
    TrendingDown,
    Users,
    Target,
    Globe,
    Download,
    RefreshCw,
    Filter as FilterIcon,
    BarChart3,
    ChevronDown,
    Maximize2,
    Sparkles,
    Layers3,
    BookmarkPlus,
    Copy,
    RotateCcw,
    Shield,
    SlidersHorizontal,
    Trash2,
} from 'lucide-react';
import { exportAnalyticsData, exportAnalyticsZip } from '@/lib/exportUtils';
import { useAnalyticsData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from './layout';
import { BrowserIcon, ChannelIcon, CountryFlag, DeviceIcon, OSIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import DataRow from '@/components/analytics/DataRow';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { SkeletonDashboard } from '@/components/analytics/SkeletonLoader';
import HeroAnalyticsReport from '@/components/analytics/HeroAnalyticsReport';
import { useFilterStore, type DashboardFilters } from '@/stores/analyticsFilterStore';
import { mapAdvancedFilters, mapSimpleFilters } from '@/lib/analyticsQueryFilters';
import type {
    AnalyticsChartMode,
    AnalyticsChartMetric,
    AnalyticsQueryDescriptor,
    AnalyticsQueryMetric,
    AnalyticsQueryResponse,
    AnalyticsSecondaryMetric,
    AnalyticsTimeBucket,
    AnalyticsViewConfig,
} from '@/types/analyticsWorkspace';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

type AccentTone = 'mint' | 'cyan' | 'violet' | 'amber' | 'rose' | 'blue';
type ChartStat = AnalyticsChartMetric;
type TimeBucket = AnalyticsTimeBucket;
type KpiFormat = 'number' | 'percent' | 'decimal' | 'duration';
type SupportMetric = Exclude<AnalyticsSecondaryMetric, 'none'>;

const ACCENT_COLORS: Record<AccentTone, string> = {
    mint: '#49e0b7',
    cyan: '#4ad5ff',
    violet: '#a98dff',
    amber: '#ffb454',
    rose: '#fb7396',
    blue: '#68a9ff',
};

const SUPPORT_BAR_COLOR = '#c78b63';
const ROLLING_AVERAGE_COLOR = 'rgba(236, 240, 248, 0.72)';
const COMPARE_LINE_COLOR = 'rgba(143, 151, 167, 0.7)';

const CHART_STATS: {
    key: ChartStat;
    label: string;
    color: string;
    tone: AccentTone;
    supportKey: SupportMetric;
    supportLabel: string;
}[] = [
    { key: 'activeUsers', label: 'Users', color: ACCENT_COLORS.mint, tone: 'mint', supportKey: 'sessions', supportLabel: 'Sessions' },
    { key: 'sessions', label: 'Sessions', color: ACCENT_COLORS.cyan, tone: 'cyan', supportKey: 'pageViews', supportLabel: 'Pageviews' },
    { key: 'pageViews', label: 'Pageviews', color: ACCENT_COLORS.violet, tone: 'violet', supportKey: 'sessions', supportLabel: 'Sessions' },
    { key: 'bounceRate', label: 'Bounce Rate', color: ACCENT_COLORS.rose, tone: 'rose', supportKey: 'sessions', supportLabel: 'Sessions' },
];

const BUCKET_LABELS: Record<TimeBucket, string> = { day: 'Day', week: 'Week', month: 'Month' };
const BUCKET_OPTIONS: TimeBucket[] = ['day', 'week', 'month'];
const CHART_MODE_OPTIONS: { value: AnalyticsChartMode; label: string }[] = [
    { value: 'combo', label: 'Combo' },
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
];
const SECONDARY_OPTIONS: { value: AnalyticsSecondaryMetric; label: string }[] = [
    { value: 'none', label: 'No bars' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'pageViews', label: 'Page Views' },
];
const CARD = 'premium-card analytics-surface-card analytics-card-hover';
const EMPTY_LIST: any[] = [];

function fmt(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return Math.round(n).toLocaleString();
}

function fmtDur(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0m 0s';
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatMetricValue(metric: ChartStat | 'pagesPerSession' | 'avgSessionDuration', value: number): string {
    if (metric === 'bounceRate') return `${Number(value || 0).toFixed(1)}%`;
    if (metric === 'avgSessionDuration') return fmtDur(value || 0);
    if (metric === 'pagesPerSession') return Number(value || 0).toFixed(1);
    return fmt(value || 0);
}

function formatBucketLabel(raw: string, bucket: TimeBucket): string {
    if (bucket !== 'day') return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPrevDataKey(stat: ChartStat): string {
    if (stat === 'activeUsers') return 'prevActiveUsers';
    if (stat === 'sessions') return 'prevSessions';
    if (stat === 'pageViews') return 'prevPageViews';
    return 'prevBounceRate';
}

function getChangeForStat(kpis: any, stat: ChartStat): number {
    if (stat === 'activeUsers') return kpis?.changeUsers || 0;
    if (stat === 'sessions') return kpis?.changeSessions || 0;
    if (stat === 'pageViews') return kpis?.changePageViews || 0;
    return kpis?.changeBounceRate || 0;
}

function getReferrerHref(referrer: string) {
    const normalized = String(referrer ?? '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (!normalized || normalized === '(direct)' || !normalized.includes('.')) return undefined;
    return `https://${normalized}`;
}

function getRollingAverage(values: number[], index: number, windowSize = 3) {
    const start = Math.max(0, index - windowSize + 1);
    const sample = values.slice(start, index + 1);
    return sample.reduce((sum, value) => sum + value, 0) / Math.max(sample.length, 1);
}

function getPointStatus(current: number, rolling: number, previous?: number | null) {
    if (rolling > 0 && current >= rolling * 1.32) return 'Spike';
    if (rolling > 0 && current >= rolling * 1.12) return 'Above average';
    if (rolling > 0 && current <= rolling * 0.82) return 'Cooling off';
    if (previous != null && previous > 0 && current >= previous * 1.18) return 'Building';
    return 'Steady';
}

function getMetricLabel(metric: ChartStat | AnalyticsSecondaryMetric) {
    if (metric === 'activeUsers') return 'Users';
    if (metric === 'sessions') return 'Sessions';
    if (metric === 'pageViews') return 'Page Views';
    if (metric === 'bounceRate') return 'Bounce Rate';
    return 'No bars';
}

function getStrongestClimb(data: any[], stat: ChartStat, bucket: TimeBucket) {
    if (data.length < 4) return null;

    let winner: { label: string; value: string; delta: number } | null = null;

    for (let index = 3; index < data.length; index += 1) {
        const startValue = Number(data[index - 3]?.[stat] || 0);
        const endValue = Number(data[index]?.[stat] || 0);
        if (startValue <= 0 || endValue <= startValue) continue;

        const delta = ((endValue - startValue) / startValue) * 100;
        if (!winner || delta > winner.delta) {
            winner = {
                label: `${formatBucketLabel(data[index - 3]?.date ?? '', bucket)} to ${formatBucketLabel(data[index]?.date ?? '', bucket)}`,
                value: `+${Math.round(delta)}%`,
                delta,
            };
        }
    }

    return winner;
}

function getSeriesInsight(data: any[], stat: ChartStat, bucket: TimeBucket): string {
    if (!data.length) return 'Waiting for enough signal to summarize this trend.';
    const values = data.map((item: any) => Number(item[stat] || 0));
    const average = values.reduce((sum: number, value: number) => sum + value, 0) / Math.max(values.length, 1);
    const peakValue = Math.max(...values);
    const peakIndex = values.indexOf(peakValue);
    const peakLabel = formatBucketLabel(data[peakIndex]?.date ?? '', bucket);
    if (average > 0 && peakValue / average >= 1.35) {
        return `${peakLabel} rose ${Math.round((peakValue / average - 1) * 100)}% above the period average.`;
    }
    return 'Performance stayed inside a healthy band across this selected window.';
}

function getSeriesPeak(data: any[], stat: ChartStat, bucket: TimeBucket) {
    if (!data.length) return null;
    const values = data.map((item: any) => Number(item[stat] || 0));
    const peakValue = Math.max(...values);
    const peakIndex = values.indexOf(peakValue);
    return {
        label: formatBucketLabel(data[peakIndex]?.date ?? '', bucket),
        value: formatMetricValue(stat, peakValue),
    };
}

function getSeriesAverage(data: any[], stat: ChartStat) {
    if (!data.length) return null;
    const values = data.map((item: any) => Number(item[stat] || 0));
    const average = values.reduce((sum: number, value: number) => sum + value, 0) / Math.max(values.length, 1);
    return formatMetricValue(stat, average);
}

function getISOWeek(date: Date): number {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function aggregateByBucket(data: any[], bucket: TimeBucket): any[] {
    if (!data.length) return data;
    if (bucket === 'day') return data;

    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const date = new Date(item.date);
        let key: string;
        if (bucket === 'week') {
            key = `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, '0')}`;
        } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    return Object.entries(groups).map(([key, items]) => {
        const sumUsers = items.reduce((sum, item) => sum + (item.activeUsers || 0), 0);
        const sumSessions = items.reduce((sum, item) => sum + (item.sessions || 0), 0);
        const sumPageViews = items.reduce((sum, item) => sum + (item.pageViews || 0), 0);
        const avgBounce = items.reduce((sum, item) => sum + (item.bounceRate || 0), 0) / Math.max(items.length, 1);
        const label = bucket === 'week'
            ? new Date(items[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : new Date(Number(key.split('-')[0]), Number(key.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        return {
            date: label,
            activeUsers: sumUsers,
            sessions: sumSessions,
            pageViews: sumPageViews,
            bounceRate: Math.round(avgBounce * 10) / 10,
        };
    });
}

function Change({ value, suffix = '%', zeroLabel = 'Stable' }: { value: number; suffix?: string; zeroLabel?: string }) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.1) {
        return <span className="analytics-delta-pill neutral">{zeroLabel}</span>;
    }
    const up = value > 0;
    const printable = Number.isInteger(value) ? value : Number(value).toFixed(1);
    return (
        <span className={`analytics-delta-pill ${up ? 'positive' : 'negative'}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? '+' : ''}{printable}{suffix}
        </span>
    );
}

function ChartTooltip({ active, payload, label, bucket, activeStat, supportLabel }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const current = payload.find((entry: any) => entry.dataKey === 'chartValue');
    const previous = payload.find((entry: any) => entry.dataKey === 'compareValue');
    const rolling = payload.find((entry: any) => entry.dataKey === 'rollingAverage');
    const support = payload.find((entry: any) => entry.dataKey === 'supportValue');
    const delta = previous?.value != null && Number(previous.value) !== 0
        ? ((Number(current?.value || 0) - Number(previous.value || 0)) / Number(previous.value || 1)) * 100
        : null;

    return (
        <div className="analytics-tooltip px-4 py-3.5">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-white">{formatBucketLabel(label, bucket)}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">High detail trend snapshot</p>
                </div>
                <span className="analytics-meta-pill h-7 px-2.5 text-[10px] uppercase tracking-[0.18em] text-zinc-300/90">
                    {row?.status || 'Steady'}
                </span>
            </div>
            <div className="space-y-2">
                {current && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: current.color }} />
                            <span className="text-xs text-zinc-300">{activeStat.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-white tabular-nums">
                            {formatMetricValue(activeStat.key, Number(current.value || 0))}
                        </span>
                    </div>
                )}
                {support && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SUPPORT_BAR_COLOR }} />
                            <span className="text-xs text-zinc-400">{supportLabel} bars</span>
                        </div>
                        <span className="text-xs font-medium text-zinc-400 tabular-nums">
                            {fmt(Number(support.value || 0))}
                        </span>
                    </div>
                )}
                {rolling && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="h-[2px] w-4 rounded-full" style={{ backgroundColor: ROLLING_AVERAGE_COLOR }} />
                            <span className="text-xs text-zinc-400">Rolling average</span>
                        </div>
                        <span className="text-xs font-medium text-zinc-400 tabular-nums">
                            {formatMetricValue(activeStat.key, Number(rolling.value || 0))}
                        </span>
                    </div>
                )}
                {previous && previous.value != null && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span className="h-[2px] w-4 rounded-full border-t border-dashed" style={{ borderColor: COMPARE_LINE_COLOR }} />
                            <span className="text-xs text-zinc-400">Previous period</span>
                        </div>
                        <span className="text-xs font-medium text-zinc-400 tabular-nums">
                            {formatMetricValue(activeStat.key, Number(previous.value || 0))}
                        </span>
                    </div>
                )}
            </div>
            {delta != null && Number.isFinite(delta) && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Vs previous</span>
                        <Change value={delta} zeroLabel="Flat" />
                    </div>
                </div>
            )}
        </div>
    );
}

function Sparkline({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
    if (!data.length) return null;
    const gradientId = `spark-${dataKey}-${color.replace('#', '')}`;
    return (
        <div className="h-[44px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                            <stop offset="90%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        fill={`url(#${gradientId})`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function renderKpiValue(format: KpiFormat, value: number) {
    if (format === 'duration') return fmtDur(value);
    if (format === 'percent') return `${Number(value || 0).toFixed(1)}%`;
    if (format === 'decimal') return Number(value || 0).toFixed(1);
    return <AnimatedCounter value={value || 0} formatter={fmt} />;
}

function TimeBucketDropdown({ bucket, setBucket }: { bucket: TimeBucket; setBucket: (bucket: TimeBucket) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="analytics-toolbar-btn text-[11px]"
                type="button"
            >
                {BUCKET_LABELS[bucket]}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="analytics-shell-menu absolute right-0 top-full z-50 mt-2 min-w-[120px] py-1.5">
                    {BUCKET_OPTIONS.map((option) => (
                        <button
                            key={option}
                            onClick={() => {
                                setBucket(option);
                                setOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-[11px] transition ${
                                bucket === option
                                    ? 'text-white bg-white/[0.06]'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                            type="button"
                        >
                            {BUCKET_LABELS[option]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ToolbarSelect({
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

function PanelEmptyState({ title, copy }: { title: string; copy: string }) {
    return (
        <div className="analytics-empty-state">
            <div className="space-y-3">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-zinc-300">
                    <Layers3 className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-sm font-medium text-zinc-200">{title}</p>
                    <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-zinc-500">{copy}</p>
                </div>
            </div>
        </div>
    );
}

function PanelShell({
    title,
    eyebrow,
    tone,
    tabs,
    activeTab,
    onTabChange,
    leftLabel,
    rightLabel,
    meta = 'Top 25',
    rightSlot,
    children,
}: {
    title: string;
    eyebrow: string;
    tone: AccentTone;
    tabs: { key: string; label: string; disabled?: boolean }[];
    activeTab: string;
    onTabChange: (key: string) => void;
    leftLabel?: string;
    rightLabel?: string;
    meta?: string;
    rightSlot?: any;
    children: any;
}) {
    return (
        <div className={`${CARD} analytics-panel-shell flex h-[430px] min-w-0 flex-col overflow-hidden`}>
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80"
                style={{ background: `radial-gradient(circle at 15% -20%, ${ACCENT_COLORS[tone]}44, transparent 48%)` }}
            />
            <div className="relative border-b border-white/[0.05] px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="analytics-kicker">
                            <span className="analytics-dot" style={{ color: ACCENT_COLORS[tone], backgroundColor: ACCENT_COLORS[tone] }} />
                            {eyebrow}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold tracking-tight text-white sm:text-[17px]">{title}</h3>
                            <span className="analytics-panel-meta">{meta}</span>
                        </div>
                        <div className="mt-3 flex gap-1 overflow-x-auto scrollbar-hide">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => !tab.disabled && onTabChange(tab.key)}
                                    className={`analytics-panel-tab ${activeTab === tab.key ? 'is-active' : ''} ${tab.disabled ? 'is-disabled' : ''}`}
                                    disabled={tab.disabled}
                                    type="button"
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {rightSlot}
                        <button
                            className="analytics-toolbar-btn h-9 w-9 px-0"
                            type="button"
                            title="Expand panel"
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>
            {(leftLabel || rightLabel) && (
                <div className="relative flex items-center justify-between px-4 py-2 sm:px-5">
                    <span className="analytics-column-head">{leftLabel}</span>
                    <span className="analytics-column-head">{rightLabel}</span>
                </div>
            )}
            <div className="analytics-ranked-scroll relative min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 sm:px-3">
                {children}
            </div>
        </div>
    );
}

export default function AnalyticsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data: analyticsData, isLoading, isError, refresh } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);
    const { filters, advancedFilters, toggleFilter } = useFilterStore();
    const [heroMetric, setHeroMetric] = useState<AnalyticsQueryMetric>('activeUsers');
    const [activeKpiCardId, setActiveKpiCardId] = useState('users');
    const [filteredReport, setFilteredReport] = useState<AnalyticsQueryResponse | null>(null);
    const [isFilteredReportLoading, setIsFilteredReportLoading] = useState(false);

    useEffect(() => {
        const csvHandler = () => {
            if (analyticsData) exportAnalyticsData(analyticsData);
        };
        const zipHandler = () => {
            if (analyticsData) exportAnalyticsZip(analyticsData);
        };
        window.addEventListener('trafficclaw:export-analytics', csvHandler);
        window.addEventListener('trafficclaw:export-zip', zipHandler);
        return () => {
            window.removeEventListener('trafficclaw:export-analytics', csvHandler);
            window.removeEventListener('trafficclaw:export-zip', zipHandler);
        };
    }, [analyticsData]);

    const kpis = analyticsData?.kpis;
    const traffic: any[] = analyticsData?.traffic ?? EMPTY_LIST;
    const pages: any[] = analyticsData?.pages ?? EMPTY_LIST;
    const devices: any[] = analyticsData?.devices ?? EMPTY_LIST;
    const countries: any[] = analyticsData?.countries ?? EMPTY_LIST;
    const browsers: any[] = analyticsData?.browsers ?? EMPTY_LIST;
    const operatingSystems: any[] = analyticsData?.operatingSystems ?? EMPTY_LIST;
    const channels: any[] = analyticsData?.channels ?? EMPTY_LIST;
    const referrers: any[] = analyticsData?.referrers ?? EMPTY_LIST;
    const cities: any[] = analyticsData?.cities ?? EMPTY_LIST;
    const entryPages: any[] = analyticsData?.entryPages ?? EMPTY_LIST;
    const languages: any[] = analyticsData?.languages ?? EMPTY_LIST;

    const fCountries = filters.country.length > 0 ? countries.filter((country: any) => filters.country.includes(country.country)) : countries;
    const fCities = filters.country.length > 0 ? cities.filter((city: any) => filters.country.includes(city.country)) : cities;
    const fReferrers = filters.referrer.length > 0 ? referrers.filter((referrer: any) => filters.referrer.includes(referrer.name)) : referrers;
    const fPages = filters.page.length > 0 ? pages.filter((page: any) => filters.page.includes(page.page)) : pages;
    const fDevices = filters.device.length > 0 ? devices.filter((device: any) => filters.device.includes(device.device)) : devices;
    const fBrowsers = filters.browser.length > 0 ? browsers.filter((browser: any) => filters.browser.includes(browser.name)) : browsers;
    const fOS = filters.os.length > 0 ? operatingSystems.filter((os: any) => filters.os.includes(os.name)) : operatingSystems;
    const fChannels = filters.channel.length > 0 ? channels.filter((channel: any) => filters.channel.includes(channel.name)) : channels;
    const fEntryPages = filters.page.length > 0 ? entryPages.filter((page: any) => filters.page.includes(page.page)) : entryPages;

    const queryFilters = useMemo(
        () => [...mapSimpleFilters(filters), ...mapAdvancedFilters(advancedFilters)],
        [advancedFilters, filters],
    );
    const anyFilterActive = queryFilters.length > 0;

    useEffect(() => {
        if (!selectedProperty || !anyFilterActive) {
            setFilteredReport(null);
            setIsFilteredReportLoading(false);
            return;
        }

        const controller = new AbortController();

        async function loadFilteredReport() {
            setIsFilteredReportLoading(true);
            try {
                const descriptor: AnalyticsQueryDescriptor = {
                    propertyId: selectedProperty,
                    primaryDimension: 'sessionDefaultChannelGroup',
                    metrics: ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration'],
                    visibleMetrics: ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate'],
                    selectedMetric: 'activeUsers',
                    secondaryMetric: null,
                    range,
                    bucket: 'day',
                    compareMode: 'previousPeriod',
                    limit: 14,
                    orderBy: 'activeUsers',
                    visualization: 'line',
                    filters: queryFilters,
                };
                const response = await fetch('/api/analytics/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(descriptor),
                    signal: controller.signal,
                });
                const json = await response.json();
                if (!response.ok) throw new Error(json.error || 'Failed to load filtered KPIs');
                if (!controller.signal.aborted) setFilteredReport(json as AnalyticsQueryResponse);
            } catch {
                if (!controller.signal.aborted) setFilteredReport(null);
            } finally {
                if (!controller.signal.aborted) setIsFilteredReportLoading(false);
            }
        }

        void loadFilteredReport();
        return () => controller.abort();
    }, [anyFilterActive, queryFilters, range, selectedProperty]);

    const displayKpis = useMemo(() => {
        if (!anyFilterActive || !filteredReport?.summary) return kpis;
        return {
            ...kpis,
            totalUsers: filteredReport.summary.activeUsers ?? 0,
            totalSessions: filteredReport.summary.sessions ?? 0,
            totalPageViews: filteredReport.summary.screenPageViews ?? 0,
            avgBounceRate: filteredReport.summary.bounceRate ?? 0,
            avgSessionDuration: filteredReport.summary.averageSessionDuration ?? 0,
            changeUsers: filteredReport.summary.prev_activeUsers
                ? ((filteredReport.summary.activeUsers - filteredReport.summary.prev_activeUsers) / filteredReport.summary.prev_activeUsers) * 100
                : 0,
            changeSessions: filteredReport.summary.prev_sessions
                ? ((filteredReport.summary.sessions - filteredReport.summary.prev_sessions) / filteredReport.summary.prev_sessions) * 100
                : 0,
            changePageViews: filteredReport.summary.prev_screenPageViews
                ? ((filteredReport.summary.screenPageViews - filteredReport.summary.prev_screenPageViews) / filteredReport.summary.prev_screenPageViews) * 100
                : 0,
            changeBounceRate: filteredReport.summary.prev_bounceRate
                ? filteredReport.summary.bounceRate - filteredReport.summary.prev_bounceRate
                : 0,
        };
    }, [anyFilterActive, filteredReport, kpis]);

    const sparklineData = useMemo(() => {
        const recent = traffic.slice(-14);
        return recent.map((item: any) => ({
            ...item,
            pagesPerSession: item.sessions > 0 ? item.pageViews / item.sessions : 0,
            avgSessionDuration: displayKpis?.avgSessionDuration || 0,
        }));
    }, [displayKpis?.avgSessionDuration, traffic]);

    const kpiCards: {
        id: string;
        label: string;
        value: number;
        change: number;
        format: KpiFormat;
        sparkKey: string;
        tone: AccentTone;
        caption: string;
        reportMetric: AnalyticsQueryMetric;
        zeroLabel?: string;
    }[] = [
        { id: 'users', label: 'Users', value: displayKpis?.totalUsers ?? kpis?.totalUsers ?? 0, change: kpis?.changeUsers ?? 0, format: 'number', sparkKey: 'activeUsers', tone: 'mint', caption: 'Audience', reportMetric: 'activeUsers' },
        { id: 'sessions', label: 'Sessions', value: displayKpis?.totalSessions ?? kpis?.totalSessions ?? 0, change: kpis?.changeSessions ?? 0, format: 'number', sparkKey: 'sessions', tone: 'cyan', caption: 'Visits', reportMetric: 'sessions' },
        { id: 'pageViews', label: 'Page Views', value: displayKpis?.totalPageViews ?? kpis?.totalPageViews ?? 0, change: kpis?.changePageViews ?? 0, format: 'number', sparkKey: 'pageViews', tone: 'violet', caption: 'Consumption', reportMetric: 'screenPageViews' },
        { id: 'pagesPerSession', label: 'Pages / Session', value: kpis?.pagesPerSession || 0, change: 0, format: 'decimal', sparkKey: 'pagesPerSession', tone: 'amber', caption: 'Depth', reportMetric: 'screenPageViews', zeroLabel: 'No delta' },
        { id: 'bounceRate', label: 'Bounce Rate', value: displayKpis?.avgBounceRate ?? kpis?.avgBounceRate ?? 0, change: kpis?.changeBounceRate ?? 0, format: 'percent', sparkKey: 'bounceRate', tone: 'rose', caption: 'Quality', reportMetric: 'bounceRate' },
        { id: 'avgDuration', label: 'Avg Duration', value: kpis?.avgSessionDuration || 0, change: 0, format: 'duration', sparkKey: 'avgSessionDuration', tone: 'blue', caption: 'Retention', reportMetric: 'averageSessionDuration', zeroLabel: 'No delta' },
    ];

    const handleKpiSelect = (cardId: string, metric: AnalyticsQueryMetric) => {
        setActiveKpiCardId(cardId);
        setHeroMetric(metric);
    };

    const handleHeroMetricChange = (metric: AnalyticsQueryMetric) => {
        setHeroMetric(metric);
        const matchingCard = kpiCards.find((card) => card.reportMetric === metric);
        setActiveKpiCardId(matchingCard?.id || '');
    };

    if (isLoading && !analyticsData) return <SkeletonDashboard />;

    if (isError && !analyticsData) {
        const errorMsg = isError?.message || isError?.toString?.() || 'Failed to load analytics data';
        const isTokenError = errorMsg.toLowerCase().includes('token') || errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('401');
        return (
            <div className="analytics-main-page">
                <div className={`${CARD} mx-auto mt-8 max-w-xl p-8 text-center`}>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
                        <BarChart3 className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Analytics data is temporarily unavailable</h2>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{errorMsg}</p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <button
                            onClick={() => refresh()}
                            className="analytics-toolbar-btn is-active"
                            type="button"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Retry
                        </button>
                        {isTokenError && (
                            <button
                                onClick={() => signIn('google')}
                                className="analytics-toolbar-btn"
                                type="button"
                            >
                                Re-connect Google
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-main-page space-y-4 overflow-hidden pb-5 sm:space-y-5">
            {kpis && (
                <div className={`${CARD} analytics-kpi-shell overflow-hidden`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">
                        {kpiCards.map((metric) => {
                            const isActive = activeKpiCardId === metric.id;
                            return (
                                <button
                                    key={metric.id}
                                    className={`analytics-kpi-tile text-left ${isActive ? 'is-active' : ''}`}
                                    data-tone={metric.tone}
                                    onClick={() => handleKpiSelect(metric.id, metric.reportMetric)}
                                    type="button"
                                >
                                    <div className="relative z-10 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="analytics-kpi-label">{metric.label}</p>
                                            <div className="mt-2 text-[clamp(1.65rem,2.5vw,2.45rem)] font-semibold leading-none tracking-tight text-white tabular-nums">
                                                {renderKpiValue(metric.format, metric.value)}
                                            </div>
                                        </div>
                                        <span className="analytics-kpi-caption">{metric.caption}</span>
                                    </div>
                                    <div className="relative z-10 mt-4 space-y-3">
                                        {isFilteredReportLoading && anyFilterActive ? (
                                            <span className="analytics-delta-pill neutral">
                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                                Refreshing…
                                            </span>
                                        ) : (
                                            <Change value={metric.change} zeroLabel={metric.zeroLabel || 'Stable'} />
                                        )}
                                        <Sparkline data={sparklineData} dataKey={metric.sparkKey} color={ACCENT_COLORS[metric.tone]} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <HeroAnalyticsReport
                propertyId={selectedProperty}
                range={range}
                filters={filters}
                advancedFilters={advancedFilters}
                externalMetric={heroMetric}
                onMetricChange={handleHeroMetricChange}
                onExport={() => {
                    if (analyticsData) exportAnalyticsData(analyticsData);
                }}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TrafficSourcesPanel
                    title="Traffic Sources"
                    rowLimit={25}
                    referrers={fReferrers}
                    channels={fChannels}
                    allReferrers={referrers}
                    allChannels={channels}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
                <PagesPanel
                    title="Top Pages"
                    rowLimit={25}
                    pages={fPages}
                    entryPages={fEntryPages}
                    allPages={pages}
                    allEntryPages={entryPages}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TechPanel
                    title="Technology Mix"
                    rowLimit={25}
                    devices={fDevices}
                    browsers={fBrowsers}
                    operatingSystems={fOS}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
                <GeoPanel
                    title="Geo Reach"
                    rowLimit={25}
                    countries={fCountries}
                    cities={fCities}
                    languages={languages}
                    allCountries={countries}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <EngagementCard kpis={kpis} />
                <LoyaltyCard kpis={kpis} />
                <DiversityCard channels={channels} />
            </div>
        </div>
    );
}

function TrafficSourcesPanel({
    title,
    rowLimit,
    referrers,
    channels,
    allReferrers,
    allChannels,
    filters,
    toggleFilter,
}: {
    title: string;
    rowLimit: number;
    referrers: any[];
    channels: any[];
    allReferrers: any[];
    allChannels: any[];
    filters: DashboardFilters;
    toggleFilter: (dimension: any, value: string) => void;
}) {
    const [tab, setTab] = useState<'referrers' | 'channels'>('referrers');

    const refTotal = allReferrers.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const refMaxPct = refTotal > 0 ? ((allReferrers[0]?.value || 0) / refTotal) * 100 : 100;
    const channelTotal = allChannels.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const channelMaxPct = channelTotal > 0 ? ((allChannels[0]?.value || 0) / channelTotal) * 100 : 100;

    return (
        <PanelShell
            title={title}
            eyebrow="Acquisition"
            tone="mint"
            tabs={[
                { key: 'referrers', label: 'Referrers' },
                { key: 'channels', label: 'Channels' },
            ]}
            activeTab={tab}
            onTabChange={(key) => setTab(key as 'referrers' | 'channels')}
            leftLabel={tab === 'referrers' ? 'Referrer' : 'Channel'}
            rightLabel={tab === 'referrers' ? 'Sessions' : 'Visitors'}
            meta={`${Math.min(tab === 'referrers' ? referrers.length : channels.length, rowLimit)} rows`}
        >
            <div className="space-y-1 pb-1">
                {tab === 'referrers' && referrers.length === 0 && (
                    <PanelEmptyState title="No referrers yet" copy="Traffic sources will appear here after the connected property starts sending visits." />
                )}
                {tab === 'channels' && channels.length === 0 && (
                    <PanelEmptyState title="No channels yet" copy="Channel attribution will populate here once the selected period includes visitors." />
                )}
                {tab === 'referrers' && referrers.slice(0, rowLimit).map((referrer: any) => {
                    const pct = refTotal > 0 ? (referrer.value / refTotal) * 100 : 0;
                    return (
                        <DataRow
                            key={referrer.name}
                            label={referrer.name}
                            value={referrer.value}
                            percentage={pct}
                            maxPercentage={refMaxPct}
                            icon={<ReferrerIcon referrer={referrer.name} />}
                            href={getReferrerHref(referrer.name)}
                            onClick={() => toggleFilter('referrer', referrer.name)}
                            active={filters.referrer.includes(referrer.name)}
                            tone="mint"
                        />
                    );
                })}
                {tab === 'channels' && channels.slice(0, rowLimit).map((channel: any) => {
                    const pct = channelTotal > 0 ? (channel.value / channelTotal) * 100 : 0;
                    return (
                        <DataRow
                            key={channel.name}
                            label={channel.name}
                            value={channel.value}
                            percentage={pct}
                            maxPercentage={channelMaxPct}
                            icon={<ChannelIcon channel={channel.name} />}
                            onClick={() => toggleFilter('channel', channel.name)}
                            active={filters.channel.includes(channel.name)}
                            tone="cyan"
                        />
                    );
                })}
            </div>
        </PanelShell>
    );
}

function PagesPanel({
    title,
    rowLimit,
    pages,
    entryPages,
    allPages,
    allEntryPages,
    filters,
    toggleFilter,
}: {
    title: string;
    rowLimit: number;
    pages: any[];
    entryPages: any[];
    allPages: any[];
    allEntryPages: any[];
    filters: DashboardFilters;
    toggleFilter: (dimension: any, value: string) => void;
}) {
    const [tab, setTab] = useState<'pages' | 'entries'>('pages');

    const pagesTotal = allPages.reduce((sum: number, item: any) => sum + (item.views || 0), 0);
    const pagesMaxPct = pagesTotal > 0 ? ((allPages[0]?.views || 0) / pagesTotal) * 100 : 100;
    const entriesTotal = allEntryPages.reduce((sum: number, item: any) => sum + (item.sessions || 0), 0);
    const entriesMaxPct = entriesTotal > 0 ? ((allEntryPages[0]?.sessions || 0) / entriesTotal) * 100 : 100;

    return (
        <PanelShell
            title={title}
            eyebrow="Content"
            tone="amber"
            tabs={[
                { key: 'pages', label: 'Pages' },
                { key: 'entries', label: 'Entry Pages' },
            ]}
            activeTab={tab}
            onTabChange={(key) => setTab(key as 'pages' | 'entries')}
            leftLabel={tab === 'pages' ? 'Page' : 'Entry page'}
            rightLabel={tab === 'pages' ? 'Views' : 'Sessions'}
            meta={`${Math.min(tab === 'pages' ? pages.length : entryPages.length, rowLimit)} rows`}
        >
            <div className="space-y-1 pb-1">
                {tab === 'pages' && pages.length === 0 && (
                    <PanelEmptyState title="No page view data yet" copy="Page-level detail will appear here as soon as the selected range includes tracked visits." />
                )}
                {tab === 'entries' && entryPages.length === 0 && (
                    <PanelEmptyState title="No entry page data yet" copy="Landing-page performance will appear once the connected property has enough sessions." />
                )}
                {tab === 'pages' && pages.slice(0, rowLimit).map((page: any) => {
                    const pct = pagesTotal > 0 ? (page.views / pagesTotal) * 100 : 0;
                    return (
                        <DataRow
                            key={page.page}
                            label={page.page}
                            value={page.views}
                            percentage={pct}
                            maxPercentage={pagesMaxPct}
                            onClick={() => toggleFilter('page', page.page)}
                            active={filters.page.includes(page.page)}
                            tone="amber"
                        />
                    );
                })}
                {tab === 'entries' && entryPages.slice(0, rowLimit).map((page: any) => {
                    const pct = entriesTotal > 0 ? (page.sessions / entriesTotal) * 100 : 0;
                    return (
                        <DataRow
                            key={page.page}
                            label={page.page}
                            value={page.sessions}
                            percentage={pct}
                            maxPercentage={entriesMaxPct}
                            tone="amber"
                        />
                    );
                })}
            </div>
        </PanelShell>
    );
}

function TechPanel({
    title,
    rowLimit,
    devices,
    browsers,
    operatingSystems,
    filters,
    toggleFilter,
}: {
    title: string;
    rowLimit: number;
    devices: any[];
    browsers: any[];
    operatingSystems: any[];
    filters: DashboardFilters;
    toggleFilter: (dimension: any, value: string) => void;
}) {
    const [tab, setTab] = useState<'browsers' | 'devices' | 'os'>('browsers');

    const rows = tab === 'devices'
        ? devices.map((item: any) => ({ name: item.device, value: item.sessions }))
        : tab === 'browsers'
        ? browsers.map((item: any) => ({ name: item.name, value: item.value }))
        : operatingSystems.map((item: any) => ({ name: item.name, value: item.value }));

    const total = rows.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const maxPct = total > 0 ? ((rows[0]?.value || 0) / total) * 100 : 100;
    const filterDimension = tab === 'devices' ? 'device' : tab === 'browsers' ? 'browser' : 'os';
    const tone: AccentTone = tab === 'devices' ? 'blue' : tab === 'browsers' ? 'violet' : 'cyan';

    return (
        <PanelShell
            title={title}
            eyebrow="Platforms"
            tone="violet"
            tabs={[
                { key: 'browsers', label: 'Browsers' },
                { key: 'devices', label: 'Devices' },
                { key: 'os', label: 'OS' },
            ]}
            activeTab={tab}
            onTabChange={(key) => setTab(key as 'browsers' | 'devices' | 'os')}
            leftLabel={tab === 'devices' ? 'Device' : tab === 'browsers' ? 'Browser' : 'OS'}
            rightLabel="Sessions"
            meta={`${Math.min(rows.length, rowLimit)} rows`}
        >
            <div className="space-y-1 pb-1">
                {rows.length === 0 && (
                    <PanelEmptyState title="No device data yet" copy="Technology breakdowns will populate once the selected period includes tracked sessions." />
                )}
                {rows.slice(0, rowLimit).map((item: any) => {
                    const pct = total > 0 ? (item.value / total) * 100 : 0;
                    const icon = tab === 'devices'
                        ? <DeviceIcon device={item.name} />
                        : tab === 'browsers'
                        ? <BrowserIcon browser={item.name} />
                        : <OSIcon os={item.name} />;
                    return (
                        <DataRow
                            key={item.name}
                            label={item.name}
                            value={item.value}
                            percentage={pct}
                            maxPercentage={maxPct}
                            icon={icon}
                            onClick={() => toggleFilter(filterDimension, item.name)}
                            active={filters[filterDimension].includes(item.name)}
                            tone={tone}
                        />
                    );
                })}
            </div>
        </PanelShell>
    );
}

function GeoPanel({
    title,
    rowLimit,
    countries,
    cities,
    languages,
    allCountries,
    filters,
    toggleFilter,
}: {
    title: string;
    rowLimit: number;
    countries: any[];
    cities: any[];
    languages: any[];
    allCountries: any[];
    filters: DashboardFilters;
    toggleFilter: (dimension: any, value: string) => void;
}) {
    const [tab, setTab] = useState<'countries' | 'cities' | 'languages' | 'map'>('countries');

    const countriesTotal = allCountries.reduce((sum: number, item: any) => sum + (item.users || 0), 0);
    const countryMaxPct = countriesTotal > 0 ? ((allCountries[0]?.users || 0) / countriesTotal) * 100 : 100;
    const citiesTotal = cities.reduce((sum: number, item: any) => sum + (item.users || 0), 0);
    const citiesMaxPct = citiesTotal > 0 ? ((cities[0]?.users || 0) / citiesTotal) * 100 : 100;
    const languagesTotal = languages.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const languagesMaxPct = languagesTotal > 0 ? ((languages[0]?.value || 0) / languagesTotal) * 100 : 100;

    return (
        <PanelShell
            title={title}
            eyebrow="Geography"
            tone="mint"
            tabs={[
                { key: 'countries', label: 'Countries' },
                { key: 'cities', label: 'Cities' },
                { key: 'languages', label: 'Languages' },
                { key: 'map', label: 'Map' },
            ]}
            activeTab={tab}
            onTabChange={(key) => setTab(key as 'countries' | 'cities' | 'languages' | 'map')}
            leftLabel={tab === 'countries' ? 'Country' : tab === 'cities' ? 'City' : tab === 'languages' ? 'Language' : ''}
            rightLabel={tab === 'languages' ? 'Visitors' : tab === 'map' ? '' : 'Users'}
            meta={`${Math.min(tab === 'countries' ? countries.length : tab === 'cities' ? cities.length : languages.length, rowLimit)} rows`}
            rightSlot={
                <div className="flex items-center gap-1">
                    {allCountries.slice(0, 3).map((country: any, index: number) => (
                        <CountryFlag key={`${country.country}-${index}`} country={country.country} />
                    ))}
                </div>
            }
        >
            {tab === 'map' ? (
                <div className="h-full min-h-[260px] p-2">
                    <div className="h-full overflow-hidden rounded-[16px] border border-white/[0.05] bg-black/10">
                        <WorldMap
                            byCountry={allCountries.map((country: any) => ({ country: country.country, users: country.users }))}
                            byCity={cities.map((city: any) => ({ city: city.city, country: city.country, users: city.users }))}
                            onBubbleClick={(name: string) => toggleFilter('country', name)}
                            activeCountry={filters.country[0] || null}
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-1 pb-1">
                    {tab === 'countries' && countries.length === 0 && (
                        <PanelEmptyState title="No country data yet" copy="Geo breakdowns will appear when the selected period contains enough visitors." />
                    )}
                    {tab === 'countries' && countries.slice(0, rowLimit).map((country: any) => {
                        const pct = countriesTotal > 0 ? (country.users / countriesTotal) * 100 : 0;
                        return (
                            <DataRow
                                key={country.country}
                                label={country.country}
                                value={country.users}
                                percentage={pct}
                                maxPercentage={countryMaxPct}
                                icon={<CountryFlag country={country.country} />}
                                onClick={() => toggleFilter('country', country.country)}
                                active={filters.country.includes(country.country)}
                                tone="mint"
                            />
                        );
                    })}
                    {tab === 'cities' && cities.slice(0, rowLimit).map((city: any, index: number) => {
                        const pct = citiesTotal > 0 ? (city.users / citiesTotal) * 100 : 0;
                        return (
                            <DataRow
                                key={`${city.city}-${city.country}-${index}`}
                                label={`${city.city}, ${city.country}`}
                                value={city.users}
                                percentage={pct}
                                maxPercentage={citiesMaxPct}
                                icon={<CountryFlag country={city.country} />}
                                tone="cyan"
                            />
                        );
                    })}
                    {tab === 'languages' && languages.slice(0, rowLimit).map((language: any) => {
                        const pct = languagesTotal > 0 ? (language.value / languagesTotal) * 100 : 0;
                        return (
                            <DataRow
                                key={language.name}
                                label={language.name}
                                value={language.value}
                                percentage={pct}
                                maxPercentage={languagesMaxPct}
                                tone="blue"
                            />
                        );
                    })}
                </div>
            )}
        </PanelShell>
    );
}

function EngagementCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const score = Math.min(100, Math.round(
        (Math.min(kpis.avgSessionDuration / 300, 1) * 30) +
        (Math.min(kpis.pagesPerSession / 5, 1) * 25) +
        (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25) +
        (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
    ));
    const tier = score >= 70 ? 'High intent' : score >= 40 ? 'Healthy' : 'Needs work';
    const activeSegments = Math.max(1, Math.round(score / 10));

    return (
        <div className={`${CARD} analytics-insight-card p-4 sm:p-5`}>
            <div className="analytics-kicker">
                <span className="analytics-dot" style={{ color: ACCENT_COLORS.amber, backgroundColor: ACCENT_COLORS.amber }} />
                Engagement
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-lg font-semibold text-white">Engagement Score</h4>
                    <p className="mt-1 text-sm text-zinc-400">Longer sessions, more depth, and lower bounce lift this score.</p>
                </div>
                <Target className="h-5 w-5 text-[var(--analytics-amber)]" />
            </div>
            <div className="mt-6 flex items-end gap-2">
                <AnimatedCounter value={score} className="text-4xl font-semibold leading-none text-[var(--analytics-amber)]" />
                <span className="pb-1 text-sm text-zinc-500">/ 100</span>
            </div>
            <div className="mt-4 analytics-segment-meter">
                {Array.from({ length: 10 }).map((_, index) => (
                    <span key={index} style={index < activeSegments ? { background: 'linear-gradient(90deg, #ffb454, #ffd27f)' } : undefined} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
                <span className="analytics-note-pill subtle">{tier}</span>
                <span className="text-zinc-500">{fmtDur(kpis.avgSessionDuration || 0)} avg duration</span>
            </div>
        </div>
    );
}

function LoyaltyCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const returning = kpis.returningUsers || 0;
    const total = Math.max(kpis.totalUsers || 0, 1);
    const loyaltyPct = Math.round((returning / total) * 100);
    const newPct = 100 - loyaltyPct;
    const label = loyaltyPct >= 35 ? 'Returning audience is compounding well.' : loyaltyPct >= 20 ? 'Loyalty is growing, with room to deepen repeat visits.' : 'Traffic is mostly first-touch right now.';

    return (
        <div className={`${CARD} analytics-insight-card p-4 sm:p-5`}>
            <div className="analytics-kicker">
                <span className="analytics-dot" style={{ color: ACCENT_COLORS.violet, backgroundColor: ACCENT_COLORS.violet }} />
                Loyalty
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-lg font-semibold text-white">Audience Loyalty</h4>
                    <p className="mt-1 text-sm text-zinc-400">{label}</p>
                </div>
                <Users className="h-5 w-5 text-[var(--analytics-violet)]" />
            </div>
            <div className="mt-6 flex items-end gap-2">
                <AnimatedCounter value={loyaltyPct} className="text-4xl font-semibold leading-none text-[var(--analytics-violet)]" />
                <span className="pb-1 text-sm text-zinc-500">% returning</span>
            </div>
            <div className="mt-4 space-y-2">
                <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>New</span>
                    <span>Returning</span>
                </div>
                <div className="analytics-progress-track flex h-3">
                    <div className="h-full bg-violet-500/55" style={{ width: `${newPct}%` }} />
                    <div className="h-full bg-emerald-400/70" style={{ width: `${loyaltyPct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                    <span className="font-medium text-violet-300">{newPct}% new</span>
                    <span className="font-medium text-emerald-300">{loyaltyPct}% returning</span>
                </div>
            </div>
        </div>
    );
}

function DiversityCard({ channels }: { channels: any[] }) {
    if (!channels.length) return null;
    const total = channels.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const shares = channels.map((item: any) => (item.value || 0) / Math.max(total, 1));
    const entropy = -shares.reduce((sum: number, share: number) => sum + (share > 0 ? share * Math.log2(share) : 0), 0);
    const maxEntropy = Math.log2(Math.max(channels.length, 1));
    const score = Math.round((entropy / Math.max(maxEntropy, 0.01)) * 100);
    const label = score >= 60 ? 'Healthy spread' : score >= 35 ? 'Moderately concentrated' : 'Heavily concentrated';
    const tones: AccentTone[] = ['mint', 'blue', 'violet', 'amber'];

    return (
        <div className={`${CARD} analytics-insight-card p-4 sm:p-5`}>
            <div className="analytics-kicker">
                <span className="analytics-dot" style={{ color: ACCENT_COLORS.blue, backgroundColor: ACCENT_COLORS.blue }} />
                Acquisition balance
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-lg font-semibold text-white">Source Diversity</h4>
                    <p className="mt-1 text-sm text-zinc-400">A broader mix reduces dependence on any single source.</p>
                </div>
                <Globe className="h-5 w-5 text-[var(--analytics-blue)]" />
            </div>
            <div className="mt-6 flex items-end gap-2">
                <AnimatedCounter value={score} className="text-4xl font-semibold leading-none text-[var(--analytics-blue)]" />
                <span className="pb-1 text-sm text-zinc-500">/ 100</span>
            </div>
            <div className="mt-3">
                <span className="analytics-note-pill subtle text-xs">{label}</span>
            </div>
            <div className="mt-4 space-y-2.5">
                {channels.slice(0, 4).map((channel: any, index: number) => {
                    const pct = Math.round(((channel.value || 0) / Math.max(total, 1)) * 100);
                    const tone = tones[index] || 'blue';
                    return (
                        <div key={channel.name} className="flex items-center gap-3 text-xs">
                            <div className="flex min-w-[116px] items-center gap-2">
                                <ChannelIcon channel={channel.name} />
                                <span className="truncate text-zinc-300">{channel.name}</span>
                            </div>
                            <div className="analytics-progress-track h-2 flex-1">
                                <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT_COLORS[tone]}, ${ACCENT_COLORS[tone]}cc)` }}
                                />
                            </div>
                            <span className="min-w-[30px] text-right tabular-nums text-zinc-500">{pct}%</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
