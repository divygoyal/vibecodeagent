'use client';

/**
 * Drill down (round 8): the path above a drilled bar, pie or table ("Up", then Channel › Organic Search), and a
 * "Drill into" menu for charts whose bars cannot take the keyboard (the plot is drawn by Recharts; the menu
 * lists the same values as buttons). Presentational only: DashboardView builds the labels and handlers.
 */
import { ChevronRight, CornerLeftUp, ListTree } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui';

export interface DrillView {
    /** Label of every level of the chain ("Channel", "Source / medium", "Campaign"). */
    levels: string[];
    /** 0 = the widget's own dimension. */
    depth: number;
    /** Display text of the values chosen so far (one per level above the current one). */
    values: string[];
    /** A deeper level exists, so a click on a value drills. */
    canDown: boolean;
    onUp: () => void;
    onTo: (depth: number) => void;
}

/** Height the crumb row takes (the plot above it shrinks by this much). */
export const DRILL_CRUMBS_PX = 30;

export function DrillCrumbs({ drill }: { drill: DrillView }) {
    if (drill.depth <= 0) return null;
    const upTo = drill.depth === 1 ? drill.levels[0] : drill.values[drill.depth - 2];
    const next = drill.levels[drill.depth]?.toLowerCase();
    // Phones: the earlier crumbs collapse into "…" (Up and the "…" button still go back) and the current level
    // is always shown whole, wrapping to a second line when it has to.
    return (
        <nav aria-label="Drill path" className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-meta" style={{ minHeight: DRILL_CRUMBS_PX - 6 }}>
            <button type="button" onClick={drill.onUp} aria-label={`Up one level, back to ${upTo}`}
                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 font-medium text-brand-soft-fg hover:bg-brand/15">
                <CornerLeftUp aria-hidden size={12} />Up
            </button>
            <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 sm:flex-initial sm:flex-nowrap sm:overflow-hidden">
                <li className="shrink-0 sm:hidden">
                    <button type="button" onClick={() => drill.onTo(0)} aria-label={`Back to ${drill.levels[0]}`} className="rounded px-1 text-fg-secondary hover:text-brand-text">…</button>
                </li>
                <li className="hidden shrink-0 sm:block">
                    <button type="button" onClick={() => drill.onTo(0)} className="rounded px-1 text-fg-secondary hover:text-brand-text hover:underline">{drill.levels[0]}</button>
                </li>
                {drill.values.slice(0, drill.depth).map((v, i) => {
                    const last = i === drill.depth - 1;
                    return (
                        <li key={i} className={cn('min-w-0 items-center gap-0.5', last ? 'flex' : 'hidden sm:flex')}>
                            <ChevronRight aria-hidden size={12} className="shrink-0 text-fg-muted" />
                            {last
                                ? <span aria-current="location" className="min-w-0 break-words rounded px-1 font-medium text-fg sm:truncate" title={v}>{v}</span>
                                : <button type="button" onClick={() => drill.onTo(i + 1)} className="min-w-0 truncate rounded px-1 text-fg-secondary hover:text-brand-text hover:underline" title={v}>{v}</button>}
                        </li>
                    );
                })}
            </ol>
            <span className="shrink-0 text-caption text-fg-muted sm:ml-auto sm:pl-2">by {next}</span>
        </nav>
    );
}

/** "Drill into" for a bar chart: every value as a menu item (Enter or Space drills), so the keyboard reaches them. */
export function DrillMenu({ drill, items, onPick, widgetName }: { drill: DrillView; items: Array<{ value: string; label: string }>; onPick: (value: string) => void; widgetName: string }) {
    if (!drill.canDown || !items.length) return null;
    const next = drill.levels[drill.depth + 1]?.toLowerCase();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" icon={ListTree} className="-my-1 h-7 px-2 text-meta" data-pdf-ignore="true" aria-label={`Drill into a value of ${widgetName}, by ${next}`}>Drill into</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
                {items.map((it) => <DropdownMenuItem key={it.value} onSelect={() => onPick(it.value)}>{it.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
