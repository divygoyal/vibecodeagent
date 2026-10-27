import * as z from 'zod';
import { fmtPeriod, resolvePeriod, type Period } from '../dates';
import { ToolError } from '../errors';
import { fmtNum, headerLine, render, renderJson, type Cell } from '../format';
import { gaRows, gaTotals, type GaReport, type GoogleClient } from '../google';
import { requireGa4, suggestions } from '../siteResolver';
import { dateRangeArg, defineTool, formatArg, J, siteArg, type ToolContext } from '../toolkit';
import { gaDate } from './common';

// ───────────── field validation and formatting ─────────────

export async function validateGa4Fields(g: GoogleClient, property: string, metrics: string[], dimensions: string[]): Promise<void> {
    let meta;
    try {
        meta = await g.ga4Metadata(property);
    } catch {
        return; // let Google validate if metadata is unavailable
    }
    const mset = new Set((meta.metrics || []).map((m) => m.apiName));
    const dset = new Set((meta.dimensions || []).map((d) => d.apiName));
    const bad: string[] = [];
    for (const m of metrics) {
        if (!mset.has(m)) {
            const s = suggestions(m, Array.from(mset));
            bad.push(`metric "${m}"${dset.has(m) ? ' is a dimension' : ''}${s.length ? ` (did you mean ${s.join(', ')}?)` : ''}`);
        }
    }
    for (const d of dimensions) {
        if (!dset.has(d)) {
            const s = suggestions(d, Array.from(dset));
            bad.push(`dimension "${d}"${mset.has(d) ? ' is a metric' : ''}${s.length ? ` (did you mean ${s.join(', ')}?)` : ''}`);
        }
    }
    if (bad.length) throw new ToolError('invalid_argument', `Unknown GA4 field(s): ${bad.join('; ')}`, 'Call ga4_metadata to search valid names.');
}

const PATH_DIMS = new Set(['pagePath', 'landingPage', 'pageLocation', 'pageReferrer', 'fullPageUrl', 'linkUrl']);

export function gaDimCell(ctx: ToolContext, name: string, value: string): string {
    if (name === 'date') return gaDate(value);
    if (PATH_DIMS.has(name)) return ctx.san.path(value, 200);
    return ctx.san.text(value, 160);
}

export function gaMetricCell(value: number, type?: string): string {
    if (!Number.isFinite(value)) return '';
    if (type === 'TYPE_INTEGER') return String(Math.round(value));
    if (type === 'TYPE_SECONDS' || type === 'TYPE_MILLISECONDS') return fmtNum(value, 1);
    if (type?.startsWith('TYPE_CURRENCY') || type === 'TYPE_STANDARD') return fmtNum(value, 2);
    if (Number.isInteger(value)) return String(value);
    return fmtNum(value, Math.abs(value) < 1 ? 4 : 2);
}

const FilterSchema = z.object({
    field: z.string().min(1).max(100),
    op: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'begins_with', 'ends_with', 'regex', 'in_list']),
    value: z.string().max(500).optional(),
    values: z.array(z.string().max(200)).max(50).optional(),
    case_sensitive: z.boolean().default(false),
}).strict();

type GaFilter = z.output<typeof FilterSchema>;

export function buildDimensionFilter(filters: GaFilter[] | undefined): Record<string, unknown> | undefined {
    if (!filters?.length) return undefined;
    const exprs = filters.map((f) => {
        const negate = f.op.startsWith('not_');
        const base = negate ? f.op.slice(4) : f.op;
        let filter: Record<string, unknown>;
        if (base === 'in_list') {
            if (!f.values?.length) throw new ToolError('invalid_argument', `filter on ${f.field}: in_list needs values`);
            filter = { fieldName: f.field, inListFilter: { values: f.values, caseSensitive: f.case_sensitive } };
        } else {
            if (f.value === undefined) throw new ToolError('invalid_argument', `filter on ${f.field}: ${f.op} needs value`);
            const matchType = { equals: 'EXACT', contains: 'CONTAINS', begins_with: 'BEGINS_WITH', ends_with: 'ENDS_WITH', regex: 'FULL_REGEXP' }[base] ?? 'EXACT';
            filter = { fieldName: f.field, stringFilter: { matchType, value: f.value, caseSensitive: f.case_sensitive } };
        }
        const expr = { filter };
        return negate ? { notExpression: expr } : expr;
    });
    return exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
}

