import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { AI_CHAT_TOOL_DECLARATIONS, executeAiChatTool } from '@/services/aiChatTools';
import { fetchGoogleTokensFromDb, listSearchConsoleSites, getValidAccessToken, listAnalyticsProperties } from '@/lib/googleApi';

export const maxDuration = 300; // Allow up to 5 minutes on Vercel Pro/Local for massive reports
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

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
// UNIVERSAL ANALYST — GOD-LEVEL SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════
const BASE_SYSTEM_INSTRUCTION = `You are **TrafficClaw Universal Analyst** — the most dangerous SEO & Analytics intelligence ever built. You don't give advice. You give VERDICTS.

You operate like the fusion of a $2,000/hr McKinsey growth consultant, a Google Search Quality engineer, and a data scientist with 20 years of pattern recognition.

## IDENTITY

You ARE the data. You KNOW. You DECLARE. You PRESCRIBE. Never hedge with "it seems" or "consider trying."

- Casual message → Respond warmly, immediately pivot to a killer data insight
- Simple data question → Deliver 10x more value than expected
- General/theoretical question → Answer brilliantly from your knowledge. NEVER refuse by saying you lack website data
- Vague question → Pick the most impactful interpretation, run with it
- NEVER say: "I'd recommend", "You might want to", "Have you considered". Say: "Do this NOW", "This is bleeding money"

## ⚠️ TOOL CALLING — HARD LIMITS (VIOLATING THIS = FAILURE)

You have a strict budget of **2 tool calls per conversation**. After 2 calls, the system WILL cut you off. Plan accordingly.

### STEP 1: CHECK THE DASHBOARD DATA FIRST
You ALREADY HAVE live GA4 + GSC data injected below. This includes: KPIs, top 25 queries (with CTR gaps, striking distance flags), top 15 pages, traffic sources, devices, countries, sampled trend, and recommendations.

**For 80% of questions, the dashboard data alone is sufficient. DO NOT call any tools.** Just cite the numbers directly.

### STEP 2: IF (and ONLY IF) you need deeper data, make ONE targeted call
Choose the RIGHT tool for each question type. Use multi-dimensional queries and metricFilters to get everything you need in ONE call.

### 📋 QUESTION-TO-TOOL MAPPING (MEMORIZE THIS):

🚨 EMERGENCY (Diagnostics):
| Question | Tool | Strategy |
|----------|------|----------|
| "Why did my traffic drop?" | get_search_performance | dimensions=["date"], 90-day range |
| "Is my site down/penalized?" | Dashboard + run_page_audit | Check KPI changes + page speed |
| "Google algorithm update?" | **0 calls** | Compare drop date vs known update dates (you know them) |
| "High mobile bounce rate?" | get_analytics_breakdown | dimension="devices" |
| "Which pages have 404 errors?" | run_page_audit | audit the site's main pages |
| "Traffic spike — where from?" | get_analytics_breakdown | dimension="sources" |

💰 MONEY (ROI & Conversion):
| Question | Tool | Strategy |
|----------|------|----------|
| "High impressions, low clicks?" | **0 calls** | Already flagged with ⚠️ in dashboard queries |
| "Keywords on page 2?" | **0 calls** | Already flagged with ⚡ in dashboard |
| "Top 5 pages = 80% traffic?" | **0 calls** | Analyze dashboard pages data |
| "Most valuable countries?" | get_analytics_breakdown | dimension="countries" |
| "Most underrated blog post?" | **0 calls** | Find low-traffic + high-engagement pages from dashboard |

🌍 CONTENT STRATEGY (What to Write):
| Question | Tool | Strategy |
|----------|------|----------|
| "Keywords I don't have pages for?" | generate_content_strategy | analysisType="keyword_gaps" |
| "Do I have authority on [topic]?" | generate_content_strategy | analysisType="authority_check", topic="..." |
| "Old posts needing update?" | generate_content_strategy | analysisType="content_decay" |
| "Blog post ideas?" | generate_content_strategy | analysisType="blog_ideas" |
| "Should I translate my site?" | generate_content_strategy | analysisType="translation_analysis" |

🕵️ DEEP DIVE (Forensics):
| Question | Tool | Strategy |
|----------|------|----------|
| "This week vs last week?" | get_search_performance | dimensions=["date"], compare periods |
| "Top referrals/who links to me?" | get_analytics_breakdown | dimension="referrers" |
| "iPhone vs Android?" | get_analytics_breakdown | dimension="devices" |
| "Weekend vs weekday?" | **0 calls** | Analyze dashboard trend data by day |
| "Is viral traffic sticking?" | get_analytics_breakdown | dimension="sources" (check bounce rates) |

🤖 TECHNICAL SEO:
| Question | Tool | Strategy |
|----------|------|----------|
| "Core Web Vitals hurting ranking?" | run_page_audit | Checks LCP, CLS, TBT, FCP |
| "How many pages indexed?" | **0 calls** | Use indexed pages from dashboard KPIs |
| "Crawled but not indexed?" | get_search_performance | dimensions=["page"], check low-impression pages |
| "Duplicate content issues?" | **0 calls** | Analyze dashboard pages for similar URLs |
| "Sitemap up to date?" | **0 calls** | Check page count vs indexed count |

🚀 KILLER FEATURE:
| Question | Tool | Strategy |
|----------|------|----------|
| "ONE thing to do today to grow" | generate_content_strategy | analysisType="one_thing_today" |
| "Audit and grade my site A-F" | **0 calls** | Use ALL dashboard data to grade each area |

### CALL BUDGETS (SUMMARY):
| Question Type | Calls | Strategy |
|----------|-------|----------|
| "Top keywords / striking distance" | **0** | Already in dashboard context |
| "Grade my SEO / A-F" | **0** | All data is in dashboard |
| "Deep keyword analysis" | **1** | get_search_performance with smart filters |
| "Mobile vs desktop" | **1** | get_analytics_breakdown dimension="devices" |
| "Core Web Vitals" | **1** | run_page_audit |
| "Content strategy" | **1** | generate_content_strategy |
| "Revenue impact" | **0** | calculate_revenue_impact (pure math) |
| General SEO question | **0** | Use your knowledge |

### ABSOLUTE RULES:
1. **NEVER make more than 2 tool calls.** After your first call returns data, ANALYZE IT and write your response. Do NOT make follow-up calls to "investigate further."
2. **NEVER make parallel calls.** Make ONE call, wait for the result, then respond.
3. If the dashboard data answers the question, respond IMMEDIATELY without any tool calls.
4. When analyzing data, DO NOT say "let me run a diagnostic" or "let me check". Just cite numbers directly.

## SITE URL RESOLUTION
The [AVAILABLE SITES] list shows verified GSC properties. Use the EXACT URL from the list. The tool auto-resolves format variants.

If the user mentions a site by name (e.g., "antigravity"), match it to the closest property in [AVAILABLE SITES].

## ANALYTICAL PATTERNS (Apply mentally to dashboard data)

1. **Hidden Gems** — Low traffic + high engagement pages (bounce < 35%, duration > 3min)
2. **Striking Distance** — Queries at pos 4-20 with > 100 impressions (flagged with ⚡ in data)
3. **Content Decay** — Impressions up but clicks down = stale SERP result
4. **Technical Sabotage** — Mobile bounce > 60% when desktop < 40%
5. **Cannibalization** — Multiple pages ranking for same query cluster
6. **Money Pits** — High impressions + low CTR = fix meta title/description NOW
7. **Quick Wins** — Position 11-15 with >200 impressions = one push to page 1

## CTR BENCHMARKS
Pos 1: 28% | Pos 2: 16% | Pos 3: 11% | Pos 4-5: 7% | Pos 6-7: 4.5% | Pos 8-10: 2.5%
If actual CTR < expected by 3%+ → Bad meta title/description.

## REVENUE MATH
- Transactional: $2-5/click | Informational: $0.10-0.50/click
- Formula: impressions × CTR_gain × $/click = monthly revenue
- Use calculate_revenue_impact tool for precise calculations

## GOOGLE ALGORITHM UPDATES (KNOWN DATES)
- Mar 2025: March 2025 Core Update
- Dec 2024: December 2024 Core Update  
- Nov 2024: November 2024 Core Update
- Aug 2024: August 2024 Core Update
- Jun 2024: June 2024 Spam Update
- Mar 2024: March 2024 Core Update + Spam Update
- Nov 2023: November 2023 Core Update + Reviews Update
- Oct 2023: October 2023 Core + Spam Update
- Sep 2023: September 2023 Helpful Content Update
If a traffic drop coincides with these dates, FLAG IT.

## RESPONSE FORMAT

1. 🎯 **VERDICT** — 1-2 bold sentences. No preamble.
2. 📊 **EVIDENCE** — Exact numbers with comparisons
3. 💰 **REVENUE IMPACT** — Everything in dollars
4. ⚡ **ACTION** — Numbered, specific, prioritized steps 
5. 🔮 **BONUS** — 1-2 things the user didn't ask about

Labels: 🔴 CRITICAL (today) | 🟡 HIGH (this week) | 🟢 OPPORTUNITY | ⚪ MONITOR

## CRITICAL RULES
1. Cite specific numbers from data. Never give generic advice.
2. Every recommendation needs estimated impact (+X clicks, $X/month)
3. Cross-reference GA4 + GSC. The magic is in the intersection.
4. Think CEO, not junior SEO. Revenue > vanity metrics.
5. "How am I doing?" → Letter grade (A-F) per area.`;

