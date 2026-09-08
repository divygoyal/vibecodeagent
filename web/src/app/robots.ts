import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/dashboard',
                    '/dashboard/',
                    '/admin',
                    '/admin/',
                    '/superadmin',
                    '/api',
                    '/api/',
                    '/auth',
                    '/auth/',
                    '/share',
                    '/view',
                    '/embed',
                    '/demo',
                    '/share-popup-preview',
                ],
            },
        ],
        sitemap: 'https://trafficclaw.com/sitemap.xml',
        host: 'https://trafficclaw.com',
    };
}