function rangeName(raw: string | undefined, i: number): string {
    const cleaned = (raw || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^(date_range_|reserved_)/, '').slice(0, 20);
    return cleaned || (i === 0 ? 'a' : 'b');
}

/** Metadata beside the rows of ga4_run_report (renderGaReport's envelope). */
const GA_REPORT_PROPS = {
    site: J.str,
    property: J.str,
    date_ranges: { type: 'array', items: J.range },
    rows_returned: J.int,
    row_count: J.int,
    next_offset: J.orNull(J.int),
    time_zone: J.orNull(J.str),
    currency: J.orNull(J.str),
    flags: J.strs,
};

export const ga4RunReport = defineTool({
    name: 'ga4_run_report',
    title: 'GA4 report',
    description: 'Run a Google Analytics 4 report for one site with up to 8 metrics and 5 dimensions, one or two date ranges, filters, ordering and paging, using GA4 API field names (for example sessions, activeUsers, keyEvents; sessionDefaultChannelGroup, pagePath, country, date). Use ga4_metadata to find valid names. Returns at most 200 rows per call, with totals if requested.',
    input: z.object({
        site: siteArg,
        metrics: z.array(z.string().min(1).max(100)).min(1).max(8).describe('GA4 metric API names, for example sessions, activeUsers, engagementRate, keyEvents.'),
        dimensions: z.array(z.string().min(1).max(100)).max(5).optional().describe('GA4 dimension API names, for example date, sessionDefaultChannelGroup, pagePath, country, deviceCategory.'),
        date_ranges: z.array(z.object({
            preset: dateRangeArg.shape.preset,
            start_date: z.string().max(20).optional(),
            end_date: z.string().max(20).optional(),
            name: z.string().max(20).optional(),
        }).strict()).min(1).max(2).optional().describe('One range, or two to compare. Default one range {preset:last_28d}.'),
        filters: z.array(FilterSchema).max(10).optional().describe('Dimension filters, all ANDed.'),
        metric_filters: z.array(z.object({
            field: z.string().min(1).max(100),
            op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'between']),
            value: z.number(),
            value_to: z.number().optional(),
        }).strict()).max(5).optional().describe('Filters on metric values (like SQL HAVING), ANDed.'),
        order_by: z.array(z.object({ field: z.string().min(1).max(100), direction: z.enum(['asc', 'desc']).default('desc') }).strict()).max(3).optional(),
        limit: z.number().int().min(1).max(200).default(25),
        offset: z.number().int().min(0).max(100000).default(0),
        totals: z.boolean().default(true),
        format: formatArg,
    }).strict(),
    cost: 2,
    invoking: 'Running the GA4 report…',
    invoked: 'GA4 report ready',
    output: { data: 'format', props: GA_REPORT_PROPS },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { property } = requireGa4(site);
        const metrics = Array.from(new Set(args.metrics));
        const dims = Array.from(new Set(args.dimensions || []));
        const g = await ctx.google();
        await validateGa4Fields(g, property, metrics, [...dims, ...(args.filters || []).map((f) => f.field)]);
        const hasDate = dims.some((d) => /^date/.test(d));
        const ranges = (args.date_ranges?.length ? args.date_ranges : [{ preset: 'last_28d' as const }]).map((r, i) => {
            const { period, warnings } = resolvePeriod(r, { source: 'ga4', hasDateDimension: hasDate });
            warnings.forEach((w) => ctx.warn(w));
            return { period, name: rangeName((r as { name?: string }).name, i) };
        });
        if (ranges.length === 2 && ranges[0].name === ranges[1].name) ranges[1].name = `${ranges[1].name}_2`;

        const orderBys = (args.order_by || []).map((o) => {
            if (metrics.includes(o.field)) return { metric: { metricName: o.field }, desc: o.direction === 'desc' };
            if (dims.includes(o.field)) return { dimension: { dimensionName: o.field }, desc: o.direction === 'desc' };
            throw new ToolError('invalid_argument', `order_by field "${o.field.slice(0, 60)}" must be one of the requested metrics or dimensions`);
        });
        const metricFilter = args.metric_filters?.length ? {
            andGroup: {
                expressions: args.metric_filters.map((f) => {
                    if (f.op === 'between') {
                        if (f.value_to === undefined) throw new ToolError('invalid_argument', `metric filter on ${f.field}: between needs value_to`);
                        return { filter: { fieldName: f.field, betweenFilter: { fromValue: { doubleValue: f.value }, toValue: { doubleValue: f.value_to } } } };
                    }
                    const operation = { gt: 'GREATER_THAN', gte: 'GREATER_THAN_OR_EQUAL', lt: 'LESS_THAN', lte: 'LESS_THAN_OR_EQUAL', eq: 'EQUAL' }[f.op];
                    return { filter: { fieldName: f.field, numericFilter: { operation, value: { doubleValue: f.value } } } };
                }),
            },
        } : undefined;

        const body: Record<string, unknown> = {
            dateRanges: ranges.map((r) => ({ startDate: r.period.start, endDate: r.period.end, name: r.name })),
            dimensions: dims.map((name) => ({ name })),
            metrics: metrics.map((name) => ({ name })),
            limit: args.limit,
            offset: args.offset,
            ...(orderBys.length ? { orderBys } : {}),
            ...(buildDimensionFilter(args.filters) ? { dimensionFilter: buildDimensionFilter(args.filters) } : {}),
            ...(metricFilter ? { metricFilter } : {}),
            ...(args.totals ? { metricAggregations: ['TOTAL'] } : {}),
        };
        const includesToday = ranges.some((r) => r.period.end >= new Date().toISOString().slice(0, 10));
        const report = await g.ga4Report(property, body, { includesToday });
        return renderGaReport(ctx, report, { tool: 'ga4_run_report', site: site.site_id, property, ranges: ranges.map((r) => r.period), dims, metrics, multiRange: ranges.length > 1, offset: args.offset, format: args.format });
    },
});

