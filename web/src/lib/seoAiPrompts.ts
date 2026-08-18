/**
 * SEO finding → AI-chat deep-link helpers.
 *
 * Each SEO panel surfaces context (selected keyword, selected page, a
 * cannibalization detection, a CTR gap, a striking-distance opportunity,
 * etc.). When the user wants to ask the AI about that specific finding,
 * we pre-bake a question that:
 *   1. Names the exact keyword / page / numbers, so the AI can't fall back
 *      to generic advice;
 *   2. Names the inspection it should run (inspect_url, find_cannibalization,
 *      cross_source_diagnose) — the chat's system prompt enforces this once
 *      the `__from=seo:*` URL param routes the right tool.
 *
 * The shape mirrors the report-email deep-link helpers in
 * `web/src/lib/reportEmail.ts` so prompt evolution stays in lockstep with
 * the email surface — change the question text here and re-check the email
 * to keep both surfaces in sync.
 */

const CHAT_PATH = '/dashboard/ai-chat';

/** Used as the `__from` URL param so the AI knows which SEO surface the
 *  user came from. The chat's system prompt routes the relevant tool first
 *  based on this tag (see `route.ts` __from handling). */
export type SeoFromTag =
    | 'seo:keyword_insight'
    | 'seo:keyword_opportunity'
    | 'seo:keyword_opportunity:cannibalization'
    | 'seo:keyword_opportunity:ctr_gap'
    | 'seo:keyword_opportunity:striking'
    | 'seo:page_insight'
    | 'seo:page_opportunity'
    | 'seo:overview';

export interface BuildChatUrlOpts {
    question: string;
    siteUrl?: string | null;
    propertyId?: string | null;
    fromTag?: SeoFromTag;
}

/** Mirrors `buildAiChatUrl` in `lib/reportEmail.ts` but produces an internal
 *  Next.js path (no host) since this is called from React components inside
 *  the dashboard, not from a server-rendered email. */
export function buildAiChatUrl({ question, siteUrl, propertyId, fromTag }: BuildChatUrlOpts): string {
    const params = new URLSearchParams();
    params.set('q', question.slice(0, 320));
    if (propertyId) params.set('property', propertyId);
    if (siteUrl) params.set('site', siteUrl);
    if (fromTag) params.set('__from', fromTag);
    return `${CHAT_PATH}?${params.toString()}`;
}

// ─── Question templates ─────────────────────────────────────────────────────
// One per finding shape. Plain functions taking typed inputs so callers can't
// drift the prompt accidentally. All return raw question text (not URL-
// encoded); pass into buildAiChatUrl above to wrap into a chat deep-link.

export function keywordInsightPrompt(opts: {
    keyword: string;
    position: number;
    clicks: number;
    impressions: number;
    ctr: number;
}): string {
    const { keyword, position, clicks, impressions, ctr } = opts;
    return (
        `Tell me about "${keyword}" — currently #${position.toFixed(1)} with ${clicks} clicks, ${impressions} impressions, ${ctr.toFixed(1)}% CTR. ` +
        `Inspect the top-ranking page for this query and give me the 3 highest-impact changes I can make. Cite the source row or page for each recommendation.`
    );
}

export function cannibalizationPrompt(opts: {
    keyword: string;
    pageCount: number;
    samplePages: string[];
    totalImpressions: number;
}): string {
    const { keyword, pageCount, samplePages, totalImpressions } = opts;
    const sample = samplePages.slice(0, 3).join(', ');
    return (
        `I have ${pageCount} pages competing for "${keyword}" (${totalImpressions} total impressions): ${sample}. ` +
        `Pick the winner page and give me the consolidation plan — which to redirect, which to canonicalize, what content to merge.`
    );
}

export function ctrGapPrompt(opts: {
    keyword: string;
    position: number;
    actualCtr: number;
    expectedCtr: number;
    impressions: number;
}): string {
    const { keyword, position, actualCtr, expectedCtr, impressions } = opts;
    const gap = (expectedCtr - actualCtr).toFixed(1);
    return (
        `"${keyword}" ranks at #${position.toFixed(1)} but gets ${actualCtr.toFixed(1)}% CTR vs ${expectedCtr.toFixed(1)}% expected (${gap}pp gap, ~${impressions} impressions). ` +
        `Inspect the ranking page's title and meta description, then give me 3 rewrite variants anchored to this query.`
    );
}

export function strikingDistancePrompt(opts: {
    keyword: string;
    position: number;
    impressions: number;
}): string {
    const { keyword, position, impressions } = opts;
    return (
        `"${keyword}" is on page 2 at #${position.toFixed(1)} (${impressions} impressions). ` +
        `Show me the 3 highest-leverage on-page changes to push it into the top 10. Inspect the ranking page first.`
    );
}

export function pageInsightPrompt(opts: {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}): string {
    const { page, clicks, impressions, ctr, position } = opts;
    return (
        `Tell me about ${page} — ${clicks} clicks, ${impressions} impressions, ${ctr.toFixed(1)}% CTR, avg pos #${position.toFixed(1)}. ` +
        `What queries does it rank for, what's the click trend, and what are the 3 most impactful changes I can make? Inspect the page.`
    );
}

export function pageOpportunityPrompt(opts: {
    page: string;
    issue: 'decay' | 'ctr_gap' | 'striking' | 'generic';
    clicks: number;
    impressions: number;
    position: number;
}): string {
    const { page, issue, clicks, impressions, position } = opts;
    if (issue === 'decay') {
        return (
            `Why did ${page} lose ground? ${clicks} clicks / ${impressions} impressions / pos #${position.toFixed(1)}. ` +
            `Run cross_source_diagnose for this page. If GitHub is connected, check recent commits to it.`
        );
    }
    if (issue === 'ctr_gap') {
        return (
            `${page} is at #${position.toFixed(1)} with ${impressions} impressions but only ${clicks} clicks — CTR looks weak. ` +
            `Inspect the page's title and meta description; give me 3 rewrites anchored to its top queries.`
        );
    }
    if (issue === 'striking') {
        return (
            `${page} is ranking at #${position.toFixed(1)} (page 2). Inspect it, then give me 3 specific changes to push into top 10. ` +
            `Be concrete — name the missing on-page signals.`
        );
    }
    return (
        `Help me improve ${page}: ${clicks} clicks, ${impressions} impressions, pos #${position.toFixed(1)}. ` +
        `Inspect the page and surface the 3 highest-impact changes. Cite source rows.`
    );
}

export function seoOverviewPrompt(): string {
    return (
        `What are my 3 highest-impact SEO moves right now? Anchor every recommendation to a specific page or keyword from my data. ` +
        `For each, tell me the expected click lift and which tool you'd use to verify it.`
    );
}
