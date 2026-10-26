'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange, fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { fmtMetric, METRICS } from '@/lib/metrics';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { SearchInput, useDebouncedValue } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { countryFromIso3 } from '../lib/geo';
import { displayPage, isLowCtr, isNewRow, isStriking, median, pageRef } from '../lib/rules';
import type { GscDimensionReport, GscRow, GscRowsResponse, GscSeriesPoint, GscSummary } from '../lib/types';
import { LoadError } from '../SiteStates';
import { downloadCsv, useGsc, useSite, useSiteRange } from '../useSiteData';
import { useStringParam, useTabParam } from '../useTabParam';
import { SearchDetailDrawer } from './SearchDetailDrawer';

type SearchMetric = 'clicks' | 'impressions' | 'ctr' | 'position';
const ALL: SearchMetric[] = ['clicks', 'impressions', 'ctr', 'position'];
export const DIMS = ['queries', 'pages', 'countries', 'devices', 'appearance', 'dates'] as const;
export type SearchDim = (typeof DIMS)[number];
const DIM_LABEL: Record<SearchDim, string> = { queries: 'Queries', pages: 'Pages', countries: 'Countries', devices: 'Devices', appearance: 'Search appearance', dates: 'Dates' };
const DIM_HEADER: Record<SearchDim, string> = { queries: 'Query', pages: 'Page', countries: 'Country', devices: 'Device', appearance: 'Appearance', dates: 'Date' };
type Preset = 'striking' | 'lowctr' | 'lost' | 'new';
const PRESET_LABEL: Record<Preset, string> = { striking: 'Striking distance', lowctr: 'Low CTR', lost: 'Lost queries', new: 'New queries' };

