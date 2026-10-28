/**
 * Saved views (round 9, BUILDER-COMPARISON row 28): a named bookmark of everything the viewer set on a dashboard
 * (page, dates, comparison, filters, click-to-filter, switchers, drill down). The state already lives in the URL,
 * so a view is just that query string:
 *  - the owner keeps named views in the dashboard doc (`doc.views`, no table), picks one as the default and sees
 *    them in the Views menu;
 *  - share viewers never get the list (it holds the owner's site ids and drilled values); they copy a link to
 *    their current view, and the owner's default view reaches them only as a query the share allows
 *    (`publicDefaultQuery`: no site picks, no drill values, no date or comparison the share locks).
 * Pure and isomorphic (no zod: the schema lives in schema.ts).
 */
import { viewerMayCompare } from './compare';
import type { DashboardDocV2, DateControl, SavedView } from './types';

export const MAX_VIEWS = 20;
export const MAX_VIEW_NAME = 60;
export const MAX_VIEW_QUERY = 2000;

/** `dv=0`: the viewer cleared everything, so the owner's default view must not come back. */
export const NO_DEFAULT_KEY = 'dv';
const EXACT_KEYS = new Set(['page', 'range', 'from', 'to', 'compare', 'x', NO_DEFAULT_KEY]);
const PREFIXES = ['f.', 's.', 'm.', 'g.', 't.', 'd.'];

/** URL keys that carry viewer state (everything else, like tv, embed, theme, preview, stays out of a view). */
export function isStateKey(key: string): boolean {
    return EXACT_KEYS.has(key) || PREFIXES.some((p) => key.startsWith(p) && key.length > p.length && key.length <= 70);
}

/** True when the URL carries dates, filters, switchers or drill state. A bare page tab does not count. */
export function hasViewState(sp: URLSearchParams): boolean {
    for (const k of sp.keys()) if (k !== 'page' && isStateKey(k)) return true;
    return false;
}

/** The state part of a query, keys sorted, so two links to the same view compare equal. */
export function stateQuery(sp: URLSearchParams | string, opts: { page?: boolean } = {}): string {
    const src = typeof sp === 'string' ? new URLSearchParams(sp) : sp;
    const out = new URLSearchParams();
    const keys = [...new Set([...src.keys()].filter((k) => isStateKey(k) && (opts.page !== false || k !== 'page')))].sort();
    for (const k of keys) {
        const v = src.get(k);
        if (v !== null && v !== '') out.set(k, v);
    }
    return out.toString();
}

/**
 * A query a view may store: state keys only, within the size limit; null when it is empty or too long.
 * The page tab is not part of a view (opening a view keeps the page you are on); a link carries it.
 */
export function cleanViewQuery(q: string): string | null {
    const s = stateQuery(q.startsWith('?') ? q.slice(1) : q, { page: false });
    if (!s || s.length > MAX_VIEW_QUERY) return null;
    return s;
}

/** The query the page works from: the default view's state when the URL has none, else the URL itself. */
export function effectiveParams(sp: URLSearchParams, defaultQuery: string | undefined): URLSearchParams {
    if (!defaultQuery || hasViewState(sp)) return sp;
    const merged = new URLSearchParams(defaultQuery);
    for (const [k, v] of sp) merged.set(k, v);
    return merged;
}

