/**
 * Round 9 templates built around the new chart widgets (heatmap, scatter, funnel, treemap, pivot).
 * Kept in their own file; templates.ts adds BUILDERS_R9 and TEMPLATES_R9 to its lists in two lines.
 *
 * Every widget source is `default` (the template follows whichever site the user picks), and every
 * widget evaluates against the demo generator (tests/builder/chart-templates.test.ts).
 */
import { barList, kpi, section, table, text } from './templates.round2';
import type { BuildCtx, BuiltR2 } from './templates.round2';
import type { FunnelWidget, HeatmapWidget, PivotWidget, ScatterWidget, TreemapWidget } from './charts/types';
import type { ControlDef, LayoutItem, PageDef, SourceRef, WidgetDef } from './types';

const D: SourceRef = { type: 'default' };
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

const date = (preset: '28d' | '3m' = '28d'): ControlDef => ({ id: 'date', type: 'date', default: { kind: 'preset', id: preset }, defaultCompare: { mode: 'none' }, viewerCanChange: true, viewerCanCompare: false });
const device = (): ControlDef => ({ id: 'f_device', type: 'filter', label: 'Device', dimension: 'device', ui: 'select', scope: { mode: 'all' }, viewerCanChange: true });
const country = (): ControlDef => ({ id: 'f_country', type: 'filter', label: 'Country', dimension: 'country', ui: 'multiselect', scope: { mode: 'all' }, viewerCanChange: true });

const heatmap = (id: string, title: string, variant: HeatmapWidget['config']['variant'], metric: string, over: Partial<HeatmapWidget> = {}): HeatmapWidget => ({
    id, type: 'heatmap', title, source: D, config: { variant, metric: { id: metric }, weekStart: 'mon', finding: true }, ...over,
});

const scatter = (id: string, title: string, config: Omit<ScatterWidget['config'], 'quadrants' | 'labels' | 'top' | 'yScale'> & Partial<ScatterWidget['config']>): ScatterWidget => ({
    id, type: 'scatter', title, source: D, config: { top: 60, quadrants: true, yScale: 'linear', labels: false, ...config },
});

const funnel = (id: string, title: string, config: FunnelWidget['config']): FunnelWidget => ({ id, type: 'funnel', title, source: D, config });

const treemap = (id: string, title: string, config: TreemapWidget['config']): TreemapWidget => ({ id, type: 'treemap', title, source: D, config });

const pivot = (id: string, title: string, config: PivotWidget['config']): PivotWidget => ({ id, type: 'pivot', title, source: D, config });

