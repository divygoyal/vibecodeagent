import { NextResponse } from 'next/server';
import { BRAND_NAME } from '@/lib/brand';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

// ============= Mock data for local development =============
function generateMockLeaderboard() {
    return [
        {
            id: 1, startup_name: 'AI Mole Checker — Skinive', description: 'Stop guessing about your skin. Start scanning with Skinive — the world\'s most accurate AI dermatology app.',
            website_url: 'https://skinive.com', logo_url: null, category: 'SaaS', mrr_range: '$10K+',
            looking_for: ['partner', 'visibility'], twitter_handle: 'SkiniveApp',
            monthly_visitors: 125727, monthly_pageviews: 342891, engagement_rate: 86, bounce_rate: 14, visitor_trend: 23.4,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-01-15T10:00:00Z',
        },
        {
            id: 2, startup_name: 'Expert Listing', description: 'Expert Listing gives you direct access to property owners, developers, and principals.',
            website_url: 'https://expertlisting.com', logo_url: null, category: 'SaaS', mrr_range: '$0-500',
            looking_for: ['visibility'], twitter_handle: null,
            monthly_visitors: 30387, monthly_pageviews: 85210, engagement_rate: 38, bounce_rate: 62, visitor_trend: 8.1,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-02-20T10:00:00Z',
        },
        {
            id: 3, startup_name: 'AntiGravity Codes', description: 'The ultimate resource hub for developers using Google Antigravity. Features 500+ AI-powered tools.',
            website_url: 'https://antigravity.codes', logo_url: null, category: 'Tool', mrr_range: '$0-500',
            looking_for: ['visibility', 'buyer', 'partner'], twitter_handle: 'devanshuai',
            monthly_visitors: 15977, monthly_pageviews: 43221, engagement_rate: 42, bounce_rate: 58, visitor_trend: 15.2,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-02-01T10:00:00Z',
        },
        {
            id: 4, startup_name: 'Diskusi Pajak', description: 'DiskusiPajak.com simplifies tax management for freelancers and digital businesses.',
            website_url: 'https://diskusipajak.com', logo_url: null, category: 'SaaS', mrr_range: '$0-500',
            looking_for: ['partner'], twitter_handle: 'lesssummerize',
            monthly_visitors: 14955, monthly_pageviews: 39102, engagement_rate: 58, bounce_rate: 42, visitor_trend: -2.3,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-01-28T10:00:00Z',
        },
        {
            id: 5, startup_name: 'Shadcn Space', description: 'A collection of beautifully designed Shadcn UI blocks, components, templates, and more.',
            website_url: 'https://shadcn.space', logo_url: null, category: 'Tool', mrr_range: '$0-500',
            looking_for: ['visibility'], twitter_handle: 'ShadcnSpace',
            monthly_visitors: 13721, monthly_pageviews: 35443, engagement_rate: 56, bounce_rate: 44, visitor_trend: 31.7,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-03-01T10:00:00Z',
        },
        {
            id: 6, startup_name: `${BRAND_NAME}`, description: 'AI-powered SEO analytics with real-time traffic monitoring, GSC intelligence, and automated insights.',
            website_url: 'https://trafficclaw.com', logo_url: null, category: 'SaaS', mrr_range: '$500-1K',
            looking_for: ['visibility', 'partner'], twitter_handle: 'trafficclaw',
            monthly_visitors: 11204, monthly_pageviews: 28450, engagement_rate: 67, bounce_rate: 33, visitor_trend: 45.2,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-02-10T10:00:00Z',
        },
        {
            id: 7, startup_name: 'DevCanvas', description: 'Open-source design tool for developers. Create beautiful marketing pages without Figma.',
            website_url: 'https://devcanvas.io', logo_url: null, category: 'Tool', mrr_range: '$1K-5K',
            looking_for: ['buyer'], twitter_handle: 'devcanvas_io',
            monthly_visitors: 8934, monthly_pageviews: 21567, engagement_rate: 72, bounce_rate: 28, visitor_trend: 12.8,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-03-10T10:00:00Z',
        },
        {
            id: 8, startup_name: 'BlogRocket', description: 'AI autopilot for your blog. Generates, optimizes, and publishes SEO content on schedule.',
            website_url: 'https://blogrocket.co', logo_url: null, category: 'Blog', mrr_range: '$500-1K',
            looking_for: ['partner', 'visibility'], twitter_handle: 'blogrocket',
            monthly_visitors: 6543, monthly_pageviews: 18976, engagement_rate: 61, bounce_rate: 39, visitor_trend: -5.1,
            is_verified: true, last_refreshed: new Date().toISOString(), created_at: '2026-03-15T10:00:00Z',
        },
    ];
}

type LeaderboardListResponse = {
    entries: ReturnType<typeof generateMockLeaderboard>;
    total: number;
    page: number;
    pageSize: number;
};

/**
 * Public endpoint — fetch leaderboard entries.
 * Proxies to admin API's public GET /api/leaderboard. Falls back to mock data in local dev
 * when admin API is unavailable. Always returns the paginated `{ entries, total, page, pageSize }` shape.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get('sort') || 'traffic';
    const category = searchParams.get('category') || '';
    const mrr = searchParams.get('mrr') || '';
    const country = searchParams.get('country') || '';
    const q = searchParams.get('q') || '';
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('page_size') || '25', 10) || 25, 1), 100);

    try {
        const params = new URLSearchParams({ sort, page: String(page), page_size: String(pageSize) });
        if (category) params.set('category', category);
        if (mrr) params.set('mrr', mrr);
        if (country) params.set('country', country);
        if (q) params.set('q', q);

        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard?${params}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            throw new Error(`Admin API returned ${res.status}`);
        }

        const data = await res.json();
        // Backwards compat: if the admin returns a bare array (older deploys), wrap it.
        if (Array.isArray(data)) {
            return NextResponse.json({ entries: data, total: data.length, page: 1, pageSize: data.length });
        }
        return NextResponse.json(data as LeaderboardListResponse);
    } catch {
        if (process.env.NODE_ENV === 'production') {
            console.error('[Leaderboard] Admin API unavailable in production');
            return NextResponse.json({ entries: [], total: 0, page: 1, pageSize });
        }

        console.log('[Leaderboard] Admin API unavailable, returning mock data (dev mode)');
        let mockData = generateMockLeaderboard();

        if (category && category !== 'all') mockData = mockData.filter((e) => e.category === category);
        if (mrr && mrr !== 'all') mockData = mockData.filter((e) => e.mrr_range === mrr);
        if (q) {
            const needle = q.toLowerCase();
            mockData = mockData.filter(
                (e) =>
                    (e.startup_name || '').toLowerCase().includes(needle) ||
                    (e.description || '').toLowerCase().includes(needle),
            );
        }

        if (sort === 'engagement') {
            mockData.sort((a, b) => b.engagement_rate - a.engagement_rate);
        } else if (sort === 'movers') {
            mockData.sort((a, b) => b.visitor_trend - a.visitor_trend);
        } else if (sort === 'newest') {
            mockData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else {
            mockData.sort((a, b) => b.monthly_visitors - a.monthly_visitors);
        }

        const total = mockData.length;
        const start = (page - 1) * pageSize;
        const paginated = mockData.slice(start, start + pageSize);
        return NextResponse.json({ entries: paginated, total, page, pageSize });
    }
}
