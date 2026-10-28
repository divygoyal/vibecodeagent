/**
 * Calculated metrics (round 7, gap #4): a metric made from one or two catalogue metrics with a
 * fixed operation. No formula language: ratio (A ÷ B), difference (A − B), per 1,000 (A per
 * 1,000 B) and % of total (A as a share of the column).
 *
 * The id carries everything the maths needs, so the engine, the share link, the PDF and a widget
 * pasted into another dashboard compute the same number without the dashboard document:
 *
 *   calc:<op>_<format>_<better>:<A>[:<B>]:<token>     e.g. calc:per1k_num_up:ga4:keyEvents:ga4:sessions:k3f9a2
 *
 * Only the name lives on the dashboard (doc.calcs, CalculatedMetric). The random token keeps two
 * dashboards' calculations apart in the label registry below, so labels never cross dashboards.
 *
 * Isomorphic, pure and dependency free (the catalogue imports this, not the other way round).
 */
import type { CalculatedMetric, MetricId } from './types';

export type CalcOp = 'ratio' | 'diff' | 'per1k' | 'share';
export type CalcFormat = 'num' | 'pct' | 'cur';
export type CalcBetter = 'up' | 'down' | 'flat';

export interface CalcSpec {
    op: CalcOp;
    a: MetricId;
    /** Every op but 'share'. */
    b?: MetricId;
    format: CalcFormat;
    better: CalcBetter;
    token: string;
}

export const CALC_OPS: Array<{ op: CalcOp; label: string; example: string; needsB: boolean; format: CalcFormat }> = [
    { op: 'ratio', label: 'Ratio (A ÷ B)', example: 'Clicks per pageview, revenue per session', needsB: true, format: 'num' },
    { op: 'per1k', label: 'Per 1,000 (A per 1,000 B)', example: 'Key events per 1,000 sessions', needsB: true, format: 'num' },
    { op: 'diff', label: 'Difference (A − B)', example: 'Sessions minus engaged sessions', needsB: true, format: 'num' },
    { op: 'share', label: '% of total (share of the column)', example: 'Each page’s share of all clicks', needsB: false, format: 'pct' },
];

const ID_RE = /^calc:(ratio|diff|per1k|share)_(num|pct|cur)_(up|down|flat):((?:ga4|gsc):[A-Za-z0-9]{1,40})(?::((?:ga4|gsc):[A-Za-z0-9]{1,40}))?:([a-z0-9]{4,8})$/;

export function isCalcId(id: string | null | undefined): boolean {
    return typeof id === 'string' && id.startsWith('calc:');
}

const parsed = new Map<string, CalcSpec | null>();

/** The calculation an id describes, or null when it is not a valid calculated-metric id. */
export function parseCalcId(id: string): CalcSpec | null {
    if (!isCalcId(id)) return null;
    const hit = parsed.get(id);
    if (hit !== undefined) return hit;
    const m = ID_RE.exec(id);
    let spec: CalcSpec | null = null;
    if (m) {
        const op = m[1] as CalcOp;
        const b = m[5];
        // 'share' takes one input; the others take two.
        if ((op === 'share') === !b) spec = { op, a: m[4], b: b || undefined, format: m[2] as CalcFormat, better: m[3] as CalcBetter, token: m[6] };
    }
    if (parsed.size > 2000) parsed.clear();
    parsed.set(id, spec);
    return spec;
}

/** 6 random [a-z0-9] characters. */
export function calcToken(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const g = (globalThis as { crypto?: Crypto }).crypto;
    const buf = new Uint8Array(6);
    if (g?.getRandomValues) g.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    return [...buf].map((b) => alphabet[b % alphabet.length]).join('');
}

export function calcId(spec: Omit<CalcSpec, 'token'> & { token?: string }): MetricId {
    const head = `calc:${spec.op}_${spec.format}_${spec.better}:${spec.a}`;
    return `${head}${spec.op === 'share' ? '' : `:${spec.b}`}:${spec.token ?? calcToken()}`;
}

/** The catalogue metrics a calculated metric reads (A, then B). */
export function calcInputs(spec: CalcSpec): MetricId[] {
    return spec.b && spec.b !== spec.a ? [spec.a, spec.b] : [spec.a];
}

/**
 * Replace calculated metrics by their inputs: the catalogue metrics a query must fetch. Order is
 * kept, duplicates dropped; unknown calc ids stay (the engine reports them as unknown metrics).
 */
export function expandCalcs(ids: MetricId[]): MetricId[] {
    const out: MetricId[] = [];
    const add = (id: MetricId) => { if (!out.includes(id)) out.push(id); };
    for (const id of ids) {
        const spec = parseCalcId(id);
        if (spec) calcInputs(spec).forEach(add);
        else add(id);
    }
    return out;
}

type Vals = Record<string, number | null | undefined>;

const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The value of a calculated metric from its inputs' values on one row (a day, a page, the whole
 * period). Rows that were rolled up (weeks, sites, the totals row, "Other") must pass their summed
 * inputs, so a ratio is the ratio of the sums, never an average of row ratios.
 * Division by zero (or a missing input) gives null, shown as '–'.
 * `shareTotal` is the column total of A for 'share'.
 */
