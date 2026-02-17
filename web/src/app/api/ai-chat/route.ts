import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Debug: log whether key is present at startup (not the key itself)
if (typeof globalThis !== 'undefined') {
    console.log('[AI Chat] GEMINI_API_KEY configured:', !!GEMINI_API_KEY, 'length:', GEMINI_API_KEY.length);
}

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are TrafficClaw AI — the most advanced SEO & Analytics intelligence system. You operate like a $500/hr senior growth consultant with 15 years of experience at elite agencies. You have LIVE access to the user's real Google Analytics 4 (GA4) and Google Search Console (GSC) data.

## Core Identity
You are not a generic chatbot. You are a specialized SEO strategist, data scientist, and growth architect. Every response should demonstrate deep domain expertise that makes the user feel like they have an unfair advantage.

## Your Expert Capabilities

### 1. Search Console Deep Analysis
- **Keyword Cannibalization Detection**: When multiple pages rank for the same query, identify which page should be the canonical target and recommend consolidation strategies.
- **Content Decay Detection**: Identify pages losing clicks/impressions over time. Flag queries where position is slipping (e.g., moved from position 5 to 12).
- **Striking Distance Keywords**: Find queries ranking positions 8-20 with high impressions — these are your biggest quick wins. Calculate estimated click gain if moved to top 3.
- **CTR Optimization**: Compare actual CTR vs expected CTR for each position. If a page at position 3 has 2% CTR but expected is ~8%, the meta title/description needs work.
- **Zero-Click Analysis**: High impressions but near-zero clicks = featured snippet opportunity or poor meta data.
- **Query Intent Classification**: Classify queries as Informational, Transactional, Commercial, or Navigational. Ensure content matches intent.
- **Page-Level Query Mapping**: Analyze which queries drive traffic to which pages. Identify pages ranking for irrelevant queries.

### 2. Analytics Intelligence
- **Engagement Scoring**: Cross-reference bounce rate, session duration, pages/session to score page engagement quality.
- **Traffic Source ROI**: Analyze which channels drive the most engaged users (not just volume). A channel with 100 users and 5min avg session > channel with 1000 users and 10sec.
- **Geographic Opportunity**: Identify high-performing countries/cities and recommend localization or targeting strategies.
- **Device-Specific Issues**: If mobile bounce rate is 80% but desktop is 30%, there's a mobile UX problem.
- **Content Performance Matrix**: Map pages by traffic volume vs engagement to find "hidden gems" (low traffic, high engagement) and "leaky buckets" (high traffic, poor engagement).

### 3. Actionable Growth Strategies
- **Internal Linking Opportunities**: Based on top pages and queries, suggest specific internal links between related content.
- **Content Gap Analysis**: Based on existing queries and pages, identify topics the site should cover but doesn't.
- **Programmatic SEO Patterns**: If the site has repeating URL patterns, suggest ways to scale with programmatic pages.
- **Conversion Funnel Optimization**: Trace the user journey from entry to key pages, identify drop-off points.
- **Competitor Inference**: From query data, infer what competitors are doing and where opportunities exist.

### 4. Advanced Pattern Detection
- **Seasonal Trends**: Identify cyclical patterns in traffic and suggest content calendar adjustments.
- **Anomaly Detection**: Spot sudden traffic drops/spikes and correlate with algorithm updates, technical issues, or viral content.
- **Growth Trajectory**: Project future traffic based on current trends and suggest acceleration strategies.

## Response Framework
For EVERY response, follow this structure:

1. **Lead with the Insight** — Start with the most impactful finding, not a summary of what you'll do.
2. **Show the Evidence** — Cite exact numbers from the data. Use comparisons (vs. previous period, vs. industry benchmarks).
3. **Explain the "So What"** — Why does this matter? What's the business impact?
4. **Give the Action Plan** — Specific, prioritized steps with estimated impact.
5. **Proactive Discovery** — Always mention 1-2 additional insights you noticed, even if not asked.

## Formatting Rules
- Use priority labels: 🔴 **Critical** (fix now), 🟡 **Important** (this week), 🟢 **Opportunity** (growth potential)
- Bold key metrics and numbers
- Use tables for data comparisons (3+ items)
- Include estimated impact where possible (e.g., "+300 clicks/month")
- Keep paragraphs short (2-3 sentences max)
- Use headers to organize sections
- End with a clear "Next Steps" section

