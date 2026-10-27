/**
 * One-line findings above the main charts, written by fixed rules (no AI, no
 * cost): "Clicks up 18% vs previous 28 days, led by /pricing (+340)."
 * Pure; tested in web/tests/siteFindings.test.mjs.
 */
import { fmtCompact, fmtDayLong, fmtFull } from '@/lib/format';

export type FindingTone = 'good' | 'bad' | 'flat' | 'info';

export interface Finding {
    text: string;
    tone: FindingTone;
}

export interface Driver {
    label: string;
    cur: number;
    prev: number;
}

export interface TrendInput {
    /** "Users", "Clicks". */
    metric: string;
    /** Plural noun for counts in the driver note: "sessions", "clicks". */
    driverUnit?: string;
    cur: number | null | undefined;
    /** Undefined: compare is off. Null: no data for the previous period. */
    prev?: number | null;
    /** "previous 28 days". */
    compareText?: string;
    /** Rows that may explain the change (channels, pages ...), with both periods. */
    drivers?: Driver[];
    /** Daily series for the "busiest day" fallback. */
    series?: { date: string; value: number }[];
    /** Ignore the last point of `series` for the busiest day (today is partial). */
    partialLast?: boolean;
    /** Lower is better (position). */
    lowerIsBetter?: boolean;
}

function pct(cur: number, prev: number): number {
    return prev === 0 ? 0 : ((cur - prev) / Math.abs(prev)) * 100;
}

function fmtPct(p: number): string {
    const a = Math.abs(p);
    return a >= 10 ? `${Math.round(a)}%` : `${a.toFixed(1).replace(/\.0$/, '')}%`;
}

function signed(n: number): string {
    return `${n >= 0 ? '+' : '−'}${fmtCompact(Math.abs(Math.round(n)))}`;
}

/** The driver with the biggest change in the same direction, if it explains at least a fifth of it. */
export function topDriver(drivers: Driver[] | undefined, direction: 1 | -1): Driver | null {
    if (!drivers?.length) return null;
    let best: Driver | null = null;
    let bestDelta = 0;
    let total = 0;
    for (const d of drivers) {
        const delta = (d.cur - d.prev) * direction;
        if (delta > 0) total += delta;
        if (delta > bestDelta) {
            best = d;
            bestDelta = delta;
        }
    }
    if (!best || total <= 0 || bestDelta / total < 0.2) return null;
    return best;
}

/** "Users up 18% vs previous 28 days, led by Organic Search (+1.2K sessions)." */
export function trendFinding(input: TrendInput): Finding | null {
    const { metric, cur, prev, compareText, drivers, driverUnit, lowerIsBetter } = input;
    if (cur === null || cur === undefined || !Number.isFinite(cur)) return null;
    const vs = compareText ? ` vs ${compareText}` : '';
    if (prev !== undefined && prev !== null && Number.isFinite(prev)) {
        if (prev === 0) {
            return cur > 0 ? { text: `${metric}: ${fmtFull(cur)}, up from none${vs}.`, tone: lowerIsBetter ? 'info' : 'good' } : null;
        }
        const p = pct(cur, prev);
        if (Math.abs(p) < 2) {
            return { text: `${metric} steady${vs} (${p >= 0 ? '+' : '−'}${fmtPct(p)}).`, tone: 'flat' };
        }
        const up = p > 0;
        const good = lowerIsBetter ? !up : up;
        const d = topDriver(drivers, up ? 1 : -1);
        const lead = d ? `, ${up ? 'led by' : 'mostly from'} ${d.label} (${signed(d.cur - d.prev)}${driverUnit ? ` ${driverUnit}` : ''})` : '';
        return { text: `${metric} ${up ? 'up' : 'down'} ${fmtPct(p)}${vs}${lead}.`, tone: good ? 'good' : 'bad' };
    }
    // No comparison: name the busiest day.
    const s = (input.series ?? []).slice(0, input.partialLast ? -1 : undefined).filter((x) => Number.isFinite(x.value));
    if (s.length >= 3) {
        const best = s.reduce((a, b) => (b.value > a.value ? b : a));
        const avg = s.reduce((a, b) => a + b.value, 0) / s.length;
        if (best.value > 0 && avg > 0) {
            const x = best.value / avg;
            return { text: `Busiest day: ${fmtDayLong(best.date).replace(/, \d{4}$/, '')}, ${fmtFull(best.value)} ${metric.toLowerCase()}${x >= 1.2 ? ` (${x.toFixed(1)}× the average day)` : ''}.`, tone: 'info' };
        }
    }
    return null;
}

