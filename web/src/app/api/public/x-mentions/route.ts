import { NextRequest, NextResponse } from 'next/server';

import {
    consumePublicMentionsLookup,
    getPublicMentionsRequesterIp,
    isDemoMentionsDomain,
} from '@/lib/publicMentionsRateLimit';
import { peekCachedXMentionsForDomain, fetchXMentionsForDomain } from '@/lib/xMentionsServer';
import { canonicalizeDomainInput } from '@/lib/xMentionsShared';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MESSAGE =
    'Too many X mention lookups right now. Please wait a minute and try again.';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { domain } = body as { domain?: string };
        const requestedDomain = typeof domain === 'string' ? domain : '';
        const canonicalDomain = canonicalizeDomainInput(requestedDomain);

        if (!canonicalDomain) {
            return NextResponse.json({ mentions: [], warning: 'Invalid domain' }, { status: 200 });
        }

        const cached = peekCachedXMentionsForDomain(canonicalDomain);
        if (cached) {
            return NextResponse.json(cached);
        }

        if (!isDemoMentionsDomain(canonicalDomain)) {
            const rateLimit = consumePublicMentionsLookup('x', getPublicMentionsRequesterIp(req.headers));
            if (!rateLimit.allowed) {
                return NextResponse.json(
                    {
                        canonicalDomain,
                        mentions: [],
                        warning: RATE_LIMIT_MESSAGE,
                        error: RATE_LIMIT_MESSAGE,
                    },
                    {
                        status: 429,
                        headers: {
                            'Retry-After': String(rateLimit.retryAfterSeconds),
                        },
                    },
                );
            }
        }

        const result = await fetchXMentionsForDomain(canonicalDomain);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[public-x-mentions] Error:', error);
        return NextResponse.json(
            {
                mentions: [],
                warning: 'X mentions temporarily unavailable.',
            },
            { status: 200 },
        );
    }
}