export function renderGaReport(ctx: ToolContext, report: GaReport, o: { tool: string; site: string; property: string; ranges: Period[]; dims: string[]; metrics: string[]; multiRange: boolean; offset: number; format: 'table' | 'json'; headerExtra?: string[] }) {
    const types = (report.metricHeaders || []).map((h) => h.type);
    const rows: Cell[][] = gaRows(report).map((r) => {
        const dimCells = o.dims.map((d, i) => gaDimCell(ctx, d, r.dims[i] ?? ''));
        const rangeCell = o.multiRange ? [ctx.san.text(r.dims[o.dims.length] ?? '', 30)] : [];
        return [...rangeCell, ...dimCells, ...r.mets.map((v, i) => gaMetricCell(v, types[i]))];
    });
    const totals = gaTotals(report);
    const totalRows: Cell[][] = totals.map((t, i) => [...(o.multiRange ? [ctx.san.text(report.totals?.[i]?.dimensionValues?.[o.dims.length]?.value ?? '', 30)] : []), ...o.dims.map((_, j) => (j === 0 ? 'TOTAL' : '')), ...t.map((v, k) => gaMetricCell(v, types[k]))]);
    if (!o.dims.length && totalRows.length) totalRows.length = 0; // totals equal the single row
    const columns = [...(o.multiRange ? ['date_range'] : []), ...o.dims, ...o.metrics];
    const rowCount = report.rowCount ?? rows.length;
    const nextOffset = o.offset + rows.length < rowCount ? o.offset + rows.length : null;
    const md = report.metadata || {};
    const flags = [md.subjectToThresholding ? 'thresholded (Google hid small numbers)' : '', md.samplingMetadatas?.length ? 'sampled' : '', md.dataLossFromOtherRow ? 'some rows grouped into (other)' : ''].filter(Boolean);
    const envelope = { site: o.site, property: o.property, date_ranges: o.ranges.map((r) => ({ start: r.start, end: r.end })), rows_returned: rows.length, row_count: rowCount, next_offset: nextOffset, time_zone: md.timeZone ?? null, currency: md.currencyCode ?? null, flags };
    const allRows = [...rows, ...totalRows];
    if (o.format === 'json') {
        const j = renderJson([{ columns, rows: allRows }], envelope);
        return { text: j.text, rows: j.rowsReturned, structured: { ...envelope, ...j.data, truncated: j.truncated } };
    }
    const header = [...ctx.banner(), headerLine([o.tool, o.site, o.property, o.ranges.map(fmtPeriod).join(' vs '), md.timeZone ? `tz ${md.timeZone}` : null, md.currencyCode ? `currency ${md.currencyCode}` : null, `${rows.length} of ${rowCount} rows`, ...(o.headerExtra || [])])];
    const footer = [
        flags.length ? `# flags: ${flags.join(', ')}` : '',
        nextOffset !== null ? `# more rows: call again with offset ${nextOffset}` : '',
        rows.length && o.dims.length ? ctx.note() : '',
    ];
    const out = render(header, [{ columns, rows: allRows }], footer);
    return { text: out.text, rows: out.rowsReturned, structured: { ...envelope, table: out.text, truncated: out.truncated } };
}

