'use client';

/**
 * Inline charts for Ask answers (DESIGN 5.11, section 6). Every chart is a
 * design-system component: ChartCard + TimeSeriesChart, BarList, Donut and
 * Table, so a chart in a chat answer looks exactly like a chart on a page.
 *
 * The exports and their props are unchanged from the old dark charts:
 * ChatMessageRenderer and SnapshotChartRenderer feed them raw tool rows.
 */

import { memo, useMemo } from 'react';

import { ChartCard } from '@/components/charts/ChartCard';
import { BarList, type BarListItem } from '@/components/charts/BarList';
import { Donut, type DonutItem } from '@/components/charts/Donut';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { StatCard } from '@/components/ui/StatCard';
import { Table } from '@/components/ui/Table';
import { fmtFull, fmtPercent, fmtPosition, toIsoDay } from '@/lib/format';
import { categoricalColor, deviceColor, type MetricKey } from '@/lib/metrics';

/* ─── helpers ─── */

type Row = Record<string, unknown>;

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** Tolerate the field-name drift between upstreams (GSC clicks, GA4 sessions, users, value, count). */
function valueOf(r: Row): number {
    return num(r.clicks ?? r.sessions ?? r.users ?? r.value ?? r.count ?? r.pageviews ?? 0);
}

/** Which metric colours the bars: clicks for GSC rows, sessions/users for GA4 rows, grey otherwise. */
function metricOf(rows: Row[]): MetricKey | 'neutral' {
    const r = rows[0] ?? {};
    if (r.clicks !== undefined) return 'clicks';
    if (r.sessions !== undefined) return 'sessions';
    if (r.users !== undefined) return 'users';
    if (r.pageviews !== undefined) return 'pageviews';
    return 'neutral';
}

const METRIC_NOUN: Record<string, string> = {
    clicks: 'clicks', sessions: 'sessions', users: 'users', pageviews: 'views', neutral: 'total',
};

function csvOf(rows: Row[], columns: string[]): () => void {
    return () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const body = [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
        const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trafficclaw-ask.csv';
        a.click();
        URL.revokeObjectURL(url);
    };
}

function ChartShell({ title, subtitle, height = 'compact', children, onDownloadCsv, tableView, className }: {
    title: string;
    subtitle?: string;
    height?: 'compact' | 'default' | number;
    children: React.ReactNode;
    onDownloadCsv?: () => void;
    tableView?: React.ReactNode;
    className?: string;
}) {
    return (
        <ChartCard title={title} subtitle={subtitle} height={height} onDownloadCsv={onDownloadCsv} tableView={tableView} className={className ?? 'my-3'}>
            {children}
        </ChartCard>
    );
}

/* ═══ 1. Trend (date dimension) ═══ */

interface TrendRow { date: string; clicks: number; impressions: number; ctr?: number; position?: number }

export const TrendLineChart = memo(function TrendLineChart({ rows }: { rows: TrendRow[] }) {
    const data = useMemo(() => (rows ?? []).filter((r) => r?.date).map((r) => ({
        date: toIsoDay(r.date),
        clicks: num(r.clicks),
        impressions: num(r.impressions),
    })), [rows]);
    const totals = useMemo(() => ({
        clicks: data.reduce((s, d) => s + d.clicks, 0),
        impressions: data.reduce((s, d) => s + d.impressions, 0),
    }), [data]);

    if (data.length < 2) return null;
    const first = data[0].date;
    const last = data[data.length - 1].date;

    return (
        <ChartShell
            title="Traffic trend"
            subtitle={`${fmtFull(totals.clicks)} clicks · ${fmtFull(totals.impressions)} impressions`}
            height="compact"
        >
            <TimeSeriesChart
                data={data}
                mode="overlay"
                height={200}
                series={[{ metric: 'clicks', key: 'clicks' }, { metric: 'impressions', key: 'impressions' }]}
                ariaLabel={`Clicks and impressions per day, ${first} to ${last}, ${fmtFull(totals.clicks)} clicks in total`}
            />
        </ChartShell>
    );
});

/* ═══ 2. Ranked list (query / page) ═══ */

