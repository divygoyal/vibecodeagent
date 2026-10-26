/** Server-side fetchers for the public leaderboard pages (server components, OG image, embed). */
import { lbAdmin } from './admin';
import { DEFAULT_RANGE, RANGES, TABS } from './constants';
import type { BoardResponse, BoardTab, EmbedPayload, ProfilePayload, RangeKey } from './types';

const TAB_SET = new Set<string>(TABS.map((t) => t.value));
const RANGE_SET = new Set<string>(RANGES.map((r) => r.value));
const SLUG_OR_ID_RE = /^[a-z0-9-]{1,150}$/;

export function parseTab(v: string | string[] | undefined): BoardTab {
    const s = Array.isArray(v) ? v[0] : v;
    return (s && TAB_SET.has(s) ? s : 'top') as BoardTab;
}

export function parseRange(v: string | string[] | undefined): RangeKey {
    const s = Array.isArray(v) ? v[0] : v;
    return (s && RANGE_SET.has(s) ? s : DEFAULT_RANGE) as RangeKey;
}

export interface BoardQuery {
    tab: BoardTab;
    range: RangeKey;
    category?: string;
    country?: string;
    q?: string;
    open_to?: string;
    page?: number;
    page_size?: number;
}

const EMPTY_BOARD = (q: BoardQuery): BoardResponse => ({
    tab: q.tab, range: q.range, focus: q.tab === 'search' ? 'clicks' : 'visitors', rows: [], total: 0,
    page: q.page ?? 1, pageSize: q.page_size ?? 25, categories: [], sponsored: [], open_slot_total: 0, updated_at: null,
});

export async function getBoard(q: BoardQuery): Promise<BoardResponse> {
    const res = await lbAdmin<BoardResponse>('/api/lb/board', {
        query: { tab: q.tab, range: q.range, category: q.category, country: q.country, q: q.q?.slice(0, 80), open_to: q.open_to, page: q.page ?? 1, page_size: q.page_size ?? 25 },
        revalidate: 60,
        timeoutMs: 8_000,
    });
    return res.ok && res.data ? res.data : EMPTY_BOARD(q);
}

export async function getProfile(idOrSlug: string, range: RangeKey): Promise<ProfilePayload | null> {
    if (!SLUG_OR_ID_RE.test(idOrSlug)) return null;
    const res = await lbAdmin<ProfilePayload>(`/api/lb/profile/${encodeURIComponent(idOrSlug)}`, { query: { range }, revalidate: 60, timeoutMs: 8_000 });
    return res.ok ? res.data : null;
}

export async function getEmbed(idOrSlug: string, range: RangeKey = DEFAULT_RANGE): Promise<EmbedPayload | null> {
    if (!SLUG_OR_ID_RE.test(idOrSlug)) return null;
    const res = await lbAdmin<EmbedPayload>(`/api/lb/embed/${encodeURIComponent(idOrSlug)}`, { query: { range }, revalidate: 60, timeoutMs: 6_000 });
    return res.ok ? res.data : null;
}
