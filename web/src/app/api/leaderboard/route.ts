import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { DEFAULT_RANGE, RANGES, TABS } from '@/lib/leaderboard/constants';
import type { BoardResponse } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

const TAB_SET = new Set<string>(TABS.map((t) => t.value));
const RANGE_SET = new Set<string>(RANGES.map((r) => r.value));
// Pre-v3 callers used `sort=`; map it onto the new tabs.
const LEGACY_SORT_TO_TAB: Record<string, string> = { traffic: 'top', engagement: 'top', movers: 'rising', newest: 'new' };

/**
 * Public leaderboard. Thin proxy to the admin API's /api/lb/board, which applies
 * every owner's privacy settings and ranking rules. Cacheable at the edge.
 *
 *   ?tab=top|search|rising|new|offers|categories  ?range=7d|28d|3m
 *   &category= &country= &q= &open_to= &page= &page_size=
 */
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const tabParam = sp.get('tab') || LEGACY_SORT_TO_TAB[sp.get('sort') || ''] || 'top';
    const tab = TAB_SET.has(tabParam) ? tabParam : 'top';
    const range = RANGE_SET.has(sp.get('range') || '') ? sp.get('range')! : DEFAULT_RANGE;
    const page = Math.max(parseInt(sp.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(sp.get('page_size') || '25', 10) || 25, 1), 100);

    const res = await lbAdmin<BoardResponse>('/api/lb/board', {
        query: {
            tab,
            range,
            category: sp.get('category'),
            country: sp.get('country'),
            q: (sp.get('q') || '').slice(0, 80),
            open_to: sp.get('open_to'),
            page,
            page_size: pageSize,
        },
        timeoutMs: 8_000,
    });
    if (!res.ok || !res.data) {
        console.error('[Leaderboard] board unavailable:', res.error);
        return NextResponse.json({ tab, range, rows: [], total: 0, page, pageSize, categories: [], sponsored: [], open_slot_total: 0, updated_at: null }, { status: 200 });
    }
    return NextResponse.json(res.data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
}
