'use client';

/**
 * WeekSummary — renders one week's full briefing.
 *
 * Layout:
 *   1. Gradient headline (the cron-generated one-liner)
 *   2. "Do these 3 things this week" — vertical action stack with
 *      "Ask AI about this" buttons that deep-link into /dashboard/ai-chat?q=…
 *   3. Supporting KPI tiles (most-changed metrics)
 *   4. Linked artifacts — winners/losers/cannibalization, each row
 *      linking into the SEO surface with query params pre-applied.
 *
 * Defensive about the snapshot blob shape — see DigestSnapshot in
 * lib/weeklyDigestClient.ts for the documented subset we read.
 */

import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown, MessageSquare, Target, AlertTriangle, Sparkles } from 'lucide-react';
import {
    normalizeActionItems,
    type DigestDetail,
    type ActionItem,
} from '@/lib/weeklyDigestClient';

interface WeekSummaryProps {
    digest: DigestDetail;
}

/* ─── Helpers ─── */

function fmtNum(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function fmtPct(n: number | null | undefined, opts?: { showSign?: boolean }): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    const showSign = opts?.showSign ?? true;
    const sign = showSign && n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
}

function deltaToneClass(n: number | null | undefined, opts?: { invertGoodness?: boolean }): string {
    if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return 'text-zinc-400';
    const isPositive = opts?.invertGoodness ? n < 0 : n > 0;
    return isPositive ? 'text-emerald-400' : 'text-red-400';
}

/** Build the /ai-chat URL for an "Ask AI about this" button.
 *
 * The chat page accepts `?q=` (see web/src/app/(dashboard)/dashboard/ai-chat/page.tsx:659).
 * We tack on a `context` hint that the chat may or may not honor today — it's
 * harmless either way (the chat URL-scrubs unknown params).
 *
 * TODO(chat): wire the `context` query param into the chat's persona-context
 * injection so the LLM knows which week the user is asking about.
 */
function askAiUrl(prompt: string, contextLabel?: string): string {
    const params = new URLSearchParams({ q: prompt });
    if (contextLabel) params.set('context', contextLabel);
    return `/dashboard/ai-chat?${params.toString()}`;
}

function seoUrlWithFilter(siteUrl: string | null, params: Record<string, string>): string {
    const q = new URLSearchParams(params);
    if (siteUrl) q.set('site', siteUrl);
    const qs = q.toString();
    return qs ? `/dashboard/seo?${qs}` : '/dashboard/seo';
}

/* ─── Sub-components ─── */

