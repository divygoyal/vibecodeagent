import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
import { getValidAccessToken, listSearchConsoleSites, listAnalyticsProperties, fetchGoogleTokensFromDb } from '@/lib/googleApi'

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const dynamic = 'force-dynamic';

// ─── Types ───
interface Insight {
    id: string;
    type: 'opportunity' | 'warning' | 'achievement' | 'trend';
    title: string;
    description: string;
    metric?: string;
    priority: 'high' | 'medium' | 'low';
    category: 'seo' | 'analytics' | 'performance';
}

// ─── Google API helpers (inline to avoid circular deps) ───
async function fetchGSCData(token: string, siteUrl: string, startDate: string, endDate: string, dims: string[], limit = 100) {
    const body = { startDate, endDate, dimensions: dims, rowLimit: limit, type: 'web' };
    const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return null;
    return res.json();
}

async function fetchGAReport(token: string, propertyId: string, startDate: string, endDate: string, dims: string[], metrics: string[]) {
    const body = {
        dateRanges: [{ startDate, endDate }],
        dimensions: dims.map(d => ({ name: d })),
        metrics: metrics.map(m => ({ name: m })),
        limit: 50,
    };
    const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return null;
    return res.json();
}

// ─── Date helpers ───
function formatDate(d: Date) {
    return d.toISOString().split('T')[0];
}
function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return formatDate(d);
}

// ─── Insight generators ───

