/**
 * Dashboard templates (BUILDER.md 12): eight full DashboardDocV2 documents plus Blank. Every
 * widget source is `default`, so a template applies to whichever site the user picks (portfolio
 * templates use all sites). The gallery draws thumbnails from these layouts.
 */
import { tableColumns } from './registry';
import { applyThemePreset, isThemeId, type ThemeId } from './themes';
import { BUILDERS_R2, TEMPLATES_R2, type BuildCtx, type BuiltR2 } from './templates.round2';
import type {
    BarWidget,
    ControlDef,
    DashboardDocV2,
    FilterControl,
    GeoWidget,
    KpiStripWidget,
    LayoutItem,
    PageDef,
    PieWidget,
    PortfolioGridWidget,
    SourceRef,
    TableWidget,
    TextWidget,
    ThemeV2,
    TimeSeriesWidget,
    WidgetDef,
} from './types';

export type TemplateCategory = 'Overview' | 'Search' | 'Traffic' | 'Content' | 'Portfolio' | 'Reporting' | 'AI' | 'Ecommerce' | 'Local' | 'Leads' | 'Display';

export interface TemplateMeta {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    needs: Array<'gsc' | 'ga4'>;
    portfolio?: boolean;
    /** Round 2: who it is for, the suggested theme, and a "New" badge in the gallery. */
    audience?: string;
    themeId?: string;
    isNew?: boolean;
}

// ── widget helpers ───────────────────────────────────────────────────────

const D: SourceRef = { type: 'default' };
const COMPARE = { show: true, display: 'percent' as const };
const SPARK = { show: true, kind: 'area' as const };

const kpi = (id: string, metrics: string[], title?: string): KpiStripWidget => ({
    id, type: 'kpi-strip', title, showTitle: Boolean(title), source: D,
    config: { metrics: metrics.map((m) => ({ id: m })), comparison: COMPARE, sparkline: SPARK, columns: 'auto' },
});

const ts = (id: string, title: string, metrics: string[], opts: Partial<TimeSeriesWidget['config']> = {}): TimeSeriesWidget => ({
    id, type: 'timeseries', title, source: D,
    config: {
        granularity: 'auto', series: metrics.map((m, i) => ({ metric: { id: m }, kind: i === 0 ? 'area' : 'line' })), mode: metrics.length > 1 ? 'overlay' : 'auto',
        compare: 'inherit', stacked: false, smooth: true, showPoints: 'hover', legend: 'auto', yAxis: { min: 'zero' }, markPreliminary: true, ...opts,
    },
});

const breakdownTs = (id: string, title: string, metric: string, dimension: string): TimeSeriesWidget =>
    ts(id, title, [metric], { breakdown: { dimension, top: 5, other: true }, stacked: true, compare: 'off', series: [{ metric: { id: metric }, kind: 'area' }] });

const barList = (id: string, title: string, dimension: string, metric: string, opts: Partial<BarWidget['config']> = {}): BarWidget => ({
    id, type: 'bar', title, source: D,
    config: { dimension, metrics: [{ id: metric }], variant: 'list', orientation: 'horizontal', stacked: false, sort: { by: metric, dir: 'desc' }, top: 8, other: false, showValues: true, showShare: false, compare: 'inherit', colorBy: 'series', ...opts },
});

const pie = (id: string, title: string, dimension: string, metric: string): PieWidget => ({
    id, type: 'pie', title, source: D,
    config: { dimension, metric: { id: metric }, top: 5, other: true, donut: true, centerLabel: 'total', legend: 'right', showPercent: true },
});

const table = (id: string, title: string, dims: string[], metrics: string[], opts: Partial<TableWidget['config']> & { bars?: string[] } = {}): TableWidget => {
    const { bars, ...rest } = opts;
    return {
        id, type: 'table', title, source: D,
        config: {
            dimensions: dims, columns: tableColumns(dims, metrics, bars), sort: { by: `m:${metrics[0]}`, dir: 'desc' }, pagination: true, pageSize: 10,
            maxRows: 1000, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false, ...rest,
        },
    };
};

const geo = (id: string, title: string, metric: string): GeoWidget => ({
    id, type: 'geo', title, source: D,
    config: { level: 'country', metric: { id: metric }, scale: { kind: 'sequential', bins: 'quantile', steps: 5 }, projection: 'naturalEarth', topList: 5, showLegend: true, zoomRegion: 'world' },
});

