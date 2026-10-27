/**
 * TrafficClaw builder round 2: sixteen new templates, additive.
 *
 * Drop-in for web/src/lib/builder/ (see round2/builder-templates-themes.md, part A, for how it is
 * wired into templates.ts). The eight shipped builders in templates.ts are NOT touched.
 *
 * Verified 2026-10-27 against tc/integrate: `tsc --noEmit` clean, every doc passes validateDoc,
 * every widget evaluates against the demo generator without error, no layout overlaps. Three widgets
 * are empty on demo data only because the demo has no such rows (landing-pages/w_noconv,
 * local-seo/w_near and w_loc).
 *
 * Fields the app does not know yet (themeId, tv, cover, widthMode, autoRefreshSec on the builder
 * result) are optional round 2 additions: buildFromTemplate copies them into theme.id,
 * settings.tv, theme.cover and settings once the matching features exist, and ignores them before.
 */
import { tableColumns } from '@/lib/builder/registry';
import { AI_SOURCE_PATTERN } from '@/components/site/lib/rules';
import type {
    BarWidget,
    ControlDef,
    ControlScope,
    DashboardDocV2,
    DateControl,
    DatePresetId,
    CompareSpec,
    FilterClause,
    FilterControl,
    GeoWidget,
    KpiStripWidget,
    LayoutItem,
    PageDef,
    PieWidget,
    PortfolioGridWidget,
    ScorecardWidget,
    SectionWidget,
    SourceRef,
    TableWidget,
    TextWidget,
    ThemeV2,
    TimeSeriesWidget,
    WidgetDef,
} from '@/lib/builder/types';

// ── kit (moves unchanged from templates.ts into templateKit.ts and gets exported) ─────────
const D: SourceRef = { type: 'default' };
const COMPARE = { show: true, display: 'percent' as const };
const SPARK = { show: true, kind: 'area' as const };

export const kpi = (id: string, metrics: string[], title?: string): KpiStripWidget => ({
    id, type: 'kpi-strip', title, showTitle: Boolean(title), source: D,
    config: { metrics: metrics.map((m) => ({ id: m })), comparison: COMPARE, sparkline: SPARK, columns: 'auto' },
});

export const ts = (id: string, title: string, metrics: string[], opts: Partial<TimeSeriesWidget['config']> = {}): TimeSeriesWidget => ({
    id, type: 'timeseries', title, source: D,
    config: {
        granularity: 'auto', series: metrics.map((m, i) => ({ metric: { id: m }, kind: i === 0 ? 'area' : 'line' })), mode: metrics.length > 1 ? 'overlay' : 'auto',
        compare: 'inherit', stacked: false, smooth: true, showPoints: 'hover', legend: 'auto', yAxis: { min: 'zero' }, markPreliminary: true, ...opts,
    },
});

export const breakdownTs = (id: string, title: string, metric: string, dimension: string): TimeSeriesWidget =>
    ts(id, title, [metric], { breakdown: { dimension, top: 5, other: true }, stacked: true, compare: 'off', series: [{ metric: { id: metric }, kind: 'area' }] });

export const barList = (id: string, title: string, dimension: string, metric: string, opts: Partial<BarWidget['config']> = {}): BarWidget => ({
    id, type: 'bar', title, source: D,
    config: { dimension, metrics: [{ id: metric }], variant: 'list', orientation: 'horizontal', stacked: false, sort: { by: metric, dir: 'desc' }, top: 8, other: false, showValues: true, showShare: false, compare: 'inherit', colorBy: 'series', ...opts },
});

export const pie = (id: string, title: string, dimension: string, metric: string): PieWidget => ({
    id, type: 'pie', title, source: D,
    config: { dimension, metric: { id: metric }, top: 5, other: true, donut: true, centerLabel: 'total', legend: 'right', showPercent: true },
});

export const table = (id: string, title: string, dims: string[], metrics: string[], opts: Partial<TableWidget['config']> & { bars?: string[] } = {}): TableWidget => {
    const { bars, ...rest } = opts;
    return {
        id, type: 'table', title, source: D,
        config: {
            dimensions: dims, columns: tableColumns(dims, metrics, bars), sort: { by: `m:${metrics[0]}`, dir: 'desc' }, pagination: true, pageSize: 10,
            maxRows: 1000, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false, ...rest,
        },
    };
};

export const geo = (id: string, title: string, metric: string): GeoWidget => ({
    id, type: 'geo', title, source: D,
    config: { level: 'country', metric: { id: metric }, scale: { kind: 'sequential', bins: 'quantile', steps: 5 }, projection: 'naturalEarth', topList: 5, showLegend: true, zoomRegion: 'world' },
});

export const text = (id: string, markdown: string, role: TextWidget['config']['role'] = 'body'): TextWidget => ({
    id, type: 'text', showTitle: false, source: D, config: { markdown, role, align: 'left', variables: true },
});

// ── new kit helpers ──────────────────────────────────────────────────────

/** One number with comparison and sparkline (the registry type existed; templates never used it). */
export const score = (id: string, title: string, metric: string): ScorecardWidget => ({
    id, type: 'scorecard', title, showTitle: true, source: D,
    config: { metric: { id: metric }, comparison: COMPARE, sparkline: SPARK },
});

export const section = (id: string, title: string, subtitle?: string): SectionWidget => ({
    id, type: 'section', showTitle: false, source: D, config: { title, subtitle, divider: true, align: 'left' },
});

/** Widget-level filters (compile.ts already applies them; the Setup tab gets a UI in round 2). */
export const only = <W extends WidgetDef>(w: W, filters: FilterClause[]): W => ({ ...w, filters });

export const gridCompact = (id: string): PortfolioGridWidget => ({
    id, type: 'portfolio-grid', title: 'Sites, biggest drops first', source: { type: 'portfolio', include: 'all' },
    config: { metrics: [{ id: 'gsc:clicks' }, { id: 'ga4:sessions' }], sort: { by: 'change', dir: 'asc' }, show: 'compact', limit: 50, columns: 1, sparkline: true, alerts: true, onClick: 'open-site' },
});

