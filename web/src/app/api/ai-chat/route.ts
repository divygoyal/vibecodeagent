import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { AI_CHAT_TOOL_DECLARATIONS, executeAiChatTool } from '@/services/aiChatTools';
import { fetchGoogleTokensFromDb, listSearchConsoleSites, getValidAccessToken, listAnalyticsProperties } from '@/lib/googleApi';
import { fetchGithubTokenFromDb, fetchGithubAppToken } from '@/lib/githubApi';
import { GoogleGenAI } from '@google/genai';

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
// UNIVERSAL ANALYST — SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════
const BASE_SYSTEM_INSTRUCTION = `You are TrafficClaw Universal Analyst — an elite SEO & Analytics AI. Give VERDICTS, not advice. Be direct, bold, data-driven. DECLARE and PRESCRIBE. Never hedge. Say "Do this NOW", "This is bleeding money". Answer general questions from your knowledge.

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
1) Dashboard snapshot is injected on EVERY turn — use it first. Reach for tools only when the snapshot is insufficient.
2) Plan tool use: pick the SMALLEST set that answers the question. Prefer 1 tool call. Hard cap 8.
3) Cite exact numbers. Never round to "about" — say "12,847 clicks (-23% WoW)".
4) Use the EXACT siteUrl from [AVAILABLE SITES] / [Site:].
5) GitHub tools: only when [GitHub:connected] AND the question implies code/deploy/PR/issue. Skip silently otherwise; never mention GitHub when [GitHub:not_connected].
6) [Repo: x · {confirmed|auto}] = the repo for the current site — pass repo=x to ALL GitHub tools. NEVER call list_user_repos. If status=auto, gently mention once: "I'm checking {repo} — confirm in the dropdown if that's right." If confirmed, use silently.

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
        const { message, selectedSite, selectedRepo, repoIsAuto, analyticsContext, seoContext, history, mode } = body;

        if (!message || typeof message !== 'string') {
            return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (message.length > 4000) {
            return new Response(JSON.stringify({ error: 'Message too long (max 4000 chars)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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

        // User message with injected data context
        const siteTag = selectedSite ? `[Site: ${selectedSite}]` : '';
        const githubTag = `[GitHub:${githubConnected ? 'connected' : 'not_connected'}]`;
        const repoTag = (githubConnected && selectedRepo)
            ? `[Repo: ${selectedRepo} · ${repoIsAuto ? 'auto' : 'confirmed'}]`
            : '';
        const contextBlock = dataContext
            ? `${siteTag}${githubTag}${repoTag}${dataContext}${availableSitesContext}\n---\n${message}`
            : `${siteTag}${githubTag}${repoTag}${availableSitesContext}\n${message}`;
        contents.push({
            role: 'user',
            parts: [{ text: contextBlock }],
        });

        // ── Build system instruction once ──
        const today = new Date().toISOString().split('T')[0];
        const systemInstruction = `${BASE_SYSTEM_INSTRUCTION}

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

                    // Send credit update immediately
                    if (creditBalance !== null) {
                        controller.enqueue(encodeSSE({ type: 'credits', value: creditBalance }));
                    }

                    let currentContents = [...contents];
                    let keepGoing = true;
                    let loopCount = 0;
                    let gscCallCount = 0;
                    let githubCallCount = 0;
                    let inspectCallCount = 0; // A9: cap inspect_url at 3/conversation (GSC quota friendliness)
                    const MAX_GSC_CALLS = 8;
                    const MAX_GITHUB_CALLS = 5;
                    const MAX_INSPECT_CALLS = 3;
                    const MAX_LOOPS = 8;
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
                                    console.warn(`[AI-CHAT] ${model} unavailable (${modelErr?.message?.slice(0, 80)}), trying next fallback...`);
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
                            // A6: stream text chunks ALWAYS — including the model's pre-tool
                            // reasoning (e.g. "I'll start by checking your GSC data for…").
                            // Previously gated on "no function calls in chunk", which silently
                            // dropped the most user-visible part: the thinking out loud.
                            if (chunk.text) {
                                fullText += chunk.text;
                                controller.enqueue(encodeSSE({
                                    type: 'text',
                                    content: chunk.text,
                                }));
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
                                    if (SLOW_TOOLS.has(fcName)) {
                                        progressTimer = setInterval(() => {
                                            const elapsed = Math.round((Date.now() - toolStartedAt) / 1000);
                                            try {
                                                controller.enqueue(encodeSSE({ type: 'tool_progress', name: fcName, elapsedSec: elapsed }));
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

                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error: any) {
                    try {
                        console.error('[AI-CHAT] Stream error:', error?.message || error, error?.name);
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

    } catch {
        return new Response(JSON.stringify({ error: 'Failed to process request' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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