const text = (id: string, markdown: string, role: TextWidget['config']['role'] = 'body'): TextWidget => ({
    id, type: 'text', showTitle: false, source: D, config: { markdown, role, align: 'left', variables: true },
});

const grid = (id: string): PortfolioGridWidget => ({
    id, type: 'portfolio-grid', title: 'Sites', source: { type: 'portfolio', include: 'all' },
    config: { metrics: [{ id: 'gsc:clicks' }, { id: 'gsc:impressions' }, { id: 'ga4:activeUsers' }, { id: 'ga4:sessions' }], sort: { by: 'change', dir: 'asc' }, show: 'cards', limit: 12, columns: 'auto', sparkline: true, alerts: true, onClick: 'open-site' },
});

// ── layout helper: rows of [widget, w, h] packed left to right ───────────

type Cell = [WidgetDef, number, number];

function page(id: string, title: string, rows: Cell[][], into: Record<string, WidgetDef>): PageDef {
    const lg: LayoutItem[] = [];
    let y = 0;
    for (const row of rows) {
        let x = 0;
        let h = 0;
        for (const [w, cw, ch] of row) {
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

const DATE: ControlDef = { id: 'date', type: 'date', default: { kind: 'preset', id: '28d' }, defaultCompare: { mode: 'previous_period' }, viewerCanChange: true, viewerCanCompare: true };

const filter = (key: 'country' | 'device' | 'channel' | 'page'): FilterControl => {
    switch (key) {
        case 'country': return { id: 'f_country', type: 'filter', label: 'Country', dimension: 'country', ui: 'multiselect', scope: { mode: 'all' }, viewerCanChange: true };
        case 'device': return { id: 'f_device', type: 'filter', label: 'Device', dimension: 'device', ui: 'select', scope: { mode: 'all' }, viewerCanChange: true };
        case 'channel': return { id: 'f_channel', type: 'filter', label: 'Channel', dimension: 'channel', ui: 'multiselect', scope: { mode: 'all' }, viewerCanChange: true };
        case 'page': return { id: 'f_page', type: 'filter', label: 'Page contains', dimension: 'page', ui: 'search', scope: { mode: 'all' }, viewerCanChange: true };
    }
};

export function defaultTheme(mode: ThemeV2['mode'] = 'light'): ThemeV2 {
    return { mode, header: { show: false, logoPosition: 'left', showDates: true }, badge: { show: true } };
}

// ── the templates ────────────────────────────────────────────────────────

interface Built { pages: PageDef[]; widgets: Record<string, WidgetDef>; controls: ControlDef[]; theme?: ThemeV2 }

/** The eight shipped builders below plus the sixteen round-2 ones (templates.round2.ts). */
type Builder = (ctx: BuildCtx) => Built & Partial<Omit<BuiltR2, keyof Built>>;

const SEARCH_COLS = ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'];

const BUILDERS_V1: Record<string, () => Built> = {
    'site-overview': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('country'), filter('device')],
            pages: [page('p_main', 'Overview', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                [[ts('w_search', 'Search', ['gsc:clicks', 'gsc:impressions']), 6, 7], [ts('w_traffic', 'Traffic', ['ga4:activeUsers', 'ga4:sessions']), 6, 7]],
                [[table('w_pages', 'Top pages', ['page'], ['gsc:clicks', 'gsc:position', 'ga4:sessions', 'ga4:keyEvents'], { bars: ['gsc:clicks'] }), 8, 9], [pie('w_channels', 'Channels', 'channel', 'ga4:sessions'), 4, 9]],
                [[geo('w_geo', 'Users by country', 'ga4:activeUsers'), 6, 9], [barList('w_devices', 'Devices', 'device', 'ga4:sessions'), 3, 9], [barList('w_queries', 'Top queries', 'query', 'gsc:clicks'), 3, 9]],
            ], w)],
        };
    },
    'search-performance': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('country'), filter('device')],
            pages: [page('p_main', 'Search', [
                [[kpi('w_kpis', SEARCH_COLS), 12, 3]],
                [[ts('w_trend', 'Clicks and impressions', ['gsc:clicks', 'gsc:impressions']), 12, 7]],
                [[table('w_queries', 'Top queries', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 6, 9], [table('w_pages', 'Top pages', ['page'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 6, 9]],
                [[barList('w_countries', 'Countries', 'country', 'gsc:clicks'), 4, 8], [pie('w_devices', 'Devices', 'device', 'gsc:clicks'), 4, 8],
                    [text('w_note', '### Quick wins\nQueries where you rank **8 to 20** already get impressions. A better title, a clearer answer near the top of the page, or a few internal links can move them onto page one.\n\nThe table below lists them by impressions for {{date_range}}.', 'callout'), 4, 8]],
                [[table('w_quickwins', 'Quick wins: position 8 to 20', ['query'], ['gsc:impressions', 'gsc:clicks', 'gsc:ctr', 'gsc:position'], { bars: ['gsc:impressions'], rowFilters: [{ metric: 'gsc:position', op: 'between', value: [8, 20] }], maxRows: 5000, sort: { by: 'm:gsc:impressions', dir: 'desc' } }), 12, 8]],
            ], w)],
        };
    },
    'traffic-acquisition': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('channel'), filter('country'), filter('device')],
            pages: [page('p_main', 'Traffic', [
                [[kpi('w_kpis', ['ga4:activeUsers', 'ga4:sessions', 'ga4:engagementRate', 'ga4:averageSessionDuration', 'ga4:keyEvents']), 12, 3]],
                [[breakdownTs('w_bychannel', 'Sessions by channel', 'ga4:sessions', 'channel'), 8, 8], [pie('w_channels', 'Channels', 'channel', 'ga4:sessions'), 4, 8]],
                [[table('w_sources', 'Source / medium', ['sourceMedium'], ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:keyEvents']), 6, 9],
                    [table('w_campaigns', 'Campaigns', ['campaign'], ['ga4:sessions', 'ga4:keyEvents', 'ga4:sessionKeyEventRate']), 6, 9]],
                [[table('w_landing', 'Landing pages', ['landingPage'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:bounceRate', 'ga4:keyEvents']), 12, 9]],
            ], w)],
        };
    },
    'content-performance': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('page'), filter('country')],
            pages: [page('p_main', 'Content', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:screenPageViews', 'ga4:engagementRate', 'ga4:keyEvents']), 12, 3]],
                [[table('w_pages', 'Pages', ['page'], ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position', 'ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents'], { bars: ['gsc:clicks', 'ga4:keyEvents'] }), 12, 10]],
                [[ts('w_views', 'Pageviews', ['ga4:screenPageViews']), 6, 7], [ts('w_clicks', 'Clicks', ['gsc:clicks']), 6, 7]],
                [[table('w_rising', 'Rising pages', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'desc' } }), 6, 9],
                    [table('w_declining', 'Declining pages', ['page'], ['gsc:clicks', 'gsc:impressions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' } }), 6, 9]],
            ], w)],
        };
    },
    portfolio: () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE],
            pages: [page('p_main', 'Portfolio', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                [[breakdownTs('w_bysite', 'Clicks by site', 'gsc:clicks', 'site'), 8, 8], [barList('w_topsites', 'Top sites by users', 'site', 'ga4:activeUsers'), 4, 8]],
                [[grid('w_grid'), 12, 10]],
                [[table('w_sites', 'Sites', ['site'], ['gsc:clicks', 'gsc:impressions', 'gsc:position', 'ga4:activeUsers', 'ga4:sessions'], { sortByChange: true, sort: { by: 'm:gsc:clicks', dir: 'asc' }, maxRows: 500 }), 12, 9]],
            ], w)],
        };
    },
    'client-report': () => {
        const w: Record<string, WidgetDef> = {};
        const theme = defaultTheme('light');
        theme.header = { show: true, companyName: 'Your company', logoPosition: 'left', showDates: true };
        return {
            widgets: w,
            theme,
            controls: [{ ...DATE, viewerCanChange: false, viewerCanCompare: false } as ControlDef],
            pages: [
                page('p_summary', 'Summary', [
                    [[text('w_intro', '## Monthly report for {{site}}\nResults for {{date_range}}, {{compare_range}}.', 'heading'), 12, 3]],
                    [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'ga4:activeUsers', 'ga4:sessions', 'ga4:keyEvents', 'gsc:position']), 12, 3]],
                    [[ts('w_traffic', 'Users and sessions', ['ga4:activeUsers', 'ga4:sessions']), 8, 8], [geo('w_geo', 'Users by country', 'ga4:activeUsers'), 4, 8]],
                    [[table('w_pages', 'Top pages', ['page'], ['gsc:clicks', 'gsc:position', 'ga4:sessions', 'ga4:keyEvents'], { bars: ['gsc:clicks'] }), 12, 8]],
                    [[text('w_notes', '### Notes and next steps\n- What went well this month\n- What we are fixing next\n- Questions for you'), 12, 4]],
                ], w),
                page('p_search', 'Search', [
                    [[ts('w_s_trend', 'Clicks and impressions', ['gsc:clicks', 'gsc:impressions']), 12, 7]],
                    [[table('w_s_queries', 'Top queries', ['query'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 6, 9], [table('w_s_pages', 'Top pages', ['page'], SEARCH_COLS, { bars: ['gsc:clicks'] }), 6, 9]],
                    [[pie('w_s_devices', 'Devices', 'device', 'gsc:clicks'), 4, 7], [barList('w_s_countries', 'Countries', 'country', 'gsc:clicks'), 8, 7]],
                ], w),
                page('p_traffic', 'Traffic', [
                    [[breakdownTs('w_t_channel', 'Sessions by channel', 'ga4:sessions', 'channel'), 8, 8], [pie('w_t_channels', 'Channels', 'channel', 'ga4:sessions'), 4, 8]],
                    [[table('w_t_sources', 'Source / medium', ['sourceMedium'], ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:keyEvents']), 6, 9],
                        [table('w_t_landing', 'Landing pages', ['landingPage'], ['ga4:sessions', 'ga4:engagementRate', 'ga4:keyEvents']), 6, 9]],
                ], w),
            ],
        };
    },
    'audience-geography': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('country'), filter('device')],
            pages: [page('p_main', 'Audience', [
                [[kpi('w_kpis', ['ga4:activeUsers', 'ga4:newUsers', 'ga4:engagementRate', 'ga4:sessionsPerUser']), 12, 3]],
                [[geo('w_geo', 'Users by country', 'ga4:activeUsers'), 8, 10], [barList('w_countries', 'Top countries', 'country', 'ga4:activeUsers', { showShare: true }), 4, 10]],
                [[table('w_cities', 'Cities', ['city', 'country'], ['ga4:activeUsers', 'ga4:sessions', 'ga4:engagementRate']), 6, 9], [barList('w_lang', 'Languages', 'language', 'ga4:activeUsers'), 3, 9], [pie('w_nvr', 'New vs returning', 'newVsReturning', 'ga4:sessions'), 3, 9]],
                [[pie('w_devices', 'Devices', 'device', 'ga4:sessions'), 4, 7], [barList('w_browsers', 'Browsers', 'browser', 'ga4:activeUsers'), 4, 7], [barList('w_os', 'Operating systems', 'os', 'ga4:activeUsers'), 4, 7]],
                [[barList('w_dow', 'When visitors arrive', 'dayOfWeek', 'ga4:sessions', { variant: 'chart', orientation: 'vertical', top: 7 }), 12, 7]],
            ], w)],
        };
    },
    'key-events-revenue': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [DATE, filter('channel'), filter('country')],
            pages: [page('p_main', 'Key events', [
                [[kpi('w_kpis', ['ga4:keyEvents', 'ga4:sessionKeyEventRate', 'ga4:totalRevenue', 'ga4:transactions', 'ga4:averagePurchaseRevenue', 'ga4:purchaserRate']), 12, 3]],
                [[kpi('w_funnel', ['ga4:itemsViewed', 'ga4:addToCarts', 'ga4:checkouts', 'ga4:ecommercePurchases'], 'Shopping funnel'), 12, 3]],
                [[ts('w_revenue', 'Revenue', ['ga4:totalRevenue']), 6, 7], [breakdownTs('w_kebychannel', 'Key events by channel', 'ga4:keyEvents', 'channel'), 6, 7]],
                [[table('w_products', 'Top products', ['itemName'], ['ga4:itemRevenue', 'ga4:itemsPurchased', 'ga4:itemsViewed']), 6, 9],
                    [table('w_revchannel', 'Revenue by channel', ['channel'], ['ga4:totalRevenue', 'ga4:transactions', 'ga4:sessionKeyEventRate']), 6, 9]],
            ], w)],
        };
    },
    blank: () => ({ widgets: {}, controls: [DATE], pages: [{ id: 'p_main', title: 'Page 1', layouts: { lg: [] } }] }),
};

