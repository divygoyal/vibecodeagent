/**
 * Conditional formatting for table cells (round 2, C2). Rules live in TableConfig.rules (typed and
 * saved since v2, rendered from round 2). A rule tests a metric column's value, or its change
 * against the comparison period, and paints the cell good / bad / warn. First matching rule wins.
 * Values are in the metric's own unit: CTR 0.02 is 2 %, change -0.2 is a 20 % drop.
 */
import { getMetric } from './catalog';
import type { CellValue, ConditionalRule, TableColumn } from './types';

export type CfStyle = ConditionalRule['style'];

export const CF_OPS: Array<{ value: ConditionalRule['op']; label: string }> = [
    { value: 'gt', label: 'is above' },
    { value: 'gte', label: 'is at least' },
    { value: 'lt', label: 'is below' },
    { value: 'lte', label: 'is at most' },
    { value: 'between', label: 'is between' },
];

export function ruleMatches(rule: ConditionalRule, v: number | null): boolean {
    if (v === null || !Number.isFinite(v)) return false;
    const val = rule.value;
    switch (rule.op) {
        case 'gt': return typeof val === 'number' && v > val;
        case 'gte': return typeof val === 'number' && v >= val;
        case 'lt': return typeof val === 'number' && v < val;
        case 'lte': return typeof val === 'number' && v <= val;
        case 'between': return Array.isArray(val) && v >= Math.min(val[0], val[1]) && v <= Math.max(val[0], val[1]);
        default: return false;
    }
}

/** Relative change, or null when there is no usable previous value. */
export function changeOf(cur: number | null, prev: CellValue | undefined): number | null {
    if (cur === null || typeof prev !== 'number' || prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
}

/** Style for one cell: the first rule on this column that matches. */
export function cellStyle(rules: ConditionalRule[] | undefined, column: TableColumn, row: Record<string, CellValue>): CfStyle | null {
    if (!rules?.length || column.kind !== 'metric') return null;
    const key = `m:${column.ref}`;
    const raw = row[key];
    const cur = typeof raw === 'number' ? raw : null;
    for (const r of rules) {
        if (r.column !== column.id && r.column !== key) continue;
        const v = r.on === 'change' ? changeOf(cur, row[`${key}:prev`]) : cur;
        if (ruleMatches(r, v)) return r.style;
    }
    return null;
}

/** Percent-like metrics take and show rule values in % in the editor. */
export function rulePercent(metricId: string, on?: ConditionalRule['on']): boolean {
    if (on === 'change') return true;
    const f = getMetric(metricId)?.format;
    return f === 'percent';
}

/** Plain-English summary for the rule list ("CTR is below 1 %: bad"). */
export function ruleText(rule: ConditionalRule, label: string, metricId: string): string {
    const pct = rulePercent(metricId, rule.on);
    const fmt = (n: number) => (pct ? `${Math.round(n * 1000) / 10} %` : n.toLocaleString('en-US'));
    const op = CF_OPS.find((o) => o.value === rule.op)?.label ?? rule.op;
    const val = Array.isArray(rule.value) ? `${fmt(rule.value[0])} and ${fmt(rule.value[1])}` : fmt(rule.value);
    return `${rule.on === 'change' ? `Change in ${label}` : label} ${op} ${val}`;
}
