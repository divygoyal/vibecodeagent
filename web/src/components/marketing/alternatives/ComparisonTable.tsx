import { Check, Minus } from 'lucide-react';

import { BRAND_NAME } from '@/lib/brand';

/** A cell: yes / no, or a short phrase. `text` next to a boolean adds a few words ("Yes, 13 tools"). */
export type CompareValue = boolean | string | { yes: boolean; text: string };

export interface CompareRow {
    label: string;
    us: CompareValue;
    them: CompareValue;
}

function Cell({ value, who }: { value: CompareValue; who: string }) {
    const yes = typeof value === 'boolean' ? value : typeof value === 'object' ? value.yes : null;
    const text = typeof value === 'string' ? value : typeof value === 'object' ? value.text : null;
    return (
        <span className="inline-flex items-start gap-2 text-left">
            {yes === true ? <Check aria-label={`${who}: yes`} size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-up" /> : null}
            {yes === false ? <Minus aria-label={`${who}: no`} size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-muted" /> : null}
            {text ? <span className="text-body text-fg">{text}</span> : null}
        </span>
    );
}

/**
 * Shared side-by-side table for the alternatives pages. TrafficClaw is always the first value column. Plain table
 * markup in a horizontally scrollable card so it stays a real table (and crawlable) on phones.
 */
export function ComparisonTable({ competitor, rows, caption }: { competitor: string; rows: CompareRow[]; caption: string }) {
    return (
        <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface shadow-card">
            <table className="w-full min-w-[620px] border-collapse text-left">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="bg-surface-sunken text-meta text-fg-muted">
                        <th scope="col" className="w-[34%] px-4 py-3 font-medium"><span className="sr-only">Feature</span></th>
                        <th scope="col" className="w-[33%] border-x border-border-subtle bg-brand-soft px-4 py-3 text-body font-semibold text-brand-soft-fg">{BRAND_NAME}</th>
                        <th scope="col" className="w-[33%] px-4 py-3 text-body font-semibold text-fg">{competitor}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {rows.map((r) => (
                        <tr key={r.label}>
                            <th scope="row" className="px-4 py-3.5 align-top text-body font-medium text-fg-secondary">{r.label}</th>
                            <td className="border-x border-border-subtle bg-brand-soft/30 px-4 py-3.5 align-top"><Cell value={r.us} who={BRAND_NAME} /></td>
                            <td className="px-4 py-3.5 align-top"><Cell value={r.them} who={competitor} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export interface OverviewRow {
    label: string;
    /** One value per column, in the order of `columns` (TrafficClaw first). */
    values: CompareValue[];
}

/** The same table with several competitors side by side (the /alternatives index). */
export function OverviewTable({ columns, rows, caption }: { columns: string[]; rows: OverviewRow[]; caption: string }) {
    return (
        <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface shadow-card">
            <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="bg-surface-sunken text-meta text-fg-muted">
                        <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Feature</span></th>
                        {columns.map((c, i) => (
                            <th key={c} scope="col" className={i === 0 ? 'border-x border-border-subtle bg-brand-soft px-4 py-3 text-body font-semibold text-brand-soft-fg' : 'px-4 py-3 text-body font-semibold text-fg'}>{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {rows.map((r) => (
                        <tr key={r.label}>
                            <th scope="row" className="px-4 py-3.5 align-top text-body font-medium text-fg-secondary">{r.label}</th>
                            {r.values.map((v, i) => (
                                <td key={columns[i]} className={i === 0 ? 'border-x border-border-subtle bg-brand-soft/30 px-4 py-3.5 align-top' : 'px-4 py-3.5 align-top'}>
                                    <Cell value={v} who={columns[i]} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
