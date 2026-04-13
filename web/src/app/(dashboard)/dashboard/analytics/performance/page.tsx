'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import useSWR from 'swr';
import { Gauge, Monitor, Smartphone } from 'lucide-react';

import {
    AnalyticsSubpageBadge,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsContext } from '../layout';

interface MetricSnapshot {
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface TrendPoint {
    date: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
}

interface PageMetrics {
    page: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
}

interface DeviceMetrics {
    device: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
}

interface PerformanceResponse {
    overview: {
        lcp: MetricSnapshot;
        inp: MetricSnapshot;
        cls: MetricSnapshot;
        fcp: MetricSnapshot;
        ttfb: MetricSnapshot;
    };
    trend: TrendPoint[];
    byPage: PageMetrics[];
    byDevice: DeviceMetrics[];
    score: number;
    source?: 'crux';
    origin?: string;
    collectionPeriod?: {
        firstDate?: { year?: number; month?: number; day?: number };
        lastDate?: { year?: number; month?: number; day?: number };
    };
}

interface ThresholdConfig {
    goodMax: number;
    needsImprovementMax: number;
}

interface PerformanceTableColumn<T> {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    render: (item: T) => ReactNode;
}

type Rating = MetricSnapshot['rating'];
type MetricKey = keyof PerformanceResponse['overview'];

const METRICS: Array<{
    key: MetricKey;
    label: string;
    fullLabel: string;
}> = [
    { key: 'lcp', label: 'LCP', fullLabel: 'Largest Contentful Paint' },
    { key: 'inp', label: 'INP', fullLabel: 'Interaction to Next Paint' },
    { key: 'cls', label: 'CLS', fullLabel: 'Cumulative Layout Shift' },
    { key: 'fcp', label: 'FCP', fullLabel: 'First Contentful Paint' },
    { key: 'ttfb', label: 'TTFB', fullLabel: 'Time to First Byte' },
];

const PRIMARY_METRICS: MetricKey[] = ['lcp', 'inp', 'cls'];

const THRESHOLDS: Record<MetricKey, ThresholdConfig> = {
    lcp: { goodMax: 2.5, needsImprovementMax: 4.0 },
    inp: { goodMax: 200, needsImprovementMax: 500 },
    cls: { goodMax: 0.1, needsImprovementMax: 0.25 },
    fcp: { goodMax: 1.8, needsImprovementMax: 3.0 },
    ttfb: { goodMax: 0.8, needsImprovementMax: 1.8 },
};

const PERFORMANCE_TABLE_HEADER_BASE_CLASS = 'grid gap-0 border-b border-white/[0.1] bg-[#111315]';
const PERFORMANCE_TABLE_ROW_BASE_CLASS = 'group relative grid min-h-[42px] items-center gap-0 overflow-hidden border-b border-white/[0.09] transition md:h-8 md:min-h-8';
const PERFORMANCE_TABLE_FILL_BASE_CLASS = 'absolute left-0 top-[1px] bottom-[1px] rounded-r-[3px] transition';
const PERFORMANCE_TABLE_VALUE_BASE_CLASS = 'relative z-10 text-right font-mono text-[13px] leading-none';

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error || body.detail || 'Request failed');
    }
    return body;
}

function formatMetric(metricKey: MetricKey, value: number) {
    if (metricKey === 'inp') return `${Math.round(value)}ms`;
    if (metricKey === 'cls') return value.toFixed(3);
    return `${value.toFixed(1)}s`;
}

function formatMetricOrDash(metricKey: MetricKey, value: number) {
    if (metricKey !== 'cls' && value <= 0) return '—';
    return formatMetric(metricKey, value);
}

