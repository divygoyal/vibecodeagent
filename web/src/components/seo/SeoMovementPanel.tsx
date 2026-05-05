'use client';

import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useOpportunitiesData, useWinnersLosersData } from '@/lib/useDashboardData';
import MagnitudeTable, { type MagnitudeColumn } from './MagnitudeTable';

interface SeoMovementPanelProps {
    activeSite: string | null;
    onSelectKeyword: (keyword: string) => void;
}

type MovementTab = 'winners' | 'losers' | 'new' | 'lost';
type OppTab = 'striking' | 'ctr' | 'decay';

interface MovementRow {
    query: string;
    clicksCurrent: number;
    clicksPrevious: number;
    clicksDelta: number;
    clicksDeltaPct: number;
    positionCurrent: number;
    positionPrevious: number;
    positionDelta: number;
    impressionsCurrent: number;
}

interface QueryRow {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

const EXPECTED_CTR: Record<number, number> = {
    1: 31.7, 2: 24.7, 3: 18.7, 4: 13.6, 5: 9.5,
    6: 6.2, 7: 4.2, 8: 3.1, 9: 2.4, 10: 2.1,
    11: 1.8, 12: 1.6, 13: 1.4, 14: 1.2, 15: 1.0,
};

function getExpectedCtr(position: number): number {
    const rounded = Math.min(15, Math.max(1, Math.round(position)));
    return EXPECTED_CTR[rounded] || 0.8;
}

function MovementCard({ activeSite, onSelectKeyword }: { activeSite: string | null; onSelectKeyword: (k: string) => void }) {
    const [tab, setTab] = useState<MovementTab>('winners');
    const { data, error, isLoading } = useWinnersLosersData(activeSite, '28d');
    const rows = (data?.[tab] as MovementRow[]) || [];

    const cols: MagnitudeColumn<MovementRow>[] = [
        {
            key: 'query',
            label: 'Query',
            sortable: true,
            getValue: r => r.query,
            render: r => <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span>,
        },
        {
            key: 'clicksCurrent',
            label: 'Clicks',
            width: '80px',
            align: 'right',
            sortable: true,
            getValue: r => r.clicksCurrent,
            render: r => <span className="tabular-nums">{formatCompactNumber(r.clicksCurrent)}</span>,
        },
        {
            key: 'clicksDelta',
            label: 'Δ Clicks',
            width: '92px',
            align: 'right',
            sortable: true,
            getValue: r => r.clicksDelta,
            render: r => {
                const positive = r.clicksDelta >= 0;
                return (
                    <span className={`inline-flex items-center justify-end gap-1 font-medium tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {positive ? '+' : ''}{r.clicksDelta}
                    </span>
                );
            },
        },
        {
            key: 'positionDelta',
            label: 'Δ Pos.',
            width: '76px',
            align: 'right',
            sortable: true,
            getValue: r => r.positionDelta,
            render: r => {
                if (!r.positionPrevious) return <span className="text-zinc-600">–</span>;
                const improved = r.positionDelta < 0;
                return (
                    <span className={`tabular-nums ${improved ? 'text-emerald-400' : r.positionDelta > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {r.positionDelta > 0 ? '+' : ''}{r.positionDelta.toFixed(1)}
                    </span>
                );
            },
        },
    ];

    const tabs: Array<{ key: MovementTab; label: string; tone: string }> = [
        { key: 'winners', label: 'Winners', tone: 'emerald' },
        { key: 'losers', label: 'Losers', tone: 'red' },
        { key: 'new', label: 'New', tone: 'cyan' },
        { key: 'lost', label: 'Lost', tone: 'amber' },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Query movement"
            description="28-day vs prior 28-day comparison. Track which queries are climbing, slipping, or showing up for the first time."
            tone="emerald"
            action={
                <div className="inline-flex flex-wrap rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`rounded-[10px] px-2.5 py-1.5 transition ${tab === t.key ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            }
        >
            {!activeSite ? (
                <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Select a site to load query movement.
                </div>
            ) : isLoading ? (
                <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Loading movement data…
                </div>
            ) : error ? (
                <div className="rounded-[16px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
                    Couldn&apos;t load movement data. {error.info?.error || error.message}
                </div>
            ) : (
                <MagnitudeTable
                    rows={rows}
                    columns={cols}
                    getMagnitude={r => Math.abs(r.clicksDelta) || r.clicksCurrent || 1}
                    searchKey={r => r.query}
                    searchPlaceholder="Search query"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage={`No ${tab === 'new' ? 'new queries' : tab === 'lost' ? 'lost queries' : `${tab} this period`} yet.`}
                    maxRows={10}
                    defaultSort={{ key: 'clicksDelta', dir: tab === 'losers' ? 'asc' : 'desc' }}
                    barColor={tab === 'winners' || tab === 'new' ? 'rgba(52, 211, 153, 0.10)' : 'rgba(248, 113, 113, 0.08)'}
                />
            )}
        </AnalyticsSubpagePanel>
    );
}

function OpportunityCard({ activeSite, onSelectKeyword }: { activeSite: string | null; onSelectKeyword: (k: string) => void }) {
    const [tab, setTab] = useState<OppTab>('striking');
    const { data, error, isLoading } = useOpportunitiesData(activeSite, '28d');

    const strikingRows = useMemo(() => {
        const queries = (data?.queries as QueryRow[] | undefined) || [];
        return queries.filter(q => q.position >= 11 && q.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 30);
    }, [data]);

    const ctrLabRows = useMemo(() => {
        const queries = (data?.queries as QueryRow[] | undefined) || [];
        return queries
            .filter(q => q.position <= 15 && q.impressions >= 100)
            .map(q => ({
                ...q,
                expectedCtr: getExpectedCtr(q.position),
                ctrGap: getExpectedCtr(q.position) - q.ctr,
            }))
            .filter(q => q.ctrGap > 0.5)
            .sort((a, b) => b.ctrGap * b.impressions - a.ctrGap * a.impressions)
            .slice(0, 30);
    }, [data]);

    const decayRows = useMemo(() => {
        const queries = (data?.queries as QueryRow[] | undefined) || [];
        const comparisonQueries = (data?.comparisonQueries as QueryRow[] | undefined) || [];
        const prev = new Map(comparisonQueries.map(q => [q.query, q]));
        return queries
            .map(q => {
                const p = prev.get(q.query);
                if (!p) return null;
                const delta = q.clicks - p.clicks;
                if (delta >= 0) return null;
                const deltaPct = p.clicks > 0 ? +((delta / p.clicks) * 100).toFixed(1) : 0;
                return { ...q, prevClicks: p.clicks, delta, deltaPct };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.deltaPct <= -15)
            .sort((a, b) => a.delta - b.delta)
            .slice(0, 30);
    }, [data]);

    const tabs: Array<{ key: OppTab; label: string }> = [
        { key: 'striking', label: 'Striking distance' },
        { key: 'ctr', label: 'CTR lab' },
        { key: 'decay', label: 'Decay' },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Opportunities"
            description="Queries close to the win line, underperforming CTR, and eroding traffic."
            tone="cyan"
            action={
                <div className="inline-flex flex-wrap rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`rounded-[10px] px-2.5 py-1.5 transition ${tab === t.key ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            }
        >
            {!activeSite ? (
                <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Select a site to load opportunities.
                </div>
            ) : isLoading ? (
                <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Loading opportunities…
                </div>
            ) : error ? (
                <div className="rounded-[16px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
                    Couldn&apos;t load opportunities. {error.info?.error || error.message}
                </div>
            ) : tab === 'striking' ? (
                <MagnitudeTable<QueryRow>
                    rows={strikingRows}
                    columns={[
                        { key: 'query', label: 'Query', sortable: true, getValue: r => r.query, render: r => <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span> },
                        { key: 'position', label: 'Pos.', width: '64px', align: 'right', sortable: true, getValue: r => r.position, render: r => <span className="tabular-nums text-amber-400">{r.position.toFixed(1)}</span> },
                        { key: 'impressions', label: 'Impressions', width: '100px', align: 'right', sortable: true, getValue: r => r.impressions, render: r => <span className="tabular-nums">{formatCompactNumber(r.impressions)}</span> },
                        { key: 'ctr', label: 'CTR', width: '64px', align: 'right', sortable: true, getValue: r => r.ctr, render: r => <span className="tabular-nums text-zinc-400">{r.ctr.toFixed(1)}%</span> },
                    ]}
                    getMagnitude={r => r.impressions}
                    searchKey={r => r.query}
                    searchPlaceholder="Search striking-distance queries"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage="No queries currently in positions 11–20. Try a wider date range."
                    maxRows={10}
                    defaultSort={{ key: 'impressions', dir: 'desc' }}
                    barColor="rgba(251, 191, 36, 0.10)"
                />
            ) : tab === 'ctr' ? (
                <MagnitudeTable
                    rows={ctrLabRows}
                    columns={[
                        { key: 'query', label: 'Query', sortable: true, getValue: r => r.query, render: r => <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span> },
                        { key: 'position', label: 'Pos.', width: '64px', align: 'right', sortable: true, getValue: r => r.position, render: r => <span className="tabular-nums text-zinc-400">{r.position.toFixed(1)}</span> },
                        { key: 'ctr', label: 'CTR', width: '64px', align: 'right', sortable: true, getValue: r => r.ctr, render: r => <span className="tabular-nums text-red-400">{r.ctr.toFixed(1)}%</span> },
                        { key: 'expectedCtr', label: 'Expected', width: '78px', align: 'right', sortable: true, getValue: r => r.expectedCtr, render: r => <span className="tabular-nums text-emerald-400">{r.expectedCtr.toFixed(1)}%</span> },
                        { key: 'ctrGap', label: 'Gap', width: '64px', align: 'right', sortable: true, getValue: r => r.ctrGap, render: r => <span className="tabular-nums text-amber-300">{r.ctrGap.toFixed(1)}%</span> },
                    ]}
                    getMagnitude={r => r.ctrGap * r.impressions}
                    searchKey={r => r.query}
                    searchPlaceholder="Search CTR-lab queries"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage="No CTR underperformers found."
                    maxRows={10}
                    defaultSort={{ key: 'ctrGap', dir: 'desc' }}
                    barColor="rgba(34, 211, 238, 0.10)"
                />
            ) : (
                <MagnitudeTable
                    rows={decayRows}
                    columns={[
                        { key: 'query', label: 'Query', sortable: true, getValue: r => r.query, render: r => <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span> },
                        { key: 'clicks', label: 'Clicks', width: '80px', align: 'right', sortable: true, getValue: r => r.clicks, render: r => <span className="tabular-nums">{formatCompactNumber(r.clicks)}</span> },
                        { key: 'prevClicks', label: 'Prev.', width: '76px', align: 'right', sortable: true, getValue: r => r.prevClicks, render: r => <span className="tabular-nums text-zinc-500">{formatCompactNumber(r.prevClicks)}</span> },
                        { key: 'deltaPct', label: 'Δ %', width: '76px', align: 'right', sortable: true, getValue: r => r.deltaPct, render: r => <span className="tabular-nums font-medium text-red-400">{r.deltaPct}%</span> },
                    ]}
                    getMagnitude={r => Math.abs(r.delta)}
                    searchKey={r => r.query}
                    searchPlaceholder="Search decaying queries"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage="No decay detected — your traffic is stable."
                    maxRows={10}
                    defaultSort={{ key: 'deltaPct', dir: 'asc' }}
                    barColor="rgba(248, 113, 113, 0.08)"
                />
            )}
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Sparkles className="h-3 w-3" />
                <span>Tip: click any row to drill into per-keyword detail.</span>
                <ArrowRight className="h-3 w-3 text-zinc-600" />
            </div>
        </AnalyticsSubpagePanel>
    );
}

export default function SeoMovementPanel({ activeSite, onSelectKeyword }: SeoMovementPanelProps) {
    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <MovementCard activeSite={activeSite} onSelectKeyword={onSelectKeyword} />
            <OpportunityCard activeSite={activeSite} onSelectKeyword={onSelectKeyword} />
        </div>
    );
}
