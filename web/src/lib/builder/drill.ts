/**
 * Drill down (round 8, Looker Studio style "drill down / up"). A bar, pie or table widget with
 * interactions.drill lists the levels below its own dimension (Channel, then Source / medium, then
 * Campaign). A click on a value filters that widget to the value and shows the next level; "Up" goes back.
 *
 * State: ControlState.drill[widgetId] = the values clicked so far, in level order. The URL carries them as
 * `d.<widgetId>=<value>|<value>` (values URI-encoded, like the click-to-filter `x=`), so a link reproduces
 * the view. The state never names a dimension: the dimension of every level comes from the widget's own
 * configured list, so a URL cannot make a widget show or filter by anything the owner did not configure.
 *
 * Public links (share, embed): values are signed keys the server issued with the data
 * (server/access.ts drillKey), never raw text. Each key is bound to the share link, widget, level and the
 * values above it, so a forged or edited key is ignored and a value the viewer was not shown cannot be asked for.
 *
 * Isomorphic and pure (the HMAC lives in server/access.ts).
 */
import { dimInFamily, getDim, metricFamilies } from './catalog';
import { widgetMetrics } from './registry';
import type { ControlState, DimId, FilterClause, WidgetDef } from './types';

export const MAX_DRILL_LEVELS = 3;
export const MAX_DRILL_VALUE = 200;

/** Hierarchies the editor offers: each starts at the widget's own dimension (or any later level). */
export const DRILL_PATHS: Array<{ id: string; label: string; levels: DimId[] }> = [
    { id: 'channel', label: 'Channel, Source / medium, Campaign', levels: ['channel', 'sourceMedium', 'campaign'] },
    { id: 'country', label: 'Country, Region, City', levels: ['country', 'region', 'city'] },
    { id: 'page', label: 'Page, Search Console queries', levels: ['page', 'query'] },
    { id: 'device', label: 'Device, Browser', levels: ['device', 'browser'] },
];

export type DrillWidgetType = 'bar' | 'pie' | 'table';

export function isDrillType(type: string): type is DrillWidgetType {
    return type === 'bar' || type === 'pie' || type === 'table';
}

/** The dimension a drill widget shows before any click. */
export function baseDimension(w: WidgetDef): DimId | null {
    switch (w.type) {
        case 'bar': return w.config.dimension;
        case 'pie': return w.config.dimension;
        case 'table': return w.config.dimensions[0] ?? null;
        default: return null;
    }
}

/** Why a drill list cannot work for this widget (null = fine). Used by the schema and the editor. */
export function drillProblem(w: WidgetDef, levels: DimId[] | undefined = w.interactions?.drill): string | null {
    if (!levels?.length) return null;
    if (!isDrillType(w.type)) return 'Drill down works on bar, pie and table widgets.';
    if (levels.length > MAX_DRILL_LEVELS) return `Drill down has at most ${MAX_DRILL_LEVELS} levels.`;
    const base = baseDimension(w);
    if (!base) return 'The widget has no dimension to drill from.';
    const chain = [base, ...levels];
    if (new Set(chain).size !== chain.length) return 'Each drill level must be a different dimension.';
    const families = [...new Set(widgetMetrics(w).flatMap((id) => metricFamilies(id)))];
    for (const d of chain) {
        const def = getDim(d);
        if (!def || def.kind === 'time' || d === 'site') return `${d} cannot be a drill level.`;
        const bad = families.find((f) => !dimInFamily(d, f));
        if (bad) return `${def.label} is not available for ${bad === 'gsc' ? 'Search Console' : 'Google Analytics'} metrics.`;
    }
    return null;
}

/** The chain a widget drills through ([own dimension, ...levels]), or null when it has no usable drill list. */
export function drillChain(w: WidgetDef): DimId[] | null {
    const runtime = w.interactions?.drillChain;
    if (runtime?.length) return runtime;
    const levels = w.interactions?.drill;
    if (!levels?.length || drillProblem(w, levels)) return null;
    const base = baseDimension(w);
    return base ? [base, ...levels] : null;
}

/**
 * Hierarchies the editor can offer a widget: presets that contain its dimension with levels after it, cut
 * at the first level its metrics cannot show (a Page chart on Analytics metrics cannot drill into queries).
 */
