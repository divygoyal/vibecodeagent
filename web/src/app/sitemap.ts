import { MetadataRoute } from 'next';
import { lbAdmin } from '@/lib/leaderboard/admin';
import type { BoardResponse } from '@/lib/leaderboard/types';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://trafficclaw.com';
    const now = new Date();

    const staticRoutes: Array<{
        path: string;
        priority: number;
        changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    }> = [
        { path: '/', priority: 1, changeFrequency: 'daily' },
        { path: '/features', priority: 0.9, changeFrequency: 'weekly' },
        { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
        { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
        { path: '/leaderboard/advertise', priority: 0.6, changeFrequency: 'daily' },
        { path: '/tools', priority: 0.8, changeFrequency: 'weekly' },
        { path: '/tools/ai-search-readiness', priority: 0.8, changeFrequency: 'weekly' },
        { path: '/tools/comparison-builder', priority: 0.7, changeFrequency: 'monthly' },
        { path: '/tools/hreflang-validator', priority: 0.7, changeFrequency: 'monthly' },
        { path: '/tools/readability-checker', priority: 0.7, changeFrequency: 'monthly' },
        { path: '/tools/robots-analyzer', priority: 0.7, changeFrequency: 'monthly' },
        { path: '/about', priority: 0.4, changeFrequency: 'monthly' },
        { path: '/contact', priority: 0.4, changeFrequency: 'monthly' },
        { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
        { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
    ];

    // Verified, listed profiles (privacy-applied board; up to 100 by traffic).
    const board = await lbAdmin<BoardResponse>('/api/lb/board', { query: { tab: 'top', page_size: 100 }, revalidate: 3600, timeoutMs: 4000 });
    const profiles: MetadataRoute.Sitemap = (board.data?.rows ?? []).map((r) => ({
        url: `${baseUrl}/leaderboard/${r.slug || r.id}`,
        lastModified: r.last_refreshed ? new Date(r.last_refreshed) : now,
        changeFrequency: 'daily' as const,
        priority: 0.5,
    }));

    return [
        ...staticRoutes.map((route) => ({
            url: `${baseUrl}${route.path}`,
            lastModified: now,
            changeFrequency: route.changeFrequency,
            priority: route.priority,
        })),
        ...profiles,
    ];
}