export const ga4Realtime = defineTool({
    name: 'ga4_realtime',
    title: 'GA4 realtime',
    description: 'Show who is on a site right now (last 5 to 30 minutes) from the GA4 Realtime API: active users, optionally split by country, device, page or screen, or event. Realtime data covers only the last 30 minutes. Use for \'is my site getting traffic right now\' and launch monitoring.',
    input: z.object({
        site: siteArg,
        minutes: z.union([z.literal(5), z.literal(10), z.literal(30)]).default(30),
        dimensions: z.array(z.string().min(1).max(100)).max(3).optional().describe('Realtime dimension API names, for example country, city, deviceCategory, unifiedScreenName, eventName, minutesAgo. Default unifiedScreenName.'),
        metrics: z.array(z.string().min(1).max(100)).max(4).optional().describe('Default activeUsers. Others: screenPageViews, eventCount, keyEvents.'),
        filters: z.array(z.object({
            field: z.string().min(1).max(100),
            op: z.enum(['equals', 'not_equals', 'contains', 'begins_with', 'in_list']),
            value: z.string().max(500).optional(),
            values: z.array(z.string().max(200)).max(20).optional(),
        }).strict()).max(5).optional(),
        limit: z.number().int().min(1).max(100).default(20),
    }).strict(),
    cost: 2,
    invoking: 'Checking who is on the site…',
    invoked: 'Realtime checked',
    output: { data: 'table', props: { site: J.str, property: J.str, minutes: J.int, active_users: J.orNull(J.num) } },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { property } = requireGa4(site);
        const dims = Array.from(new Set(args.dimensions?.length ? args.dimensions : ['unifiedScreenName']));
        const metrics = Array.from(new Set(args.metrics?.length ? args.metrics : ['activeUsers']));
        const filter = buildDimensionFilter(args.filters?.map((f) => ({ ...f, case_sensitive: false })));
        const g = await ctx.google();
        const report = await g.ga4Realtime(property, {
            dimensions: dims.map((name) => ({ name })),
            metrics: metrics.map((name) => ({ name })),
            minuteRanges: [{ startMinutesAgo: args.minutes - 1, endMinutesAgo: 0 }],
            limit: args.limit,
            metricAggregations: ['TOTAL'],
            ...(filter ? { dimensionFilter: filter } : {}),
        });
        const types = (report.metricHeaders || []).map((h) => h.type);
        const rows: Cell[][] = gaRows(report).map((r) => [...dims.map((d, i) => gaDimCell(ctx, d, r.dims[i] ?? '')), ...r.mets.map((v, i) => gaMetricCell(v, types[i]))]);
        let totals = gaTotals(report)[0];
        if (!totals && gaRows(report).length) {
            // Some responses omit totals; one dimensionless call gives the true total (users are not additive across pages).
            const t = await g.ga4Realtime(property, { metrics: metrics.map((name) => ({ name })), minuteRanges: [{ startMinutesAgo: args.minutes - 1, endMinutesAgo: 0 }], ...(filter ? { dimensionFilter: filter } : {}) });
            totals = gaRows(t)[0]?.mets;
        }
        const totalActive = totals ? totals[metrics.indexOf('activeUsers')] : undefined;
        const header = [...ctx.banner(), headerLine(['ga4_realtime', site.site_id, property, `last ${args.minutes} minutes`, totalActive !== undefined && metrics.includes('activeUsers') ? `activeUsers ${Math.round(totalActive)}` : null])];
        if (totals) rows.push([...dims.map((_, j) => (j === 0 ? 'TOTAL' : '')), ...totals.map((v, i) => gaMetricCell(v, types[i]))]);
        const out = render(header, [{ columns: [...dims, ...metrics], rows }], ['# realtime data is cached for 30 seconds', rows.length > 1 ? ctx.note() : '']);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, property, minutes: args.minutes, active_users: totalActive ?? null, table: out.text, truncated: out.truncated } };
    },
});

