import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
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
        { path: '/globe', priority: 0.6, changeFrequency: 'weekly' },
        { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
        { path: '/reddit', priority: 0.6, changeFrequency: 'daily' },
        { path: '/x', priority: 0.6, changeFrequency: 'daily' },
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

    return staticRoutes.map((route) => ({
        url: `${baseUrl}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
    }));
}