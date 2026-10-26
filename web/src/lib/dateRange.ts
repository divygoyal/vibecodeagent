/**
 * Date ranges for the app (DESIGN.md 3.3). Pure, no imports (unit-tested on
 * plain Node in web/tests/dateRange.test.mjs).
 *
 * The canonical state is { preset, compare, from?, to? }. It lives in the URL
 * (`?range=28d&compare=prev`, custom: `?range=custom&from=2026-09-01&to=2026-09-30`)
 * and is saved to the workspace. Read it with useDateRange() from
 * components/shell/DateRangeControl.
 *
 * Old pages still take the legacy range keys their APIs know ('7d', '30d',
 * '90d', ...). toLegacyRange() maps a preset to the nearest legacy key.
 */

export type RangePreset = '24h' | '7d' | '28d' | '3m' | '6m' | '12m' | '16m' | 'this_month' | 'last_month' | 'custom';
export type CompareMode = 'prev' | 'yoy' | 'none';

export interface DateRangeValue {
    preset: RangePreset;
    compare: CompareMode;
    /** 'YYYY-MM-DD', only for preset 'custom'. */
    from?: string;
    to?: string;
}

export interface PresetDef {
    value: RangePreset;
    /** Menu row: 'Last 28 days'. */
    label: string;
    /** Segmented control / trigger: '28d', '6 months'. */
    short: string;
    /** Sentence fragment for subtitles: 'last 28 days'. */
    phrase: string;
    /** GA4 only (Search Console has no hourly data). */
    ga4Only?: boolean;
}

export const RANGE_PRESETS: PresetDef[] = [
    { value: '24h', label: 'Last 24 hours', short: '24 hours', phrase: 'last 24 hours', ga4Only: true },
    { value: '7d', label: 'Last 7 days', short: '7d', phrase: 'last 7 days' },
    { value: '28d', label: 'Last 28 days', short: '28d', phrase: 'last 28 days' },
    { value: '3m', label: 'Last 3 months', short: '3m', phrase: 'last 3 months' },
    { value: '6m', label: 'Last 6 months', short: '6 months', phrase: 'last 6 months' },
    { value: '12m', label: 'Last 12 months', short: '12 months', phrase: 'last 12 months' },
    { value: '16m', label: 'Last 16 months', short: '16 months', phrase: 'last 16 months' },
    { value: 'this_month', label: 'This month', short: 'This month', phrase: 'this month' },
    { value: 'last_month', label: 'Last month', short: 'Last month', phrase: 'last month' },
    { value: 'custom', label: 'Custom range', short: 'Custom', phrase: 'custom range' },
];

/** The three presets shown in the segmented control. */
export const QUICK_PRESETS: RangePreset[] = ['7d', '28d', '3m'];

export const COMPARE_OPTIONS: { value: CompareMode; label: string }[] = [
    { value: 'prev', label: 'Previous period' },
    { value: 'yoy', label: 'Same period last year' },
    { value: 'none', label: 'No comparison' },
];

export const DEFAULT_DATE_RANGE: DateRangeValue = { preset: '3m', compare: 'prev' };

const PRESET_SET = new Set<string>(RANGE_PRESETS.map((p) => p.value));
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isRangePreset(v: unknown): v is RangePreset {
    return typeof v === 'string' && PRESET_SET.has(v);
}

export function isCompareMode(v: unknown): v is CompareMode {
    return v === 'prev' || v === 'yoy' || v === 'none';
}

export function presetDef(preset: RangePreset): PresetDef {
    return RANGE_PRESETS.find((p) => p.value === preset) ?? RANGE_PRESETS[3];
}

/**
 * Build a value from loose inputs (URL params, saved workspace). Unknown or
 * legacy range keys are mapped with fromLegacyRange(); a custom range without
 * valid dates falls back to the default preset.
 */
export function normalizeDateRange(input: {
    range?: string | null;
    compare?: string | null;
    from?: string | null;
    to?: string | null;
}, fallback: DateRangeValue = DEFAULT_DATE_RANGE): DateRangeValue {
    const compare = isCompareMode(input.compare) ? input.compare : fallback.compare;
    const raw = input.range ?? '';
    let preset: RangePreset | null = isRangePreset(raw) ? raw : raw ? fromLegacyRange(raw) : null;
    if (!preset) return { ...fallback, compare };
    if (preset === 'custom') {
        const from = input.from ?? '';
        const to = input.to ?? '';
        if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) {
            preset = fallback.preset === 'custom' ? DEFAULT_DATE_RANGE.preset : fallback.preset;
            return { preset, compare };
        }
        return { preset, compare, from, to };
    }
    return { preset, compare };
}

// ─── Resolution to concrete days ──────────────────────────────────────────

const DAY_MS = 86_400_000;

function utcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * DAY_MS);
}
function addMonths(d: Date, n: number): Date {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + n;
    const day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
}
function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}
function parseIso(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

export interface ResolvedDateRange {
    /** 'YYYY-MM-DD', inclusive. */
    start: string;
    end: string;
    days: number;
    /** Comparison period, null when compare is 'none'. */
    prevStart: string | null;
    prevEnd: string | null;
}

export interface ResolveOptions {
    /** Defaults to now. Only the UTC calendar day is used. */
    now?: Date;
    /**
     * Days of data delay. Search Console ranges end 2 days ago (lagDays: 2);
     * GA4 ranges end today (0, the default).
     */
    lagDays?: number;
}

export function resolveDateRange(value: DateRangeValue, opts: ResolveOptions = {}): ResolvedDateRange {
    const today = utcDay(opts.now ?? new Date());
    const lastDay = addDays(today, -(opts.lagDays ?? 0));
    let start: Date;
    let end: Date = lastDay;

    switch (value.preset) {
        case '24h':
            start = addDays(lastDay, -1);
            break;
        case '7d':
            start = addDays(lastDay, -6);
            break;
        case '28d':
            start = addDays(lastDay, -27);
            break;
        case '3m':
        case '6m':
        case '12m':
        case '16m':
            start = addDays(addMonths(lastDay, -parseInt(value.preset, 10)), 1);
            break;
        case 'this_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            if (start > end) start = end;
            break;
        case 'last_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            if (end > lastDay) end = lastDay;
            break;
        case 'custom':
        default:
            if (value.from && value.to && ISO_DAY.test(value.from) && ISO_DAY.test(value.to)) {
                start = parseIso(value.from);
                end = parseIso(value.to);
            } else {
                start = addDays(addMonths(lastDay, -3), 1);
            }
    }

    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    let prevStart: string | null = null;
    let prevEnd: string | null = null;
    if (value.compare === 'prev') {
        const pe = addDays(start, -1);
        prevEnd = iso(pe);
        prevStart = iso(addDays(pe, -(days - 1)));
    } else if (value.compare === 'yoy') {
        prevStart = iso(addMonths(start, -12));
        prevEnd = iso(addMonths(end, -12));
    }
    return { start: iso(start), end: iso(end), days, prevStart, prevEnd };
}

/** URL query object for a value (for links that keep the range). */
export function dateRangeToQuery(value: DateRangeValue): Record<string, string> {
    const q: Record<string, string> = { range: value.preset, compare: value.compare };
    if (value.preset === 'custom' && value.from && value.to) {
        q.from = value.from;
        q.to = value.to;
    }
    return q;
}

/** "vs previous 3 months", "vs same period last year", "" for none. */
export function compareSuffix(value: DateRangeValue): string {
    if (value.compare === 'none') return '';
    if (value.compare === 'yoy') return 'vs same period last year';
    const phrase = presetDef(value.preset).phrase.replace(/^last /, '');
    if (value.preset === 'custom' || value.preset === 'this_month' || value.preset === 'last_month') {
        return 'vs previous period';
    }
    return `vs previous ${phrase}`;
}

// ─── Legacy range keys (old pages and APIs) ───────────────────────────────

/** Range keys the pre-redesign APIs understand (lib/googleApi.ts resolveRange). */
export const LEGACY_RANGES = [
    'today', 'yesterday', '7d', '14d', '30d', '60d', '90d', '6m', '12m',
    'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'all',
] as const;
export type LegacyRange = (typeof LEGACY_RANGES)[number];

/** Nearest legacy key for a preset (28d -> 30d, 3m -> 90d, 16m -> 12m). */
export function toLegacyRange(preset: RangePreset): LegacyRange {
    switch (preset) {
        case '24h': return 'today';
        case '7d': return '7d';
        case '28d': return '30d';
        case '3m': return '90d';
        case '6m': return '6m';
        case '12m':
        case '16m': return '12m';
        case 'this_month': return 'this_month';
        case 'last_month': return 'last_month';
        default: return '30d';
    }
}

/** Nearest preset for a legacy key ('30d' -> '28d', '90d' -> '3m'). Unknown keys return null. */
export function fromLegacyRange(range: string): RangePreset | null {
    switch (range) {
        case 'today':
        case 'yesterday':
            return '24h';
        case '7d':
        case 'this_week':
        case 'last_week':
            return '7d';
        case '14d':
        case '28d':
        case '30d':
            return '28d';
        case '60d':
        case '90d':
        case '3m':
            return '3m';
        case '6m':
        case '180d':
            return '6m';
        case '12m':
        case '365d':
        case 'all':
        case 'this_year':
        case 'last_year':
            return '12m';
        case 'this_month':
            return 'this_month';
        case 'last_month':
            return 'last_month';
        default:
            return isRangePreset(range) ? range : null;
    }
}
