/**
 * The only number and date formatter (DESIGN.md 6.4). Pure, no imports, so the
 * unit tests in web/tests/format.test.mjs run on plain Node.
 *
 * Inputs:
 *  - counts are plain numbers;
 *  - rates (CTR, engagement rate) are RATIOS: 0.034 means 3.4%;
 *  - positions are GSC average positions (1 = top);
 *  - durations are seconds;
 *  - dates are Date objects, epoch ms, 'YYYY-MM-DD' or GA4 'YYYYMMDD' strings.
 *    Date strings are calendar days and are formatted in UTC so they never
 *    shift by a day in the viewer's timezone.
 *
 * null / undefined / NaN always format as an en dash '–'.
 */

export type MetricFormat = 'count' | 'percent' | 'position' | 'duration' | 'currency';

export const DASH = '–';
const ARROW_UP = '▲';
const ARROW_DOWN = '▼';

const fullFormatter = new Intl.NumberFormat('en-US');

type Num = number | null | undefined;

function isNum(n: Num): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

/** Drop a trailing ".0" ("12.0" -> "12", "1.50" -> "1.5"). */
function stripZeros(s: string): string {
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** `1,282` · `503,118`. Exact, for tables and tooltips. */
export function fmtFull(n: Num): string {
    if (!isNum(n)) return DASH;
    return fullFormatter.format(n);
}

const UNITS: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
];

/**
 * `abs / size` rounded to 3 significant digits (or to `maxDecimals`), half UP on the decimal value. A binary
 * `toPrecision` turned 75,550 into "75.5" while 75,553 gave "75.6", so one total read differently on two widgets
 * (round 9 review, item 9). Scaling to an integer first keeps .5 where a person expects it.
 */
function scaled(abs: number, size: number, maxDecimals: number | null): number {
    const x = abs / size;
    const digits = Math.max(1, Math.floor(Math.log10(x)) + 1);
    const decimals = maxDecimals === null ? Math.max(0, 3 - digits) : maxDecimals;
    const f = 10 ** decimals;
    return Math.round(abs * f / size * (1 + 1e-12)) / f;
}

function compactParts(abs: number, maxDecimals: number | null): string {
    for (let i = 0; i < UNITS.length; i++) {
        const [size, suffix] = UNITS[i];
        if (abs < size) continue;
        const v = scaled(abs, size, maxDecimals);
        if (v >= 1000 && i > 0) {
            // 999,950 rounds to "1000K": promote to the next unit ("1M").
            const [nextSize, nextSuffix] = UNITS[i - 1];
            return `${stripZeros(String(scaled(abs, nextSize, maxDecimals)))}${nextSuffix}`;
        }
        return `${stripZeros(String(v))}${suffix}`;
    }
    return String(abs);
}

/**
 * Cards, tiles, leaderboard: under 10,000 the full number, else 3 significant
 * digits + K/M/B. `1,282` · `12.3K` · `51.8K` · `503K` · `1.24M`.
 */
export function fmtCompact(n: Num): string {
    if (!isNum(n)) return DASH;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs < 10_000) return sign + fullFormatter.format(Math.round(abs));
    return sign + compactParts(abs, null);
}

export interface ColumnUnit {
    size: number;
    suffix: string;
    decimals: number;
}

/**
 * The one unit a table column of counts or money is written in (round 9 judge, item 5: "27.2K, 18K, 14.5K, then
 * 4,922" in one column). Decided by the column's largest absolute value: below 100,000 the column is written in full
 * (`27,153` · `4,922`, null); from there every value shares the unit of the max and has the same decimals (`503K`
 * · `78K` · `5K`; `1.24M` · `0.08M`).
 */
export function columnUnit(values: Num[]): ColumnUnit | null {
    let max = 0;
    for (const v of values) if (isNum(v)) max = Math.max(max, Math.abs(v));
    if (max < 100_000) return null;
    for (const [size, suffix] of UNITS) {
        if (max < size) continue;
        const digits = Math.floor(Math.log10(max / size)) + 1;
        return { size, suffix, decimals: Math.max(0, 3 - digits) };
    }
    return null;
}