/** CTR (points) and average position (absolute) read better than a percent change. */
export function rateFinding(input: { metric: 'ctr' | 'position'; cur: number | null | undefined; prev?: number | null; compareText?: string }): Finding | null {
    const { metric, cur, prev, compareText } = input;
    if (cur === null || cur === undefined || !Number.isFinite(cur) || cur <= 0 && metric === 'position') return null;
    const vs = compareText ? ` vs ${compareText}` : '';
    const now = metric === 'ctr' ? `${(cur * 100).toFixed(1)}%` : cur.toFixed(1);
    if (prev === undefined || prev === null || !Number.isFinite(prev) || (metric === 'position' && prev <= 0)) {
        return { text: metric === 'ctr' ? `CTR is ${now} in this period.` : `Average position is ${now} in this period.`, tone: 'info' };
    }
    if (metric === 'ctr') {
        const pts = (cur - prev) * 100;
        if (Math.abs(pts) < 0.05) return { text: `CTR steady at ${now}${vs}.`, tone: 'flat' };
        return { text: `CTR ${pts > 0 ? 'up' : 'down'} ${Math.abs(pts).toFixed(1)} pt to ${now}${vs}.`, tone: pts > 0 ? 'good' : 'bad' };
    }
    const d = cur - prev;
    if (Math.abs(d) < 0.1) return { text: `Average position steady at ${now}${vs}.`, tone: 'flat' };
    return d < 0
        ? { text: `Average position improved from ${prev.toFixed(1)} to ${now}${vs}.`, tone: 'good' }
        : { text: `Average position slipped from ${prev.toFixed(1)} to ${now}${vs}.`, tone: 'bad' };
}

/**
 * "Clicks down 23% since the May 2026 core update began (May 21)." Compares the
 * daily average in the 14 days before a Google update with the days from its
 * start (needs 7+ days after). Only for a clear move (15%+); the biggest wins.
 */
export function updateImpactFinding(
    series: { date: string; value: number }[],
    updates: { name: string; start: string }[],
    metric: string,
): Finding | null {
    let best: { u: { name: string; start: string }; p: number } | null = null;
    for (const u of updates) {
        const before = series.filter((x) => x.date < u.start).slice(-14);
        const after = series.filter((x) => x.date >= u.start);
        if (before.length < 7 || after.length < 7) continue;
        const avg = (xs: { value: number }[]) => xs.reduce((a, b) => a + b.value, 0) / xs.length;
        const b = avg(before);
        if (b < 5) continue;
        const p = pct(avg(after), b);
        if (Math.abs(p) >= 15 && (!best || Math.abs(p) > Math.abs(best.p))) best = { u, p };
    }
    if (!best) return null;
    const day = fmtDayLong(best.u.start).replace(/^\w+, /, '').replace(/, \d{4}$/, '');
    return {
        text: `${metric} ${best.p > 0 ? 'up' : 'down'} ${fmtPct(best.p)} a day on average since the ${best.u.name} began (${day}).`,
        tone: best.p > 0 ? 'good' : 'bad',
    };
}

// ─── Peak hours ───────────────────────────────────────────────────────────

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** 0 -> "12 am", 13 -> "1 pm", 24 -> "12 am". */
export function hourLabel(h: number): string {
    const x = ((h % 24) + 24) % 24;
    const n = x % 12 === 0 ? 12 : x % 12;
    return `${n} ${x < 12 ? 'am' : 'pm'}`;
}

/** "2–5 pm", "11 am–2 pm". */
export function hourRange(start: number, end: number): string {
    const a = hourLabel(start);
    const b = hourLabel(end);
    const [an, ap] = a.split(' ');
    const [bn, bp] = b.split(' ');
    return ap === bp ? `${an}–${bn} ${bp}` : `${a}–${b}`;
}

export interface PeakWindow {
    day: number;
    /** First hour of the window (0–23). */
    hour: number;
    length: number;
    total: number;
    /** How many times a typical window of the same length. */
    ratio: number;
}

/** Busiest run of `length` hours inside one weekday (grid[day 0=Sun][hour]). */
export function peakWindow(grid: number[][], length = 3): PeakWindow | null {
    let best: PeakWindow | null = null;
    let sum = 0;
    let n = 0;
    for (let d = 0; d < grid.length; d++) {
        const row = grid[d] ?? [];
        for (let h = 0; h + length <= 24; h++) {
            let t = 0;
            for (let k = 0; k < length; k++) t += row[h + k] ?? 0;
            sum += t;
            n++;
            if (!best || t > best.total) best = { day: d, hour: h, length, total: t, ratio: 0 };
        }
    }
    if (!best || best.total <= 0 || n === 0) return null;
    const avg = sum / n;
    best.ratio = avg > 0 ? best.total / avg : 0;
    return best;
}