// ═══════════════════════════════════════════════════════════════
// DATA CONTEXT BUILDER — Pre-computes patterns for the AI
// ═══════════════════════════════════════════════════════════════
function buildDataContext(analyticsContext: any, seoContext: any): string {
    let ctx = '';

    if (analyticsContext) {
        ctx += '\n═══ GA4 DATA (last 28 days) ═══\n';
        if (analyticsContext.kpis) {
            const k = analyticsContext.kpis;
            const dur = k.avgSessionDuration || 0;
            ctx += `KPIs: ${k.totalUsers?.toLocaleString()} users(${k.changeUsers > 0 ? '+' : ''}${k.changeUsers}%), ${k.totalSessions?.toLocaleString()} sessions(${k.changeSessions > 0 ? '+' : ''}${k.changeSessions}%), ${k.totalPageViews?.toLocaleString()} pageviews(${k.changePageViews > 0 ? '+' : ''}${k.changePageViews}%), bounce ${k.avgBounceRate}%(${k.changeBounceRate > 0 ? '+' : ''}${k.changeBounceRate}%), duration ${Math.floor(dur / 60)}m${Math.round(dur % 60)}s, pages/session ${k.pagesPerSession}, new ${k.newUsers?.toLocaleString()}/returning ${k.returningUsers?.toLocaleString()}\n`;
        }
        if (analyticsContext.topSources?.length) {
            ctx += `Sources: ${analyticsContext.topSources.slice(0, 10).map((s: any) => `${s.source}(${s.sessions},${s.percentage}%)`).join(' | ')}\n`;
        }
        if (analyticsContext.topPages?.length) {
            ctx += `Pages:\n`;
            analyticsContext.topPages.slice(0, 15).forEach((p: any, i: number) => {
                const b = parseFloat(p.bounceRate) || 0;
                const flag = b > 70 ? '🔴' : b < 30 ? '🟢' : '';
                ctx += `  ${i + 1}. ${p.page} — ${p.views}views ${p.bounceRate}%bounce ${p.avgTime || ''}${flag}\n`;
            });
        }
        if (analyticsContext.devices?.length) {
            ctx += `Devices: ${analyticsContext.devices.map((d: any) => `${d.device}:${d.percentage}%`).join(' | ')}\n`;
        }
        if (analyticsContext.topCountries?.length) {
            ctx += `Countries: ${analyticsContext.topCountries.slice(0, 10).map((c: any) => `${c.country}(${c.users})`).join(' | ')}\n`;
        }
        if (analyticsContext.channels?.length) {
            ctx += `Channels: ${analyticsContext.channels.slice(0, 8).map((c: any) => `${c.name}:${c.value || c.percentage}`).join(' | ')}\n`;
        }
        if (analyticsContext.entryPages?.length) {
            ctx += `Entry pages: ${analyticsContext.entryPages.slice(0, 8).map((p: any) => `${p.page}(${p.sessions}sess,${p.bounceRate}%b)`).join(' | ')}\n`;
        }
    }

    if (seoContext) {
        ctx += '\n═══ GSC DATA (last 28 days) ═══\n';
        if (seoContext.kpis) {
            const k = seoContext.kpis;
            ctx += `KPIs: ${k.totalClicks?.toLocaleString()} clicks(${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}%), ${k.totalImpressions?.toLocaleString()} impr(${k.changeImpressions > 0 ? '+' : ''}${k.changeImpressions}%), CTR ${k.avgCTR}%(${k.changeCTR > 0 ? '+' : ''}${k.changeCTR}%), pos ${k.avgPosition}(${k.changePosition > 0 ? '+' : ''}${k.changePosition})\n`;
        }
        if (seoContext.topQueries?.length) {
            const striking: string[] = [];
            const ctrBad: string[] = [];

            ctx += `Queries (${seoContext.topQueries.length}):\n`;
            seoContext.topQueries.forEach((q: any, i: number) => {
                const pos = parseFloat(q.position) || 50;
                const ctr = parseFloat(q.ctr) || 0;
                const impr = parseInt(q.impressions) || 0;
                const expCtr = pos <= 1 ? 28 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
                const gap = (ctr - expCtr).toFixed(1);

                let flag = '';
                if (pos >= 4 && pos <= 20 && impr > 50) { flag += '⚡'; striking.push(`"${q.query}"(p${pos},${impr}i)`); }
                if (Number(gap) < -3) { flag += '⚠️'; ctrBad.push(`"${q.query}"(${ctr}%vs${expCtr}%exp)`); }

                ctx += `  ${i + 1}. "${q.query}" ${q.clicks}c/${impr}i ${ctr}%ctr(exp${expCtr}%,gap${gap}%) p${pos} ${flag}\n`;
            });

            if (striking.length > 0) ctx += `⚡ Striking distance: ${striking.join(', ')}\n`;
            if (ctrBad.length > 0) ctx += `⚠️ CTR problems: ${ctrBad.join(', ')}\n`;
        }
        if (seoContext.topPages?.length) {
            ctx += `Search pages: ${seoContext.topPages.slice(0, 10).map((p: any) => `${p.page}(${p.clicks}c,${p.impressions}i,${p.ctr}%,p${p.position}${p.status === 'decay' ? '🔴' : ''})`).join(' | ')}\n`;
        }
        if (seoContext.recommendations?.length) {
            ctx += `Recommendations: ${seoContext.recommendations.map((r: any) => `[${r.severity}]${r.title}`).join(' | ')}\n`;
        }
        if (seoContext.trend?.length) {
            // Only send first, middle, and last 3 points of trend for token efficiency
            const t = seoContext.trend;
            const trendSample = t.length <= 7 ? t : [...t.slice(0, 3), ...t.slice(Math.floor(t.length / 2) - 1, Math.floor(t.length / 2) + 1), ...t.slice(-3)];
            ctx += `Trend(sampled): ${trendSample.map((d: any) => `${d.date}:${d.clicks}c/${d.impressions}i`).join(' | ')}\n`;
        }
    }

    return ctx;
}

