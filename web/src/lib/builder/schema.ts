/**
 * zod schemas for DashboardDocV2 and inline widgets (BUILDER.md 6). Server-side only: the save
 * route, the query route (inline editor widgets) and the tests import this; the client never
 * bundles zod.
 */
import { z } from 'zod';
import type { DashboardDocV2, WidgetDef } from './types';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shortText = z.string().max(300);
const metricId = z.string().regex(/^(ga4|gsc|calc):[A-Za-z0-9_:]{1,80}$/);
const dimId = z.string().regex(/^[A-Za-z0-9_:]{1,80}$/);
const httpsUrl = z.string().max(2000).refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'https URL only');

const siteRef = z.object({ siteId: z.string().min(1).max(253), ga4: z.string().max(40).optional(), gsc: z.string().max(300).optional() });
export const sourceRefSchema = z.union([
    z.object({ type: z.literal('default') }),
    siteRef.extend({ type: z.literal('site') }),
    z.object({ type: z.literal('portfolio'), include: z.union([z.literal('all'), z.literal('starred'), z.array(z.string().max(253)).max(500)]), exclude: z.array(z.string().max(253)).max(500).optional(), rollup: z.literal('sum').optional() }),
]);

const presetIds = ['today', 'yesterday', '7d', '14d', '28d', '30d', '90d', '3m', '6m', '12m', '16m', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year'] as const;
export const dateRangeSchema = z.union([
    z.object({ kind: z.literal('preset'), id: z.enum(presetIds), includeToday: z.boolean().optional() }),
    z.object({ kind: z.literal('custom'), start: iso, end: iso }),
    z.object({ kind: z.literal('rolling'), days: z.number().int().min(1).max(500), endOffsetDays: z.number().int().min(0).max(500).optional() }),
]);
export const compareSchema = z.union([
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('previous_period') }),
    z.object({ mode: z.literal('previous_year'), align: z.enum(['date', 'weekday']).optional() }),
    z.object({ mode: z.literal('custom'), start: iso, end: iso }),
]);

const scope = z.union([
    z.object({ mode: z.literal('all') }),
    z.object({ mode: z.literal('pages'), pageIds: z.array(id).max(50) }),
    z.object({ mode: z.literal('widgets'), widgetIds: z.array(id).max(200) }),
]);

const grainValue = z.enum(['auto', 'day', 'week', 'month']);

const filterOp = z.enum(['eq', 'neq', 'in', 'not_in', 'contains', 'not_contains', 'starts', 'ends', 'regex', 'not_regex']);
const filterClause = z.object({ dimension: dimId, op: filterOp, value: z.union([z.string().max(500), z.array(z.string().max(500)).max(100)]) });
const metricClause = z.object({ metric: metricId, op: z.enum(['gt', 'gte', 'lt', 'lte', 'between']), value: z.union([z.number(), z.tuple([z.number(), z.number()])]) });

const controlSchema = z.union([
    z.object({ id: z.literal('date'), type: z.literal('date'), default: dateRangeSchema, defaultCompare: compareSchema, presets: z.array(z.enum(presetIds)).max(20).optional(), viewerCanChange: z.boolean(), viewerCanCompare: z.boolean() }),
    z.object({ id, type: z.literal('filter'), label: shortText, dimension: dimId, ui: z.enum(['multiselect', 'select', 'chips', 'search']), default: z.array(z.string().max(500)).max(100).optional(), source: sourceRefSchema.optional(), scope, viewerCanChange: z.boolean() }),
    // Round 7 viewer switchers. A site control's `choices` (public docs only) is not listed, so it never saves.
    z.object({ id, type: z.literal('site'), label: shortText, options: z.union([z.literal('all'), z.array(z.string().max(253)).max(500)]), default: z.string().max(253), scope, viewerCanChange: z.boolean().optional() }),
    z.object({ id, type: z.literal('metric'), label: shortText, options: z.array(metricId).max(30), default: metricId, scope }),
    z.object({ id, type: z.literal('grain'), label: shortText, options: z.array(grainValue).min(1).max(4), default: grainValue, scope }),
    z.object({ id: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/), type: z.literal('variable'), label: z.string().min(1).max(60), kind: z.enum(['text', 'regex', 'number']), default: z.string().max(300), viewerCanChange: z.boolean() }),
]);

