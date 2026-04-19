import { NextResponse } from 'next/server';

import { normalizeXWidgetConfig } from '@/lib/socialEmbeds';
import { fetchRedditMentionsForDomain } from '@/lib/redditMentionsServer';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    try {
        const validationResponse = await fetch(
            `${ADMIN_API_URL}/api/social-embed-tokens/${encodeURIComponent(token)}`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
            }
        );

        const validationData = await validationResponse.json().catch(() => ({}));
        if (!validationResponse.ok) {
            return NextResponse.json(
                { error: validationData.detail || validationData.error || 'Invalid or revoked token' },
                { status: validationResponse.status }
            );
        }

        if (validationData.platform !== 'reddit') {
            return NextResponse.json({ error: 'Unsupported embed platform' }, { status: 400 });
        }

        const config = normalizeXWidgetConfig(validationData.config);
        const candidateLimit = 18;
        const result = await fetchRedditMentionsForDomain(validationData.domain, { source: 'embed' });

        return NextResponse.json({
            token,
            platform: 'reddit',
            domain: result.canonicalDomain || validationData.domain,
            label: validationData.label || null,
            showBranding: true,
            config,
            mentions: result.mentions.slice(0, candidateLimit),
            warning: result.warning,
            error: result.error,
        });
    } catch (error) {
        console.error('Public Reddit embed data error:', error);
        return NextResponse.json({ error: 'Failed to load Reddit embed data' }, { status: 500 });
    }
}