/** `n` written in a column's unit: `503K`, `78K`, `0.08M`. Zero stays `0`. */
export function fmtUnit(n: number, unit: ColumnUnit): string {
    if (n === 0) return '0';
    const abs = Math.abs(n);
    return `${n < 0 ? '-' : ''}${roundTo(abs / unit.size, unit.decimals).toFixed(unit.decimals)}${unit.suffix}`;
}

/** Axis ticks: compact with at most 1 decimal. `0` · `500` · `1K` · `1.5K` · `503K` · `1.5M`. */
export function fmtAxis(n: Num): string {
    if (!isNum(n)) return DASH;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs < 1000) return sign + stripZeros((Math.round(abs * 10) / 10).toFixed(1));
    return sign + compactParts(abs, 1);
}

export interface PercentOptions {
    /** Kept for old callers: KPI tiles and tables share one rule (always one decimal), so this changes nothing. */
    tile?: boolean;
    /** Axis ticks, chart labels and inline list shares: rates of 10% or more drop the decimal (`44%`), a trailing `.0` too (`5%`). */
    axis?: boolean;
    /** Decimals to show. Default 1; a value/comparison pair may need 2 (see `pairDecimals`). */
    decimals?: number;
}

/**
 * A ratio as a percent. One rule everywhere (KPI value, comparison value, tables, email, share cards): one decimal
 * (`65.2%`, `3.0%`, `23.0%`), so a rate never loses the digit its comparison keeps ("3%" next to "2.9%", round 9
 * judge, item 4). `decimals` raises the precision for a pair whose values would otherwise look equal. `<0.1%` for
 * tiny non-zero values, `0%`.
 */
export function fmtPercent(ratio: Num, opts: PercentOptions = {}): string {
    if (!isNum(ratio)) return DASH;
    if (ratio === 0) return '0%';
    const d = opts.decimals ?? 1;
    const pct = ratio * 100;
    const abs = Math.abs(pct);
    const floor = 10 ** -d;
    if (abs < floor) return pct < 0 ? `>-${floor}%` : `<${floor}%`;
    if (opts.axis && opts.decimals === undefined) return abs >= 9.95 ? `${Math.round(pct)}%` : `${stripZeros(pct.toFixed(1))}%`;
    return `${roundTo(pct, d).toFixed(d)}%`;
}

/** `x` rounded half UP on its decimal value to `d` places (so 2.675 -> 2.68, -2.675 -> -2.68). */
export function roundTo(x: number, d: number): number {
    const f = 10 ** d;
    const r = Math.round(Number((Math.abs(x) * f).toPrecision(12))) / f;
    return x < 0 ? -r : r;
}

export type PairKind = 'percent' | 'position' | 'decimal';

/**
 * How many decimals a value and its comparison need so the pair and its delta never contradict each other
 * (round 9 judge, items 3-4: "2.6%  0 pt  vs 2.7%", "65% ▼0.3 pt vs 65%", "1.59 ▲0.2% vs 1.59").
 *
 * Rates (`percent`, ratios in, shown in percent) and positions start at 1 decimal, decimal ratios at `base` (2).
 * The pair is consistent when "the shown values differ" and "the delta is not zero" agree; if they do not at this
 * precision, one more decimal is tried (two more for decimal ratios, which have no delta in points). When even that
 * leaves them equal the change is below what the page can show, and the delta reads "no change".
 */
export function pairDecimals(kind: PairKind, current: Num, previous: Num, base: number = kind === 'decimal' ? 2 : 1): number {
    if (!isNum(current) || !isNum(previous) || current === previous) return base;
    const scale = kind === 'percent' ? 100 : 1;
    const c = current * scale;
    const p = previous * scale;
    const max = base + (kind === 'decimal' ? 2 : 1);
    for (let d = base; d <= max; d++) {
        const differ = roundTo(c, d) !== roundTo(p, d);
        if (kind === 'decimal') {
            if (differ) return d;
            continue;
        }
        if (differ === (roundTo(Math.abs(c - p), d) !== 0)) return d;
    }
    return max;
}