function KpiTile({
    label,
    value,
    delta,
    invertGoodness,
}: {
    label: string;
    value: string;
    delta?: number | null;
    invertGoodness?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">
                {label}
            </div>
            <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-white tabular-nums">
                    {value}
                </div>
                {delta !== undefined && delta !== null && Number.isFinite(delta) ? (
                    <div className={`text-xs font-mono ${deltaToneClass(delta, { invertGoodness })}`}>
                        {fmtPct(delta)}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function ActionCard({ item, contextLabel, idx }: { item: ActionItem; contextLabel: string; idx: number }) {
    const prompt = item.askPrompt || item.title;
    return (
        <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-[#14C4E1]/30 hover:bg-white/[0.04] transition-all p-5">
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-[#14C4E1]/16 to-[#7AD9DA]/16 border border-[#14C4E1]/22 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#7AD9DA]">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white leading-snug mb-1">
                        {item.title}
                    </h3>
                    {item.body ? (
                        <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                            {item.body}
                        </p>
                    ) : null}
                    <Link
                        href={askAiUrl(prompt, contextLabel)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7AD9DA] hover:text-white transition-colors"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ask AI about this
                        <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>
        </div>
    );
}

/* ─── Main ─── */

export default function WeekSummary({ digest }: WeekSummaryProps) {
    const headline = digest.headline?.trim() || `Week ${digest.iso_week}, ${digest.year}`;
    const actionItems = normalizeActionItems(digest.action_items);
    const snapshot = digest.snapshot;
    const contextLabel = `week-${digest.iso_week}-${digest.year}`;
    const siteUrl = digest.site_url;

    // KPI extraction is defensive — the snapshot writer (the cron) may name
    // these slightly differently. We render whichever 4 are present.
    const kpis = snapshot?.kpis;
    const tiles: Array<{ label: string; value: string; delta?: number | null; invertGoodness?: boolean }> = [];
    if (kpis) {
        if (typeof kpis.totalClicks === 'number') {
            tiles.push({ label: 'Search clicks', value: fmtNum(kpis.totalClicks), delta: kpis.changeClicks });
        }
        if (typeof kpis.totalImpressions === 'number') {
            tiles.push({ label: 'Impressions', value: fmtNum(kpis.totalImpressions), delta: kpis.changeImpressions });
        }
        if (typeof kpis.avgPosition === 'number') {
            tiles.push({ label: 'Avg position', value: kpis.avgPosition.toFixed(1), delta: undefined });
        }
        if (typeof kpis.totalUsers === 'number') {
            tiles.push({ label: 'Users', value: fmtNum(kpis.totalUsers), delta: kpis.changeUsers });
        }
        if (tiles.length < 4 && typeof kpis.avgCTR === 'number') {
            tiles.push({ label: 'Avg CTR', value: `${kpis.avgCTR.toFixed(1)}%`, delta: undefined });
        }
        if (tiles.length < 4 && typeof kpis.totalPageViews === 'number') {
            tiles.push({ label: 'Pageviews', value: fmtNum(kpis.totalPageViews), delta: undefined });
        }
    }

    const winners = snapshot?.winnersLosers?.winners?.slice(0, 5) || [];
    const losers = snapshot?.winnersLosers?.losers?.slice(0, 5) || [];
    const topCannibalization = snapshot?.cannibalization?.cannibalized?.[0] || null;

    // Top CTR opportunity — striking distance candidate: position 6-15 with
    // high impressions but mediocre CTR.
    const queries = snapshot?.queries || snapshot?.topQueries || [];
    const ctrOpportunity = queries
        .filter((q) => {
            const pos = typeof q.position === 'number' ? q.position : 0;
            const imps = typeof q.impressions === 'number' ? q.impressions : 0;
            return pos >= 6 && pos <= 15 && imps > 50;
        })
        .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0] || null;

    return (
        <div className="space-y-8">
            {/* Headline */}
            <header className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-[#7AD9DA]" />
                    Week {digest.iso_week} · {digest.year}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold leading-tight bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                    {headline}
                </h1>
                {digest.created_at ? (
                    <p className="text-xs text-zinc-600">
                        Briefing generated {new Date(digest.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                    </p>
                ) : null}
            </header>

            {/* Action items */}
            {actionItems.length > 0 ? (
                <section>
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3 flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-[#7AD9DA]" />
                        Do these {Math.min(3, actionItems.length)} things this week
                    </h2>
                    <div className="space-y-3">
                        {actionItems.slice(0, 3).map((item, idx) => (
                            <ActionCard key={idx} item={item} contextLabel={contextLabel} idx={idx} />
                        ))}
                    </div>
                </section>
            ) : null}

            {/* Supporting KPIs */}
            {tiles.length > 0 ? (
                <section>
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">
                        Supporting metrics
                    </h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {tiles.slice(0, 4).map((t, i) => (
                            <KpiTile
                                key={i}
                                label={t.label}
                                value={t.value}
                                delta={t.delta ?? undefined}
                                invertGoodness={t.invertGoodness}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            {/* Linked artifacts — winners / losers / cannibalization / CTR opportunity */}
            {(winners.length > 0 || losers.length > 0 || topCannibalization || ctrOpportunity) ? (
                <section>
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">
                        Linked artifacts
                    </h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {winners.length > 0 ? (
                            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    <h3 className="text-sm font-semibold text-white">Top winners</h3>
                                </div>
                                <ul className="space-y-2">
                                    {winners.map((w, i) => (
                                        <li key={i}>
                                            <Link
                                                href={seoUrlWithFilter(siteUrl, { keyword: w.query })}
                                                className="flex items-baseline justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                                            >
                                                <span className="text-xs text-zinc-300 truncate" title={w.query}>
                                                    {w.query}
                                                </span>
                                                <span className="text-[11px] font-mono text-emerald-400 flex-shrink-0">
                                                    +{w.clicksDelta}c · {fmtPct(w.clicksDeltaPct)}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {losers.length > 0 ? (
                            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                    <h3 className="text-sm font-semibold text-white">Top losers</h3>
                                </div>
                                <ul className="space-y-2">
                                    {losers.map((l, i) => (
                                        <li key={i}>
                                            <Link
                                                href={seoUrlWithFilter(siteUrl, { keyword: l.query })}
                                                className="flex items-baseline justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                                            >
                                                <span className="text-xs text-zinc-300 truncate" title={l.query}>
                                                    {l.query}
                                                </span>
                                                <span className="text-[11px] font-mono text-red-400 flex-shrink-0">
                                                    {l.clicksDelta}c · {fmtPct(l.clicksDeltaPct)}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {topCannibalization ? (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    <h3 className="text-sm font-semibold text-white">Cannibalization</h3>
                                </div>
                                <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                                    <span className="font-mono text-amber-300">&ldquo;{topCannibalization.query}&rdquo;</span>{' '}
                                    is ranking {topCannibalization.pages.length} pages — pick one canonical winner.
                                </p>
                                <Link
                                    href={seoUrlWithFilter(siteUrl, { keyword: topCannibalization.query, focus: 'cannibalization' })}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-100"
                                >
                                    Inspect in SEO
                                    <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        ) : null}

                        {ctrOpportunity ? (
                            <div className="rounded-2xl border border-[#14C4E1]/20 bg-[#14C4E1]/[0.03] p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Target className="w-4 h-4 text-[#7AD9DA]" />
                                    <h3 className="text-sm font-semibold text-white">CTR opportunity</h3>
                                </div>
                                <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                                    <span className="font-mono text-[#7AD9DA]">&ldquo;{ctrOpportunity.query}&rdquo;</span>{' '}
                                    ranks pos{' '}
                                    {typeof ctrOpportunity.position === 'number' ? ctrOpportunity.position.toFixed(1) : '—'}{' '}
                                    with {fmtNum(ctrOpportunity.impressions)} impressions. Rewrite the title.
                                </p>
                                <Link
                                    href={askAiUrl(`Rewrite the title and meta description for the page ranking for "${ctrOpportunity.query}"`, contextLabel)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[#7AD9DA] hover:text-white"
                                >
                                    Ask AI to rewrite
                                    <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
