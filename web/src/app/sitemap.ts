import type { MetadataRoute } from 'next';

import { FREE_TOOLS } from '@/components/marketing/tools/catalog';
import { SITE_URL } from '@/lib/brand';

type Freq = MetadataRoute.Sitemap[number]['changeFrequency'];

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();
    const routes: Array<{ path: string; priority: number; changeFrequency: Freq }> = [
        { path: '/', priority: 1, changeFrequency: 'weekly' },
        { path: '/demo', priority: 0.9, changeFrequency: 'daily' },
        { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
        { path: '/ai', priority: 0.9, changeFrequency: 'monthly' },
        { path: '/leaderboard', priority: 0.8, changeFrequency: 'daily' },
        { path: '/sponsor', priority: 0.6, changeFrequency: 'weekly' },
        { path: '/tools', priority: 0.8, changeFrequency: 'monthly' },
        ...FREE_TOOLS.map((t) => ({ path: `/tools/${t.slug}`, priority: 0.7, changeFrequency: 'monthly' as Freq })),
        { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
        { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
        { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
        { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
    ];
    return routes.map((r) => ({
        url: `${SITE_URL}${r.path === '/' ? '' : r.path}`,
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
    }));
}