/** "Busiest on Wednesdays, 2–5 pm: 2.3× a typical 3 hours." */
export function peakHoursFinding(grid: number[][], unit = 'sessions'): Finding | null {
    const w = peakWindow(grid, 3);
    if (!w) return null;
    const totals = grid.map((row) => row.reduce((a, b) => a + b, 0));
    const all = totals.reduce((a, b) => a + b, 0);
    if (all < 20) return { text: `Too few ${unit} in this period to show a pattern.`, tone: 'info' };
    const ratio = w.ratio >= 1.15 ? `: ${w.ratio.toFixed(1)}× a typical 3 hours` : '';
    return { text: `Busiest on ${DAYS[w.day]}, ${hourRange(w.hour, w.hour + w.length)}${ratio}.`, tone: 'info' };
}

// ─── Search vs organic traffic ─────────────────────────────────────────────

/** Pearson correlation of two equal-length series (null when undefined). */
export function correlation(a: number[], b: number[]): number | null {
    const n = Math.min(a.length, b.length);
    if (n < 5) return null;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
        sa += a[i];
        sb += b[i];
    }
    const ma = sa / n;
    const mb = sb / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
    }
    if (da === 0 || db === 0) return null;
    return num / Math.sqrt(da * db);
}

/** "GA4 counts 1.3× as many Google organic sessions as Search Console clicks and they move together." */
export function overlayFinding(clicks: number[], sessions: number[]): Finding | null {
    const c = clicks.reduce((a, b) => a + b, 0);
    const s = sessions.reduce((a, b) => a + b, 0);
    if (c <= 0 && s <= 0) return null;
    if (c <= 0) return { text: `GA4 counted ${fmtFull(s)} organic sessions, but Search Console shows no clicks yet.`, tone: 'info' };
    if (s <= 0) return { text: `Google sent ${fmtFull(c)} clicks, but GA4 counted no organic sessions. Check the GA4 tag.`, tone: 'bad' };
    const r = correlation(clicks, sessions);
    const ratio = s / c;
    const together = r === null ? '' : r >= 0.7 ? ' and they move together' : r < 0.3 ? ', but they do not move together: check the GA4 tag and consent banner' : '';
    const ratioText = ratio >= 1.05
        ? `GA4 counts ${ratio.toFixed(1)}× as many Google organic sessions as Search Console clicks`
        : ratio <= 0.8
            ? `GA4 counts ${Math.round(ratio * 100)}% as many Google organic sessions as Search Console clicks (consent banners and ad blockers hide some visits)`
            : 'GA4 Google organic sessions closely match Search Console clicks';
    return { text: `${ratioText}${together}.`, tone: r !== null && r < 0.3 ? 'bad' : 'info' };
}

// ─── CTR vs position ───────────────────────────────────────────────────────

/** "14 queries get fewer clicks than usual for their position: about +1.2K clicks to win." */
export function ctrBenchmarkFinding(under: { potential: number }[], total: number): Finding | null {
    if (total === 0) return null;
    if (under.length === 0) return { text: `All ${fmtFull(total)} queries on page one get at least the usual clicks for their position.`, tone: 'good' };
    const gain = under.reduce((a, b) => a + b.potential, 0);
    return {
        text: `${fmtFull(under.length)} of ${fmtFull(total)} queries get fewer clicks than usual for their position${gain > 0 ? `: about ${signed(gain)} clicks to win with better titles and snippets` : ''}.`,
        tone: 'bad',
    };
}

// ─── Countries ─────────────────────────────────────────────────────────────

/** "United States brings 44% of users; India grew fastest (+38%)." */
export function geoFinding(rows: { label: string; cur: number; prev?: number | null }[], unit = 'users'): Finding | null {
    const total = rows.reduce((a, b) => a + b.cur, 0);
    if (total <= 0 || !rows.length) return null;
    const top = rows.reduce((a, b) => (b.cur > a.cur ? b : a));
    const share = Math.round((top.cur / total) * 100);
    let growth = '';
    const movers = rows.filter((r) => r.prev !== undefined && r.prev !== null && r.prev >= 20 && r.cur >= total * 0.02);
    if (movers.length) {
        const fastest = movers.reduce((a, b) => (pct(b.cur, b.prev as number) > pct(a.cur, a.prev as number) ? b : a));
        const g = pct(fastest.cur, fastest.prev as number);
        if (g >= 10) growth = `; ${fastest.label === top.label ? 'it also' : fastest.label} grew fastest (+${fmtPct(g)})`;
    }
    return { text: `${top.label} brings ${share}% of ${unit}${growth}.`, tone: 'info' };
}
