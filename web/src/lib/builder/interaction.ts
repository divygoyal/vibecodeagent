/**
 * Click to filter (round 2, C8). A widget with interactions.clickToFilter turns a click on a bar,
 * a table row or a map country into a page filter (ControlState.interaction, which compile.ts
 * already applies to every widget). The selection lives in the URL as
 * `x=<dimension>:<value>|...` so filtered views stay linkable. The widget you clicked keeps
 * showing all its values (it ignores selections on its own dimension).
 */
import type { DashboardDocV2, FilterClause, WidgetDef } from './types';

const MAX = 4;

/** The dimension a click on this widget filters by, or null. */
export function clickDimension(w: WidgetDef | undefined): string | null {
    if (!w?.interactions?.clickToFilter) return null;
    switch (w.type) {
        case 'bar': return w.config.dimension;
        case 'table': return w.config.dimensions[0] ?? null;
        case 'geo': return 'country';
        default: return null;
    }
}

/** Widgets that can be clicked to filter, as their dimension set (also bounds what a URL may set). */
export function clickableDims(doc: Pick<DashboardDocV2, 'widgets'>): Set<string> {
    const out = new Set<string>();
    for (const w of Object.values(doc.widgets)) {
        const d = clickDimension(w as WidgetDef);
        if (d && d !== 'date' && d !== 'site') out.add(d);
    }
    return out;
}

export function interactionFromParam(raw: string | null | undefined, allowed?: Set<string>): FilterClause[] {
    if (!raw) return [];
    const out: FilterClause[] = [];
    for (const part of raw.split('|').slice(0, MAX)) {
        const i = part.indexOf(':');
        if (i <= 0) continue;
        const dimension = part.slice(0, i);
        if (!/^[A-Za-z0-9_]{1,40}$/.test(dimension) || (allowed && !allowed.has(dimension))) continue;
        let value: string;
        try {
            value = decodeURIComponent(part.slice(i + 1));
        } catch {
            continue;
        }
        if (!value || value.length > 200) continue;
        const at = out.findIndex((c) => c.dimension === dimension);
        if (at >= 0) out[at] = { dimension, op: 'eq', value };
        else out.push({ dimension, op: 'eq', value });
    }
    return out;
}

/** Add or toggle a selection (clicking the selected value again clears it). */
export function toggleInteraction(cur: FilterClause[], dimension: string, value: string): FilterClause[] {
    const at = cur.findIndex((c) => c.dimension === dimension);
    if (at >= 0 && cur[at].value === value) return cur.filter((_, i) => i !== at);
    const next = at >= 0 ? cur.map((c, i) => (i === at ? { dimension, op: 'eq' as const, value } : c)) : [...cur, { dimension, op: 'eq' as const, value }];
    return next.slice(-MAX);
}