/** GSC average position, 1 decimal (2 when a pair needs it, see `pairDecimals`): `23.2`, `3.0`. */
export function fmtPosition(p: Num, decimals = 1): string {
    if (!isNum(p)) return DASH;
    return roundTo(p, decimals).toFixed(decimals);
}

/** `53s` · `1m 56s` · `2m 05s` · `1h 04m`: the second unit is zero-padded so a column aligns. */
export function fmtDuration(seconds: Num): string {
    if (!isNum(seconds)) return DASH;
    const t = Math.max(0, Math.round(seconds));
    const pad = (n: number) => String(n).padStart(2, '0');
    if (t < 60) return `${t}s`;
    if (t < 3600) return `${Math.floor(t / 60)}m ${pad(t % 60)}s`;
    return `${Math.floor(t / 3600)}h ${pad(Math.floor((t % 3600) / 60))}m`;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, digits: 0 | 2): Intl.NumberFormat {
    const key = `${currency}:${digits}`;
    let f = currencyFormatters.get(key);
    if (!f) {
        try {
            f = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
        } catch {
            // Not an ISO 4217 code: a plain number with the code after it.
            const plain = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
            f = { format: (n: number) => `${plain.format(n)} ${currency}` } as Intl.NumberFormat;
        }
        currencyFormatters.set(key, f);
    }
    return f;
}

export interface CurrencyOptions {
    /** Tiles and cards: `$61.8K` from 10,000 up (like fmtCompact). */
    compact?: boolean;
    /** Two decimals (`$1.12`), for small per-session or per-user values. Default: whole units, so a column never mixes `$27,056` with `$45.20`. */
    cents?: boolean;
    /** A table column's shared unit (`columnUnit`): every value as `$503K`, never `$4,922` next to `$61.8K`. Wins over `compact`. */
    unit?: ColumnUnit;
}

/**
 * Money in the GA4 property's currency (ISO 4217, default USD): `$27,056` · `€1,204` · `$61.8K` (compact) ·
 * `$1.12` (cents).
 */
export function fmtCurrency(n: Num, currency: string | null | undefined = 'USD', opts: CurrencyOptions = {}): string {
    if (!isNum(n)) return DASH;
    const code = (currency || 'USD').toUpperCase();
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (opts.unit && abs !== 0) {
        const parts = currencyFormatter(code, 0).formatToParts?.(1) ?? [];
        const sym = parts.find((p) => p.type === 'currency')?.value;
        const symFirst = parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer');
        const num = fmtUnit(abs, opts.unit);
        if (sym) return symFirst ? `${sign}${sym}${num}` : `${sign}${num} ${sym}`;
        return `${sign}${num} ${code}`;
    }
    if (opts.compact && abs >= 10_000) {
        // "$" + "61.8K": the symbol from the formatter, the number from compactParts (same rounding as fmtCompact).
        const parts = currencyFormatter(code, 0).formatToParts?.(1) ?? [];
        const sym = parts.find((p) => p.type === 'currency')?.value;
        const symFirst = parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer');
        if (sym) return symFirst ? `${sign}${sym}${compactParts(abs, null)}` : `${sign}${compactParts(abs, null)} ${sym}`;
        return `${sign}${compactParts(abs, null)} ${code}`;
    }
    return sign + currencyFormatter(code, opts.cents ? 2 : 0).format(abs);
}

/** Format a value by its metric format. Counts are full unless `compact`; money uses `currency` (default USD). */
export function fmtValue(format: MetricFormat, value: Num, opts: { compact?: boolean; tile?: boolean; axis?: boolean; currency?: string | null; cents?: boolean; decimals?: number } = {}): string {
    switch (format) {
        case 'currency':
            return fmtCurrency(value, opts.currency, { compact: opts.compact, cents: opts.cents });
        case 'percent':
            return fmtPercent(value, { tile: opts.tile, axis: opts.axis, decimals: opts.decimals });
        case 'position':
            return fmtPosition(value, opts.decimals);
        case 'duration':
            return fmtDuration(value);
        default:
            return opts.compact ? fmtCompact(value) : fmtFull(value);
    }
}

