/**
 * Page subtitles are short facts joined by " · " ("19 open · Traffic Sep 30 – Oct 27 · vs previous 28 days"). Rendered as one
 * string they wrap anywhere ("28" / "days" on its own line, a line starting with "·"). Splitting them into segments lets the
 * view keep each fact on one line and break only between facts, with the dot ending the line before.
 */

export const SEGMENT_SEPARATOR = ' · ';

/** Splits a joined subtitle into its facts. Empty parts are dropped. */
export function splitSegments(text: string): string[] {
    return text.split(SEGMENT_SEPARATOR).map((s) => s.trim()).filter(Boolean);
}

/** Facts for a subtitle from strings (split at " · ") and nodes (kept whole), in order. */
export function subtitleSegments<T>(facts: Array<string | T | null | undefined | false>): Array<string | T> {
    const out: Array<string | T> = [];
    for (const f of facts) {
        if (typeof f === 'string') out.push(...splitSegments(f));
        else if (f) out.push(f);
    }
    return out;
}

/** Whether a segment ends its line with a dot: every segment but the last. */
export const endsWithDot = (index: number, count: number): boolean => index < count - 1;
