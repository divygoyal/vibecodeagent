/**
 * Client-side table sort (Table.tsx). Pure, so tests/tableSort.test.mjs runs it on plain Node.
 * Empty values (null, undefined, NaN, '') always go last, in both directions (round 4 audit #1:
 * sorting "high to low" used to reverse the whole list and put every "–" row on top).
 */
export type SortDir = 'asc' | 'desc';
export type SortValue = number | string | null | undefined;

function isEmpty(v: SortValue): boolean {
    return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

/** Ascending compare of two non-empty values: numbers numerically, text naturally ("Page 2" < "Page 10"). */
export function compareValues(a: Exclude<SortValue, null | undefined>, b: Exclude<SortValue, null | undefined>): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/** A sorted copy of `rows`. Stable: equal values keep their input order in both directions. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: SortDir): T[] {
    const mult = dir === 'desc' ? -1 : 1;
    const keyed = rows.map((row, i) => ({ row, i, v: value(row) }));
    keyed.sort((x, y) => {
        const ex = isEmpty(x.v);
        const ey = isEmpty(y.v);
        if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1;
        const c = compareValues(x.v as number | string, y.v as number | string);
        return c === 0 ? x.i - y.i : c * mult;
    });
    return keyed.map((k) => k.row);
}
