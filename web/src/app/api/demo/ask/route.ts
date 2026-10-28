import { NextResponse } from 'next/server';

import { demoAskSamples } from '@/lib/publicDemo/ask';

export const dynamic = 'force-dynamic';

/** GET /api/demo/ask: the public demo's suggested questions and their sample answers (demo data, no model call). */
export function GET() {
    return NextResponse.json({ samples: demoAskSamples() }, { headers: { 'Cache-Control': 'private, max-age=600' } });
}
