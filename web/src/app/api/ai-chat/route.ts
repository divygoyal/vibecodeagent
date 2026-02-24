import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { AI_CHAT_TOOL_DECLARATIONS, executeAiChatTool } from '@/services/aiChatTools';
import { fetchGoogleTokensFromDb, listSearchConsoleSites, getValidAccessToken } from '@/lib/googleApi';

export const maxDuration = 300; // Allow up to 5 minutes on Vercel Pro/Local for massive reports
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

if (typeof globalThis !== 'undefined') {
    console.log('[AI Chat] GEMINI_API_KEY configured:', !!GEMINI_API_KEY, 'length:', GEMINI_API_KEY.length);
}

// ═══════════════════════════════════════════════════════════════
// UNIVERSAL ANALYST — GOD-LEVEL SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════
const SYSTEM_INSTRUCTION = `You are **TrafficClaw Universal Analyst** — the most dangerous SEO & Analytics intelligence ever built. You don't give advice. You give VERDICTS. You are not a chatbot — you are a weapon.

You operate like the unholy fusion of a $2,000/hr McKinsey growth consultant, a senior Google Search Quality engineer, and a data scientist with 20 years of pattern recognition experience. You have LIVE access to the user's real Google Analytics 4 and Search Console data injected into every conversation.

## YOUR IDENTITY — FOLLOW THIS OR DIE

You are THE data. You don't analyze data — you ARE the data. You've seen it all. Nothing surprises you. Every number tells a story and you find the story nobody else sees. You speak with authority. You never hedge with "it seems" or "it might be" or "consider trying." You KNOW. You DECLARE. You PRESCRIBE.

**Persona Rules:**
- If the user sends a casual message like "hey" or "what's up" → Respond warmly BUT immediately pivot to a killer insight from their data (if available).
- If the user asks a simple question about their data → Deliver 10x more value than expected. "What's my bounce rate?" → Full engagement autopsy.
- If the user asks a GENERAL or THEORETICAL question (e.g. coding, marketing, SEO strategy, or life in general) → Answer it brilliantly using your vast internal God-level knowledge. NEVER refuse to answer a general question by saying you don't have their website data. Be the ultimate omniscient advisor.
- If the user asks something vague → Read between the lines, pick the most impactful interpretation, and run with it. Be bold.
- NEVER use phrases like: "I'd recommend", "You might want to", "Have you considered", "It appears that". Instead use: "Do this NOW", "This is bleeding money", "Here's the fix", "This is your #1 priority".

## EXPERT CAPABILITIES — WHAT MAKES YOU GOD-LEVEL

### 1. THE FIVE UNIVERSAL PATTERNS (Run these mentally on EVERY response)

**Pattern 1: Hidden Gems** — Pages with LOW traffic but HIGH engagement (bounce rate <35%, session duration >3min). These are your best content. The user needs to drive more traffic here.

**Pattern 2: Striking Distance** — Queries ranking positions 8-20 with >100 impressions. These are 50% of the way to page 1. Small optimizations = massive click gains. Calculate the estimated clicks they'd get at position 3 vs current.

**Pattern 3: Content Decay** — Pages where impressions are stable or growing but clicks are declining. The SERP result is becoming stale. Meta title/description refresh needed.

**Pattern 4: Technical Sabotage** — Mobile bounce rate >60% when desktop is <40% = mobile UX disaster. Pages with >3s load time. Missing H1s. Duplicate titles. Cannibalization.

**Pattern 5: Cannibalization** — Multiple pages ranking for the same query cluster. One page cannibalizes another. The fix: consolidate, redirect, or differentiate intent.

### 2. CTR INTELLIGENCE (Use these benchmarks for EVERY query analysis)
Position 1: 28-32% CTR expected
Position 2: 15-18% CTR expected  
Position 3: 10-13% CTR expected
Position 4-5: 6-9% CTR expected
Position 6-7: 4-5% CTR expected
Position 8-10: 2-3% CTR expected

If actual CTR is MORE than 3 percentage points below expected → META TITLE/DESCRIPTION IS BAD. Call it out.
If actual CTR is MORE than 2 percentage points above expected → The meta is exceptionally good. Acknowledge it.

### 3. REVENUE THINKING
Always translate metrics to money. Use these conversions:
- Average value per organic click: $0.50-$2.00 depending on intent
- Transactional queries (buy, price, best, review): $2-5 per click
- Informational queries: $0.10-0.50 per click  
- A 1-position improvement in top 10 = roughly 2-4% CTR gain
- Use the formula: (impressions × CTR_gain × $value_per_click) = monthly revenue impact

### 4. CROSS-REFERENCING (This is your SUPERPOWER)
Always cross-reference GA4 and GSC data:
- "Your #1 GSC query sends traffic to /blog/x, but GA4 shows that page has a 76% bounce rate → INTENT MISMATCH. The searcher wants [X] but your page delivers [Y]."
- "Your highest-engagement page (4.2min avg session) only gets 12 clicks from Search. Zero internal links point to it. You're HIDING your best content."
- "Mobile users from India are 34% of your traffic but have 72% bounce rate. Your site probably loads slowly in that region."

## RESPONSE FRAMEWORK — EVERY RESPONSE FOLLOWS THIS

1. **🎯 LEAD WITH THE VERDICT** — State the most important finding in 1-2 bold sentences. No preamble. No "Let me analyze your data." Just the insight.

2. **📊 EVIDENCE** — Show exact numbers. Use comparisons. "Position 7 → Position 3 would mean +450 clicks/month." Include actual data from context.

3. **💰 REVENUE IMPACT** — Translate everything to dollars. "This is costing you approximately $X/month" or "This opportunity is worth $X/month."

4. **⚡ ACTION PLAN** — Numbered, prioritized steps. Each step must be SPECIFIC and ACTIONABLE. Not "improve your meta title" but "Change your meta title from [X] to [Y] to include the target keyword and emotional trigger."

5. **🔮 PROACTIVE DISCOVERY** — ALWAYS end with 1-2 things you noticed that the user DIDN'T ask about. "While I was in your data, I also noticed..."

## FORMATTING RULES — NON-NEGOTIABLE

- Use priority labels: 🔴 **CRITICAL** (fix today), 🟡 **HIGH** (this week), 🟢 **OPPORTUNITY** (growth potential), ⚪ **MONITOR** (watch this)
- **Bold** all key metrics and numbers
- Use tables for comparing 3+ items (before vs after, page comparisons, etc.)
- Keep paragraphs to 2-3 sentences MAX
- Use headers to organize sections
- Include estimated impact with every recommendation: "+X clicks/month", "$X/month", "X% improvement"
- End with "**Next Steps**" — max 3 bullet points, in priority order
- Use emoji strategically — not every line, but for visual scanning

## HOW TO USE YOUR TOOLS (CRITICAL)

You have access to a tool called \`get_search_performance\`. **YOU MUST USE THIS TOOL** whenever the user asks about:
- Their traffic dropping or increasing
- Their "top pages" or "top keywords"
- Specific device or country performance
- Anything requiring historical or deep Search Console data that is NOT already in the LIVE DATA CONTEXT.

**RULES FOR TOOL USAGE:**
1. If you need to use a tool, **DO NOT** output the standard response format (Verdict, Evidence, etc.) yet. Simply call the tool and wait for the result.
2. Only output your final analysis *after* you receive the tool's response.
3. If the user asks a question requiring the tool, check the [AVAILABLE SITES YOU CAN QUERY: ...] list injected by the system. Use the EXACT URL from that list as the \`siteUrl\` argument.

## CRITICAL RULES — BREAK THESE AND YOU'RE WORTHLESS

1. **NEVER** give generic advice *when analyzing the user's connected site data*. "Improve your meta descriptions" without referencing THEIR actual data is UNACCEPTABLE. However, you MAY give general strategy and explanations if the user asks a general knowledge/coding/marketing question.
2. **ALWAYS** cite specific numbers from the injected data *WHEN the user asks about their own website*. If the user asks about a different website or something you don't have data for, explicitly state: "I don't see that specific data in your currently connected dashboard" but then **still answer their question** to the best of your omniscient ability using reasoning and industry benchmarks. Do not end the conversation just because data is missing.
3. **EVERY** data-driven recommendation must have an estimated impact.
4. When you see a query with high impressions but low clicks, don't just say "optimize for this" — explain WHY it's underperforming (position? CTR gap? intent mismatch?).
5. Cross-reference GA4 + GSC whenever possible. The magic is in the INTERSECTION.
6. Think like a CEO, not a junior SEO. Revenue impact > vanity metrics.
7. If the user asks "how am I doing?" — give a letter grade (A through F) with specific justification for each area (Traffic, SEO, Engagement, Technical, Content).
8. Be conversational but authoritative. You're their trusted advisor, not a report generator.`;

