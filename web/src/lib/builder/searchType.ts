/**
 * Search Console search type (round 8): Google searches (web, the default), Image search, Video search,
 * the News tab, Discover and Google News. A widget reading only Search Console metrics can choose one
 * (WidgetBase.searchType) and a viewer switcher can change it for the widgets in its scope
 * (SearchTypeControl, URL t.<id>).
 *
 * Discover and Google News have no search queries and no position (nobody searched), so a widget that
 * needs either says so instead of asking Google. Isomorphic and pure.
 */
import { expandCalcs } from './calc';
import { getMetric, metricFamilies } from './catalog';
import { widgetMetrics } from './registry';
import type { FilterClause, SearchType, WidgetDef } from './types';

export const SEARCH_TYPES: Array<{ id: SearchType; label: string; short: string; hint: string }> = [
    { id: 'web', label: 'Web search', short: 'Web', hint: 'Google Search results (the default).' },
    { id: 'image', label: 'Image search', short: 'Image', hint: 'Google Images.' },
    { id: 'video', label: 'Video search', short: 'Video', hint: 'The Videos tab and video results.' },
    { id: 'news', label: 'News tab', short: 'News', hint: 'The News tab in Google Search.' },
    { id: 'discover', label: 'Discover', short: 'Discover', hint: 'The Google feed. No search queries, no position.' },
    { id: 'googleNews', label: 'Google News', short: 'Google News', hint: 'news.google.com and the Google News app. No search queries, no position.' },
];

const IDS = new Set<string>(SEARCH_TYPES.map((t) => t.id));

export function isSearchType(v: unknown): v is SearchType {
    return typeof v === 'string' && IDS.has(v);
}

export function searchTypeLabel(t: SearchType): string {
    return SEARCH_TYPES.find((x) => x.id === t)?.label ?? 'Web search';
}

/** Types that have no query dimension and no position (a feed, not a search). */
export function isFeedType(t: SearchType): boolean {
    return t === 'discover' || t === 'googleNews';
}

/**
 * A widget can choose a search type only when every metric it shows comes from Search Console (a chart that
 * mixes Analytics numbers in would put another type's clicks beside web-wide sessions).
 */
export function searchTypeEligible(w: WidgetDef): boolean {
    const ids = widgetMetrics(w);
    if (!ids.length) return false;
    return ids.every((id) => {
        const f = metricFamilies(id);
        return f.length > 0 && f.every((x) => x === 'gsc');
    });
}

/** The type a widget reads: its own setting when it is eligible, else web. */
export function widgetSearchType(w: WidgetDef): SearchType {
    return searchTypeEligible(w) && isSearchType(w.searchType) ? w.searchType : 'web';
}

/**
 * Why a widget cannot show this search type, or null. Discover and Google News have no queries and no
 * position; the check looks at the dimensions, filters and metrics (calculations by their inputs).
 */
export function searchTypeProblem(type: SearchType, parts: { dimensions: string[]; filters?: FilterClause[]; metrics: string[] }): string | null {
    if (!isFeedType(type)) return null;
    const name = searchTypeLabel(type);
    const dims = [...parts.dimensions, ...(parts.filters ?? []).map((f) => f.dimension)];
    if (dims.includes('query')) return `${name} has no search queries. Use another search type, or break down by page, country or device.`;
    const inputs = expandCalcs(parts.metrics);
    if (inputs.some((id) => getMetric(id)?.api === 'position' && getMetric(id)?.family === 'gsc')) return `${name} does not report an average position. Use clicks, impressions or CTR.`;
    return null;
}

/** Search types a widget can switch to as it is set up now (the editor hides the others). */
export function searchTypesFor(w: WidgetDef, extra: { dimensions?: string[] } = {}): SearchType[] {
    const dims = [...extra.dimensions ?? [], ...widgetDimensions(w), ...(w.filters ?? []).map((f) => f.dimension)];
    const metrics = widgetMetrics(w);
    return SEARCH_TYPES.map((t) => t.id).filter((t) => !searchTypeProblem(t, { dimensions: dims, metrics }));
}

/** Dimensions a widget breaks its data down by (a chart's own, a breakdown, a table's rows). */
export function widgetDimensions(w: WidgetDef): string[] {
    switch (w.type) {
        case 'bar': return [w.config.dimension, ...(w.config.stackBy ? [w.config.stackBy] : [])];
        case 'pie': return [w.config.dimension];
        case 'table': return w.config.dimensions;
        case 'timeseries': return w.config.breakdown ? [w.config.breakdown.dimension] : [];
        case 'geo': return w.config.level === 'region' ? ['country', 'region'] : w.config.level === 'city' ? ['country', 'city'] : ['country'];
        default: return [];
    }
}

/**
 * Why a widget's own search type cannot work (null = fine or web): another family's metrics in the widget, or
 * a Discover / Google News widget that needs queries or position.
 */
export function widgetSearchTypeProblem(w: WidgetDef): string | null {
    const t = w.searchType;
    if (!t || t === 'web') return null;
    if (!searchTypeEligible(w)) return 'A search type needs every metric of the widget to come from Search Console.';
    return searchTypeProblem(t, { dimensions: widgetDimensions(w), filters: w.filters, metrics: widgetMetrics(w) });
}