export const TEMPLATES: TemplateMeta[] = [
    { id: 'site-overview', name: 'Site overview', description: 'One screen of site health: search, traffic, pages and where visitors come from.', category: 'Overview', needs: ['gsc', 'ga4'] },
    { id: 'search-performance', name: 'Search performance', description: 'Search Console deep dive: queries, pages and quick wins.', category: 'Search', needs: ['gsc'] },
    { id: 'traffic-acquisition', name: 'Traffic overview', description: 'Where visitors come from and what they do.', category: 'Traffic', needs: ['ga4'] },
    { id: 'content-performance', name: 'Content performance', description: 'Which pages earn clicks, and which of those convert.', category: 'Content', needs: ['gsc', 'ga4'] },
    { id: 'portfolio', name: 'Portfolio', description: 'All sites in one report: totals, ranking and biggest movers.', category: 'Portfolio', needs: [], portfolio: true },
    { id: 'client-report', name: 'Client report', description: 'A three-page, shareable report with your logo and notes.', category: 'Reporting', needs: ['gsc', 'ga4'] },
    { id: 'audience-geography', name: 'Audience and geography', description: 'Who your visitors are and where they are.', category: 'Traffic', needs: ['ga4'] },
    { id: 'key-events-revenue', name: 'Key events and revenue', description: 'Conversions and ecommerce by channel and product.', category: 'Traffic', needs: ['ga4'] },
    // Round 2: sixteen new templates, appended (the eight above keep their ids and order).
    ...TEMPLATES_R2.map((t): TemplateMeta => ({ ...t, isNew: true })),
];

