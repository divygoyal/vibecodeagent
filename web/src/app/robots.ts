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
                    '/share/',
                    '/view/',
                    '/embed/',
                ],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
