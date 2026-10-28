'use client';

import { CalendarClock } from 'lucide-react';

import { cn } from '@/lib/cn';
import { chipText, chipTitle, type WidgetDates } from '@/lib/builder/widgetDates';
import type { WidgetDef } from '@/lib/builder/types';

/**
 * Small chip on a widget that does not follow the dashboard's dates (round 9): the real days, "Oct 14–20". The rule
 * ("Last 7 days", "2 weeks earlier") is in the tooltip. `tile`: inside a KPI tile, next to the metric name; the name
 * gives way first, the days never get cut to an icon.
 */
export function DateChip({ widget, dates, className, tile }: { widget: WidgetDef; dates?: WidgetDates; className?: string; tile?: boolean }) {
    if (!dates?.own || !widget.dateOverride) return null;
    const label = chipText(widget.dateOverride, dates);
    if (!label) return null;
    const title = chipTitle(widget.dateOverride, dates);
    return (
        <span data-testid="widget-date-chip" title={title} aria-label={title} className={cn('inline-flex min-w-0 max-w-[190px] shrink-0 items-center gap-1 whitespace-nowrap rounded-badge px-1.5 text-caption', tile ? 'bg-brand-soft text-brand-soft-fg' : 'bg-subtle text-fg-muted', className)}>
            <CalendarClock aria-hidden size={11} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{label}</span>
        </span>
    );
}