const BUILDERS: Record<string, Builder> = { ...BUILDERS_V1, ...BUILDERS_R2 };

export const BLANK_TEMPLATE: TemplateMeta = { id: 'blank', name: 'Blank', description: 'Start from an empty page.', category: 'Overview', needs: [] };

export function templateMeta(id: string): TemplateMeta | undefined {
    return id === 'blank' ? BLANK_TEMPLATE : TEMPLATES.find((t) => t.id === id);
}

/**
 * A template as a document. The shipped eight produce exactly what they always did; round-2
 * templates may also carry a suggested theme, a cover page and TV settings. `themeId` (from the
 * gallery) overrides the suggested theme; 'trafficclaw' means today's look.
 */
export function buildFromTemplate(id: string, opts: { name: string; defaultSource: DashboardDocV2['defaultSource']; themeId?: string }): DashboardDocV2 {
    const b = (BUILDERS[id] ?? BUILDERS.blank)({ defaultSource: opts.defaultSource });
    let theme: ThemeV2 = b.theme ?? defaultTheme('light');
    const wanted = opts.themeId && isThemeId(opts.themeId) ? opts.themeId : b.themeId;
    if (wanted && isThemeId(wanted) && (wanted !== 'trafficclaw' || opts.themeId)) theme = applyThemePreset(theme, wanted as ThemeId);
    if (b.cover) theme = { ...theme, cover: { enabled: true, layout: b.cover.layout ?? 'left', title: b.cover.title, subtitle: b.cover.subtitle } };
    const settings: DashboardDocV2['settings'] = { widthMode: b.widthMode ?? 'contained', autoRefreshSec: b.autoRefreshSec ?? 0 };
    if (b.tv) settings.tv = { rotateSec: ([0, 15, 30, 60, 120].includes(b.tv.rotateSec) ? b.tv.rotateSec : 30) as 0 | 15 | 30 | 60 | 120, hideControls: b.tv.hideControls };
    return {
        schemaVersion: 2,
        name: opts.name,
        defaultSource: opts.defaultSource,
        controls: b.controls,
        pages: b.pages,
        widgets: b.widgets,
        theme,
        settings,
        meta: { createdFrom: BUILDERS[id] ? id : 'blank' },
    };
}
