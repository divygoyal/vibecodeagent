/**
 * Widget registry (BUILDER.md 7): label, palette group, sizes and a default widget that
 * already shows data on first paint. Isomorphic, no React: the renderers live in
 * components/dashboard-builder/widgets and are looked up by type there.
 *
 * Sizes are in grid units: 12 columns, row height 32 px + 16 px margin (one row = 48 px).
 * Saved layouts store only {i,x,y,w,h}; constraints come from here at render time.
 */
import { getMetric, metricFamily, metricLabel, dimLabel, type Family } from './catalog';
import type {
    MetricRef,
    SourceRef,
    TableColumn,
    WidgetDef,
    WidgetId,
    WidgetType,
} from './types';

export type PaletteGroup = 'Metrics' | 'Charts' | 'Tables and maps' | 'Content' | 'Portfolio';

export interface WidgetMeta {
    type: WidgetType;
    label: string;
    description: string;
    /** lucide-react icon name. */
    icon: string;
    group: PaletteGroup;
    defaultSize: { w: number; h: number };
    minSize: { w: number; h: number };
    maxSize: { w: number; h: number };
    /** Rows on the phone layout (1 column). */
    phoneH: number;
    /** No data query (text, image, section). */
    static: boolean;
    keywords: string[];
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
    scorecard: { type: 'scorecard', label: 'Scorecard', description: 'One number with its change and a sparkline', icon: 'Hash', group: 'Metrics', defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 3 }, maxSize: { w: 6, h: 6 }, phoneH: 3, static: false, keywords: ['kpi', 'number', 'metric', 'total'] },
    'kpi-strip': { type: 'kpi-strip', label: 'KPI strip', description: 'Up to 6 numbers in one row', icon: 'Rows3', group: 'Metrics', defaultSize: { w: 12, h: 3 }, minSize: { w: 4, h: 3 }, maxSize: { w: 12, h: 5 }, phoneH: 3, static: false, keywords: ['kpi', 'numbers', 'summary', 'scorecards'] },
    timeseries: { type: 'timeseries', label: 'Time series', description: 'Metrics over time with a comparison line', icon: 'LineChart', group: 'Charts', defaultSize: { w: 6, h: 7 }, minSize: { w: 4, h: 5 }, maxSize: { w: 12, h: 14 }, phoneH: 5, static: false, keywords: ['line', 'area', 'trend', 'over time', 'chart'] },
    bar: { type: 'bar', label: 'Bar chart', description: 'Top values of a dimension, grouped or stacked', icon: 'BarChart3', group: 'Charts', defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, maxSize: { w: 12, h: 14 }, phoneH: 6, static: false, keywords: ['bar', 'column', 'stacked', 'top', 'ranking', 'list'] },
    pie: { type: 'pie', label: 'Donut', description: 'Parts of a whole, up to 6 slices', icon: 'PieChart', group: 'Charts', defaultSize: { w: 4, h: 7 }, minSize: { w: 3, h: 5 }, maxSize: { w: 6, h: 10 }, phoneH: 6, static: false, keywords: ['pie', 'donut', 'share', 'split'] },
    table: { type: 'table', label: 'Table', description: 'Rows with heat bars, deltas and pages', icon: 'Table2', group: 'Tables and maps', defaultSize: { w: 6, h: 9 }, minSize: { w: 4, h: 6 }, maxSize: { w: 12, h: 18 }, phoneH: 8, static: false, keywords: ['table', 'grid', 'rows', 'pages', 'queries', 'keywords'] },
    geo: { type: 'geo', label: 'Geo map', description: 'Countries shaded by a metric', icon: 'Globe2', group: 'Tables and maps', defaultSize: { w: 6, h: 9 }, minSize: { w: 4, h: 7 }, maxSize: { w: 12, h: 14 }, phoneH: 8, static: false, keywords: ['map', 'country', 'geo', 'world', 'location'] },
    text: { type: 'text', label: 'Text', description: 'Notes and headings in Markdown', icon: 'Type', group: 'Content', defaultSize: { w: 12, h: 2 }, minSize: { w: 2, h: 1 }, maxSize: { w: 12, h: 10 }, phoneH: 2, static: true, keywords: ['text', 'markdown', 'note', 'heading', 'paragraph'] },
    section: { type: 'section', label: 'Section header', description: 'A title and divider between groups', icon: 'Heading', group: 'Content', defaultSize: { w: 12, h: 2 }, minSize: { w: 12, h: 2 }, maxSize: { w: 12, h: 2 }, phoneH: 2, static: true, keywords: ['section', 'divider', 'header', 'title'] },
    image: { type: 'image', label: 'Image', description: 'A logo or picture from an https URL', icon: 'Image', group: 'Content', defaultSize: { w: 3, h: 5 }, minSize: { w: 1, h: 2 }, maxSize: { w: 12, h: 14 }, phoneH: 4, static: true, keywords: ['image', 'logo', 'picture', 'photo'] },
    'portfolio-grid': { type: 'portfolio-grid', label: 'Portfolio grid', description: 'Every site as a card with deltas', icon: 'LayoutGrid', group: 'Portfolio', defaultSize: { w: 12, h: 9 }, minSize: { w: 4, h: 6 }, maxSize: { w: 12, h: 20 }, phoneH: 12, static: false, keywords: ['portfolio', 'sites', 'all sites', 'cards'] },
};