function formatCollectionPeriod(period?: PerformanceResponse['collectionPeriod']) {
    if (
        !period?.firstDate?.year
        || !period.firstDate.month
        || !period.firstDate.day
        || !period?.lastDate?.year
        || !period.lastDate.month
        || !period.lastDate.day
    ) {
        return null;
    }

    const first = new Date(period.firstDate.year, period.firstDate.month - 1, period.firstDate.day);
    const last = new Date(period.lastDate.year, period.lastDate.month - 1, period.lastDate.day);

    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function statusFromScore(score: number): Rating {
    if (score >= 90) return 'good';
    if (score >= 50) return 'needs-improvement';
    return 'poor';
}

function scoreLabel(score: number) {
    if (score >= 90) return 'Healthy';
    if (score >= 50) return 'Needs Improvement';
    return 'At Risk';
}

function compactRatingLabel(rating: Rating) {
    if (rating === 'good') return 'Good';
    if (rating === 'needs-improvement') return 'Needs work';
    return 'Poor';
}

function ratingOrder(rating: Rating) {
    if (rating === 'poor') return 3;
    if (rating === 'needs-improvement') return 2;
    return 1;
}

function rateMetric(metricKey: MetricKey, value: number): Rating {
    const threshold = THRESHOLDS[metricKey];

    if (value <= threshold.goodMax) return 'good';
    if (value <= threshold.needsImprovementMax) return 'needs-improvement';
    return 'poor';
}

function severityClasses(rating: Rating) {
    if (rating === 'good') {
        return {
            value: 'text-emerald-300',
            valueStrong: 'text-emerald-100',
            chip: 'border-emerald-400/28 bg-emerald-500/[0.12] text-emerald-200',
            dot: 'bg-emerald-400',
            marker: '#33CF96',
        };
    }

    if (rating === 'needs-improvement') {
        return {
            value: 'text-[#E7BF63]',
            valueStrong: 'text-[#F7D77C]',
            chip: 'border-[#B88214]/32 bg-[#7B5810]/18 text-[#F1C968]',
            dot: 'bg-[#F2C14E]',
            marker: '#F2C14E',
        };
    }

    return {
        value: 'text-rose-300',
        valueStrong: 'text-rose-100',
        chip: 'border-rose-400/28 bg-rose-500/[0.12] text-rose-200',
        dot: 'bg-rose-400',
        marker: '#F87171',
    };
}

function metricSupportCopy(metricKey: MetricKey) {
    if (metricKey === 'lcp') return 'Improve initial render speed.';
    if (metricKey === 'inp') return 'Reduce interaction latency.';
    if (metricKey === 'cls') return 'Reduce layout movement.';
    if (metricKey === 'fcp') return 'Ship first paint earlier.';
    return 'Tighten server response time.';
}

function thresholdHint(metricKey: MetricKey) {
    const threshold = THRESHOLDS[metricKey];
    if (metricKey === 'inp') {
        return `Target ≤ ${Math.round(threshold.goodMax)}ms`;
    }
    if (metricKey === 'cls') {
        return `Target ≤ ${threshold.goodMax.toFixed(2)}`;
    }
    return `Target ≤ ${threshold.goodMax.toFixed(1)}s`;
}

function PerformanceSurface({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`relative overflow-hidden rounded-[16px] border border-white/[0.14] bg-[#080909] shadow-[0_22px_52px_rgba(0,0,0,0.42)] ${className}`.trim()}>
            {children}
        </section>
    );
}

function StatusPill({
    label,
    status,
}: {
    label: string;
    status: Rating;
}) {
    const classes = severityClasses(status);

    return (
        <span className={`inline-flex items-center rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold ${classes.chip}`}>
            {label}
        </span>
    );
}

function MetricRail({
    metricKey,
    value,
    rating,
}: {
    metricKey: MetricKey;
    value: number;
    rating: Rating;
}) {
    const threshold = THRESHOLDS[metricKey];
    const classes = severityClasses(rating);
    const max = Math.max(threshold.needsImprovementMax * 1.18, value * 1.08, threshold.goodMax * 1.4);
    const goodWidth = (threshold.goodMax / max) * 100;
    const needsWidth = ((threshold.needsImprovementMax - threshold.goodMax) / max) * 100;
    const markerLeft = Math.min(100, (value / max) * 100);

    return (
        <div className="space-y-2.5">
            <div className="relative h-[3px] overflow-hidden rounded-full bg-[#131517]">
                <div className="absolute inset-y-0 left-0 bg-[#33CF96]" style={{ width: `${goodWidth}%` }} />
                <div className="absolute inset-y-0 bg-[#F2C14E]" style={{ left: `${goodWidth}%`, width: `${needsWidth}%` }} />
                <div
                    className="absolute inset-y-0 right-0 bg-[#F87171]"
                    style={{ left: `${goodWidth + needsWidth}%` }}
                />
                <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#070707]"
                    style={{ left: `calc(${markerLeft}% - 5px)`, backgroundColor: classes.marker }}
                />
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-zinc-500">
                <span>{thresholdHint(metricKey)}</span>
                <span>Poor</span>
            </div>
        </div>
    );
}