export const BUILDERS_R9: Record<string, (ctx: BuildCtx) => BuiltR2> = {
    // 1 ───────────────────────────────────────────────────────────────────
    'when-visitors-come': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [date('28d'), device()],
            pages: [page('p_main', 'When visitors come', [
                [[text('w_intro', '## When do people visit?\nThe darker the cell, the busier the hour. Post and send emails when people are there; ship risky changes when it is quiet.', 'heading'), 12, 2]],
                [[kpi('w_kpis', ['ga4:sessions', 'ga4:activeUsers', 'ga4:engagementRate', 'ga4:keyEvents']), 12, 3]],
                [
                    [heatmap('w_peak', 'Sessions by weekday and hour', 'weekday-hour', 'ga4:sessions'), 6, 8],
                    [heatmap('w_peak_events', 'Key events by weekday and hour', 'weekday-hour', 'ga4:keyEvents'), 6, 8],
                ],
                [[heatmap('w_calendar', 'Sessions by day, last 12 months', 'calendar', 'ga4:sessions', { dateOverride: { range: { kind: 'preset', id: '12m' }, compare: { mode: 'none' } } }), 12, 6]],
                [[text('w_tip', '### How to use this\n- Schedule newsletters and social posts for the busiest weekday and hour.\n- Plan risky site changes for the quietest cells.\n- Compare key events with sessions: the busiest hour is not always the one that converts.', 'callout'), 12, 4]],
            ], w)],
        };
    },

    // 2 ───────────────────────────────────────────────────────────────────
    'content-opportunities': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w, themeId: 'analyst',
            controls: [date('3m'), device(), country()],
            pages: [page('p_main', 'Content opportunities', [
                [[kpi('w_kpis', ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position']), 12, 3]],
                [
                    [scatter('w_pages', 'Pages: impressions against CTR', { dimension: 'page', x: { id: 'gsc:impressions' }, y: { id: 'gsc:ctr' }, size: { id: 'gsc:clicks' }, xScale: 'log', highlight: 'br' }), 7, 10],
                    [table('w_gap', 'Seen a lot, clicked rarely', ['page'], ['gsc:impressions', 'gsc:ctr', 'gsc:clicks'], { sort: { by: 'm:gsc:impressions', dir: 'desc' }, rowFilters: [{ metric: 'gsc:ctr', op: 'lt', value: 0.02 }], pageSize: 10, maxRows: 2000, bars: ['gsc:impressions'] }), 5, 10],
                ],
                [
                    [scatter('w_queries', 'Queries: impressions against position', { dimension: 'query', x: { id: 'gsc:impressions' }, y: { id: 'gsc:position' }, size: { id: 'gsc:clicks' }, xScale: 'log', highlight: 'tr', top: 80 }), 6, 10],
                    [treemap('w_tree', 'Clicks by page', { dimension: 'page', metric: { id: 'gsc:clicks' }, top: 24, colorBy: 'value', showValues: true }), 6, 10],
                ],
                [[text('w_how', '### How to read the scatter plots\nThe dashed lines are the medians. **Pages:** the shaded corner (bottom right) holds pages with above-median impressions and below-median CTR: better titles and descriptions win clicks there. **Queries:** position 1 is at the top, so the shaded corner (bottom right) holds popular queries where you rank worse than the median position: a stronger page or better internal links can lift them.', 'callout'), 12, 4]],
            ], w)],
        };
    },

    // 3 ───────────────────────────────────────────────────────────────────
    'shopping-funnel': () => {
        const w: Record<string, WidgetDef> = {};
        return {
            widgets: w,
            controls: [date('28d'), device(), country()],
            pages: [page('p_main', 'Shopping funnel', [
                [[kpi('w_kpis', ['ga4:totalRevenue', 'ga4:transactions', 'ga4:sessions', 'ga4:keyEvents']), 12, 3]],
                [
                    [funnel('w_funnel', 'From visit to purchase', {
                        metric: { id: 'ga4:activeUsers' }, showDropoff: true,
                        steps: [
                            { label: 'Visited', kind: 'event', value: 'session_start' },
                            { label: 'Viewed a product', kind: 'event', value: 'view_item' },
                            { label: 'Added to cart', kind: 'event', value: 'add_to_cart' },
                            { label: 'Started checkout', kind: 'event', value: 'begin_checkout' },
                            { label: 'Bought', kind: 'event', value: 'purchase' },
                        ],
                    }), 5, 10],
                    [pivot('w_pivot', 'Sessions by channel and device', { rows: 'channel', columns: 'device', metric: { id: 'ga4:sessions' }, topRows: 8, topColumns: 3, other: true, totals: true, heat: 'row' }), 7, 10],
                ],
                [[treemap('w_revenue', 'Revenue by channel and source', { parent: 'channel', dimension: 'source', metric: { id: 'ga4:totalRevenue' }, top: 30, colorBy: 'group', showValues: true }), 12, 9]],
                [[barList('w_items', 'Items purchased by product', 'itemName', 'ga4:itemsPurchased'), 6, 8], [pivot('w_orders', 'Transactions by country and device', { rows: 'country', columns: 'device', metric: { id: 'ga4:transactions' }, topRows: 8, topColumns: 3, other: true, totals: true, heat: 'cell' }), 6, 8]],
                [[section('w_note', 'About the funnel', 'Each step is counted on its own (not visitors followed in order), so use it to see where the biggest drop is, not as an exact conversion rate.'), 12, 2]],
            ], w)],
        };
    },
};

export const TEMPLATES_R9: Array<{
    id: string; name: string; description: string; category: 'Traffic' | 'Search' | 'Ecommerce'; needs: Array<'gsc' | 'ga4'>; audience: string; themeId?: string;
}> = [
    { id: 'when-visitors-come', name: 'When visitors come', description: 'Busiest weekday and hour, and a calendar of the last 12 months, for sessions and key events.', category: 'Traffic', needs: ['ga4'], audience: 'Anyone who schedules posts, emails or releases' },
    { id: 'content-opportunities', name: 'Content opportunities', description: 'Scatter plots of pages and queries with median guides: seen a lot but clicked rarely, popular but ranked low.', category: 'Search', needs: ['gsc'], audience: 'SEO and content teams', themeId: 'analyst' },
    { id: 'shopping-funnel', name: 'Shopping funnel and segments', description: 'The steps from visit to purchase, a channel by device matrix and revenue by channel and source.', category: 'Ecommerce', needs: ['ga4'], audience: 'Shop owners and ecommerce managers' },
];
