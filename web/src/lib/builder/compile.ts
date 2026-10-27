/**
 * compileWidget: what data a widget needs (BUILDER.md 5 and 8.2). Isomorphic and pure, so the
 * client can derive a stable SWR key from the same function the server uses to plan Google
 * calls. Dates stay relative here; the server resolves them.
 */
import { getMetric } from './catalog';
import { clickDimension } from './interaction';
import { widgetMetrics } from './registry';
import { substituteFilters, variableValues } from './variables';
import type {
    ControlDef,
    ControlState,
    FilterClause,
    FilterControl,
    PageId,
    SourceRef,
    WidgetDef,
    WidgetQuery,
} from './types';

export interface CompileCtx {
    controlDefs: ControlDef[];
    controls: ControlState;
    /** Page the widget sits on (for page-scoped controls). */
    pageId?: PageId;
}

export interface CompiledWidget {
    queries: WidgetQuery[];
    /** Filter clauses with the control they came from (to report filters a family ignores). */
    filterOrigins: Array<{ clause: FilterClause; controlId?: string }>;
}

function inScope(control: FilterControl, widget: WidgetDef, pageId?: PageId): boolean {
    const s = control.scope;
    if (!s || s.mode === 'all') return true;
    if (s.mode === 'pages') return pageId ? s.pageIds.includes(pageId) : false;
    return s.widgetIds.includes(widget.id);
}

/** Control + widget + interaction filters that apply to a widget. */
export function widgetFilters(widget: WidgetDef, ctx: CompileCtx): Array<{ clause: FilterClause; controlId?: string }> {
    const out: Array<{ clause: FilterClause; controlId?: string }> = [];
    const ignore = new Set(widget.ignoreControls ?? []);
    if (!ignore.has('filters')) {
        for (const c of ctx.controlDefs) {
            if (c.type !== 'filter' || ignore.has(c.id) || !inScope(c, widget, ctx.pageId)) continue;
            const values = (ctx.controls.filters?.[c.id] ?? c.default ?? []).filter((v) => typeof v === 'string' && v.length > 0);
            if (!values.length) continue;
            out.push({
                controlId: c.id,
                clause: c.ui === 'search' ? { dimension: c.dimension, op: 'contains', value: values[0] } : { dimension: c.dimension, op: values.length === 1 ? 'eq' : 'in', value: values.length === 1 ? values[0] : values },
            });
        }
        // Click to filter: the widget that was clicked keeps showing all of its values.
        const own = clickDimension(widget);
        for (const clause of ctx.controls.interaction ?? []) if (clause.dimension !== own) out.push({ clause, controlId: 'interaction' });
    }
    // Widget filters, with dashboard variables ({{var:name}}) filled in.
    const widgetOwn = widget.filters?.length ? substituteFilters(widget.filters, variableValues(ctx.controlDefs, ctx.controls)) : widget.filters;
    for (const clause of widgetOwn ?? []) out.push({ clause });
    return out;
}

const timeDim = (g: 'day' | 'week' | 'month'): string => (g === 'day' ? 'date' : g);

