/**
 * Day arithmetic for the demo generator. Days are integers (days since the
 * Unix epoch, UTC) so ranges and series are cheap to index.
 */

const DAY_MS = 86_400_000;

/** How far back demo history goes: 16 months. */
export const DEMO_HISTORY_DAYS = 487;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today's day index (UTC). */
export function todayIndex(now: number = Date.now()): number {
    return Math.floor(now / DAY_MS);
}

export function dayToDate(day: number): Date {
    return new Date(day * DAY_MS);
}

/** 'YYYY-MM-DD' */
export function dayToIso(day: number): string {
    return dayToDate(day).toISOString().slice(0, 10);
}

/** 'YYYYMMDD' (GA4 date dimension format) */
export function dayToCompact(day: number): string {
    return dayToIso(day).replace(/-/g, '');
}

export function isoToDay(iso: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null;
}

/**
 * Parse a GA4 / GSC date token: 'YYYY-MM-DD', 'today', 'yesterday', 'NdaysAgo'.
 * Returns null when the token cannot be parsed.
 */
export function parseDateToken(token: unknown, today: number): number | null {
    if (typeof token !== 'string') return null;
    const v = token.trim();
    if (v === 'today') return today;
    if (v === 'yesterday') return today - 1;
    const ago = /^(\d+)daysAgo$/.exec(v);
    if (ago) return today - parseInt(ago[1], 10);
    return isoToDay(v);
}

export function dayOfWeek(day: number): number {
    // 1970-01-01 was a Thursday (4).
    return ((day % 7) + 7 + 4) % 7;
}

/** Day of year, 0-based. */
export function dayOfYear(day: number): number {
    const d = dayToDate(day);
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((d.getTime() - start) / DAY_MS);
}

/** ISO-8601 week number and ISO year. */
export function isoWeek(day: number): { year: number; week: number } {
    const d = dayToDate(day);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const thursday = new Date(d.getTime() + (3 - dow) * DAY_MS);
    const year = thursday.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const week1Monday = jan4.getTime() - jan4Dow * DAY_MS;
    const week = Math.floor((thursday.getTime() - week1Monday) / (7 * DAY_MS)) + 1;
    return { year, week };
}

/** GA4 'week' dimension: week of the year starting Sunday, '00'-'53'. */
export function sundayWeek(day: number): number {
    const d = dayToDate(day);
    const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
    const jan1Dow = new Date(jan1).getUTCDay();
    return Math.floor((dayOfYear(day) + jan1Dow) / 7);
}

export function pad(n: number, width = 2): string {
    return String(n).padStart(width, '0');
}
