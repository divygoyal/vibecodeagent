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

const SYSTEM_PROMPT = `You are GrowClaw's deep analytics intelligence — an expert-level SEO strategist, data analyst, and growth advisor with access to the user's real Google Analytics 4 and Google Search Console data. You think like a senior growth consultant at a top agency.

## Your Capabilities
1. **Deep Analytics Analysis** — Analyze traffic patterns, user segments, engagement metrics, conversion funnels, and behavioral data. Cross-reference dimensions (e.g., which countries have the worst bounce rates, which channels drive the most engaged users).
2. **Advanced SEO Intelligence** — Analyze search queries, click-through rates, average positions, impressions. Identify keyword cannibalization, content decay, ranking opportunities, and technical SEO issues.
3. **Actionable Growth Strategy** — Don't just report numbers. Provide specific, prioritized action items with estimated impact. Think like a consultant billing $500/hr.
4. **Trend Detection** — Spot patterns, anomalies, seasonal changes, and correlations across metrics. Flag things the user might miss.
5. **Competitive Insights** — Based on the data patterns, infer competitive positioning and suggest strategies.

## Response Style
- **Lead with the insight, not the number.** Instead of "Your bounce rate is 65%", say "Your bounce rate of 65% is significantly above the industry average of ~45%, suggesting your landing pages aren't matching search intent."
- **Be specific and data-driven.** Always cite exact numbers from the provided data. Cross-reference multiple dimensions.
- **Prioritize by impact.** Use 🔴 Critical, 🟡 Important, 🟢 Opportunity labels.
- **Give concrete next steps.** Not "improve your SEO" but "Target the keyword 'X' — you're at position 12 with 500 impressions but only 2% CTR. Optimizing your meta title could realistically 3x your clicks."
- **Use structured formatting:** Headers, bullet points, bold key metrics, tables when comparing data.
- **Be conversational but authoritative.** Sound like a brilliant analyst who genuinely cares about the user's growth.
- **When data is limited**, clearly state what you can and can't infer, and suggest specific actions to get better data.
- **Cross-analyze dimensions:** If asked about a country, also mention what devices/browsers/channels are popular there. If asked about a page, mention its SEO performance too.
- **Proactively surface insights** the user didn't ask about if the data reveals something important.`;

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
                    dataContext += `  ${i+1}. ${s.source} — ${s.sessions} sessions (${s.percentage}%)\n`;
                });
            }
            if (analyticsContext.topPages?.length) {
                dataContext += `\n📄 Top Pages (top ${analyticsContext.topPages.length}):\n`;
                analyticsContext.topPages.forEach((p: any, i: number) => {
                    dataContext += `  ${i+1}. ${p.page} — ${p.views} views, ${p.bounceRate}% bounce${p.avgTime ? ', avg ' + p.avgTime : ''}\n`;
                });
            }
            if (analyticsContext.topCountries?.length) {
                dataContext += `\n🌍 Countries (top ${analyticsContext.topCountries.length}):\n`;
                analyticsContext.topCountries.forEach((c: any, i: number) => {
                    dataContext += `  ${i+1}. ${c.country} — ${c.users} users${c.percentage ? ' (' + c.percentage + '%)' : ''}\n`;
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
                    dataContext += `  ${i+1}. ${r.name} — ${r.value} sessions\n`;
                });
            }
            if (analyticsContext.cities?.length) {
                dataContext += `\n🏙️ Cities: ${analyticsContext.cities.slice(0, 8).map((c: any) => `${c.city}, ${c.country} (${c.users})`).join(' | ')}\n`;
            }
            if (analyticsContext.languages?.length) {
                dataContext += `🗣️ Languages: ${analyticsContext.languages.slice(0, 5).map((l: any) => `${l.name}: ${l.value}`).join(' | ')}\n`;
            }
        }
        if (seoContext) {
            dataContext += '\n═══ GOOGLE SEARCH CONSOLE DATA ═══\n';
            if (seoContext.kpis) {
                const k = seoContext.kpis;
                dataContext += `\n🔍 Search Performance:\n`;
                dataContext += `  Total Clicks: ${k.totalClicks?.toLocaleString()} (${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}%)\n`;
                dataContext += `  Total Impressions: ${k.totalImpressions?.toLocaleString()}\n`;
                dataContext += `  Average CTR: ${k.avgCTR}%\n`;
                dataContext += `  Average Position: ${k.avgPosition}\n`;
                if (k.indexedPages) dataContext += `  Indexed Pages: ${k.indexedPages}\n`;
                if (k.crawlErrors) dataContext += `  Crawl Errors: ${k.crawlErrors}\n`;
            }
            if (seoContext.topQueries?.length) {
                dataContext += `\n🎯 Search Queries (top ${seoContext.topQueries.length}):\n`;
                seoContext.topQueries.forEach((q: any, i: number) => {
                    dataContext += `  ${i+1}. "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, ${q.ctr || '?'}% CTR, pos ${q.position}\n`;
                });
            }
            if (seoContext.topPages?.length) {
                dataContext += `\n📊 Top Search Pages (top ${seoContext.topPages.length}):\n`;
                seoContext.topPages.forEach((p: any, i: number) => {
                    dataContext += `  ${i+1}. ${p.page} — ${p.clicks} clicks, pos ${p.position}\n`;
                });
            }
            if (seoContext.recommendations?.length) {
                dataContext += `\n💡 Active Recommendations: ${seoContext.recommendations.map((r: any) => `[${r.severity}] ${r.title}`).join('; ')}\n`;
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
                    temperature: 0.75,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048,
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
        return `Based on your data, your average bounce rate is ${analytics.kpis.avgBounceRate}%.\n\n${
            pages.length > 0
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