export function drillOptionsFor(w: WidgetDef): Array<{ id: string; label: string; levels: DimId[] }> {
    const base = baseDimension(w);
    if (!base || !isDrillType(w.type)) return [];
    const out: Array<{ id: string; label: string; levels: DimId[] }> = [];
    for (const p of DRILL_PATHS) {
        const at = p.levels.indexOf(base);
        if (at < 0 || at === p.levels.length - 1) continue;
        const levels: DimId[] = [];
        for (const d of p.levels.slice(at + 1)) {
            if (drillProblem(w, [...levels, d])) break;
            levels.push(d);
        }
        if (levels.length) out.push({ id: p.id, label: [base, ...levels].map((d) => getDim(d)?.label ?? d).join(' › '), levels });
    }
    return out;
}

/** What the viewer sees of a widget's drill: the chain, how deep it is and the values chosen so far. */
export interface DrillInfo {
    chain: DimId[];
    /** 0 = the widget's own dimension. */
    depth: number;
    path: string[];
}

export function drillInfo(w: WidgetDef, drill: ControlState['drill']): DrillInfo | null {
    const chain = drillChain(w);
    if (!chain) return null;
    const path = cleanPath(drill?.[w.id], chain.length - 1);
    return { chain, depth: path.length, path };
}

function cleanPath(path: unknown, max: number): string[] {
    if (!Array.isArray(path)) return [];
    const out: string[] = [];
    for (const v of path.slice(0, max)) {
        if (typeof v !== 'string' || !v || v.length > MAX_DRILL_VALUE) break;
        out.push(v);
    }
    return out;
}

/**
 * The widget as the viewer's drill shows it: the dimension of the current level, with the levels above it
 * as filters (drillFilters). Pure and idempotent (a widget that was already drilled comes back as it is).
 * Only the widget's own drill list is used, never the state's names.
 */
export function applyDrill(w: WidgetDef, drill: ControlState['drill']): WidgetDef {
    if (w.interactions?.drillChain) return w;
    const info = drillInfo(w, drill);
    if (!info || info.depth === 0) return w;
    const dim = info.chain[info.depth];
    const old = info.chain[0];
    const interactions = { ...w.interactions, drillChain: info.chain, drillDepth: info.depth };
    switch (w.type) {
        case 'bar': {
            const c = w.config;
            return { ...w, interactions, config: { ...c, dimension: dim, ...(c.stackBy === dim ? { stackBy: undefined } : {}) } };
        }
        case 'pie': return { ...w, interactions, config: { ...w.config, dimension: dim } };
        case 'table': {
            const c = w.config;
            const dimensions = [dim, ...c.dimensions.slice(1).filter((d) => d !== dim)];
            const rest = c.columns.filter((col) => !(col.kind === 'dimension' && (col.ref === dim || col.ref === old)));
            const first = c.columns.find((col) => col.kind === 'dimension' && col.ref === old);
            const dimCols = dimensions.map((d, i) => {
                const kept = c.columns.find((col) => col.kind === 'dimension' && col.ref === d) ?? (i === 0 ? first : undefined);
                return { ...(kept ?? {}), id: `d:${d}`, kind: 'dimension' as const, ref: d, visual: 'none' as const, label: i === 0 ? undefined : kept?.label, link: d === 'page' || d === 'landingPage' };
            });
            const columns = [...dimCols, ...rest.filter((col) => col.kind !== 'dimension')];
            const sort = c.sort.by === `d:${old}` || c.sort.by === old ? { ...c.sort, by: `d:${dim}` } : c.sort;
            return { ...w, interactions, config: { ...c, dimensions, columns, sort } };
        }
        default: return w;
    }
}

/** The clauses that keep a drilled widget on the values clicked (the levels above its current one). */
export function drillFilters(w: WidgetDef, drill: ControlState['drill']): FilterClause[] {
    const chain = w.interactions?.drillChain;
    const depth = w.interactions?.drillDepth ?? 0;
    if (!chain || !depth) return [];
    const path = cleanPath(drill?.[w.id], chain.length - 1);
    return chain.slice(0, Math.min(depth, path.length)).map((dimension, i) => ({ dimension, op: 'eq' as const, value: path[i] }));
}

