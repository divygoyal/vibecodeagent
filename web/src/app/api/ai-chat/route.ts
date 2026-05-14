import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { AI_CHAT_TOOL_DECLARATIONS, executeAiChatTool } from '@/services/aiChatTools';
import { fetchGoogleTokensFromDb, listSearchConsoleSites, getValidAccessToken, listAnalyticsProperties } from '@/lib/googleApi';
import { fetchGithubTokenFromDb, fetchGithubAppToken } from '@/lib/githubApi';
import { GoogleGenAI } from '@google/genai';
import {
    loadUserFacts,
    loadThreadSummary,
    formatMemoryBlock,
    extractFactsFromTurn,
    summarizeThread,
    embedTurn,
    recallSimilarTurns,
    type RecalledHit,
} from '@/lib/chatMemory';
import { resolvePersona } from '@/services/chat/personas';
import { runPlanner } from '@/services/chat/planner';
import { runCritic } from '@/services/chat/critic';
import { buildEnrichedSnapshot, buildRichChatContext, injectDeployCorrelation, type EnrichedSnapshot } from '@/lib/chatSnapshot';
import { loadThreadState, saveThreadState, formatThreadStateForPrompt, type ChatThreadState } from '@/lib/chatThreadState';
import { logChatTelemetry } from '@/lib/chatTelemetry';
import { makeFingerprint, findRepetitionMatch, formatRepetitionTag } from '@/lib/questionFingerprint';
import { correlateDeploysWithLosers, shouldRunDeployCorrelation } from '@/lib/dataSources/deployCorrelation';
import { MAX_INPUT_CHARS, ERR_MESSAGE_TOO_LONG } from '@/lib/chatLimits';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Initialize the official Gemini SDK
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// A7: Trimmed model fallback chain. The pro-preview is rarely better and slower.
// 2.5-flash is legacy. Two-step chain saves 36-43s of fallback latency on bad days.
const CHAT_MODELS = [
    { model: 'gemini-3-flash-preview', timeout: 25000 },
    { model: 'gemini-3.1-flash-lite-preview', timeout: 15000 },
] as const;

// B2-thin: lightweight intent classifier — runs ONCE per turn before the main
// stream so we can pin the system prompt to the right INTENT MODE. Uses the
// cheapest model. Output is plaintext "INTENT_LABEL"; we whitelist on parse.
const INTENT_LABELS = [
    'CASUAL_GREETING', 'DIAGNOSTIC', 'OPPORTUNITY', 'CONTENT_BRIEF',
    'EXECUTIVE_SUMMARY', 'TECHNICAL_AUDIT', 'META_QUESTION', 'DEEP_DIVE',
    'COACHING', 'COMPARISON', 'HYPOTHETICAL',
] as const;
type IntentLabel = typeof INTENT_LABELS[number];

async function classifyIntent(genai: GoogleGenAI, userMessage: string): Promise<IntentLabel | null> {
    try {
        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text:
                `Classify this user message into ONE of these intent labels and respond with JUST the label, nothing else:\n` +
                `CASUAL_GREETING — pleasantries, "hi", "thanks", small talk, no analytical question.\n` +
                `DEEP_DIVE — wants the SINGLE highest-impact move ("what is the ONE thing", "biggest leak", "where do I focus first", "highest priority", "most impactful fix"). Singular, specific.\n` +
                `OPPORTUNITY — wants a LIST of growth wins ("show me opportunities", "what should I do" plural, "find me wins", "growth opportunities" without "ONE/single/biggest").\n` +
                `DIAGNOSTIC — a "why did X happen / what broke / why dropped / regression" investigation request.\n` +
                `CONTENT_BRIEF — write a brief, generate meta tags, blog ideas, content outline.\n` +
                `EXECUTIVE_SUMMARY — "summarize", "top-line", "executive snapshot", "TLDR".\n` +
                `TECHNICAL_AUDIT — "audit my site", "is my SEO good", "find issues".\n` +
                `META_QUESTION — asks about the chat itself ("what can you do", "which tools").\n` +
                `COMPARISON — wants benchmark context ("how am I doing", "is this good", "vs my industry", "is my CTR normal", "what's typical").\n` +
                `HYPOTHETICAL — asks "what if" / projection / forecast ("what if I publish more", "if I doubled traffic", "should I translate", "what would happen if").\n\n` +
                `IMPORTANT:\n` +
                `- "What is the ONE thing I should do today to grow?" → DEEP_DIVE (singular).\n` +
                `- "Show me 3 things I don't know about my site" → DEEP_DIVE (singular discovery).\n` +
                `- "Am I doing well?" / "How does this compare?" → COMPARISON.\n` +
                `- "What if I rewrote all my titles?" → HYPOTHETICAL.\n` +
                `(COACHING is auto-selected server-side for infant sites — DO NOT pick this label.)\n\n` +
                `MESSAGE: ${userMessage.slice(0, 800)}\n\n` +
                `Respond with exactly one label from the list above. No quotes, no commentary.`
            }] }],
            config: {
                temperature: 0,
                maxOutputTokens: 12,
                httpOptions: { timeout: 6000 },
            },
        });
        const raw = (res?.text || '').trim().toUpperCase();
        for (const label of INTENT_LABELS) {
            if (raw.includes(label)) return label;
        }
        return null;
    } catch {
        return null; // best-effort; caller falls back to inferring from prompt
    }
}

