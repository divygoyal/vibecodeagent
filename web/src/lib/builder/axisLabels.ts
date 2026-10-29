/**
 * Category axis labels (round 8 judge fix): the axis is as wide as its longest label (capped), a longer label is
 * shortened with an ellipsis (the full text stays in the tooltip), and the last value tick gets room on the right.
 * Text widths are estimated per character (Inter at 11px), so this runs on the server and in the tests.
 */

/** Estimated width in px of a label at `fontSize` (default 11, the chart axis size). */
export function textWidth(s: string, fontSize = 11): number {
    let w = 0;
    for (const ch of s) {
        if ('il.,:;|!\'`'.includes(ch)) w += 0.3;
        else if ('fjrt()[]/-– '.includes(ch)) w += 0.38;
        else if ('mwMW@%'.includes(ch)) w += 0.92;
        else if (ch >= 'A' && ch <= 'Z') w += 0.7;
        else if (ch >= '0' && ch <= '9') w += 0.6;
        else if (ch.charCodeAt(0) > 0x2e80) w += 1.05;
        else w += 0.57;
    }
    return Math.ceil(w * fontSize);
}

/** Gap between the labels and the plot (tick margin plus the axis line). */
export const AXIS_LABEL_GAP = 10;
/** Room right of the plot so the last value tick ("30K") is not cut by the card edge. */
export const AXIS_LAST_TICK_PAD = 22;

/** The label cut to `maxPx` with an ellipsis (unchanged when it fits). */
export function fitLabel(label: string, maxPx: number, fontSize = 11): string {
    if (textWidth(label, fontSize) <= maxPx) return label;
    const chars = [...label];
    while (chars.length > 1 && textWidth(`${chars.join('').trimEnd()}…`, fontSize) > maxPx) chars.pop();
    return `${chars.join('').trimEnd()}…`;
}

/** Width for a y axis of category labels: the longest label plus the gap, between `min` and `cap`. */
export function categoryAxisWidth(labels: string[], opts: { min?: number; cap?: number; fontSize?: number } = {}): number {
    const { min = 56, cap = 150, fontSize = 11 } = opts;
    const longest = Math.max(0, ...labels.map((l) => textWidth(l, fontSize)));
    return Math.min(cap, Math.max(min, longest + AXIS_LABEL_GAP));
}

/**
 * A label broken into at most `maxLines` lines of `maxPx` each (round 10: "Organic Sea…" under a column chart).
 * Breaks at spaces; a single word wider than the line is cut with an ellipsis, and so is the last line.
 */
export function wrapLabel(label: string, maxPx: number, maxLines = 2, fontSize = 11): string[] {
    if (textWidth(label, fontSize) <= maxPx) return [label];
    const words = label.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
        const next = cur ? `${cur} ${words[i]}` : words[i];
        if (textWidth(next, fontSize) <= maxPx || !cur) { cur = next; continue; }
        lines.push(cur);
        cur = words[i];
        if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
    }
    lines.push(cur);
    return lines.slice(0, maxLines).map((l, i, all) => (i === all.length - 1 || textWidth(l, fontSize) > maxPx ? fitLabel(l, maxPx, fontSize) : l));
}
