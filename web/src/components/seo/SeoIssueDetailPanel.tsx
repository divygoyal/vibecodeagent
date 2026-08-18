'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, Lightbulb, Search, Smartphone, Sparkles } from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { buildAskAiUrl } from '@/lib/askAi';
import { useCannibalizationData, useMobileGapData } from '@/lib/useDashboardData';
import PositionPill from './PositionPill';

type Severity = 'high' | 'medium' | 'low';

export interface IssueSelection {
    sourceType: 'cannibalization' | 'mobile-gap';
    query: string;
}

interface SeoIssueDetailPanelProps {
    selection: IssueSelection | null;
    siteUrl: string | null;
}

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
    mobileCtr: number;
    desktopCtr: number;
    gap: number;
}

const SEVERITY_BADGE: Record<Severity, string> = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};
const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

const ISSUE_DISCIPLINE = 'Cite the specific tool for every site-specific claim — say "can\'t confirm" rather than fabricate. Under 350 words. No "overall" or "in conclusion" paragraphs. Don\'t restate the metrics in this prompt.';

function buildCannibalizationFixPrompt(query: string, siteUrl: string | null, row: CannibalizedRow): string {
    const site = siteUrl || 'my site';
    const maxPos = Math.max(...row.pages.map(p => p.position));
    const topUrls = row.pages.slice(0, 3).map(p => p.page).join(', ');
    return `Cannibalization for "${query}" on ${site}. ${row.pages.length} pages in positions ${row.bestPosition.toFixed(1)}–${maxPos.toFixed(1)}, ${row.totalImpressions.toLocaleString()} total impr. Top URLs: ${topUrls}.

Investigate: find_cannibalization to confirm. For each competing page, get backlinks, depth, recency, and queries it ranks for BEYOND this one (via get_search_performance).

Forbidden: blanket "redirect everything to the strongest page" — that breaks queries the losers actually win. Picking canonical by current position alone (ignores backlink strength). Generic 301 advice.

Output:
- THE WINNER: which page to keep, cited with data (backlinks N, content depth, other-query traffic). Be specific about WHY.
- REDIRECT MAP per remaining page: 301-redirect, canonicalize-only (don't redirect — protect other rankings), or content-merge. State the reason per page.
- 5 internal-link anchors to consolidate authority on the winner
- Projected click recovery via calculate_revenue_impact
- ONE surprise: a query where a "loser" page is actually the BEST performer — flag before any redirect breaks it

${ISSUE_DISCIPLINE}`;
}

function buildMobileGapFixPrompt(query: string, siteUrl: string | null, row: MobileGapRow): string {
    const site = siteUrl || 'my site';
    const mobileBetter = row.mobilePosition < row.desktopPosition;
    const laggard = mobileBetter ? 'desktop' : 'mobile';
    return `Mobile vs desktop ranking gap for "${query}" on ${site}. Mobile pos ${row.mobilePosition.toFixed(1)}, desktop pos ${row.desktopPosition.toFixed(1)}. ${laggard} is the laggard by ${Math.abs(row.gap).toFixed(1)} positions.

Investigate: get_search_performance filtered by this query to find the affected page. run_page_audit on BOTH mobile and desktop for that page. inspect_url. Find the SPECIFIC Core Web Vitals metric (LCP/INP/CLS/FCP/TTFB) hurting ${laggard}, with numbers — not a vague "Core Web Vitals issue".

Forbidden: "improve Core Web Vitals" without naming the metric and target. Generic "make it mobile-friendly". Listing all detected issues — only the ones correlated with the rank gap.

Output:
- THE CULPRIT: ONE metric, current value vs target, cited from run_page_audit
- 3 fixes in priority order. Each: specific file/component/CSS change + effort (S/M/L) + projected position improvement + confidence (high/medium/low)
- ONE surprise: a non-technical issue PSI doesn't catch (UX layout, font sizes, tap-target spacing, viewport-locked content) hurting ${laggard}

${ISSUE_DISCIPLINE}`;
}

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