export const HorizontalBarChart = memo(function HorizontalBarChart({ rows, dimKey, title }: {
    rows: Row[];
    dimKey: string;
    title?: string;
}) {
    const { items, metric, total } = useMemo(() => {
        const m = metricOf(rows ?? []);
        const list: BarListItem[] = (rows ?? [])
            .map((r, i) => {
                const label = String(r[dimKey] ?? r.query ?? r.page ?? '');
                return { key: `${i}-${label}`, label, text: label, value: valueOf(r) };
            })
            .filter((d) => d.label && d.value > 0)
            .sort((a, b) => b.value - a.value);
        return { items: list, metric: m, total: list.reduce((s, d) => s + d.value, 0) };
    }, [rows, dimKey]);

    if (items.length === 0) return null;
    const noun = METRIC_NOUN[metric];
    const subtitle = `${fmtFull(items.length)} ${dimKey === 'query' ? 'keywords' : dimKey === 'page' ? 'pages' : 'rows'} · ${fmtFull(total)} ${noun}`;

    return (
        <ChartShell
            title={title || `Top by ${dimKey}`}
            subtitle={subtitle}
            height={Math.min(items.length, 8) * 36}
            onDownloadCsv={csvOf(rows, [dimKey, 'clicks', 'impressions', 'ctr', 'position'].filter((c) => (rows[0] ?? {})[c] !== undefined))}
        >
            <BarList items={items} metric={metric} limit={8} showShare labelHeader={dimKey === 'query' ? 'Query' : dimKey === 'page' ? 'Page' : 'Name'} />
        </ChartShell>
    );
});

/* ═══ 3. Device split ═══ */

export const DeviceDonutChart = memo(function DeviceDonutChart({ rows }: { rows: Row[] }) {
    const { items, metric } = useMemo(() => {
        const m = metricOf(rows ?? []);
        const list: DonutItem[] = (rows ?? []).map((r, i) => {
            const raw = String(r.device ?? r.name ?? 'Unknown');
            const label = raw.charAt(0).toUpperCase() + raw.slice(1);
            return { key: `${i}-${label}`, label, value: valueOf(r), color: deviceColor(label) };
        }).filter((d) => d.value > 0);
        return { items: list, metric: m };
    }, [rows]);

    if (items.length === 0) return null;

    return (
        <ChartShell title="Device split" subtitle={`${items.length} ${items.length === 1 ? 'device' : 'devices'}`} height="compact">
            <Donut items={items} centerLabel={METRIC_NOUN[metric] === 'total' ? undefined : METRIC_NOUN[metric]} size={140} />
        </ChartShell>
    );
});

/* ═══ 4. Countries ═══ */

const COUNTRY_FLAGS: Record<string, string> = {
    usa: '\u{1F1FA}\u{1F1F8}', ind: '\u{1F1EE}\u{1F1F3}', gbr: '\u{1F1EC}\u{1F1E7}', can: '\u{1F1E8}\u{1F1E6}',
    aus: '\u{1F1E6}\u{1F1FA}', deu: '\u{1F1E9}\u{1F1EA}', fra: '\u{1F1EB}\u{1F1F7}', bra: '\u{1F1E7}\u{1F1F7}',
    jpn: '\u{1F1EF}\u{1F1F5}', mex: '\u{1F1F2}\u{1F1FD}', esp: '\u{1F1EA}\u{1F1F8}', ita: '\u{1F1EE}\u{1F1F9}',
    nld: '\u{1F1F3}\u{1F1F1}', phl: '\u{1F1F5}\u{1F1ED}', pak: '\u{1F1F5}\u{1F1F0}', idn: '\u{1F1EE}\u{1F1E9}',
};

export const CountryBarChart = memo(function CountryBarChart({ rows }: { rows: Row[] }) {
    const { items, metric, total } = useMemo(() => {
        const m = metricOf(rows ?? []);
        // Some upstreams return city- or region-level rows tagged with the country:
        // collapse by country so the list shows top countries, not duplicates.
        const collapsed = new Map<string, number>();
        for (const r of rows ?? []) {
            const label = String(r.country ?? r.name ?? r.region ?? 'Unknown');
            collapsed.set(label, (collapsed.get(label) ?? 0) + valueOf(r));
        }
        const list: BarListItem[] = Array.from(collapsed.entries())
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => ({
                key: label,
                label,
                text: label,
                value,
                icon: <span aria-hidden className="text-[13px] leading-none">{COUNTRY_FLAGS[label.toLowerCase().slice(0, 3)] ?? '\u{1F30D}'}</span>,
            }));
        return { items: list, metric: m, total: list.reduce((s, d) => s + d.value, 0) };
    }, [rows]);

    if (items.length === 0) return null;

    return (
        <ChartShell
            title="Top countries"
            subtitle={`${items.length} ${items.length === 1 ? 'country' : 'countries'} · ${fmtFull(total)} ${METRIC_NOUN[metric]}`}
            height={Math.min(items.length, 6) * 36}
        >
            <BarList items={items} metric={metric} limit={6} showShare labelHeader="Country" />
        </ChartShell>
    );
});

