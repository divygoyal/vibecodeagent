'use client';

import { useMemo, useState } from 'react';
import {
    AnalyticsSubpagePanel,
    formatCompactNumber,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useCannibalizationData, useMobileGapData } from '@/lib/useDashboardData';
import MagnitudeTable, { type MagnitudeColumn } from './MagnitudeTable';
import PositionPill from './PositionPill';

interface SeoIssuesPanelProps {
    activeSite: string | null;
    /** Notify parent which issue was selected (for the inline detail pane). */
    onSelectIssue: (issue: { sourceType: 'cannibalization' | 'mobile-gap'; query: string }) => void;
    /** Currently selected issue, for active-row highlighting. */
    selected?: { sourceType: 'cannibalization' | 'mobile-gap'; query: string } | null;
}

type Tab = 'all' | 'cannibalization' | 'mobile';
type Severity = 'high' | 'medium' | 'low';

interface CannibalizedRow {
    query: string;
    pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
    totalClicks: number;
    totalImpressions: number;
    bestPosition: number;
    severity: Severity;
}

interface MobileGapRow {
    query: string;
    mobilePosition: number;
    desktopPosition: number;
    mobileImpressions: number;
    desktopImpressions: number;
    mobileClicks: number;
    desktopClicks: number;
    gap: number;
    impact: number;
}

interface IssueRow {
    sourceType: 'cannibalization' | 'mobile-gap';
    query: string;
    severity: Severity;
    affectedPages: number;
    affectedLabel: string;
    clicks: number;
    impressions: number;
    bestPosition: number;
}

const SEVERITY_TONE: Record<Severity, string> = {
    high: 'border-red-500/30 bg-red-500/15 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};
const SEVERITY_LABEL: Record<Severity, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
};

function SeverityBadge({ s }: { s: Severity }) {
    return (
        <span className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[s]}`}>
            {SEVERITY_LABEL[s]}
        </span>
    );
}

function classifyGapSeverity(gap: number, mobileImpr: number): Severity {
    const abs = Math.abs(gap);
    if (abs >= 5 && mobileImpr >= 500) return 'high';
    if (abs >= 3 || mobileImpr >= 200) return 'medium';
    return 'low';
}

export default function SeoIssuesPanel({ activeSite, onSelectIssue, selected }: SeoIssuesPanelProps) {
    const [tab, setTab] = useState<Tab>('all');
    const cannQuery = useCannibalizationData(activeSite);
    const mobileQuery = useMobileGapData(activeSite);

    const cannIssues: IssueRow[] = useMemo(() => {
        const cannRows = (cannQuery.data?.cannibalized as CannibalizedRow[] | undefined) || [];
        return cannRows.map(r => ({
            sourceType: 'cannibalization' as const,
            query: r.query,
            severity: r.severity,
            affectedPages: r.pages.length,
            affectedLabel: `${r.pages.length} ${r.pages.length === 1 ? 'page' : 'pages'}`,
            clicks: r.totalClicks,
            impressions: r.totalImpressions,
            bestPosition: r.bestPosition,
        }));
    }, [cannQuery.data]);

    const mobileIssues: IssueRow[] = useMemo(() => {
        const mobileRows = ((mobileQuery.data as { data?: MobileGapRow[] })?.data) || [];
        return mobileRows
            .filter(r => Math.abs(r.gap) >= 1 && r.mobileImpressions >= 50)
            .map(r => ({
                sourceType: 'mobile-gap' as const,
                query: r.query,
                severity: classifyGapSeverity(r.gap, r.mobileImpressions),
                affectedPages: 1,
                affectedLabel: 'Mobile',
                clicks: r.mobileClicks,
                impressions: r.mobileImpressions,
                bestPosition: r.mobilePosition,
            }));
    }, [mobileQuery.data]);

    const merged = useMemo(() => {
        const sevOrder: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
        return [...cannIssues, ...mobileIssues].sort((a, b) => {
            if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[b.severity] - sevOrder[a.severity];
            return b.impressions - a.impressions;
        });
    }, [cannIssues, mobileIssues]);

    const rows = tab === 'all' ? merged : tab === 'cannibalization' ? cannIssues : mobileIssues;

    const isLoading = (tab !== 'mobile' && cannQuery.isLoading) || (tab !== 'cannibalization' && mobileQuery.isLoading);
    const error = tab === 'cannibalization' ? cannQuery.error : tab === 'mobile' ? mobileQuery.error : (cannQuery.error || mobileQuery.error);

    const cols: MagnitudeColumn<IssueRow>[] = [
        {
            key: 'query',
            label: 'Issue',
            sortable: true,
            getValue: r => r.query,
            render: r => <span className="block truncate text-[13px] font-medium text-zinc-100">{r.query}</span>,
        },
        {
            key: 'severity',
            label: 'Severity',
            width: '92px',
            align: 'left',
            sortable: true,
            getValue: r => ({ high: 3, medium: 2, low: 1 }[r.severity]),
            render: r => <SeverityBadge s={r.severity} />,
        },
        {
            key: 'affectedPages',
            label: 'Affected pages',
            width: '120px',
            align: 'right',
            sortable: true,
            getValue: r => r.affectedPages,
            render: r => <span className="tabular-nums text-zinc-300">{r.affectedLabel}</span>,
        },
        {
            key: 'clicks',
            label: 'Clicks',
            width: '80px',
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
            key: 'bestPosition',
            label: 'Best position',
            width: '108px',
            align: 'right',
            sortable: true,
            getValue: r => r.bestPosition,
            render: r => <PositionPill pos={r.bestPosition} />,
        },
    ];

    const tabs: Array<{ key: Tab; label: string }> = [
        { key: 'all', label: 'All issues' },
        { key: 'cannibalization', label: 'Cannibalization' },
        { key: 'mobile', label: 'Mobile' },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Issues"
            description="Conflicts and technical issues that may be hurting performance."
            action={
                <div className="inline-flex flex-wrap rounded-[12px] border border-white/[0.07] bg-[#0a0b0e] p-1 text-[12px] font-medium">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`rounded-[9px] px-2.5 py-1.5 transition ${tab === t.key ? 'bg-white/[0.06] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            }
        >
            {!activeSite ? (
                <div className="rounded-[12px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Select a site to scan for issues.
                </div>
            ) : isLoading ? (
                <div className="rounded-[12px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                    Scanning your queries…
                </div>
            ) : error ? (
                <div className="rounded-[12px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
                    Couldn&apos;t load issues. {error.info?.error || error.message}
                </div>
            ) : (
                <MagnitudeTable
                    rows={rows}
                    columns={cols}
                    searchKey={r => r.query}
                    searchPlaceholder="Search issues"
                    onRowClick={r => onSelectIssue({ sourceType: r.sourceType, query: r.query })}
                    activeRow={r => !!selected && selected.query === r.query && selected.sourceType === r.sourceType}
                    emptyMessage="No issues detected over the last 28 days."
                    maxRows={10}
                    defaultSort={{ key: 'impressions', dir: 'desc' }}
                    viewAllLabel="View all issues"
                />
            )}
        </AnalyticsSubpagePanel>
    );
}