export const PALETTE_ORDER: WidgetType[] = ['scorecard', 'kpi-strip', 'timeseries', 'bar', 'pie', 'table', 'geo', 'portfolio-grid', 'section', 'text', 'image'];
export const PALETTE_GROUPS: PaletteGroup[] = ['Metrics', 'Charts', 'Tables and maps', 'Portfolio', 'Content'];

export function widgetMeta(type: WidgetType): WidgetMeta {
    return WIDGET_META[type] ?? WIDGET_META.text;
}

// ── ids ──────────────────────────────────────────────────────────────────

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function shortId(prefix: string, len = 8): string {
    let s = '';
    const g = (globalThis as { crypto?: Crypto }).crypto;
    if (g?.getRandomValues) {
        const buf = new Uint8Array(len);
        g.getRandomValues(buf);
        for (const b of buf) s += ALPHABET[b % ALPHABET.length];
    } else {
        for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return `${prefix}_${s}`;
}

export const newWidgetId = (): WidgetId => shortId('w', 8);
export const newPageId = (): string => shortId('p', 6);

// ── defaults ─────────────────────────────────────────────────────────────

export interface DefaultCtx {
    /** Families the default source offers. */
    families: { ga4: boolean; gsc: boolean };
    portfolio?: boolean;
}

const m = (id: string): MetricRef => ({ id });

function primaryMetric(ctx: DefaultCtx): string {
    if (ctx.families.gsc && !ctx.families.ga4) return 'gsc:clicks';
    if (ctx.families.ga4) return 'ga4:activeUsers';
    return 'gsc:clicks';
}

export function tableColumns(dimensions: string[], metrics: string[], bars: string[] = []): TableColumn[] {
    return [
        ...dimensions.map((d, i): TableColumn => ({ id: `d:${d}`, kind: 'dimension', ref: d, visual: 'none', pin: i === 0 ? 'left' : undefined, link: d === 'page' || d === 'landingPage' })),
        ...metrics.map((id, i): TableColumn => ({ id: `m:${id}`, kind: 'metric', ref: id, visual: bars.includes(id) || (bars.length === 0 && i === 0) ? 'bar' : 'none', showDelta: true })),
    ];
}

/** A new widget of this type that renders data straight away. */
export function defaultWidget(type: WidgetType, ctx: DefaultCtx, id: WidgetId = newWidgetId()): WidgetDef {
    const source: SourceRef = type === 'portfolio-grid' ? { type: 'portfolio', include: 'all' } : { type: 'default' };
    const metric = primaryMetric(ctx);
    const gsc = metricFamily(metric) === 'gsc';
    const base = { id, source };
    switch (type) {
        case 'scorecard':
            return { ...base, type, config: { metric: m(metric), comparison: { show: true, display: 'percent' }, sparkline: { show: true, kind: 'area' } } };
        case 'kpi-strip': {
            const metrics = ctx.families.gsc && ctx.families.ga4
                ? ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions']
                : gsc ? ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'] : ['ga4:activeUsers', 'ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'];
            return { ...base, type, config: { metrics: metrics.map(m), comparison: { show: true, display: 'percent' }, sparkline: { show: true, kind: 'area' }, columns: 'auto' } };
        }
        case 'timeseries':
            return {
                ...base, type, title: `${metricLabel(metric)} over time`,
                config: { granularity: 'auto', series: [{ metric: m(metric), kind: 'area' }], mode: 'auto', compare: 'inherit', stacked: false, smooth: true, showPoints: 'hover', legend: 'auto', yAxis: { min: 'zero' }, markPreliminary: true },
            };
        case 'bar': {
            const dimension = gsc ? 'query' : 'channel';
            return {
                ...base, type, title: `${metricLabel(metric)} by ${dimLabel(dimension).toLowerCase()}`,
                config: { dimension, metrics: [m(metric)], variant: 'list', orientation: 'horizontal', stacked: false, sort: { by: metric, dir: 'desc' }, top: 8, other: false, showValues: true, showShare: false, compare: 'inherit', colorBy: 'series' },
            };
        }
        case 'pie': {
            const dimension = 'device';
            const pm = gsc ? 'gsc:clicks' : 'ga4:sessions';
            return { ...base, type, title: `${metricLabel(pm)} by device`, config: { dimension, metric: m(pm), top: 5, other: true, donut: true, centerLabel: 'total', legend: 'right', showPercent: true } };
        }
        case 'table': {
            const dims = gsc ? ['query'] : ['page'];
            const metrics = gsc ? ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'] : ['ga4:screenPageViews', 'ga4:activeUsers', 'ga4:averageSessionDuration', 'ga4:bounceRate'];
            return {
                ...base, type, title: gsc ? 'Top queries' : 'Top pages',
                config: { dimensions: dims, columns: tableColumns(dims, metrics), sort: { by: `m:${metrics[0]}`, dir: 'desc' }, pagination: true, pageSize: 10, maxRows: 1000, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false },
            };
        }
        case 'geo': {
            const gm = ctx.families.ga4 ? 'ga4:activeUsers' : 'gsc:clicks';
            return { ...base, type, title: `${metricLabel(gm)} by country`, config: { level: 'country', metric: m(gm), scale: { kind: 'sequential', bins: 'quantile', steps: 5 }, projection: 'naturalEarth', topList: 5, showLegend: true, zoomRegion: 'world' } };
        }
        case 'text':
            return { ...base, type, showTitle: false, config: { markdown: 'Write a note. **Markdown** works, and so do {{date_range}} and {{site}}.', role: 'body', align: 'left', variables: true } };
        case 'section':
            return { ...base, type, showTitle: false, config: { title: 'Section', divider: true, align: 'left' } };
        case 'image':
            return { ...base, type, showTitle: false, config: { src: '', alt: '', fit: 'contain', radius: 'md' } };
        case 'portfolio-grid':
            return {
                ...base, type, title: 'All sites',
                config: { metrics: [m('gsc:clicks'), m('gsc:impressions'), m('ga4:activeUsers'), m('ga4:sessions')], sort: { by: 'gsc:clicks', dir: 'desc' }, show: 'cards', limit: 12, columns: 'auto', sparkline: true, alerts: true, onClick: 'open-site' },
            };
    }
}

// ── derived info ─────────────────────────────────────────────────────────

/** Every metric a widget reads. */
export function widgetMetrics(w: WidgetDef): string[] {
    switch (w.type) {
        case 'scorecard': return [w.config.metric.id];
        case 'kpi-strip': return w.config.metrics.map((x) => x.id);
        case 'timeseries': return w.config.series.map((s) => s.metric.id);
        case 'bar': return w.config.metrics.map((x) => x.id);
        case 'pie': return [w.config.metric.id];
        case 'table': return w.config.columns.filter((c) => c.kind === 'metric' && !c.hidden).map((c) => c.ref);
        case 'geo': return [w.config.metric.id];
        case 'portfolio-grid': return w.config.metrics.map((x) => x.id);
        default: return [];
    }
}

export function widgetFamilies(w: WidgetDef): Family[] {
    const set = new Set<Family>();
    for (const id of widgetMetrics(w)) {
        const f = metricFamily(id);
        if (f) set.add(f);
    }
    return [...set];
}

/** Title shown on the card: the explicit title or one derived from the config. */
export function widgetTitle(w: WidgetDef): string {
    if (w.title) return w.title;
    switch (w.type) {
        case 'scorecard': return w.config.metric.label || metricLabel(w.config.metric.id);
        case 'kpi-strip': return 'Key numbers';
        case 'timeseries': return `${w.config.series.map((s) => s.metric.label || metricLabel(s.metric.id)).join(' and ')} over time`;
        case 'bar': return `${metricLabel(w.config.metrics[0]?.id ?? '')} by ${dimLabel(w.config.dimension).toLowerCase()}`;
        case 'pie': return `${metricLabel(w.config.metric.id)} by ${dimLabel(w.config.dimension).toLowerCase()}`;
        case 'table': return `Top ${w.config.dimensions.map((d) => dimLabel(d).toLowerCase()).join(' and ')}`;
        case 'geo': return `${metricLabel(w.config.metric.id)} by country`;
        case 'text': return 'Text';
        case 'section': return w.config.title;
        case 'image': return w.config.alt || 'Image';
        case 'portfolio-grid': return 'All sites';
    }
}

export function isKnownMetric(id: string): boolean {
    return Boolean(getMetric(id));
}
