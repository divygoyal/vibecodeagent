/**
 * What a shared dashboard's link preview (the Open Graph card of /view/<token>) shows besides its name: the site, the
 * date range and two or three real KPI numbers with their change, taken from the dashboard's first KPI widgets
 * (scorecards and KPI strips of the first visible page). Pure: no Google, no network, no React, so tests feed it canned
 * results. The server loader (server/shareCard.ts) runs the query and caches.
 */
import { fmtMetricPair, getMetric, isCalcMetric, metricDeltaFor, metricLabel } from './catalog';
import { presetLabel } from './dates';
import type { ControlState, DashboardDocV2, DashboardQueryResponse, WidgetResultOk } from './types';

/** The card has room for three tiles. */
export const SHARE_CARD_KPIS = 3;

export interface ShareCardKpi {
    label: string;
    value: string;
    /** The change against the comparison period; missing when the dashboard or the widget does not compare. */
    delta?: { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' };
}

export interface ShareCardNumbers {
    /** The data source's name as the public dashboard shows it ("acme.com", "All sites"); missing when unknown. */
    site?: string;
    /** "Last 28 days · Sep 30 – Oct 27". */
    range: string;
    kpis: ShareCardKpi[];
}

type Layout = { i: string; x: number; y: number };

/** The KPI widgets of the first visible page in reading order, as many as can fill the card. Widgets with their own dates are left out (the card's range would not describe them). */
export function pickKpiWidgetIds(doc: Pick<DashboardDocV2, 'pages' | 'widgets'>): string[] {
    const page = doc.pages.find((p) => !p.hidden);
    if (!page) return [];
    const order = [...(page.layouts.lg as Layout[])].sort((a, b) => a.y - b.y || a.x - b.x);
    const ids: string[] = [];
    let count = 0;
    for (const l of order) {
        const w = doc.widgets[l.i];
        if (!w || (w.type !== 'scorecard' && w.type !== 'kpi-strip') || w.dateOverride) continue;
        const usable = w.type === 'scorecard' ? [w.config.metric] : w.config.metrics;
        const n = usable.filter((m) => !isCalcMetric(m.id) && getMetric(m.id)).length;
        if (!n) continue;
        ids.push(l.i);
        count += n;
        if (count >= SHARE_CARD_KPIS) break;
    }
    return ids;
}

const okOf = (r: DashboardQueryResponse['results'][string] | undefined): WidgetResultOk | null => (!r ? null : r.status === 'ok' ? r : r.stale ?? null);

const shortDay = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** "Last 28 days · Sep 30 – Oct 27". */
export function shareCardRange(controls: Pick<ControlState, 'date'>, resolved: DashboardQueryResponse['resolved'] | undefined): string {
    const label = presetLabel(controls.date.range);
    const r = resolved?.range;
    return r ? `${label} · ${shortDay(r.start)} – ${shortDay(r.end)}` : label;
}

/**
 * The card's numbers from a query response, or null when there is nothing honest to show (no KPI widget, every one failed,
 * or a number is missing). Never invents a value: a tile whose figure did not come back is left out.
 */
export function shareCardNumbers(doc: Pick<DashboardDocV2, 'pages' | 'widgets'>, res: DashboardQueryResponse, controls: Pick<ControlState, 'date'>): ShareCardNumbers | null {
    const compareOn = controls.date.compare.mode !== 'none';
    const kpis: ShareCardKpi[] = [];
    let site: string | undefined;
    for (const id of pickKpiWidgetIds(doc)) {
        const w = doc.widgets[id];
        const ok = okOf(res.results[id]);
        if (!w || !ok) continue;
        const frame = ok.parts.total;
        const row = frame?.rows[0];
        if (!row) continue;
        site ??= ok.sourceLabel;
        const metrics = w.type === 'scorecard' ? [w.config.metric] : w.type === 'kpi-strip' ? w.config.metrics : [];
        const showDelta = (w.type === 'scorecard' || w.type === 'kpi-strip') && w.config.comparison.show && compareOn;
        for (const m of metrics) {
            if (kpis.length >= SHARE_CARD_KPIS) break;
            if (isCalcMetric(m.id) || !getMetric(m.id)) continue;
            const raw = row[`m:${m.id}`];
            if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
            // A metric whose Google product the source lacks shows "–" in the dashboard: not on a share card.
            if (ok.flags.missingFamilies?.includes(m.id.split(':')[0] as 'ga4' | 'gsc')) continue;
            const prev = row[`m:${m.id}:prev`];
            const kpi: ShareCardKpi = { label: m.label || metricLabel(m.id), value: fmtMetricPair(m.id, raw, showDelta && typeof prev === 'number' ? prev : null, { compact: true, tile: true, currency: ok.flags.currency, format: m.format }).value };
            if (showDelta && prev !== undefined) {
                const d = metricDeltaFor(m.id, raw, typeof prev === 'number' ? prev : null);
                if (d.state === 'change' || d.state === 'flat') kpi.delta = { text: d.text, dir: d.direction, tone: d.tone };
            }
            kpis.push(kpi);
        }
        if (kpis.length >= SHARE_CARD_KPIS) break;
    }
    if (!kpis.length) return null;
    return { ...(site ? { site } : {}), range: shareCardRange(controls, res.resolved), kpis };
}

/** Settles with the promise's value, or null once `ms` have passed (the promise keeps running; nothing is cancelled). */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            () => { clearTimeout(timer); resolve(null); },
        );
    });
}