export default function SeoIssueDetailPanel({ selection, siteUrl }: SeoIssueDetailPanelProps) {
    const { data: cannData } = useCannibalizationData(siteUrl);
    const { data: mobileData } = useMobileGapData(siteUrl);

    const cannMatch = useMemo<CannibalizedRow | null>(() => {
        if (!selection || selection.sourceType !== 'cannibalization') return null;
        const list = (cannData?.cannibalized as CannibalizedRow[] | undefined) || [];
        return list.find(c => c.query === selection.query) || null;
    }, [cannData, selection]);

    const mobileMatch = useMemo<MobileGapRow | null>(() => {
        if (!selection || selection.sourceType !== 'mobile-gap') return null;
        const list = (mobileData as { data?: MobileGapRow[] } | undefined)?.data || [];
        return list.find(m => m.query === selection.query) || null;
    }, [mobileData, selection]);

    return (
        <AnalyticsSubpagePanel
            title="Issue detail"
            description="Affected pages and a recommended fix for the selected issue."
            tone="amber"
        >
            {!selection ? (
                <div className="flex h-[280px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/[0.06] bg-[#0a0b0e] text-center">
                    <Search className="mb-3 h-5 w-5 text-zinc-600" />
                    <p className="text-[13px] font-semibold text-white">Pick an issue</p>
                    <p className="mt-1 max-w-xs text-[12px] text-zinc-500">Click any row in the Issues table to see affected pages and a recommended fix.</p>
                </div>
            ) : selection.sourceType === 'cannibalization' ? (
                <CannibalizationDetail row={cannMatch} query={selection.query} siteUrl={siteUrl} />
            ) : (
                <MobileGapDetail row={mobileMatch} query={selection.query} siteUrl={siteUrl} />
            )}
        </AnalyticsSubpagePanel>
    );
}

function CannibalizationDetail({ row, query, siteUrl }: { row: CannibalizedRow | null; query: string; siteUrl: string | null }) {
    if (!row) {
        return <div className="rounded-[14px] border border-white/[0.04] bg-[#0a0b0e] px-4 py-6 text-center text-[12px] text-zinc-500">No detail available for this query.</div>;
    }
    const sortedPages = [...row.pages].sort((a, b) => b.impressions - a.impressions);
    return (
        <div className="space-y-3">
            <div className="rounded-[14px] border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                        <p className="text-[12.5px] font-semibold text-white">Cannibalized query</p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[row.severity]}`}>
                        {SEVERITY_LABEL[row.severity]}
                    </span>
                </div>
                <p className="mt-1.5 break-words text-[12px] text-zinc-300">&ldquo;{query}&rdquo;</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <Stat label="Pages" value={row.pages.length.toString()} />
                    <Stat label="Total clicks" value={formatCompactNumber(row.totalClicks)} />
                    <Stat label="Best pos." value={row.bestPosition.toFixed(1)} />
                </div>
            </div>

            <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12]">
                <div className="border-b border-white/[0.06] px-4 py-2.5">
                    <p className="text-[12px] font-semibold text-zinc-300">Competing pages</p>
                </div>
                <div
                    className="hidden md:grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] font-medium text-zinc-500"
                    style={{ gridTemplateColumns: 'minmax(0,1fr) 70px 80px 56px 76px' }}
                >
                    <span>Page</span>
                    <span className="text-right">Clicks</span>
                    <span className="text-right">Impr.</span>
                    <span className="text-right">CTR</span>
                    <span className="text-right">Pos.</span>
                </div>
                {sortedPages.map((p, i) => (
                    <div
                        key={i}
                        className="grid h-9 grid-cols-[minmax(0,1fr)_70px_80px_56px_76px] items-center gap-3 border-b border-white/[0.04] px-4 last:border-b-0 hover:bg-white/[0.02]"
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
                        <span className="text-right font-mono text-[12px] tabular-nums text-zinc-100">{formatCompactNumber(p.clicks)}</span>
                        <span className="text-right font-mono text-[12px] tabular-nums text-zinc-300">{formatCompactNumber(p.impressions)}</span>
                        <span className="text-right font-mono text-[12px] tabular-nums text-zinc-400">{p.ctr.toFixed(1)}%</span>
                        <span className="text-right"><PositionPill pos={p.position} /></span>
                    </div>
                ))}
            </div>

            <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
                <div className="flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5 text-emerald-300" />
                    <p className="text-[12.5px] font-semibold text-white">Recommended fix</p>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-zinc-300">
                    Pick the strongest performer (top page above), then 301-redirect or canonicalise the rest to consolidate ranking signals.
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <Sparkles className="h-2.5 w-2.5" />
                    +{Math.round(row.totalImpressions * 0.04).toLocaleString()} clicks/mo
                </div>
                <Link
                    href={buildAskAiUrl(buildCannibalizationFixPrompt(query, siteUrl, row))}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/[0.08] py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.16]"
                >
                    <Sparkles className="h-3 w-3" />
                    Generate fix plan with AI
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </div>
        </div>
    );
}