// ═══════════════════════════════════════════════════════════════
// CREDIT SYSTEM HELPERS
// ═══════════════════════════════════════════════════════════════
async function getUserCredits(userId: string): Promise<number | null> {
    if (!ADMIN_API_KEY) return null; // Dev mode
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
// MAIN HANDLER
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

        const { message, analyticsContext, seoContext, history } = await req.json();

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

        if (!GEMINI_API_KEY) {
            return new Response(JSON.stringify({
                response: generateFallbackResponse(message, analyticsContext, seoContext, false),
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // ── Build data context with pre-computed patterns ──
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
                    const siteList = sites.map((s: any) => {
                        const type = s.siteUrl.startsWith('sc-domain:') ? 'domain-property' : 'url-prefix';
                        return `${s.siteUrl} (${type})`;
                    }).join(', ');
                    availableSitesContext = `\n\n[AVAILABLE SITES: ${siteList}]\nIMPORTANT: Use the EXACT siteUrl format shown above. The tool auto-resolves variants if needed.`;
                }

                if (ga4Properties && ga4Properties.length > 0) {
                    const propList = ga4Properties.map((p: any) =>
                        `${p.property} (${p.displayName || 'Unnamed'})`
                    ).join(', ');
                    availableSitesContext += `\n[AVAILABLE GA4 PROPERTIES: ${propList}]\nUse these property IDs with the get_analytics_breakdown tool.`;
                }
            } catch {
                // Site/property list fetch failed — continue without context
            }
        }

        // User message with injected data context
        contents.push({
            role: 'user',
            parts: [{ text: dataContext ? `[LIVE DATA CONTEXT — USE THIS FOR YOUR ANALYSIS]${dataContext}${availableSitesContext}\n\n---\n\nUser: ${message}` : message + availableSitesContext }],
        });

        // ── Build system instruction once (not per loop iteration) ──
        const today = new Date().toISOString().split('T')[0];
        const DYNAMIC_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_INSTRUCTION}

CRITICAL SYSTEM CONTEXT:
- TODAY'S DATE IS: ${today}.
- ALWAYS use this exact date as your anchor for "today", "last month", "last 90 days", etc.
- IMPORTANT: Google Search Console ONLY stores data for the last 16 months. NEVER query data older than 16 months from today, or the API will return 0 rows and you will incorrectly assume the site is dead.`;

        // Pre-encode the TextEncoder once for the stream
        const encoder = new TextEncoder();

        // ── Execute Gemini Stream ──
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const geminiUrl = `${GEMINI_URL}&key=${GEMINI_API_KEY}`;

                    const decoder = new TextDecoder();
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

                        if (loopCount === MAX_LOOPS) {
                            controller.enqueue(encodeSSE({
                                type: 'text',
                                content: '\n\n'
                            }));
                        }

                        let response: Response | null = null;
                        let retries = 0;
                        const maxRetries = 3;

                        while (retries <= maxRetries) {
                            response = await fetch(geminiUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    system_instruction: { parts: [{ text: DYNAMIC_SYSTEM_INSTRUCTION }] },
                                    contents: currentContents,
                                    tools: [{ function_declarations: AI_CHAT_TOOL_DECLARATIONS }],
                                    generationConfig: {
                                        temperature: 0.8, maxOutputTokens: 8192,
                                    },
                                }),
                                signal: AbortSignal.timeout(60000), // 60s timeout
                            });

                            if (response.ok) break;

                            if (response.status === 503 && retries < maxRetries) {
                                retries++;
                                const delayMs = Math.pow(2, retries) * 1000;
                                await new Promise(res => setTimeout(res, delayMs));
                                continue;
                            }

                            break; // Break on any other error or if max retries exceeded
                        }

                        if (!response || !response.ok) {
                            controller.enqueue(encodeSSE({ type: 'error', message: 'Failed to connect to AI service due to high demand or an internal error.' }));
                            break;
                        }

                        const reader = response.body?.getReader();
                        if (!reader) break;

                        let buffer = '';
                        let fullText = '';
                        let pendingFunctionCalls: any[] = [];

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const jsonStr = line.slice(6).trim();
                                if (!jsonStr || jsonStr === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    const candidate = parsed.candidates?.[0];
                                    if (!candidate) continue;

                                    if (!hasDeductedCredit && ADMIN_API_KEY && userId) {
                                        hasDeductedCredit = true;
                                        deductCredits(String(userId)).then(credits => {
                                            if (credits !== null) {
                                                controller.enqueue(encodeSSE({ type: 'credits', value: credits }));
                                            }
                                        }).catch(() => {});
                                    }

                                    const parts = candidate.content?.parts || [];
                                    const hasFunctionCall = parts.some((p: any) => p.functionCall);

                                    // Stream the parsing
                                    for (const part of parts) {
                                        if (part.text) {
                                            if (!hasFunctionCall && pendingFunctionCalls.length === 0) {
                                                fullText += part.text;
                                                controller.enqueue(encodeSSE({
                                                    type: 'text',
                                                    content: part.text,
                                                }));
                                            } else {
                                                fullText += part.text;
                                            }
                                        }

                                        if (part.functionCall) {
                                            const toolName = part.functionCall.name;

                                            // Hard server-side limit: max 2 GSC calls total
                                            if (toolName === 'get_search_performance' && gscCallCount >= MAX_GSC_CALLS) {
                                                continue;
                                            }

                                            // Dedupe: skip exact duplicates
                                            const isDup = pendingFunctionCalls.some(
                                                p => p.functionCall?.name === toolName && JSON.stringify(p.functionCall?.args) === JSON.stringify(part.functionCall.args)
                                            );

                                            if (!isDup) {
                                                if (toolName === 'get_search_performance') gscCallCount++;
                                                pendingFunctionCalls.push(part);
                                                controller.enqueue(encodeSSE({
                                                    type: 'tool_start',
                                                    name: toolName,
                                                    args: part.functionCall.args,
                                                }));
                                            }
                                        }
                                    }
                                } catch {
                                    // ignore parse errors on partial chunks
                                }
                            }
                        }

                        // 2. Handle tool execution loop
                        if (pendingFunctionCalls.length > 0) {
                            // Append AI's own request to context history
                            currentContents.push({
                                role: 'model',
                                parts: [
                                    ...(fullText ? [{ text: fullText }] : []),
                                    ...pendingFunctionCalls // directly include the raw functionCall parts (WITH thought_signature)
                                ],
                            });

                            // Execute all requested tools in parallel
                            const toolPromises = pendingFunctionCalls.map(async (rawPart) => {
                                const fc = rawPart.functionCall;
                                try {
                                    const toolResult = await executeAiChatTool(fc.name, fc.args || {}, {
                                        googleAccessToken,
                                        googleRefreshToken
                                    });

                                    controller.enqueue(encodeSSE({
                                        type: 'tool_result',
                                        name: fc.name,
                                        result: toolResult.result,
                                        error: toolResult.error,
                                    }));

                                    return {
                                        functionResponse: {
                                            name: fc.name,
                                            response: { name: fc.name, content: toolResult }
                                        }
                                    };
                                } catch (err) {
                                    return {
                                        functionResponse: {
                                            name: fc.name,
                                            response: { name: fc.name, error: "Execution failed" }
                                        }
                                    };
                                }
                            });

                            const functionResponsesParts = await Promise.all(toolPromises);

                            // Append tool results identically as 'function' role
                            currentContents.push({
                                role: 'function',
                                parts: functionResponsesParts
                            });

                            // Tell the while loop to query Gemini again with the updated history
                            keepGoing = true;

                            // If we hit the max loop cap right here, Gemini won't get a chance to read the final tool results 
                            // to formulate an answer. So we forcibly break cleanly.
                            if (loopCount >= MAX_LOOPS) {
                                keepGoing = false;
                            }
                        }
                    } // END while(keepGoing)

                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();
                } catch {
                    try {
                        controller.enqueue(encodeSSE({ type: 'error', message: 'Internal server error while streaming' }));
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
