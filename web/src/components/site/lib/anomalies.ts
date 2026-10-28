/**
 * Site Overview "Alerts": anomalies only (round 4, audit item 5). Pure, no
 * React: drops and spikes of the period totals, one unusual day per metric and
 * queries that fell off page one. Every number comes from the same summaries
 * the page header tiles show (same range, same comparison, same delta maths),
 * and every alert names its window. Opportunities (striking distance, quick
 * wins) are tasks, so they live in "What to fix next", never here.
 */
import { computeDelta, deltaOptionsFor, fmtDateRange, fmtDay, fmtFull, fmtPosition } from '@/lib/format';
import type { ActionType, Ga4Summary, GscRow, GscSummary } from './types';

export interface AnomalyWindow {
    start: string;
    end: string;
    prevStart: string | null;
    prevEnd: string | null;
}

export interface Anomaly {
    id: string;
    severity: 'critical' | 'warning' | 'success';
    /** "Clicks down 24.1%" */
    title: string;
    /** The numbers behind it, ending with the window: "18,210 vs 24,000 · Sep 29 – Oct 26 vs Sep 1 – Sep 28". */
    detail: string;
    /** A "What to fix next" task type that covers this anomaly (the row links there instead of repeating it). */
    task?: ActionType;
}

/** Change of the period totals that counts as an anomaly (±20%, the same bar as the fix list's drop tasks). */
export const TOTAL_CHANGE = 0.2;
/** A day this many times above / below its usual level. */
export const DAY_SPIKE = 1.8;
export const DAY_DIP = 0.5;

