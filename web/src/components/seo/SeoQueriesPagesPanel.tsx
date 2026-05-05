'use client';

import { useState } from 'react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { IntentBadge } from '@/components/IntentBadge';
import MagnitudeTable, { type MagnitudeColumn } from './MagnitudeTable';

export interface SeoQuery {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface SeoPageRow {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    status?: string;
}

type Tab = 'queries' | 'pages';

interface SeoQueriesPagesPanelProps {
    queries: SeoQuery[];
    pages: SeoPageRow[];
    onSelectKeyword: (keyword: string) => void;
    onSelectPage: (page: string) => void;
}

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

function positionTone(pos: number): string {
    if (pos <= 3) return 'text-emerald-400';
    if (pos <= 10) return 'text-cyan-400';
    if (pos <= 20) return 'text-amber-400';
    return 'text-red-400';
}

const STATUS_TONE: Record<string, string> = {
    healthy: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    decay: 'border-red-500/20 bg-red-500/10 text-red-400',
};

export default function SeoQueriesPagesPanel({ queries, pages, onSelectKeyword, onSelectPage }: SeoQueriesPagesPanelProps) {
    const [tab, setTab] = useState<Tab>('queries');

    const queryColumns: MagnitudeColumn<SeoQuery>[] = [
        {
            key: 'query',
            label: 'Query',
            align: 'left',
            sortable: true,
            getValue: r => r.query,
            render: r => (
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span>
                    <IntentBadge keyword={r.query} className="hidden sm:inline-flex flex-shrink-0" />
                </div>
            ),
        },
        {
            key: 'clicks',
            label: 'Clicks',
            width: '88px',
            align: 'right',
            sortable: true,
            getValue: r => r.clicks,
            render: r => <span className="tabular-nums">{formatCompactNumber(r.clicks)}</span>,
        },
        {
            key: 'impressions',
            label: 'Impressions',
            width: '100px',
            align: 'right',
            sortable: true,
            getValue: r => r.impressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.impressions)}</span>,
        },
        {
            key: 'ctr',
            label: 'CTR',
            width: '64px',
            align: 'right',
            sortable: true,
            getValue: r => r.ctr,
            render: r => <span className="tabular-nums text-zinc-400">{r.ctr.toFixed(1)}%</span>,
        },
        {
            key: 'position',
            label: 'Pos.',
            width: '64px',
            align: 'right',
            sortable: true,
            getValue: r => r.position,
            render: r => <span className={`tabular-nums font-medium ${positionTone(r.position)}`}>{r.position.toFixed(1)}</span>,
        },
    ];

    const pageColumns: MagnitudeColumn<SeoPageRow>[] = [
        {
            key: 'page',
            label: 'Page',
            align: 'left',
            sortable: true,
            getValue: r => r.page,
            render: r => (
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[13px] font-medium text-zinc-100">{shortenPath(r.page)}</span>
                    {r.status && STATUS_TONE[r.status] ? (
                        <span className={`hidden sm:inline-flex flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_TONE[r.status]}`}>
                            {r.status}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'clicks',
            label: 'Clicks',
            width: '88px',
            align: 'right',
            sortable: true,
            getValue: r => r.clicks,
            render: r => <span className="tabular-nums">{formatCompactNumber(r.clicks)}</span>,
        },
        {
            key: 'impressions',
            label: 'Impressions',
            width: '100px',
            align: 'right',
            sortable: true,
            getValue: r => r.impressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.impressions)}</span>,
        },
        {
            key: 'ctr',
            label: 'CTR',
            width: '64px',
            align: 'right',
            sortable: true,
            getValue: r => r.ctr,
            render: r => <span className="tabular-nums text-zinc-400">{r.ctr.toFixed(1)}%</span>,
        },
        {
            key: 'position',
            label: 'Pos.',
            width: '64px',
            align: 'right',
            sortable: true,
            getValue: r => r.position,
            render: r => <span className={`tabular-nums font-medium ${positionTone(r.position)}`}>{r.position.toFixed(1)}</span>,
        },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Top performance"
            description="Queries and landing pages driving search traffic. Click a row to drill into its detail."
            action={
                <div className="inline-flex rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                    {(['queries', 'pages'] as const).map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`rounded-[10px] px-3 py-1.5 transition ${tab === t ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                            {t === 'queries' ? 'Queries' : 'Pages'}
                        </button>
                    ))}
                </div>
            }
        >
            {tab === 'queries' ? (
                <MagnitudeTable
                    rows={queries}
                    columns={queryColumns}
                    getMagnitude={r => r.clicks}
                    searchKey={r => r.query}
                    searchPlaceholder="Search queries"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage="No queries with measurable traffic in this range yet."
                    maxRows={10}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                />
            ) : (
                <MagnitudeTable
                    rows={pages}
                    columns={pageColumns}
                    getMagnitude={r => r.clicks}
                    searchKey={r => r.page}
                    searchPlaceholder="Search pages"
                    onRowClick={r => onSelectPage(r.page)}
                    emptyMessage="No pages with measurable traffic in this range yet."
                    maxRows={10}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                />
            )}
        </AnalyticsSubpagePanel>
    );
}