type Cell = [WidgetDef, number, number];
type Rec = Record<string, WidgetDef>;

/**
 * Tables in the new templates must fit their tile: the first (dimension) column gets a width so
 * long URLs truncate, and change chips stay on the first metric only (first two on wide tables
 * with more than five metrics). Columns are never hidden: row thresholds may need them.
 */
function fitTable(w: WidgetDef, cw: number): WidgetDef {
    if (w.type !== 'table') return w;
    const metrics = w.config.columns.filter((c) => c.kind === 'metric').length;
    if (cw > 6 && metrics <= 5) return w;
    const keep = cw > 6 ? 2 : 1;
    let n = 0;
    const columns = w.config.columns.map((col, i) => {
        if (col.kind !== 'metric') return i === 0 && cw <= 6 ? { ...col, width: cw <= 4 ? 140 : 200 } : col;
        n++;
        return { ...col, showDelta: n <= keep };
    });
    return { ...w, config: { ...w.config, columns } };
}

function page(id: string, title: string, rows: Cell[][], into: Rec): PageDef {
    const lg: LayoutItem[] = [];
    let y = 0;
    for (const row of rows) {
        let x = 0;
        let h = 0;
        for (const [w0, cw, ch] of row) {
            const w = fitTable(w0, cw);
            into[w.id] = w;
            lg.push({ i: w.id, x, y, w: cw, h: ch });
            x += cw;
            h = Math.max(h, ch);
        }
        y += h;
    }
    return { id, title, layouts: { lg } };
}

// ── controls ─────────────────────────────────────────────────────────────

const dateControl = (preset: DatePresetId = '28d', compare: CompareSpec = { mode: 'previous_period' }, locked = false): DateControl => ({
    id: 'date', type: 'date', default: { kind: 'preset', id: preset }, defaultCompare: compare, viewerCanChange: !locked, viewerCanCompare: !locked,
});

const ALL: ControlScope = { mode: 'all' };
const pick = (id: string, label: string, dimension: string, ui: FilterControl['ui'] = 'multiselect', scope: ControlScope = ALL): FilterControl =>
    ({ id, type: 'filter', label, dimension, ui, scope, viewerCanChange: true });
const country = () => pick('f_country', 'Country', 'country');
const device = () => pick('f_device', 'Device', 'device', 'select');
const channel = () => pick('f_channel', 'Channel', 'channel');
const pageContains = (scope: ControlScope = ALL) => pick('f_page', 'Page contains', 'page', 'search', scope);
const queryContains = (scope: ControlScope = ALL) => pick('f_query', 'Query contains', 'query', 'search', scope);

const SEARCH_COLS = ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'];
const AI: FilterClause = { dimension: 'source', op: 'regex', value: AI_SOURCE_PATTERN };

/** Brand word(s) from a site id: "www.acme-analytics.com" -> "acme[ -]?analytics". Editable in the widget filter. */
export function brandRegex(siteId: string | undefined): string {
    const host = (siteId ?? '').toLowerCase().replace(/^(sc-domain:|https?:\/\/)/, '').replace(/^www\./, '').split('/')[0];
    const label = host.split('.')[0] || 'yourbrand';
    return label.split('-').filter(Boolean).join('[ -]?');
}

// ── builders ─────────────────────────────────────────────────────────────

export interface BuildCtx { defaultSource: DashboardDocV2['defaultSource'] }
export interface BuiltR2 {
    pages: PageDef[];
    widgets: Rec;
    controls: ControlDef[];
    theme?: ThemeV2;
    /** Round 2 additions, ignored until the theme and TV features exist. */
    themeId?: string;
    tv?: { rotateSec: number; hideControls: boolean };
    cover?: { title: string; subtitle: string; layout?: 'left' | 'center' | 'split' };
    autoRefreshSec?: 0 | 300 | 900 | 1800 | 3600;
    widthMode?: 'contained' | 'full';
}

