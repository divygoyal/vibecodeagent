/**
 * Trend column for tables (round 7, gap #7): each row's line of the sort metric over the range,
 * drawn as a small sparkline next to its numbers.
 *
 * The engine asks Google once more per table (one GA4 report and/or one Search Console call):
 * the sort metric by date x the row dimension, filtered to the table's top rows, pivoted into one
 * series per row (the time series breakdown's wide frame). rowTrends() turns that frame into a
 * line per row value for TableView. Isomorphic and pure.
 */
import { getDim, getMetric } from './catalog';
import type { DataFrame, FilterClause, Iso, MetricId, TableWidget, WidgetQuery } from './types';

/** Rows that get a trend: the top rows in the table's own order. */
export const TABLE_TREND_ROWS = 25;
/** Longer ranges draw weekly points (a 90-point line is already as dense as a cell can show). */
export const TREND_DAILY_MAX_DAYS = 92;
/** Search Console caps a filter expression; the any-of regex of the rows must stay under it. */
const MAX_FILTER_CHARS = 3500;

/** Why a table cannot show a trend column, or null when it can. */
export function trendUnsupported(widget: TableWidget): string | null {
    const dims = widget.config.dimensions;
    if (dims.length !== 1) return 'Trends need a table with one dimension (rows).';
    const d = getDim(dims[0]);
    if (!d || d.id === 'site' || d.kind === 'time' || !d.filterable) return `Trends are not available for rows by ${(d?.label ?? dims[0]).toLowerCase()}.`;
    if (!trendMetric(widget)) return 'Add a metric column first.';
    return null;
}

/** The metric the trend draws: the table's sort column (else its first metric column). */
export function trendMetric(widget: TableWidget): MetricId | null {
    const c = widget.config;
    const metricCols = c.columns.filter((col) => col.kind === 'metric' && !col.hidden);
    const sorted = metricCols.find((col) => col.id === c.sort.by) ?? metricCols.find((col) => `m:${col.ref}` === c.sort.by);
    const id = (sorted ?? metricCols[0])?.ref;
    return id && getMetric(id) ? id : null;
}

function days(range: { start: Iso; end: Iso }): number {
    return Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * The trend query of a table from its rows query and the rows it returned (top
 * TABLE_TREND_ROWS in the engine's order, never "(other)"), or null when there is nothing to draw.
 * `filter` is the extra clause that limits Google to those rows.
 */
export function tableTrendQuery(
    widget: TableWidget,
    rowsQuery: WidgetQuery,
    rows: DataFrame,
    range: { start: Iso; end: Iso },
): { query: WidgetQuery; filter: FilterClause; values: string[] } | null {
    if (!widget.config.trend || trendUnsupported(widget)) return null;
    const dim = widget.config.dimensions[0];
    const metric = trendMetric(widget)!;
    const values: string[] = [];
    let chars = 0;
    for (const r of rows.rows) {
        if (values.length >= TABLE_TREND_ROWS) break;
        const v = r[`d:${dim}`];
        if (r.__other || typeof v !== 'string' || !v || v === '(other)' || values.includes(v)) continue;
        chars += v.length * 2 + 12;
        if (chars > MAX_FILTER_CHARS) break;
        values.push(v);
    }
    if (!values.length) return null;
    const filter: FilterClause = { dimension: dim, op: 'in', value: values };
    const query: WidgetQuery = {
        part: 'trend',
        source: rowsQuery.source,
        metrics: [metric],
        dimensions: ['date', dim],
        granularity: days(range) > TREND_DAILY_MAX_DAYS ? 'week' : 'day',
        filters: [...rowsQuery.filters, filter],
        compare: false,
        fillDates: true,
        pivot: { dimension: dim, top: values.length, other: false },
    };
    return { query, filter, values };
}

export interface RowTrends {
    /** Bucket starts (days, or Mondays past TREND_DAILY_MAX_DAYS). */
    dates: Iso[];
    /** Row value -> one value per date (null = no value, such as a ratio over zero). */
    byValue: Map<string, Array<number | null>>;
}

/**
 * Lines per row value from the engine's 'trend' part. Up to 3 trailing buckets where no row has a
 * value above zero yet (Search Console's last two days) are dropped, so lines do not end in a false dip to zero.
 */
export function rowTrends(frame: DataFrame | undefined): RowTrends {
    const out: RowTrends = { dates: [], byValue: new Map() };
    if (!frame?.rows.length || !frame.seriesKeys?.length) return out;
    const keys = frame.seriesKeys.filter((k) => k !== 'b:__other');
    const val = (r: DataFrame['rows'][number], k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : null);
    let end = frame.rows.length;
    const minEnd = Math.max(1, end - 3);
    while (end > minEnd && keys.every((k) => !val(frame.rows[end - 1], k))) end--;
    const rows = frame.rows.slice(0, end);
    out.dates = rows.map((r) => String(r['d:date'] ?? ''));
    for (const k of keys) out.byValue.set(k.slice(2), rows.map((r) => val(r, k)));
    return out;
}

/** First-to-last change of a line, for its accessible summary (null when either end is missing). */
export function trendChange(values: Array<number | null>): { first: number; last: number } | null {
    const nums = values.filter((v): v is number => v !== null);
    if (nums.length < 2) return null;
    return { first: nums[0], last: nums[nums.length - 1] };
}
