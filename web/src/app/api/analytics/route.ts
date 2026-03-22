import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
import { cachedFetch, CACHE_TTL } from '@/lib/apiCache'
import { getValidAccessToken, listAnalyticsProperties, fetchAnalyticsDashboard, fetchGoogleTokensFromDb } from '@/lib/googleApi'

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

function generateMockBrowsers() {
    return [
        { name: 'Chrome', value: 6732, users: 5890, percentage: 59.0 },
        { name: 'Safari', value: 2312, users: 2100, percentage: 20.3 },
        { name: 'Firefox', value: 987, users: 876, percentage: 8.7 },
        { name: 'Edge', value: 654, users: 590, percentage: 5.7 },
        { name: 'Instagram', value: 440, users: 410, percentage: 3.9 },
        { name: 'Opera', value: 156, users: 140, percentage: 1.4 },
        { name: 'Samsung Internet', value: 86, users: 78, percentage: 0.8 },
        { name: 'Chrome WebView', value: 37, users: 32, percentage: 0.3 },
    ];
}

function generateMockOS() {
    return [
        { name: 'Windows', value: 4567, users: 4100, percentage: 40.1 },
        { name: 'macOS', value: 2890, users: 2650, percentage: 25.4 },
        { name: 'iOS', value: 1876, users: 1720, percentage: 16.5 },
        { name: 'Android', value: 1432, users: 1300, percentage: 12.6 },
        { name: 'Linux', value: 543, users: 490, percentage: 4.8 },
        { name: 'Chrome OS', value: 96, users: 87, percentage: 0.8 },
    ];
}

function generateMockChannels() {
    return [
        { name: 'Organic Search', value: 4821, users: 4200, percentage: 42.3 },
        { name: 'Direct', value: 2134, users: 1890, percentage: 18.7 },
        { name: 'Referral', value: 1567, users: 1400, percentage: 13.7 },
        { name: 'Social', value: 1456, users: 1320, percentage: 12.8 },
        { name: 'Email', value: 612, users: 540, percentage: 5.4 },
        { name: 'Paid Search', value: 432, users: 390, percentage: 3.8 },
        { name: 'Display', value: 213, users: 190, percentage: 1.9 },
        { name: 'Affiliates', value: 169, users: 150, percentage: 1.5 },
    ];
}

function generateMockReferrers() {
    return [
        { name: 'google.com', value: 4821, users: 4200, percentage: 42.3 },
        { name: '(direct)', value: 2134, users: 1890, percentage: 18.7 },
        { name: 'github.com', value: 1567, users: 1400, percentage: 13.7 },
        { name: 't.co', value: 1023, users: 920, percentage: 9.0 },
        { name: 'linkedin.com', value: 834, users: 750, percentage: 7.3 },
        { name: 'facebook.com', value: 317, users: 280, percentage: 2.8 },
        { name: 'youtube.com', value: 243, users: 210, percentage: 2.1 },
        { name: 'reddit.com', value: 198, users: 170, percentage: 1.7 },
        { name: 'bing.com', value: 165, users: 145, percentage: 1.4 },
        { name: 'instagram.com', value: 102, users: 90, percentage: 0.9 },
    ];
}

function generateMockCities() {
    return [
        { city: 'New York', country: 'United States', users: 1234 },
        { city: 'London', country: 'United Kingdom', users: 987 },
        { city: 'Mumbai', country: 'India', users: 876 },
        { city: 'San Francisco', country: 'United States', users: 765 },
        { city: 'Berlin', country: 'Germany', users: 654 },
        { city: 'Toronto', country: 'Canada', users: 543 },
        { city: 'Paris', country: 'France', users: 432 },
        { city: 'Sydney', country: 'Australia', users: 321 },
        { city: 'Tokyo', country: 'Japan', users: 298 },
        { city: 'Singapore', country: 'Singapore', users: 276 },
        { city: 'São Paulo', country: 'Brazil', users: 254 },
        { city: 'Amsterdam', country: 'Netherlands', users: 243 },
        { city: 'Bangalore', country: 'India', users: 231 },
        { city: 'Dubai', country: 'UAE', users: 198 },
        { city: 'Chicago', country: 'United States', users: 187 },
    ];
}

function generateMockRegions() {
    return [
        { region: 'California', country: 'United States', users: 2134 },
        { region: 'England', country: 'United Kingdom', users: 1456 },
        { region: 'Maharashtra', country: 'India', users: 1234 },
        { region: 'New York', country: 'United States', users: 1098 },
        { region: 'Ontario', country: 'Canada', users: 876 },
        { region: 'Bavaria', country: 'Germany', users: 654 },
        { region: 'New South Wales', country: 'Australia', users: 543 },
        { region: 'Île-de-France', country: 'France', users: 432 },
        { region: 'Texas', country: 'United States', users: 398 },
        { region: 'Karnataka', country: 'India', users: 365 },
    ];
}

function generateMockEntryPages() {
    return [
        { page: '/', sessions: 10234, users: 8900, bounceRate: 32.1, percentage: 45.2 },
        { page: '/roadmap', sessions: 338, users: 290, bounceRate: 28.5, percentage: 1.5 },
        { page: '/course', sessions: 134, users: 112, bounceRate: 22.3, percentage: 0.6 },
        { page: '/review', sessions: 39, users: 34, bounceRate: 18.9, percentage: 0.2 },
        { page: '/pricing', sessions: 16, users: 14, bounceRate: 41.2, percentage: 0.1 },
        { page: '/affiliates', sessions: 10, users: 9, bounceRate: 35.6, percentage: 0.04 },
        { page: '/blog/seo-tips', sessions: 8, users: 7, bounceRate: 15.4, percentage: 0.04 },
        { page: '/docs/getting-started', sessions: 5, users: 4, bounceRate: 12.1, percentage: 0.02 },
    ];
}

