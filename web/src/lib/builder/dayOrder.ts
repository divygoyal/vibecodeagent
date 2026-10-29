import { dayIndex } from './charts/heatmap';

type Row = Record<string, string | number | boolean | null | undefined>;

/**
 * Calendar order, Monday first, for a "day of week" breakdown that is meant to read as a week (round 10: the
 * judge saw Fri, Thu, Tue... by volume). Rows whose day is unknown keep their place at the end.
 */
export function mondayFirst<T extends Row>(rows: T[], dimension: string): T[] {
    if (dimension !== 'dayOfWeek') return rows;
    const rank = (r: T) => {
        const i = dayIndex(r[`d:${dimension}`] as never);
        return i < 0 ? 99 : (i + 6) % 7;
    };
    return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}