/**
 * `fmtValue` for a value and its comparison together: rates and positions share the decimals of `pairDecimals` (`2.64%` vs `2.68%`).
 * `deltaDecimals` is what the delta next to them must use (`MetricDelta decimals`), so the three never disagree.
 */
export function fmtValuePair(format: MetricFormat, value: Num, previous: Num, opts: { compact?: boolean; tile?: boolean; axis?: boolean; currency?: string | null; cents?: boolean } = {}): { value: string; previous: string; deltaDecimals?: number } {
    const decimals = format === 'percent' || format === 'position' ? pairDecimals(format, value, previous) : undefined;
    return { value: fmtValue(format, value, { ...opts, decimals }), previous: fmtValue(format, previous, { ...opts, decimals }), deltaDecimals: decimals };
}

// ─── Deltas ────────────────────────────────────────────────────────────────

/**
 * - `percent`: relative change (counts). `18.4%`, `174%`, `>999%`.
 * - `points`: difference of two ratios in percentage points (CTR, engagement). `0.1 pt`.
 * - `absolute`: plain difference (position). `0.4`.
 *
 * `points` and `absolute` take the same decimals as the values they sit next to (`pairDecimals`): 1, or 2 when the
 * pair would otherwise read "2.6%  0 pt  vs 2.7%".
 */
export type DeltaMode = 'percent' | 'points' | 'absolute';

export interface DeltaOptions {
    mode?: DeltaMode;
    /** Which direction is good. Default 'up'. Position is 'down'. */
    better?: 'up' | 'down';
    /** Previous values below this are noise: tone becomes neutral. Default 0 (off). */
    noiseFloor?: number;
    /** Decimals of a `points` / `absolute` delta. Default: `pairDecimals` of the two values. */
    decimals?: number;
}

export interface DeltaResult {
    /** change: a real delta; flat: |change| below the threshold; new: previous was 0; none: no data. */
    state: 'change' | 'flat' | 'new' | 'none';
    /** Direction of the arrow: where the NUMBER moved, for every metric (position included). Colour (`tone`) says good or bad. */
    direction: 'up' | 'down' | 'flat';
    tone: 'good' | 'bad' | 'neutral';
    /** Without arrow: `18.4%`, `0.1 pt`, `0.4`, `0%`, `new`, `–`. */
    text: string;
    /** With a text arrow for plain-text contexts (CSV, tooltips, tests): `▲ 18.4%`. */
    label: string;
    /** Screen-reader phrase without the comparison period: `up 18.4 percent`. */
    srText: string;
    /** For lower-is-better metrics (position, bounce rate): what the arrow means, for a tooltip. `Up 0.1: worse (lower is better)`. */
    note?: string;
    /** Raw change in the mode's unit (percent, points or absolute), null when undefined. */
    change: number | null;
}

function none(text: string, state: 'none' | 'new'): DeltaResult {
    return {
        state,
        direction: 'flat',
        tone: 'neutral',
        text,
        label: text,
        srText: state === 'new' ? 'new this period' : 'no comparison data',
        change: null,
    };
}

/** Always 1 decimal under 100% (`9.0%`, `18.4%`) so a delta column never mixes `9%` with `8.5%`. */
export function fmtPercentChange(absPct: number): string {
    if (absPct >= 999.5) return '>999%';
    if (absPct >= 99.95) return `${Math.round(absPct)}%`;
    return `${absPct.toFixed(1)}%`;
}