function isRetryableError(error: any): boolean {
    const msg = error?.message || '';
    const name = error?.name || '';
    return msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('UNAVAILABLE') || msg.includes('overloaded')
        || msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED') || msg.includes('aborted') || name === 'AbortError' || name === 'TimeoutError';
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY CACHE for site/property lists (avoids re-fetching per message)
// ═══════════════════════════════════════════════════════════════
const SITE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const SITE_CACHE_MAX_ENTRIES = 500; // Prevent unbounded memory growth
const siteListCache = new Map<string, { data: any; ts: number }>();

function getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = siteListCache.get(key);
    if (cached && Date.now() - cached.ts < SITE_CACHE_TTL) {
        return Promise.resolve(cached.data as T);
    }
    return fetcher().then(data => {
        // Evict stale entries when cache grows too large
        if (siteListCache.size >= SITE_CACHE_MAX_ENTRIES) {
            const now = Date.now();
            for (const [k, v] of siteListCache) {
                if (now - v.ts > SITE_CACHE_TTL) siteListCache.delete(k);
            }
            // If still too large, remove oldest 75% of entries
            if (siteListCache.size >= SITE_CACHE_MAX_ENTRIES) {
                const entries = [...siteListCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
                const toRemove = Math.ceil(entries.length * 0.75);
                for (let i = 0; i < toRemove; i++) {
                    siteListCache.delete(entries[i][0]);
                }
            }
        }
        siteListCache.set(key, { data, ts: Date.now() });
        return data;
    });
}

// ═══════════════════════════════════════════════════════════════
// UNIVERSAL ANALYST — SYSTEM INSTRUCTION (shared preamble + persona)
// B3-full: persona-specific blocks live in services/chat/personas/*.ts
// and are composed in via composePromptForPersona() per turn.
// ═══════════════════════════════════════════════════════════════
const SHARED_PREAMBLE = `You are TrafficClaw Universal Analyst — an elite SEO & Analytics AI. Give VERDICTS, not advice. Be direct, bold, data-driven. DECLARE and PRESCRIBE. Never hedge. Answer general questions from your knowledge.

READ THE SITE PROFILE FIRST. The snapshot starts with a SITE PROFILE block declaring whether this is a COMMERCIAL site (sells/captures), a CONTENT site (blog/portfolio/docs/magazine), a MIXED site, or UNKNOWN. The profile dictates which diagnoses make sense:
- COMMERCIAL site → buyer-intent gap, funnel disconnect, missing /pricing/vs/alternative pages, conversion opacity ARE the right diagnoses.
- CONTENT site → publishing cadence, audience capture (email/RSS), topical breadth, content decay, retention ARE the right diagnoses. NEVER recommend "build a pricing page" or "you have no buyer-intent traffic" for a blog/portfolio — they don't WANT buyers.
- MIXED site → both apply.
- UNKNOWN → ask the user about their growth goal before recommending strategic moves. Tactical SEO fixes still apply.

ROOT-CAUSE THINKING (this is the difference between a generic AI answer and a "wow" answer):
- Diagnose WHY growth isn't happening, not WHAT tweak to make.
- Tactical wins (CTR fixes, position bumps, meta rewrites) are surface-level. They matter when growth is healthy and you're optimizing.
- Strategic gaps are root causes. They explain why a site with traffic still isn't growing — but the SHAPE of those gaps depends on site type.
- The snapshot's RANKED INSIGHTS block mixes strategic + tactical, sorted by impact. The detector ALREADY GATED itself by site type, so you can trust everything you see — if a buyer-intent diagnosis appears, this site is commercial.
- When picking what to talk about, prefer the diagnosis that makes the user say "I missed that".

CONNECT DOTS ACROSS DATA — that's what makes you a consultant, not a tool:
- Don't read GSC and GA4 separately. Read them together with the SITE PROFILE in mind.
- For a commercial site: "Your top GSC query is informational, your top GA4 landing page is the blog, bounce is 71%, no conversion events. Pattern: positioning problem — attracting research not buying intent."
- For a content site: "Your top 3 posts last refreshed 18 months ago, your new-query count this month is zero, branded share is 78%. Pattern: a loyal-but-shrinking audience — you stopped publishing, so you stopped reaching new readers."
- Look for the cross-source surprise.

SPECIFICITY MANDATE — every recommendation must be concrete:
- NEVER recommend an action you cannot tie to a SPECIFIC URL, keyword, or number from the snapshot.
- NEVER use vague phrases: "improve content quality", "build backlinks", "better keywords", "fix your meta", "update your titles", "do more SEO". They are banned.
- For commercial: "You have ZERO commercial-intent ranking pages — 92% of impressions are informational. Build /pricing, /vs/[competitor], /alternatives in that order."
- For content: "Refresh /blog/your-top-post — last updated 2024-01, lost 340 clicks vs prior period, was your #1 traffic page. Add a 2026 update section, 3 new H2s on related sub-topics."
- If you cannot be specific from the snapshot, CALL A TOOL until you can. NEVER hand-wave.

INSPECTION MANDATE — if the user references a specific URL, page path (anything starting with "/"), or names a specific keyword, you MUST inspect the artifact before recommending changes to it:
- URL / path referenced → call \`inspect_url\` AND/OR \`run_site_audit\` on that URL.
- Specific keyword referenced → call \`get_search_performance\` filtered to that query, then \`inspect_url\` on the page that ranks for it.
- Cannibalization mentioned → \`find_cannibalization\` first.
- "Why did X drop" / "what broke" → \`cross_source_diagnose\` first.
- These rules supersede "prefer fewer tools". The minimum tool count for a URL- or keyword-specific question is TWO.
- If the tool returns an error or empty data, REPORT THAT — do not fall back to generic advice.

REFUSAL PATTERN — when data is genuinely insufficient:
- If after inspecting you still cannot be specific, say so explicitly: "Data only shows X. To give a real diagnosis I need Y (connect GitHub / share the page URL / wait N days)."
- Honest gap-disclosure is preferable to fabricated specificity. The user trusts a "can't tell yet" answer; they distrust a generic-but-confident answer.
- Do not pad gaps with banned phrases from above.

AUDIENCE DISCIPLINE — you do NOT know who the user's customers are unless they've told you in this conversation:
- You can see: site URL, GSC queries the site ranks for, top pages, GA4/GSC metrics, optionally repo files. From these you can describe site STRUCTURE (commercial / content / portfolio / docs / mixed), NEVER audience.
- NEVER write "your target audience is [vertical]", "your ICP is [persona]", "[geography] customers / users", "small businesses / enterprises / consumers in [X]" — unless the [USER_FACTS] block in this turn's context explicitly states it.
- Specifically banned inventions: a vertical the user never named ("salons", "dentists", "SaaS founders", "restaurants", "agencies"); a geography the user never named ("US customers", "European market", "Indian users"); a customer profile the user never named ("solo founders", "VPs of marketing", "enterprise IT").
- When audience would meaningfully change the answer, ASK: "Who's the customer you're trying to reach? It changes the recommendation." Don't guess and proceed.
- This includes the words "your audience", "your users", "your customers" used to mean a specific group — only safe when you genuinely know who they are from facts the user shared.
- Site STRUCTURE flags (commercial/content/etc.) describe code paths, NOT people. Don't conflate them.

CONFIDENCE TRANSCRIPTION — never invent confidence; transcribe what the snapshot tells you:
- Each insight in the snapshot ships with a "confidence: high/medium/low" tag and a one-line reason.
- When confidence is medium or low, LEAD with that fact — don't bury it. Example: "I'm medium-confidence on this — only 17 days of data. The pattern looks real but watch the next 2 weeks before committing budget."
- High-confidence insights speak with full conviction. Don't hedge those.
- NEVER add your own "I think" or "probably" hedging when the snapshot says high. NEVER claim high confidence when the snapshot says low.
- Honest uncertainty is a feature, not a flaw. The user trusts you more when you say "I don't have enough data to be sure" than when you fake certainty.

SAME-QUESTION HANDLING — if the snapshot includes a [REPETITION_DETECTED] tag:
- Open the response with a short acknowledgment: "I covered the [prior topic] X minutes ago — picking a different angle now."
- Pick a DIFFERENT insight than last time. The snapshot's ranker has already demoted the prior one, so the top-ranked insight is genuinely fresh — trust it.
- If the user asked the same question intentionally, they want a NEW lens, not a repeat.

SUGGESTION DEDUP — if the snapshot includes [SURFACED_RECENTLY] suggestions_already_emitted:
- Your follow-up suggestions block (\`<!-- suggestions: [...] -->\`) MUST NOT include any of those phrases or near-paraphrases.
- Pick fresh angles the user hasn't seen yet.`;

const SHARED_RULES = `RULES:
1) Dashboard snapshot is injected on EVERY turn — use it first. Reach for tools whenever the snapshot doesn't have the specific URL / page / schema / commit you need to answer.
2) Plan tool use: for diagnostic questions, plan 2-4 tool calls. ALWAYS inspect the artifact (page HTML, code, schema) before recommending changes to it. Hard cap 8. The INSPECTION MANDATE above is non-negotiable.
3) Cite exact numbers. Never round to "about" — say "12,847 clicks (-23% WoW)".
4) Use the EXACT siteUrl from [AVAILABLE SITES] / [Site:].
5) GitHub tools: when [GitHub:connected] AND the question implies code/deploy/PR/issue, USE THEM. When [GitHub:not_connected] and a code-aware diagnosis would help, answer the data side, then end with EXACTLY one line: "For exact-commit / file attribution, connect GitHub." No pitch, no repeat — that single line is all the user needs.
6) [Repo: x · {confirmed|auto}] = the repo for the current site — pass repo=x to ALL GitHub tools. NEVER call list_user_repos. If status=auto, gently mention once: "I'm checking {repo} — confirm in the dropdown if that's right." If confirmed, use silently.
7) [FROM_SEO:<surface>] tag: when present, the user came from a specific SEO panel (cannibalization, decay, striking-distance, etc.). The surface tag tells you which tool MUST fire first — match these:
   - keyword_insight / page_insight → \`inspect_url\` on the relevant page first.
   - keyword_opportunity:cannibalization → \`find_cannibalization\` first.
   - keyword_opportunity:ctr_gap → \`inspect_url\` on the ranking page first (need its title + meta).
   - keyword_opportunity:striking → \`inspect_url\` + \`get_search_performance\` on the keyword.
   - page_opportunity → \`run_site_audit\` + \`inspect_url\`.
   - overview → \`compute_site_health_score\` or \`get_alerts\` first, then drill into the top finding.
   Do not skip these — the user clicked a button expecting that specific tool to run.

GENERATOR TOOLS (generate_content_strategy / generate_meta_tags / suggest_internal_links / analyze_keyword_clusters / find_cannibalization):
These return a STRUCTURED PAYLOAD with { task, expectedFormat, inputs }. Read the task, follow the expectedFormat, and use the inputs as your data. DO NOT echo "task" or "expectedFormat" back to the user — that's a planning artifact, not the answer.

INVALID-ARGS HANDLING: if a tool returns { error: 'invalid_args', message: ... }, fix the arg per the message and retry ONCE.

CTR BENCHMARKS: Pos1:28%|Pos2:16%|Pos3:11%|Pos4-5:7%|Pos6-7:4.5%|Pos8-10:2.5%. Below expected by 3%+=bad meta.
REVENUE: Transactional $2-5/click|Informational $0.10-0.50/click|Formula: impressions×CTR_gain×$/click

CHARTS (USE SPARINGLY — they were spammy before, now contextual):
Emit AT MOST ONE chart per response, and ONLY when ONE of these is true:
  (a) the user asks for "show", "visualize", "chart", "graph", "see"
  (b) it's the FIRST diagnostic turn of the conversation (user has not seen any chart yet)
  (c) you're presenting a comparison or distribution where text alone is materially worse
DO NOT repeat a chart tag that already appeared in the LAST 2 assistant turns of conversation history.
DO NOT add a chart for greetings ("hi", "thanks"), follow-ups ("explain more", "what about X"), or text-only opinions.
Default = NO chart. When in doubt, omit. The user has dashboards for visualization; the chat is for analysis.

When you DO use a chart:
  - Pick the SINGLE most-informative tag for THIS question (not a stack of 4).
  - Tags: overview|topKeywords|topPages|ctrOpportunities|strikingDistance|positionDistribution|trafficTrend|deviceSplit|countries
  - Format: <!-- chart:TAG_NAME --> on its OWN line at the TOP.
  - Inline (when answer is filtered to data NOT in dashboard snapshot):
    <!-- chart:inline:{"type":"keywords","title":"T","rows":[{"query":"...","clicks":N,"impressions":N,"ctr":N,"position":N}]} -->
  - Mapping: keywords→topKeywords, pages→topPages, CTR→ctrOpportunities, trends→trafficTrend, devices→deviceSplit, countries→countries, filtered subset→inline.

FOLLOW-UPS: End MOST responses with exactly 3 follow-up questions in the format below — but SKIP this for CASUAL_GREETING, EXECUTIVE_SUMMARY, and META_QUESTION intents (their persona prompts override this rule).
<!-- suggestions: ["Q1?", "Q2?", "Q3?"] -->`;

/** B3-full: persona-aware system-prompt composer. Replaces BASE_SYSTEM_INSTRUCTION. */
function composePromptForPersona(personaPrompt: string): string {
    return `${SHARED_PREAMBLE}\n\n${personaPrompt}\n\n${SHARED_RULES}`;
}

// Kept as a fallback when ai isn't initialized — intentionally minimal.
const BASE_SYSTEM_INSTRUCTION = `${SHARED_PREAMBLE}

INTENT MODES (pick ONE for each turn — first message of the turn, infer from the user's question):
• CASUAL_GREETING — "hi", "thanks", "ok", short pleasantries. RESPONSE: 1-3 conversational sentences. No tools. No charts. No 5-section template. Just acknowledge + offer one concrete next step ("Want a snapshot of where you stand?").
• DIAGNOSTIC — "why did X drop", "what broke", "investigate Y". RESPONSE: full structure: 🎯 VERDICT → 📊 EVIDENCE → 💰 REVENUE IMPACT → ⚡ ACTION → 🔮 BONUS. Use cross_source_diagnose first if a symptom + page is named.
• OPPORTUNITY — "what should I do", "find me wins", "growth opportunities". RESPONSE: ranked list, not a 5-section essay. Top 3-5 opportunities, each with one-line action + impact. Skip REVENUE IMPACT block when the answer is already opportunity-shaped.
• CONTENT_BRIEF / META — "write a brief", "generate meta tags", "blog ideas". RESPONSE: pure deliverable (the brief / the tags / the ideas). No VERDICT preamble. No follow-on commentary.
• EXECUTIVE_SUMMARY — "summarize", "top-line", "executive snapshot". RESPONSE: ≤120 words, single paragraph or 4-bullet TL;DR, no tables, no emojis, no sections.
• TECHNICAL_AUDIT — "audit my site", "is my SEO good", "fix issues". RESPONSE: ranked issue table with Fix column. Use run_site_audit. Skip REVENUE IMPACT.
• META_QUESTION — "what can you do", "which tools do you have", asks about the chat itself. RESPONSE: direct answer in plain prose. No template, no tools, no charts.

If the same conversation already established the intent, keep using the same mode unless the user pivots.

RULES:
1) Dashboard snapshot is injected on EVERY turn — use it first. Reach for tools whenever the snapshot doesn't have the specific URL / page / schema / commit you need to answer.
2) Plan tool use: for diagnostic questions, plan 2-4 tool calls. ALWAYS inspect the artifact (page HTML, code, schema) before recommending changes to it. Hard cap 8. The INSPECTION MANDATE above is non-negotiable.
3) Cite exact numbers. Never round to "about" — say "12,847 clicks (-23% WoW)".
4) Use the EXACT siteUrl from [AVAILABLE SITES] / [Site:].
5) GitHub tools: when [GitHub:connected] AND the question implies code/deploy/PR/issue, USE THEM. When [GitHub:not_connected] and a code-aware diagnosis would help, answer the data side, then end with EXACTLY one line: "For exact-commit / file attribution, connect GitHub." No pitch, no repeat — that single line is all the user needs.
6) [Repo: x · {confirmed|auto}] = the repo for the current site — pass repo=x to ALL GitHub tools. NEVER call list_user_repos. If status=auto, gently mention once: "I'm checking {repo} — confirm in the dropdown if that's right." If confirmed, use silently.
7) [FROM_SEO:<surface>] tag: when present, the user came from a specific SEO panel. Surface → mandatory first tool:
   - keyword_insight / page_insight → \`inspect_url\` first.
   - keyword_opportunity:cannibalization → \`find_cannibalization\` first.
   - keyword_opportunity:ctr_gap → \`inspect_url\` on the ranking page first.
   - keyword_opportunity:striking → \`inspect_url\` + \`get_search_performance\` on the keyword.
   - page_opportunity → \`run_site_audit\` + \`inspect_url\`.
   - overview → \`compute_site_health_score\` or \`get_alerts\` first.

TOOL-PICKING DECISION TABLE (use the FIRST match):
- Greeting / pleasantry / meta-question → NO TOOL.
- "What's wrong?" / "Anything broken?" / morning briefing → get_alerts (instant, no API).
- "Health score" / "is my site OK" / overall fitness → compute_site_health_score.
- "Why did traffic / ranking / CTR drop on /X?" / "What broke?" → cross_source_diagnose with symptom + pagePath. ONE call returns the verdict.
- "Is /X indexed?" / "Why isn't this in Google?" → inspect_url. (Cap: 3 per conversation.)
- HTML/on-page audit ("audit my homepage", "missing alt?") → run_site_audit.
- Core Web Vitals / "is my site slow" → run_page_audit (PageSpeed).
- Funnel / "where do users drop in checkout" / sequence-of-pages → run_funnel_analysis (provide stepPages array).
- Path / "where do users land/exit" / common journeys → run_journey_analysis.
- Retention / "are users sticking" / cohort question → run_cohort_retention.
- "Did PR #N break SEO?" / "review this PR" → analyze_pr_seo_diff.
- "Save this verdict" / "annotate this" / "remember the date" → write_dashboard_annotation (date = the EVENT date, not today).
- Specific date-range / device / country GSC breakdowns → get_search_performance.
- GA4 metric explorer (custom dims/metrics, ad-hoc reports) → run_ga4_report.

GENERATOR TOOLS (generate_content_strategy / generate_meta_tags / suggest_internal_links / analyze_keyword_clusters / find_cannibalization):
These return a STRUCTURED PAYLOAD with { task, expectedFormat, inputs }. Read the task, follow the expectedFormat, and use the inputs as your data. DO NOT echo "task" or "expectedFormat" back to the user — that's a planning artifact, not the answer.

INVALID-ARGS HANDLING: if a tool returns { error: 'invalid_args', message: ... }, fix the arg per the message and retry ONCE.

CTR BENCHMARKS: Pos1:28%|Pos2:16%|Pos3:11%|Pos4-5:7%|Pos6-7:4.5%|Pos8-10:2.5%. Below expected by 3%+=bad meta.
REVENUE: Transactional $2-5/click|Informational $0.10-0.50/click|Formula: impressions×CTR_gain×$/click

FORMAT (DIAGNOSTIC mode default — other INTENT MODES above override this):
Rich markdown. Flow: 🎯 VERDICT (##, 1-2 bold sentences) → 📊 EVIDENCE (table/bullets with numbers) → 💰 REVENUE IMPACT → ⚡ ACTION (numbered steps) → 🔮 BONUS.
Labels: 🔴 CRITICAL|🟡 HIGH|🟢 OPPORTUNITY|⚪ MONITOR. Use tables for 3+ rows. Code blocks for technical recs.
DO NOT use this 5-section template for CASUAL_GREETING, OPPORTUNITY, EXECUTIVE_SUMMARY, CONTENT_BRIEF, or META_QUESTION intents — they have their own response shapes.

CHARTS (USE SPARINGLY — they were spammy before, now contextual):
Emit AT MOST ONE chart per response, and ONLY when ONE of these is true:
  (a) the user asks for "show", "visualize", "chart", "graph", "see"
  (b) it's the FIRST diagnostic turn of the conversation (user has not seen any chart yet)
  (c) you're presenting a comparison or distribution where text alone is materially worse
DO NOT repeat a chart tag that already appeared in the LAST 2 assistant turns of conversation history.
DO NOT add a chart for greetings ("hi", "thanks"), follow-ups ("explain more", "what about X"), or text-only opinions.
Default = NO chart. When in doubt, omit. The user has dashboards for visualization; the chat is for analysis.

When you DO use a chart:
  - Pick the SINGLE most-informative tag for THIS question (not a stack of 4).
  - Tags: overview|topKeywords|topPages|ctrOpportunities|strikingDistance|positionDistribution|trafficTrend|deviceSplit|countries
  - Format: <!-- chart:TAG_NAME --> on its OWN line at the TOP.
  - Inline (when answer is filtered to data NOT in dashboard snapshot):
    <!-- chart:inline:{"type":"keywords","title":"T","rows":[{"query":"...","clicks":N,"impressions":N,"ctr":N,"position":N}]} -->
  - Mapping: keywords→topKeywords, pages→topPages, CTR→ctrOpportunities, trends→trafficTrend, devices→deviceSplit, countries→countries, filtered subset→inline.

FOLLOW-UPS (MANDATORY): End EVERY response with exactly 3 follow-up questions:
<!-- suggestions: ["Q1?", "Q2?", "Q3?"] -->
NEVER skip suggestions.`;

// ═══════════════════════════════════════════════════════════════
// DATA CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════
function buildDataContext(analyticsContext: any, seoContext: any): string {
    if (!analyticsContext && !seoContext) return '';
    let ctx = '';

    if (analyticsContext) {
        ctx += '\nGA4(28d): ';
        if (analyticsContext.kpis) {
            const k = analyticsContext.kpis;
            ctx += `${k.totalUsers}usr(${k.changeUsers > 0 ? '+' : ''}${k.changeUsers}%) ${k.totalPageViews}pv bounce:${k.avgBounceRate}% sess:${k.totalSessions}\n`;
        }
        if (analyticsContext.topSources?.length) {
            ctx += `Src: ${analyticsContext.topSources.slice(0, 6).map((s: any) => `${s.source}:${s.sessions}`).join(',')}\n`;
        }
        if (analyticsContext.topPages?.length) {
            ctx += `Pages: ${analyticsContext.topPages.slice(0, 8).map((p: any, i: number) => `${i + 1}.${p.page} ${p.views}v ${p.bounceRate}%b`).join(' | ')}\n`;
        }
        if (analyticsContext.devices?.length) {
            ctx += `Dev: ${analyticsContext.devices.map((d: any) => `${d.device}:${d.percentage}%`).join(',')}\n`;
        }
        if (analyticsContext.channels?.length) {
            ctx += `Ch: ${analyticsContext.channels.slice(0, 5).map((c: any) => `${c.name}:${c.value || c.percentage}`).join(',')}\n`;
        }
    }

    if (seoContext) {
        ctx += '\nGSC(28d): ';
        if (seoContext.kpis) {
            const k = seoContext.kpis;
            ctx += `${k.totalClicks}clk(${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}%) ${k.totalImpressions}imp CTR:${k.avgCTR}% pos:${k.avgPosition}\n`;
        }
        if (seoContext.topQueries?.length) {
            ctx += `Queries:\n`;
            seoContext.topQueries.slice(0, 12).forEach((q: any, i: number) => {
                const pos = parseFloat(q.position) || 50;
                const ctr = parseFloat(q.ctr) || 0;
                const impr = parseInt(q.impressions) || 0;
                const expCtr = pos <= 1 ? 28 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
                let flag = '';
                if (pos >= 4 && pos <= 20 && impr > 50) flag += '⚡';
                if (ctr < expCtr * 0.5 && impr > 50) flag += '⚠️';
                ctx += `${i + 1}."${q.query}" ${q.clicks}c/${impr}i ${ctr}%ctr p${pos.toFixed(0)} ${flag}\n`;
            });
        }
        if (seoContext.topPages?.length) {
            ctx += `Pages: ${seoContext.topPages.slice(0, 6).map((p: any) => `${p.page}(${p.clicks}c,p${p.position})`).join(' | ')}\n`;
        }
        if (seoContext.recommendations?.length) {
            ctx += `Recs: ${seoContext.recommendations.slice(0, 3).map((r: any) => `[${r.severity}]${r.title}`).join(' | ')}\n`;
        }
    }

    return ctx;
}

// ═══════════════════════════════════════════════════════════════
// CREDIT SYSTEM HELPERS
// ═══════════════════════════════════════════════════════════════
async function getUserCredits(userId: string): Promise<number | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/credits`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.credits ?? null;
    } catch { return null; }
}

async function deductCredits(userId: string): Promise<number | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/credits/deduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({ amount: 1 }),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.credits ?? null;
    } catch { return null; }
}

async function refundCredits(userId: string): Promise<number | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/credits/deduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({ amount: -1 }),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.credits ?? null;
    } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER — Uses official @google/genai SDK
// ═══════════════════════════════════════════════════════════════
function encodeSSE(data: any): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const body = await req.json();
        const { message, selectedSite, selectedRepo, repoIsAuto, analyticsContext, seoContext, history, mode, threadId, fromTag } = body;

        if (!message || typeof message !== 'string') {
            return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (message.length > MAX_INPUT_CHARS) {
            return new Response(
                JSON.stringify({
                    error: `Message is ${message.length} characters; the limit is ${MAX_INPUT_CHARS}. Trim your input or split it into multiple messages.`,
                    code: ERR_MESSAGE_TOO_LONG,
                    limit: MAX_INPUT_CHARS,
                    length: message.length,
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (history && (!Array.isArray(history) || history.length > 50)) {
            return new Response(JSON.stringify({ error: 'Invalid history' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;

        // ── Parallel pre-flight: credits + JWT token + DB tokens (Google + GitHub OAuth + GitHub App) ──
        const [creditResult, jwt, dbTokens, dbGithubToken, dbGithubAppToken] = await Promise.all([
            (ADMIN_API_KEY && userId) ? getUserCredits(String(userId)) : Promise.resolve(null),
            getToken({ req: req as any }),
            fetchGoogleTokensFromDb(String(userId)).catch(() => null),
            userId ? fetchGithubTokenFromDb(String(userId)).catch(() => null) : Promise.resolve(null),
            userId ? fetchGithubAppToken(String(userId)).catch(() => null) : Promise.resolve(null),
        ]);

        // Credit gate
        if (creditResult !== null && creditResult < 1) {
            return new Response(JSON.stringify({
                error: 'insufficient_credits',
                credits: creditResult,
                response: `⚡ You've used all your AI credits! You have **${creditResult}** credits remaining.\n\n**1 credit = 1 message.** Upgrade your plan to get more:\n- 🚀 [Starter — 50 credits/mo for $9](https://checkout.dodopayments.com/buy/pdt_0NaLMLyWwiO355QaGlQwq)\n- 🔥 [Growth — 150 credits/mo for $19](https://checkout.dodopayments.com/buy/pdt_0NaLMM1bLW9wAbmxcsebm)\n- 👑 [Pro — 300 credits/mo for $29](https://checkout.dodopayments.com/buy/pdt_0NaLMM4r23kncRahthuyj) (+ Telegram bot)`
            }), { status: 402, headers: { 'Content-Type': 'application/json' } });
        }

        if (!ai) {
            return new Response(JSON.stringify({
                response: generateFallbackResponse(message, analyticsContext, seoContext, false),
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // ── Build data context ──
        const dataContext = buildDataContext(analyticsContext, seoContext);

        // ── Build conversation history ──
        const contents: any[] = [];
        if (history?.length) {
            for (const msg of history) {
                if (!msg.content) continue;
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                });
            }
        }

        // ── Get User's Google Tokens (JWT first, DB fallback already fetched in parallel) ──
        let googleAccessToken = (jwt as any)?.googleAccessToken as string | undefined;
        let googleRefreshToken = (jwt as any)?.googleRefreshToken as string | undefined;

        if (!googleAccessToken && !googleRefreshToken && dbTokens) {
            googleAccessToken = dbTokens.accessToken;
            googleRefreshToken = dbTokens.refreshToken;
        }

        // ── Resolve User's GitHub Token. Phase 2 preference order:
        //   1. GitHub App installation token (selective per-repo, server-to-server, ~1h TTL)
        //   2. JWT-supplied OAuth user token (legacy)
        //   3. Admin DB OAuth token (legacy fallback)
        // Without checking the App installation source, users on the new flow appear
        // as [GitHub:not_connected] and the LLM refuses to engage GitHub tools.
        const githubAccessToken =
            dbGithubAppToken ||
            ((jwt as any)?.githubAccessToken as string | undefined) ||
            dbGithubToken ||
            undefined;
        const githubConnected = !!githubAccessToken;

        const ga4RequiredResponse = {
            error: 'ga4_required',
            response: 'AI Chat is unavailable because this account does not have any Google Analytics property connected yet. Connect a different Google account or create a GA4 property to continue.',
        };

        if (!googleAccessToken && !googleRefreshToken) {
            return new Response(JSON.stringify(ga4RequiredResponse), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let validGoogleToken = '';
        let cachedSites: any[] = [];
        let cachedGa4Properties: any[] = [];

        try {
            validGoogleToken = await getValidAccessToken(googleAccessToken, googleRefreshToken);
            const cacheKey = `sites:${userId}`;
            [cachedSites, cachedGa4Properties] = await Promise.all([
                getCachedOrFetch(`${cacheKey}:gsc`, () => listSearchConsoleSites(validGoogleToken).catch(() => [])),
                getCachedOrFetch(`${cacheKey}:ga4`, () => listAnalyticsProperties(validGoogleToken).catch(() => [])),
            ]);
        } catch {
            return new Response(JSON.stringify(ga4RequiredResponse), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!cachedGa4Properties.length) {
            return new Response(JSON.stringify(ga4RequiredResponse), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // A1: [SITES] / [GA4] tags injected on EVERY turn (was first-only).
        // The model frequently lost track of valid property URLs by turn 4 and
        // would call get_search_performance with the wrong format.
        let availableSitesContext = '';
        if (cachedSites.length > 0) {
            availableSitesContext = `\n[SITES: ${cachedSites.map((s: any) => s.siteUrl).join(', ')}]`;
        }
        if (cachedGa4Properties.length > 0) {
            availableSitesContext += `\n[GA4: ${cachedGa4Properties.map((p: any) => `${p.property}(${p.displayName || ''})`).join(', ')}]`;
        }

        // B2-thin: classify intent ONCE per turn (cheap pre-flight call).
        // Result is injected as [INTENT: <label>] so the model can pin its
        // response shape to the matching INTENT MODE in the system prompt.
        // We don't await this — kick it off and resolve it before the main
        // stream call below.
        const intentPromise = ai ? classifyIntent(ai, message).catch(() => null) : Promise.resolve(null);

        // B1-full: load durable facts + thread summary + semantic recall in
        // parallel with intent classification. All three are best-effort and
        // fall through to empty if admin or embeddings are unreachable.
        const memoryPromise: Promise<[Awaited<ReturnType<typeof loadUserFacts>>, string | null, RecalledHit[]]> = (userId && ai)
            ? Promise.all([
                  loadUserFacts(String(userId)).catch(() => [] as Awaited<ReturnType<typeof loadUserFacts>>),
                  loadThreadSummary(String(userId), threadId).catch(() => null),
                  recallSimilarTurns({ genai: ai, userId: String(userId), query: message, topK: 3 }).catch(() => [] as RecalledHit[]),
              ])
            : Promise.resolve([[] as Awaited<ReturnType<typeof loadUserFacts>>, null, [] as RecalledHit[]]);

        // Anti-repetition: load per-thread runtime state (surfaced insight IDs,
        // suggestion dedup list, prior question fingerprints) in parallel with
        // intent + memory. Best-effort — empty state on failure.
        const threadStatePromise: Promise<ChatThreadState> = (userId && threadId)
            ? loadThreadState(String(userId), threadId)
            : Promise.resolve({
                threadId: threadId || '',
                surfacedInsightIds: [],
                surfacedSuggestionQuestions: [],
                surfacedSurprises: [],
                lastQuestionFingerprints: [],
                lastUpdated: null,
            });

        // ── Enrichment pipeline: fetch winners-losers + cannibalization + mobile-gap +
        //    schema-audit + PSI + cohort/journey/events/geo/time + brand split +
        //    page-meta + ranked insights. Each source has its own cache key + TTL.
        //    The ranker reads thread-state's recentlySurfacedIds (when available) and
        //    demotes prior-turn insights so the next turn's #1 is genuinely fresh. ──
        // Auto-pick the first GA4 property when the client didn't send one. The new
        // GA4 sources (cohort/journey/events/...) are skipped silently if no propertyId.
        const ga4PropertyId = (cachedGa4Properties?.[0]?.property as string | undefined)
            || (cachedGa4Properties?.[0]?.propertyId as string | undefined);
        // Defer the enrichment loading SSE events to AFTER we open the stream
        // (otherwise they'd be lost). Capture them into a buffer here and flush
        // on stream open inside the ReadableStream below.
        const sourceLoadEvents: string[] = [];
        const enrichmentPromise: Promise<EnrichedSnapshot | null> = (selectedSite && validGoogleToken && userId && seoContext)
            ? threadStatePromise.then(state => buildEnrichedSnapshot({
                userId: String(userId),
                siteUrl: selectedSite,
                propertyId: ga4PropertyId,
                googleToken: validGoogleToken,
                seoContext,
                analyticsContext,
                recentlySurfacedIds: state.surfacedInsightIds,
                onSourceLoading: (source: string) => { sourceLoadEvents.push(source); },
            })).catch(() => null)
            : Promise.resolve(null);

        // User message with injected data context
        const siteTag = selectedSite ? `[Site: ${selectedSite}]` : '';
        const githubTag = `[GitHub:${githubConnected ? 'connected' : 'not_connected'}]`;
        const repoTag = (githubConnected && selectedRepo)
            ? `[Repo: ${selectedRepo} · ${repoIsAuto ? 'auto' : 'confirmed'}]`
            : '';
        const intentLabel = await intentPromise;
        const intentTag = intentLabel ? `[INTENT: ${intentLabel}]` : '';
        // [FROM_SEO:<surface>] tag — set by AskAi buttons on the SEO dashboard
        // panels. The SHARED_RULES tell the model which tool to fire first
        // depending on the surface. Whitelisted to the known seo:* prefix so
        // a malformed URL param can't inject arbitrary prompt content.
        const safeFromTag = (typeof fromTag === 'string' && /^seo:[a-z_]+(:[a-z_]+)?$/.test(fromTag))
            ? `[FROM_SEO:${fromTag.slice(4)}]`
            : '';
        const [userFacts, threadSummary, recalledHits] = await memoryPromise;
        const threadState = await threadStatePromise;
        // B1-full: persistent memory injection. Goes BEFORE the dashboard data
        // so the model reads "what we know about you" first, then "what's
        // happening right now."
        const memoryBlock = formatMemoryBlock(userFacts, threadSummary, recalledHits);
        // B3-full: resolve persona for this intent (falls back to DIAGNOSTIC if unknown).
        // Note: COACHING is auto-selected below for infant sites, overriding the LLM's intent pick.
        let persona = resolvePersona(intentLabel);

        // ── Anti-repetition: compute fingerprint vs prior turns. Triple-AND gate
        //    (cosine ≥ 0.85 AND jaccard ≥ 0.7 AND temporal anchor match AND <24h).
        //    When tripped, inject [REPETITION_DETECTED] tag so the persona prompt
        //    forces an acknowledgment + different angle. The deterministic ranker
        //    in insightEngine ALSO demotes prior insight IDs as a separate guard. ──
        const currentFingerprint = makeFingerprint(message);
        const cosineSimByIndex = recalledHits.map((h: any) => h?.score || 0);
        const repetitionMatch = threadState.lastQuestionFingerprints.length > 0
            ? findRepetitionMatch(currentFingerprint, threadState.lastQuestionFingerprints, cosineSimByIndex)
            : null;
        let repetitionTag = '';
        if (repetitionMatch) {
            repetitionTag = `\n${formatRepetitionTag(repetitionMatch)}\n`;
            logChatTelemetry({
                event: 'repetition_detected',
                userId,
                threadId,
                payload: {
                    priorInsightId: repetitionMatch.prior.insightId,
                    priorAgeMs: Date.now() - repetitionMatch.prior.ts,
                    cosineSim: repetitionMatch.comparison.cosineSim,
                    jaccardSim: repetitionMatch.comparison.jaccardSim,
                },
            });
        }

        // ── Surfaced-recently block (insight IDs already shown, suggestions to avoid) ──
        const surfacedRecentlyBlock = formatThreadStateForPrompt(threadState);

        // Resolve enrichment (best-effort) and prefer the rich block; fall back to
        // the legacy compact context if enrichment failed/unavailable.
        let enrichedSnapshot: EnrichedSnapshot | null = null;
        try {
            enrichedSnapshot = await enrichmentPromise;
        } catch (err) {
            console.error('[ai-chat] enrichment failed:', err instanceof Error ? err.message : err);
            enrichedSnapshot = null;
        }

        // ── Edge-case persona overrides + telemetry ──
        // Infant site (< 100 imp/mo OR < 5 distinct queries): server-side override to
        // COACHING regardless of intent classifier — there's not enough data for
        // analysis, the right move is a setup checklist.
        if (enrichedSnapshot?.siteProfile?.infantSite) {
            persona = resolvePersona('COACHING');
            logChatTelemetry({
                event: 'edge_case_triggered',
                userId, threadId,
                payload: { kind: 'new_site', totalImpressions: enrichedSnapshot.siteProfile.signals.totalImpressions, distinctQueries: enrichedSnapshot.siteProfile.signals.distinctQueries },
            });
        }
        // Telemetry for other edge cases (no persona override; just observability).
        if (enrichedSnapshot?.siteProfile?.partialConnection === 'gsc_only') {
            logChatTelemetry({ event: 'edge_case_triggered', userId, threadId, payload: { kind: 'partial_connection_gsc_only' } });
        } else if (enrichedSnapshot?.siteProfile?.partialConnection === 'ga4_only') {
            logChatTelemetry({ event: 'edge_case_triggered', userId, threadId, payload: { kind: 'partial_connection_ga4_only' } });
        }
        if (enrichedSnapshot?.siteProfile?.monolingualNonEnglish) {
            logChatTelemetry({
                event: 'edge_case_triggered',
                userId, threadId,
                payload: { kind: 'multilingual', detected: enrichedSnapshot.siteProfile.monolingualNonEnglish.detected },
            });
        }
        if (cachedSites.length > 1) {
            logChatTelemetry({ event: 'edge_case_triggered', userId, threadId, payload: { kind: 'multi_site_user', siteCount: cachedSites.length } });
        }

        // ── Deploy correlation (conditional). Only fires for DIAGNOSTIC intent OR
        //    when the user message contains regression keywords (drop/regress/broke).
        //    Uses snapshot.winnersLosers as the input. Adds deploy_traffic_correlation
        //    insights to the snapshot via the deterministic ranker. ──
        if (enrichedSnapshot && selectedSite && userId && shouldRunDeployCorrelation(intentLabel, message)) {
            try {
                // Approximate the period boundary as 28 days ago (start of current period).
                const periodStart = new Date(Date.now() - 28 * 86400_000);
                const losers = enrichedSnapshot.winnersLosers?.losers || [];
                if (losers.length > 0) {
                    const dc = await correlateDeploysWithLosers({
                        userId: String(userId),
                        siteUrl: selectedSite,
                        githubToken: githubAccessToken,
                        losers,
                        periodStartDate: periodStart,
                    });
                    if (dc.hasCorrelation) {
                        enrichedSnapshot = injectDeployCorrelation(enrichedSnapshot, dc);
                        logChatTelemetry({
                            event: 'surprise_surfaced',
                            userId, threadId,
                            payload: { kind: 'deploy_traffic_correlation', matchCount: dc.matches.length, repo: dc.repo },
                        });
                    }
                }
            } catch { /* fail open — correlation is best-effort */ }
        }
        const richDataContext = enrichedSnapshot
            ? `\n${buildRichChatContext(enrichedSnapshot, { siteUrl: selectedSite })}\n`
            : null;
        const effectiveDataContext = richDataContext || dataContext;
        const surfacedBlock = surfacedRecentlyBlock ? `\n${surfacedRecentlyBlock}\n` : '';
        // Wrap rich-context build in try/catch so a single bad field rendering can
        // never take down the entire chat — fall back to legacy buildDataContext.
        let safeRichContext = effectiveDataContext;
        if (enrichedSnapshot && richDataContext) {
            try {
                // Re-build defensively (richDataContext was built above; this is a guard
                // for any sub-block throwing on null/undefined fields we missed).
                safeRichContext = `\n${buildRichChatContext(enrichedSnapshot, { siteUrl: selectedSite })}\n`;
            } catch (err) {
                console.error('[ai-chat] buildRichChatContext failed; falling back to legacy data block:', err instanceof Error ? err.message : err);
                safeRichContext = dataContext;
            }
        }
        const contextBlock = safeRichContext
            ? `${siteTag}${githubTag}${repoTag}${safeFromTag}${intentTag}${memoryBlock}${repetitionTag}${surfacedBlock}${safeRichContext}${availableSitesContext}\n---\n${message}`
            : `${siteTag}${githubTag}${repoTag}${safeFromTag}${intentTag}${memoryBlock}${repetitionTag}${surfacedBlock}${availableSitesContext}\n${message}`;
        contents.push({
            role: 'user',
            parts: [{ text: contextBlock }],
        });

        // ── Build system instruction once (B3-full: persona-composed) ──
        const today = new Date().toISOString().split('T')[0];
        const composedPrompt = composePromptForPersona(persona.systemPrompt);
        const systemInstruction = `${composedPrompt}

CRITICAL SYSTEM CONTEXT:
- TODAY'S DATE IS: ${today}.
- ALWAYS use this exact date as your anchor for "today", "last month", "last 90 days", etc.
- IMPORTANT: Google Search Console ONLY stores data for the last 16 months. NEVER query data older than 16 months from today, or the API will return 0 rows and you will incorrectly assume the site is dead.`;

        // ── Briefing mode: enhance system instruction for daily briefings ──
        const finalSystemInstruction = mode === 'briefing'
            ? systemInstruction + `\n\nBRIEFING MODE ACTIVE: Generate a concise morning briefing. Structure:\n1. **☀️ Overnight Snapshot** — Key KPI changes (use WoW % changes from dashboard data). Highlight anything unusual.\n2. **🚨 Alerts** — Flag anomalies: traffic drops >10%, CTR problems, ranking losses, striking distance opportunities.\n3. **🎯 #1 Priority Today** — The single most impactful action. Be specific (e.g., "Optimize title tag for [query] — position 8 with 2% CTR, expected 5%+").\nKeep it under 250 words. No filler. Start with "☀️ Good morning! Here's your daily briefing:"`
            : systemInstruction;

        // ── Deduct credit BEFORE streaming to prevent race conditions ──
        let creditBalance: number | null = null;
        if (ADMIN_API_KEY && userId) {
            creditBalance = await deductCredits(String(userId));
        }

        // ── Track client disconnection via abort signal ──
        const abortSignal = req.signal;

        // ── Execute Gemini Stream via official SDK ──
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Signal client immediately that we're alive
                    controller.enqueue(encodeSSE({ type: 'status', message: 'Processing...' }));

                    // Flush any per-source loading events captured during enrichment
                    // (which started BEFORE the stream opened, so its onSourceLoading
                    // callbacks pushed into a buffer). These let the UI render
                    // per-source ghost chips ("Loading schema audit...") instead of
                    // a generic spinner.
                    for (const src of sourceLoadEvents) {
                        controller.enqueue(encodeSSE({ type: 'source_loading', source: src }));
                    }

                    // Repetition detection: if a near-duplicate question was found earlier
                    // in this thread, surface that to the client so the UI can render the
                    // "You asked this Nm ago — fresh angle below" badge.
                    if (repetitionMatch) {
                        const priorAgeMin = Math.max(1, Math.round((Date.now() - repetitionMatch.prior.ts) / 60000));
                        controller.enqueue(encodeSSE({
                            type: 'repetition_detected',
                            priorAgeMin,
                            priorInsightId: repetitionMatch.prior.insightId,
                            jaccardSim: repetitionMatch.comparison.jaccardSim,
                        }));
                    }

                    // Send credit update immediately
                    if (creditBalance !== null) {
                        controller.enqueue(encodeSSE({ type: 'credits', value: creditBalance }));
                    }
                    // B2-thin: surface classified intent so the client can show
                    // a per-intent badge / tune its UI (e.g. hide chart panel for
                    // CASUAL_GREETING intents).
                    if (intentLabel) {
                        controller.enqueue(encodeSSE({ type: 'intent', value: intentLabel }));
                    }

                    // B2-full: planner pre-pass for personas that need it.
                    // Streams the plan to the user so they see what's coming.
                    if (ai && persona.plannerEnabled) {
                        // Emit a 'planning' marker so the UI can show "Planning…"
                        // for the ~2s the Pro model takes — otherwise the user sees
                        // dead air between send-click and first token.
                        controller.enqueue(encodeSSE({ type: 'planning' }));
                        try {
                            const allowed = persona.allowedTools
                                ? Array.from(persona.allowedTools)
                                : (AI_CHAT_TOOL_DECLARATIONS as any[]).map(t => t.name);
                            const plan = await runPlanner({
                                genai: ai,
                                intent: persona.label,
                                userMessage: message,
                                availableTools: allowed,
                                contextTags: `${siteTag}${githubTag}${repoTag}`,
                            });
                            if (plan) {
                                controller.enqueue(encodeSSE({ type: 'plan_proposed', plan }));
                            } else {
                                // Planner failed silently — clear the indicator.
                                controller.enqueue(encodeSSE({ type: 'planning_done' }));
                            }
                        } catch {
                            controller.enqueue(encodeSSE({ type: 'planning_done' }));
                        }
                    }

                    let currentContents = [...contents];
                    let keepGoing = true;
                    let loopCount = 0;
                    let gscCallCount = 0;
                    let githubCallCount = 0;
                    let inspectCallCount = 0; // A9: cap inspect_url at 3/conversation (GSC quota friendliness)
                    // Track whether ANY text was streamed across the entire turn.
                    // If we exit the tool loop without a single text chunk (the "ran 8
                    // tools but never wrote the answer" failure mode), we force a final
                    // tool-less pass below to make the model summarize.
                    let anyTextStreamedThisTurn = false;
                    const MAX_GSC_CALLS = 8;
                    const MAX_GITHUB_CALLS = 5;
                    const MAX_INSPECT_CALLS = 3;
                    const MAX_LOOPS = 8;
                    // B7-min: per-turn wall-clock cost cap. The maxDuration export is 300s
                    // but a runaway tool loop shouldn't burn that. 90s is enough for the
                    // longest legitimate flow (PageSpeed audit + cross-source diagnose +
                    // a final summarization pass) while still aborting genuine runaways.
                    const TURN_DEADLINE_MS = 90_000;
                    const turnStartedAt = Date.now();
                    const GITHUB_TOOL_NAMES = new Set([
                        'list_user_repos', 'get_repo_health', 'search_repo_code',
                        'get_recent_commits', 'get_pull_requests', 'get_repo_issues',
                        'get_workflow_runs', 'get_file_contents',
                    ]);

                    while (keepGoing && loopCount < MAX_LOOPS) {
                        // Check if client disconnected
                        if (abortSignal.aborted) {
                            controller.close();
                            return;
                        }
                        // B7-min: per-turn wall-clock cap — bail with a clean message
                        // if the loop has been running too long, before starting yet
                        // another model call. Refunds the credit on the way out via
                        // the existing error-path handler.
                        if (Date.now() - turnStartedAt > TURN_DEADLINE_MS) {
                            controller.enqueue(encodeSSE({
                                type: 'text',
                                content: '\n\n⚠️ Hit the per-turn time budget — stopping here. Try a more specific question.',
                            }));
                            break;
                        }
                        loopCount++;
                        keepGoing = false;

                        // Try models in order, fall back on 429/503/timeout
                        let response: any = null;
                        let lastError: any = null;
                        // A7: dynamic temperature — bolder verdicts when no tool results
                        // are pending (the "be bold" prompt), tighter when summarizing data
                        // (precision over voice). loopCount===1 means initial pass; later loops
                        // are tool-result summarization.
                        const isToolResponsePass = loopCount > 1;
                        const dynamicTemperature = isToolResponsePass ? 0.3 : 0.85;
                        for (const { model, timeout: modelTimeout } of CHAT_MODELS) {
                            try {
                                response = await ai.models.generateContentStream({
                                    model,
                                    contents: currentContents,
                                    config: {
                                        systemInstruction: finalSystemInstruction,
                                        tools: [{ functionDeclarations: AI_CHAT_TOOL_DECLARATIONS as any }],
                                        temperature: dynamicTemperature,
                                        maxOutputTokens: 3072, // A7: bumped from 2048 — long tables + 3 follow-ups were getting cut
                                        httpOptions: { timeout: modelTimeout },
                                    },
                                });
                                break; // success
                            } catch (modelErr: any) {
                                lastError = modelErr;
                                if (isRetryableError(modelErr)) {
                                    if (process.env.NODE_ENV === 'development') {
                                        console.warn(`[AI-CHAT] ${model} unavailable (${modelErr?.message?.slice(0, 80)}), trying next fallback...`);
                                    }
                                    continue;
                                }
                                throw modelErr; // non-retryable error, propagate
                            }
                        }
                        if (!response) throw lastError;

                        let fullText = '';
                        let pendingFunctionCalls: any[] = [];

                        // Stream chunks from the SDK
                        for await (const chunk of response) {
                            // Bail if client disconnected
                            if (abortSignal.aborted) {
                                controller.close();
                                return;
                            }
                            // A6: always stream text as 'text'. Previous attempt to split
                            // on the tool-call boundary (thinking_block before tools, text
                            // after) had a fatal flaw: for personas with no tools (e.g.
                            // CASUAL_GREETING for "hi"), the entire response was routed to
                            // thinking_block and ended up hidden in a collapsed panel.
                            // The "live thinking" UX now comes from ReasoningTrace's
                            // narration of planner + tool events, not from gating the
                            // text stream itself — much cleaner separation.
                            if (chunk.text) {
                                fullText += chunk.text;
                                anyTextStreamedThisTurn = true;
                                controller.enqueue(encodeSSE({ type: 'text', content: chunk.text }));
                            }

                            // Collect function call parts from raw candidates
                            // (preserves thoughtSignature required by Gemini 3+ models)
                            const rawParts = chunk.candidates?.[0]?.content?.parts;
                            if (rawParts) {
                                for (const part of rawParts) {
                                    if (!part.functionCall) continue;
                                    const fc = part.functionCall;
                                    const toolName = fc.name;

                                    // Hard limit: max 2 GSC calls
                                    if (toolName === 'get_search_performance' && gscCallCount >= MAX_GSC_CALLS) {
                                        continue;
                                    }

                                    // Hard limit: max 5 GitHub calls per conversation (token budget)
                                    if (GITHUB_TOOL_NAMES.has(toolName) && githubCallCount >= MAX_GITHUB_CALLS) {
                                        continue;
                                    }

                                    // A9: cap inspect_url to protect GSC URL Inspection daily quota
                                    if (toolName === 'inspect_url' && inspectCallCount >= MAX_INSPECT_CALLS) {
                                        continue;
                                    }

                                    // Dedupe
                                    const isDup = pendingFunctionCalls.some(
                                        (p: any) => p.functionCall.name === toolName && JSON.stringify(p.functionCall.args) === JSON.stringify(fc.args)
                                    );

                                    if (!isDup) {
                                        if (toolName === 'get_search_performance') gscCallCount++;
                                        if (GITHUB_TOOL_NAMES.has(toolName)) githubCallCount++;
                                        if (toolName === 'inspect_url') inspectCallCount++;
                                        pendingFunctionCalls.push(part);
                                        controller.enqueue(encodeSSE({
                                            type: 'tool_start',
                                            name: toolName,
                                            args: fc.args,
                                        }));
                                    }
                                }
                            }
                        }

                        // Handle tool execution
                        if (pendingFunctionCalls.length > 0) {
                            // Add model response to conversation history
                            // Raw parts preserve thoughtSignature required by Gemini 3+
                            const modelParts: any[] = [];
                            if (fullText) modelParts.push({ text: fullText });
                            modelParts.push(...pendingFunctionCalls);
                            currentContents.push({ role: 'model', parts: modelParts });

                            // Execute tools in parallel
                            const toolResults = await Promise.all(pendingFunctionCalls.map(async (part: any) => {
                                const fcName = part.functionCall.name;
                                const fcArgs = part.functionCall.args || {};
                                try {
                                    const toolStartedAt = Date.now();
                                    // A6: heartbeat for slow tools so users see progress instead of dead air
                                    const SLOW_TOOLS = new Set([
                                        'run_page_audit', 'run_site_audit', 'inspect_url', 'cross_source_diagnose',
                                        'run_funnel_analysis', 'run_journey_analysis', 'run_cohort_retention',
                                        'analyze_pr_seo_diff', 'compute_site_health_score',
                                    ]);
                                    let progressTimer: ReturnType<typeof setInterval> | null = null;
                                    let slowWarningEmitted = false;
                                    if (SLOW_TOOLS.has(fcName)) {
                                        progressTimer = setInterval(() => {
                                            const elapsed = Math.round((Date.now() - toolStartedAt) / 1000);
                                            try {
                                                controller.enqueue(encodeSSE({ type: 'tool_progress', name: fcName, elapsedSec: elapsed }));
                                                // Tell the user we're about to give up so the abort at the
                                                // 90s deadline isn't a surprise.
                                                if (!slowWarningEmitted && elapsed >= 75) {
                                                    slowWarningEmitted = true;
                                                    controller.enqueue(encodeSSE({
                                                        type: 'tool_progress',
                                                        name: fcName,
                                                        elapsedSec: elapsed,
                                                        warning: 'Stopping soon — this tool is unusually slow.',
                                                    }));
                                                }
                                            } catch { /* controller may be closed */ }
                                        }, 2500);
                                    }

                                    const toolResult = await executeAiChatTool(fcName, fcArgs, {
                                        googleAccessToken,
                                        googleRefreshToken,
                                        githubAccessToken,
                                        userId: userId ? String(userId) : undefined,
                                        // A2 / A10: pass dashboard snapshots so get_alerts and
                                        // cross_source_diagnose can compute deterministically
                                        // without re-querying APIs.
                                        seoContext,
                                        analyticsContext,
                                        // find_top_money_move serves directly from the enriched snapshot
                                        // (winners/losers, cannibalization, mobile-gap, page-meta, ranked
                                        // insights). enrichedSnapshot is null when no siteUrl is selected.
                                        enrichedSnapshot,
                                    });

                                    if (progressTimer) clearInterval(progressTimer);

                                    controller.enqueue(encodeSSE({
                                        type: 'tool_result',
                                        name: fcName,
                                        result: toolResult.result,
                                        structuredData: (toolResult as any).structuredData,
                                        error: toolResult.error,
                                    }));

                                    return {
                                        functionResponse: {
                                            name: fcName,
                                            response: { result: toolResult },
                                        }
                                    };
                                } catch {
                                    return {
                                        functionResponse: {
                                            name: fcName,
                                            response: { result: { error: "Execution failed" } },
                                        }
                                    };
                                }
                            }));

                            // Add function responses — SDK uses role "user" for function responses
                            currentContents.push({
                                role: 'user',
                                parts: toolResults,
                            });

                            keepGoing = true;
                            if (loopCount >= MAX_LOOPS) {
                                keepGoing = false;
                            }
                        }
                    }

                    // RESCUE PASS — if the tool loop exited without ever streaming text,
                    // the model burned its iterations on tool calls but never wrote the
                    // answer. Force one final NO-tools pass so the user sees a verdict
                    // instead of just a stack of tool icons.
                    if (ai && !anyTextStreamedThisTurn && !abortSignal.aborted) {
                        try {
                            // Inject a system-style nudge as the last user turn telling
                            // the model: tools are done, write the answer NOW.
                            const rescueContents = [
                                ...currentContents,
                                {
                                    role: 'user',
                                    parts: [{
                                        text: 'You have gathered enough data. Write the FINAL answer NOW based on the tool results above. NO more tool calls. Follow your persona\'s response shape. Cite specific numbers from the tool results.',
                                    }],
                                },
                            ];
                            const rescue = await ai.models.generateContentStream({
                                model: 'gemini-3-flash-preview',
                                contents: rescueContents,
                                config: {
                                    systemInstruction: finalSystemInstruction,
                                    // CRITICAL: no tools — force the model to write text.
                                    temperature: 0.4,
                                    maxOutputTokens: 3072,
                                    httpOptions: { timeout: 25000 },
                                },
                            });
                            let rescueText = '';
                            for await (const chunk of rescue) {
                                if (abortSignal.aborted) break;
                                if (chunk.text) {
                                    anyTextStreamedThisTurn = true;
                                    controller.enqueue(encodeSSE({ type: 'text', content: chunk.text }));
                                    rescueText += chunk.text;
                                }
                            }
                            if (rescueText) {
                                // Stitch rescue text into history so the critic + memory
                                // writes downstream see it as the assistant's turn.
                                currentContents.push({
                                    role: 'model',
                                    parts: [{ text: rescueText }],
                                });
                            }
                        } catch (rescueErr: any) {
                            if (process.env.NODE_ENV === 'development') {
                                console.warn('[AI-CHAT] rescue pass failed:', rescueErr?.message?.slice(0, 100));
                            }
                        }
                    }
                    // If even the rescue produced no text, surface a graceful note
                    // so the user isn't staring at tool icons with no answer.
                    if (!anyTextStreamedThisTurn) {
                        controller.enqueue(encodeSSE({
                            type: 'text',
                            content: 'I gathered the data but ran out of room to write the final analysis. Try asking a more specific question or "summarize the findings".',
                        }));
                    }

                    // Reconstruct assistant text once — used by critic (pre-DONE) +
                    // memory writes (post-DONE) below.
                    const lastModel = [...currentContents].reverse().find((c: any) => c?.role === 'model');
                    const assistantText: string = lastModel?.parts
                        ?.map((p: any) => p?.text || '')
                        ?.filter(Boolean)
                        ?.join('\n')
                        ?.slice(0, 4000) || '';

                    // B2-full: critic pass BEFORE [DONE] so the verdict event
                    // arrives at the client. Adds ~600ms to first-tweak latency.
                    // Critic is OFF by default — only runs for personas where
                    // format compliance materially matters (DIAGNOSTIC, EXECUTIVE).
                    if (ai && persona.criticEnabled && assistantText && assistantText.length >= 60) {
                        try {
                            const verdict = await runCritic({
                                genai: ai,
                                intent: persona.label,
                                userMessage: message,
                                assistantMessage: assistantText,
                                formatExpectation: persona.systemPrompt.slice(0, 1500),
                            });
                            if (verdict) {
                                controller.enqueue(encodeSSE({
                                    type: 'critic_verdict',
                                    score: verdict.score,
                                    groundedness: verdict.groundedness,
                                    completeness: verdict.completeness,
                                    format: verdict.format,
                                    specificity: verdict.specificity,
                                    notes: verdict.notes,
                                }));
                            }
                        } catch { /* critic failure is non-fatal */ }
                    }

                    // ── Anti-repetition: persist surfaced insight IDs + new fingerprint
                    //    SYNCHRONOUSLY before [DONE]. This is critical: a fast follow-up
                    //    turn that arrives before the post-DONE writes complete still
                    //    needs to see this turn's surfaced state. ~30ms cost is acceptable.
                    if (userId && threadId) {
                        const topInsightId = enrichedSnapshot?.insights?.[0]?.id || null;
                        const surfacedThisTurn = (enrichedSnapshot?.insights || [])
                            .slice(0, 5)
                            .map((i: any) => i.id)
                            .filter(Boolean);
                        const surprisesThisTurn = (enrichedSnapshot?.insights || [])
                            .filter((i: any) => i.category === 'cross_source_surprise')
                            .map((i: any) => i.id)
                            .filter(Boolean);
                        // Parse follow-up suggestions out of the assistant text so we can dedupe later turns.
                        const suggestionMatch = assistantText.match(/<!--\s*suggestions:\s*(\[[^\]]+\])\s*-->/i);
                        let suggestionsThisTurn: string[] = [];
                        if (suggestionMatch) {
                            try {
                                const arr = JSON.parse(suggestionMatch[1]);
                                if (Array.isArray(arr)) suggestionsThisTurn = arr.filter((s: any) => typeof s === 'string').slice(0, 3);
                            } catch { /* ignore parse failure */ }
                        }
                        const fpToStore = { ...currentFingerprint, insightId: topInsightId };
                        try {
                            await saveThreadState({
                                userId: String(userId),
                                threadId,
                                addSurfacedInsightIds: surfacedThisTurn,
                                addSurfacedSuggestions: suggestionsThisTurn,
                                addSurfacedSurprises: surprisesThisTurn,
                                addQuestionFingerprint: fpToStore,
                                prior: threadState,
                            });
                        } catch { /* swallow — best-effort */ }
                    }

                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();

                    // B1-full: background memory writes. Run AFTER closing the stream
                    // so they don't add to user-visible latency. Both calls are
                    // wrapped in try/catch internally — failure is silent.
                    if (ai && userId && intentLabel !== 'CASUAL_GREETING' && intentLabel !== 'META_QUESTION') {

                        if (assistantText && message) {
                            void extractFactsFromTurn({
                                genai: ai,
                                userId: String(userId),
                                userMessage: message,
                                assistantMessage: assistantText,
                                threadId,
                            }).catch(() => 0);
                        }

                        // B1-full: embed the (user → assistant) turn so future
                        // questions can recall it via cosine similarity. Best-effort
                        // and non-blocking. Only embed turns with substantive
                        // content — skip CASUAL_GREETING (already excluded above)
                        // and very short answers (<60 chars — usually error fallbacks).
                        if (assistantText && assistantText.length >= 60 && threadId) {
                            void embedTurn({
                                genai: ai,
                                userId: String(userId),
                                threadId,
                                sourceId: `${threadId}:${Date.now()}`,
                                userMessage: message,
                                assistantMessage: assistantText,
                            }).catch(() => false);
                        }

                        // Run the summarizer every 6th assistant turn (history length is
                        // user+assistant pairs, so trigger when (history.length+1) is a
                        // multiple of 12 — i.e. 6 full Q&A rounds).
                        if (threadId && history && Array.isArray(history) && (history.length + 2) >= 12 && (history.length + 2) % 12 === 0) {
                            const allMsgs = [
                                ...history.map((h: any) => ({ role: h.role, content: h.content || '' })),
                                { role: 'user' as const, content: message },
                                { role: 'assistant' as const, content: assistantText },
                            ];
                            void summarizeThread({
                                genai: ai,
                                userId: String(userId),
                                threadId,
                                messages: allMsgs.filter(m => m.content),
                                previousSummary: threadSummary,
                                upToMessageIndex: allMsgs.length,
                            }).catch(() => false);
                        }

                        // (Critic moved up — runs BEFORE [DONE] so the verdict
                        // event reaches the client. This block was a duplicate.)
                    }
                } catch (error: any) {
                    try {
                        if (process.env.NODE_ENV === 'development') {
                            console.error('[AI-CHAT] Stream error:', error?.message || error, error?.name);
                        }
                        // Refund the credit since the request failed
                        if (ADMIN_API_KEY && userId) {
                            const refunded = await refundCredits(String(userId));
                            if (refunded !== null) {
                                controller.enqueue(encodeSSE({ type: 'credits', value: refunded }));
                            }
                        }
                        // Extract a clean error message instead of raw JSON
                        let errMsg = 'Something went wrong. Your credit has been refunded. Please try again.';
                        const rawMsg = error?.message || '';
                        if (rawMsg.includes('thought_signature')) {
                            errMsg = 'AI service configuration error. Your credit has been refunded. Please try again or clear the chat.';
                        } else if (rawMsg.includes('RATE_LIMIT') || rawMsg.includes('429')) {
                            errMsg = 'AI service is busy. Your credit has been refunded. Please wait a moment and try again.';
                        } else if (rawMsg.includes('timeout') || rawMsg.includes('DEADLINE_EXCEEDED') || rawMsg.includes('aborted') || error?.name === 'AbortError') {
                            errMsg = 'Request timed out. Your credit has been refunded. Try a simpler question or try again.';
                        } else if (rawMsg.includes('INVALID_ARGUMENT') || rawMsg.includes('400')) {
                            errMsg = 'Invalid request. Your credit has been refunded. Please clear the chat and try again.';
                        }
                        controller.enqueue(encodeSSE({ type: 'error', message: errMsg }));
                        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                        controller.close();
                    } catch { /* close errors */ }
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (err) {
        // Log the actual error so production failures are diagnosable.
        // Previously this caught silently and returned a generic message, making
        // every server-side throw indistinguishable from "Failed to process request".
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        console.error('[ai-chat] Top-level error:', errMsg, errStack ? `\nStack: ${errStack}` : '');
        return new Response(JSON.stringify({
            error: 'Failed to process request',
            // Surface the message in non-prod for debugging without leaking stacks.
            ...(process.env.NODE_ENV !== 'production' ? { detail: errMsg } : {}),
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// Fallback responses when Gemini API key is not configured
function generateFallbackResponse(message: string, analytics: any, seo: any, hasKey = false): string {
    const msg = message.toLowerCase();

    if (msg.includes('bounce') && analytics?.kpis) {
        const pages = analytics.topPages?.filter((p: any) => p.bounceRate > 40) || [];
        return `Based on your data, your average bounce rate is ${analytics.kpis.avgBounceRate}%.\n\n${pages.length > 0
            ? `Pages with high bounce rates:\n${pages.map((p: any) => `- ${p.page}: ${p.bounceRate}%`).join('\n')}\n\nRecommendations:\n- Improve page load speed\n- Make content more engaging above the fold\n- Add clear CTAs\n- Ensure mobile responsiveness`
            : 'Your pages seem to have reasonable bounce rates. Keep monitoring and A/B testing to improve further.'
            }`;
    }

    if (msg.includes('traffic') || msg.includes('source')) {
        if (analytics?.topSources?.length) {
            return `Your top traffic sources:\n${analytics.topSources.map((s: any, i: number) => `${i + 1}. ${s.source} — ${s.sessions} sessions (${s.percentage}%)`).join('\n')}`;
        }
    }

    if (msg.includes('seo') || msg.includes('ranking') || msg.includes('improve')) {
        return `Here are key SEO improvement strategies:\n\n1. **Content Quality** — Create comprehensive, original content\n2. **Technical SEO** — Ensure fast load times, mobile-friendliness\n3. **Internal Linking** — Build strong internal link structure\n4. **Backlinks** — Earn quality backlinks\n5. **Keywords** — Target long-tail keywords`;
    }

    const hint = hasKey
        ? '\n\n*Your GEMINI_API_KEY is configured but the AI service returned an error.*'
        : '\n\n*Add GEMINI_API_KEY to your environment for AI-powered responses.*';

    return `I can help you analyze your website! Ask about bounce rates, traffic sources, SEO tips, geo data, or devices.${hint}`;
}
