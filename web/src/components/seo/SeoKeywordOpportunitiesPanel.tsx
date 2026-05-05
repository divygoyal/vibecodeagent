'use client';

import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Lightbulb, Search, Sparkles, TrendingUp } from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useCannibalizationData } from '@/lib/useDashboardData';
import type { SeoQuery } from './SeoQueriesPagesPanel';

interface SeoKeywordOpportunitiesPanelProps {
    keyword: string | null;
    siteUrl: string | null;
    /** Selected query's row from the parent table — used for the CTR-vs-expected and recommendation logic. */
    queryRow?: SeoQuery;
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

const SEVERITY_BADGE: Record<string, string> = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};
const SEVERITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

interface CannibalizedRow {
    query: string;
    pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
    totalClicks: number;
    totalImpressions: number;
    bestPosition: number;
    severity: 'high' | 'medium' | 'low';
}

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

export default function SeoKeywordOpportunitiesPanel({ keyword, siteUrl, queryRow }: SeoKeywordOpportunitiesPanelProps) {
    const { data: cannData } = useCannibalizationData(siteUrl);
    const cannMatch = useMemo<CannibalizedRow | null>(() => {
        if (!keyword) return null;
        const list = (cannData?.cannibalized as CannibalizedRow[] | undefined) || [];
        return list.find(c => c.query === keyword) || null;
    }, [cannData, keyword]);

    const ctrAnalysis = useMemo(() => {
        if (!queryRow) return null;
        const expected = getExpectedCtr(queryRow.position);
        const gap = +(expected - queryRow.ctr).toFixed(2);
        const benchmark = expected > 0 ? (queryRow.ctr / expected) * 100 : 100;
        return { actual: queryRow.ctr, expected, gap, benchmark, position: queryRow.position };
    }, [queryRow]);

    const recommendation = useMemo(() => {
        if (!queryRow) return null;
        if (cannMatch) {
            return {
                title: 'Consolidate cannibalized pages',
                detail: `${cannMatch.pages.length} pages compete for this query. Pick the strongest performer, redirect or canonicalise the rest.`,
                impact: `+${Math.round(cannMatch.totalImpressions * 0.04)} clicks/mo`,
                tone: 'high' as const,
            };
        }
        if (ctrAnalysis && ctrAnalysis.gap >= 1) {
            const uplift = Math.round((ctrAnalysis.gap / 100) * queryRow.impressions);
            return {
                title: 'Improve title & meta description',
                detail: `Actual CTR is ${ctrAnalysis.gap.toFixed(1)} pp below the expected ${ctrAnalysis.expected.toFixed(1)}% for position ${ctrAnalysis.position.toFixed(1)}.`,
                impact: `+${uplift.toLocaleString()} clicks/mo`,
                tone: 'medium' as const,
            };
        }
        if (queryRow.position >= 11 && queryRow.position <= 20) {
            return {
                title: 'Push into striking distance',
                detail: 'Currently ranking on page 2. Add internal links, expand content depth, and refresh on-page signals.',
                impact: `+${Math.round(queryRow.impressions * 0.05)} clicks/mo`,
                tone: 'medium' as const,
            };
        }
        return {
            title: 'Maintain ranking',
            detail: 'Performance looks healthy. Keep content fresh and monitor for movement.',
            impact: 'stable',
            tone: 'low' as const,
        };
    }, [cannMatch, ctrAnalysis, queryRow]);

    return (
        <AnalyticsSubpagePanel
            title="Opportunities & Risks"
            description="Cannibalization, CTR gap, and recommended actions for the selected query."
            tone="amber"
        >
            {!keyword || !queryRow ? (
                <div className="flex h-[280px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/[0.06] bg-[#0a0b0e] text-center">
                    <Search className="mb-3 h-5 w-5 text-zinc-600" />
                    <p className="text-[13px] font-semibold text-white">Pick a query</p>
                    <p className="mt-1 max-w-xs text-[12px] text-zinc-500">Once you select a row, we&apos;ll surface cannibalization risk, CTR gap, and a recommendation here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Cannibalization risk */}
                    <div className={`rounded-[14px] border px-3.5 py-3 ${cannMatch ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-white/[0.06] bg-[#0d0e12]'}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className={`h-3.5 w-3.5 ${cannMatch ? 'text-amber-300' : 'text-zinc-500'}`} />
                                <p className="text-[12.5px] font-semibold text-white">Cannibalization risk</p>
                            </div>
                            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cannMatch ? SEVERITY_BADGE[cannMatch.severity] : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>
                                {cannMatch ? SEVERITY_LABEL[cannMatch.severity] : 'None'}
                            </span>
                        </div>
                        {cannMatch ? (
                            <>
                                <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-400">
                                    This query is served by {cannMatch.pages.length} pages. Multiple URLs compete in positions {cannMatch.bestPosition.toFixed(1)}–{Math.max(...cannMatch.pages.map(p => p.position)).toFixed(1)}.
                                </p>
                                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                                    <div>
                                        <p className="text-zinc-600">Affected pages</p>
                                        <p className="mt-0.5 font-semibold tabular-nums text-zinc-200">{cannMatch.pages.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-600">Total impressions</p>
                                        <p className="mt-0.5 font-semibold tabular-nums text-zinc-200">{formatCompactNumber(cannMatch.totalImpressions)}</p>
                                    </div>
                                    <div>
                                        <p className="text-zinc-600">Best position</p>
                                        <p className="mt-0.5 font-semibold tabular-nums text-zinc-200">{cannMatch.bestPosition.toFixed(1)}</p>
                                    </div>
                                </div>
                                <p className="mt-2 truncate text-[11px] text-zinc-500">
                                    Top URL: <span className="text-zinc-300">{shortenPath(cannMatch.pages[0]?.page || '')}</span>
                                </p>
                            </>
                        ) : (
                            <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-500">Single page ranks for this query — no cannibalization detected.</p>
                        )}
                    </div>

                    {/* CTR vs expected */}
                    {ctrAnalysis ? (
                        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-3.5 w-3.5 text-cyan-300" />
                                    <p className="text-[12.5px] font-semibold text-white">CTR vs expected</p>
                                </div>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Pos. {ctrAnalysis.position.toFixed(1)}</span>
                            </div>

                            <div className="space-y-2">
                                <BenchmarkRow label="You" value={ctrAnalysis.actual} max={Math.max(ctrAnalysis.actual, ctrAnalysis.expected, 1)} color="bg-cyan-400" />
                                <BenchmarkRow label="Expected" value={ctrAnalysis.expected} max={Math.max(ctrAnalysis.actual, ctrAnalysis.expected, 1)} color="bg-zinc-500" />
                            </div>

                            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                                {ctrAnalysis.gap > 0
                                    ? `CTR is ${ctrAnalysis.gap.toFixed(1)} pp below benchmark — improving the title and meta description usually closes most of the gap.`
                                    : 'CTR meets or exceeds the expected benchmark for this position.'}
                            </p>
                        </div>
                    ) : null}

                    {/* Recommendation */}
                    {recommendation ? (
                        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-3.5 w-3.5 text-emerald-300" />
                                <p className="text-[12.5px] font-semibold text-white">Recommendation</p>
                            </div>
                            <p className="mt-1.5 text-[12.5px] font-semibold text-zinc-100">{recommendation.title}</p>
                            <p className="mt-1 text-[11.5px] leading-snug text-zinc-500">{recommendation.detail}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[recommendation.tone]}`}>
                                    {SEVERITY_LABEL[recommendation.tone]} impact
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {recommendation.impact}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/20 bg-emerald-500/[0.06] py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.12]"
                            >
                                View all recommendations
                                <ArrowRight className="h-3 w-3" />
                            </button>
                        </div>
                    ) : null}
                </div>
            )}
        </AnalyticsSubpagePanel>
    );
}

function BenchmarkRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] text-zinc-500">{label}</span>
            <div className="relative flex-1 overflow-hidden rounded-full bg-white/[0.04] h-1.5">
                <div className={`absolute left-0 top-0 h-full ${color} rounded-full transition-[width]`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-300">{value.toFixed(1)}%</span>
        </div>
    );
}