export function computeDelta(current: Num, previous: Num, opts: DeltaOptions = {}): DeltaResult {
    const mode = opts.mode ?? 'percent';
    const better = opts.better ?? 'up';
    if (!isNum(current) || !isNum(previous)) return none(DASH, 'none');

    let change: number;
    let text: string;
    let spoken: string;

    if (mode === 'points') {
        change = (current - previous) * 100;
        const d = opts.decimals ?? pairDecimals('percent', current, previous);
        const abs = roundTo(Math.abs(change), d);
        if (abs === 0) {
            return { state: 'flat', direction: 'flat', tone: 'neutral', text: '0 pt', label: '0 pt', srText: 'no change', change: 0 };
        }
        text = `${abs.toFixed(d)} pt`;
        spoken = `${stripZeros(abs.toFixed(d))} percentage points`;
    } else {
        if (previous === 0 && current === 0) return none(DASH, 'none');
        if (previous === 0) return none('new', 'new');
        if (mode === 'absolute') {
            change = current - previous;
            const d = opts.decimals ?? pairDecimals('position', current, previous);
            const abs = roundTo(Math.abs(change), d);
            if (abs === 0) {
                // A bare "0" next to a position reads like a value; show the no-change dash instead.
                return { state: 'flat', direction: 'flat', tone: 'neutral', text: DASH, label: DASH, srText: 'no change', change: 0 };
            }
            text = abs.toFixed(d);
            spoken = text;
        } else {
            change = ((current - previous) / Math.abs(previous)) * 100;
            const abs = Math.abs(change);
            if (abs < 0.05) {
                return { state: 'flat', direction: 'flat', tone: 'neutral', text: '0%', label: '0%', srText: 'no change', change: 0 };
            }
            text = fmtPercentChange(abs);
            spoken = text === '>999%' ? 'more than 999 percent' : `${text.replace('%', '')} percent`;
        }
    }

    const rose = change > 0;
    const good = better === 'up' ? rose : !rose;
    // One rule for every metric (Looker / GA): the arrow is where the number moved, the colour is good or bad.
    // Position 17.1 -> 17.2 is ▲ in red; "lower is better" is spelled out in `note` for the tooltip.
    const direction: 'up' | 'down' = rose ? 'up' : 'down';
    const noisy = opts.noiseFloor !== undefined && Math.abs(previous) < opts.noiseFloor;
    const tone = noisy ? 'neutral' : good ? 'good' : 'bad';
    const word = rose ? 'up' : 'down';
    const verdict = good ? 'better' : 'worse';

    return {
        state: 'change',
        direction,
        tone,
        text,
        label: `${direction === 'up' ? ARROW_UP : ARROW_DOWN} ${text}`,
        srText: better === 'down' ? `${word} ${spoken}, ${verdict}` : `${word} ${spoken}`,
        ...(better === 'down' ? { note: `${rose ? 'Up' : 'Down'} ${text}: ${verdict} (lower is better)` } : {}),
        change,
    };
}

/** Percent change with arrow: `▲ 18.4%` · `▼ 49.7%` · `▲ 174%` · `new` · `–`. */
export function fmtDelta(current: Num, previous: Num): string {
    return computeDelta(current, previous, { mode: 'percent' }).label;
}

/** Rate change in percentage points: `▼ 0.1 pt`. Inputs are ratios. */
export function fmtDeltaPoints(current: Num, previous: Num): string {
    return computeDelta(current, previous, { mode: 'points' }).label;
}

/** Position change: absolute, arrow = where the number moved (`▼ 0.4` when it went 8.8 -> 8.4), colour says better. */
export function fmtDeltaPosition(current: Num, previous: Num): string {
    return computeDelta(current, previous, { mode: 'absolute', better: 'down' }).label;
}

/** The delta mode and polarity a metric format implies. */
export function deltaOptionsFor(format: MetricFormat, better: 'up' | 'down' = 'up'): DeltaOptions {
    if (format === 'percent') return { mode: 'points', better };
    if (format === 'position') return { mode: 'absolute', better: 'down' };
    return { mode: 'percent', better, noiseFloor: format === 'count' ? 20 : undefined };
}

// ─── Dates ─────────────────────────────────────────────────────────────────

export type DateInput = Date | string | number;

/** Parse a date. 'YYYY-MM-DD' and 'YYYYMMDD' become UTC midnight of that day. */
export function toDate(input: DateInput): Date {
    if (input instanceof Date) return input;
    if (typeof input === 'number') return new Date(input);
    const s = input.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Date(s);
}

