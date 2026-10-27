/**
 * Canonical addressing for leaderboard entries. The numeric id never changes; the slug can.
 * The profile page redirects any other spelling to the canonical slug, and the "live now"
 * poll always uses the id so a cached page never calls a slug that no longer exists.
 */

/** The slug (or id when there is none) an entry is published under. */
export function canonicalSegment(entry: { id: number; slug: string | null }): string {
    return entry.slug || String(entry.id);
}

/** The canonical segment when `requested` is a different spelling of the same entry, else null. */
export function canonicalRedirect(requested: string, entry: { id: number; slug: string | null }): string | null {
    const canonical = canonicalSegment(entry);
    return requested === canonical ? null : canonical;
}
