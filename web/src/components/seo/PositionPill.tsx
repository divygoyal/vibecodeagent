'use client';

interface PositionPillProps {
    pos: number;
    /** Render the value as "n.n" with one decimal. Default true. */
    decimal?: boolean;
}

/**
 * Color-coded SERP position chip.
 * 1-3   → emerald (top of page 1)
 * 4-10  → cyan    (page 1)
 * 11-20 → amber   (page 2 / striking distance)
 * 21+   → red     (deep)
 */
export default function PositionPill({ pos, decimal = true }: PositionPillProps) {
    let cls = 'border-zinc-700/40 bg-zinc-700/20 text-zinc-300';
    if (pos > 0) {
        if (pos <= 3) cls = 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
        else if (pos <= 10) cls = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
        else if (pos <= 20) cls = 'border-amber-500/30 bg-amber-500/15 text-amber-300';
        else cls = 'border-red-500/25 bg-red-500/10 text-red-300';
    }
    const display = pos > 0 ? (decimal ? pos.toFixed(1) : Math.round(pos).toString()) : '–';
    return (
        <span className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[12px] font-semibold tabular-nums ${cls}`}>
            {display}
        </span>
    );
}
