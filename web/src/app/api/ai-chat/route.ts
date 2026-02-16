import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are an expert AI SEO Advisor and Analytics Assistant for GrowClaw, an all-in-one SEO and analytics platform. Your role is to:

1. Analyze the user's website analytics data and provide actionable insights
2. Suggest SEO improvements based on their data
3. Answer questions about their traffic, conversions, and user behavior
4. Recommend content strategies based on top-performing pages and keywords
5. Identify growth opportunities and potential issues
6. Compare metrics and explain trends

Guidelines:
- Be concise but thorough. Use bullet points for readability.
- Always reference specific numbers from the data when available.
- Provide actionable recommendations, not just observations.
- If you don't have enough data, say so and suggest what data would help.
- Use a professional but friendly tone.
- Format responses with markdown-like structure (bold key points, use lists).
- When suggesting improvements, prioritize by potential impact.`;

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
            return NextResponse.json({
                response: generateFallbackResponse(message, analyticsContext, seoContext),
            });
        }

        // Build context from analytics data
        let dataContext = '';
        if (analyticsContext) {
            dataContext += '\n\n--- ANALYTICS DATA ---\n';
            if (analyticsContext.kpis) {
                const k = analyticsContext.kpis;
                dataContext += `KPIs: ${k.totalUsers?.toLocaleString()} users (${k.changeUsers > 0 ? '+' : ''}${k.changeUsers}%), ${k.totalSessions?.toLocaleString()} sessions, ${k.totalPageViews?.toLocaleString()} pageviews, ${k.avgBounceRate}% bounce rate, avg session ${Math.floor((k.avgSessionDuration || 0) / 60)}m ${(k.avgSessionDuration || 0) % 60}s\n`;
            }
            if (analyticsContext.topSources?.length) {
                dataContext += `Top Sources: ${analyticsContext.topSources.map((s: any) => `${s.source} (${s.sessions} sessions, ${s.percentage}%)`).join(', ')}\n`;
            }
            if (analyticsContext.topPages?.length) {
                dataContext += `Top Pages: ${analyticsContext.topPages.map((p: any) => `${p.page} (${p.views} views, ${p.bounceRate}% bounce)`).join(', ')}\n`;
            }
            if (analyticsContext.topCountries?.length) {
                dataContext += `Top Countries: ${analyticsContext.topCountries.map((c: any) => `${c.country} (${c.users} users)`).join(', ')}\n`;
            }
            if (analyticsContext.devices?.length) {
                dataContext += `Devices: ${analyticsContext.devices.map((d: any) => `${d.device} (${d.percentage}%)`).join(', ')}\n`;
            }
            if (analyticsContext.browsers?.length) {
                dataContext += `Browsers: ${analyticsContext.browsers.map((b: any) => `${b.name} (${b.percentage}%)`).join(', ')}\n`;
            }
            if (analyticsContext.channels?.length) {
                dataContext += `Channels: ${analyticsContext.channels.map((c: any) => `${c.name} (${c.percentage}%)`).join(', ')}\n`;
            }
        }
        if (seoContext) {
            dataContext += '\n--- SEO DATA ---\n';
            if (seoContext.kpis) {
                const k = seoContext.kpis;
                dataContext += `SEO KPIs: ${k.totalClicks} clicks (${k.changeClicks > 0 ? '+' : ''}${k.changeClicks}%), ${k.totalImpressions} impressions, ${k.avgCTR}% CTR, avg position ${k.avgPosition}\n`;
            }
            if (seoContext.topQueries?.length) {
                dataContext += `Top Queries: ${seoContext.topQueries.map((q: any) => `"${q.query}" (${q.clicks} clicks, pos ${q.position})`).join(', ')}\n`;
            }
            if (seoContext.recommendations?.length) {
                dataContext += `Recommendations: ${seoContext.recommendations.map((r: any) => r.title).join('; ')}\n`;
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
                    maxOutputTokens: 1024,
                },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Gemini API error:', res.status, errText);
            return NextResponse.json({
                response: generateFallbackResponse(message, analyticsContext, seoContext),
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
function generateFallbackResponse(message: string, analytics: any, seo: any): string {
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

    return `I'd be happy to help you analyze your website performance! Here's what I can assist with:\n\n- **Traffic Analysis** — Understanding your visitor patterns\n- **SEO Recommendations** — Improving search rankings\n- **Content Strategy** — What to write next\n- **Technical SEO** — Site health and performance\n- **Competitor Insights** — How to outperform competitors\n\nTry asking specific questions like "Which pages have the highest bounce rate?" or "How can I improve my organic traffic?"\n\n*Note: For AI-powered responses, configure your GEMINI_API_KEY in the environment variables.*`;
}