/**
 * Drill state a request may carry: only widgets with a valid drill list, never deeper than their list,
 * values of a sane size. Owner requests use this on the cleaned body; the dimension is never read from it.
 */
export function sanitizeDrill(widgets: Record<string, WidgetDef> | WidgetDef[], drill: ControlState['drill']): ControlState['drill'] {
    if (!drill) return undefined;
    const list = Array.isArray(widgets) ? Object.fromEntries(widgets.map((w) => [w.id, w])) : widgets;
    const out: Record<string, string[]> = {};
    for (const [id, path] of Object.entries(drill)) {
        const w = list[id];
        const chain = w ? drillChain(w) : null;
        if (!chain) continue;
        const clean = cleanPath(path, chain.length - 1);
        if (clean.length) out[id] = clean;
    }
    return Object.keys(out).length ? out : undefined;
}

/** True when a widget (as saved) has a drill list that works; for the widget's own validation. */
export function drillValid(w: WidgetDef): boolean {
    return drillProblem(w) === null;
}

// ── URL form ─────────────────────────────────────────────────────────────

/** `d.<widgetId>` query keys use widget ids, which are [A-Za-z0-9_-] (schema.ts). */
export const DRILL_PARAM = 'd.';

export function drillToParam(path: string[]): string | null {
    return path.length ? path.map((v) => encodeURIComponent(v)).join('|') : null;
}

/** Turn one URL part into a path entry, or null to stop reading (the rest of the path is dropped). */
export type DrillResolver = (widgetId: string, level: number, raw: string, parents: string[]) => string | null;

/** Owner and local state: the URI-decoded value, as long as it is a plain value of a sane size. */
export const resolveDrillValue: DrillResolver = (_id, _level, raw) => {
    let v: string;
    try {
        v = decodeURIComponent(raw);
    } catch {
        return null;
    }
    return v && v.length <= MAX_DRILL_VALUE && v !== '(other)' ? v : null;
};

const KEY_RE = /^[A-Za-z0-9_-]{1,300}\.[A-Za-z0-9_-]{16}$/;

/** Public pages: a signed key from the server, kept as it is in the URL (the server checks it). */
export const keepDrillKey: DrillResolver = (_id, _level, raw) => (KEY_RE.test(raw) ? raw : null);

/**
 * Drill state from a query string. Only widgets that have a valid drill list are read, never deeper than
 * the list; `resolve` decides what a URL part means (a value for owners, a signed key for public links).
 */
export function drillFromParams(q: URLSearchParams, widgets: Record<string, WidgetDef> | undefined, resolve: DrillResolver): ControlState['drill'] {
    if (!widgets) return undefined;
    const out: Record<string, string[]> = {};
    for (const [id, w] of Object.entries(widgets)) {
        const chain = drillChain(w);
        const raw = chain ? q.get(`${DRILL_PARAM}${id}`) : null;
        if (!chain || !raw) continue;
        const path: string[] = [];
        for (const part of raw.split('|').slice(0, chain.length - 1)) {
            const v = resolve(id, path.length, part, path);
            if (v === null) break;
            path.push(v);
        }
        if (path.length) out[id] = path;
    }
    return Object.keys(out).length ? out : undefined;
}

/** Go one level down by a clicked value (replaces anything below the current level). */
export function drillDown(path: string[], depth: number, value: string): string[] {
    return [...path.slice(0, depth), value];
}

/** Back to `depth` levels (0 = the widget's own dimension). */
export function drillTo(path: string[], depth: number): string[] {
    return path.slice(0, Math.max(0, depth));
}

// ── Signed keys (public links) ───────────────────────────────────────────

/** Base64url of the UTF-8 text (isomorphic: Node and browsers have btoa, TextEncoder). */
export function b64urlEncode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): string | null {
    try {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
        return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
        return null;
    }
}

/** The value inside a signed key, for showing the breadcrumb (not a check: the server verifies). */
export function drillKeyLabel(key: string): string {
    const i = key.lastIndexOf('.');
    return (i > 0 ? b64urlDecode(key.slice(0, i)) : null) ?? key;
}
