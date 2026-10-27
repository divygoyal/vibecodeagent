/**
 * Which optional columns the board shows. A column that is empty for every visible row is
 * dropped instead of repeating "No trend" or a blank cell down the page (round 2, critique #9).
 * Pure, so it is unit-tested (tests/leaderboardRefresh.test.mjs) and shared by the public board
 * and the owner's one-row preview.
 */
import type { BoardRow, BoardTab } from './types';

export interface BoardColumns {
    trend: boolean;
    openTo: boolean;
}

/** True when a row's sparkline has at least two real points (what Sparkline needs to draw a line). */
export function hasTrend(row: Pick<BoardRow, 'spark'>): boolean {
    return Boolean(row.spark && row.spark.values.filter((v) => v !== null).length >= 2);
}

/** True when the Open to cell has something to show: an offer the owner turned on, or ad slots with a price. */
export function hasOffer(row: Pick<BoardRow, 'open_to' | 'min_slot_price_cents' | 'ad_slot_count'>): boolean {
    return row.open_to.length > 0 || (row.min_slot_price_cents !== null && row.ad_slot_count > 0);
}

/**
 * Columns for a set of rows. The "Open to offers" tab always keeps its column (that is what the tab is
 * about; with no rows it shows its own empty state instead of a table).
 */
export function boardColumns(rows: Array<Pick<BoardRow, 'spark' | 'open_to' | 'min_slot_price_cents' | 'ad_slot_count'>>, tab?: BoardTab): BoardColumns {
    return {
        trend: rows.some(hasTrend),
        openTo: tab === 'offers' || rows.some(hasOffer),
    };
}
