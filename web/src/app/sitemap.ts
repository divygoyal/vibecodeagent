import type { MetadataRoute } from 'next';

import { FREE_TOOLS } from '@/components/marketing/tools/catalog';
import { SITE_URL } from '@/lib/brand';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { publicDemoEnabled } from '@/lib/publicDemo/config';
import type { BoardResponse } from '@/lib/leaderboard/types';

type Freq = MetadataRoute.Sitemap[number]['changeFrequency'];

// Read TC_NOINDEX on each request, not only at build time.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Private previews (TC_NOINDEX=1): nothing to index.
    if (process.env.TC_NOINDEX === '1') return [];
    const now = new Date();
    const routes: Array<{ path: string; priority: number; changeFrequency: Freq }> = [
        { path: '/', priority: 1, changeFrequency: 'weekly' },
        // With the live demo on, /demo is a redirect into the (noindex) app, so it is not listed; the static
        // demo page it falls back to (TC_PUBLIC_DEMO=0) is.
        ...(publicDemoEnabled() ? [] : [{ path: '/demo', priority: 0.9, changeFrequency: 'daily' as Freq }]),
        { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
        { path: '/ai', priority: 0.9, changeFrequency: 'monthly' },
        { path: '/leaderboard', priority: 0.8, changeFrequency: 'daily' },
        { path: '/leaderboard/advertise', priority: 0.6, changeFrequency: 'weekly' },
        { path: '/tools', priority: 0.8, changeFrequency: 'monthly' },
        ...FREE_TOOLS.map((t) => ({ path: `/tools/${t.slug}`, priority: 0.7, changeFrequency: 'monthly' as Freq })),
        { path: '/security', priority: 0.5, changeFrequency: 'monthly' },
        { path: '/changelog', priority: 0.5, changeFrequency: 'weekly' },
        { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
        { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
        { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
        { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
    ];

    // Verified, listed profiles (privacy-applied board; up to 100 by traffic).
    const board = await lbAdmin<BoardResponse>('/api/lb/board', { query: { tab: 'top', page_size: 100 }, revalidate: 3600, timeoutMs: 4000 });
    const profiles: MetadataRoute.Sitemap = (board.data?.rows ?? []).map((r) => ({
        url: `${SITE_URL}/leaderboard/${r.slug || r.id}`,
        lastModified: r.last_refreshed ? new Date(r.last_refreshed) : now,
        changeFrequency: 'daily' as const,
        priority: 0.5,
    }));

    return [
        ...routes.map((r) => ({
            url: `${SITE_URL}${r.path === '/' ? '' : r.path}`,
            lastModified: now,
            changeFrequency: r.changeFrequency,
            priority: r.priority,
        })),
        ...profiles,
    ];
}