function generateSEOInsights(queryData: any, prevQueryData: any): Insight[] {
    const insights: Insight[] = [];
    if (!queryData?.rows) return insights;

    // 1. Low CTR with high impressions = opportunity
    const lowCTR = queryData.rows.filter((r: any) => {
        const impressions = r.impressions || 0;
        const ctr = r.ctr || 0;
        const pos = r.position || 0;
        return impressions > 100 && ctr < 0.03 && pos < 20;
    });
    if (lowCTR.length > 0) {
        const topOpp = lowCTR.sort((a: any, b: any) => b.impressions - a.impressions)[0];
        insights.push({
            id: 'seo-low-ctr',
            type: 'opportunity',
            title: 'Low CTR keywords with high impressions',
            description: `"${topOpp.keys[0]}" gets ${topOpp.impressions} impressions but only ${(topOpp.ctr * 100).toFixed(1)}% CTR at position ${topOpp.position.toFixed(1)}. Improve your title/meta description to capture more clicks.`,
            metric: `${lowCTR.length} keywords`,
            priority: 'high',
            category: 'seo',
        });
    }

    // 2. Keywords close to page 1 (positions 11-20)
    const almostPage1 = queryData.rows.filter((r: any) => {
        const pos = r.position || 0;
        return pos > 10 && pos <= 20 && (r.impressions || 0) > 50;
    });
    if (almostPage1.length > 0) {
        const top = almostPage1.sort((a: any, b: any) => b.impressions - a.impressions)[0];
        insights.push({
            id: 'seo-almost-page1',
            type: 'opportunity',
            title: 'Keywords close to page 1',
            description: `"${top.keys[0]}" ranks at position ${top.position.toFixed(1)} with ${top.impressions} impressions. A small ranking boost could bring it to page 1.`,
            metric: `${almostPage1.length} keywords`,
            priority: 'high',
            category: 'seo',
        });
    }

    // 3. Top performing keywords
    const topPerforming = queryData.rows
        .filter((r: any) => (r.clicks || 0) > 10)
        .sort((a: any, b: any) => b.clicks - a.clicks)
        .slice(0, 3);
    if (topPerforming.length > 0) {
        const totalClicks = topPerforming.reduce((sum: number, r: any) => sum + r.clicks, 0);
        insights.push({
            id: 'seo-top-keywords',
            type: 'achievement',
            title: 'Top performing keywords',
            description: `Your top 3 keywords ("${topPerforming.map((r: any) => r.keys[0]).join('", "')}") drove ${totalClicks} clicks in the last 28 days.`,
            metric: `${totalClicks} clicks`,
            priority: 'low',
            category: 'seo',
        });
    }

    // 4. Compare periods for traffic trend
    if (prevQueryData?.rows && queryData.rows) {
        const currClicks = queryData.rows.reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);
        const prevClicks = prevQueryData.rows.reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);
        if (prevClicks > 0) {
            const change = ((currClicks - prevClicks) / prevClicks) * 100;
            if (change > 10) {
                insights.push({
                    id: 'seo-traffic-up',
                    type: 'achievement',
                    title: 'Search traffic is growing',
                    description: `Organic clicks increased by ${change.toFixed(0)}% compared to the previous period (${prevClicks} → ${currClicks}).`,
                    metric: `+${change.toFixed(0)}%`,
                    priority: 'low',
                    category: 'seo',
                });
            } else if (change < -10) {
                insights.push({
                    id: 'seo-traffic-down',
                    type: 'warning',
                    title: 'Search traffic is declining',
                    description: `Organic clicks dropped by ${Math.abs(change).toFixed(0)}% compared to the previous period (${prevClicks} → ${currClicks}). Review recent changes and check for technical issues.`,
                    metric: `${change.toFixed(0)}%`,
                    priority: 'high',
                    category: 'seo',
                });
            }
        }
    }

    // 5. Keywords with dropping positions
    if (prevQueryData?.rows && queryData.rows) {
        const prevMap = new Map<string, number>();
        prevQueryData.rows.forEach((r: any) => prevMap.set(r.keys[0], r.position));

        const dropping = queryData.rows.filter((r: any) => {
            const prev = prevMap.get(r.keys[0]);
            return prev && r.position > prev + 3 && (r.impressions || 0) > 50;
        });

        if (dropping.length > 0) {
            const worst = dropping.sort((a: any, b: any) => {
                const aDrop = a.position - (prevMap.get(a.keys[0]) || a.position);
                const bDrop = b.position - (prevMap.get(b.keys[0]) || b.position);
                return bDrop - aDrop;
            })[0];
            const prevPos = prevMap.get(worst.keys[0]) || 0;
            insights.push({
                id: 'seo-rank-drop',
                type: 'warning',
                title: 'Keyword rankings dropping',
                description: `"${worst.keys[0]}" dropped from position ${prevPos.toFixed(1)} to ${worst.position.toFixed(1)}. ${dropping.length} keyword(s) have lost significant rankings.`,
                metric: `${dropping.length} keywords`,
                priority: 'high',
                category: 'seo',
            });
        }
    }

    return insights;
}

function generateAnalyticsInsights(gaData: any): Insight[] {
    const insights: Insight[] = [];
    if (!gaData?.rows) return insights;

    // Bounce rate analysis
    const rows = gaData.rows;
    const highBouncePages = rows.filter((r: any) => {
        const bounceRate = parseFloat(r.metricValues?.[1]?.value) || 0;
        const sessions = parseInt(r.metricValues?.[0]?.value) || 0;
        return bounceRate > 0.7 && sessions > 20;
    });

    if (highBouncePages.length > 0) {
        const worst = highBouncePages.sort((a: any, b: any) =>
            parseFloat(b.metricValues[1].value) - parseFloat(a.metricValues[1].value)
        )[0];
        const bounceRate = (parseFloat(worst.metricValues[1].value) * 100).toFixed(0);
        insights.push({
            id: 'ga-high-bounce',
            type: 'warning',
            title: 'Pages with high bounce rate',
            description: `"${worst.dimensionValues[0].value}" has a ${bounceRate}% bounce rate. ${highBouncePages.length} page(s) have bounce rates above 70%.`,
            metric: `${highBouncePages.length} pages`,
            priority: 'medium',
            category: 'analytics',
        });
    }

    return insights;
}

