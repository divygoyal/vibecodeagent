import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://trafficclaw.com';

    return [
        { url: baseUrl, lastModified: '2026-03-06', changeFrequency: 'weekly', priority: 1 },
        { url: `${baseUrl}/features`, lastModified: '2026-03-01', changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/pricing`, lastModified: '2026-03-01', changeFrequency: 'monthly', priority: 0.9 },
        // Buyer-side sponsorship index + budget planner. Per-site profiles stay
        // canonical at /leaderboard/[id]; there is no /advertise/[site] route.
        { url: `${baseUrl}/advertise`, lastModified: '2026-09-07', changeFrequency: 'daily', priority: 0.8 },
        { url: `${baseUrl}/about`, lastModified: '2026-03-06', changeFrequency: 'monthly', priority: 0.6 },
        { url: `${baseUrl}/privacy`, lastModified: '2026-02-25', changeFrequency: 'yearly', priority: 0.3 },
        { url: `${baseUrl}/terms`, lastModified: '2026-02-18', changeFrequency: 'yearly', priority: 0.3 },
    ];
}
