import { NextRequest, NextResponse } from 'next/server';
import { sessionIdentifier } from '@/lib/portfolio/auth';
import { portfolioCsv, portfolioCsvFilename } from '@/lib/portfolio/csv';
import { buildDemoPortfolio } from '@/lib/portfolio/demo';
import { parseRange } from '@/lib/portfolio/ranges';
import { loadPortfolio } from '@/lib/portfolio/service';

export const dynamic = 'force-dynamic';

/** GET /api/portfolio/export.csv?range=28d[&hidden=1] - one row per site. ?demo=1 for the public demo. */
export async function GET(req: NextRequest) {
    const range = parseRange(req.nextUrl.searchParams.get('range'));
    const includeHidden = req.nextUrl.searchParams.get('hidden') === '1';
    let data;
    if (req.nextUrl.searchParams.get('demo') === '1') {
        data = buildDemoPortfolio({ range });
    } else {
        const identifier = await sessionIdentifier();
        if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        try {
            data = await loadPortfolio(identifier, range, req);
        } catch (err) {
            console.error('[portfolio] export failed:', err instanceof Error ? err.message : err);
            return NextResponse.json({ error: 'Could not export your portfolio' }, { status: 502 });
        }
    }
    return new NextResponse(portfolioCsv(data, { includeHidden }), {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${portfolioCsvFilename(data)}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