/** "Sep 29 – Oct 26 vs Sep 1 – Sep 28" (or just the range when compare is off). */
export function windowText(w: AnomalyWindow, now?: Date): string {
    const cur = fmtDateRange(w.start, w.end, now);
    return w.prevStart && w.prevEnd ? `${cur} vs ${fmtDateRange(w.prevStart, w.prevEnd, now)}` : cur;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function median(xs: number[]): number {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function totalAnomaly(id: string, label: string, unit: string, cur: number, prev: number | null | undefined, minPrev: number, w: AnomalyWindow, now?: Date, task?: ActionType): Anomaly | null {
    if (prev === null || prev === undefined || prev < minPrev || !w.prevStart) return null;
    const d = computeDelta(cur, prev, deltaOptionsFor('count'));
    if (d.state !== 'change' || d.change === null || Math.abs(d.change) < TOTAL_CHANGE * 100) return null;
    const up = d.change > 0;
    return {
        id,
        severity: up ? 'success' : d.change <= -40 ? 'critical' : 'warning',
        title: `${label} ${up ? 'up' : 'down'} ${d.text}`,
        detail: `${fmtFull(cur)} ${unit} vs ${fmtFull(prev)} · ${windowText(w, now)}`,
        task: up ? undefined : task,
    };
}

/**
 * The single most unusual day of a daily series, against the median of the
 * same weekday in the range (weekends are not "dips"), or of all days when the
 * range has fewer than 3 of that weekday.
 */
export function unusualDay(series: { date: string; value: number }[], minDiff: number): { date: string; value: number; usual: number; ratio: number; sameWeekday: boolean } | null {
    if (series.length < 7) return null;
    let best: { date: string; value: number; usual: number; ratio: number; sameWeekday: boolean; score: number } | null = null;
    const all = median(series.map((p) => p.value));
    for (const p of series) {
        const same = series.filter((q) => q.date !== p.date && weekday(q.date) === weekday(p.date)).map((q) => q.value);
        const sameWeekday = same.length >= 3;
        const usual = sameWeekday ? median(same) : all;
        if (usual <= 0) continue;
        const ratio = p.value / usual;
        if (Math.abs(p.value - usual) < minDiff) continue;
        if (ratio < DAY_SPIKE && ratio > DAY_DIP) continue;
        const score = ratio >= 1 ? ratio : 1 / Math.max(ratio, 0.01);
        if (!best || score > best.score) best = { date: p.date, value: p.value, usual, ratio, sameWeekday, score };
    }
    return best ? { date: best.date, value: best.value, usual: best.usual, ratio: best.ratio, sameWeekday: best.sameWeekday } : null;
}

function dayAnomaly(id: string, label: string, unit: string, series: { date: string; value: number }[], w: AnomalyWindow): Anomaly | null {
    const typical = median(series.map((p) => p.value));
    const day = unusualDay(series, Math.max(20, typical * 0.25));
    if (!day) return null;
    const up = day.ratio >= 1;
    const usual = day.sameWeekday ? `a usual ${WEEKDAY[weekday(day.date)]}` : 'a usual day';
    const times = up ? `${day.ratio.toFixed(1)}×` : `${Math.round(day.ratio * 100)}% of`;
    return {
        id,
        severity: up ? 'success' : 'warning',
        title: `${label} ${up ? 'spike' : 'dip'} on ${fmtDay(day.date)}`,
        detail: `${fmtFull(day.value)} ${unit}, ${times} ${usual} (${fmtFull(Math.round(day.usual))}) · ${fmtDateRange(w.start, w.end)}`,
    };
}

/** Queries that ranked on page one with real clicks before, and are below it now. */
export function fellOffPageOne(rows: GscRow[], minPrevClicks = 5): GscRow[] {
    return rows
        .filter((r) => r.prev && r.prev.impressions > 0 && r.prev.position <= 10 && r.prev.clicks >= minPrevClicks && (r.impressions === 0 || r.position > 10))
        .sort((a, b) => (b.prev?.clicks ?? 0) - (a.prev?.clicks ?? 0));
}

export interface AnomalyInput {
    gsc?: GscSummary | null;
    gscWindow: AnomalyWindow;
    /** Daily GA4 summary (the last point is today, partial). */
    ga4?: Ga4Summary | null;
    ga4Window: AnomalyWindow;
    /** Search Console query rows with `prev` (compare on). */
    queries?: { rows: GscRow[]; lost: GscRow[] } | null;
    now?: Date;
}

const ORDER = { critical: 0, warning: 1, success: 2 };

export function siteAnomalies(inp: AnomalyInput): Anomaly[] {
    const out: Anomaly[] = [];
    const ga = inp.ga4;
    if (ga) {
        const full = ga.series.slice(0, -1);
        const tail = full.slice(-2);
        if (tail.length === 2 && tail.every((p) => p.sessions === 0) && full.slice(0, -2).some((p) => p.sessions > 0)) {
            out.push({ id: 'ga-zero', severity: 'critical', title: 'No visits recorded for 2 days', detail: `0 sessions on ${fmtDay(tail[0].date)} and ${fmtDay(tail[1].date)}. The GA4 tag may be missing or the site may be down.`, task: 'traffic_drop' });
        }
    }
    const g = inp.gsc;
    if (g) {
        const a = totalAnomaly('gsc-clicks', 'Clicks', 'clicks', g.totals.clicks, g.previous?.clicks, 50, inp.gscWindow, inp.now, 'search_drop');
        if (a) out.push(a);
        const b = totalAnomaly('gsc-impr', 'Impressions', 'impressions', g.totals.impressions, g.previous?.impressions, 500, inp.gscWindow, inp.now);
        if (b) out.push(b);
    }
    if (ga) {
        const a = totalAnomaly('ga-users', 'Users', 'users', ga.totals.users, ga.previous?.users, 20, inp.ga4Window, inp.now, 'traffic_drop');
        if (a) out.push(a);
    }
    if (inp.queries) {
        const fell = fellOffPageOne([...inp.queries.rows, ...inp.queries.lost]);
        if (fell.length) {
            const names = fell.slice(0, 2).map((r) => `"${r.key}" ${fmtPosition(r.prev!.position)} → ${r.impressions ? fmtPosition(r.position) : 'gone'}`).join(', ');
            out.push({
                id: 'gsc-page1',
                severity: fell.length >= 5 ? 'critical' : 'warning',
                title: `${fell.length} ${fell.length === 1 ? 'query' : 'queries'} fell off page one`,
                detail: `${names}${fell.length > 2 ? ` and ${fell.length - 2} more` : ''} · ${windowText(inp.gscWindow, inp.now)}`,
            });
        }
    }
    // One unusual day per source, only for daily series (weekly/monthly buckets smooth them away).
    if (g && g.series.length >= 7) {
        const a = dayAnomaly('gsc-day', 'Clicks', 'clicks', g.series.map((p) => ({ date: p.date, value: p.clicks })), inp.gscWindow);
        if (a) out.push(a);
    }
    if (ga && ga.series.length >= 8 && (ga.interval ?? 'day') === 'day') {
        const a = dayAnomaly('ga-day', 'Sessions', 'sessions', ga.series.slice(0, -1).map((p) => ({ date: p.date, value: p.sessions })), { ...inp.ga4Window, end: ga.series[ga.series.length - 2].date });
        if (a) out.push(a);
    }
    return out.sort((x, y) => ORDER[x.severity] - ORDER[y.severity]).slice(0, 6);
}
