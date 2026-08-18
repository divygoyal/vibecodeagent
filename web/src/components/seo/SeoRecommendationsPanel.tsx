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

/**
 * Discipline tail appended to every prompt in this panel. Centralised so the
 * AI's behaviour rules (cite-or-decline, word cap, no-restating) stay
 * consistent across recommendation types — and so we don't accidentally drop
 * one from a single variant.
 */
const DISCIPLINE = 'Cite the specific tool for every site-specific claim — say "can\'t confirm" rather than fabricate. Under 350 words total. No "overall" or "in conclusion" paragraphs. Don\'t restate the metrics already in this prompt.';

function buildRecommendationPrompt(rec: SeoRecommendation, siteUrl?: string | null): string {
    const site = siteUrl || 'my site';
    const pageLine = rec.page ? ` Affected page: ${rec.page}.` : '';
    switch (rec.type) {
        case 'content_decay':
            return `Content decay on ${site}: "${rec.title}". ${rec.description}${pageLine}

Investigate: WHEN did the decay start? Use compare_time_periods to find the inflection point. Was it a Google algorithm update (name the month + update), a SERP layout shift (new snippet, video carousel, ads), or a specific competitor leapfrog? Use get_search_performance for the timeline and inspect_url for current state.

Forbidden: generic "refresh your content" advice without a cited cause. Listing every issue you see — give me one cause and the decision.

Output:
- THE CAUSE (one sentence, cited from a tool result)
- THE DECISION: refresh, expand, merge, or sunset. Pick one. If sunset, say so plainly.
- 3 actions in priority order. Each: specific change + effort (S/M/L) + projected click recovery in numbers + confidence (high/medium/low)
- ONE surprise: a related query RISING while this one fell — audience may have moved

${DISCIPLINE}`;
        case 'keyword_gap':
            return `Keyword gap on ${site}: "${rec.title}". ${rec.description}

Investigate: analyze_keyword_clusters for the full semantic territory. get_search_performance to find foothold queries (small share) vs zero-presence queries. Compare to the implied top-ranking pages.

Forbidden: generic "create more content" advice. Listing every related keyword — I want the SPECIFIC content piece with the highest ROI.

Output:
- THE GAP: one sentence on the topical cluster I'm missing (cited)
- 3 content pieces ranked by ROI. Each: working title, target query, monthly impressions available, effort (S/M/L), confidence (high/medium/low)
- For piece #1: H1 + H2 outline (8 sections max) + 5 internal links to point at it
- ONE surprise: a foothold query NO competitor is targeting — protect/expand it

${DISCIPLINE}`;
        case 'cannibalization':
            return `Cannibalization on ${site}: "${rec.title}". ${rec.description}${pageLine}

Investigate: find_cannibalization for the competing pages. For each, get backlinks, content depth, recency, and queries it ranks for BEYOND this one (via get_search_performance).

Forbidden: blanket "301 everything to the strongest page" — that breaks queries the losers actually win. Picking canonical by position alone (ignores backlink strength).

Output:
- THE WINNER: which page to keep, cited with data (backlinks N, traffic to other queries, depth)
- REDIRECT MAP per remaining page: 301-redirect, canonicalize-only (protects other rankings), or content-merge. Reason per page.
- 5 internal-link anchors to consolidate authority on the winner
- Projected click recovery via calculate_revenue_impact
- ONE surprise: a query where a "loser" is actually the BEST performer — flag before any redirect breaks it

${DISCIPLINE}`;
        case 'technical':
            return `Technical issue on ${site}: "${rec.title}". ${rec.description}${pageLine}

Investigate: run_page_audit + inspect_url. For each detected issue, correlate with traffic data (get_search_performance). I want issues PROVEN to be hurting traffic, not a generic checklist.

Forbidden: "improve Core Web Vitals" without naming the metric and target. "Add schema markup" without specifying the schema type and the SERP feature it unlocks. Listing 47 broken links if only 2 are on traffic-driving pages.

Output:
- THE BLOCKER: ONE technical issue with cited measurement (e.g., "LCP 4.2s on mobile per run_page_audit, target <2.5s") AND cited correlation to the rank/CTR
- 3 fixes in priority order. Each: specific change (file/component) + effort (S/M/L) + projected lift in numbers + confidence
- Skip anything below medium confidence — don't pad
- ONE surprise: a non-technical issue masquerading as technical (slow page that's actually a content gap, etc.)

${DISCIPLINE}`;
        case 'opportunity':
        default:
            return `Striking-distance opportunity on ${site}: "${rec.title}". ${rec.description} Expected impact: ${rec.impact}.${pageLine}

The page is close to top 3 — what's blocking the last push? Investigate: get_search_performance for the full query cluster, inspect_url on the ranking page, then identify what the implied top-3 pages have that we don't (backlinks depth + topical relevance, content depth, schema markup, freshness, internal-authority signal).

Forbidden: title/meta rewrites — that's a CTR problem, not a ranking problem at this position. Generic "build links" without specifying source pages and anchor text. Restating the metrics already in this prompt.

Output:
- THE GAP: ONE specific thing top-3 has that we don't (cited from a tool, or stated as an inference with the data behind it)
- 3 actions in priority order. Each: specific change + effort (S/M/L) + projected click lift via calculate_revenue_impact + confidence
- ONE surprise: hidden cannibalization, intent mismatch with the SERP, or a competitor gaming a SERP feature — something I wouldn't notice manually

${DISCIPLINE}`;
    }
}

function buildPrioritizePrompt(siteUrl?: string | null, count?: number): string {
    const site = siteUrl || 'my site';
    const total = count && count > 0 ? `the ${count} active recommendations on this dashboard` : 'my SEO recommendations';

    return `Rank my SEO work for this week on ${site}. Use find_top_money_move and compute_site_health_score against ${total}.

Forbidden: a flat list of 5 generic actions. Equal weighting of recommendations — some are real money, some are tinkering. Be honest about which is which.

Output:
- TOP 3 MOVES, ranked by (projected click lift × confidence) ÷ effort. For each:
  - The specific action (one sentence)
  - Effort (S/M/L) and projected click lift in numbers
  - Confidence (high/medium/low) and the reason
  - The first concrete step I can take today
- THE NO-GO: one recommendation from the dashboard I should SKIP this week and why (low confidence, blocked by infra, etc.)
- ONE surprise: a 5th hidden lever NOT in the dashboard recommendations that my data suggests is bigger than any of them

${DISCIPLINE}`;
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
