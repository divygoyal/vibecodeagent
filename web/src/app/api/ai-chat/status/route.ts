import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { isGoogleGenAIConfigured } from '@/lib/googleGenAi';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-chat/status: is the Ask model configured on this server?
 *
 * The Ask page calls it once so it can show a calm "AI is unavailable" state
 * instead of sending a message that cannot be answered (no Gemini or Vertex
 * key, which is the default in local dev). It reveals no key material.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ available: isGoogleGenAIConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
