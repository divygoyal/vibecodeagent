/**
 * Turns the results of a dashboard's widgets into what the email shows (round 9): KPI tiles for
 * scorecards and KPI strips, picture specs for time series, bar and pie widgets. Pure: no Google,
 * no network, no React, so the tests feed it canned results.
 */
import { fmtMetricValue, getMetric, metricDeltaFor, metricLabel } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import { compareLabel, presetLabel } from '@/lib/builder/dates';
import { friendlyDimValue } from '@/lib/builder/levelLabels';
import { brandCompanyName } from '@/lib/builder/placeholders';
import type { CellValue, CompareSpec, DashboardDocV2, DateControl, NumberFormat, DashboardQueryResponse, DataFrame, PageDef, WidgetDef, WidgetResultOk } from '@/lib/builder/types';
import { resolveWidgetDates } from '@/lib/builder/widgetDates';
import { barSize, chartUrl, downsample, LINE_SIZE, type ChartSpec } from './chartSpec';
import { describeSchedule, lowerFirst, type EmailScheduleConfig } from './schedule';
import type { DigestChart, DigestKpi, DigestModel, DigestPage } from './types';

/** Layout-only widgets: never counted as missing from the email. */
const DECORATIVE = new Set<WidgetDef['type']>(['text', 'image', 'section']);

export const MAX_KPIS_PER_PAGE = 6;
export const MAX_CHARTS_PER_PAGE = 3;

const PRODUCT_ACCENT = '#0d3a2c';

/** metricColor gives a CSS variable; pictures need a hex. Same palette as lib/metrics (light mode). */
const HEX_OF: Record<string, string> = {
    clicks: '#1f5bd6', impressions: '#b77be6', ctr: '#0e8f7a', position: '#d9730d', users: '#5b4fe0', sessions: '#2f7bd9',
    pageviews: '#8a63d2', conversions: '#12795a', revenue: '#b8860b', ai: '#c2410c',
};
export function metricHex(id: string): string {
    const key = getMetric(id)?.colorKey ?? 'sessions';
    return HEX_OF[key] ?? '#1f5bd6';
}

const okOf = (r: DashboardQueryResponse['results'][string] | undefined): WidgetResultOk | null => (!r ? null : r.status === 'ok' ? r : r.stale ?? null);

function dimText(dim: string, v: CellValue, labels?: Record<string, string>): string {
    if (v === null || v === undefined || v === '') return '(not set)';
    const s = String(v);
    if (labels?.[s]) return labels[s];
    const friendly = friendlyDimValue(dim, s);
    if (friendly) return friendly;
    if (dim === 'country') return s === '(other)' ? 'Other' : countryName(s);
    if (dim === 'device') return s.charAt(0).toUpperCase() + s.slice(1);
    return s === '(other)' ? 'Other' : s;
}

const shortDay = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

function kpiOf(metricId: string, label: string | undefined, frame: DataFrame | undefined, ok: WidgetResultOk, showDelta: boolean, compare: string, format?: NumberFormat): DigestKpi | null {
    const row = frame?.rows[0];
    if (!row) return null;
    const raw = row[`m:${metricId}`];
    const cur = typeof raw === 'number' ? raw : null;
    const prevRaw = row[`m:${metricId}:prev`];
    const prev = typeof prevRaw === 'number' ? prevRaw : null;
    const fam = metricId.split(':')[0];
    if (ok.flags.missingFamilies?.includes(fam as 'ga4' | 'gsc')) return null;
    const kpi: DigestKpi = { label: label || metricLabel(metricId), value: fmtMetricValue(metricId, cur, { compact: true, tile: true, currency: ok.flags.currency, format }) };
    if (showDelta && prevRaw !== undefined) {
        const d = metricDeltaFor(metricId, cur, prev);
        if (d.state !== 'none') {
            kpi.delta = { text: d.text, dir: d.direction, tone: d.tone };
            if (compare) kpi.compare = compare;
        }
    }
    return kpi;
}

function lineChart(w: Extract<WidgetDef, { type: 'timeseries' }>, ok: WidgetResultOk, compare: boolean): ChartSpec | null {
    const frame = ok.parts.series;
    const s = w.config.series[0];
    if (!frame || !s || frame.rows.length < 2) return null;
    const id = s.metric.id;
    const rows = frame.rows;
    const vals = rows.map((r) => (typeof r[`m:${id}`] === 'number' ? (r[`m:${id}`] as number) : 0));
    // No data in the comparison window (last year before the property existed) is a gap in the dashed line, not a drop to 0.
    const prevAll = compare && !w.config.breakdown && rows.some((r) => `m:${id}:prev` in r) ? rows.map((r) => (typeof r[`m:${id}:prev`] === 'number' ? (r[`m:${id}:prev`] as number) : null)) : undefined;
    const prev = prevAll?.some((x) => x !== null) ? prevAll : undefined;
    const dates = rows.map((r) => String(r['d:date'] ?? ''));
    const hi = Math.max(...vals);
    const last = vals[vals.length - 1];
    // Pictures show whole numbers (31,616), never a mix of 31.6K and 8,421; the KPI tiles above are the compact ones.
    const fmt = (v: number) => fmtMetricValue(id, v, { currency: ok.flags.currency });
    return {
        g: 'line',
        t: (w.title || metricLabel(id)).slice(0, 60),
        c: metricHex(id),
        v: downsample(vals),
        ...(prev ? { p: downsample(prev) } : {}),
        l: [shortDay(dates[0]), shortDay(dates[dates.length - 1])],
        f: [fmt(hi), fmt(last)],
    };
}

