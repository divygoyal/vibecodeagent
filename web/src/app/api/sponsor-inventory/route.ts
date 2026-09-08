import { NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

const SORTS = new Set(['traffic', 'price_asc', 'price_desc', 'newest']);
const EMPTY = { slots: [], total: 0, sites: 0 };

/**
 * Public endpoint — every active ad slot across every verified site.
 * Thin proxy to the admin API's GET /api/sponsor-inventory. Only forwards the
 * filters the admin understands; prices in the payload are the publisher's own
 * numbers and are passed through untouched.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const params = new URLSearchParams();

    const category = searchParams.get('category') || '';
    const period = searchParams.get('period') || '';
    const maxPrice = parseInt(searchParams.get('max_price_cents') || '', 10);
    const sort = searchParams.get('sort') || '';

    if (category && category !== 'all') params.set('category', category);
    if (period && period !== 'all') params.set('period', period);
    if (Number.isFinite(maxPrice) && maxPrice > 0) params.set('max_price_cents', String(maxPrice));
    if (SORTS.has(sort)) params.set('sort', sort);

    try {
        const qs = params.toString();
        const res = await fetch(`${ADMIN_API_URL}/api/sponsor-inventory${qs ? `?${qs}` : ''}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
        const data = await res.json();
        return NextResponse.json({
            slots: Array.isArray(data?.slots) ? data.slots : [],
            total: Number(data?.total) || 0,
            sites: Number(data?.sites) || 0,
        });
    } catch (err) {
        console.error('[SponsorInventory] Admin API unavailable', err instanceof Error ? err.message : err);
        return NextResponse.json(EMPTY);
    }
}