function generateMockLanguages() {
    return [
        { name: 'English', value: 6543, users: 5890, percentage: 57.4 },
        { name: 'Spanish', value: 1234, users: 1100, percentage: 10.8 },
        { name: 'French', value: 987, users: 890, percentage: 8.7 },
        { name: 'German', value: 876, users: 790, percentage: 7.7 },
        { name: 'Portuguese', value: 654, users: 590, percentage: 5.7 },
        { name: 'Japanese', value: 432, users: 390, percentage: 3.8 },
        { name: 'Hindi', value: 321, users: 290, percentage: 2.8 },
        { name: 'Chinese', value: 198, users: 175, percentage: 1.7 },
        { name: 'Korean', value: 87, users: 78, percentage: 0.8 },
        { name: 'Dutch', value: 72, users: 64, percentage: 0.6 },
    ];
}

// ============= Route handler =============

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const section = searchParams.get('section') || 'all'

    const isProduction = !!ADMIN_API_KEY

    // Parallelize session and JWT token lookups — they're independent
    const [session, jwt] = await Promise.all([
        getServerSession(authOptions),
        getToken({ req: req as any }) as Promise<any>,
    ]);

    if (isProduction && !session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        if (isProduction && session?.user) {
            // @ts-expect-error - id added in callbacks
            const userId = session.user.id
            let googleAccess = jwt?.googleAccessToken as string | undefined
            let googleRefresh = jwt?.googleRefreshToken as string | undefined

            // Fallback: fetch from admin DB (handles case where user signed in with GitHub)
            if (!googleAccess && !googleRefresh) {
                const dbTokens = await fetchGoogleTokensFromDb(userId)
                if (dbTokens) {
                    googleAccess = dbTokens.accessToken
                    googleRefresh = dbTokens.refreshToken
                }
            }

            if (!googleAccess && !googleRefresh) {
                return NextResponse.json({ error: "Google not connected", code: "GOOGLE_NOT_CONNECTED" }, { status: 400 })
            }

            // Get a valid access token (refreshes if expired, cached in-memory)
            let token: string
            try {
                token = await getValidAccessToken(googleAccess, googleRefresh)
            } catch (e) {
                console.error("Google token refresh failed:", e)
                return NextResponse.json({ error: "Google authentication failed. Please re-sign in." }, { status: 401 })
            }

            const mode = searchParams.get('mode')

            // Helper: fetch property list (cached)
            const fetchPropertyList = () => cachedFetch(
                `ga:properties:${userId}`,
                CACHE_TTL.PROPERTY_LIST,
                () => listAnalyticsProperties(token)
            )

            // Handle "list" mode for dropdown
            if (mode === 'list') {
                try {
                    const properties = await fetchPropertyList()
                    return NextResponse.json(Array.isArray(properties) ? properties : [])
                } catch (e) {
                    console.error("List properties error:", e)
                    return NextResponse.json([])
                }
            }

            let propertyId = searchParams.get('propertyId')

            if (!propertyId) {
                try {
                    const properties = await fetchPropertyList()
                    if (Array.isArray(properties) && properties.length > 0) {
                        propertyId = properties[0].property
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

            // Fetch dashboard data (cached for 3 min per property+range)
            const cacheKey = `ga:dashboard:${userId}:${propertyId}:${range}:${section}`
            const dashboardData = await cachedFetch(
                cacheKey,
                CACHE_TTL.DASHBOARD_DATA,
                async () => {
                    try {
                        return await fetchAnalyticsDashboard(token, propertyId!, range)
                    } catch (e: any) {
                        console.error('Analytics direct API error:', e.message)
                        return { __error: e.message || "Failed to fetch analytics from Google" }
                    }
                }
            )

            if (dashboardData?.__error) {
                return NextResponse.json({ error: dashboardData.__error }, { status: 502 })
            }
            return NextResponse.json(dashboardData)
        }

        // Dev mode only: return mock data
        const result: Record<string, unknown> = {}

        if (section === 'all' || section === 'kpis') result.kpis = generateMockKPIs()
        if (section === 'all' || section === 'traffic') result.traffic = generateMockTrafficData()
        if (section === 'all' || section === 'sources') result.sources = generateMockSources()
        if (section === 'all' || section === 'pages') result.pages = generateMockTopPages()
        if (section === 'all' || section === 'devices') result.devices = generateMockDevices()
        if (section === 'all' || section === 'countries') result.countries = generateMockCountries()
        if (section === 'all' || section === 'browsers') result.browsers = generateMockBrowsers()
        if (section === 'all' || section === 'os') result.operatingSystems = generateMockOS()
        if (section === 'all' || section === 'channels') result.channels = generateMockChannels()
        if (section === 'all' || section === 'referrers') result.referrers = generateMockReferrers()
        if (section === 'all' || section === 'cities') result.cities = generateMockCities()
        if (section === 'all' || section === 'regions') result.regions = generateMockRegions()
        if (section === 'all' || section === 'entryPages') result.entryPages = generateMockEntryPages()
        if (section === 'all' || section === 'languages') result.languages = generateMockLanguages()

        return NextResponse.json(result)

    } catch (err: unknown) {
        const error = err as Error
        console.error('Analytics API error:', error.message)
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
}
