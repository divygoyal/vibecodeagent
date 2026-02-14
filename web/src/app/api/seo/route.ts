import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const dynamic = 'force-dynamic';

// ============= Mock data for local development only =============

function generateMockQueries() {
    return [
        { query: 'growclaw seo tool', clicks: 892, impressions: 12400, ctr: 7.2, position: 3.2 },
        { query: 'automated seo bot', clicks: 634, impressions: 9800, ctr: 6.5, position: 4.1 },
        { query: 'telegram analytics bot', clicks: 521, impressions: 7650, ctr: 6.8, position: 5.3 },
        { query: 'google analytics automation', clicks: 456, impressions: 8900, ctr: 5.1, position: 6.7 },
        { query: 'seo content decay', clicks: 389, impressions: 5430, ctr: 7.2, position: 4.8 },
        { query: 'website growth automation', clicks: 312, impressions: 4567, ctr: 6.8, position: 7.2 },
        { query: 'search console api tool', clicks: 278, impressions: 3890, ctr: 7.1, position: 5.9 },
        { query: 'ai seo recommendations', clicks: 245, impressions: 4120, ctr: 5.9, position: 8.4 },
        { query: 'keyword gap analysis tool', clicks: 198, impressions: 3450, ctr: 5.7, position: 9.1 },
        { query: 'automated code fixes seo', clicks: 156, impressions: 2890, ctr: 5.4, position: 10.3 },
        { query: 'google analytics telegram', clicks: 134, impressions: 2340, ctr: 5.7, position: 8.8 },
        { query: 'seo bot github', clicks: 112, impressions: 1980, ctr: 5.7, position: 11.2 },
    ];
}

function generateMockSEOPages() {
    return [
        { page: '/docs/getting-started', clicks: 2134, impressions: 18900, ctr: 11.3, position: 2.1, status: 'healthy' },
        { page: '/blog/seo-automation', clicks: 1567, impressions: 15600, ctr: 10.0, position: 3.4, status: 'healthy' },
        { page: '/features', clicks: 1234, impressions: 12300, ctr: 10.0, position: 4.2, status: 'healthy' },
        { page: '/pricing', clicks: 987, impressions: 11200, ctr: 8.8, position: 5.6, status: 'warning' },
        { page: '/blog/analytics-tips', clicks: 756, impressions: 9800, ctr: 7.7, position: 6.8, status: 'healthy' },
        { page: '/', clicks: 654, impressions: 24500, ctr: 2.7, position: 8.9, status: 'warning' },
        { page: '/docs/api', clicks: 543, impressions: 6700, ctr: 8.1, position: 7.3, status: 'healthy' },
        { page: '/blog/keyword-research', clicks: 432, impressions: 5430, ctr: 8.0, position: 9.1, status: 'decay' },
        { page: '/changelog', clicks: 321, impressions: 4560, ctr: 7.0, position: 10.4, status: 'healthy' },
        { page: '/contact', clicks: 198, impressions: 3200, ctr: 6.2, position: 12.1, status: 'decay' },
    ];
}

function generateMockAIRecommendations() {
    return [
        {
            id: 'rec-1',
            type: 'content_decay',
            severity: 'high',
            title: 'Content decay detected on /blog/keyword-research',
            description: 'This page lost 32% of its organic traffic in the last 30 days. The content was last updated 4 months ago.',
            action: 'Update content with fresh data, add new sections, refresh publish date.',
            impact: '+340 clicks/month',
            page: '/blog/keyword-research',
        },
        {
            id: 'rec-2',
            type: 'keyword_gap',
            severity: 'medium',
            title: 'Keyword opportunity: "ai seo automation"',
            description: 'Your competitors rank #1-5 for this keyword (880 searches/mo) but you don\'t have dedicated content.',
            action: 'Create a targeted blog post or landing page optimized for this keyword.',
            impact: '+520 clicks/month',
            page: null,
        },
        {
            id: 'rec-3',
            type: 'technical',
            severity: 'high',
            title: 'Homepage CTR critically low (2.7%)',
            description: 'Your homepage gets 24,500 impressions but only 654 clicks. The average CTR for position ~9 is 4.5%.',
            action: 'Rewrite the meta title and description to be more compelling. Consider adding FAQ schema.',
            impact: '+450 clicks/month',
            page: '/',
        },
        {
            id: 'rec-4',
            type: 'cannibalization',
            severity: 'medium',
            title: 'Keyword cannibalization: "seo automation"',
            description: 'Two pages compete for this keyword: /blog/seo-automation and /features. Google is splitting ranking.',
            action: 'Consolidate content or add canonical tags. Make /features target broader terms.',
            impact: '+280 clicks/month',
            page: '/features',
        },
        {
            id: 'rec-5',
            type: 'opportunity',
            severity: 'low',
            title: 'Quick win: "search console api tool" at position 5.9',
            description: 'You\'re already ranking on page 1 for this query. Small optimizations could push you to top 3.',
            action: 'Add internal links from high-authority pages. Optimize H1 and meta description.',
            impact: '+180 clicks/month',
            page: '/docs/api',
        },
    ];
}

