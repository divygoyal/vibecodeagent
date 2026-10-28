/**
 * Text fitting for the Open Graph images. satori cannot shrink or ellipsize text, so long names ran under neighbouring
 * boxes. These helpers measure text with the real advance widths of the Geist font files that draw the image (a tiny TTF
 * reader: cmap format 4 + hmtx), then pick a font size, wrap into lines and ellipsize. Pure functions, no node imports.
 */

export type Measure = (text: string, size: number, letterSpacing?: number) => number;

/** Reads the advance widths of a TrueType font: `(text, size, letterSpacing) => px`. Unknown glyphs count as the .notdef width. */
export function fontMeasurer(font: ArrayBuffer | Uint8Array): Measure {
    const bytes = font instanceof Uint8Array ? font : new Uint8Array(font);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tables = new Map<string, number>();
    const numTables = view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
        const at = 12 + i * 16;
        const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
        tables.set(tag, view.getUint32(at + 8));
    }
    const head = tables.get('head') ?? 0;
    const unitsPerEm = view.getUint16(head + 18) || 1000;
    const hhea = tables.get('hhea') ?? 0;
    const hMetrics = view.getUint16(hhea + 34);
    const hmtx = tables.get('hmtx') ?? 0;
    const advance = (gid: number): number => view.getUint16(hmtx + Math.min(gid, hMetrics - 1) * 4);

    // cmap: prefer a format 4 (BMP) subtable.
    const cmap = tables.get('cmap') ?? 0;
    const nSub = view.getUint16(cmap + 2);
    let sub = -1;
    for (let i = 0; i < nSub; i++) {
        const off = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
        if (view.getUint16(off) === 4) { sub = off; break; }
    }
    const segX2 = sub >= 0 ? view.getUint16(sub + 6) : 0;
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    const glyphOf = (code: number): number => {
        for (let s = 0; s < segX2; s += 2) {
            if (code > view.getUint16(ends + s)) continue;
            if (code < view.getUint16(starts + s)) return 0;
            const ro = view.getUint16(ranges + s);
            if (ro === 0) return (code + view.getInt16(deltas + s)) & 0xffff;
            const g = view.getUint16(ranges + s + ro + (code - view.getUint16(starts + s)) * 2);
            return g === 0 ? 0 : (g + view.getInt16(deltas + s)) & 0xffff;
        }
        return 0;
    };
    const cache = new Map<number, number>();
    const unit = (ch: string): number => {
        const code = ch.codePointAt(0) ?? 0;
        let w = cache.get(code);
        if (w === undefined) { w = advance(glyphOf(code)); cache.set(code, w); }
        return w;
    };
    return (text, size, letterSpacing = 0) => {
        let units = 0;
        let n = 0;
        for (const ch of text) { units += unit(ch); n++; }
        return (units / unitsPerEm) * size + n * letterSpacing;
    };
}

/** Greedy word wrap. A word wider than the box goes on its own line (and so overflows: the caller must treat that as "does not fit"). */
export function wrapLines(text: string, measure: Measure, size: number, maxWidth: number, letterSpacing = 0): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next, size, letterSpacing) > maxWidth) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

/** Cuts `text` so that `text…` fits `maxWidth` (a single line). Returns the text unchanged when it already fits. */
export function ellipsize(text: string, measure: Measure, size: number, maxWidth: number, letterSpacing = 0): string {
    if (measure(text, size, letterSpacing) <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && measure(`${text.slice(0, end).trimEnd()}…`, size, letterSpacing) > maxWidth) end--;
    return `${text.slice(0, end).trimEnd()}…`;
}

export type FittedText = { lines: string[]; size: number; truncated: boolean };

/**
 * Picks the largest of `sizes` (descending) at which `text` fits in `maxLines` lines of `maxWidth`. When even the smallest
 * does not fit, it keeps the smallest size and ellipsizes the last line. Never returns a line wider than `maxWidth`.
 */
export function fitText(
    text: string,
    measure: Measure,
    opts: { maxWidth: number; sizes: number[]; maxLines?: number; letterSpacing?: number; maxLinesAt?: (size: number) => number },
): FittedText {
    const { maxWidth, sizes, letterSpacing = 0 } = opts;
    const limit = (size: number) => opts.maxLinesAt?.(size) ?? opts.maxLines ?? 1;
    const clean = text.replace(/\s+/g, ' ').trim();
    for (const size of sizes) {
        const lines = wrapLines(clean, measure, size, maxWidth, letterSpacing);
        if (lines.length <= limit(size) && lines.every((l) => measure(l, size, letterSpacing) <= maxWidth)) return { lines, size, truncated: false };
    }
    const size = sizes[sizes.length - 1];
    const max = limit(size);
    const lines = wrapLines(clean, measure, size, maxWidth, letterSpacing);
    const kept = lines.slice(0, max);
    const rest = lines.slice(kept.length - 1).join(' ');
    kept[kept.length - 1] = ellipsize(rest, measure, size, maxWidth, letterSpacing);
    return { lines: kept, size, truncated: true };
}

/** Largest size from `sizes` (descending) at which a single-line `text` fits `maxWidth`; the smallest when none does. */
export function fitSize(text: string, measure: Measure, opts: { maxWidth: number; sizes: number[]; letterSpacing?: number }): number {
    const { maxWidth, sizes, letterSpacing = 0 } = opts;
    return sizes.find((s) => measure(text, s, letterSpacing) <= maxWidth) ?? sizes[sizes.length - 1];
}

/**
 * Geist's f-ligatures (fi, fl, ff, ffi) are measured as separate glyphs by the image renderer but drawn as one, which
 * leaves a gap after the word ("Verified  traffic"). A zero-width non-joiner between the letters keeps them separate glyphs.
 */
export function noLigatures(text: string): string {
    return text.replace(/f(?=[fijlt])/g, 'f‌');
}
