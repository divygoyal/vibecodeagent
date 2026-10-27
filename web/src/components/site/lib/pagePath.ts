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