function InlineVitalTile({
    metricKey,
    snapshot,
}: {
    metricKey: MetricKey;
    snapshot: MetricSnapshot;
}) {
    const metric = METRICS.find((item) => item.key === metricKey)!;
    const classes = severityClasses(snapshot.rating);

    return (
        <div className="rounded-[14px] border border-white/[0.12] bg-[#0A0A0A] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-medium tracking-[-0.01em] text-zinc-400">
                    {metric.fullLabel}
                </p>
                <StatusPill label={compactRatingLabel(snapshot.rating)} status={snapshot.rating} />
            </div>
            <p className={`mt-3 text-[2.05rem] font-semibold leading-none tracking-[-0.06em] ${classes.valueStrong}`}>
                {formatMetric(metricKey, snapshot.value)}
            </p>
            <div className="mt-4">
                <MetricRail metricKey={metricKey} value={snapshot.value} rating={snapshot.rating} />
            </div>
        </div>
    );
}

function OpportunityRow({
    metricKey,
    snapshot,
}: {
    metricKey: MetricKey;
    snapshot: MetricSnapshot;
}) {
    const metric = METRICS.find((item) => item.key === metricKey)!;
    const classes = severityClasses(snapshot.rating);

    return (
        <div className="flex items-start justify-between gap-4 border-t border-white/[0.1] py-3.5 first:border-t-0 first:pt-0 last:pb-0">
            <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                    <p className="text-[13px] font-semibold tracking-[-0.02em] text-white">{metric.fullLabel}</p>
                </div>
                <p className="mt-1 text-[11px] font-medium text-zinc-400">
                    {metricSupportCopy(metricKey)} {thresholdHint(metricKey)}
                </p>
            </div>
            <div className="text-right">
                <p className={`text-[13px] font-semibold ${classes.value}`}>{formatMetric(metricKey, snapshot.value)}</p>
                <p className="mt-1 text-[11px] font-medium text-zinc-500">{compactRatingLabel(snapshot.rating)}</p>
            </div>
        </div>
    );
}

function DeviceMetricRow({
    metricKey,
    mobileValue,
    desktopValue,
}: {
    metricKey: MetricKey;
    mobileValue: number;
    desktopValue: number;
}) {
    const metric = METRICS.find((item) => item.key === metricKey)!;
    const rating = rateMetric(metricKey, mobileValue);
    const classes = severityClasses(rating);

    return (
        <div className="flex items-center justify-between gap-4 border-t border-white/[0.1] py-3.5 first:border-t-0 first:pt-0 last:pb-0">
            <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                    <p className="text-[13px] font-semibold tracking-[-0.02em] text-white">{metric.fullLabel}</p>
                </div>
                <p className="mt-1 text-[11px] font-medium text-zinc-400">
                    Desktop {formatMetricOrDash(metricKey, desktopValue)}
                </p>
            </div>
            <div className="text-right">
                <p className={`text-[13px] font-semibold ${classes.value}`}>{formatMetricOrDash(metricKey, mobileValue)}</p>
                <p className="mt-1 text-[11px] font-medium text-zinc-500">Mobile</p>
            </div>
        </div>
    );
}

