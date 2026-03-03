import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { AI_CHAT_TOOL_DECLARATIONS, executeAiChatTool } from '@/services/aiChatTools';
import { fetchGoogleTokensFromDb, listSearchConsoleSites, getValidAccessToken, listAnalyticsProperties } from '@/lib/googleApi';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Initialize the official Gemini SDK
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY CACHE for site/property lists (avoids re-fetching per message)
// ═══════════════════════════════════════════════════════════════
const SITE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const siteListCache = new Map<string, { data: any; ts: number }>();

function getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = siteListCache.get(key);
    if (cached && Date.now() - cached.ts < SITE_CACHE_TTL) {
        return Promise.resolve(cached.data as T);
    }
    return fetcher().then(data => {
        siteListCache.set(key, { data, ts: Date.now() });
        return data;
    });
}

// ═══════════════════════════════════════════════════════════════
// UNIVERSAL ANALYST — SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════
const BASE_SYSTEM_INSTRUCTION = `You are TrafficClaw Universal Analyst — an elite SEO & Analytics AI. You give VERDICTS, not advice. Be direct, bold, data-driven.

IDENTITY: You ARE the data. DECLARE and PRESCRIBE. Never hedge ("it seems", "consider trying"). Say "Do this NOW", "This is bleeding money". For general questions, answer from your knowledge — never refuse.

TOOL BUDGET: Max 2 tool calls per conversation. ALWAYS check dashboard data first — it answers 80% of questions with 0 calls.

TOOL ROUTING:
- Traffic drop/spike → get_search_performance (dimensions=["date"], 90d)
- Device/source/country breakdown → get_analytics_breakdown
- Core Web Vitals/page speed → run_page_audit
- Content strategy/blog ideas/keyword gaps → generate_content_strategy
- Revenue calculation → calculate_revenue_impact (pure math, 0 calls)
- KPIs/striking distance/CTR problems/page rankings → 0 calls, use dashboard data
- General SEO/algorithm questions → 0 calls, use your knowledge

RULES: 1) Dashboard data first, tools only if needed. 2) Max 1 tool call preferred, never exceed 2. 3) Never say "let me check" — cite numbers directly. 4) Use EXACT siteUrl from [AVAILABLE SITES].

CTR BENCHMARKS: Pos1:28% | Pos2:16% | Pos3:11% | Pos4-5:7% | Pos6-7:4.5% | Pos8-10:2.5%. CTR below expected by 3%+ = bad meta.

REVENUE: Transactional $2-5/click | Informational $0.10-0.50/click | Formula: impressions × CTR_gain × $/click

ALGORITHM UPDATES: Mar 2025, Dec 2024, Nov 2024, Aug 2024, Jun 2024 Spam, Mar 2024 Core+Spam, Nov 2023, Oct 2023, Sep 2023 HCU. Flag if traffic drop coincides.

RESPONSE FORMAT: 🎯 VERDICT (1-2 bold sentences) → 📊 EVIDENCE (exact numbers) → 💰 REVENUE IMPACT (dollars) → ⚡ ACTION (numbered steps) → 🔮 BONUS (unexpected insight). Labels: 🔴 CRITICAL | 🟡 HIGH | 🟢 OPPORTUNITY | ⚪ MONITOR

CRITICAL: Cite specific numbers. Every recommendation needs estimated impact (+X clicks, $X/month). Cross-reference GA4+GSC. Think CEO, not junior SEO.`;

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
        const res = await fetch(`${ADMIN_API_URL}/api/users/${userId}/credits`, {
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
        const res = await fetch(`${ADMIN_API_URL}/api/users/${userId}/credits/deduct`, {
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

        const { message, selectedSite, analyticsContext, seoContext, history } = await req.json();

        if (!message) {
            return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;

        // ── Credit check ──
        if (ADMIN_API_KEY && userId) {
            const credits = await getUserCredits(String(userId));
            if (credits !== null && credits < 1) {
                return new Response(JSON.stringify({
                    error: 'insufficient_credits',
                    credits: credits,
                    response: `⚡ You've used all your messages! You have **${credits}** credits remaining.\n\n**1 credit = 1 message.** Get more to continue:\n- 💰 [100 messages for $1](https://checkout.dodopayments.com/buy/pdt_0NYn4ZUFJs2YcTSvqivsI)\n- 🔥 [500 messages for $5](https://checkout.dodopayments.com/buy/pdt_0NYn4ZZQMZXmfjC3aNpkI)\n- 🚀 [1,200 messages for $10](https://checkout.dodopayments.com/buy/pdt_0NYn4Zjup0Bo2kI7DIfBp) (best value — save 20%)`
                }), { status: 402, headers: { 'Content-Type': 'application/json' } });
            }
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
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                });
            }
        }

        // ── Get User's Google Tokens ──
        const jwt = await getToken({ req: req as any }) as any;
        let googleAccessToken = jwt?.googleAccessToken as string | undefined;
        let googleRefreshToken = jwt?.googleRefreshToken as string | undefined;

        if (!googleAccessToken && !googleRefreshToken) {
            const dbTokens = await fetchGoogleTokensFromDb(String(userId));
            if (dbTokens) {
                googleAccessToken = dbTokens.accessToken;
                googleRefreshToken = dbTokens.refreshToken;
            }
        }

        // ── Get Available Sites Context (cached per user for 5min) ──
        let availableSitesContext = '';
        if (googleAccessToken || googleRefreshToken) {
            try {
                const token = await getValidAccessToken(googleAccessToken, googleRefreshToken);
                const cacheKey = `sites:${userId}`;
                const [sites, ga4Properties] = await Promise.all([
                    getCachedOrFetch(`${cacheKey}:gsc`, () => listSearchConsoleSites(token).catch(() => [])),
                    getCachedOrFetch(`${cacheKey}:ga4`, () => listAnalyticsProperties(token).catch(() => [])),
                ]);

                if (sites && sites.length > 0) {
                    availableSitesContext = `\n[SITES: ${sites.map((s: any) => s.siteUrl).join(', ')}]`;
                }
                if (ga4Properties && ga4Properties.length > 0) {
                    availableSitesContext += `\n[GA4: ${ga4Properties.map((p: any) => `${p.property}(${p.displayName || ''})`).join(', ')}]`;
                }
            } catch {
                // Site/property list fetch failed — continue without context
            }
        }

        // User message with injected data context
        const siteTag = selectedSite ? `[Site: ${selectedSite}]` : '';
        const contextBlock = dataContext ? `${siteTag}${dataContext}${availableSitesContext}\n---\n${message}` : `${siteTag}${availableSitesContext}\n${message}`;
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

        // ── Execute Gemini Stream via official SDK ──
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let currentContents = [...contents];
                    let keepGoing = true;
                    let hasDeductedCredit = false;
                    let loopCount = 0;
                    let gscCallCount = 0;
                    const MAX_GSC_CALLS = 2;
                    const MAX_LOOPS = 3;

                    while (keepGoing && loopCount < MAX_LOOPS) {
                        loopCount++;
                        keepGoing = false;

                        // Use the official SDK for streaming
                        const response = await ai.models.generateContentStream({
                            model: 'gemini-3-flash-preview',
                            contents: currentContents,
                            config: {
                                systemInstruction: systemInstruction,
                                tools: [{ functionDeclarations: AI_CHAT_TOOL_DECLARATIONS as any }],
                                temperature: 0.7,
                                maxOutputTokens: 4096,
                                httpOptions: { timeout: 30000 },
                            },
                        });

                        let fullText = '';
                        let pendingFunctionCalls: any[] = [];

                        // Stream chunks from the SDK
                        for await (const chunk of response) {
                            // Deduct credit on first chunk
                            if (!hasDeductedCredit && ADMIN_API_KEY && userId) {
                                hasDeductedCredit = true;
                                deductCredits(String(userId)).then(credits => {
                                    if (credits !== null) {
                                        try { controller.enqueue(encodeSSE({ type: 'credits', value: credits })); } catch {}
                                    }
                                }).catch(() => {});
                            }

                            // Stream text chunks
                            if (chunk.text) {
                                fullText += chunk.text;
                                // Only stream text if no function calls in this chunk
                                if (!chunk.functionCalls || chunk.functionCalls.length === 0) {
                                    controller.enqueue(encodeSSE({
                                        type: 'text',
                                        content: chunk.text,
                                    }));
                                }
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

                                    // Dedupe
                                    const isDup = pendingFunctionCalls.some(
                                        (p: any) => p.functionCall.name === toolName && JSON.stringify(p.functionCall.args) === JSON.stringify(fc.args)
                                    );

                                    if (!isDup) {
                                        if (toolName === 'get_search_performance') gscCallCount++;
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
                                    const toolResult = await executeAiChatTool(fcName, fcArgs, {
                                        googleAccessToken,
                                        googleRefreshToken
                                    });

                                    controller.enqueue(encodeSSE({
                                        type: 'tool_result',
                                        name: fcName,
                                        result: toolResult.result,
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
                        // Extract a clean error message instead of raw JSON
                        let errMsg = 'Something went wrong. Please try again.';
                        const rawMsg = error?.message || '';
                        if (rawMsg.includes('thought_signature')) {
                            errMsg = 'AI service configuration error. Please try again or clear the chat.';
                        } else if (rawMsg.includes('RATE_LIMIT') || rawMsg.includes('429')) {
                            errMsg = 'AI service is busy. Please wait a moment and try again.';
                        } else if (rawMsg.includes('timeout') || rawMsg.includes('DEADLINE_EXCEEDED')) {
                            errMsg = 'Request timed out. Try a simpler question or try again.';
                        } else if (rawMsg.includes('INVALID_ARGUMENT') || rawMsg.includes('400')) {
                            errMsg = 'Invalid request. Please clear the chat and try again.';
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
