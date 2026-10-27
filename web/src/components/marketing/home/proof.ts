/**
 * Real social proof for the home page: live counts from the public leaderboard
 * API, shown only above a threshold (owner decision, round 2: no invented stats;
 * small numbers would hurt more than they help). Pure, shared with the tests.
 */

/** Below these, a figure is hidden. Owner can tune them (NOTES-R2-HOME, [confirm]). */
export const PROOF_MIN = { listed: 25, verified: 10 } as const;

export interface ProofCounts {
    /** Sites listed and ranked on the public board (the board's `total`). */
    listed: number;
    /** Of those, sites whose owner is verified in Search Console (`verification.level === 'owner'`). */
    verified: number;
}

export interface ProofItem {
    key: 'listed' | 'verified';
    value: number;
    label: string;
}

/** The figures worth showing, in display order; empty when none clears its threshold. */
export function proofItems(counts: ProofCounts | null | undefined, min: { listed: number; verified: number } = PROOF_MIN): ProofItem[] {
    if (!counts) return [];
    const out: ProofItem[] = [];
    if (Number.isFinite(counts.listed) && counts.listed >= min.listed) {
        out.push({ key: 'listed', value: counts.listed, label: 'sites on the leaderboard' });
    }
    if (Number.isFinite(counts.verified) && counts.verified >= min.verified) {
        out.push({ key: 'verified', value: counts.verified, label: 'verified by their owners in Search Console' });
    }
    return out;
}

/** Board rows as the public API returns them (only the fields counted here). */
interface BoardPage {
    total?: unknown;
    rows?: Array<{ verification?: { level?: unknown } | null }>;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Count listed and owner-verified sites from /api/leaderboard (all tabs share one pool on `categories`). */
export async function fetchProofCounts(signal?: AbortSignal): Promise<ProofCounts | null> {
    const url = (page: number) => `/api/leaderboard?tab=categories&range=28d&page_size=${PAGE_SIZE}&page=${page}`;
    const get = async (page: number): Promise<BoardPage | null> => {
        const res = await fetch(url(page), { signal, headers: { Accept: 'application/json' } });
        return res.ok ? ((await res.json()) as BoardPage) : null;
    };
    const first = await get(1);
    if (!first || typeof first.total !== 'number' || !Array.isArray(first.rows)) return null;
    const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
    const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => get(i + 2))) : [];
    if (rest.some((p) => !p)) return { listed: first.total, verified: 0 };
    const rows = [first, ...rest].flatMap((p) => (Array.isArray(p?.rows) ? p!.rows : []));
    return { listed: first.total, verified: rows.filter((r) => r?.verification?.level === 'owner').length };
}
