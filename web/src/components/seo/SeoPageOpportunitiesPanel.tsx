'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, Lightbulb, Search, Smartphone, Sparkles, Target } from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { buildAskAiUrl } from '@/lib/askAi';
import { usePageDetail } from '@/lib/useDashboardData';
import type { SeoPageRow } from './SeoQueriesPagesPanel';

interface SeoPageOpportunitiesPanelProps {
    pageUrl: string | null;
    siteUrl: string | null;
    /** Selected page's row from the parent table (for fallback metrics + recommendation logic). */
    pageRow?: SeoPageRow;
}

interface DeviceRow {
    device: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface KeywordRow {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface PageDetail {
    keywords: KeywordRow[];
    devices: DeviceRow[];
}

const SEVERITY_BADGE: Record<string, string> = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};
const SEVERITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

function buildPageOpportunityPrompt(
    pageUrl: string,
    siteUrl: string | null,
    pageRow: SeoPageRow,
    deviceGap: { gap: number } | null,
    topKeyword: { query: string; position: number } | null,
    recommendation: { title: string; detail: string; impact: string },
): string {
    const site = siteUrl || 'my site';
    const stats = `Currently ranking at position ${pageRow.position.toFixed(1)} with ${pageRow.clicks.toLocaleString()} clicks and ${pageRow.impressions.toLocaleString()} impressions (CTR ${pageRow.ctr.toFixed(1)}%).`;
    const deviceLine = deviceGap ? ` Mobile vs desktop position gap: ${Math.abs(deviceGap.gap).toFixed(1)} positions.` : '';
    const topKwLine = topKeyword ? ` Top driver query: "${topKeyword.query}" at position ${topKeyword.position.toFixed(1)}.` : '';
    return `Build a step-by-step fix plan for ${pageUrl} on ${site}. Recommended angle: "${recommendation.title}" — ${recommendation.detail} Expected impact: ${recommendation.impact}. ${stats}${deviceLine}${topKwLine} Use run_page_audit, find_cannibalization, generate_meta_tags, and suggest_internal_links as appropriate. Give me a numbered plan with effort (S/M/L) and projected click lift per step.`;
}

export default function SeoPageOpportunitiesPanel({ pageUrl, siteUrl, pageRow }: SeoPageOpportunitiesPanelProps) {
    const { data } = usePageDetail(pageUrl ? siteUrl : null, pageUrl);
    const detail = data as PageDetail | undefined;

    const deviceGap = useMemo(() => {
        if (!detail?.devices?.length) return null;
        const mobile = detail.devices.find(d => d.device.toUpperCase() === 'MOBILE');
        const desktop = detail.devices.find(d => d.device.toUpperCase() === 'DESKTOP');
        if (!mobile || !desktop) return null;
        const gap = +(mobile.position - desktop.position).toFixed(1); // positive = mobile worse
        const totalClicks = mobile.clicks + desktop.clicks;
        const mobileShare = totalClicks > 0 ? +((mobile.clicks / totalClicks) * 100).toFixed(0) : 0;
        return { mobile, desktop, gap, mobileShare };
    }, [detail]);

    const topKeyword = useMemo(() => {
        if (!detail?.keywords?.length) return null;
        return [...detail.keywords].sort((a, b) => b.impressions - a.impressions)[0];
    }, [detail]);

    const recommendation = useMemo(() => {
        if (!pageRow) return null;
        if (deviceGap && Math.abs(deviceGap.gap) >= 1.5) {
            const laggard = deviceGap.gap > 0 ? 'mobile' : 'desktop';
            return {
                title: `Improve ${laggard} experience`,
                detail: `${laggard === 'mobile' ? 'Mobile' : 'Desktop'} ranks ${Math.abs(deviceGap.gap).toFixed(1)} positions behind ${laggard === 'mobile' ? 'desktop' : 'mobile'}. ${laggard === 'mobile' ? 'Check Core Web Vitals, tap targets, and above-the-fold content on small screens.' : 'Verify desktop layout still surfaces the main content and CTAs above the fold.'}`,
                impact: `+${Math.round((laggard === 'mobile' ? deviceGap.mobile.impressions : deviceGap.desktop.impressions) * 0.04).toLocaleString()} clicks/mo`,
                tone: 'high' as const,
            };
        }
        if (pageRow.position >= 11 && pageRow.position <= 20) {
            return {
                title: 'Push into striking distance',
                detail: 'Page is ranking on page 2. Add internal links from authoritative pages and expand topical depth.',
                impact: `+${Math.round(pageRow.impressions * 0.05).toLocaleString()} clicks/mo`,
                tone: 'medium' as const,
            };
        }
        if (pageRow.ctr < 1.5 && pageRow.position <= 10) {
            return {
                title: 'Rewrite title & meta',
                detail: 'CTR is low for a top-10 ranking. The title or description is likely off-intent or unattractive in SERPs.',
                impact: `+${Math.round(pageRow.impressions * 0.02).toLocaleString()} clicks/mo`,
                tone: 'medium' as const,
            };
        }
        return {
            title: 'Maintain & monitor',
            detail: 'Page is performing in line with expectations. Keep content fresh and watch for ranking drift.',
            impact: 'stable',
            tone: 'low' as const,
        };
    }, [deviceGap, pageRow]);

    return (
        <AnalyticsSubpagePanel
            title="Opportunities & Risks"
            description="Device gap, top driver, and a recommended action for the selected page."
            tone="amber"
        >
            {!pageUrl || !pageRow ? (
                <div className="flex h-[280px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/[0.06] bg-[#0a0b0e] text-center">
                    <Search className="mb-3 h-5 w-5 text-zinc-600" />
                    <p className="text-[13px] font-semibold text-white">Pick a page</p>
                    <p className="mt-1 max-w-xs text-[12px] text-zinc-500">Once you select a page, we&apos;ll surface device gap, top keyword driver, and a recommendation here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Device gap risk */}
                    <div className={`rounded-[14px] border px-3.5 py-3 ${deviceGap && Math.abs(deviceGap.gap) >= 1.5 ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-white/[0.06] bg-[#0d0e12]'}`}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">
                                <Smartphone className="h-3 w-3" />
                                Device gap
                            </span>
                            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${deviceGap && Math.abs(deviceGap.gap) >= 3 ? SEVERITY_BADGE.high : deviceGap && Math.abs(deviceGap.gap) >= 1.5 ? SEVERITY_BADGE.medium : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>
                                {deviceGap && Math.abs(deviceGap.gap) >= 3 ? 'High' : deviceGap && Math.abs(deviceGap.gap) >= 1.5 ? 'Medium' : 'Healthy'}
                            </span>
                        </div>
                        {deviceGap ? (
                            <>
                                <p className="text-[11.5px] leading-snug text-zinc-400">
                                    Mobile ranks at <span className="font-semibold text-amber-300">{deviceGap.mobile.position.toFixed(1)}</span>, desktop at <span className="font-semibold text-emerald-300">{deviceGap.desktop.position.toFixed(1)}</span>. Mobile drives <span className="font-semibold text-cyan-300">{deviceGap.mobileShare}%</span> of the clicks.
                                </p>
                                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                                    <Stat label="Mobile clicks" value={formatCompactNumber(deviceGap.mobile.clicks)} tone="emerald" />
                                    <Stat label="Desktop clicks" value={formatCompactNumber(deviceGap.desktop.clicks)} tone="cyan" />
                                </div>
                            </>
                        ) : (
                            <p className="text-[11.5px] leading-snug text-zinc-500">No mobile/desktop split available for this page yet.</p>
                        )}
                    </div>

                    {/* Top keyword driver */}
                    {topKeyword ? (
                        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">
                                    <Target className="h-3 w-3" />
                                    Top driver
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Pos. {topKeyword.position.toFixed(1)}</span>
                            </div>
                            <p className="break-words text-[12.5px] font-semibold text-white">&ldquo;{topKeyword.query}&rdquo;</p>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                <Stat label="Clicks" value={formatCompactNumber(topKeyword.clicks)} tone="emerald" />
                                <Stat label="Impressions" value={formatCompactNumber(topKeyword.impressions)} tone="cyan" />
                                <Stat label="CTR" value={`${topKeyword.ctr.toFixed(1)}%`} tone="amber" />
                            </div>
                        </div>
                    ) : null}

                    {/* Recommendation */}
                    {recommendation ? (
                        <div className="rounded-[14px] border border-emerald-500/15 bg-emerald-500/[0.03] px-3.5 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                                <Lightbulb className="h-3 w-3" />
                                Recommendation
                            </span>
                            <p className="mt-1.5 text-[13px] font-semibold text-white">{recommendation.title}</p>
                            <p className="mt-1 text-[11.5px] leading-snug text-zinc-400">{recommendation.detail}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[recommendation.tone]}`}>
                                    {SEVERITY_LABEL[recommendation.tone]} impact
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {recommendation.impact}
                                </span>
                            </div>
                            <Link
                                href={buildAskAiUrl(buildPageOpportunityPrompt(pageUrl, siteUrl, pageRow, deviceGap, topKeyword, recommendation))}
                                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/[0.08] py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.16]"
                            >
                                <Sparkles className="h-3 w-3" />
                                Build fix plan with AI
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    ) : null}
                </div>
            )}
        </AnalyticsSubpagePanel>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'cyan' | 'amber' }) {
    const cls = tone === 'emerald' ? 'text-emerald-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-amber-300';
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>
            <p className={`mt-0.5 font-semibold tabular-nums ${cls}`}>{value}</p>
        </div>
    );
}
