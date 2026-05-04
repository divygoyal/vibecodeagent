'use client';

import type { ReactNode } from 'react';
import { Children, isValidElement, cloneElement } from 'react';

/**
 * B5-full — heuristic inline number highlighting.
 *
 * Wraps "data" tokens in a styled span so users can scan an answer at a
 * glance and pick out the metrics. Without server-side citation tagging
 * this is purely visual emphasis — but it's a real readability win for
 * verdict-shaped answers full of numbers (which is most of them).
 *
 * Patterns matched:
 *   • Numbers with thousand separators       (12,847 / 1,200,000)
 *   • Percentages with optional sign          (-12.5% / +23% / 89%)
 *   • Dollar values                           ($6,688 / $50/mo / $2.4k)
 *   • Position prefixes                       (pos 7 / Pos 3-10 / position 8)
 *
 * Skips short numbers (< 100 with no separator/percent/$/pos prefix) so
 * we don't highlight things like dates or list indices.
 *
 * Used by ChatMessageRenderer's <p>, <li>, <td>, <strong> renderers via
 * the highlightNumbersInChildren helper, which recursively walks ReactMarkdown's
 * mixed string + element children.
 */

// Order matters — longer / more-specific patterns first.
const PATTERNS = [
    // $1,234,567 / $50/mo / $2.4k
    { type: 'currency' as const, re: /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\/[a-z]+)?(?:[a-z])?/g },
    // -23.5% / +12% / 89% (signed percentages first so they don't get sub-matched)
    { type: 'percent' as const, re: /[-+]?\d+(?:\.\d+)?%/g },
    // pos 7 / Pos 3-10 / position 8
    { type: 'position' as const, re: /\b[Pp](?:os|osition)?\s\d+(?:-\d+)?\b/g },
    // 12,847 / 1,200,000 (must have at least one comma to qualify)
    { type: 'thousand' as const, re: /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g },
    // bare integers ≥ 100 — last so it doesn't gobble parts of currency / percent matches
    { type: 'big' as const, re: /\b\d{3,}\b/g },
];

const TONE: Record<string, string> = {
    currency: 'text-emerald-300 font-semibold',
    percent: 'text-cyan-300 font-semibold',
    position: 'text-amber-300 font-semibold',
    thousand: 'text-zinc-100 font-semibold tabular-nums',
    big: 'text-zinc-100 font-semibold tabular-nums',
};

interface Match {
    start: number;
    end: number;
    text: string;
    type: keyof typeof TONE;
}

/** Scan a string for ALL pattern matches, return them sorted by position
 *  with overlaps removed (first-pattern-wins). */
function findMatches(s: string): Match[] {
    const all: Match[] = [];
    for (const { type, re } of PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(s)) !== null) {
            all.push({ start: m.index, end: m.index + m[0].length, text: m[0], type });
        }
    }
    // Sort by start; remove overlaps (later matches that start within an earlier one).
    all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const filtered: Match[] = [];
    let cursor = 0;
    for (const m of all) {
        if (m.start >= cursor) {
            filtered.push(m);
            cursor = m.end;
        }
    }
    return filtered;
}

/** Wrap matched substrings in styled spans within a single string. */
function highlightString(s: string, keyPrefix: string): ReactNode {
    if (!s) return s;
    const matches = findMatches(s);
    if (matches.length === 0) return s;
    const parts: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
        if (m.start > cursor) parts.push(s.slice(cursor, m.start));
        parts.push(
            <span key={`${keyPrefix}-${i}`} className={TONE[m.type]} title="data point">
                {m.text}
            </span>
        );
        cursor = m.end;
    });
    if (cursor < s.length) parts.push(s.slice(cursor));
    return <>{parts}</>;
}

/** Recursively walk ReactMarkdown children — strings get highlighted,
 *  elements pass through (we don't recurse into elements to keep the
 *  scope narrow and avoid double-highlighting inside <code> spans). */
export function highlightNumbersInChildren(children: ReactNode, keyPrefix = 'hn'): ReactNode {
    if (typeof children === 'string') {
        return highlightString(children, keyPrefix);
    }
    if (Array.isArray(children)) {
        return Children.map(children, (child, i) => {
            if (typeof child === 'string') {
                return highlightString(child, `${keyPrefix}-${i}`);
            }
            // Pass elements through — don't recurse into <code> / <a> etc.
            // Specifically skip code blocks (numbers in code shouldn't be styled).
            if (isValidElement(child)) {
                const type = (child as any).type;
                const isCode = type === 'code' || (typeof type === 'string' && type.toLowerCase() === 'code');
                if (isCode) return child;
                return cloneElement(child, { key: child.key ?? `${keyPrefix}-${i}` });
            }
            return child;
        });
    }
    return children;
}
