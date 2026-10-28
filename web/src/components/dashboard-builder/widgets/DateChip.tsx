'use client';

import { CalendarClock } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { overrideLabel, widgetCompareText, type WidgetDates } from '@/lib/builder/widgetDates';
import type { WidgetDef } from '@/lib/builder/types';

/** Small chip on a widget that does not follow the dashboard's dates (round 9): "Last 7 days", "Previous year". */
/** `tile`: inside a KPI tile, the text only shows when the tile is wide enough (it sits next to the metric name); the icon always does. */
export function DateChip({ widget, dates, className, tile }: { widget: WidgetDef; dates?: WidgetDates; className?: string; tile?: boolean }) {
    if (!dates?.own || !widget.dateOverride) return null;
    const label = overrideLabel(widget.dateOverride);
    if (!label) return null;
    const title = `Own dates: ${fmtDateRange(dates.range.start, dates.range.end)}${dates.compare ? `. ${widgetCompareText(dates).title}` : ''}`;
    return (
        <span data-testid="widget-date-chip" title={title} aria-label={title} className={cn('inline-flex min-w-0 max-w-[160px] shrink-[4] items-center gap-1 rounded-badge bg-subtle px-1.5 text-caption text-fg-muted', className)}>
            <CalendarClock aria-hidden size={11} strokeWidth={1.75} className="shrink-0" />
            <span className={cn('truncate', tile && 'hidden @min-[220px]/tile:inline')}>{label}</span>
        </span>
    );
}