/* ═══ 5. Position distribution ═══ */

export const PositionDistributionChart = memo(function PositionDistributionChart({ rows }: { rows: Row[] }) {
    const items = useMemo<DonutItem[]>(() => {
        const buckets = [
            { key: 'top3', label: 'Top 3', value: 0 },
            { key: '4-10', label: 'Positions 4 to 10', value: 0 },
            { key: '11-20', label: 'Positions 11 to 20', value: 0 },
            { key: '20+', label: 'Beyond 20', value: 0 },
        ];
        for (const r of rows ?? []) {
            const pos = num(r.position) || 50;
            if (pos <= 3) buckets[0].value++;
            else if (pos <= 10) buckets[1].value++;
            else if (pos <= 20) buckets[2].value++;
            else buckets[3].value++;
        }
        return buckets.map((b, i) => ({ ...b, color: categoricalColor(i) }));
    }, [rows]);

    const total = items.reduce((s, d) => s + d.value, 0);
    if (total === 0) return null;

    return (
        <ChartShell title="Position distribution" subtitle={`${fmtFull(total)} keywords`} height="compact">
            <Donut items={items} centerLabel="keywords" size={140} />
        </ChartShell>
    );
});

/* ═══ 6. CTR opportunities ═══ */

const CTR_BENCHMARKS: Record<number, number> = {
    1: 28, 2: 16, 3: 11, 4: 8, 5: 6.5, 6: 5, 7: 4, 8: 3.2, 9: 2.6, 10: 2.2,
};

interface Opportunity { query: string; impressions: number; ctr: number; expected: number; gap: number; position: number }

export const CtrOpportunityList = memo(function CtrOpportunityList({ rows }: { rows: Row[] }) {
    const opportunities = useMemo<Opportunity[]>(() => {
        return (rows ?? [])
            .filter((r) => num(r.impressions) > 100 && num(r.ctr) < 3)
            .sort((a, b) => num(b.impressions) - num(a.impressions))
            .slice(0, 5)
            .map((r) => {
                const pos = Math.round(num(r.position) || 10);
                const expected = CTR_BENCHMARKS[Math.min(pos, 10)] ?? 2;
                const actual = num(r.ctr);
                return {
                    query: String(r.query ?? r.page ?? 'Unknown'),
                    impressions: num(r.impressions),
                    ctr: actual,
                    expected,
                    gap: Math.max(0, expected - actual),
                    position: num(r.position),
                };
            })
            .filter((o) => o.gap > 1);
    }, [rows]);

    if (opportunities.length === 0) return null;

    return (
        <div className="my-3">
            <Table<Opportunity>
                density="compact"
                caption="Keywords with a click-through rate below the benchmark for their position"
                rows={opportunities}
                rowKey={(o) => o.query}
                stickyFirstColumn={false}
                toolbar={
                    <div className="px-4 pt-3.5">
                        <h3 className="text-title-sm text-fg">CTR opportunities</h3>
                        <p className="mt-0.5 text-body-sm text-fg-muted">{opportunities.length} keywords below the benchmark for their position</p>
                    </div>
                }
                columns={[
                    { key: 'query', header: 'Query', cell: (o) => <span className="block max-w-[220px] truncate" title={o.query}>{o.query}</span> },
                    { key: 'pos', header: 'Position', align: 'right', cell: (o) => fmtPosition(o.position) },
                    { key: 'impr', header: 'Impressions', align: 'right', cell: (o) => fmtFull(o.impressions) },
                    { key: 'ctr', header: 'CTR', align: 'right', cell: (o) => fmtPercent(o.ctr / 100) },
                    { key: 'exp', header: 'Typical', align: 'right', cell: (o) => fmtPercent(o.expected / 100) },
                ]}
            />
        </div>
    );
});

/* ═══ 7. Overview metric tiles ═══ */

interface OverviewData {
    totalClicks?: number; clicks?: number;
    totalImpressions?: number; impressions?: number;
    avgCTR?: number; ctr?: number;
    avgPosition?: number; position?: number;
    changeClicks?: number;
    [k: string]: unknown;
}