/** Four large metric toggles with checkbox semantics; at least one stays on (DESIGN 5.5). */
function MetricToggles({ summary, loading, selected, onToggle }: { summary?: GscSummary; loading: boolean; selected: SearchMetric[]; onToggle: (k: SearchMetric) => void }) {
    const { compareOn, compareText } = useSiteRange();
    return (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-card border-b border-border-subtle bg-border-subtle md:grid-cols-4">
            {ALL.map((k) => {
                const on = selected.includes(k);
                const m = METRICS[k];
                return (
                    <button
                        key={k}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => onToggle(k)}
                        className={cn('relative flex flex-col items-start gap-1 p-4 text-left transition-colors duration-120 focus-visible:-outline-offset-2', on ? 'bg-surface' : 'bg-surface-sunken hover:bg-surface')}
                    >
                        {on ? <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: m.color }} /> : null}
                        <span className="flex items-center gap-2 text-body-sm font-medium text-fg-secondary">
                            <span aria-hidden className={cn('flex size-4 items-center justify-center rounded-[4px] border', on ? 'border-transparent' : 'border-border-strong')} style={on ? { background: m.color } : undefined}>
                                {on ? <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-none stroke-white stroke-2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg> : null}
                            </span>
                            {m.label}
                        </span>
                        {loading ? <Skeleton className="h-7 w-20" /> : !summary ? (
                            // Failed (the chart below says why and offers Try again): a dash, not a skeleton forever.
                            <span className="text-stat text-fg-faint" aria-label="No data">–</span>
                        ) : (
                            <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className={cn('text-stat', on ? 'text-fg' : 'text-fg-muted')}>{fmtMetric(k, summary.totals[k], { compact: true, tile: true })}</span>
                                {compareOn && summary.previous ? <MetricDelta metric={k} current={summary.totals[k]} previous={summary.previous[k]} comparisonLabel={`versus ${compareText}`} /> : null}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function rowLabel(dim: SearchDim, key: string, siteHost: string | null): { text: string; node: React.ReactNode } {
    if (dim === 'pages') {
        const t = displayPage(pageRef(key), siteHost);
        return { text: t, node: <span title={key}>{t}</span> };
    }
    if (dim === 'countries') {
        const c = countryFromIso3(key);
        return { text: c.name, node: <span className="flex items-center gap-2">{c.flag ? <span aria-hidden>{c.flag}</span> : null}{c.name}</span> };
    }
    if (dim === 'devices' || dim === 'appearance') {
        const t = key.toLowerCase().replace(/_/g, ' ');
        return { text: t[0]?.toUpperCase() + t.slice(1), node: t[0]?.toUpperCase() + t.slice(1) };
    }
    return { text: key, node: <span title={key}>{key}</span> };
}

/** Search > Performance: metric toggles + chart, opportunity presets, dimension tables, query/page drawer. */
export function PerformanceTab() {
    const site = useSite();
    const { compareOn, dr } = useSiteRange();
    const summary = useGsc<GscSummary>('summary');
    const [selected, setSelected] = useState<SearchMetric[]>(['clicks', 'impressions']);
    const [mode, setMode] = useState<'overlay' | 'split'>('overlay');
    const [dim, setDim] = useTabParam(DIMS, { name: 'dim' });
    const [presetRaw, setPreset] = useStringParam('filter');
    const preset = (presetRaw && presetRaw in PRESET_LABEL ? presetRaw : null) as Preset | null;
    const [detail, setDetail] = useStringParam('detail', 'push');
    const tableReport: GscDimensionReport | null = dim === 'dates' ? null : dim;
    const rowsQ = useGsc<GscRowsResponse>(tableReport);
    const queriesQ = useGsc<GscRowsResponse>('queries');
    const [search, setSearch] = useState('');
    const q = useDebouncedValue(search, 120).trim().toLowerCase();

    const toggle = (k: SearchMetric) => setSelected((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : ALL.filter((x) => cur.includes(x) || x === k)));

    // Opportunity presets work on queries (and pages for striking / low CTR).
    const counts = useMemo(() => {
        const rows = queriesQ.data?.rows ?? [];
        const med = median(rows.filter((r) => r.impressions > 0).map((r) => r.impressions));
        return {
            med,
            striking: rows.filter((r) => isStriking(r, med)).length,
            lowctr: rows.filter((r) => isLowCtr(r)).length,
            new: rows.filter(isNewRow).length,
            lost: queriesQ.data?.lost.length ?? 0,
        };
    }, [queriesQ.data]);

    const dateRows: GscRow[] = useMemo(() => (summary.data?.series ?? []).map((p: GscSeriesPoint) => ({
        key: p.date, clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.position,
        prev: compareOn && p.prevDate ? { clicks: p.prev_clicks ?? 0, impressions: p.prev_impressions ?? 0, ctr: p.prev_ctr ?? 0, position: p.prev_position ?? 0 } : undefined,
    })), [summary.data, compareOn]);

    const presetApplies = preset && (dim === 'queries' || (dim === 'pages' && (preset === 'striking' || preset === 'lowctr')));
    const baseRows: GscRow[] = useMemo(() => {
        if (dim === 'dates') return dateRows;
        const d = rowsQ.data;
        if (!d) return [];
        if (!presetApplies) return d.rows;
        if (preset === 'lost') return d.lost;
        if (preset === 'new') return d.rows.filter(isNewRow);
        if (preset === 'striking') {
            const med = dim === 'queries' ? counts.med : median(d.rows.filter((r) => r.impressions > 0).map((r) => r.impressions));
            return d.rows.filter((r) => isStriking(r, med));
        }
        return d.rows.filter((r) => isLowCtr(r, dim === 'pages' ? 200 : 100));
    }, [dim, dateRows, rowsQ.data, preset, presetApplies, counts.med]);

    const rows = useMemo(() => (q ? baseRows.filter((r) => rowLabel(dim, r.key, site.siteHost).text.toLowerCase().includes(q) || r.key.toLowerCase().includes(q)) : baseRows), [baseRows, q, dim, site.siteHost]);

    const columns: TableColumn<GscRow>[] = [
        {
            key: 'label', header: DIM_HEADER[dim], width: '38%', sortable: true, firstSortDir: dim === 'dates' ? 'desc' : 'asc',
            sortValue: (r) => (dim === 'dates' ? r.key : rowLabel(dim, r.key, site.siteHost).text),
            cell: (r) => (dim === 'dates' ? fmtDateRange(r.key, r.key) : rowLabel(dim, r.key, site.siteHost).node),
            heat: { metric: 'clicks', value: (r) => r.clicks },
        },
        {
            key: 'clicks', header: 'Clicks', align: 'right', sortable: true, sortValue: (r) => r.clicks,
            cell: (r) => (preset === 'lost' && presetApplies ? <span className="text-fg-muted">0 <span className="text-meta">(was {fmtFull(r.prev?.clicks ?? 0)})</span></span> : fmtFull(r.clicks)),
        },
        ...(compareOn ? [{
            key: 'delta', header: 'Δ', align: 'right' as const, sortable: true,
            sortValue: (r: GscRow) => r.clicks - (r.prev?.clicks ?? 0),
            cell: (r: GscRow) => (r.prev === undefined ? '' : <MetricDelta metric="clicks" current={r.clicks} previous={r.prev?.clicks ?? null} />),
        }] : []),
        { key: 'impressions', header: 'Impr.', align: 'right', sortable: true, sortValue: (r) => r.impressions, cell: (r) => fmtFull(r.impressions) },
        { key: 'ctr', header: 'CTR', align: 'right', sortable: true, sortValue: (r) => r.ctr, cell: (r) => fmtPercent(r.ctr) },
        { key: 'position', header: 'Position', align: 'right', sortable: true, firstSortDir: 'asc', sortValue: (r) => (r.impressions ? r.position : null), cell: (r) => (r.impressions ? fmtPosition(r.position) : '–') },
    ];

    const exportCsv = () => downloadCsv(`search-${dim}.csv`, [DIM_HEADER[dim], 'Clicks', 'Impressions', 'CTR', 'Position', ...(compareOn ? ['Clicks (previous)'] : [])],
        rows.map((r) => [dim === 'pages' ? r.key : rowLabel(dim, r.key, site.siteHost).text, r.clicks, r.impressions, r.ctr.toFixed(4), r.position.toFixed(2), ...(compareOn ? [r.prev?.clicks ?? ''] : [])]));

    const s = summary.data;
    const chartSeries = selected.map((k) => ({ metric: k, key: k, compareKey: compareOn && selected.length === 1 ? `prev_${k}` : undefined }));
    const tableLoading = dim === 'dates' ? summary.state === 'loading' : rowsQ.state === 'loading';
    const tableError = dim === 'dates' ? summary : rowsQ;

    return (
        <div className="flex flex-col gap-4">
            <Card padding="none" className="overflow-visible">
                <MetricToggles summary={s} loading={summary.state === 'loading'} selected={selected} onToggle={toggle} />
                <div className="p-4 md:p-5">
                    <ChartCard
                        className="!border-0 !p-0 !shadow-none"
                        title={selected.map((k) => METRICS[k].label).join(', ')}
                        subtitle={selected.length > 1 && mode === 'overlay' ? 'Lines use separate scales; the axis shows the first one' : selected.includes('position') ? 'Position: lower is better' : compareOn ? `Dashed: ${dr.compareLabel.replace(/^vs /, '')}` : undefined}
                        actions={selected.length > 1 ? (
                            <SegmentedControl ariaLabel="Chart mode" size="sm" variant="neutral" value={mode} onChange={setMode} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'split', label: 'Split' }]} />
                        ) : undefined}
                        state={summary.state === 'error' ? 'error' : s && s.totals.impressions === 0 ? 'empty' : summary.state}
                        error={{ message: summary.error?.message, onRetry: summary.mutate }}
                        empty={{ title: 'No impressions in this period', description: 'New sites can take a few weeks to show up in Google.' }}
                        height={selected.length > 1 && mode === 'split' ? selected.length * 160 : 300}
                        footer={s?.lastDate ? `Data through ${fmtDateRange(s.lastDate, s.lastDate)} · Search Console is about 2 days behind` : undefined}
                    >
                        <TimeSeriesChart
                            data={(s?.series ?? []) as unknown as Record<string, number | string | null>[]}
                            series={chartSeries}
                            mode={selected.length > 1 ? mode : 'single'}
                            compareDateKey="prevDate"
                            height={selected.length > 1 && mode === 'split' ? selected.length * 160 : 300}
                            ariaLabel={`${selected.map((k) => METRICS[k].label).join(', ')} per day`}
                        />
                    </ChartCard>
                </div>
            </Card>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Opportunity filters">
                <span className="text-meta text-fg-muted">Opportunities:</span>
                {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => {
                    const active = preset === p;
                    const n = counts[p];
                    return (
                        <button
                            key={p}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                void setPreset(active ? null : p);
                                if (!active && dim !== 'queries' && !(dim === 'pages' && (p === 'striking' || p === 'lowctr'))) setDim('queries');
                            }}
                            disabled={(p === 'lost' || p === 'new') && !compareOn}
                            title={(p === 'lost' || p === 'new') && !compareOn ? 'Turn on a comparison period to see lost and new queries' : undefined}
                            className={cn(
                                'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-body-sm pointer-coarse:h-8 transition-colors duration-120 disabled:opacity-50',
                                active ? 'border-transparent bg-brand-soft text-brand-soft-fg' : 'border-border-subtle bg-surface text-fg-secondary hover:bg-subtle',
                            )}
                        >
                            {PRESET_LABEL[p]}
                            <span className="text-meta tabular-nums opacity-80">{queriesQ.data ? fmtFull(n) : '…'}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3">
                <Tabs<SearchDim> ariaLabel="Search breakdown" items={DIMS.map((d) => ({ value: d, label: DIM_LABEL[d] }))} value={dim} onValueChange={(d) => { setDim(d); setSearch(''); }} />
                {tableError.state === 'error' ? <LoadError error={tableError.error} onRetry={tableError.mutate} /> : (
                    <Table<GscRow>
                        caption={`Search ${DIM_LABEL[dim].toLowerCase()}`}
                        rows={rows}
                        rowKey={(r) => r.key}
                        columns={columns}
                        loading={tableLoading}
                        defaultSort={dim === 'dates' ? { key: 'label', dir: 'desc' } : { key: 'clicks', dir: 'desc' }}
                        pagination={{ pageSize: 25 }}
                        onRowClick={dim === 'queries' || dim === 'pages' ? (r) => void setDetail(`${dim === 'queries' ? 'q' : 'p'}:${r.key}`) : undefined}
                        empty={<EmptyState variant="inline" title={q ? 'No rows match your search' : presetApplies ? `No ${PRESET_LABEL[preset!].toLowerCase()} right now` : 'No data in this period'} />}
                        toolbar={(
                            <>
                                {dim !== 'dates' ? <SearchInput size="sm" slashShortcut={false} value={search} onValueChange={setSearch} placeholder={`${DIM_HEADER[dim]} contains…`} className="w-full sm:w-64" /> : null}
                                {presetApplies ? (
                                    <Button size="sm" variant="subtle" onClick={() => void setPreset(null)}>{PRESET_LABEL[preset!]} ×</Button>
                                ) : null}
                                <span className="ml-auto text-meta text-fg-muted tabular-nums">
                                    {fmtFull(rows.length)} rows{rowsQ.data?.truncated && dim !== 'dates' ? ' (top rows only)' : ''}
                                </span>
                                <Button size="sm" variant="ghost" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export</Button>
                            </>
                        )}
                    />
                )}
            </div>
            <SearchDetailDrawer
                kind={detail?.startsWith('p:') ? 'page' : 'query'}
                value={detail ? detail.slice(2) : null}
                onClose={() => void setDetail(null)}
            />
        </div>
    );
}
