import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const dynamic = 'force-dynamic';

// ============= Mock data for local development only =============

function generateMockTrafficData() {
    const data = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const base = 800 + Math.floor(Math.random() * 400);
        data.push({
            date: d.toISOString().split('T')[0],
            activeUsers: base + Math.floor(Math.random() * 200),
            sessions: base + 100 + Math.floor(Math.random() * 300),
            pageViews: (base + 200) * 2 + Math.floor(Math.random() * 500),
            bounceRate: +(35 + Math.random() * 20).toFixed(1),
            avgSessionDuration: +(120 + Math.random() * 180).toFixed(0),
        });
    }
    return data;
}

function generateMockSources() {
    return [
        { source: 'Google / Organic', sessions: 4821, percentage: 42.3 },
        { source: 'Direct', sessions: 2134, percentage: 18.7 },
        { source: 'GitHub Referral', sessions: 1567, percentage: 13.7 },
        { source: 'Twitter / Social', sessions: 1023, percentage: 9.0 },
        { source: 'LinkedIn / Social', sessions: 834, percentage: 7.3 },
        { source: 'Newsletter / Email', sessions: 612, percentage: 5.4 },
        { source: 'Other', sessions: 413, percentage: 3.6 },
    ];
}

function generateMockTopPages() {
    return [
        { page: '/', title: 'Homepage', views: 8432, uniqueViews: 6211, avgTime: '2:34', bounceRate: 32.1 },
        { page: '/docs/getting-started', title: 'Getting Started', views: 3456, uniqueViews: 2891, avgTime: '4:12', bounceRate: 18.5 },
        { page: '/pricing', title: 'Pricing', views: 2890, uniqueViews: 2456, avgTime: '1:45', bounceRate: 41.2 },
        { page: '/blog/seo-automation', title: 'SEO Automation Guide', views: 2134, uniqueViews: 1890, avgTime: '5:23', bounceRate: 15.8 },
        { page: '/features', title: 'Features', views: 1987, uniqueViews: 1654, avgTime: '3:01', bounceRate: 28.9 },
        { page: '/blog/analytics-tips', title: '10 Analytics Tips', views: 1654, uniqueViews: 1432, avgTime: '4:45', bounceRate: 22.3 },
        { page: '/dashboard', title: 'Dashboard', views: 1432, uniqueViews: 987, avgTime: '6:12', bounceRate: 8.1 },
        { page: '/docs/api', title: 'API Reference', views: 1210, uniqueViews: 1098, avgTime: '3:34', bounceRate: 25.6 },
        { page: '/contact', title: 'Contact Us', views: 876, uniqueViews: 812, avgTime: '1:15', bounceRate: 52.4 },
        { page: '/changelog', title: 'Changelog', views: 654, uniqueViews: 589, avgTime: '2:08', bounceRate: 35.7 },
    ];
}

function generateMockDevices() {
    return [
        { device: 'Desktop', sessions: 6842, percentage: 60.0 },
        { device: 'Mobile', sessions: 3567, percentage: 31.3 },
        { device: 'Tablet', sessions: 995, percentage: 8.7 },
    ];
}

function generateMockCountries() {
    return [
        { country: 'United States', users: 4231, percentage: 37.1 },
        { country: 'United Kingdom', users: 1567, percentage: 13.7 },
        { country: 'India', users: 1432, percentage: 12.6 },
        { country: 'Germany', users: 987, percentage: 8.7 },
        { country: 'Canada', users: 876, percentage: 7.7 },
        { country: 'Australia', users: 654, percentage: 5.7 },
        { country: 'France', users: 543, percentage: 4.8 },
        { country: 'Other', users: 1114, percentage: 9.8 },
    ];
}

function generateMockKPIs() {
    return {
        totalUsers: 11404,
        totalSessions: 14204,
        totalPageViews: 32890,
        avgBounceRate: 32.8,
        avgSessionDuration: 187,
        newUsers: 6234,
        returningUsers: 5170,
        pagesPerSession: 2.3,
        changeUsers: 12.4,
        changeSessions: 8.7,
        changePageViews: 15.2,
        changeBounceRate: -3.1,
    };
}

// ============= Route handler =============

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
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
            const mode = searchParams.get('mode')

            // Handle "list" mode for dropdown
            if (mode === 'list') {
                try {
                    const listRes = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/exec`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-API-Key": ADMIN_API_KEY },
                        body: JSON.stringify({
                            plugin: "google-analytics",
                            command: "list-properties-json",
                            args: []
                        }),
                        cache: 'no-store'
                    })

                    if (listRes.ok) {
                        const listData = await listRes.json()
                        if (listData.status === "ok" && Array.isArray(listData.data)) {
                            return NextResponse.json(listData.data)
                        }
                    }
                    return NextResponse.json([])
                } catch (e) {
                    console.error("List properties error:", e)
                    return NextResponse.json([])
                }
            }

            let propertyId = searchParams.get('propertyId')

            if (!propertyId) {
                try {
                    const listRes = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/exec`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-API-Key": ADMIN_API_KEY },
                        body: JSON.stringify({
                            plugin: "google-analytics",
                            command: "list-properties-json",
                            args: []
                        }),
                        cache: 'no-store'
                    })

                    if (listRes.ok) {
                        const listData = await listRes.json()

                        // Check for plugin error response
                        if (listData.status === "ok" && listData.data && !Array.isArray(listData.data) && (listData.data as any).error) {
                            console.error("Analytics plugin error:", (listData.data as any).error);
                            return NextResponse.json({ error: (listData.data as any).error }, { status: 502 });
                        }

                        if (listData.status === "ok" && Array.isArray(listData.data) && listData.data.length > 0) {
                            propertyId = listData.data[0].property
                        }
                    }
                } catch (e) {
                    console.warn("Failed to auto-detect GA property:", e)
                }
            }

            if (!propertyId) {
                return NextResponse.json(
                    { error: "No Google Analytics property found. Please connect Google Analytics in your integrations." },
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
                    plugin: "google-analytics",
                    command: "dashboard-json",
                    args: [propertyId, range],
                    options: {}
                }),
                cache: 'no-store'
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('Analytics admin API error:', response.status, errorText)
                return NextResponse.json(
                    { error: "Failed to fetch analytics from Google" },
                    { status: 502 }
                )
            }

            const adminData = await response.json()

            if (adminData.status === "ok" && adminData.data && typeof adminData.data === 'object') {
                return NextResponse.json(adminData.data)
            }

            console.error('Analytics plugin error:', adminData.stderr || 'Unknown error')
            return NextResponse.json(
                { error: adminData.stderr || "Analytics plugin returned unexpected data" },
                { status: 502 }
            )
        }

        // Dev mode only: return mock data
        const result: Record<string, unknown> = {}

        if (section === 'all' || section === 'kpis') result.kpis = generateMockKPIs()
        if (section === 'all' || section === 'traffic') result.traffic = generateMockTrafficData()
        if (section === 'all' || section === 'sources') result.sources = generateMockSources()
        if (section === 'all' || section === 'pages') result.pages = generateMockTopPages()
        if (section === 'all' || section === 'devices') result.devices = generateMockDevices()
        if (section === 'all' || section === 'countries') result.countries = generateMockCountries()

        return NextResponse.json(result)

    } catch (err: unknown) {
        const error = err as Error
        console.error('Analytics API error:', error.message)
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
}
