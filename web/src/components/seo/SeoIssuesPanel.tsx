'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Smartphone } from 'lucide-react';
import {
    AnalyticsSubpagePanel,
    formatCompactNumber,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useCannibalizationData, useMobileGapData } from '@/lib/useDashboardData';
import MagnitudeTable, { type MagnitudeColumn } from './MagnitudeTable';

interface SeoIssuesPanelProps {
    activeSite: string | null;
    onSelectKeyword: (keyword: string) => void;
}

type Tab = 'cannibalization' | 'mobile-gap';

interface CannibalizedRow {
    query: string;
    pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
    totalClicks: number;
    totalImpressions: number;
    bestPosition: number;
    severity: 'high' | 'medium' | 'low';
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

const SEVERITY_TONE: Record<string, string> = {
    high: 'border-red-500/20 bg-red-500/10 text-red-400',
    medium: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    low: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
};

function CannibalizationView({ activeSite, onSelectKeyword }: { activeSite: string | null; onSelectKeyword: (k: string) => void }) {
    const { data, error, isLoading } = useCannibalizationData(activeSite);
    const rows = (data?.cannibalized as CannibalizedRow[] | undefined) || [];

    const cols: MagnitudeColumn<CannibalizedRow>[] = [
        {
            key: 'query',
            label: 'Query',
            sortable: true,
            getValue: r => r.query,
            render: r => (
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span>
                    <span className={`hidden sm:inline-flex flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${SEVERITY_TONE[r.severity]}`}>
                        {r.severity}
                    </span>
                    <span className="hidden md:inline-flex flex-shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {r.pages.length} pages
                    </span>
                </div>
            ),
        },
        {
            key: 'totalClicks',
            label: 'Clicks',
            width: '80px',
            align: 'right',
            sortable: true,
            getValue: r => r.totalClicks,
            render: r => <span className="tabular-nums">{formatCompactNumber(r.totalClicks)}</span>,
        },
        {
            key: 'totalImpressions',
            label: 'Impressions',
            width: '100px',
            align: 'right',
            sortable: true,
            getValue: r => r.totalImpressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.totalImpressions)}</span>,
        },
        {
            key: 'bestPosition',
            label: 'Best pos.',
            width: '76px',
            align: 'right',
            sortable: true,
            getValue: r => r.bestPosition,
            render: r => <span className="tabular-nums text-zinc-300">{r.bestPosition.toFixed(1)}</span>,
        },
    ];

    if (!activeSite) return <Empty msg="Select a site to scan for cannibalization." />;
    if (isLoading) return <Empty msg="Scanning your queries…" />;
    if (error) return <ErrorBox msg={error.info?.error || error.message} />;

    return (
        <MagnitudeTable
            rows={rows}
            columns={cols}
            getMagnitude={r => r.totalImpressions}
            searchKey={r => r.query}
            searchPlaceholder="Search cannibalized queries"
            onRowClick={r => onSelectKeyword(r.query)}
            emptyMessage="No cannibalization detected over the last 28 days. Nice."
            maxRows={10}
            defaultSort={{ key: 'totalImpressions', dir: 'desc' }}
            barColor="rgba(167, 139, 250, 0.10)"
        />
    );
}

function MobileGapView({ activeSite, onSelectKeyword }: { activeSite: string | null; onSelectKeyword: (k: string) => void }) {
    const { data, error, isLoading } = useMobileGapData(activeSite);
    const rows = ((data as { data?: MobileGapRow[] })?.data) || [];
    const meaningful = rows.filter(r => Math.abs(r.gap) >= 1 && r.mobileImpressions >= 50);

    const cols: MagnitudeColumn<MobileGapRow>[] = [
        {
            key: 'query',
            label: 'Query',
            sortable: true,
            getValue: r => r.query,
            render: r => <span className="truncate text-[13px] font-medium text-zinc-100">{r.query}</span>,
        },
        {
            key: 'mobilePosition',
            label: 'Mobile',
            width: '78px',
            align: 'right',
            sortable: true,
            getValue: r => r.mobilePosition,
            render: r => <span className="tabular-nums text-amber-400">{r.mobilePosition.toFixed(1)}</span>,
        },
        {
            key: 'desktopPosition',
            label: 'Desktop',
            width: '82px',
            align: 'right',
            sortable: true,
            getValue: r => r.desktopPosition,
            render: r => <span className="tabular-nums text-emerald-400">{r.desktopPosition.toFixed(1)}</span>,
        },
        {
            key: 'gap',
            label: 'Gap',
            width: '64px',
            align: 'right',
            sortable: true,
            getValue: r => Math.abs(r.gap),
            render: r => {
                // gap = desktopPosition - mobilePosition
                // negative = mobile is BETTER, positive = mobile is WORSE
                const mobileWorse = r.gap < 0;
                return (
                    <span className={`tabular-nums font-medium ${mobileWorse ? 'text-red-400' : 'text-emerald-400'}`}>
                        {r.gap > 0 ? '+' : ''}{r.gap.toFixed(1)}
                    </span>
                );
            },
        },
        {
            key: 'mobileImpressions',
            label: 'M. Impr.',
            width: '90px',
            align: 'right',
            sortable: true,
            getValue: r => r.mobileImpressions,
            render: r => <span className="tabular-nums text-zinc-300">{formatCompactNumber(r.mobileImpressions)}</span>,
        },
    ];

    if (!activeSite) return <Empty msg="Select a site to compare mobile vs desktop." />;
    if (isLoading) return <Empty msg="Comparing mobile vs desktop rankings…" />;
    if (error) return <ErrorBox msg={error.info?.error || error.message} />;

    return (
        <MagnitudeTable
            rows={meaningful}
            columns={cols}
            getMagnitude={r => r.impact}
            searchKey={r => r.query}
            searchPlaceholder="Search mobile-gap queries"
            onRowClick={r => onSelectKeyword(r.query)}
            emptyMessage="No meaningful mobile/desktop gaps. Your rankings are consistent across devices."
            maxRows={10}
            defaultSort={{ key: 'gap', dir: 'asc' }}
            barColor="rgba(34, 211, 238, 0.10)"
        />
    );
}

function Empty({ msg }: { msg: string }) {
    return (
        <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
            {msg}
        </div>
    );
}

function ErrorBox({ msg }: { msg?: string }) {
    return (
        <div className="rounded-[16px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
            {msg || 'Couldn’t load data.'}
        </div>
    );
}

export default function SeoIssuesPanel({ activeSite, onSelectKeyword }: SeoIssuesPanelProps) {
    const [tab, setTab] = useState<Tab>('cannibalization');

    const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
        { key: 'cannibalization', label: 'Cannibalization', icon: AlertTriangle },
        { key: 'mobile-gap', label: 'Mobile gap', icon: Smartphone },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Issues"
            description="Conflicts and device gaps that quietly cap your traffic ceiling."
            tone="amber"
            action={
                <div className="inline-flex flex-wrap rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                    {tabs.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 transition ${tab === t.key ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                <Icon className="h-3 w-3" />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            }
        >
            {tab === 'cannibalization' ? (
                <CannibalizationView activeSite={activeSite} onSelectKeyword={onSelectKeyword} />
            ) : (
                <MobileGapView activeSite={activeSite} onSelectKeyword={onSelectKeyword} />
            )}
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ExternalLink className="h-3 w-3" />
                <span>Each row links to the keyword detail drawer.</span>
            </div>
        </AnalyticsSubpagePanel>
    );
}