export const OverviewMetricCards = memo(function OverviewMetricCards({ data }: { data: OverviewData | null | undefined }) {
    if (!data) return null;
    const clicks = data.totalClicks ?? data.clicks;
    const impressions = data.totalImpressions ?? data.impressions;
    const ctr = data.avgCTR ?? data.ctr;
    const position = data.avgPosition ?? data.position;
    // Old payloads give the percent change of clicks; the tile wants a previous value.
    const change = typeof data.changeClicks === 'number' && Number.isFinite(data.changeClicks) ? data.changeClicks : null;
    const previousClicks = typeof clicks === 'number' && change !== null && change > -100 ? clicks / (1 + change / 100) : null;

    const tiles: { metric: MetricKey; value: number; previous?: number | null }[] = [];
    if (typeof clicks === 'number') tiles.push({ metric: 'clicks', value: clicks, previous: previousClicks });
    if (typeof impressions === 'number') tiles.push({ metric: 'impressions', value: impressions });
    // Ratios: the formatter wants 0..1; older payloads send 0..100.
    if (typeof ctr === 'number') tiles.push({ metric: 'ctr', value: ctr > 1 ? ctr / 100 : ctr });
    if (typeof position === 'number') tiles.push({ metric: 'position', value: position });
    if (tiles.length === 0) return null;

    return (
        <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
                <StatCard key={t.metric} metric={t.metric} value={t.value} previous={t.previous} comparisonLabel={t.previous != null ? 'previous period' : undefined} />
            ))}
        </div>
    );
});

/* ═══ Smart panel: ONE most informative chart per tool result ═══ */

export interface StructuredToolResult {
    dimensions: string[];
    rows: Row[];
    totals?: unknown;
}

function hasPositionData(rows: Row[]): boolean {
    return rows.length > 3 && rows.some((r) => r.position !== undefined);
}

export const SmartChartPanel = memo(function SmartChartPanel({ result }: { result: StructuredToolResult }) {
    if (!result?.rows?.length) return null;

    const { dimensions = [], rows } = result;
    const hasDate = dimensions.includes('date');
    const hasQuery = dimensions.includes('query');
    const hasPage = dimensions.includes('page');
    const hasDevice = dimensions.includes('device');
    const hasCountry = dimensions.includes('country');

    // Time series wins over rank breakdowns; device and country are exclusive.
    if (hasDate) return <TrendLineChart rows={rows as unknown as TrendRow[]} />;
    if (hasDevice) return <DeviceDonutChart rows={rows} />;
    if (hasCountry) return <CountryBarChart rows={rows} />;
    if (hasQuery) {
        const hasCtrLeak = rows.some((r) => num(r.impressions) > 100 && num(r.ctr) < 3);
        return hasCtrLeak ? <CtrOpportunityList rows={rows} /> : <HorizontalBarChart rows={rows} dimKey="query" title="Top keywords by clicks" />;
    }
    if (hasPage) return <HorizontalBarChart rows={rows} dimKey="page" title="Top pages by clicks" />;
    if (hasPositionData(rows)) return <PositionDistributionChart rows={rows} />;
    // Never render nothing when rows exist.
    return <GenericRowsTable rows={rows} dimensions={dimensions} />;
});

/* ═══ Generic fallback so the user always sees the data ═══ */

const GenericRowsTable = memo(function GenericRowsTable({ rows, dimensions }: { rows: Row[]; dimensions: string[] }) {
    const cols = useMemo(() => {
        if (!rows.length) return [];
        const keys = Object.keys(rows[0]).slice(0, 6);
        return [...dimensions.filter((d) => keys.includes(d)), ...keys.filter((k) => !dimensions.includes(k))].slice(0, 6);
    }, [rows, dimensions]);
    if (!cols.length) return null;
    const shown = rows.slice(0, 12);
    return (
        <div className="my-3">
            <Table<Row>
                density="compact"
                caption="Result"
                rows={shown}
                rowKey={(_, i) => String(i)}
                stickyFirstColumn={false}
                toolbar={
                    <div className="px-4 pt-3.5">
                        <h3 className="text-title-sm text-fg">Result</h3>
                        <p className="mt-0.5 text-body-sm text-fg-muted">{fmtFull(rows.length)} rows</p>
                    </div>
                }
                columns={cols.map((c, i) => ({
                    key: c,
                    header: c.replace(/_/g, ' '),
                    align: typeof shown[0][c] === 'number' ? ('right' as const) : ('left' as const),
                    cell: (r: Row) => {
                        const v = r[c];
                        return <span className={i === 0 ? 'block max-w-[220px] truncate' : undefined}>{typeof v === 'number' ? fmtFull(v) : String(v ?? '–')}</span>;
                    },
                }))}
                footer={rows.length > shown.length ? <p className="px-4 py-2 text-meta text-fg-muted">+ {fmtFull(rows.length - shown.length)} more rows</p> : undefined}
            />
        </div>
    );
});