const numberFormat = z.object({ kind: z.enum(['auto', 'integer', 'decimal', 'percent', 'duration', 'currency', 'position']).optional(), decimals: z.number().int().min(0).max(6).optional(), compact: z.boolean().optional(), currency: z.string().max(3).optional() });
const metricRef = z.object({ id: metricId, label: shortText.optional(), format: numberFormat.optional() });
const comparison = z.looseObject({ show: z.boolean(), display: z.enum(['percent', 'absolute', 'both']) });
const sparkline = z.looseObject({ show: z.boolean(), kind: z.enum(['line', 'area', 'bars']) });

const base = {
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    showTitle: z.boolean().optional(),
    source: sourceRefSchema,
    style: z.looseObject({}).optional(),
    dateOverride: z.object({ range: dateRangeSchema.optional(), compare: compareSchema.optional() }).optional(),
    filters: z.array(filterClause).max(20).optional(),
    ignoreControls: z.array(z.string().max(64)).max(50).optional(),
    interactions: z.object({ clickToFilter: z.boolean().optional() }).optional(),
    mobile: z.object({ hidden: z.boolean().optional(), minHeight: z.number().optional() }).optional(),
};

const tableColumn = z.looseObject({ id: z.string().max(100), kind: z.enum(['dimension', 'metric']), ref: z.string().max(100), visual: z.enum(['none', 'bar', 'heat', 'delta']) });

export const widgetSchema = z.discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('scorecard'), config: z.looseObject({ metric: metricRef, comparison, sparkline }) }),
    z.object({ ...base, type: z.literal('kpi-strip'), config: z.looseObject({ metrics: z.array(metricRef).min(1).max(6), comparison, sparkline }) }),
    z.object({ ...base, type: z.literal('timeseries'), config: z.looseObject({ granularity: z.enum(['auto', 'day', 'week', 'month']), series: z.array(z.looseObject({ metric: metricRef, kind: z.enum(['line', 'area', 'bar']) })).min(1).max(4), breakdown: z.object({ dimension: dimId, top: z.number().int().min(1).max(8), other: z.boolean() }).optional() }) }),
    z.object({ ...base, type: z.literal('bar'), config: z.looseObject({ dimension: dimId, metrics: z.array(metricRef).min(1).max(3), stackBy: dimId.optional(), top: z.number().int().min(1).max(25) }) }),
    z.object({ ...base, type: z.literal('pie'), config: z.looseObject({ dimension: dimId, metric: metricRef, top: z.number().int().min(1).max(5) }) }),
    z.object({ ...base, type: z.literal('table'), config: z.looseObject({ dimensions: z.array(dimId).min(1).max(3), columns: z.array(tableColumn).min(1).max(14), maxRows: z.number().int().min(1).max(5000), rowFilters: z.array(metricClause).max(10).optional() }) }),
    z.object({ ...base, type: z.literal('geo'), config: z.looseObject({ level: z.literal('country'), metric: metricRef }) }),
    z.object({ ...base, type: z.literal('text'), config: z.looseObject({ markdown: z.string().max(20_000), role: z.enum(['heading', 'subheading', 'body', 'note', 'callout']) }) }),
    z.object({ ...base, type: z.literal('image'), config: z.looseObject({ src: httpsUrl, alt: z.string().max(300), fit: z.enum(['contain', 'cover']), href: httpsUrl.optional() }) }),
    z.object({ ...base, type: z.literal('section'), config: z.looseObject({ title: z.string().max(200), subtitle: z.string().max(300).optional(), divider: z.boolean() }) }),
    z.object({ ...base, type: z.literal('portfolio-grid'), config: z.looseObject({ metrics: z.array(metricRef).min(1).max(4), limit: z.number().int().min(1).max(500) }) }),
]);

const layoutItem = z.object({ i: id, x: z.number().int().min(0).max(24), y: z.number().int().min(0).max(5000), w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(100) });
const page = z.object({
    id,
    title: z.string().min(1).max(80),
    icon: z.string().max(40).optional(),
    hidden: z.boolean().optional(),
    layouts: z.object({ lg: z.array(layoutItem).max(200), md: z.array(layoutItem).max(200).optional(), sm: z.array(layoutItem).max(200).optional() }),
});

