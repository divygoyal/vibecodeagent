import { NextResponse } from 'next/server';
import { BRAND_NAME } from '@/lib/brand';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

type EntryDetail = {
    id: number;
    startup_name: string;
    category: string | null;
    monthly_visitors: number;
    is_verified?: boolean;
    verification_status?: string;
};

type ListResponse = {
    entries: { id: number }[];
};

async function fetchRankInCategory(category: string | null, entryId: number): Promise<number | null> {
    const params = new URLSearchParams({ sort: 'traffic', page: '1', page_size: '100' });
    if (category) params.set('category', category);
    const res = await fetch(`${ADMIN_API_URL}/api/leaderboard?${params}`, {
        headers: { 'X-API-Key': ADMIN_API_KEY },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ListResponse | EntryDetail[];
    const entries = Array.isArray(data) ? data : data.entries || [];
    const idx = entries.findIndex((e) => e.id === entryId);
    return idx >= 0 ? idx + 1 : null;
}

function escapeXml(s: string): string {
    return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
}

function buildSvg({ rank, category, name }: { rank: number | null; category: string | null; name: string }): string {
    const safeName = escapeXml(name).slice(0, 40);
    const rankLine = rank ? `#${rank} on ${BRAND_NAME}` : `Verified on ${BRAND_NAME}`;
    const subline = rank && category ? `in ${escapeXml(category)}` : 'Real GA4 traffic';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48" role="img" aria-label="${safeName} — ${rankLine}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0b1014"/>
      <stop offset="1" stop-color="#101820"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34d399"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="240" height="48" rx="8" fill="url(#bg)" stroke="#1f2933" stroke-width="1"/>
  <g transform="translate(12,10)">
    <circle cx="14" cy="14" r="14" fill="url(#accent)"/>
    <path d="M9 14 l4 4 l8 -8" fill="none" stroke="#0b1014" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="48" y="22" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="600" fill="#ffffff">${rankLine}</text>
  <text x="48" y="38" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="11" fill="#94a3b8">${subline}</text>
</svg>
`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { id: idParam } = await ctx.params;
    const entryId = parseInt(idParam, 10);
    if (!Number.isFinite(entryId)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const variant = new URL(req.url).searchParams.get('variant') === 'rank' ? 'rank' : 'minimal';

    let entry: EntryDetail | null = null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${entryId}/detail`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            entry = (await res.json()) as EntryDetail;
        }
    } catch {
        // fall through
    }

    if (!entry) {
        const svg = buildSvg({ rank: null, category: null, name: 'Unknown' });
        return new NextResponse(svg, {
            status: 404,
            headers: {
                'Content-Type': 'image/svg+xml; charset=utf-8',
                'Cache-Control': 'public, max-age=300',
            },
        });
    }

    let rank: number | null = null;
    if (variant === 'rank' && entry.category) {
        rank = await fetchRankInCategory(entry.category, entry.id);
    }

    const svg = buildSvg({ rank, category: entry.category, name: entry.startup_name });
    return new NextResponse(svg, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