export function newViewId(): string {
    return `v_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** Views with the name taken by a new one; names compare without case or surrounding spaces. */
export function viewByName(doc: Pick<DashboardDocV2, 'views'>, name: string): SavedView | undefined {
    const n = name.trim().toLowerCase();
    return (doc.views ?? []).find((v) => v.name.trim().toLowerCase() === n);
}

export type ViewResult = { ok: true; doc: DashboardDocV2; view: SavedView } | { ok: false; error: string };

/** Saves the current state under a name; the same name replaces that view (its id and default flag stay). */
export function saveView(doc: DashboardDocV2, name: string, query: string): ViewResult {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return { ok: false, error: 'Give the view a name.' };
    if (clean.length > MAX_VIEW_NAME) return { ok: false, error: `Use at most ${MAX_VIEW_NAME} characters.` };
    const q = cleanViewQuery(query);
    if (!q) return { ok: false, error: 'Nothing to save: this is the dashboard as it opens.' };
    const existing = viewByName(doc, clean);
    if (existing) {
        const view = { ...existing, name: clean, query: q };
        return { ok: true, doc: { ...doc, views: (doc.views ?? []).map((v) => (v.id === existing.id ? view : v)) }, view };
    }
    if ((doc.views ?? []).length >= MAX_VIEWS) return { ok: false, error: `At most ${MAX_VIEWS} saved views. Delete one first.` };
    const view: SavedView = { id: newViewId(), name: clean, query: q };
    return { ok: true, doc: { ...doc, views: [...(doc.views ?? []), view] }, view };
}

/** Removes a view; the default falls back to none when it was the default. */
export function removeView(doc: DashboardDocV2, id: string): DashboardDocV2 {
    const views = (doc.views ?? []).filter((v) => v.id !== id);
    const next: DashboardDocV2 = { ...doc, views: views.length ? views : undefined };
    if (doc.defaultViewId === id) delete next.defaultViewId;
    return next;
}

/** The default view (null = the dashboard opens as designed). Ignores an id that is not a saved view. */
export function setDefaultView(doc: DashboardDocV2, id: string | null): DashboardDocV2 {
    const next = { ...doc };
    if (id && (doc.views ?? []).some((v) => v.id === id)) next.defaultViewId = id;
    else delete next.defaultViewId;
    return next;
}

export function defaultViewOf(doc: Pick<DashboardDocV2, 'views' | 'defaultViewId'>): SavedView | undefined {
    return doc.defaultViewId ? (doc.views ?? []).find((v) => v.id === doc.defaultViewId) : undefined;
}

/** True when the current URL state is exactly this view. */
export function viewIsCurrent(view: SavedView, sp: URLSearchParams): boolean {
    return stateQuery(view.query, { page: false }) === stateQuery(sp, { page: false });
}

/** What `doc.views` must satisfy: valid names and queries, unique ids and names, a known default. */
export function savedViewProblem(doc: Pick<DashboardDocV2, 'views' | 'defaultViewId'>): string | null {
    const views = doc.views ?? [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const v of views) {
        if (ids.has(v.id)) return `saved view id ${v.id} is used twice`;
        ids.add(v.id);
        const n = v.name.trim().toLowerCase();
        if (!n || v.name.length > MAX_VIEW_NAME) return 'a saved view has an invalid name';
        if (names.has(n)) return `two saved views are named "${v.name}"`;
        names.add(n);
        if (cleanViewQuery(v.query) !== v.query) return `saved view "${v.name}" holds a query that is not view state`;
    }
    if (doc.defaultViewId && !ids.has(doc.defaultViewId)) return 'the default view is not a saved view';
    return null;
}

/**
 * The owner's default view as a share link may carry it: the same state keys, minus what must not reach
 * a viewer (site picks hold the owner's site ids, drill values are the owner's rows) and minus whatever the
 * share does not let viewers change (dates, comparison, filters and click-to-filter).
 */
export function publicDefaultQuery(
    doc: Pick<DashboardDocV2, 'views' | 'defaultViewId' | 'pages'> & { controls: DashboardDocV2['controls'] },
    share: { viewerControls: { date: boolean; compare: boolean; filters: boolean } },
): string | undefined {
    const view = defaultViewOf(doc);
    if (!view) return undefined;
    const dc = doc.controls.find((c): c is DateControl => c.type === 'date');
    const date = share.viewerControls.date && (dc?.viewerCanChange ?? true);
    const compare = dc ? viewerMayCompare(share.viewerControls, dc) : share.viewerControls.date && share.viewerControls.compare;
    const filters = share.viewerControls.filters;
    const visible = new Set(doc.pages.filter((p) => !p.hidden).map((p) => p.id));
    const out = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(view.query)) {
        if (k === 'page') { if (visible.has(v)) out.set(k, v); continue; }
        if (k === 'range' || k === 'from' || k === 'to') { if (date) out.set(k, v); continue; }
        if (k === 'compare') { if (compare) out.set(k, v); continue; }
        if (k === NO_DEFAULT_KEY || k.startsWith('s.') || k.startsWith('d.')) continue;
        if (k.startsWith('f.') || k === 'x') { if (filters) out.set(k, v); continue; }
        out.set(k, v); // m.<id>, g.<id>, t.<id>: the server still checks them against the control's options
    }
    return out.toString() || undefined;
}

/** A link to the viewer's current view: the page's own path plus the state keys only (page included). */
export function viewLink(origin: string, pathname: string, sp: URLSearchParams): string {
    const q = stateQuery(sp);
    return `${origin}${pathname}${q ? `?${q}` : ''}`;
}
