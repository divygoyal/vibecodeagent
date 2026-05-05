'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import {
    AlertCircle,
    Eye,
    ExternalLink,
    Hash,
    Loader2,
    MousePointer,
    Search,
    Sparkles,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { IntentBadge } from '@/components/IntentBadge';
import { useKeywordDetail } from '@/lib/useDashboardData';
import PositionPill from './PositionPill';

const LineChart = dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), { ssr: false });
const Line = dynamic(() => import('recharts').then(m => ({ default: m.Line })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });

interface PageRow {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface TrendRow {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface KeywordDetail {
    pages: PageRow[];
    trend: TrendRow[];
}

interface SeoKeywordInsightsPanelProps {
    keyword: string | null;
    siteUrl: string | null;
    /** Aggregated metrics for this keyword from the parent table (for the KPI strip). */
    summary?: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    };
}

interface TooltipPayload {
    color?: string;
    name?: string;
    value?: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-[10px] border border-white/[0.08] bg-[#050505]/95 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="flex items-center gap-2 font-medium" style={{ color: entry.color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}:
                    <span className="ml-auto tabular-nums text-white">
                        {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                    </span>
                </p>
            ))}
        </div>
    );
}

function shortDate(date: string): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date.slice(5);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

type Tone = 'emerald' | 'cyan' | 'amber' | 'violet';

const TONE_VALUE: Record<Tone, string> = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
};
const TONE_ICON: Record<Tone, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/20',
    amber: 'text-amber-400 bg-amber-500/[0.08] border-amber-500/20',
    violet: 'text-violet-400 bg-violet-500/[0.08] border-violet-500/20',
};

function KpiTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone }) {
    return (
        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${TONE_ICON[tone]}`}>
                    <Icon className="h-2.5 w-2.5" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
            </div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none tracking-[-0.02em] ${TONE_VALUE[tone]}`}>{value}</p>
        </div>
    );
}