// ═══════════════════════════════════════
// ─── MAIN HANDLER ───
// ═══════════════════════════════════════

export async function GET(req: Request) {
    const isProduction = !!ADMIN_API_KEY;

    const session = await getServerSession(authOptions);
    if (isProduction && !session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!isProduction) {
            // Dev mode: return mock insights
            return NextResponse.json({ insights: getMockInsights() });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session!.user.id;

        // Get Google tokens from JWT first, fall back to admin DB
        const jwt = await getToken({ req: req as any }) as any;
        let googleAccess = jwt?.googleAccessToken as string | undefined;
        let googleRefresh = jwt?.googleRefreshToken as string | undefined;

        if (!googleAccess && !googleRefresh) {
            const dbTokens = await fetchGoogleTokensFromDb(userId);
            if (dbTokens) {
                googleAccess = dbTokens.accessToken;
                googleRefresh = dbTokens.refreshToken;
            }
        }

        if (!googleAccess && !googleRefresh) {
            return NextResponse.json({ insights: [], message: "Connect Google to get SEO & analytics insights" });
        }

        let token: string;
        try {
            token = await getValidAccessToken(googleAccess, googleRefresh);
        } catch {
            return NextResponse.json({ insights: [], message: "Google authentication expired" });
        }

        // Use requested site/property or fall back to first available
        const { searchParams } = new URL(req.url);
        const requestedSiteUrl = searchParams.get('siteUrl');
        const requestedPropertyId = searchParams.get('propertyId');

        const insights: Insight[] = [];

        // Fetch GSC data for insights
        const sites = await listSearchConsoleSites(token);
        const siteUrl = requestedSiteUrl || (sites.length > 0 ? sites[0].siteUrl : null);
        if (siteUrl) {
            const [queryData, prevQueryData] = await Promise.all([
                fetchGSCData(token, siteUrl, daysAgo(28), daysAgo(1), ['query'], 100),
                fetchGSCData(token, siteUrl, daysAgo(56), daysAgo(29), ['query'], 100),
            ]);
            insights.push(...generateSEOInsights(queryData, prevQueryData));
        }

        // Fetch GA data for insights
        const properties = await listAnalyticsProperties(token);
        const propId = requestedPropertyId
            ? requestedPropertyId.replace('properties/', '')
            : (properties.length > 0 ? properties[0].property.replace('properties/', '') : null);
        if (propId) {
            const gaData = await fetchGAReport(
                token, propId, daysAgo(28), daysAgo(1),
                ['pagePath'], ['sessions', 'bounceRate']
            );
            insights.push(...generateAnalyticsInsights(gaData));
        }

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return NextResponse.json({ insights });

    } catch (err: any) {
        console.error('Insights error:', err.message);
        return NextResponse.json({ insights: [], error: err.message });
    }
}

// ─── Mock data ───
function getMockInsights(): Insight[] {
    return [
        {
            id: 'mock-1', type: 'opportunity', title: 'Low CTR keywords with high impressions',
            description: '"trafficclaw seo tool" gets 1,200 impressions but only 2.1% CTR. Improve your title/meta description.',
            metric: '4 keywords', priority: 'high', category: 'seo',
        },
        {
            id: 'mock-2', type: 'opportunity', title: 'Keywords close to page 1',
            description: '"best seo dashboard" ranks at position 12.3. A small boost could bring it to page 1.',
            metric: '3 keywords', priority: 'high', category: 'seo',
        },
        {
            id: 'mock-3', type: 'warning', title: 'Pages with high bounce rate',
            description: '"/blog/old-post" has a 85% bounce rate. 2 pages have bounce rates above 70%.',
            metric: '2 pages', priority: 'medium', category: 'analytics',
        },
        {
            id: 'mock-4', type: 'achievement', title: 'Search traffic is growing',
            description: 'Organic clicks increased by 23% compared to the previous period.',
            metric: '+23%', priority: 'low', category: 'seo',
        },
    ];
}