export function calcValue(spec: CalcSpec, v: Vals, shareTotal?: number | null): number | null {
    const a = num(v[spec.a]);
    if (a === null) return null;
    if (spec.op === 'share') {
        const t = num(shareTotal);
        return t === null || t === 0 ? null : a / t;
    }
    const b = num(v[spec.b ?? '']);
    if (b === null) return null;
    if (spec.op === 'diff') return a - b;
    if (b === 0) return null;
    return spec.op === 'per1k' ? (a / b) * 1000 : a / b;
}

/** Sum of one metric over rows (null when no row has it). */
export function sumOf(rows: Iterable<Vals>, id: MetricId): number | null {
    let s = 0;
    let any = false;
    for (const r of rows) {
        const v = num(r[id]);
        if (v !== null) {
            s += v;
            any = true;
        }
    }
    return any ? s : null;
}

/** Column totals of A for every 'share' calc among `metrics` (the denominators of calcValue). */
export function shareTotals(metrics: MetricId[], rows: Iterable<Vals>): Record<string, number | null> {
    const list = [...rows];
    const out: Record<string, number | null> = {};
    for (const id of metrics) {
        const spec = parseCalcId(id);
        if (spec?.op === 'share') out[id] = sumOf(list, spec.a);
    }
    return out;
}

/** Add every calculated metric among `metrics` to `vals` (a copy), from the inputs in it. */
export function withCalcValues(metrics: MetricId[], vals: Vals, totals: Record<string, number | null> = {}): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(vals)) out[k] = v ?? null;
    for (const id of metrics) {
        const spec = parseCalcId(id);
        if (spec) out[id] = calcValue(spec, vals, totals[id]);
    }
    return out;
}

// ── names ────────────────────────────────────────────────────────────────

function lowerFirst(s: string): string {
    return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Default name from the inputs' labels ("Key events per 1,000 sessions"). */
export function calcAutoLabel(spec: Pick<CalcSpec, 'op' | 'a' | 'b'>, labelOf: (id: MetricId) => string): string {
    const a = labelOf(spec.a);
    const b = spec.b ? labelOf(spec.b) : '';
    switch (spec.op) {
        case 'ratio': return `${a} ÷ ${lowerFirst(b)}`;
        case 'per1k': return `${a} per 1,000 ${lowerFirst(b)}`;
        case 'diff': return `${a} − ${lowerFirst(b)}`;
        case 'share': return `Share of ${lowerFirst(a)}`;
    }
}

export function calcDescription(spec: CalcSpec, labelOf: (id: MetricId) => string): string {
    const a = labelOf(spec.a);
    const b = spec.b ? labelOf(spec.b) : '';
    switch (spec.op) {
        case 'ratio': return `Calculated: ${a} divided by ${lowerFirst(b)}, from the totals of each row.`;
        case 'per1k': return `Calculated: ${a} for every 1,000 ${lowerFirst(b)}.`;
        case 'diff': return `Calculated: ${a} minus ${lowerFirst(b)}.`;
        case 'share': return `Calculated: each row’s share of all ${lowerFirst(a)} in the widget.`;
    }
}

/**
 * Names of calculated metrics, by id. Filled from doc.calcs wherever a dashboard renders (editor,
 * viewer, share link) and in the engine. Ids are unique per dashboard (random token), so a shared
 * server process never shows one dashboard's name on another; unnamed ids use the default name.
 */
const LABELS = new Map<string, string>();

export function registerCalcs(defs: CalculatedMetric[] | undefined | null): void {
    if (!defs?.length) return;
    for (const d of defs) {
        if (!d || typeof d.label !== 'string' || !parseCalcId(d.id)) continue;
        const label = d.label.trim().slice(0, 60);
        if (!label || LABELS.get(d.id) === label) continue;
        if (LABELS.size > 5000) LABELS.delete(LABELS.keys().next().value as string);
        LABELS.set(d.id, label);
    }
}

/** Forget a name (the calc was deleted or replaced); widgets that still use the id fall back to the default name. */
export function unregisterCalc(id: MetricId): void {
    LABELS.delete(id);
}

export function registeredCalcLabel(id: MetricId): string | undefined {
    return LABELS.get(id);
}

/**
 * Replace a calculated metric id everywhere in widgets (editing a calc changes its id). Ids are
 * plain [A-Za-z0-9_:] strings, so a whole-token replace in the JSON is exact.
 */
export function replaceMetricId<T>(value: T, from: MetricId, to: MetricId): T {
    if (from === to) return value;
    const json = JSON.stringify(value);
    // Token boundary: the id is followed by a quote or ':prev'-style suffix, never by more id characters.
    const re = new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
    return JSON.parse(json.replace(re, to)) as T;
}

/** Widgets that use a metric id (to warn before deleting a calc). */
export function usesMetric(value: unknown, id: MetricId): boolean {
    return JSON.stringify(value).includes(id);
}
