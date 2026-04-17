import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { fetchXMentionsForDomain } from '@/lib/xMentionsServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { domain } = body as { domain?: string };
        const result = await fetchXMentionsForDomain(typeof domain === 'string' ? domain : '');

        if (!result.canonicalDomain && result.warning === 'Invalid domain') {
            return NextResponse.json({ mentions: [], warning: 'Invalid domain' }, { status: 200 });
        }

        return NextResponse.json({
            canonicalDomain: result.canonicalDomain,
            mentions: result.mentions,
            warning: result.warning,
            error: result.error,
        });
    } catch (error) {
        console.error('[x-mentions] Error:', error);
        return NextResponse.json({ mentions: [], warning: 'X mentions temporarily unavailable.' });
    }
}
