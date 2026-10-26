/**
 * v1 -> v2 dashboard migration (BUILDER.md 6.7). Pure and lazy: it runs on every read of a
 * row whose schema_version is 1 and is persisted only when the user saves. v1 columns are never
 * rewritten, so rolling the code back shows the original dashboard.
 *
 * Known, intentional changes (release notes): GSC widgets follow the date picker; engagement
 * rate, sessions per user, pages per session and "medium" show the right numbers; "Users" is
 * activeUsers everywhere; custom v1 colours are no longer rendered (palette is fixed).
 */
import { normalizeHost } from '@/lib/sites/pairing';
import { tableColumns } from './registry';
import type {
    DashboardDocV2,
    FilterClause,
    GridLayouts,
    LayoutItem,
    MetricRef,
    SourceRef,
    ThemeV2,
    WidgetDef,
} from './types';

/** v1 row as the admin API returns it (loosely typed on purpose: old rows vary). */
export interface V1Row {
    id?: string;
    name?: string;
    description?: string | null;
    propertyId?: string | null;
    siteUrl?: string | null;
    widgets?: unknown;
    gridLayouts?: unknown;
    theme?: unknown;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const GSC_METRICS = new Set(['clicks', 'impressions', 'ctr', 'position']);
const GA4_SAME = new Set(['sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'engagementRate', 'newUsers', 'sessionsPerUser', 'screenPageViewsPerSession', 'engagedSessions', 'keyEvents', 'eventCount', 'totalRevenue']);

export function migrateMetric(v1: string | undefined, dataSource: string | undefined): string {
    if (!v1) return dataSource === 'gsc' ? 'gsc:clicks' : 'ga4:activeUsers';
    if (GSC_METRICS.has(v1)) return `gsc:${v1}`;
    if (v1 === 'totalUsers' || v1 === 'activeUsers' || v1 === 'users') return 'ga4:activeUsers';
    if (v1 === 'pageViews' || v1 === 'pageviews' || v1 === 'views') return 'ga4:screenPageViews';
    if (v1 === 'conversions') return 'ga4:keyEvents';
    if (GA4_SAME.has(v1)) return `ga4:${v1}`;
    return dataSource === 'gsc' ? 'gsc:clicks' : 'ga4:activeUsers';
}

const DIM_MAP: Record<string, string> = {
    date: 'date', source: 'sourceMedium', medium: 'medium', channelGrouping: 'channel', channel: 'channel',
    page: 'page', pagePath: 'page', country: 'country', city: 'city', deviceCategory: 'device', device: 'device',
    browser: 'browser', operatingSystem: 'os', query: 'query', landingPage: 'landingPage',
};

export function migrateDimension(v1: string | undefined, fallback: string): string {
    if (!v1) return fallback;
    return DIM_MAP[v1] ?? fallback;
}

function tablePreset(family: 'ga4' | 'gsc', dimension: string): { dims: string[]; metrics: string[] } {
    if (family === 'gsc') return { dims: [dimension === 'page' ? 'page' : 'query'], metrics: ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'] };
    if (dimension === 'page' || dimension === 'landingPage') return { dims: [dimension], metrics: ['ga4:screenPageViews', 'ga4:activeUsers', 'ga4:averageSessionDuration', 'ga4:bounceRate'] };
    return { dims: [dimension], metrics: ['ga4:sessions', 'ga4:activeUsers', 'ga4:bounceRate'] };
}

function migrateFilters(raw: unknown): FilterClause[] | undefined {
    if (!Array.isArray(raw) || !raw.length) return undefined;
    const ops: Record<string, FilterClause['op']> = { equals: 'eq', contains: 'contains', not_equals: 'neq', regex: 'regex' };
    const out: FilterClause[] = [];
    for (const f of raw) {
        if (!isObj(f) || !str(f.dimension) || typeof f.value !== 'string') continue;
        out.push({ dimension: migrateDimension(str(f.dimension), str(f.dimension)!), op: ops[String(f.operator)] ?? 'eq', value: f.value });
    }
    return out.length ? out : undefined;
}

function migrateWidget(raw: Obj): WidgetDef {
    const id = str(raw.id) ?? `w_v1${Math.random().toString(36).slice(2, 8)}`;
    const type = str(raw.type) ?? 'unknown';
    const ds = str(raw.dataSource);
    const title = str(raw.title);
    const source: SourceRef = { type: 'default' };
    const metricId = migrateMetric(str(raw.metric), ds);
    const metric: MetricRef = { id: metricId };
    const filters = migrateFilters(raw.filters);
    const common = { id, title, source, ...(filters ? { filters } : {}) };

    switch (type) {
        case 'kpi':
            return { ...common, type: 'scorecard', config: { metric, comparison: { show: raw.showComparison !== false, display: 'percent' }, sparkline: { show: true, kind: 'area' } } };
        case 'area-chart': {
            const dimension = migrateDimension(str(raw.dimension), 'date');
            const chartType = str(raw.chartType);
            if (dimension !== 'date') {
                return { ...common, type: 'bar', config: { dimension, metrics: [metric], variant: 'chart', orientation: 'horizontal', stacked: false, sort: { by: metricId, dir: 'desc' }, top: 10, other: false, showValues: false, showShare: false, compare: 'off', colorBy: 'series' } };
            }
            const kind = chartType === 'line' ? 'line' : chartType === 'bar' ? 'bar' : 'area';
            return { ...common, type: 'timeseries', config: { granularity: 'auto', series: [{ metric, kind }], mode: 'auto', compare: 'off', stacked: false, smooth: true, showPoints: 'hover', legend: 'auto', yAxis: { min: 'zero' }, markPreliminary: true } };
        }
        case 'bar-chart': {
            const dimension = migrateDimension(str(raw.dimension), ds === 'gsc' ? 'query' : 'sourceMedium');
            return { ...common, type: 'bar', config: { dimension, metrics: [metric], variant: 'chart', orientation: 'horizontal', stacked: false, sort: { by: metricId, dir: 'desc' }, top: 10, other: false, showValues: false, showShare: false, compare: 'off', colorBy: 'series' } };
        }
        case 'donut-chart': {
            const dimension = migrateDimension(str(raw.dimension), 'channel');
            const pm: MetricRef = raw.metric ? metric : { id: ds === 'gsc' ? 'gsc:clicks' : 'ga4:sessions' };
            return { ...common, type: 'pie', config: { dimension, metric: pm, top: 5, other: true, donut: true, centerLabel: 'total', legend: 'right', showPercent: true } };
        }
        case 'table': {
            const family = ds === 'gsc' ? 'gsc' : 'ga4';
            const dimension = migrateDimension(str(raw.dimension), family === 'gsc' ? 'query' : 'page');
            const p = tablePreset(family, dimension);
            return { ...common, type: 'table', config: { dimensions: p.dims, columns: tableColumns(p.dims, p.metrics), sort: { by: `m:${p.metrics[0]}`, dir: 'desc' }, pagination: true, pageSize: 10, maxRows: 1000, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false } };
        }
        case 'text': {
            const content = typeof raw.content === 'string' ? raw.content : '';
            return { ...common, type: 'text', showTitle: false, config: { markdown: content, role: content.length < 80 ? 'heading' : 'body', align: 'left', variables: false } };
        }
        case 'seo-performance':
            return {
                ...common, type: 'timeseries',
                config: { granularity: 'auto', series: [{ metric: { id: 'gsc:clicks' }, kind: 'line', axis: 'left' }, { metric: { id: 'gsc:impressions' }, kind: 'line', axis: 'right' }], mode: 'overlay', compare: 'off', stacked: false, smooth: true, showPoints: 'hover', legend: 'auto', yAxis: { min: 'zero' }, markPreliminary: true },
            };
        case 'keywords-table': {
            const metrics = ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'];
            return { ...common, type: 'table', config: { dimensions: ['query'], columns: tableColumns(['query'], metrics, ['gsc:clicks']), sort: { by: 'm:gsc:clicks', dir: 'desc' }, pagination: true, pageSize: 10, maxRows: 1000, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false } };
        }
        default:
            return { ...common, type: 'text', showTitle: false, config: { markdown: `Unsupported widget (${type})`, role: 'note', align: 'left', variables: false } };
    }
}

/** v1 lg layout (12 columns, half-height rows) to v2 rows of 32px. */
function migrateLayoutItems(raw: unknown, ids: Set<string>): LayoutItem[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: LayoutItem[] = [];
    for (const it of raw) {
        if (!isObj(it) || !str(it.i) || !ids.has(it.i as string)) continue;
        const w = Math.min(12, Math.max(1, Math.round(num(it.w, 3))));
        const x = Math.min(Math.max(0, Math.round(num(it.x, 0))), 12 - w);
        const y = Math.max(0, Math.round(num(it.y, 0))) * 2;
        const h = Math.max(1, Math.round(num(it.h, 2))) * 2;
        out.push({ i: it.i as string, x, y, w, h });
    }
    return out;
}

function luminance(hex: string): number | null {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function migrateTheme(raw: unknown): ThemeV2 {
    const t = isObj(raw) ? raw : {};
    const bg = str(t.backgroundColor);
    const lum = bg ? luminance(bg) : null;
    const preset = str(t.preset) ?? 'default';
    const dark = lum !== null ? lum < 0.5 : preset !== 'light';
    const pos = str(t.logoPosition);
    return {
        mode: dark ? 'dark' : 'light',
        header: {
            show: Boolean(str(t.companyName) || str(t.logoUrl)),
            companyName: str(t.companyName),
            logoUrl: str(t.logoUrl),
            logoPosition: pos === 'top-center' ? 'center' : pos === 'top-right' ? 'right' : 'left',
            showDates: true,
        },
        badge: { show: t.showTrafficClawBranding !== false },
        legacy: Object.keys(t).length ? t : undefined,
    };
}

/** siteId for a v1 row: the site host, else 'ga4-<digits>'. */
export function v1SiteId(propertyId?: string | null, siteUrl?: string | null): string {
    const host = siteUrl ? normalizeHost(siteUrl) : '';
    if (host) return host;
    const digits = (propertyId ?? '').replace(/\D/g, '');
    return digits ? `ga4-${digits}` : 'unknown-site';
}

export function migrateV1toV2(row: V1Row, now: Date = new Date()): DashboardDocV2 {
    const rawWidgets = Array.isArray(row.widgets) ? row.widgets.filter(isObj) : [];
    const widgets: Record<string, WidgetDef> = {};
    for (const raw of rawWidgets) {
        const w = migrateWidget(raw);
        if (!widgets[w.id]) widgets[w.id] = w;
    }
    const ids = new Set(Object.keys(widgets));
    const gl = isObj(row.gridLayouts) ? row.gridLayouts : {};
    const lg = migrateLayoutItems(gl.lg, ids) ?? [];
    // Widgets missing from lg get stacked at the bottom so nothing disappears.
    const placed = new Set(lg.map((l) => l.i));
    let bottom = lg.reduce((mx, l) => Math.max(mx, l.y + l.h), 0);
    for (const id of ids) {
        if (placed.has(id)) continue;
        lg.push({ i: id, x: 0, y: bottom, w: 6, h: 6 });
        bottom += 6;
    }
    // Only lg carries over. v1 md/sm layouts came from the old grid (other column counts,
    // often every item at x=0), so tablet and phone layouts are derived from lg the same way
    // the editor derives them (docOps.layoutFor): view, editor and public link match.
    const layouts: GridLayouts = { lg };

    const propertyId = str(row.propertyId);
    const siteUrl = str(row.siteUrl);
    const ga4 = propertyId && propertyId !== 'multi' ? (propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId.replace(/\D/g, '')}`) : undefined;

    return {
        schemaVersion: 2,
        name: str(row.name) ?? 'Untitled dashboard',
        description: str(row.description ?? undefined),
        defaultSource: { type: 'site', siteId: v1SiteId(propertyId, siteUrl), ga4, gsc: siteUrl },
        controls: [{ id: 'date', type: 'date', default: { kind: 'preset', id: '30d' }, defaultCompare: { mode: 'previous_period' }, viewerCanChange: true, viewerCanCompare: true }],
        pages: [{ id: 'p_main', title: 'Overview', layouts }],
        widgets,
        theme: migrateTheme(row.theme),
        settings: { widthMode: 'contained', autoRefreshSec: 0 },
        meta: { migratedFromV1: { at: now.toISOString(), propertyId: propertyId ?? '', siteUrl } },
    };
}
