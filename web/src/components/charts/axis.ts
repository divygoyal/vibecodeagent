/**
 * Shared chart axis rules (DESIGN 6.3, round 2 critique #2). Pure functions, no
 * React or Recharts, so tests/chartAxis.test.mjs runs them on plain Node and
 * any chart (site pages, dashboard widgets, share pages) can use them:
 *
 *   const y = niceAxis(maxOfAllPlottedValues, { format: 'count' });
 *   <YAxis domain={y.domain} ticks={y.ticks} interval={0} … />
 *   const x = dateTicks(rows.map((r) => r.date), { width });
 *   <XAxis ticks={x} interval={0} … />
 *
 * Y: round steps (1-2-5 × 10ⁿ; 15 s / 30 s / 1 m / 5 m … for durations),
 * about 4 gridlines, zero-based: 0 / 5K / 10K / 15K / 20K, never 4.5K / 9K.
 * Position axes start at 1 and run top-down (pass `reversed` to YAxis).
 * X: evenly spaced dates anchored on the last day, never dropped by Recharts:
 * every day (7d), every 7 days (28d), every 14 days (3m), month starts (12m),
 * thinned to fit the plot width.
 */

export type AxisFormat = 'count' | 'percent' | 'position' | 'duration' | 'number';

export interface NiceAxis {
    domain: [number, number];
    ticks: number[];
}

const DURATION_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** The smallest "nice" step (1, 2, 5 × 10ⁿ) of at least `rough`. */
export function niceStep(rough: number): number {
    if (!(rough > 0) || !Number.isFinite(rough)) return 1;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const norm = rough / mag;
    const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    // Float noise: 0.1 * 3 → 0.30000000000000004.
    return Number((f * mag).toPrecision(12));
}

function round12(n: number): number {
    return Number(n.toPrecision(12));
}

/**
 * Round axis for values from 0 (or 1 for positions) to `max`, aiming at
 * `count` intervals (default 4). Counts never get fractional ticks.
 */
export function niceAxis(max: number | null | undefined, opts: { format?: AxisFormat; count?: number } = {}): NiceAxis {
    const format = opts.format ?? 'count';
    const count = Math.max(1, opts.count ?? 4);
    const m = typeof max === 'number' && Number.isFinite(max) ? max : 0;

    if (format === 'position') {
        // Average position: 1 is the top. Ticks 1, then multiples of the step.
        const top = Math.max(m, 2);
        let step = niceStep((top - 1) / count);
        if (step < 1) step = 1;
        const end = Math.ceil(top / step) * step;
        const ticks = [1];
        for (let v = step; v <= end + 1e-9; v += step) if (v > 1) ticks.push(round12(v));
        return { domain: [1, end], ticks };
    }

    if (m <= 0) {
        if (format === 'percent') return { domain: [0, 0.01], ticks: [0, 0.01] };
        return { domain: [0, format === 'duration' ? 60 : 4], ticks: format === 'duration' ? [0, 30, 60] : [0, 2, 4] };
    }

    let step: number;
    if (format === 'duration') {
        const rough = m / count;
        step = DURATION_STEPS.find((s) => s >= rough) ?? niceStep(rough / 3600) * 3600;
    } else {
        step = niceStep(m / count);
        if (format === 'count' && step < 1) step = 1;
    }
    const end = round12(Math.ceil(round12(m / step)) * step);
    const ticks: number[] = [];
    for (let i = 0; i * step <= end + step * 1e-9; i++) ticks.push(round12(i * step));
    return { domain: [0, end], ticks };
}

/** Largest finite value of `keys` across `rows` (0 when there is none). */
export function maxOf(rows: Record<string, unknown>[], keys: (string | undefined)[]): number {
    let max = 0;
    for (const r of rows) {
        for (const k of keys) {
            if (!k) continue;
            const v = r[k];
            if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
        }
    }
    return max;
}

const DAY_MS = 86_400_000;

function parseDay(s: string): number | null {
    const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export interface DateTickOptions {
    /** Plot width in px (labels need about 56px each). Default 640. */
    width?: number;
    /** Px per label. Default 56 ("Oct 13" at 11px plus air). */
    labelWidth?: number;
}

/**
 * Evenly spaced tick values for a date axis, anchored on the last date and
 * stepping back, so the newest day is always labelled and gaps never vary.
 * `dates` are the axis values in order ('YYYY-MM-DD' or 'YYYYMMDD').
 */
export function dateTicks(dates: string[], opts: DateTickOptions = {}): string[] {
    const n = dates.length;
    if (n <= 1) return dates.slice();
    const first = parseDay(dates[0]);
    const last = parseDay(dates[n - 1]);
    const fit = Math.max(2, Math.floor((opts.width ?? 640) / (opts.labelWidth ?? 56)));
    if (first === null || last === null || last <= first) {
        // Not dates: plain even spacing by index.
        const stepIdx = Math.max(1, Math.ceil((n - 1) / (fit - 1)));
        return anchorBack(dates, stepIdx);
    }
    const spanDays = Math.round((last - first) / DAY_MS);
    const spacing = spanDays / (n - 1); // days per row (1 for daily data)

    if (spanDays > 93) {
        // Month starts: the first row of each month, every k months, anchored on the last one.
        const starts: number[] = [];
        let prevMonth = -1;
        dates.forEach((d, i) => {
            const t = parseDay(d);
            if (t === null) return;
            const month = new Date(t).getUTCMonth();
            if (month !== prevMonth) {
                // Skip a partial first month that starts mid-month (its label would sit at the edge).
                if (i > 0 || new Date(t).getUTCDate() <= Math.max(1, spacing)) starts.push(i);
                prevMonth = month;
            }
        });
        const cap = Math.min(fit, 13);
        for (const every of [1, 2, 3, 4, 6, 12]) {
            const picked = starts.filter((_, j) => (starts.length - 1 - j) % every === 0);
            if (picked.length <= cap) return picked.map((i) => dates[i]);
        }
        return [dates[starts[starts.length - 1] ?? n - 1]];
    }

    const cap = Math.min(fit, 8);
    const candidates = spanDays <= 14 ? [1, 2, 7] : [7, 14, 28];
    for (const stepDays of candidates) {
        const stepIdx = Math.max(1, Math.round(stepDays / spacing));
        const ticks = anchorBack(dates, stepIdx);
        if (ticks.length <= cap) return ticks;
    }
    return anchorBack(dates, Math.max(1, Math.ceil((n - 1) / (cap - 1))));
}

function anchorBack(values: string[], stepIdx: number): string[] {
    const out: string[] = [];
    for (let i = values.length - 1; i >= 0; i -= stepIdx) out.push(values[i]);
    return out.reverse();
}

/** One axis/grid look for every chart (pass these to Recharts). */
export const AXIS_TICK = { fill: 'var(--color-chart-tick)', fontSize: 11 } as const;
export const AXIS_LINE = { stroke: 'var(--color-chart-axis)' } as const;
export const GRID_STROKE = 'var(--color-chart-grid)';
export const CURSOR = { stroke: 'var(--color-chart-cursor)', strokeWidth: 1 } as const;
