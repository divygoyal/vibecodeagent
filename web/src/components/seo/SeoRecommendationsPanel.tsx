'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Lightbulb, Shuffle, Sparkles, Target, Zap, type LucideIcon } from 'lucide-react';
import { AnalyticsSubpagePanel } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { buildAskAiUrl } from '@/lib/askAi';
import type { SeoRecommendation } from './SeoInsightsList';

interface SeoRecommendationsPanelProps {
    items: SeoRecommendation[];
    siteUrl?: string | null;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
    content_decay: BookOpen,
    keyword_gap: Target,
    technical: Zap,
    cannibalization: Shuffle,
    opportunity: CheckCircle2,
};

const SEVERITY_BADGE: Record<string, string> = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};

const SEVERITY_LABEL: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
};

function buildRecommendationPrompt(rec: SeoRecommendation, siteUrl?: string | null): string {
    const site = siteUrl || 'my site';
    const pageLine = rec.page ? ` Affected page: ${rec.page}.` : '';
    switch (rec.type) {
        case 'content_decay':
            return `Build a step-by-step fix plan for this content decay on ${site}: "${rec.title}". ${rec.description}${pageLine} Use get_search_performance to confirm the click trend, run_page_audit on the page, then propose (1) content refresh angles, (2) internal links to add via suggest_internal_links, and (3) a title/meta rewrite via generate_meta_tags. Estimate the recovery with calculate_revenue_impact.`;
        case 'keyword_gap':
            return `Build a content plan to capture the keyword gap on ${site}: "${rec.title}". ${rec.description} Use analyze_keyword_clusters to find related queries, then generate_content_strategy for a full outline (intent, H1, H2s, target length, internal links).`;
        case 'cannibalization':
            return `Resolve this cannibalization issue on ${site}: "${rec.title}". ${rec.description}${pageLine} Use find_cannibalization to confirm the affected pages, then tell me which page to keep, which to merge or 301-redirect, and what canonical decision to make. Estimate the click recovery.`;
        case 'technical':
            return `Build a technical SEO fix roadmap for ${site}: "${rec.title}". ${rec.description}${pageLine} Use run_page_audit and inspect_url, then list every issue with severity, the file or section to edit, and the SEO impact.`;
        case 'opportunity':
        default:
            return `Build a step-by-step plan to capture this SEO opportunity on ${site}: "${rec.title}". ${rec.description} Expected impact: ${rec.impact}.${pageLine} Use get_search_performance for context, then suggest_internal_links and generate_meta_tags as needed. Estimate the revenue lift with calculate_revenue_impact.`;
    }
}

function buildPrioritizePrompt(siteUrl?: string | null, count?: number): string {
    const site = siteUrl || 'my site';
    const total = count && count > 0 ? `the ${count} active recommendations` : 'all my SEO recommendations';
    return `This week on ${site}, what is the highest-ROI SEO work I should prioritize from ${total}? Use find_top_money_move and compute_site_health_score. Give me a ranked top 5 with effort estimate (S/M/L), expected click lift, and the first concrete action for each.`;
}

export default function SeoRecommendationsPanel({ items, siteUrl }: SeoRecommendationsPanelProps) {
    const display = items.slice(0, 3);

    return (
        <AnalyticsSubpagePanel
            title="Recommendations"
            description="Highest-impact actions for your site."
        >
            {display.length === 0 ? (
                <div className="rounded-[12px] border border-white/[0.04] bg-[#0a0b0e] px-4 py-6 text-center text-[12px] text-zinc-500">
                    No recommendations yet — connect your site and let data accumulate.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {display.map(rec => {
                        const Icon = TYPE_ICONS[rec.type] || Lightbulb;
                        const sevCls = SEVERITY_BADGE[rec.severity] || SEVERITY_BADGE.low;
                        const sevLabel = SEVERITY_LABEL[rec.severity] || 'Low';
                        const prompt = buildRecommendationPrompt(rec, siteUrl);
                        return (
                            <div
                                key={rec.id}
                                className="rounded-[14px] border border-white/[0.05] bg-[#0d0e12] px-3.5 py-3 transition-colors hover:border-white/[0.1]"
                            >
                                <div className="flex items-start gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.06] bg-white/[0.03]">
                                        <Icon className="h-3.5 w-3.5 text-zinc-300" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[13px] font-semibold leading-snug tracking-tight text-white">
                                                {rec.title}
                                            </p>
                                            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sevCls}`}>
                                                {sevLabel}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11.5px] leading-snug text-zinc-500">{rec.description}</p>
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                                                <Sparkles className="h-3 w-3" />
                                                {rec.impact}
                                            </span>
                                            <Link
                                                href={buildAskAiUrl(prompt)}
                                                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/25 bg-cyan-500/[0.08] px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition hover:border-cyan-500/40 hover:bg-cyan-500/[0.16]"
                                            >
                                                Build fix plan
                                                <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {items.length > 0 ? (
                <Link
                    href={buildAskAiUrl(buildPrioritizePrompt(siteUrl, items.length))}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/[0.08] py-2 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.16]"
                >
                    <Sparkles className="h-3 w-3" />
                    {items.length > 3 ? `Prioritize all ${items.length} with AI` : 'Build my action plan with AI'}
                    <ArrowRight className="h-3 w-3" />
                </Link>
            ) : null}
        </AnalyticsSubpagePanel>
    );
}