function SectionHeader({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
    return (
        <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                <Icon className="h-3 w-3" />
                {label}
            </span>
            {hint ? <span className="text-[10px] uppercase tracking-wider text-zinc-500">{hint}</span> : null}
        </div>
    );
}

export default function SeoKeywordInsightsPanel({ keyword, siteUrl, summary }: SeoKeywordInsightsPanelProps) {
    const { data, error, isLoading } = useKeywordDetail(keyword ? siteUrl : null, keyword);
    const detail = data as KeywordDetail | undefined;

    const trendData = useMemo(() => {
        if (!detail?.trend) return [];
        return detail.trend.map(t => ({ ...t, label: shortDate(t.date) }));
    }, [detail]);

    const computed = useMemo(() => {
        if (!detail?.pages?.length) {
            return summary ? { ...summary, ctrLabel: `${summary.ctr.toFixed(1)}%` } : null;
        }
        const totalClicks = detail.pages.reduce((s, p) => s + p.clicks, 0);
        const totalImpr = detail.pages.reduce((s, p) => s + p.impressions, 0);
        const avgPos = +(detail.pages.reduce((s, p) => s + p.position, 0) / detail.pages.length).toFixed(1);
        const avgCtr = totalImpr > 0 ? +((totalClicks / totalImpr) * 100).toFixed(2) : 0;
        return {
            clicks: totalClicks,
            impressions: totalImpr,
            position: avgPos,
            ctr: avgCtr,
            ctrLabel: `${avgCtr.toFixed(1)}%`,
        };
    }, [detail, summary]);

    return (
        <AnalyticsSubpagePanel
            title="Keyword detail"
            description={keyword ? 'Performance, trend, and pages for the selected query.' : 'Pick a query on the left to populate this panel.'}
            tone="cyan"
            action={
                keyword ? (
                    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
                        <Sparkles className="h-3 w-3" />
                        <span className="max-w-[180px] truncate">{keyword}</span>
                        <IntentBadge keyword={keyword} className="hidden sm:inline-flex flex-shrink-0" />
                    </span>
                ) : null
            }
        >
            {!keyword ? (
                <div className="flex h-[280px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/[0.06] bg-[#0a0b0e] text-center">
                    <Search className="mb-3 h-5 w-5 text-zinc-600" />
                    <p className="text-[13px] font-semibold text-white">Select a query</p>
                    <p className="mt-1 max-w-xs text-[12px] text-zinc-500">Click any row in the Top performance table to see clicks, impressions, position, and the pages that rank for it.</p>
                </div>
            ) : isLoading && !detail ? (
                <div className="flex h-[280px] items-center justify-center text-[12px] text-zinc-500">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading keyword detail…
                </div>
            ) : error ? (
                <div className="rounded-[12px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
                    <AlertCircle className="mr-1 inline-block h-3.5 w-3.5" />
                    Couldn&apos;t load keyword detail. {error.info?.error || error.message}
                </div>
            ) : (
                <div className="space-y-5">
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <KpiTile icon={MousePointer} label="Total Clicks" tone="emerald" value={computed ? formatCompactNumber(computed.clicks) : '—'} />
                        <KpiTile icon={Eye} label="Impressions" tone="cyan" value={computed ? formatCompactNumber(computed.impressions) : '—'} />
                        <KpiTile icon={Hash} label="Avg. Position" tone="amber" value={computed ? computed.position.toFixed(1) : '—'} />
                        <KpiTile icon={TrendingUp} label="Avg. CTR" tone="violet" value={computed ? computed.ctrLabel : '—'} />
                    </div>

                    {/* 7-day trend */}
                    <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-4 py-3">
                        <SectionHeader icon={TrendingUp} label="7-day trend" hint="Last 7 days" />
                        {trendData.length > 1 ? (
                            <div className="h-[160px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={20} />
                                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={32} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={42} />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex h-[160px] items-center justify-center text-[12px] text-zinc-600">Not enough data for a trend.</div>
                        )}
                        <div className="mt-2 flex gap-4 text-[11px] text-zinc-400">
                            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Clicks</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Impressions</span>
                        </div>
                    </div>

                    {/* Related pages — scrollable */}
                    <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12]">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                                <ExternalLink className="h-3 w-3" />
                                Related pages
                            </span>
                            {detail?.pages?.length ? (
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{detail.pages.length} pages</span>
                            ) : null}
                        </div>
                        {detail?.pages?.length ? (
                            <>
                                <div
                                    className="hidden md:grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] font-medium text-zinc-500"
                                    style={{ gridTemplateColumns: 'minmax(0,1fr) 80px 88px 64px 80px' }}
                                >
                                    <span>Landing page</span>
                                    <span className="text-right">Clicks</span>
                                    <span className="text-right">Impressions</span>
                                    <span className="text-right">CTR</span>
                                    <span className="text-right">Position</span>
                                </div>
                                <div className="max-h-[280px] overflow-y-auto">
                                    {detail.pages.map((p, i) => (
                                        <div
                                            key={i}
                                            className="grid h-9 grid-cols-[minmax(0,1fr)_80px_88px_64px_80px] items-center gap-3 border-b border-white/[0.04] px-4 last:border-b-0 hover:bg-white/[0.02]"
                                        >
                                            <a
                                                href={p.page}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-200 hover:text-cyan-300"
                                            >
                                                <span className="block truncate">{shortenPath(p.page)}</span>
                                                <ExternalLink className="h-3 w-3 flex-shrink-0 text-zinc-600" />
                                            </a>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-emerald-300">{formatCompactNumber(p.clicks)}</span>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-cyan-300">{formatCompactNumber(p.impressions)}</span>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-zinc-300">{p.ctr.toFixed(1)}%</span>
                                            <span className="text-right"><PositionPill pos={p.position} /></span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="px-4 py-6 text-center text-[12px] text-zinc-500">No pages found for this query.</div>
                        )}
                    </div>
                </div>
            )}
        </AnalyticsSubpagePanel>
    );
}
