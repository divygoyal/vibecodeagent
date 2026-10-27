/**
 * Click-to-filter on Traffic (DESIGN round 2): a few equality filters on GA4
 * dimensions. Pure and shared by the client (URL state, chips) and
 * /api/site/ga4 (which turns them into one GA4 `dimensionFilter`).
 *
 * URL: `?country=France&source=google&device=mobile` on the Traffic page;
 * the API gets them as repeated `f=<key>:<value>` params.
 */

export const FILTER_DEFS = {
    channel: { dim: 'sessionDefaultChannelGroup', label: 'Channel' },
    source: { dim: 'sessionSource', label: 'Source' },
    country: { dim: 'country', label: 'Country' },
    city: { dim: 'city', label: 'City' },
    device: { dim: 'deviceCategory', label: 'Device' },
    browser: { dim: 'browser', label: 'Browser' },
    os: { dim: 'operatingSystem', label: 'OS' },
    language: { dim: 'language', label: 'Language' },
    /** Page viewed (GA4 pagePath, as reported). Not `page`: the Pages screen uses ?page= for its drawer. */
    path: { dim: 'pagePath', label: 'Page' },
    landing: { dim: 'landingPage', label: 'Landing page' },
} as const;

export type FilterKey = keyof typeof FILTER_DEFS;
export type SiteFilters = Partial<Record<FilterKey, string>>;

export const FILTER_KEYS = Object.keys(FILTER_DEFS) as FilterKey[];
const MAX_VALUE = 500;

export function isFilterKey(v: unknown): v is FilterKey {
    return typeof v === 'string' && v in FILTER_DEFS;
}

/** Drop unknown keys, empty and over-long values. */
export function cleanFilters(input: Partial<Record<string, string | null | undefined>>): SiteFilters {
    const out: SiteFilters = {};
    for (const k of FILTER_KEYS) {
        const v = input[k];
        if (typeof v === 'string' && v.length > 0 && v.length <= MAX_VALUE) out[k] = v;
    }
    return out;
}

export function hasFilters(f: SiteFilters | null | undefined): boolean {
    return Boolean(f && FILTER_KEYS.some((k) => f[k]));
}

/** API params: ['country:France', 'source:google'] (stable order, for cache keys). */
export function filtersToParams(f: SiteFilters): string[] {
    return FILTER_KEYS.filter((k) => f[k]).map((k) => `${k}:${f[k]}`);
}

/** Parse repeated `f=<key>:<value>` params. The value may contain ':' (android-app://...). */
export function parseFilterParams(values: string[]): SiteFilters {
    const raw: Record<string, string> = {};
    for (const v of values.slice(0, FILTER_KEYS.length)) {
        const i = v.indexOf(':');
        if (i <= 0) continue;
        raw[v.slice(0, i)] = v.slice(i + 1);
    }
    return cleanFilters(raw);
}

type GaExpr = Record<string, unknown>;

/** One GA4 dimensionFilter (EXACT matches, AND-ed), or null without filters. */
export function ga4DimensionFilter(f: SiteFilters): GaExpr | null {
    const exprs: GaExpr[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
        filter: { fieldName: FILTER_DEFS[k].dim, stringFilter: { matchType: 'EXACT', value: f[k], caseSensitive: true } },
    }));
    if (!exprs.length) return null;
    return exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
}

/** AND two optional GA4 filter expressions. */
export function andFilters(a: GaExpr | null | undefined, b: GaExpr | null | undefined): GaExpr | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return { andGroup: { expressions: [a, b] } };
}
