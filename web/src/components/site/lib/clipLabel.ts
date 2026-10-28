/**
 * Shorten to `max` characters, never mid-word: paths keep their first folder and a tail that starts at a word
 * ("/blog/…product-market-fit"), other text its start up to the last whole word.
 */
export function clipLabel(s: string, max: number): string {
    if (s.length <= max) return s;
    if (s.startsWith('/') && max >= 12) {
        const head = s.indexOf('/', 1) > 0 && s.indexOf('/', 1) < max / 2 ? s.indexOf('/', 1) + 1 : 1;
        let tail = s.slice(s.length - (max - head - 1));
        // Start the tail after a separator, so no word is cut ("oduct-market-fit" -> "market-fit").
        const cut = tail.search(/[-_/.]/);
        if (cut >= 0 && cut < tail.length - 3) {
            tail = tail.slice(cut + 1);
            return `${s.slice(0, head)}…${tail}`;
        }
        return `${s.slice(0, max - 1)}…`;
    }
    const start = s.slice(0, Math.max(1, max - 1));
    const space = start.search(/[\s\-_/][^\s\-_/]*$/);
    return `${space > max / 2 ? start.slice(0, space) : start}…`;
}