export const ga4Metadata = defineTool({
    name: 'ga4_metadata',
    title: 'GA4 fields',
    description: 'Search the GA4 dimensions and metrics available to a site, including custom ones: API name, label, type, category and a short description. Use before ga4_run_report when unsure of valid field names, or to discover a property\'s custom dimensions and metrics.',
    input: z.object({
        site: siteArg,
        kind: z.enum(['all', 'dimensions', 'metrics']).default('all'),
        search: z.string().max(100).optional().describe('Case-insensitive substring over API name, label and description.'),
        custom_only: z.boolean().default(false),
        category: z.string().max(60).optional().describe('For example Traffic source, Page / screen, Geography, Session.'),
        limit: z.number().int().min(1).max(100).default(40),
    }).strict(),
    cost: 1,
    invoking: 'Reading GA4 fields…',
    invoked: 'GA4 fields listed',
    output: { data: 'table', props: { site: J.str, property: J.str, matched: J.int, returned: J.int } },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { property } = requireGa4(site);
        const g = await ctx.google();
        const meta = await g.ga4Metadata(property);
        type Field = { kind: string; apiName: string; uiName?: string; description?: string; category?: string; type?: string; customDefinition?: boolean };
        let fields: Field[] = [
            ...(args.kind !== 'metrics' ? (meta.dimensions || []).map((d) => ({ ...d, kind: 'dimension', type: 'STRING' })) : []),
            ...(args.kind !== 'dimensions' ? (meta.metrics || []).map((m) => ({ ...m, kind: 'metric' })) : []),
        ];
        if (args.custom_only) fields = fields.filter((f) => f.customDefinition);
        if (args.category) fields = fields.filter((f) => (f.category || '').toLowerCase().includes(args.category!.toLowerCase()));
        if (args.search) {
            const q = args.search.toLowerCase();
            fields = fields.filter((f) => [f.apiName, f.uiName, f.description].some((v) => (v || '').toLowerCase().includes(q)));
        }
        const total = fields.length;
        const rows: Cell[][] = fields.slice(0, args.limit).map((f) => [f.kind, f.apiName, ctx.san.text(f.uiName, 60), (f.type || '').replace(/^TYPE_/, '').toLowerCase(), ctx.san.text(f.category, 40), f.customDefinition ? 'yes' : '', ctx.san.text(f.description, 100)]);
        const header = [...ctx.banner(), headerLine(['ga4_metadata', site.site_id, property, `${rows.length} of ${total} fields`])];
        const out = render(header, [{ columns: ['kind', 'api_name', 'label', 'type', 'category', 'custom', 'description'], rows }], [total > rows.length ? '# more fields match; narrow with search, kind or category' : '']);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, property, matched: total, returned: rows.length, table: out.text, truncated: out.truncated || total > rows.length } };
    },
});
