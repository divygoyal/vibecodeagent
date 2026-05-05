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
    /** Currently selected query (renders the active-row accent). */
    selectedKeyword?: string | null;
    /** Currently selected page (renders the active-row accent). */
    selectedPage?: string | null;
    /** Compact 3-col layout: Query | Clicks | Position (drops Impressions and CTR). */
    compact?: boolean;
}

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

export default function SeoQueriesPagesPanel({ queries, pages, onSelectKeyword, onSelectPage, selectedKeyword, selectedPage, compact = false }: SeoQueriesPagesPanelProps) {
    const [tab, setTab] = useState<Tab>('queries');

    const queryLabel: MagnitudeColumn<SeoQuery> = {
        key: 'query',
        label: 'Query',
        align: 'left',
        sortable: true,
        getValue: r => r.query,
        render: r => (
            <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                <span className="block truncate text-[13px] font-medium text-zinc-100">{r.query}</span>
                <IntentBadge keyword={r.query} className="self-start text-[9px]" />
            </div>
        ),
    };

    const pageLabel: MagnitudeColumn<SeoPageRow> = {
        key: 'page',
        label: 'Page',
        align: 'left',
        sortable: true,
        getValue: r => r.page,
        render: r => (
            <span className="block truncate text-[13px] font-medium text-zinc-100">{shortenPath(r.page)}</span>
        ),
    };

    const clicksCol = <T extends { clicks: number }>(): MagnitudeColumn<T> => ({
        key: 'clicks',
        label: 'Clicks',
        width: '76px',
        align: 'right',
        sortable: true,
        getValue: r => r.clicks,
        render: r => <span className="tabular-nums font-semibold text-emerald-300">{formatCompactNumber(r.clicks)}</span>,
    });

    const imprCol = <T extends { impressions: number }>(): MagnitudeColumn<T> => ({
        key: 'impressions',
        label: 'Impressions',
        width: '96px',
        align: 'right',
        sortable: true,
        getValue: r => r.impressions,
        render: r => <span className="tabular-nums text-cyan-300">{formatCompactNumber(r.impressions)}</span>,
    });

    const ctrCol = <T extends { ctr: number }>(): MagnitudeColumn<T> => ({
        key: 'ctr',
        label: 'CTR',
        width: '68px',
        align: 'right',
        sortable: true,
        getValue: r => r.ctr,
        render: r => <span className="tabular-nums text-zinc-300">{r.ctr.toFixed(1)}%</span>,
    });

    const posCol = <T extends { position: number }>(): MagnitudeColumn<T> => ({
        key: 'position',
        label: 'Position',
        width: '76px',
        align: 'right',
        sortable: true,
        getValue: r => r.position,
        render: r => <PositionPill pos={r.position} />,
    });

    // Compact mode (3-col performance layout): single label column. The full
    // metrics are rendered in the right-side insights panel anyway.
    const queryColumns: MagnitudeColumn<SeoQuery>[] = compact
        ? [queryLabel]
        : [queryLabel, clicksCol<SeoQuery>(), imprCol<SeoQuery>(), ctrCol<SeoQuery>(), posCol<SeoQuery>()];

    const pageColumns: MagnitudeColumn<SeoPageRow>[] = compact
        ? [pageLabel]
        : [pageLabel, clicksCol<SeoPageRow>(), imprCol<SeoPageRow>(), ctrCol<SeoPageRow>(), posCol<SeoPageRow>()];

    return (
        <AnalyticsSubpagePanel
            title="Top performance"
            description="Pick a query or page to populate the insights panel."
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
                    activeRow={r => r.query === selectedKeyword}
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
                    activeRow={r => r.page === selectedPage}
                    emptyMessage="No pages with measurable traffic in this range yet."
                    maxRows={10}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                    viewAllLabel="View all pages"
                />
            )}
        </AnalyticsSubpagePanel>
    );
}
