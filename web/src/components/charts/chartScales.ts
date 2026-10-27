/**
 * Small scale helpers for the round-2 site charts (DualAxisChart,
 * CtrPositionChart): round axis ticks and evenly spaced date ticks.
 * Pure, no React.
 */

/** 1, 2, 2.5, 5 or 10 times a power of ten, at or above `x`. */
export function niceStep(x: number): number {
    if (!(x > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(x));
    const f = x / p;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
}

/** Round ticks from 0 that cover `max`: 0 / 5K / 10K / 15K. */
export function niceTicks(max: number, count = 4): number[] {
    if (!(max > 0)) return [0, 1];
    const step = niceStep(max / count);
    const top = Math.ceil(max / step) * step;
    const out: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
}

/**
 * Evenly spaced date ticks anchored on the last date (stepping back):
 * every day up to 8 days, weekly up to ~5 weeks, fortnightly up to ~3 months,
 * then about every 30 days. For daily, weekly or monthly rows.
 */
export function evenDateTicks(dates: string[]): string[] {
    const n = dates.length;
    if (n <= 1) return dates;
    const span = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / 86_400_000;
    const perRow = Math.max(1, span / (n - 1));
    const wantDays = span <= 8 ? 1 : span <= 35 ? 7 : span <= 100 ? 14 : span <= 200 ? 30 : 61;
    const every = Math.max(1, Math.round(wantDays / perRow));
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i -= every) out.unshift(dates[i]);
    // Keep the first label off the left edge when it would crowd the next one.
    return out;
}