function MobileGapDetail({ row, query, siteUrl }: { row: MobileGapRow | null; query: string; siteUrl: string | null }) {
    if (!row) {
        return <div className="rounded-[14px] border border-white/[0.04] bg-[#0a0b0e] px-4 py-6 text-center text-[12px] text-zinc-500">No detail available for this query.</div>;
    }
    const mobileBetter = row.mobilePosition < row.desktopPosition;
    return (
        <div className="space-y-3">
            <div className="rounded-[14px] border border-cyan-500/20 bg-cyan-500/[0.04] px-3.5 py-3">
                <div className="flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5 text-cyan-300" />
                    <p className="text-[12.5px] font-semibold text-white">Mobile vs desktop gap</p>
                </div>
                <p className="mt-1.5 break-words text-[12px] text-zinc-300">&ldquo;{query}&rdquo;</p>
                <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-400">
                    Mobile ranks {mobileBetter ? 'better' : 'worse'} than desktop by {Math.abs(row.gap).toFixed(1)} positions.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <DeviceCard label="Mobile" position={row.mobilePosition} clicks={row.mobileClicks} impressions={row.mobileImpressions} ctr={row.mobileCtr * 100} highlight={!mobileBetter} />
                <DeviceCard label="Desktop" position={row.desktopPosition} clicks={row.desktopClicks} impressions={row.desktopImpressions} ctr={row.desktopCtr * 100} highlight={mobileBetter} />
            </div>

            <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
                <div className="flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5 text-emerald-300" />
                    <p className="text-[12.5px] font-semibold text-white">Recommended fix</p>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-zinc-300">
                    {mobileBetter
                        ? 'Desktop is the laggard — verify the desktop layout still surfaces above-the-fold content and CTAs.'
                        : 'Mobile is the laggard — check Core Web Vitals on the page, ensure tap targets are 44 px+, and that the main content renders without horizontal scroll.'}
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <Sparkles className="h-2.5 w-2.5" />
                    +{Math.round(Math.max(row.mobileImpressions, row.desktopImpressions) * 0.03).toLocaleString()} clicks/mo
                </div>
                <Link
                    href={buildAskAiUrl(buildMobileGapFixPrompt(query, siteUrl, row))}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/[0.08] py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.16]"
                >
                    <Sparkles className="h-3 w-3" />
                    Generate fix plan with AI
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </div>
        </div>
    );
}

function DeviceCard({ label, position, clicks, impressions, ctr, highlight }: { label: string; position: number; clicks: number; impressions: number; ctr: number; highlight: boolean }) {
    return (
        <div className={`rounded-[14px] border px-3.5 py-3 ${highlight ? 'border-amber-500/25 bg-amber-500/[0.04]' : 'border-white/[0.06] bg-[#0d0e12]'}`}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
            <div className="mt-1.5"><PositionPill pos={position} /></div>
            <div className="mt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-zinc-500">Clicks</span><span className="font-mono tabular-nums text-zinc-200">{formatCompactNumber(clicks)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Impr.</span><span className="font-mono tabular-nums text-zinc-200">{formatCompactNumber(impressions)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">CTR</span><span className="font-mono tabular-nums text-zinc-200">{ctr.toFixed(1)}%</span></div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-zinc-600">{label}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-zinc-200">{value}</p>
        </div>
    );
}
