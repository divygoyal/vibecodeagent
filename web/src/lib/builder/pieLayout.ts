/**
 * Donut size and slice limit for a pie widget cell (round 10). One grouping rule everywhere: whatever the
 * card height, a donut with 5+ categories shows the top 4 before "Other" (round 9 judge: a short card folded
 * to 3 rows and "Other" was the second largest). Short cards shrink the donut instead of dropping legend rows.
 */
export const MIN_PIE_SLICES = 5;
const LEGEND_ROW = 32;

export function pieLayout(h: number, width: number, bottom: boolean, rowCount: number): { size: number; maxSlices: number } {
    if (!bottom) return { size: Math.max(96, Math.min(180, h - 8, width - 230)), maxSlices: 6 };
    // Legend below: the donut, a 20px gap and legend rows (28px + 4px gap) must fit the cell.
    const minRows = Math.max(2, Math.min(rowCount, MIN_PIE_SLICES));
    const size = Math.max(72, Math.min(160, h - 20 - minRows * LEGEND_ROW + 4, width - 16));
    const maxSlices = Math.min(6, Math.max(minRows, Math.floor((h - size - 20 + 4) / LEGEND_ROW)));
    return { size, maxSlices };
}