function generateMockSEOKPIs() {
    return {
        totalClicks: 9421,
        totalImpressions: 128900,
        avgCTR: 7.3,
        avgPosition: 6.8,
        indexedPages: 47,
        crawlErrors: 3,
        changeClicks: 14.2,
        changeImpressions: 8.9,
        changeCTR: 1.3,
        changePosition: -0.8,
    };
}

function generateMockSearchTrend() {
    const data = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        data.push({
            date: d.toISOString().split('T')[0],
            clicks: 250 + Math.floor(Math.random() * 150),
            impressions: 3500 + Math.floor(Math.random() * 1500),
            ctr: +(5.5 + Math.random() * 4).toFixed(1),
            position: +(5 + Math.random() * 4).toFixed(1),
        });
    }
    return data;
}

// ============= Route handler =============

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const section = searchParams.get('section') || 'all'

    const isProduction = !!ADMIN_API_KEY

    const session = await getServerSession(authOptions)
    if (isProduction && !session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        if (isProduction && session?.user) {
            // @ts-expect-error - id added in callbacks
            const githubId = session.user.id

            let siteUrl = searchParams.get('siteUrl')

            if (!siteUrl) {
                try {
                    const listRes = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/exec`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-API-Key": ADMIN_API_KEY },
                        body: JSON.stringify({
                            plugin: "google-search-console",
                            command: "list-sites-json",
                            args: []
                        }),
                        cache: 'no-store'
                    })

                    if (listRes.ok) {
                        const listData = await listRes.json()

                        // Check for plugin error response
                        if (listData.status === "ok" && listData.data && !Array.isArray(listData.data) && (listData.data as any).error) {
                            console.error("SEO plugin error:", (listData.data as any).error);
                            return NextResponse.json({ error: (listData.data as any).error }, { status: 502 });
                        }

                        if (listData.status === "ok" && Array.isArray(listData.data) && listData.data.length > 0) {
                            siteUrl = listData.data[0].siteUrl
                        }
                    }
                } catch (e) {
                    console.warn("Failed to auto-detect GSC site:", e)
                }
            }

            if (!siteUrl) {
                return NextResponse.json(
                    { error: "No Google Search Console site found. Please connect Search Console in your integrations." },
                    { status: 404 }
                )
            }

            const response = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/exec`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": ADMIN_API_KEY
                },
                body: JSON.stringify({
                    plugin: "google-search-console",
                    command: "dashboard-json",
                    args: [siteUrl],
                    options: {}
                }),
                cache: 'no-store'
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('SEO admin API error:', response.status, errorText)
                return NextResponse.json(
                    { error: "Failed to fetch SEO data from Google" },
                    { status: 502 }
                )
            }

            const adminData = await response.json()

            if (adminData.status === "ok" && adminData.data && typeof adminData.data === 'object') {
                return NextResponse.json(adminData.data)
            }

            console.error('SEO plugin error:', adminData.stderr || 'Unknown error')
            return NextResponse.json(
                { error: adminData.stderr || "SEO plugin returned unexpected data" },
                { status: 502 }
            )
        }

        // Dev mode only: return mock data
        const result: Record<string, unknown> = {}

        if (section === 'all' || section === 'kpis') result.kpis = generateMockSEOKPIs()
        if (section === 'all' || section === 'queries') result.queries = generateMockQueries()
        if (section === 'all' || section === 'pages') result.pages = generateMockSEOPages()
        if (section === 'all' || section === 'recommendations') result.recommendations = generateMockAIRecommendations()
        if (section === 'all' || section === 'trend') result.trend = generateMockSearchTrend()

        return NextResponse.json(result)

    } catch (err: unknown) {
        const error = err as Error
        console.error('SEO API error:', error.message)
        return NextResponse.json({ error: 'Failed to fetch SEO data' }, { status: 500 })
    }
}
