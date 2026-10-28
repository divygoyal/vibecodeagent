/**
 * compileWidget: what data a widget needs (BUILDER.md 5 and 8.2). Isomorphic and pure, so the
 * client can derive a stable SWR key from the same function the server uses to plan Google
 * calls. Dates stay relative here; the server resolves them.
 */
import { expandCalcs, isCalcId, parseCalcId } from './calc';
import { getMetric, metricLabel } from './catalog';
import { applyDrill, drillFilters } from './drill';
import { chartMetrics, compileChart, swapChartMetric } from './charts';
import { clickDimension } from './interaction';
import { widgetMetrics } from './registry';
import { isSearchType, searchTypeEligible } from './searchType';
import { substituteFilters, variableValues } from './variables';
import type {
    ControlDef,
    ControlScope,
    ControlState,
    FilterClause,
    Grain,
    GrainControl,
    MetricControl,
    MetricId,
    MetricRef,
    PageId,
    RefLine,
    SearchType,
    SearchTypeControl,
    SiteControl,
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

function inScope(control: { scope?: ControlScope }, widget: WidgetDef, pageId?: PageId): boolean {
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
    // Drill down (round 8): the values clicked on the levels above the one shown. After variable
    // substitution on purpose: a clicked value is data, never a {{var}} to fill in.
    for (const clause of drillFilters(widget, ctx.controls.drill)) out.push({ clause, controlId: 'drill' });
    return out;
}

// ── Viewer switchers (round 7): site, metric, Day / Week / Month ─────────────

/** Controls of one type that apply to a widget (scope, and not ignored by the widget). */
function controlsFor<T extends ControlDef['type']>(type: T, widget: WidgetDef, ctx: CompileCtx): Array<Extract<ControlDef, { type: T }>> {
    const ignore = new Set(widget.ignoreControls ?? []);
    return ctx.controlDefs.filter((c): c is Extract<ControlDef, { type: T }> => c.type === type && !ignore.has(c.id) && inScope(c as { scope?: ControlScope }, widget, ctx.pageId));
}

/**
 * The site a site control points at: the viewer's pick when the control allows it, else the control's
 * default; undefined = the dashboard's default site. Only an explicit list is checked here; for
 * options 'all' (and always, on the server) the owner's site directory decides (server/access.ts).
 */
export function selectedSite(control: SiteControl, controls: ControlState): string | undefined {
    const pick = controls.site?.[control.id];
    const ok = (v: string | undefined): v is string => typeof v === 'string' && v.length > 0 && v.length <= 253 && (control.options === 'all' || (Array.isArray(control.options) && control.options.includes(v)));
    if (ok(pick)) return pick;
    return ok(control.default) ? control.default : undefined;
}

/** The metric a metric control shows: the viewer's pick when it is one of the options, else the default. */
export function selectedMetric(control: MetricControl, controls: ControlState): MetricId {
    const pick = controls.metric?.[control.id];
    return pick && pick !== control.default && Array.isArray(control.options) && control.options.includes(pick) && getMetric(pick) ? pick : control.default;
}

/** The granularity a Day / Week / Month control asks for ('auto' = each chart keeps its own). */
export function selectedGrain(control: GrainControl, controls: ControlState): 'auto' | Grain {
    const pick = controls.grain?.[control.id];
    const options = Array.isArray(control.options) ? control.options : [];
    if (pick && options.includes(pick)) return pick;
    return control.default === 'day' || control.default === 'week' || control.default === 'month' ? control.default : 'auto';
}

/** The search type a search type control shows: the viewer's pick when it is an option, else the control's default. */
export function selectedSearchType(control: SearchTypeControl, controls: ControlState): { type: SearchType; picked: boolean } {
    const pick = controls.searchType?.[control.id];
    const options = Array.isArray(control.options) ? control.options : [];
    if (isSearchType(pick) && options.includes(pick)) return { type: pick, picked: true };
    return { type: isSearchType(control.default) ? control.default : 'web', picked: false };
}

/** Metric ids a widget shows (for "which widgets follow this metric control"). */
export function widgetMetricIds(widget: WidgetDef): MetricId[] {
    switch (widget.type) {
        case 'scorecard': return [widget.config.metric.id];
        case 'kpi-strip': return widget.config.metrics.map((m) => m.id);
        case 'timeseries': return widget.config.series.map((s) => s.metric.id);
        case 'bar': return widget.config.metrics.map((m) => m.id);
        case 'pie': return [widget.config.metric.id];
        case 'geo': return [widget.config.metric.id];
        case 'table': return widget.config.columns.filter((c) => c.kind === 'metric').map((c) => c.ref);
        case 'portfolio-grid': return widget.config.metrics.map((m) => m.id);
        default: return chartMetrics(widget);
    }
}

/** True when a metric control can change this widget (in scope and the widget shows the control's default metric). */
export function followsMetricControl(control: MetricControl, widget: WidgetDef, ctx: Pick<CompileCtx, 'controlDefs' | 'pageId'>): boolean {
    if ((widget.ignoreControls ?? []).includes(control.id) || !inScope(control, widget, ctx.pageId)) return false;
    return widgetMetricIds(widget).includes(control.default);
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Clicks over time" -> "Impressions over time" when the title names the metric that was swapped. */
function retitle(title: string | undefined, from: MetricId, to: MetricId): string | undefined {
    if (!title) return title;
    const a = metricLabel(from);
    const b = metricLabel(to);
    const re = new RegExp(`\\b${escapeRe(a)}\\b`, 'gi');
    return title.replace(re, (m) => (m[0] === m[0].toLowerCase() ? b.charAt(0).toLowerCase() + b.slice(1) : b));
}

function swapRefs(refs: MetricRef[], from: MetricId, to: MetricId): MetricRef[] {
    const out: MetricRef[] = [];
    for (const r of refs) {
        const next = r.id === from ? { id: to } : r;
        if (!out.some((o) => o.id === next.id)) out.push(next);
    }
    return out;
}

/**
 * Goal / reference / average lines when a time series' metric is swapped (round 7: metric switcher x
 * chart lines). A goal or reference value was set for the old metric, so it is dropped, like a scorecard
 * target: drawn on the new metric's scale it would be a wrong number. An average is computed from the
 * data, so it moves to the new metric. Lines on the chart's other metrics stay. A line without a
 * metric is on the first series.
 */
function swapRefLines(lines: RefLine[], first: MetricId | undefined, from: MetricId, to: MetricId): RefLine[] {
    const out: RefLine[] = [];
    for (const l of lines) {
        if ((l.metric ?? first) !== from) out.push(l);
        else if (l.kind === 'average') out.push(l.metric ? { ...l, metric: to } : l);
    }
    return out;
}

/** One metric swapped in a widget's config (labels and formats of the old metric are dropped). */
function swapMetric(widget: WidgetDef, from: MetricId, to: MetricId): WidgetDef {
    const sortRef = (by: string) => (by === from ? to : by);
    const base = { ...widget, title: retitle(widget.title, from, to) } as WidgetDef;
    const oneNumberShare = parseCalcId(to)?.op === 'share';
    switch (base.type) {
        case 'scorecard': {
            // A "% of total" calc is always 100% as one number (the editor hides it for scorecards and KPI strips).
            if (base.config.metric.id !== from || oneNumberShare) return widget;
            // A target belongs to the metric it was set for.
            const { target: _t, ...rest } = base.config;
            void _t;
            return { ...base, config: { ...rest, metric: { id: to } } };
        }
        case 'kpi-strip': return oneNumberShare ? widget : { ...base, config: { ...base.config, metrics: swapRefs(base.config.metrics, from, to) } };
        case 'timeseries': {
            const series: typeof base.config.series = [];
            for (const sd of base.config.series) {
                const next = sd.metric.id === from ? { ...sd, metric: { id: to } } : sd;
                if (!series.some((x) => x.metric.id === next.metric.id)) series.push(next);
            }
            const config = { ...base.config, series };
            if (base.config.refLines) {
                const refLines = swapRefLines(base.config.refLines, base.config.series[0]?.metric.id, from, to);
                if (refLines.length) config.refLines = refLines;
                else delete config.refLines;
            }
            return { ...base, config };
        }
        case 'bar': return { ...base, config: { ...base.config, metrics: swapRefs(base.config.metrics, from, to), sort: { ...base.config.sort, by: sortRef(base.config.sort.by) } } };
        case 'pie': return base.config.metric.id === from ? { ...base, config: { ...base.config, metric: { id: to } } } : widget;
        case 'geo': return base.config.metric.id === from ? { ...base, config: { ...base.config, metric: { id: to } } } : widget;
        case 'portfolio-grid': return { ...base, config: { ...base.config, metrics: swapRefs(base.config.metrics, from, to), sort: { ...base.config.sort, by: sortRef(base.config.sort.by) as typeof base.config.sort.by } } };
        case 'table': {
            const c = base.config;
            const swapped = new Set<string>();
            const columns = c.columns.map((col) => {
                if (col.kind !== 'metric' || col.ref !== from) return col;
                swapped.add(col.id);
                return { ...col, ref: to, label: undefined, format: undefined };
            });
            const sortBy = c.sort.by === from ? to : c.sort.by === `m:${from}` ? `m:${to}` : c.sort.by;
            return {
                ...base,
                config: {
                    ...c,
                    columns,
                    sort: { ...c.sort, by: sortBy },
                    // Thresholds were set for the old metric.
                    ...(c.rules ? { rules: c.rules.filter((r) => !swapped.has(r.column)) } : {}),
                    ...(c.rowFilters ? { rowFilters: c.rowFilters.filter((f) => f.metric !== from) } : {}),
                },
            };
        }
        default: return swapChartMetric(base, from, to);
    }
}

/**
 * A widget as the viewer's switchers show it: a widget on the dashboard's default site reads the site
 * control's pick, metrics follow metric controls and time series follow a Day / Week / Month control.
 * Pure and idempotent; the server applies it before planning Google calls and the client before
 * rendering, so both read the same columns. `site: false` keeps the source (rendering only).
 */
export function applyViewerControls(widget: WidgetDef, ctx: CompileCtx, opts: { site?: boolean } = {}): WidgetDef {
    let w = widget;
    if (opts.site !== false && (!w.source || w.source.type === 'default')) {
        const sc = controlsFor('site', w, ctx)[0];
        const siteId = sc ? selectedSite(sc, ctx.controls) : undefined;
        if (siteId) w = { ...w, source: { type: 'site', siteId } } as WidgetDef;
    }
    for (const mc of controlsFor('metric', w, ctx)) {
        const to = selectedMetric(mc, ctx.controls);
        const ids = widgetMetricIds(w);
        // A widget that already shows the pick (a KPI strip with clicks and impressions) stays as it is.
        if (to !== mc.default && ids.includes(mc.default) && !ids.includes(to)) w = swapMetric(w, mc.default, to);
    }
    if (w.type === 'timeseries') {
        const gc = controlsFor('grain', w, ctx)[0];
        const g = gc ? selectedGrain(gc, ctx.controls) : 'auto';
        if (g !== 'auto' && w.config.granularity !== g) w = { ...w, config: { ...w.config, granularity: g } };
    }
    // Round 8: the search type switcher moves Search Console widgets (every metric from Search Console).
    // A widget with its own non-web search type keeps it (its title says so); the control moves only the
    // widgets left on Web. A control left on Web with no pick changes nothing.
    const own = w.searchType && w.searchType !== 'web';
    const tc = !own && searchTypeEligible(w) ? controlsFor('searchType', w, ctx)[0] : undefined;
    if (tc) {
        const { type, picked } = selectedSearchType(tc, ctx.controls);
        if ((picked || type !== 'web') && (w.searchType ?? 'web') !== type) w = { ...w, searchType: type === 'web' ? undefined : type };
    }
    // Round 8: drill down (the dimension of the level the viewer is on, and the clicked values as filters).
    return applyDrill(w, ctx.controls.drill);
}

const timeDim = (g: 'day' | 'week' | 'month'): string => (g === 'day' ? 'date' : g);

export function compileWidget(rawWidget: WidgetDef, ctx: CompileCtx): CompiledWidget {
    const widget = applyViewerControls(rawWidget, ctx);
    const filterOrigins = widgetFilters(widget, ctx);
    const filters = filterOrigins.map((f) => f.clause);
    const source: SourceRef = widget.source ?? { type: 'default' };
    // A widget with its own comparison (round 9) asks for it whatever the dashboard shows; "none" there turns it off.
    const compareOn = (widget.dateOverride?.compare ? widget.dateOverride.compare.mode !== 'none' : ctx.controls.date.compare.mode !== 'none') && !(widget.ignoreControls ?? []).includes('compare');
    // Search Console search type (round 8): only for widgets that read Search Console alone; web is the API default.
    const searchType = searchTypeEligible(widget) && isSearchType(widget.searchType) && widget.searchType !== 'web' ? widget.searchType : undefined;
    const base = { source, filters, ...(searchType ? { searchType } : {}) };
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
            // Round 9 charts (heatmap, scatter, funnel, treemap, pivot): charts/index.ts
            queries.push(...compileChart(widget, base));
            break;
    }
    return { queries, filterOrigins };
}

function allAdditive(metrics: string[]): boolean {
    // A calculated metric gets an "Other" row when its inputs add up (round 7: computed from their sums).
    return metrics.every((id) => getMetric(id)?.additive || (isCalcId(id) && expandCalcs([id]).every((x) => getMetric(x)?.additive)));
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
