/**
 * How a page path is shown in page lists (Pages card, Pages table, Traffic pages):
 * the path is the main line, "/" reads "/ (home)", and a long path is shortened in
 * the middle so its last segment stays visible ("/es/tools/…/generator").
 * Pure (no React), shared by components/site/PagePath.tsx and the tests.
 */

/** "/" -> "/ (home)"; anything else unchanged. Also for 'docs.acme.com' (another host's home). */
export function pageLabel(display: string): string {
    const d = display || '/';
    return d === '/' ? '/ (home)' : d;
}

/**
 * Split a display path for middle shortening: the head shrinks with an ellipsis,
 * the tail (the last segment, with its slash) stays. '/es/tools/ai/generator' ->
 * ['/es/tools/ai', '/generator']; one segment or the home page -> [whole, ''].
 */
export function splitPagePath(display: string): [string, string] {
    const d = pageLabel(display);
    const i = d.lastIndexOf('/');
    if (i <= 0 || i === d.length - 1) return [d, ''];
    return [d.slice(0, i), d.slice(i)];
}


// ─── Page titles (GA4 pageTitle) ──────────────────────────────────────────

/** Separators sites put between a page name and the brand: "Pricing | Acme", "Pricing – Acme", "Acme · Pricing". */
const TITLE_SEPARATORS = [' | ', ' – ', ' — ', ' - ', ' · ', ' • ', ' :: '];

function splitAtSeparator(title: string, from: 'end' | 'start'): [string, string] | null {
    let best = -1;
    let sep = '';
    for (const s of TITLE_SEPARATORS) {
        const i = from === 'end' ? title.lastIndexOf(s) : title.indexOf(s);
        if (i <= 0) continue;
        if (best < 0 || (from === 'end' ? i > best : i < best)) {
            best = i;
            sep = s;
        }
    }
    return best < 0 ? null : [title.slice(0, best).trim(), title.slice(best + sep.length).trim()];
}

/** A usable GA4 title: trimmed, not empty and not GA4's "(not set)". */
export function usableTitle(raw: string | null | undefined): string | null {
    const t = (raw ?? '').replace(/\s+/g, ' ').trim();
    return t && t !== '(not set)' ? t : null;
}

/**
 * The brand that a site repeats in its page titles, as a suffix ("… | Acme Analytics") or a prefix
 * ("Acme · …"): the most common part after the last (or before the first) separator, when at least
 * a quarter of the titles (and at least 2) share it. Null when titles share nothing.
 */
export function titleBrand(titles: (string | null | undefined)[]): { text: string; at: 'end' | 'start' } | null {
    const list = titles.map(usableTitle).filter((t): t is string => Boolean(t));
    if (list.length < 2) return null;
    let best: { text: string; at: 'end' | 'start'; n: number } | null = null;
    for (const at of ['end', 'start'] as const) {
        const counts = new Map<string, number>();
        for (const t of list) {
            const parts = splitAtSeparator(t, at);
            const brand = parts ? (at === 'end' ? parts[1] : parts[0]) : null;
            if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
        }
        for (const [text, n] of counts) {
            if (n >= 2 && n >= list.length / 4 && (!best || n > best.n)) best = { text, at, n };
        }
    }
    return best ? { text: best.text, at: best.at } : null;
}

/**
 * A page title without the site's brand ("How to measure product-market fit | Acme Analytics" ->
 * "How to measure product-market fit"). A title that is only the brand (often the home page) stays.
 */
export function cleanTitle(raw: string | null | undefined, brand: { text: string; at: 'end' | 'start' } | null): string | null {
    const t = usableTitle(raw);
    if (!t || !brand) return t;
    const parts = splitAtSeparator(t, brand.at);
    if (!parts) return t;
    const [a, b] = parts;
    const rest = brand.at === 'end' ? (b === brand.text ? a : null) : (a === brand.text ? b : null);
    return rest || t;
}