export const BUILDERS_R2: Record<string, (ctx: BuildCtx) => BuiltR2> = {
    // 1 ───────────────────────────────────────────────────────────────────
    'executive-summary': () => {
        const w: Rec = {};
        return {
            widgets: w, themeId: 'executive',
            controls: [dateControl('28d')],
            pages: [page('p_main', 'Summary', [
                [[text('w_intro', '## {{site}} at a glance\n{{date_range}}, {{compare_range}}.', 'heading'), 12, 2]],
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents', 'ga4:engagementRate']), 12, 3]],
                [[ts('w_search', 'Search clicks', ['gsc:clicks']), 6, 7], [ts('w_users', 'Users', ['ga4:activeUsers']), 6, 7]],
                [[breakdownTs('w_channels', 'Sessions by channel', 'ga4:sessions', 'channel'), 8, 8], [pie('w_devices', 'Devices', 'device', 'ga4:sessions'), 4, 8]],
                [[table('w_gain', 'Pages gaining clicks', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, pageSize: 5 }), 6, 8],
                    [table('w_lose', 'Pages losing clicks', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, pageSize: 5 }), 6, 8]],
                [[text('w_notes', '### Highlights and next steps\n- The one result worth celebrating\n- The one thing we are fixing\n- What we need from you', 'callout'), 12, 4]],
            ], w)],
        };
    },

    // 2 ───────────────────────────────────────────────────────────────────
    'landing-pages': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('28d'), pageContains(), device(), country()],
            pages: [page('p_main', 'Landing pages', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents', 'ga4:sessionKeyEventRate']), 12, 3]],
                [[ts('w_clicks', 'Search clicks', ['gsc:clicks']), 6, 7], [ts('w_sessions', 'Sessions', ['ga4:sessions']), 6, 7]],
                [[table('w_blend', 'Search and on-site results by page', ['page'], ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position', 'ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'], { bars: ['gsc:clicks', 'ga4:keyEvents'], search: true, maxRows: 2000 }), 12, 10]],
                [[table('w_ga4lp', 'Where visits start (Analytics)', ['landingPage'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:bounceRate', 'ga4:averageSessionDuration', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:sessions'], maxRows: 2000 }), 12, 9]],
                [[table('w_noconv', 'Lots of visits, few key events', ['page'], ['ga4:sessions', 'ga4:keyEvents', 'gsc:clicks'], { rowFilters: [{ metric: 'ga4:sessions', op: 'gte', value: 100 }, { metric: 'ga4:keyEvents', op: 'lt', value: 3 }], maxRows: 2000, bars: ['ga4:sessions'] }), 6, 9],
                    [table('w_lowctr', 'Seen a lot, clicked little', ['page'], ['gsc:impressions', 'gsc:ctr', 'gsc:clicks', 'gsc:position'], { rowFilters: [{ metric: 'gsc:impressions', op: 'gte', value: 500 }, { metric: 'gsc:ctr', op: 'lt', value: 0.02 }], maxRows: 2000, bars: ['gsc:impressions'], rules: [{ column: 'm:gsc:ctr', op: 'lt', value: 0.01, style: 'bad' }] }), 6, 9]],
            ], w)],
        };
    },

    // 3 ───────────────────────────────────────────────────────────────────
    'seo-opportunities': () => {
        const w: Rec = {};
        return {
            widgets: w, themeId: 'analyst',
            controls: [dateControl('28d'), country(), device(), queryContains()],
            pages: [page('p_main', 'Opportunities', [
                [[kpi('w_kpis', SEARCH_COLS), 12, 3]],
                [[text('w_how', '### How to read this page\nEach table is a short list of work. **Striking distance** queries already sit on page two or the bottom of page one, so a better title, a clearer answer near the top and a few internal links can move them up. **Low CTR** queries are seen a lot and clicked little: rewrite the title and description first.', 'callout'), 12, 3]],
                [[table('w_striking', 'Striking distance: position 8 to 20', ['query'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:position', op: 'between', value: [8, 20] }, { metric: 'gsc:impressions', op: 'gte', value: 100 }], bars: ['gsc:impressions'], sort: { by: 'm:gsc:impressions', dir: 'desc' }, maxRows: 5000 }), 6, 10],
                    [table('w_lowctr', 'Page one, low CTR', ['query'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:position', op: 'between', value: [1, 10] }, { metric: 'gsc:impressions', op: 'gte', value: 500 }, { metric: 'gsc:ctr', op: 'lt', value: 0.03 }], bars: ['gsc:impressions'], sort: { by: 'm:gsc:impressions', dir: 'desc' }, maxRows: 5000, rules: [{ column: 'm:gsc:ctr', op: 'lt', value: 0.015, style: 'bad' }] }), 6, 10]],
                [[table('w_pages', 'Pages with untapped impressions', ['page'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:impressions', op: 'gte', value: 500 }, { metric: 'gsc:position', op: 'between', value: [4, 20] }], bars: ['gsc:impressions'], sort: { by: 'm:gsc:impressions', dir: 'desc' }, maxRows: 5000 }), 12, 9]],
                [[table('w_rising', 'Queries rising fastest', ['query'], ['gsc:clicks', 'gsc:impressions', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, maxRows: 5000, pageSize: 10 }), 6, 9],
                    [table('w_falling', 'Queries falling fastest', ['query'], ['gsc:clicks', 'gsc:impressions', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, maxRows: 5000, pageSize: 10 }), 6, 9]],
            ], w)],
        };
    },

    // 4 ───────────────────────────────────────────────────────────────────
    'keyword-cannibalization': () => {
        const w: Rec = {};
        return {
            widgets: w, themeId: 'analyst',
            controls: [dateControl('90d', { mode: 'none' }), country(), device(), queryContains(), pageContains()],
            pages: [page('p_main', 'Cannibalization', [
                [[text('w_what', '### When two of your pages compete\nIf several pages get impressions for the same query, Google may swap between them and neither ranks as well as one strong page could. Sort by impressions, find a query that appears on two or more pages, then decide: **merge** the pages and 301 redirect, **point internal links** at the one you want to win, set a **canonical**, or **re-target** the weaker page at a long-tail variation.', 'callout'), 12, 4]],
                [[kpi('w_kpis', SEARCH_COLS), 12, 3]],
                [[table('w_pairs', 'Queries and the pages that answer them', ['query', 'page'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:impressions', op: 'gte', value: 50 }], bars: ['gsc:impressions'], sort: { by: 'm:gsc:impressions', dir: 'desc' }, maxRows: 5000, search: true, pageSize: 25 }), 12, 14]],
                [[ts('w_impr', 'Impressions', ['gsc:impressions']), 6, 7], [barList('w_countries', 'Countries', 'country', 'gsc:impressions'), 6, 7]],
            ], w)],
        };
    },

    // 5 ───────────────────────────────────────────────────────────────────
    'brand-vs-nonbrand': (ctx) => {
        const w: Rec = {};
        const brand = brandRegex(ctx.defaultSource.type === 'site' ? ctx.defaultSource.siteId : undefined);
        // Round 2: the brand words are a dashboard variable, edited once for every widget (and by viewers).
        const brandVar: ControlDef = { id: 'brand', type: 'variable', label: 'Brand words', kind: 'regex', default: brand, viewerCanChange: true };
        const isBrand: FilterClause = { dimension: 'query', op: 'regex', value: '{{var:brand}}' };
        const notBrand: FilterClause = { dimension: 'query', op: 'not_regex', value: '{{var:brand}}' };
        const three = ['gsc:clicks', 'gsc:impressions', 'gsc:ctr'];
        return {
            widgets: w,
            controls: [dateControl('28d'), country(), device(), brandVar],
            pages: [page('p_main', 'Brand and non-brand', [
                [[text('w_note', '### Brand terms\nBrand searches are queries that match `{{var:brand}}`. Change **Brand words** above to edit them for every widget at once. Brand clicks show demand you already have; non-brand clicks show how well you win new visitors.', 'callout'), 12, 3]],
                [[only(kpi('w_kb', three, 'Brand searches'), [isBrand]), 6, 4], [only(kpi('w_kn', three, 'Non-brand searches'), [notBrand]), 6, 4]],
                [[only(ts('w_tb', 'Brand clicks', ['gsc:clicks']), [isBrand]), 6, 7], [only(ts('w_tn', 'Non-brand clicks', ['gsc:clicks']), [notBrand]), 6, 7]],
                [[only(table('w_qb', 'Top brand queries', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), [isBrand]), 6, 9], [only(table('w_qn', 'Top non-brand queries', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), [notBrand]), 6, 9]],
                [[only(table('w_pb', 'Pages that win brand searches', ['page'], SEARCH_COLS, { bars: ['gsc:clicks'] }), [isBrand]), 6, 8], [only(table('w_pn', 'Pages that win non-brand searches', ['page'], SEARCH_COLS, { bars: ['gsc:clicks'] }), [notBrand]), 6, 8]],
            ], w)],
        };
    },

    // 6 ───────────────────────────────────────────────────────────────────
    'ai-traffic': () => {
        const w: Rec = {};
        const ai = [AI];
        return {
            widgets: w,
            controls: [dateControl('90d'), country(), device()],
            pages: [
                page('p_ai', 'AI assistants', [
                    [[text('w_note', '### Visits from AI assistants\nSessions that arrive from ChatGPT, Perplexity, Claude, Gemini, Copilot and similar. Google Analytics only sees **clicks that carry a referrer**: some AI visits arrive as Direct, and mentions that nobody clicks cannot be measured here.', 'callout'), 12, 3]],
                    [[only(kpi('w_kpis', ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:averageSessionDuration', 'ga4:keyEvents', 'ga4:sessionKeyEventRate']), ai), 12, 3]],
                    [[only(breakdownTs('w_trend', 'AI sessions by assistant', 'ga4:sessions', 'source'), ai), 8, 8], [only(pie('w_share', 'Share by assistant', 'source', 'ga4:sessions'), ai), 4, 8]],
                    [[only(table('w_sources', 'Assistants', ['source'], ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:averageSessionDuration', 'ga4:keyEvents'], { bars: ['ga4:sessions'] }), ai), 6, 9],
                        [only(table('w_landing', 'Pages AI visitors land on', ['landingPage'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'], { bars: ['ga4:sessions'] }), ai), 6, 9]],
                ], w),
                page('p_compare', 'AI compared with other channels', [
                    [[only(ts('w_ai_ts', 'AI sessions', ['ga4:sessions']), ai), 6, 7], [only(ts('w_org_ts', 'Organic search sessions', ['ga4:sessions']), [{ dimension: 'channel', op: 'eq', value: 'Organic Search' }]), 6, 7]],
                    [[barList('w_eng', 'Engagement rate by channel (all traffic)', 'channel', 'ga4:engagementRate', { top: 8 }), 6, 8], [barList('w_dur', 'Average session duration by channel (all traffic)', 'channel', 'ga4:averageSessionDuration', { top: 8 }), 6, 8]],
                    [[table('w_channels', 'All channels', ['channel'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:averageSessionDuration', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:sessions'] }), 12, 8]],
                ], w),
            ],
        };
    },

    // 7 ───────────────────────────────────────────────────────────────────
    'ecommerce-funnel': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('28d'), channel(), device(), country()],
            pages: [
                page('p_rev', 'Revenue', [
                    [[kpi('w_kpis', ['ga4:totalRevenue', 'ga4:transactions', 'ga4:averagePurchaseRevenue', 'ga4:purchaserRate', 'ga4:sessionKeyEventRate', 'ga4:ecommercePurchases']), 12, 3]],
                    [[ts('w_revenue', 'Revenue', ['ga4:totalRevenue']), 8, 7], [pie('w_rdev', 'Revenue by device', 'device', 'ga4:totalRevenue'), 4, 7]],
                    [[breakdownTs('w_rchan', 'Revenue by channel', 'ga4:totalRevenue', 'channel'), 6, 8], [geo('w_geo', 'Revenue by country', 'ga4:totalRevenue'), 6, 8]],
                    [[table('w_chan', 'Channels', ['channel'], ['ga4:totalRevenue', 'ga4:transactions', 'ga4:averagePurchaseRevenue', 'ga4:sessionKeyEventRate'], { bars: ['ga4:totalRevenue'] }), 12, 8]],
                ], w),
                page('p_funnel', 'Funnel', [
                    [[kpi('w_funnel', ['ga4:itemsViewed', 'ga4:addToCarts', 'ga4:checkouts', 'ga4:ecommercePurchases'], 'Shopping funnel'), 12, 3]],
                    [[table('w_fchan', 'Funnel by channel', ['channel'], ['ga4:sessions', 'ga4:addToCarts', 'ga4:checkouts', 'ga4:ecommercePurchases', 'ga4:sessionKeyEventRate']), 6, 8],
                        [table('w_fdev', 'Funnel by device', ['device'], ['ga4:sessions', 'ga4:addToCarts', 'ga4:checkouts', 'ga4:ecommercePurchases', 'ga4:sessionKeyEventRate']), 6, 8]],
                    [[ts('w_carts', 'Add to carts and purchases', ['ga4:addToCarts', 'ga4:ecommercePurchases']), 12, 7]],
                ], w),
                page('p_prod', 'Products', [
                    [[table('w_products', 'Top products', ['itemName'], ['ga4:itemRevenue', 'ga4:itemsPurchased', 'ga4:itemsViewed', 'ga4:itemsAddedToCart'], { bars: ['ga4:itemRevenue'], search: true }), 12, 10]],
                    [[barList('w_cat', 'Revenue by category', 'itemCategory', 'ga4:itemRevenue'), 6, 8], [barList('w_brand', 'Revenue by brand', 'itemBrand', 'ga4:itemRevenue'), 6, 8]],
                ], w),
                page('p_cust', 'Customers', [
                    [[pie('w_nvr', 'Transactions: new and returning', 'newVsReturning', 'ga4:transactions'), 4, 8], [table('w_cities', 'Cities', ['city'], ['ga4:totalRevenue', 'ga4:transactions', 'ga4:activeUsers'], { bars: ['ga4:totalRevenue'] }), 8, 8]],
                    [[table('w_landing', 'Landing pages that sell', ['landingPage'], ['ga4:sessions', 'ga4:transactions', 'ga4:totalRevenue', 'ga4:sessionKeyEventRate'], { bars: ['ga4:totalRevenue'] }), 12, 9]],
                ], w),
            ],
        };
    },

    // 8 ───────────────────────────────────────────────────────────────────
    'acquisition-channels': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('28d'), channel(), country(), device()],
            pages: [
                page('p_chan', 'Channels', [
                    [[kpi('w_kpis', ['ga4:activeUsers', 'ga4:newUsers', 'ga4:sessions', 'ga4:engagementRate', 'ga4:sessionKeyEventRate', 'ga4:keyEvents']), 12, 3]],
                    [[breakdownTs('w_bychannel', 'Sessions by channel', 'ga4:sessions', 'channel'), 8, 8], [barList('w_eng', 'Engagement rate by channel', 'channel', 'ga4:engagementRate'), 4, 8]],
                    [[table('w_table', 'Channels', ['channel'], ['ga4:sessions', 'ga4:activeUsers', 'ga4:newUsers', 'ga4:engagementRate', 'ga4:averageSessionDuration', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:sessions', 'ga4:keyEvents'] }), 12, 8]],
                    [[breakdownTs('w_kechannel', 'Key events by channel', 'ga4:keyEvents', 'channel'), 6, 7], [barList('w_new', 'New and returning visitors by channel', 'channel', 'ga4:sessions', { variant: 'chart', orientation: 'vertical', stackBy: 'newVsReturning', stacked: true, top: 6 }), 6, 7]],
                ], w),
                page('p_src', 'Sources and campaigns', [
                    [[table('w_sm', 'Source / medium', ['sourceMedium'], ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:keyEvents'], { bars: ['ga4:sessions'], search: true }), 6, 10],
                        [table('w_camp', 'Campaigns', ['campaign'], ['ga4:sessions', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:sessions'] }), 6, 10]],
                    [[breakdownTs('w_medium', 'Sessions by medium', 'ga4:sessions', 'medium'), 8, 8], [pie('w_first', 'New users by first channel', 'firstUserChannel', 'ga4:newUsers'), 4, 8]],
                    [[table('w_landing', 'Landing pages', ['landingPage'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:bounceRate', 'ga4:keyEvents'], { bars: ['ga4:sessions'] }), 12, 9]],
                ], w),
            ],
        };
    },

    // 9 ───────────────────────────────────────────────────────────────────
    'local-seo': () => {
        const w: Rec = {};
        return {
            widgets: w, themeId: 'sunrise',
            controls: [dateControl('28d'), device(), pick('f_city', 'City', 'city')],
            pages: [
                page('p_local', 'Local search and visits', [
                    [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                    [[ts('w_search', 'Search', ['gsc:clicks', 'gsc:impressions']), 6, 7], [ts('w_visits', 'Visits', ['ga4:activeUsers', 'ga4:sessions']), 6, 7]],
                    [[table('w_cities', 'Cities your visitors are in', ['city'], ['ga4:activeUsers', 'ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'], { bars: ['ga4:activeUsers'], search: true }), 6, 9],
                        [only(table('w_near', 'Near me and local searches', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), [{ dimension: 'query', op: 'regex', value: 'near me|nearby|open now|closest|in my area' }]), 6, 9]],
                    [[only(table('w_actions', 'Calls, directions and forms', ['eventName'], ['ga4:eventCount', 'ga4:keyEvents'], { bars: ['ga4:eventCount'], pageSize: 5 }), [{ dimension: 'eventName', op: 'regex', value: 'call|phone|direction|map|form|contact|book|quote|lead|sign_up|generate_lead|submit' }]), 6, 6],
                        [pie('w_sdev', 'Search clicks by device', 'device', 'gsc:clicks'), 3, 6], [pie('w_vdev', 'Visits by device', 'device', 'ga4:sessions'), 3, 6]],
                ], w),
                page('p_pages', 'Location pages', [
                    [[only(table('w_loc', 'Location and service-area pages', ['page'], ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:sessions', 'ga4:keyEvents'], { bars: ['gsc:clicks', 'ga4:keyEvents'] }), [{ dimension: 'page', op: 'regex', value: '/(locations?|service-areas?|areas?|stores?|branches?)/' }]), 12, 10]],
                    [[table('w_region', 'Regions', ['region'], ['ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents'], { bars: ['ga4:activeUsers'] }), 6, 9], [table('w_lang', 'Languages', ['language'], ['ga4:activeUsers', 'ga4:engagementRate'], { bars: ['ga4:activeUsers'] }), 6, 9]],
                ], w),
            ],
        };
    },

    // 10 ──────────────────────────────────────────────────────────────────
    'client-monthly-seo': () => {
        const w: Rec = {};
        const theme: ThemeV2 = { mode: 'light', header: { show: true, companyName: 'Your company', logoPosition: 'left', showDates: true }, badge: { show: false } };
        return {
            widgets: w, theme, themeId: 'studio',
            cover: { title: 'SEO report: {{site}}', subtitle: '{{date_range}}', layout: 'split' },
            controls: [dateControl('last_month', { mode: 'previous_period' }, true)],
            pages: [
                page('p_sum', 'Summary', [
                        [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                    [[ts('w_trend', 'Search clicks and impressions', ['gsc:clicks', 'gsc:impressions']), 8, 8], [pie('w_dev', 'Search clicks by device', 'device', 'gsc:clicks'), 4, 8]],
                    [[text('w_high', '### Highlights\n- The one result worth celebrating this month\n- What changed, and why, in one sentence\n- What we will do about it next month', 'callout'), 12, 4]],
                ], w),
                page('p_rank', 'Rankings', [
                    [[kpi('w_rk', ['gsc:position', 'gsc:ctr', 'gsc:impressions']), 12, 3]],
                    [[table('w_q', 'Top queries', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 12, 9]],
                    [[table('w_up', 'Queries that moved up', ['query'], ['gsc:clicks', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, pageSize: 5 }), 6, 8],
                        [table('w_down', 'Queries that moved down', ['query'], ['gsc:clicks', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, pageSize: 5 }), 6, 8]],
                ], w),
                page('p_pages', 'Pages and traffic', [
                    [[table('w_pg', 'Top pages', ['page'], ['gsc:clicks', 'gsc:position', 'ga4:sessions', 'ga4:keyEvents'], { bars: ['gsc:clicks'] }), 12, 9]],
                    [[breakdownTs('w_ch', 'Sessions by channel', 'ga4:sessions', 'channel'), 8, 8], [pie('w_chp', 'Channels', 'channel', 'ga4:sessions'), 4, 8]],
                ], w),
                page('p_conv', 'Conversions', [
                    [[kpi('w_cv', ['ga4:keyEvents', 'ga4:sessionKeyEventRate', 'ga4:engagementRate']), 12, 3]],
                    [[ts('w_ke', 'Key events', ['ga4:keyEvents']), 8, 7], [table('w_kech', 'Key events by channel', ['channel'], ['ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:keyEvents'] }), 4, 7]],
                    [[table('w_ken', 'Key events by name', ['eventName'], ['ga4:keyEvents', 'ga4:eventCount'], { rowFilters: [{ metric: 'ga4:keyEvents', op: 'gt', value: 0 }], bars: ['ga4:keyEvents'] }), 12, 8]],
                ], w),
                page('p_next', 'Work done and next steps', [
                    [[text('w_done', '### Work completed this month\n- Pages improved, with the change made\n- Technical fixes shipped', 'body'), 6, 8], [text('w_next', '### Planned for next month\n- The next pages to improve\n- Content to publish', 'body'), 6, 8]],
                    [[text('w_quest', '### Questions for you\n- Anything we need from you to move faster', 'note'), 12, 4]],
                ], w),
            ],
        };
    },

    // 11 ──────────────────────────────────────────────────────────────────
    'agency-rollup': () => {
        const w: Rec = {};
        return {
            widgets: w, themeId: 'studio',
            controls: [dateControl('7d')],
            pages: [
                page('p_health', 'Health', [
                    [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                    [[gridCompact('w_grid'), 12, 12]],
                    [[table('w_drops', 'Biggest drops', ['site'], ['gsc:clicks', 'ga4:sessions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, pageSize: 5, maxRows: 500 }), 6, 8],
                        [table('w_gains', 'Biggest gains', ['site'], ['gsc:clicks', 'ga4:sessions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, pageSize: 5, maxRows: 500 }), 6, 8]],
                ], w),
                page('p_search', 'Search', [
                    [[breakdownTs('w_bysite', 'Clicks by site', 'gsc:clicks', 'site'), 8, 8], [barList('w_share', 'Share of clicks', 'site', 'gsc:clicks', { showShare: true }), 4, 8]],
                    [[table('w_stable', 'Search by site', ['site'], ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, maxRows: 500, bars: ['gsc:clicks'] }), 12, 10]],
                ], w),
                page('p_traffic', 'Traffic', [
                    [[breakdownTs('w_sessions', 'Sessions by site', 'ga4:sessions', 'site'), 8, 8], [barList('w_ke', 'Key events by site', 'site', 'ga4:keyEvents'), 4, 8]],
                    [[table('w_ttable', 'Traffic by site', ['site'], ['ga4:activeUsers', 'ga4:sessions', 'ga4:screenPageViews', 'ga4:keyEvents'], { sortByChange: true, sort: { by: 'm:ga4:sessions', dir: 'asc' }, maxRows: 500, bars: ['ga4:sessions'] }), 12, 10]],
                ], w),
            ],
        };
    },

    // 12 ──────────────────────────────────────────────────────────────────
    'content-decay': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('90d', { mode: 'previous_year' }), pageContains(), country()],
            pages: [page('p_main', 'Content decay', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:screenPageViews', 'ga4:engagementRate']), 12, 3]],
                [[text('w_how', '### How to use this\nThe comparison is the **same period last year**, so seasonal pages are not flagged by mistake. Start with pages that lost the most clicks, open their queries below, then refresh the content, the title and the internal links.', 'callout'), 12, 3]],
                [[table('w_lose', 'Pages losing the most clicks', ['page'], ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, maxRows: 2000, bars: ['gsc:clicks'] }), 6, 10],
                    [table('w_gain', 'Pages gaining the most clicks', ['page'], ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, maxRows: 2000, bars: ['gsc:clicks'] }), 6, 10]],
                [[table('w_queries', 'Queries behind the drop', ['query'], ['gsc:clicks', 'gsc:impressions', 'gsc:position'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, maxRows: 5000, search: true }), 12, 9]],
                [[table('w_sessions', 'Pages losing visits (Analytics)', ['page'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'], { sortByChange: true, sort: { by: 'm:ga4:sessions', dir: 'asc' }, maxRows: 2000 }), 6, 9],
                    [ts('w_clicks', 'Search clicks', ['gsc:clicks']), 6, 9]],
            ], w)],
        };
    },

    // 13 ──────────────────────────────────────────────────────────────────
    'international-search': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('28d'), country(), device()],
            pages: [
                page('p_world', 'Countries', [
                    [[kpi('w_kpis', SEARCH_COLS), 12, 3]],
                    [[{ ...geo('w_geo', 'Clicks by country', 'gsc:clicks'), config: { ...geo('w_geo', '', 'gsc:clicks').config, topList: 0 } }, 8, 10], [barList('w_top', 'Top countries', 'country', 'gsc:clicks', { showShare: true, top: 10 }), 4, 10]],
                    [[breakdownTs('w_bycountry', 'Clicks by country', 'gsc:clicks', 'country'), 6, 8], [table('w_countries', 'Countries', ['country'], SEARCH_COLS, { bars: ['gsc:clicks'], sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, maxRows: 300 }), 6, 8]],
                ], w),
                page('p_detail', 'Pages and queries by country', [
                    [[table('w_cp', 'Pages by country', ['country', 'page'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:impressions', op: 'gte', value: 200 }], bars: ['gsc:clicks'], maxRows: 5000, search: true }), 12, 10]],
                    [[table('w_cq', 'Queries by country', ['country', 'query'], SEARCH_COLS, { rowFilters: [{ metric: 'gsc:impressions', op: 'gte', value: 200 }], bars: ['gsc:clicks'], maxRows: 5000, search: true }), 12, 10]],
                    [[barList('w_lang', 'Visitor languages (Analytics)', 'language', 'ga4:activeUsers'), 6, 8], [barList('w_ucountry', 'Visitors by country (Analytics)', 'country', 'ga4:activeUsers'), 6, 8]],
                ], w),
            ],
        };
    },

    // 14 ──────────────────────────────────────────────────────────────────
    'lead-generation': () => {
        const w: Rec = {};
        return {
            widgets: w,
            controls: [dateControl('28d'), channel(), country(), device()],
            pages: [
                page('p_leads', 'Leads', [
                    [[kpi('w_kpis', ['ga4:keyEvents', 'ga4:sessionKeyEventRate', 'ga4:activeUsers', 'ga4:sessions', 'ga4:engagementRate', 'ga4:newUsers']), 12, 3]],
                    [[ts('w_ke', 'Key events', ['ga4:keyEvents']), 8, 8], [pie('w_kechan', 'Key events by channel', 'channel', 'ga4:keyEvents'), 4, 8]],
                    [[table('w_events', 'Key events by name', ['eventName'], ['ga4:keyEvents', 'ga4:eventCount'], { rowFilters: [{ metric: 'ga4:keyEvents', op: 'gt', value: 0 }], bars: ['ga4:keyEvents'] }), 6, 9],
                        [table('w_landing', 'Landing pages that generate leads', ['landingPage'], ['ga4:sessions', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:keyEvents'] }), 6, 9]],
                    [[breakdownTs('w_bychannel', 'Key events by channel over time', 'ga4:keyEvents', 'channel'), 6, 7], [table('w_rate', 'Key event rate by channel', ['channel'], ['ga4:sessions', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['ga4:keyEvents'] }), 6, 7]],
                    [[pie('w_dev', 'Key events by device', 'device', 'ga4:keyEvents'), 4, 7], [table('w_cities', 'Cities', ['city'], ['ga4:keyEvents', 'ga4:sessions'], { bars: ['ga4:keyEvents'] }), 8, 7]],
                    [[text('w_tip', '**Tip.** Mark your form-submit, call and booking events as key events in Google Analytics (Admin, Events, Mark as key event). Anything marked shows up on this page.', 'note'), 12, 2]],
                ], w),
                page('p_search', 'Search to lead', [
                    [[table('w_pages', 'Pages: search clicks to key events', ['page'], ['gsc:clicks', 'gsc:position', 'ga4:sessions', 'ga4:keyEvents', 'ga4:sessionKeyEventRate'], { bars: ['gsc:clicks', 'ga4:keyEvents'], search: true }), 12, 11]],
                    [[table('w_q', 'Queries that bring visitors', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 12, 9]],
                ], w),
            ],
        };
    },

    // 15 ──────────────────────────────────────────────────────────────────
    'tv-wallboard': () => {
        const w: Rec = {};
        const theme: ThemeV2 = { mode: 'dark', header: { show: false, logoPosition: 'left', showDates: false }, badge: { show: false } };
        return {
            widgets: w, theme, themeId: 'midnight', widthMode: 'full', autoRefreshSec: 300, tv: { rotateSec: 30, hideControls: true },
            controls: [dateControl('7d', { mode: 'previous_period' }, true)],
            pages: [
                page('p_now', 'This week', [
                    [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents', 'ga4:engagementRate']), 12, 4]],
                    [[ts('w_clicks', 'Search clicks', ['gsc:clicks']), 6, 9], [ts('w_users', 'Users', ['ga4:activeUsers']), 6, 9]],
                    [[barList('w_pages', 'Top pages', 'page', 'gsc:clicks', { top: 6 }), 4, 10], [barList('w_queries', 'Top queries', 'query', 'gsc:clicks', { top: 6 }), 4, 10], [pie('w_channels', 'Channels', 'channel', 'ga4:sessions'), 4, 10]],
                ], w),
                page('p_where', 'Where', [
                    [[{ ...geo('w_geo', 'Users by country', 'ga4:activeUsers'), config: { ...geo('w_geo', '', 'ga4:activeUsers').config, topList: 0 } }, 8, 13], [barList('w_countries', 'Top countries', 'country', 'ga4:activeUsers', { top: 8 }), 4, 13]],
                ], w),
                page('p_movers', 'Movers', [
                    [[table('w_up', 'Pages rising', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' }, pageSize: 10, pagination: false }), 6, 13],
                        [table('w_down', 'Pages falling', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, pageSize: 10, pagination: false }), 6, 13]],
                ], w),
            ],
        };
    },

    // 16 ──────────────────────────────────────────────────────────────────
    'weekly-pulse': () => {
        const w: Rec = {};
        const five = { pageSize: 5 as const, sortByChange: true, maxRows: 2000 };
        return {
            widgets: w,
            controls: [dateControl('7d', { mode: 'previous_period' })],
            pages: [page('p_main', 'This week', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                [[ts('w_search', 'Search', ['gsc:clicks', 'gsc:impressions']), 6, 6], [ts('w_traffic', 'Traffic', ['ga4:activeUsers', 'ga4:sessions']), 6, 6]],
                [[table('w_pup', 'Pages gaining clicks', ['page'], ['gsc:clicks', 'gsc:position'], { ...five, sort: { by: 'm:gsc:clicks', dir: 'desc' } }), 6, 7],
                    [table('w_pdown', 'Pages losing clicks', ['page'], ['gsc:clicks', 'gsc:position'], { ...five, sort: { by: 'm:gsc:clicks', dir: 'asc' } }), 6, 7]],
                [[table('w_qup', 'Queries gaining clicks', ['query'], ['gsc:clicks', 'gsc:position'], { ...five, sort: { by: 'm:gsc:clicks', dir: 'desc' } }), 6, 7],
                    [table('w_qdown', 'Queries losing clicks', ['query'], ['gsc:clicks', 'gsc:position'], { ...five, sort: { by: 'm:gsc:clicks', dir: 'asc' } }), 6, 7]],
                [[only(score('w_ai', 'AI assistant sessions', 'ga4:sessions'), [AI]), 3, 4], [text('w_line', '### This week in one line\nWrite the one sentence your team should remember.', 'callout'), 9, 4]],
            ], w)],
        };
    },
};

export interface TemplateMetaR2 {
    id: string;
    name: string;
    description: string;
    category: 'Overview' | 'Search' | 'Traffic' | 'Content' | 'Portfolio' | 'Reporting' | 'AI' | 'Ecommerce' | 'Local' | 'Leads' | 'Display';
    needs: Array<'gsc' | 'ga4'>;
    portfolio?: boolean;
    audience: string;
    themeId?: string;
}

export const TEMPLATES_R2: TemplateMetaR2[] = [
    { id: 'executive-summary', name: 'Executive summary', description: 'One page for the boss: results, trend, who is winning and losing.', category: 'Reporting', needs: ['gsc', 'ga4'], audience: 'Owners and executives', themeId: 'executive' },
    { id: 'landing-pages', name: 'Landing pages', description: 'Search and on-site results for every entry page, plus pages that get visits but no key events.', category: 'Content', needs: ['gsc', 'ga4'], audience: 'SEO and content teams' },
    { id: 'seo-opportunities', name: 'SEO opportunities', description: 'Striking-distance queries, low-CTR page-one queries and fastest movers.', category: 'Search', needs: ['gsc'], audience: 'SEO specialists', themeId: 'analyst' },
    { id: 'keyword-cannibalization', name: 'Keyword cannibalization', description: 'Queries answered by more than one of your pages, with what to do about it.', category: 'Search', needs: ['gsc'], audience: 'SEO specialists', themeId: 'analyst' },
    { id: 'brand-vs-nonbrand', name: 'Brand vs non-brand search', description: 'Demand you already have against new visitors you win.', category: 'Search', needs: ['gsc'], audience: 'SEO and marketing leads' },
    { id: 'ai-traffic', name: 'AI traffic', description: 'Visits from ChatGPT, Perplexity, Claude, Gemini and Copilot, and how they behave.', category: 'AI', needs: ['ga4'], audience: 'Everyone watching AI search' },
    { id: 'ecommerce-funnel', name: 'Ecommerce funnel and products', description: 'Revenue, the shopping funnel, products and customers.', category: 'Ecommerce', needs: ['ga4'], audience: 'Shop owners and ecommerce managers' },
    { id: 'acquisition-channels', name: 'Acquisition: channels and campaigns', description: 'Which channels bring people, how they engage and what they do next.', category: 'Traffic', needs: ['ga4'], audience: 'Marketers and agencies' },
    { id: 'local-seo', name: 'Local SEO', description: 'Local searches, cities, mobile share, calls and location pages.', category: 'Local', needs: ['gsc', 'ga4'], audience: 'Local businesses and multi-location brands', themeId: 'sunrise' },
    { id: 'client-monthly-seo', name: 'Client monthly SEO report', description: 'A five-page, branded report with a cover, rankings, conversions and next steps.', category: 'Reporting', needs: ['gsc', 'ga4'], audience: 'Agencies and freelancers', themeId: 'studio' },
    { id: 'agency-rollup', name: 'Agency weekly rollup', description: 'Every client site in one view: health, search, traffic and the biggest movers.', category: 'Portfolio', needs: [], portfolio: true, audience: 'Agencies', themeId: 'studio' },
    { id: 'content-decay', name: 'Content decay and refresh', description: 'Pages that lost clicks against last year, and the queries behind the drop.', category: 'Content', needs: ['gsc', 'ga4'], audience: 'Content teams' },
    { id: 'international-search', name: 'International search', description: 'Where search traffic comes from, by country, page and query.', category: 'Search', needs: ['gsc'], audience: 'Global sites' },
    { id: 'lead-generation', name: 'Lead generation', description: 'Key events by channel, landing page and city, and which search pages turn into leads.', category: 'Leads', needs: ['ga4'], audience: 'Service businesses and law firms' },
    { id: 'tv-wallboard', name: 'TV wallboard', description: 'Big numbers that rotate on an office screen and refresh themselves.', category: 'Display', needs: ['gsc', 'ga4'], audience: 'Teams with a screen', themeId: 'midnight' },
    { id: 'weekly-pulse', name: 'Weekly pulse', description: 'This week against last week on one page, made to be emailed on Monday.', category: 'Overview', needs: ['gsc', 'ga4'], audience: 'Teams and clients' },
];
