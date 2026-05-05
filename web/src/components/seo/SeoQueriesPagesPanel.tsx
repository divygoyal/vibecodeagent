'use client';

import { useState } from 'react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { IntentBadge } from '@/components/IntentBadge';
import MagnitudeTable, { type MagnitudeColumn } from './MagnitudeTable';
import PositionPill from './PositionPill';

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
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{r.query}</span>
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
            render: r => <span className="tabular-nums text-zinc-100">{formatCompactNumber(r.clicks)}</span>,
        },
        {
            key: 'impressions',
            label: 'Impressions',
            width: '104px',
            align: 'right',
            sortable: true,
            getValue: r => r.impressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.impressions)}</span>,
        },
        {
            key: 'ctr',
            label: 'CTR',
            width: '72px',
            align: 'right',
            sortable: true,
            getValue: r => r.ctr,
            render: r => <span className="tabular-nums text-zinc-400">{r.ctr.toFixed(1)}%</span>,
        },
        {
            key: 'position',
            label: 'Position',
            width: '88px',
            align: 'right',
            sortable: true,
            getValue: r => r.position,
            render: r => <PositionPill pos={r.position} />,
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
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{shortenPath(r.page)}</span>
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
            render: r => <span className="tabular-nums text-zinc-100">{formatCompactNumber(r.clicks)}</span>,
        },
        {
            key: 'impressions',
            label: 'Impressions',
            width: '104px',
            align: 'right',
            sortable: true,
            getValue: r => r.impressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.impressions)}</span>,
        },
        {
            key: 'ctr',
            label: 'CTR',
            width: '72px',
            align: 'right',
            sortable: true,
            getValue: r => r.ctr,
            render: r => <span className="tabular-nums text-zinc-400">{r.ctr.toFixed(1)}%</span>,
        },
        {
            key: 'position',
            label: 'Position',
            width: '88px',
            align: 'right',
            sortable: true,
            getValue: r => r.position,
            render: r => <PositionPill pos={r.position} />,
        },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Top performance"
            description="Queries and landing pages driving the most traffic."
            action={
                <div className="inline-flex rounded-[12px] border border-white/[0.07] bg-[#0a0b0e] p-1 text-[12px] font-medium">
                    {(['queries', 'pages'] as const).map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`rounded-[9px] px-3 py-1.5 transition ${tab === t ? 'bg-white/[0.06] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
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
                    searchKey={r => r.query}
                    searchPlaceholder="Search queries"
                    onRowClick={r => onSelectKeyword(r.query)}
                    emptyMessage="No queries with measurable traffic in this range yet."
                    maxRows={10}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                    viewAllLabel="View all queries"
                />
            ) : (
                <MagnitudeTable
                    rows={pages}
                    columns={pageColumns}
                    searchKey={r => r.page}
                    searchPlaceholder="Search pages"
                    onRowClick={r => onSelectPage(r.page)}
                    emptyMessage="No pages with measurable traffic in this range yet."
                    maxRows={10}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                    viewAllLabel="View all pages"
                />
            )}
        </AnalyticsSubpagePanel>
    );
}