function PerformanceTable<T>({
    title,
    rows,
    columns,
    emptyMessage,
    action,
    gridClassName,
    getRowFillValue,
    getRowTone,
}: {
    title: string;
    rows: T[];
    columns: PerformanceTableColumn<T>[];
    emptyMessage: string;
    action?: ReactNode;
    gridClassName: string;
    getRowFillValue?: (item: T) => number;
    getRowTone?: (item: T) => Rating;
}) {
    const maxFillValue = getRowFillValue
        ? rows.reduce((max, row) => Math.max(max, getRowFillValue(row)), 0)
        : 0;

    return (
        <PerformanceSurface className="px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-[1.03rem] font-semibold tracking-[-0.03em] text-white">{title}</h3>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>

            <div className="overflow-hidden rounded-[14px] border border-white/[0.12] bg-[#090A0B]">
                <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                        <div className={cx(PERFORMANCE_TABLE_HEADER_BASE_CLASS, 'hidden md:grid', gridClassName)}>
                            {columns.map((column, index) => (
                                <div
                                    key={column.key}
                                    className={cx(
                                        'px-4 py-2.5 text-[11px] font-semibold text-zinc-400',
                                        index > 0 && 'border-l border-white/[0.08]',
                                        column.align === 'right'
                                            ? 'text-right'
                                            : column.align === 'center'
                                                ? 'text-center'
                                                : 'text-left',
                                    )}
                                >
                                    {column.label}
                                </div>
                            ))}
                        </div>

                        {rows.length ? rows.map((row, index) => {
                            const fillValue = getRowFillValue ? getRowFillValue(row) : 0;
                            const fillWidth = maxFillValue > 0 && fillValue > 0
                                ? Math.max(10, Math.min(100, (fillValue / maxFillValue) * 100))
                                : 0;
                            const rowTone = getRowTone ? getRowTone(row) : 'needs-improvement';
                            const fillClassName = rowTone === 'good'
                                ? 'bg-emerald-500/[0.10]'
                                : rowTone === 'poor'
                                    ? 'bg-rose-500/[0.10]'
                                    : 'bg-[#F2C14E]/[0.11]';

                            return (
                                <div
                                    key={index}
                                    className={cx(
                                        PERFORMANCE_TABLE_ROW_BASE_CLASS,
                                        gridClassName,
                                        index === rows.length - 1 && 'border-b-0',
                                    )}
                                >
                                    {fillWidth ? (
                                        <div
                                            className={cx(PERFORMANCE_TABLE_FILL_BASE_CLASS, fillClassName)}
                                            style={{ width: `${fillWidth}%` }}
                                        />
                                    ) : null}

                                    {columns.map((column, columnIndex) => (
                                        <div
                                            key={column.key}
                                            className={cx(
                                                'relative z-10 px-3 py-1.5 md:px-4 md:py-0',
                                                columnIndex > 0 && 'border-l border-white/[0.08]',
                                                column.align === 'right'
                                                    ? 'text-right'
                                                    : column.align === 'center'
                                                        ? 'text-center'
                                                        : 'text-left',
                                            )}
                                        >
                                            <div className="md:hidden text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                                                {column.label}
                                            </div>
                                            {column.render(row)}
                                        </div>
                                    ))}
                                </div>
                            );
                        }) : (
                            <div className="px-4 py-10 text-center text-sm font-medium text-zinc-500">
                                {emptyMessage}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PerformanceSurface>
    );
}

export default function PerformancePage() {
    const { selectedSite, hasGoogleConnection } = useAnalyticsContext();

    const query = selectedSite && hasGoogleConnection
        ? `/api/analytics/performance?siteUrl=${encodeURIComponent(selectedSite)}`
        : null;

    const { data, error, isLoading } = useSWR<PerformanceResponse>(query, fetchJson, {
        keepPreviousData: true,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
    });

    const weakestDevice = useMemo(
        () => data?.byDevice?.reduce((current, device) => (!current || device.score < current.score ? device : current), undefined as DeviceMetrics | undefined),
        [data],
    );

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Performance" />;
    }

    if (!selectedSite) {
        return (
            <AnalyticsSubpageEmptyState
                title="No Search Console site selected"
                description="Pick a site to load the right performance view."
            />
        );
    }

    if (error || !data) {
        return (
            <AnalyticsSubpageEmptyState
                title="Performance data is unavailable"
                description="We couldn't load the latest Core Web Vitals view."
            />
        );
    }

    const collectionWindow = formatCollectionPeriod(data.collectionPeriod);
    const scoreStatus = statusFromScore(data.score);
    const scoreClasses = severityClasses(scoreStatus);
    const statusLabel = scoreLabel(data.score);

    const mobileDevice = data.byDevice.find((device) => device.device.toLowerCase() === 'mobile');
    const desktopDevice = data.byDevice.find((device) => device.device.toLowerCase() === 'desktop');
    const deviceGapPercent = mobileDevice && desktopDevice && desktopDevice.lcp > 0
        ? Math.max(0, ((mobileDevice.lcp - desktopDevice.lcp) / desktopDevice.lcp) * 100)
        : null;

    const topOpportunities = METRICS
        .map((metric) => ({
            metricKey: metric.key,
            snapshot: data.overview[metric.key],
            weight: ratingOrder(data.overview[metric.key].rating),
            overflow: data.overview[metric.key].value - THRESHOLDS[metric.key].goodMax,
        }))
        .filter((item) => item.metricKey === 'cls' || item.snapshot.value > 0)
        .sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return b.overflow - a.overflow;
        })
        .slice(0, 4);

    const deviceRows = [...data.byDevice].sort((a, b) => a.score - b.score);
    const showDeviceGap = Boolean(mobileDevice && desktopDevice);
    const showDeviceTable = deviceRows.length > 0;

    return (
        <div className="space-y-4 sm:space-y-5">
            <PerformanceSurface className="px-5 py-5 sm:px-6">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,193,78,0.12),transparent_30%),radial-gradient(circle_at_left,rgba(242,193,78,0.05),transparent_22%)]" />
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-300">
                            <Gauge className="h-3.5 w-3.5 text-[#F2C14E]" />
                            Performance
                        </div>
                        <h1 className="mt-4 text-[2.55rem] font-semibold tracking-[-0.06em] text-white">
                            Core Web Vitals
                        </h1>
                        <p className="mt-2 text-[13px] font-medium text-zinc-400">
                            Field performance across origin and device records.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {data.source === 'crux' ? <AnalyticsSubpageBadge label="CrUX" tone="emerald" /> : null}
                        {collectionWindow ? <AnalyticsSubpageBadge label={collectionWindow} tone="mixed" /> : null}
                        {data.origin ? <AnalyticsSubpageBadge label={data.origin} tone="mixed" /> : null}
                    </div>
                </div>
            </PerformanceSurface>

            <PerformanceSurface className="px-5 py-5 sm:px-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.82fr)_repeat(3,minmax(0,1fr))]">
                    <div className="rounded-[14px] border border-white/[0.12] bg-[#0A0A0A] px-5 py-5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[12px] font-semibold text-zinc-300">Performance Status</p>
                            <StatusPill label={statusLabel} status={scoreStatus} />
                        </div>
                        <div className="mt-5 flex items-end gap-3">
                            <span className={`text-[4.4rem] font-semibold leading-none tracking-[-0.08em] ${scoreClasses.value}`}>
                                {data.score}
                            </span>
                            <div className="pb-2">
                                <p className={`text-[1.8rem] font-semibold tracking-[-0.04em] ${scoreClasses.value}`}>
                                    {statusLabel}
                                </p>
                                <p className="mt-1 text-[12px] font-medium text-zinc-500">
                                    {weakestDevice ? `Weakest device ${weakestDevice.device}` : 'Latest field collection window'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {PRIMARY_METRICS.map((metricKey) => (
                        <InlineVitalTile
                            key={metricKey}
                            metricKey={metricKey}
                            snapshot={data.overview[metricKey]}
                        />
                    ))}
                </div>
            </PerformanceSurface>

            <div className={`grid gap-4 ${showDeviceGap ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
                <PerformanceSurface className="px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[1.03rem] font-semibold tracking-[-0.03em] text-white">Top Opportunities</h3>
                        <StatusPill
                            label={compactRatingLabel(topOpportunities[0]?.snapshot.rating ?? scoreStatus)}
                            status={topOpportunities[0]?.snapshot.rating ?? scoreStatus}
                        />
                    </div>
                    <div className="mt-4 space-y-0">
                        {topOpportunities.map((item) => (
                            <OpportunityRow
                                key={item.metricKey}
                                metricKey={item.metricKey}
                                snapshot={item.snapshot}
                            />
                        ))}
                    </div>
                </PerformanceSurface>

                {showDeviceGap ? (
                    <PerformanceSurface className="px-5 py-5">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-[1.03rem] font-semibold tracking-[-0.03em] text-white">Average internet</h3>
                            {mobileDevice ? <Smartphone className="h-4 w-4 text-zinc-400" /> : <Monitor className="h-4 w-4 text-zinc-400" />}
                        </div>
                        <p className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.04em] text-white">
                            {`Mobile is ${Math.round(deviceGapPercent ?? 0)}% slower than Desktop`}
                        </p>
                        <p className="mt-2 text-[12px] font-medium text-zinc-400">
                            Based on the current device-level CrUX records.
                        </p>

                        <div className="mt-5 space-y-0">
                            <DeviceMetricRow metricKey="lcp" mobileValue={mobileDevice!.lcp} desktopValue={desktopDevice!.lcp} />
                            <DeviceMetricRow metricKey="inp" mobileValue={mobileDevice!.inp} desktopValue={desktopDevice!.inp} />
                            <DeviceMetricRow metricKey="cls" mobileValue={mobileDevice!.cls} desktopValue={desktopDevice!.cls} />
                        </div>
                    </PerformanceSurface>
                ) : null}
            </div>

            {showDeviceTable ? (
                <PerformanceTable
                    title="Device Split"
                    rows={deviceRows}
                    emptyMessage="No device-level performance rows are available yet."
                    action={collectionWindow ? <AnalyticsSubpageBadge label={collectionWindow} tone="mixed" /> : undefined}
                    gridClassName="grid-cols-[minmax(180px,1.4fr)_84px_96px_96px_96px_96px]"
                    getRowFillValue={(row) => row.score}
                    getRowTone={(row) => statusFromScore(row.score)}
                    columns={[
                        {
                            key: 'device',
                            label: 'Device',
                            render: (row) => {
                                const status = statusFromScore(row.score);
                                const classes = severityClasses(status);

                                return (
                                    <div className="flex items-center gap-3">
                                        <span className={`h-3.5 w-1 rounded-full ${classes.dot}`} />
                                        <span className="truncate text-[14px] font-semibold text-white">{row.device}</span>
                                    </div>
                                );
                            },
                        },
                        {
                            key: 'score',
                            label: 'Score',
                            align: 'right',
                            render: (row) => (
                                <div className={cx(PERFORMANCE_TABLE_VALUE_BASE_CLASS, severityClasses(statusFromScore(row.score)).value)}>
                                    {row.score}
                                </div>
                            ),
                        },
                        {
                            key: 'lcp',
                            label: 'LCP',
                            align: 'right',
                            render: (row) => (
                                <div className={cx(PERFORMANCE_TABLE_VALUE_BASE_CLASS, 'text-zinc-100')}>
                                    {formatMetricOrDash('lcp', row.lcp)}
                                </div>
                            ),
                        },
                        {
                            key: 'inp',
                            label: 'INP',
                            align: 'right',
                            render: (row) => (
                                <div className={cx(PERFORMANCE_TABLE_VALUE_BASE_CLASS, 'text-zinc-100')}>
                                    {formatMetricOrDash('inp', row.inp)}
                                </div>
                            ),
                        },
                        {
                            key: 'cls',
                            label: 'CLS',
                            align: 'right',
                            render: (row) => (
                                <div className={cx(PERFORMANCE_TABLE_VALUE_BASE_CLASS, 'text-zinc-100')}>
                                    {formatMetricOrDash('cls', row.cls)}
                                </div>
                            ),
                        },
                        {
                            key: 'ttfb',
                            label: 'TTFB',
                            align: 'right',
                            render: (row) => (
                                <div className={cx(PERFORMANCE_TABLE_VALUE_BASE_CLASS, row.ttfb > 0 ? 'text-[#F8D56C]' : 'text-zinc-500')}>
                                    {formatMetricOrDash('ttfb', row.ttfb)}
                                </div>
                            ),
                        },
                    ]}
                />
            ) : null}
        </div>
    );
}
