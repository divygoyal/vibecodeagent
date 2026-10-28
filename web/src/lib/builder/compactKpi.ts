/**
 * Compact KPI cards (round 9 polish, review item 23): a KPI strip or scorecard that shows no comparison and no
 * sparkline is only a label and a number, so the 3 rows a template gives it left a blank band under it. Viewers
 * (never the editor) get it 2 rows tall then; the grid closes the gap below. Turn the comparison on and it grows
 * back to the author's height. Pure.
 */
import type { CompareSpec, WidgetDef } from './types';

/** Rows of a compact KPI card. At the default 32 px rows and 16 px gaps that is 80 px: label, number and 12 px padding. */
export const COMPACT_KPI_ROWS = 2;
/** Cards this tall or taller were made big on purpose (a hero number): left alone. */
const MAX_COMPACTED_ROWS = 4;

/** Whether this widget shows a "vs" line / change chip: its own comparison when it has one, else the dashboard's. */
export function showsComparison(widget: WidgetDef, dashboardMode: CompareSpec['mode']): boolean {
    if (widget.type !== 'scorecard' && widget.type !== 'kpi-strip') return false;
    const mode = widget.dateOverride?.compare ? widget.dateOverride.compare.mode : dashboardMode;
    return widget.config.comparison.show && mode !== 'none';
}

/** The rows a viewer gets for this widget (the layout's `h` unless it is a compactable KPI card). */
export function viewerRows(widget: WidgetDef | undefined, h: number, dashboardMode: CompareSpec['mode']): number {
    if (!widget || h <= COMPACT_KPI_ROWS || h >= MAX_COMPACTED_ROWS) return h;
    if (widget.type === 'kpi-strip') return showsComparison(widget, dashboardMode) ? h : COMPACT_KPI_ROWS;
    if (widget.type === 'scorecard') return showsComparison(widget, dashboardMode) || widget.config.sparkline.show || widget.config.target ? h : COMPACT_KPI_ROWS;
    return h;
}
