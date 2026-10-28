import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/brand';

// Read TC_NOINDEX on each request, not only at build time.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
    // Private previews (TC_NOINDEX=1): keep every crawler out.
    if (process.env.TC_NOINDEX === '1') {
        return { rules: [{ userAgent: '*', disallow: '/' }] };
    }
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/dashboard',
                    '/admin',
                    '/superadmin',
                    '/api/',
                    '/auth/',
                    '/oauth/',
                    '/mcp',
                    // /share/ and /view/ stay crawlable on purpose: link-preview bots (X, LinkedIn) obey robots.txt and
                    // would show no card for a shared dashboard. Both are noindex (page meta), so search never lists them.
                    '/embed/',
                ],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