export const docSchema = z.object({
    schemaVersion: z.literal(2),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    defaultSource: sourceRefSchema.refine((s) => s.type !== 'default', 'defaultSource cannot be default'),
    controls: z.array(controlSchema).min(1).max(30),
    pages: z.array(page).min(1).max(20),
    widgets: z.record(z.string(), widgetSchema),
    theme: z.object({
        mode: z.enum(['light', 'dark', 'auto']),
        header: z.object({ show: z.boolean(), title: z.string().max(200).optional(), subtitle: z.string().max(300).optional(), companyName: z.string().max(120).optional(), logoUrl: httpsUrl.optional(), logoPosition: z.enum(['left', 'center', 'right']), showDates: z.boolean() }),
        badge: z.object({ show: z.boolean() }),
        legacy: z.record(z.string(), z.unknown()).optional(),
        // round 2 (optional; theme and settings are plain objects, so every new key is listed here or it is dropped on save)
        id: z.enum(['trafficclaw', 'executive', 'analyst', 'midnight', 'paper', 'sunrise', 'studio', 'contrast']).optional(),
        density: z.enum(['compact', 'comfortable', 'airy']).optional(),
        card: z.enum(['elevated', 'outlined', 'flat', 'ruled', 'glass']).optional(),
        pattern: z.enum(['none', 'dots', 'grid', 'glow']).optional(),
        font: z.enum(['geist', 'system', 'serif-headings', 'mono-numbers']).optional(),
        palette: z.enum(['standard', 'contrast']).optional(),
        brand: z.object({
            color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
            logoDarkUrl: httpsUrl.optional(),
            footer: z.string().max(160).optional(),
            preparedFor: z.string().max(80).optional(),
            preparedBy: z.string().max(80).optional(),
        }).optional(),
        cover: z.object({
            enabled: z.boolean(),
            layout: z.enum(['left', 'center', 'split']),
            title: z.string().max(120).optional(),
            subtitle: z.string().max(200).optional(),
            imageUrl: httpsUrl.optional(),
            showKpis: z.boolean().optional(),
        }).optional(),
    }),
    settings: z.object({
        widthMode: z.enum(['contained', 'full']),
        autoRefreshSec: z.union([z.literal(0), z.literal(300), z.literal(900), z.literal(1800), z.literal(3600)]),
        timezone: z.string().max(64).optional(),
        tv: z.object({ rotateSec: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(120)]), hideControls: z.boolean() }).optional(),
    }),
    meta: z.object({ createdFrom: z.string().max(64).optional(), migratedFromV1: z.object({ at: z.string(), propertyId: z.string(), siteUrl: z.string().optional() }).optional() }),
});

export const controlStateSchema = z.object({
    date: z.object({ range: dateRangeSchema, compare: compareSchema }),
    filters: z.record(z.string(), z.array(z.string().max(500)).max(100)).default({}),
    interaction: z.array(filterClause).max(10).optional(),
    site: z.record(z.string().max(64), z.string().max(253)).optional(),
    metric: z.record(z.string().max(64), metricId).optional(),
    grain: z.record(z.string().max(64), grainValue).optional(),
    pageId: z.string().max(64).optional(),
});

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fmtIssues(err: z.ZodError): string {
    return err.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

export function validateDoc(doc: unknown): ValidationResult<DashboardDocV2> {
    const r = docSchema.safeParse(doc);
    if (!r.success) return { ok: false, error: fmtIssues(r.error) };
    const d = r.data as unknown as DashboardDocV2;
    // Every layout item points at a widget; every widget sits on exactly one page.
    const seen = new Set<string>();
    for (const p of d.pages) {
        for (const l of p.layouts.lg) {
            if (!d.widgets[l.i]) return { ok: false, error: `layout item ${l.i} has no widget` };
            if (seen.has(l.i)) return { ok: false, error: `widget ${l.i} is on two pages` };
            seen.add(l.i);
        }
    }
    for (const [k, w] of Object.entries(d.widgets)) {
        if (w.id !== k) return { ok: false, error: `widget key ${k} does not match its id` };
    }
    const images = Object.values(d.widgets).filter((w) => w.type === 'image').length;
    if (images > 20) return { ok: false, error: 'At most 20 images per dashboard' };
    return { ok: true, value: d };
}

export function validateWidgets(widgets: unknown): ValidationResult<WidgetDef[]> {
    const r = z.array(widgetSchema).max(40).safeParse(widgets);
    if (!r.success) return { ok: false, error: fmtIssues(r.error) };
    return { ok: true, value: r.data as unknown as WidgetDef[] };
}