function barChart(w: Extract<WidgetDef, { type: 'bar' | 'pie' }>, ok: WidgetResultOk): ChartSpec | null {
    const frame = ok.parts.rows;
    const metric = w.type === 'bar' ? w.config.metrics[0]?.id : w.config.metric.id;
    const dim = w.type === 'bar' ? w.config.dimension : w.config.dimension;
    if (!frame || !metric || !frame.rows.length || frame.seriesKeys?.length) return null;
    const rows = frame.rows.slice(0, 7);
    return {
        g: 'bar',
        t: (w.title || `${metricLabel(metric)} by ${dim}`).slice(0, 60),
        c: metricHex(metric),
        v: rows.map((r) => (typeof r[`m:${metric}`] === 'number' ? (r[`m:${metric}`] as number) : 0)),
        l: rows.map((r) => dimText(dim, r[`d:${dim}`], frame.labels)),
        f: rows.map((r) => fmtMetricValue(metric, typeof r[`m:${metric}`] === 'number' ? (r[`m:${metric}`] as number) : null, { currency: ok.flags.currency })),
        m: metricLabel(metric),
    };
}

export interface ModelInput {
    doc: DashboardDocV2;
    /** One query response per emailed page, in order. */
    pages: Array<{ page: PageDef; res: DashboardQueryResponse }>;
    config: EmailScheduleConfig;
    origin: string;
    /** Public view token when the dashboard is shared and not expired, else null. */
    shareToken: string | null;
    dashboardId: string;
    siteLabel: string;
    /** The dashboard's comparison rule (round 9: includes same-weekday and custom days). A widget with its own comparison overrides it. */
    compare: CompareSpec;
    secret?: string | null;
}

export function widgetOrder(page: PageDef): string[] {
    return [...page.layouts.lg].sort((a, b) => a.y - b.y || a.x - b.x).map((l) => l.i);
}

export function buildDigestModel(input: ModelInput): DigestModel {
    const { doc, config, origin } = input;
    const pages: DigestPage[] = [];
    let omitted = 0;
    let rangeLabel = '';

    for (const { page, res } of input.pages) {
        if (res.resolved && !rangeLabel) {
            const r = res.resolved.range;
            const dateCtl = doc.controls.find((c): c is DateControl => c.type === 'date');
            const preset = config.range === '7d' ? 'Last 7 days' : config.range === '28d' ? 'Last 28 days' : presetLabel(dateCtl?.default ?? { kind: 'preset', id: '28d' });
            rangeLabel = `${preset} · ${shortDay(r.start)} – ${shortDay(r.end)}`;
        }
        const kpis: DigestKpi[] = [];
        const charts: DigestChart[] = [];
        const shown = new Set<string>();
        for (const id of widgetOrder(page)) {
            const w = doc.widgets[id];
            if (!w || w.type === undefined) continue;
            const ok = okOf(res.results[id]);
            if (!ok) continue;
            // The rule this widget compares by: its own (own dates, round 9) or the dashboard's.
            const spec = resolveWidgetDates(w.dateOverride, { range: res.resolved.range, compare: res.resolved.compare, compareSpec: input.compare, today: res.resolved.today }).compareSpec;
            const compareOn = spec.mode !== 'none';
            const cmpText = compareOn ? compareLabel(spec) : '';
            if (w.type === 'scorecard') {
                const k = kpiOf(w.config.metric.id, w.config.metric.label || (w.showTitle !== false ? w.title : undefined), ok.parts.total, ok, w.config.comparison.show && compareOn, cmpText, w.config.metric.format);
                if (k && kpis.length < MAX_KPIS_PER_PAGE) { kpis.push(k); shown.add(id); }
            } else if (w.type === 'kpi-strip') {
                for (const m of w.config.metrics) {
                    const k = kpiOf(m.id, m.label, ok.parts.total, ok, w.config.comparison.show && compareOn, cmpText, m.format);
                    if (k && kpis.length < MAX_KPIS_PER_PAGE) { kpis.push(k); shown.add(id); }
                }
            } else if (charts.length < MAX_CHARTS_PER_PAGE && (w.type === 'timeseries' || w.type === 'bar' || w.type === 'pie')) {
                const chart = w.type === 'timeseries' ? lineChart(w, ok, compareOn) : barChart(w, ok);
                if (!chart) continue;
                const size = chart.g === 'line' ? LINE_SIZE : barSize(chart.v.length);
                shown.add(id);
                charts.push({
                    title: chart.t,
                    imageUrl: chartUrl(origin, chart, input.secret),
                    alt: chart.g === 'line' ? `${chart.t}: ${chart.f[1]} now, high ${chart.f[0]}, ${chart.l.join(' to ')}` : `${chart.t}: ${chart.l.slice(0, 3).map((l, i) => `${l} ${chart.f[i]}`).join(', ')}`,
                    ...size,
                });
            }
        }
        // Data widgets the email cannot draw (tables, maps, heatmaps, realtime, embeds…) or that failed: counted so the email can say so.
        omitted += widgetOrder(page).filter((id) => { const t = doc.widgets[id]?.type; return t !== undefined && !DECORATIVE.has(t) && !shown.has(id); }).length;
        if (kpis.length || charts.length) pages.push({ title: page.title, kpis, charts });
    }

    const viewUrl = input.shareToken ? `${origin}/view/${input.shareToken}` : `${origin}/dashboard/dashboards/${input.dashboardId}`;
    return {
        dashboardName: doc.name,
        rangeLabel: rangeLabel || 'Latest data',
        siteLabel: input.siteLabel,
        pages,
        omitted,
        viewUrl,
        viewKind: input.shareToken ? 'public' : 'app',
        message: config.message,
        accent: doc.theme.brand?.color ?? PRODUCT_ACCENT,
        company: brandCompanyName(doc.theme) ?? undefined,
        scheduleText: `You get this email ${lowerFirst(describeSchedule(config))}.`,
    };
}