## Expert Benchmarks (use for context)
- Average organic CTR by position: #1: 28%, #2: 15%, #3: 11%, #4: 8%, #5: 7%, #6: 5%, #7: 4%, #8: 3%, #9: 2.5%, #10: 2%
- Good bounce rate: <40% (excellent), 40-55% (average), 55-70% (needs work), >70% (critical)
- Good avg session duration: >2min (good), 1-2min (average), <1min (poor)
- Good pages/session: >3 (excellent), 2-3 (good), 1-2 (needs improvement)
- Mobile traffic benchmark: typically 55-65% for most industries

## Important Rules
- NEVER give generic advice. Every recommendation must reference the user's actual data.
- If you don't have enough data for a specific analysis, say so clearly and explain what data would help.
- When the user asks a simple question, still provide expert-level depth. Turn "what's my bounce rate?" into a full engagement health analysis.
- Cross-reference GA4 and GSC data whenever possible (e.g., "Your top GSC query drives traffic to /blog/x, but that page has a 78% bounce rate in GA4 — there's an intent mismatch").
- Think in terms of REVENUE IMPACT, not just traffic numbers.`;

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, analyticsContext, seoContext, history } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        if (!GEMINI_API_KEY) {
            console.warn('[AI Chat] No GEMINI_API_KEY found in environment. Using fallback responses.');
            return NextResponse.json({
                response: generateFallbackResponse(message, analyticsContext, seoContext, false),
            });
        }

        // Build rich context from analytics data
        let dataContext = '';
        if (analyticsContext) {
            dataContext += '\n\n═══ GOOGLE ANALYTICS 4 DATA ═══\n';
            if (analyticsContext.kpis) {
                const k = analyticsContext.kpis;
                dataContext += `\n📊 KPI Summary:\n`;
                dataContext += `  Users: ${k.totalUsers?.toLocaleString()} (${k.changeUsers > 0 ? '+' : ''}${k.changeUsers}% vs previous period)\n`;
                dataContext += `  Sessions: ${k.totalSessions?.toLocaleString()} (${k.changeSessions > 0 ? '+' : ''}${k.changeSessions}%)\n`;
                dataContext += `  Page Views: ${k.totalPageViews?.toLocaleString()} (${k.changePageViews > 0 ? '+' : ''}${k.changePageViews}%)\n`;
                dataContext += `  Bounce Rate: ${k.avgBounceRate}% (${k.changeBounceRate > 0 ? '+' : ''}${k.changeBounceRate}%)\n`;
                dataContext += `  Avg Session Duration: ${Math.floor((k.avgSessionDuration || 0) / 60)}m ${Math.round((k.avgSessionDuration || 0) % 60)}s\n`;
                dataContext += `  New Users: ${k.newUsers?.toLocaleString()} | Returning: ${k.returningUsers?.toLocaleString()}\n`;
                dataContext += `  Pages/Session: ${k.pagesPerSession}\n`;
            }
            if (analyticsContext.topSources?.length) {
                dataContext += `\n🔗 Traffic Sources (top ${analyticsContext.topSources.length}):\n`;
                analyticsContext.topSources.forEach((s: any, i: number) => {
                    dataContext += `  ${i + 1}. ${s.source} — ${s.sessions} sessions (${s.percentage}%)\n`;
                });
            }
            if (analyticsContext.topPages?.length) {
                dataContext += `\n📄 Top Pages (top ${analyticsContext.topPages.length}):\n`;
                analyticsContext.topPages.forEach((p: any, i: number) => {
                    dataContext += `  ${i + 1}. ${p.page} — ${p.views} views, ${p.bounceRate}% bounce${p.avgTime ? ', avg ' + p.avgTime : ''}\n`;
                });
            }
            if (analyticsContext.topCountries?.length) {
                dataContext += `\n🌍 Countries (top ${analyticsContext.topCountries.length}):\n`;
                analyticsContext.topCountries.forEach((c: any, i: number) => {
                    dataContext += `  ${i + 1}. ${c.country} — ${c.users} users${c.percentage ? ' (' + c.percentage + '%)' : ''}\n`;
                });
            }
            if (analyticsContext.devices?.length) {
                dataContext += `\n📱 Devices: ${analyticsContext.devices.map((d: any) => `${d.device}: ${d.percentage}%`).join(' | ')}\n`;
            }
            if (analyticsContext.browsers?.length) {
                dataContext += `🌐 Browsers: ${analyticsContext.browsers.map((b: any) => `${b.name}: ${b.percentage}%`).join(' | ')}\n`;
            }
            if (analyticsContext.channels?.length) {
                dataContext += `📡 Channels: ${analyticsContext.channels.map((c: any) => `${c.name}: ${c.value || c.percentage}${c.percentage ? '%' : ''}`).join(' | ')}\n`;
            }
            if (analyticsContext.referrers?.length) {
                dataContext += `\n🔀 Referrers (top ${analyticsContext.referrers.length}):\n`;
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
                dataContext += `\n🚪 Entry Pages (${analyticsContext.entryPages.length}) — pages where users START their session:\n`;
                analyticsContext.entryPages.forEach((p: any, i: number) => {
                    dataContext += `  ${i + 1}. ${p.page} — ${p.sessions} sessions, ${p.users || '?'} users, ${p.bounceRate || '?'}% bounce\n`;
                });
            }
            if (analyticsContext.operatingSystems?.length) {
                dataContext += `💻 Operating Systems: ${analyticsContext.operatingSystems.map((o: any) => `${o.name}: ${o.percentage || o.value}${o.percentage ? '%' : ''}`).join(' | ')}\n`;
            }
        }
        if (seoContext) {
            dataContext += '\n\n═══ GOOGLE SEARCH CONSOLE DATA ═══\n';
            if (seoContext.kpis) {
                const k = seoContext.kpis;
                dataContext += `\n🔍 Search Performance Overview:\n`;
                dataContext += `  Total Clicks: ${k.totalClicks?.toLocaleString()} (${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}% vs previous period)\n`;
                dataContext += `  Total Impressions: ${k.totalImpressions?.toLocaleString()} (${k.changeImpressions > 0 ? '+' : ''}${k.changeImpressions}%)\n`;
                dataContext += `  Average CTR: ${k.avgCTR}% (${k.changeCTR > 0 ? '+' : ''}${k.changeCTR}%)\n`;
                dataContext += `  Average Position: ${k.avgPosition} (${k.changePosition > 0 ? '+' : ''}${k.changePosition} change)\n`;
                if (k.indexedPages) dataContext += `  Indexed Pages: ${k.indexedPages}\n`;
                if (k.crawlErrors) dataContext += `  Crawl Errors: ${k.crawlErrors}\n`;
            }
            if (seoContext.topQueries?.length) {
                dataContext += `\n🎯 Search Queries (${seoContext.topQueries.length} queries) — ANALYZE FOR: striking distance (pos 8-20, high impressions), CTR gaps (actual vs expected for position), cannibalization (similar queries going to different pages):\n`;
                seoContext.topQueries.forEach((q: any, i: number) => {
                    const expectedCtr = q.position <= 1 ? 28 : q.position <= 2 ? 15 : q.position <= 3 ? 11 : q.position <= 5 ? 7.5 : q.position <= 7 ? 4.5 : q.position <= 10 ? 2.5 : 1;
                    const ctrGap = ((q.ctr || 0) - expectedCtr).toFixed(1);
                    dataContext += `  ${i + 1}. "${q.query}" — ${q.clicks} clicks, ${q.impressions} impr, ${q.ctr || 0}% CTR (expected: ~${expectedCtr}%, gap: ${ctrGap}%), pos ${q.position}${q.position >= 8 && q.position <= 20 && q.impressions > 100 ? ' ⚡STRIKING DISTANCE' : ''}${Number(ctrGap) < -3 ? ' ⚠️CTR BELOW EXPECTED' : ''}\n`;
                });
            }
            if (seoContext.topPages?.length) {
                dataContext += `\n📊 Top Search Pages (${seoContext.topPages.length} pages) — ANALYZE FOR: content decay (high impressions but low clicks), pages that need content refresh:\n`;
                seoContext.topPages.forEach((p: any, i: number) => {
                    dataContext += `  ${i + 1}. ${p.page} — ${p.clicks} clicks, ${p.impressions || '?'} impr, ${p.ctr || '?'}% CTR, pos ${p.position}${p.status === 'decay' ? ' 🔴CONTENT DECAY' : p.status === 'warning' ? ' 🟡WARNING' : ''}\n`;
                });
            }
            if (seoContext.recommendations?.length) {
                dataContext += `\n💡 AI-Generated SEO Recommendations (${seoContext.recommendations.length}):\n`;
                seoContext.recommendations.forEach((r: any, i: number) => {
                    dataContext += `  ${i + 1}. [${r.severity?.toUpperCase()}] ${r.title}\n`;
                    if (r.description) dataContext += `     ${r.description}\n`;
                    if (r.action) dataContext += `     Action: ${r.action}\n`;
                    if (r.impact) dataContext += `     Est. Impact: ${r.impact}\n`;
                });
            }
        }

        // Build messages for Gemini
        const contents = [];

        // Add conversation history
        if (history?.length) {
            for (const msg of history) {
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                });
            }
        }

        // Add current message with context
        contents.push({
            role: 'user',
            parts: [{ text: `${SYSTEM_PROMPT}\n\nUser's website data:${dataContext}\n\nUser question: ${message}` }],
        });

        const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Gemini API error:', res.status, errText);
            return NextResponse.json({
                response: `I encountered an error connecting to the AI service (${res.status}). Please verify your GEMINI_API_KEY is valid.\n\nIn the meantime, here's what I can tell you:\n\n${generateFallbackResponse(message, analyticsContext, seoContext, true)}`,
            });
        }

        const data = await res.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response. Please try again.';

        return NextResponse.json({ response: responseText });

    } catch (err) {
        console.error('AI Chat error:', err);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
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
            return `Your top traffic sources:\n${analytics.topSources.map((s: any, i: number) => `${i + 1}. ${s.source} — ${s.sessions} sessions (${s.percentage}%)`).join('\n')}\n\nTo grow traffic:\n- Focus on your top-performing channels\n- Diversify traffic sources to reduce dependency\n- Consider investing in underperforming high-potential channels`;
        }
    }

    if (msg.includes('seo') || msg.includes('ranking') || msg.includes('improve')) {
        return `Here are key SEO improvement strategies:\n\n1. **Content Quality** — Create comprehensive, original content targeting user intent\n2. **Technical SEO** — Ensure fast load times, mobile-friendliness, and proper indexing\n3. **Internal Linking** — Build a strong internal link structure\n4. **Backlinks** — Earn quality backlinks through outreach and content marketing\n5. **Keywords** — Target long-tail keywords with lower competition\n6. **User Experience** — Reduce bounce rate and increase time on site\n\nWould you like me to dive deeper into any of these areas?`;
    }

    if (msg.includes('country') || msg.includes('countries') || msg.includes('geo')) {
        if (analytics?.topCountries?.length) {
            return `Your top countries by users:\n${analytics.topCountries.map((c: any, i: number) => `${i + 1}. ${c.country} — ${c.users} users`).join('\n')}\n\nConsider:\n- Localizing content for top markets\n- Adjusting posting times for key timezones\n- Creating region-specific landing pages`;
        }
    }

    if (msg.includes('content') || msg.includes('idea') || msg.includes('suggest')) {
        return `Content strategy recommendations:\n\n1. **Analyze top pages** — Create more content similar to your best-performing pages\n2. **Gap analysis** — Find topics your competitors rank for that you don't\n3. **Update old content** — Refresh outdated articles with new data\n4. **Long-form guides** — Create comprehensive guides for your key topics\n5. **FAQ content** — Answer common questions in your niche\n6. **Video & visual content** — Diversify content formats\n\nWould you like specific suggestions based on your top-performing pages?`;
    }

    if (msg.includes('mobile') || msg.includes('desktop') || msg.includes('device')) {
        if (analytics?.devices?.length) {
            return `Device breakdown:\n${analytics.devices.map((d: any) => `- ${d.device}: ${d.percentage}% of sessions`).join('\n')}\n\nRecommendations:\n- Ensure responsive design across all devices\n- Optimize for the dominant device category\n- Test user flows on mobile devices\n- Consider AMP for mobile pages if mobile traffic is high`;
        }
    }

    const hint = hasKey
        ? '\n\n*Your GEMINI_API_KEY is configured but the AI service returned an error. Check the server logs for details.*'
        : '\n\n*Note: Add GEMINI_API_KEY to your environment variables (and ensure the web container has it in docker-compose.yml) for AI-powered responses.*';

    return `I can help you analyze your website performance! Try asking about:\n\n- **Bounce rates** — "Which pages have the highest bounce rate?"
- **Traffic sources** — "What are my top traffic sources?"
- **SEO tips** — "How can I improve my ranking?"
- **Geo data** — "Which countries bring the most users?"
- **Devices** — "How is my mobile vs desktop traffic?"${hint}`;
}
