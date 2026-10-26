/**
 * Builds a "Widget showcase" dashboard doc (every widget type) for screenshots and manual checks.
 * Run: cd web && npx --offline tsx tests/builder/showcase.ts > /tmp/showcase.json
 */
import { buildFromTemplate } from '@/lib/builder/templates';
import { defaultWidget } from '@/lib/builder/registry';
import { addWidget } from '@/lib/builder/docOps';
import type { DashboardDocV2, WidgetDef } from '@/lib/builder/types';

let doc: DashboardDocV2 = buildFromTemplate('blank', { name: 'Widget showcase', defaultSource: { type: 'site', siteId: 'acmeanalytics.example', ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' } });
const ctx = { families: { ga4: true, gsc: true } };
const page = doc.pages[0].id;
const add = (w: WidgetDef, at: { x: number; y: number; w: number; h: number }) => { doc = addWidget(doc, page, w, at); };

const section = defaultWidget('section', ctx, 'w_section') as Extract<WidgetDef, { type: 'section' }>;
section.config = { title: 'Search and traffic at a glance', subtitle: 'Every widget type, live demo data', divider: true, align: 'left' };
add(section, { x: 0, y: 0, w: 12, h: 2 });
const metrics = ['gsc:clicks', 'gsc:position', 'ga4:activeUsers', 'ga4:engagementRate'];
metrics.forEach((m, i) => {
    const s = defaultWidget('scorecard', ctx, `w_sc${i}`) as Extract<WidgetDef, { type: 'scorecard' }>;
    s.config.metric = { id: m };
    add(s, { x: i * 3, y: 2, w: 3, h: 4 });
});
const ts = defaultWidget('timeseries', ctx, 'w_ts') as Extract<WidgetDef, { type: 'timeseries' }>;
ts.title = 'Clicks and impressions';
ts.config.series = [{ metric: { id: 'gsc:clicks' }, kind: 'area' }, { metric: { id: 'gsc:impressions' }, kind: 'line' }];
add(ts, { x: 0, y: 6, w: 8, h: 7 });
add(defaultWidget('pie', ctx, 'w_pie'), { x: 8, y: 6, w: 4, h: 7 });
const stacked = defaultWidget('bar', ctx, 'w_bar') as Extract<WidgetDef, { type: 'bar' }>;
stacked.title = 'Sessions by channel and device';
stacked.config = { ...stacked.config, dimension: 'channel', metrics: [{ id: 'ga4:sessions' }], stackBy: 'device', variant: 'chart', orientation: 'vertical', top: 6, sort: { by: 'ga4:sessions', dir: 'desc' } };
add(stacked, { x: 0, y: 13, w: 6, h: 8 });
const list = defaultWidget('bar', { families: { ga4: false, gsc: true } }, 'w_list');
list.title = 'Top queries';
add(list, { x: 6, y: 13, w: 6, h: 8 });
const table = defaultWidget('table', { families: { ga4: false, gsc: true } }, 'w_table') as Extract<WidgetDef, { type: 'table' }>;
table.config.search = true;
table.config.totalsRow = true;
add(table, { x: 0, y: 21, w: 7, h: 10 });
add(defaultWidget('geo', ctx, 'w_geo'), { x: 7, y: 21, w: 5, h: 10 });
const kpi = defaultWidget('kpi-strip', ctx, 'w_kpi');
add(kpi, { x: 0, y: 31, w: 12, h: 3 });
const text = defaultWidget('text', ctx, 'w_text') as Extract<WidgetDef, { type: 'text' }>;
text.config = { markdown: '### Notes\nTraffic for **{{site}}** in {{date_range}}, {{compare_range}}.\n- Organic clicks grew\n- Engagement held steady', role: 'callout', align: 'left', variables: true };
add(text, { x: 0, y: 34, w: 8, h: 5 });
const img = defaultWidget('image', ctx, 'w_img') as Extract<WidgetDef, { type: 'image' }>;
img.config = { src: 'https://trafficclaw.com/icon.svg', alt: 'TrafficClaw logo', fit: 'contain', radius: 'md' };
add(img, { x: 8, y: 34, w: 4, h: 5 });
const grid = defaultWidget('portfolio-grid', ctx, 'w_grid') as Extract<WidgetDef, { type: 'portfolio-grid' }>;
grid.config.limit = 6;
add(grid, { x: 0, y: 39, w: 12, h: 12 });
process.stdout.write(JSON.stringify(doc));