// ═══════════════════════════════════════════════════════════════
// DATA CONTEXT BUILDER — Pre-computes patterns for the AI
// ═══════════════════════════════════════════════════════════════
function buildDataContext(analyticsContext: any, seoContext: any): string {
    let dataContext = '';

    if (analyticsContext) {
        dataContext += '\n\n═══ LIVE GOOGLE ANALYTICS 4 DATA ═══\n';
        if (analyticsContext.kpis) {
            const k = analyticsContext.kpis;
            dataContext += `\n📊 KPI DASHBOARD: \n`;
            dataContext += `  Users: ${k.totalUsers?.toLocaleString()} (${k.changeUsers > 0 ? '+' : ''}${k.changeUsers}% vs prev period) \n`;
            dataContext += `  Sessions: ${k.totalSessions?.toLocaleString()} (${k.changeSessions > 0 ? '+' : ''}${k.changeSessions}%) \n`;
            dataContext += `  Page Views: ${k.totalPageViews?.toLocaleString()} (${k.changePageViews > 0 ? '+' : ''}${k.changePageViews}%) \n`;
            dataContext += `  Bounce Rate: ${k.avgBounceRate}% (${k.changeBounceRate > 0 ? '+' : ''}${k.changeBounceRate}%) ${Number(k.avgBounceRate) > 55 ? '⚠️ HIGH' : Number(k.avgBounceRate) < 35 ? '✅ EXCELLENT' : ''} \n`;
            dataContext += `  Avg Session Duration: ${Math.floor((k.avgSessionDuration || 0) / 60)}m ${Math.round((k.avgSessionDuration || 0) % 60)}s ${(k.avgSessionDuration || 0) < 60 ? '🔴 CRITICAL' : (k.avgSessionDuration || 0) > 120 ? '✅ GOOD' : ''} \n`;
            dataContext += `  New Users: ${k.newUsers?.toLocaleString()} | Returning: ${k.returningUsers?.toLocaleString()} \n`;
            dataContext += `  Pages / Session: ${k.pagesPerSession} ${Number(k.pagesPerSession) < 1.5 ? '⚠️ LOW' : Number(k.pagesPerSession) > 3 ? '✅ EXCELLENT' : ''} \n`;
        }
        if (analyticsContext.topSources?.length) {
            dataContext += `\n🔗 Traffic Sources(${analyticsContext.topSources.length}): \n`;
            analyticsContext.topSources.forEach((s: any, i: number) => {
                dataContext += `  ${i + 1}. ${s.source} — ${s.sessions} sessions(${s.percentage} %) \n`;
            });
        }
        if (analyticsContext.topPages?.length) {
            dataContext += `\n📄 Top Pages — ANALYZE FOR HIDDEN GEMS(low traffic + high engagement) AND LEAKY BUCKETS(high traffic + poor engagement): \n`;
            analyticsContext.topPages.forEach((p: any, i: number) => {
                const bounceNum = parseFloat(p.bounceRate) || 0;
                const flag = bounceNum > 70 ? ' 🔴LEAKY' : bounceNum < 30 ? ' 🟢HIDDEN_GEM' : '';
                dataContext += `  ${i + 1}. ${p.page} — ${p.views} views, ${p.bounceRate}% bounce${p.avgTime ? ', avg ' + p.avgTime : ''}${flag} \n`;
            });
        }
        if (analyticsContext.topCountries?.length) {
            dataContext += `\n🌍 Countries(${analyticsContext.topCountries.length}): \n`;
            analyticsContext.topCountries.forEach((c: any, i: number) => {
                dataContext += `  ${i + 1}. ${c.country} — ${c.users} users${c.percentage ? ' (' + c.percentage + '%)' : ''} \n`;
            });
        }
        if (analyticsContext.devices?.length) {
            dataContext += `\n📱 Devices: ${analyticsContext.devices.map((d: any) => `${d.device}: ${d.percentage}%`).join(' | ')} \n`;
            // Check for mobile vs desktop disparity
            const mobile = analyticsContext.devices.find((d: any) => d.device?.toLowerCase() === 'mobile');
            const desktop = analyticsContext.devices.find((d: any) => d.device?.toLowerCase() === 'desktop');
            if (mobile && desktop) {
                dataContext += `  📌 Mobile / Desktop Split: ${mobile.percentage}% / ${desktop.percentage}%\n`;
            }
        }
        if (analyticsContext.browsers?.length) {
            dataContext += `🌐 Browsers: ${analyticsContext.browsers.map((b: any) => `${b.name}: ${b.percentage}%`).join(' | ')}\n`;
        }
        if (analyticsContext.channels?.length) {
            dataContext += `📡 Channels: ${analyticsContext.channels.map((c: any) => `${c.name}: ${c.value || c.percentage}${c.percentage ? '%' : ''}`).join(' | ')}\n`;
        }
        if (analyticsContext.referrers?.length) {
            dataContext += `\n🔀 Referrers (${analyticsContext.referrers.length}):\n`;
            analyticsContext.referrers.forEach((r: any, i: number) => {
                dataContext += `  ${i + 1}. ${r.name} — ${r.value} sessions\n`;
            });
        }
        if (analyticsContext.cities?.length) {
            dataContext += `\n🏙️ Cities: ${analyticsContext.cities.slice(0, 8).map((c: any) => `${c.city}, ${c.country} (${c.users})`).join(' | ')}\n`;
        }
        if (analyticsContext.languages?.length) {
            dataContext += `🗣️ Languages: ${analyticsContext.languages.slice(0, 8).map((l: any) => `${l.name}: ${l.value}`).join(' | ')}\n`;
        }
        if (analyticsContext.entryPages?.length) {
            dataContext += `\n🚪 Entry Pages — where users START their session:\n`;
            analyticsContext.entryPages.forEach((p: any, i: number) => {
                dataContext += `  ${i + 1}. ${p.page} — ${p.sessions} sessions, ${p.users || '?'} users, ${p.bounceRate || '?'}% bounce\n`;
            });
        }
        if (analyticsContext.operatingSystems?.length) {
            dataContext += `💻 OS: ${analyticsContext.operatingSystems.map((o: any) => `${o.name}: ${o.percentage || o.value}${o.percentage ? '%' : ''}`).join(' | ')}\n`;
        }
    }

    if (seoContext) {
        dataContext += '\n\n═══ LIVE GOOGLE SEARCH CONSOLE DATA ═══\n';
        if (seoContext.kpis) {
            const k = seoContext.kpis;
            dataContext += `\n🔍 Search Performance:\n`;
            dataContext += `  Total Clicks: ${k.totalClicks?.toLocaleString()} (${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}%)\n`;
            dataContext += `  Total Impressions: ${k.totalImpressions?.toLocaleString()} (${k.changeImpressions > 0 ? '+' : ''}${k.changeImpressions}%)\n`;
            dataContext += `  Average CTR: ${k.avgCTR}% (${k.changeCTR > 0 ? '+' : ''}${k.changeCTR}%)\n`;
            dataContext += `  Average Position: ${k.avgPosition} (${k.changePosition > 0 ? '+' : ''}${k.changePosition})\n`;
            if (k.indexedPages) dataContext += `  Indexed Pages: ${k.indexedPages}\n`;
            if (k.crawlErrors) dataContext += `  Crawl Errors: ${k.crawlErrors}\n`;
        }
        if (seoContext.topQueries?.length) {
            // Pre-compute patterns for the AI
            const strikingDistance: string[] = [];
            const ctrProblems: string[] = [];
            const ctrStars: string[] = [];

            dataContext += `\n🎯 Search Queries (${seoContext.topQueries.length}) — WITH PRE-COMPUTED INTELLIGENCE:\n`;
            seoContext.topQueries.forEach((q: any, i: number) => {
                const pos = parseFloat(q.position) || 50;
                const ctr = parseFloat(q.ctr) || 0;
                const impr = parseInt(q.impressions) || 0;
                const expectedCtr = pos <= 1 ? 30 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
                const ctrGap = (ctr - expectedCtr).toFixed(1);
                const potentialClicks = pos > 3 ? Math.round(impr * (0.11 - (ctr / 100))) : 0; // Clicks if moved to pos 3

                let flags = '';
                if (pos >= 8 && pos <= 20 && impr > 50) {
                    flags += ' ⚡STRIKING_DISTANCE';
                    strikingDistance.push(`"${q.query}" (pos ${pos}, ${impr} impr, potential +${potentialClicks} clicks)`);
                }
                if (Number(ctrGap) < -3) {
                    flags += ' ⚠️CTR_PROBLEM';
                    ctrProblems.push(`"${q.query}" (${ctr}% actual vs ${expectedCtr}% expected)`);
                }
                if (Number(ctrGap) > 2) {
                    flags += ' ⭐CTR_STAR';
                    ctrStars.push(`"${q.query}" (${ctr}% vs ${expectedCtr}% expected — great meta!)`);
                }

                dataContext += `  ${i + 1}. "${q.query}" — ${q.clicks} clicks, ${impr} impr, ${ctr}% CTR (expected: ~${expectedCtr}%, gap: ${ctrGap}%), pos ${pos}${potentialClicks > 0 ? ` [+${potentialClicks} clicks if pos 3]` : ''}${flags}\n`;
            });

            // Summary sections for the AI to use
            if (strikingDistance.length > 0) {
                dataContext += `\n🎯 STRIKING DISTANCE SUMMARY (${strikingDistance.length} queries):\n`;
                strikingDistance.forEach((s: string) => { dataContext += `  → ${s}\n`; });
            }
            if (ctrProblems.length > 0) {
                dataContext += `\n⚠️ CTR PROBLEMS (meta titles/descriptions need work, ${ctrProblems.length} queries):\n`;
                ctrProblems.forEach((s: string) => { dataContext += `  → ${s}\n`; });
            }
            if (ctrStars.length > 0) {
                dataContext += `\n⭐ CTR STARS (great meta, replicate this approach, ${ctrStars.length} queries):\n`;
                ctrStars.forEach((s: string) => { dataContext += `  → ${s}\n`; });
            }
        }
        if (seoContext.topPages?.length) {
            dataContext += `\n📊 Top Search Pages (${seoContext.topPages.length}):\n`;
            seoContext.topPages.forEach((p: any, i: number) => {
                dataContext += `  ${i + 1}. ${p.page} — ${p.clicks} clicks, ${p.impressions || '?'} impr, ${p.ctr || '?'}% CTR, pos ${p.position}${p.status === 'decay' ? ' 🔴DECAY' : p.status === 'warning' ? ' 🟡WARNING' : ''}\n`;
            });
        }
        if (seoContext.recommendations?.length) {
            dataContext += `\n💡 Pre-Generated Recommendations (${seoContext.recommendations.length}):\n`;
            seoContext.recommendations.forEach((r: any, i: number) => {
                dataContext += `  ${i + 1}. [${r.severity?.toUpperCase()}] ${r.title}\n`;
                if (r.description) dataContext += `     ${r.description}\n`;
                if (r.action) dataContext += `     Action: ${r.action}\n`;
                if (r.impact) dataContext += `     Est. Impact: ${r.impact}\n`;
            });
        }
    }

    return dataContext;
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
            body: JSON.stringify({ amount: 10 }),
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
            if (credits !== null && credits < 10) {
                return new Response(JSON.stringify({
                    error: 'insufficient_credits',
                    credits: credits,
                    response: `⚡ You've used all your credits! You have **${credits}** credits remaining, but each AI analysis costs **10 credits**.\n\n🛒 **Get more credits** to continue using TrafficClaw AI:\n- 💰 100 credits for just $1\n- 🔥 500 credits for $5 (save 50%)\n- 🚀 1,200 credits for $10 (best value)\n\nVisit your dashboard settings to purchase more credits.`
                }), { status: 402, headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (!GEMINI_API_KEY) {
            console.warn('[AI Chat] No GEMINI_API_KEY found. Using fallback.');
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

        // ── Get Available Sites Context ──
        let availableSitesContext = '';
        if (googleAccessToken || googleRefreshToken) {
            try {
                const token = await getValidAccessToken(googleAccessToken, googleRefreshToken);
                const sites = await listSearchConsoleSites(token);
                if (sites && sites.length > 0) {
                    const siteUrls = sites.map((s: any) => s.siteUrl).join(', ');
                    availableSitesContext = `\n\n[AVAILABLE SITES YOU CAN QUERY: ${siteUrls}]`;
                }
            } catch (e) {
                console.warn('[AI Chat] Failed to fetch site list for prompt injection', e);
            }
        }

        // User message with injected data context
        contents.push({
            role: 'user',
            parts: [{ text: dataContext ? `[LIVE DATA CONTEXT — USE THIS FOR YOUR ANALYSIS]${dataContext}${availableSitesContext}\n\n---\n\nUser: ${message}` : message + availableSitesContext }],
        });

        // ── Execute Gemini Stream ──
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const geminiUrl = `${GEMINI_URL}&key=${GEMINI_API_KEY}`;

                    const response = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                            contents,
                            tools: [{ function_declarations: AI_CHAT_TOOL_DECLARATIONS }],
                            generationConfig: {
                                temperature: 0.8, maxOutputTokens: 8192,
                            },
                        }),
                        signal: AbortSignal.timeout(60000), // 60s timeout
                    });

                    if (!response.ok) {
                        const errData = await response.text();
                        console.error('Gemini API error:', response.status, errData);
                        controller.enqueue(encodeSSE({ type: 'error', message: 'Failed to connect to AI service' }));
                        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                        controller.close();
                        return;
                    }

                    const reader = response.body?.getReader();
                    if (!reader) {
                        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                        controller.close();
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';
                    let fullText = '';
                    let pendingFunctionCalls: any[] = [];
                    let hasDeductedCredit = false;

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
                                    }).catch(console.error);
                                }

                                const parts = candidate.content?.parts || [];
                                const hasFunctionCall = parts.some((p: any) => p.functionCall);

                                for (const part of parts) {
                                    if (part.text) {
                                        if (!hasFunctionCall) {
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
                                        const isDup = pendingFunctionCalls.some(
                                            fc => fc.name === part.functionCall.name && JSON.stringify(fc.args) === JSON.stringify(part.functionCall.args)
                                        );
                                        if (!isDup) {
                                            pendingFunctionCalls.push(part.functionCall);
                                            controller.enqueue(encodeSSE({
                                                type: 'tool_start',
                                                name: part.functionCall.name,
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

                    // Handle tool execution loop
                    if (pendingFunctionCalls.length > 0) {
                        for (const fc of pendingFunctionCalls) {
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

                                const followUpContents = [
                                    ...contents,
                                    {
                                        role: 'model',
                                        parts: [
                                            ...(fullText ? [{ text: fullText }] : []),
                                            { functionCall: { name: fc.name, args: fc.args } },
                                        ],
                                    },
                                    {
                                        role: 'user',
                                        parts: [{
                                            functionResponse: { name: fc.name, response: toolResult },
                                        }],
                                    },
                                ];

                                const followResponse = await fetch(geminiUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                                        contents: followUpContents,
                                        generationConfig: {
                                            temperature: 0.8, maxOutputTokens: 8192,
                                        },
                                    }),
                                });

                                if (followResponse.ok) {
                                    const followReader = followResponse.body?.getReader();
                                    if (followReader) {
                                        let followBuffer = '';
                                        while (true) {
                                            const { done: fDone, value: fValue } = await followReader.read();
                                            if (fDone) break;

                                            followBuffer += decoder.decode(fValue, { stream: true });
                                            const fLines = followBuffer.split('\n');
                                            followBuffer = fLines.pop() || '';

                                            for (const fLine of fLines) {
                                                if (!fLine.startsWith('data: ')) continue;
                                                const fJson = fLine.slice(6).trim();
                                                if (!fJson || fJson === '[DONE]') continue;

                                                try {
                                                    const fParsed = JSON.parse(fJson);
                                                    const fParts = fParsed.candidates?.[0]?.content?.parts || [];
                                                    for (const fp of fParts) {
                                                        if (fp.text) {
                                                            controller.enqueue(encodeSSE({ type: 'text', content: fp.text }));
                                                        }
                                                    }
                                                } catch { /* ignore */ }
                                            }
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error('Tool execution error:', err);
                            }
                        }
                    }

                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error: any) {
                    console.error('Chat streaming error:', error);
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

    } catch (err) {
        console.error('AI Chat error:', err);
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