export function compileWidget(widget: WidgetDef, ctx: CompileCtx): CompiledWidget {
    const filterOrigins = widgetFilters(widget, ctx);
    const filters = filterOrigins.map((f) => f.clause);
    const source: SourceRef = widget.source ?? { type: 'default' };
    const compareOn = ctx.controls.date.compare.mode !== 'none' && !(widget.ignoreControls ?? []).includes('compare');
    const base = { source, filters };
    const queries: WidgetQuery[] = [];

    switch (widget.type) {
        case 'scorecard':
        case 'kpi-strip': {
            const metrics = widgetMetrics(widget);
            if (!metrics.length) break;
            queries.push({ ...base, part: 'total', metrics, dimensions: [], compare: compareOn && widget.config.comparison.show });
            if (widget.config.sparkline.show) {
                queries.push({ ...base, part: 'spark', metrics, dimensions: ['date'], compare: false, fillDates: true });
            }
            break;
        }
        case 'timeseries': {
            const c = widget.config;
            const metrics = c.series.map((s) => s.metric.id);
            if (!metrics.length) break;
            const g = c.granularity === 'auto' ? undefined : c.granularity;
            const pivot = c.breakdown && metrics.length === 1 ? { dimension: c.breakdown.dimension, top: Math.min(8, Math.max(1, c.breakdown.top)), other: c.breakdown.other } : undefined;
            queries.push({
                ...base, part: 'series', metrics,
                dimensions: [g ? timeDim(g) : 'date', ...(pivot ? [pivot.dimension] : [])],
                granularity: g,
                compare: compareOn && c.compare === 'inherit' && !pivot,
                fillDates: true,
                pivot,
            });
            break;
        }
        case 'bar': {
            const c = widget.config;
            const metrics = c.metrics.map((m) => m.id).slice(0, c.stackBy ? 1 : 3);
            if (!metrics.length) break;
            const pivot = c.stackBy ? { dimension: c.stackBy, top: 5, other: true } : undefined;
            const sortBy = c.sort.by === 'dimension' ? c.dimension : c.sort.by;
            queries.push({
                ...base, part: 'rows', metrics,
                dimensions: [c.dimension, ...(pivot ? [pivot.dimension] : [])],
                sort: { by: metrics.includes(sortBy) || sortBy === c.dimension ? sortBy : metrics[0], dir: c.sort.dir },
                top: { n: Math.min(25, Math.max(1, c.top)), other: c.other && allAdditive(metrics) },
                compare: compareOn && c.compare === 'inherit' && !pivot,
                pivot,
            });
            break;
        }
        case 'pie': {
            const c = widget.config;
            queries.push({
                ...base, part: 'rows', metrics: [c.metric.id], dimensions: [c.dimension],
                sort: { by: c.metric.id, dir: 'desc' },
                top: { n: Math.min(5, Math.max(1, c.top)), other: c.other && allAdditive([c.metric.id]) },
                totals: true,
                compare: compareOn,
            });
            break;
        }
        case 'table': {
            const c = widget.config;
            const metrics = widgetMetrics(widget);
            if (!metrics.length || !c.dimensions.length) break;
            const sortRef = c.sort.by.replace(/^[dm]:/, '');
            const wantsCompare = compareOn && (c.sortByChange || c.columns.some((col) => col.kind === 'metric' && !col.hidden && (col.showDelta || col.visual === 'delta')) || Boolean(c.rules?.some((r) => r.on === 'change')));
            queries.push({
                ...base, part: 'rows', metrics, dimensions: c.dimensions.slice(0, 3),
                sort: { by: metrics.includes(sortRef) || c.dimensions.includes(sortRef) ? sortRef : metrics[0], dir: c.sort.dir },
                limit: Math.min(5000, Math.max(10, c.maxRows || 1000)),
                having: c.rowFilters,
                compare: wantsCompare,
                totals: c.totalsRow,
            });
            if (c.totalsRow) queries.push({ ...base, part: 'totals', metrics, dimensions: [], compare: wantsCompare });
            break;
        }
        case 'geo': {
            queries.push({ ...base, part: 'rows', metrics: [widget.config.metric.id], dimensions: ['country'], sort: { by: widget.config.metric.id, dir: 'desc' }, limit: 300, compare: compareOn });
            break;
        }
        case 'portfolio-grid': {
            const c = widget.config;
            const metrics = c.metrics.map((m) => m.id).slice(0, 4);
            if (!metrics.length) break;
            queries.push({ ...base, part: 'sites', metrics, dimensions: ['site'], compare: true });
            if (c.sparkline) queries.push({ ...base, part: 'spark', metrics: metrics.slice(0, 2), dimensions: ['site', 'date'], compare: false, fillDates: true });
            break;
        }
        default:
            break;
    }
    return { queries, filterOrigins };
}

function allAdditive(metrics: string[]): boolean {
    return metrics.every((id) => getMetric(id)?.additive);
}

/** Deterministic JSON (sorted keys) for cache and SWR keys. */
export function canonicalJson(value: unknown): string {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}