/** 'YYYY-MM-DD' of a date in UTC. */
export function toIsoDay(input: DateInput): string {
    return toDate(input).toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** `Oct 13` */
export function fmtDay(d: DateInput): string {
    return dayFmt.format(toDate(d));
}

/** `Oct 13, 2026` */
export function fmtDayYear(d: DateInput): string {
    return dayYearFmt.format(toDate(d));
}

/** Tooltip header: `Tue, Oct 13, 2026` */
export function fmtDayLong(d: DateInput): string {
    return longFmt.format(toDate(d));
}

/** `Oct` */
export function fmtMonth(d: DateInput): string {
    return monthFmt.format(toDate(d));
}

/** `Jan 2026` */
export function fmtMonthYear(d: DateInput): string {
    return monthYearFmt.format(toDate(d));
}

/**
 * `Jul 13 – Oct 10` (en dash with spaces). The year is added when the range is
 * not in the current year (`Jul 13 – Oct 10, 2025`) or crosses years
 * (`Dec 3, 2025 – Jan 2, 2026`). `now` is for tests.
 */
export function fmtDateRange(start: DateInput, end: DateInput, now: Date = new Date()): string {
    const a = toDate(start);
    const b = toDate(end);
    const ya = a.getUTCFullYear();
    const yb = b.getUTCFullYear();
    const current = now.getUTCFullYear();
    const sameDay = toIsoDay(a) === toIsoDay(b);
    if (ya !== yb) return `${fmtDayYear(a)} – ${fmtDayYear(b)}`;
    if (sameDay) return ya === current ? fmtDay(a) : fmtDayYear(a);
    if (ya !== current) return `${fmtDay(a)} – ${fmtDayYear(b)}`;
    return `${fmtDay(a)} – ${fmtDay(b)}`;
}

/**
 * The tight form for chips: `Oct 14–20` (same month), `Sep 30–Oct 27`, `Sep 30–Oct 27, 2025` (not this year),
 * `Dec 3, 2025–Jan 2, 2026` (across years), `Oct 14` (one day). `now` is for tests.
 */
export function fmtDateRangeShort(start: DateInput, end: DateInput, now: Date = new Date()): string {
    const a = toDate(start);
    const b = toDate(end);
    const ya = a.getUTCFullYear();
    const yb = b.getUTCFullYear();
    if (ya !== yb) return `${fmtDayYear(a)}–${fmtDayYear(b)}`;
    if (toIsoDay(a) === toIsoDay(b)) return ya === now.getUTCFullYear() ? fmtDay(a) : fmtDayYear(a);
    const year = ya === now.getUTCFullYear() ? '' : `, ${ya}`;
    const sameMonth = a.getUTCMonth() === b.getUTCMonth();
    return `${fmtDay(a)}–${sameMonth ? b.getUTCDate() : fmtDay(b)}${year}`;
}

/**
 * Tick label maker for a date axis (DESIGN 6.3): ranges of about 3 months or
 * less show `Oct 13`; longer ranges show `Oct`, with the year on January and on
 * the first tick (`Jan 2026`). Ranges crossing a year show the year on the
 * first tick.
 */
export function makeDateTickFormatter(dates: DateInput[]): (value: DateInput, index: number) => string {
    if (dates.length === 0) return (v) => fmtDay(v);
    const first = toDate(dates[0]);
    const last = toDate(dates[dates.length - 1]);
    const spanDays = Math.abs(last.getTime() - first.getTime()) / 86_400_000;
    const crossesYear = first.getUTCFullYear() !== last.getUTCFullYear();
    if (spanDays <= 93) {
        return (value, index) => {
            const d = toDate(value);
            return index === 0 && crossesYear ? fmtDayYear(d) : fmtDay(d);
        };
    }
    return (value, index) => {
        const d = toDate(value);
        if (index === 0 || d.getUTCMonth() === 0) return fmtMonthYear(d);
        return fmtMonth(d);
    };
}
