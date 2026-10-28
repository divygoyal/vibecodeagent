/**
 * Numbers for the link-preview card of a shared dashboard (/view/<token>/opengraph-image). Server only.
 * Runs the dashboard's first KPI widgets through the same engine path the public page uses (the owner's Google access,
 * the engine's own cache), keeps the result for a while, and gives up after 2.5 s: a slow or failing query means the
 * card is drawn with the title only (the query keeps running and fills the cache for the next request).
 * A password-protected dashboard never gets numbers.
 */
import { publicControlsFromQuery } from '../publicDoc';
import { shareCardNumbers, pickKpiWidgetIds, within, type ShareCardNumbers } from '../shareCard';
import type { AdminDashboardRow } from './store';
import type { DashboardRecord } from '../types';
import { evaluateDoc, ownerDeps } from './service';
import { singleFlight } from './cache';

/** How long the card waits for numbers before it is drawn without them. */
export const CARD_DATA_BUDGET_MS = 2500;
const OK_TTL_MS = 10 * 60_000;
const FAIL_TTL_MS = 60_000;
const MAX_ENTRIES = 300;

const kept = new Map<string, { at: number; numbers: ShareCardNumbers | null }>();

function keep(key: string, numbers: ShareCardNumbers | null): void {
    if (kept.size >= MAX_ENTRIES) kept.delete(kept.keys().next().value as string);
    kept.set(key, { at: Date.now(), numbers });
}

/** Drops everything kept (tests). */
export function clearShareCardCache(): void {
    kept.clear();
}

/**
 * Keeps and shares one load per key and waits at most `budgetMs` for it: the kept result (10 minutes, 1 minute for a
 * failure) when there is one, else the numbers, else null once the budget is over or the load failed.
 */
export async function cachedCardNumbers(key: string, load: () => Promise<ShareCardNumbers | null>, budgetMs: number = CARD_DATA_BUDGET_MS): Promise<ShareCardNumbers | null> {
    const hit = kept.get(key);
    if (hit && Date.now() - hit.at < (hit.numbers ? OK_TTL_MS : FAIL_TTL_MS)) return hit.numbers;
    const run = singleFlight(`sharecard:${key}`, () =>
        load().then(
            (n) => { keep(key, n); return n; },
            (err) => { console.error('[share card] numbers failed', err instanceof Error ? err.message : err); keep(key, null); return null; },
        ),
    );
    return within(run, budgetMs);
}

async function loadDashboard(row: AdminDashboardRow, rec: DashboardRecord): Promise<ShareCardNumbers | null> {
    const widgetIds = pickKpiWidgetIds(rec.doc);
    if (!widgetIds.length || !row.ownerIdentifier) return null;
    const controls = publicControlsFromQuery(new URLSearchParams(), rec.doc, rec.share);
    const res = await evaluateDoc(rec.doc, controls, ownerDeps(row.ownerIdentifier, 'public'), { pageId: controls.pageId, widgetIds });
    return shareCardNumbers(rec.doc, res, controls);
}

/**
 * Two or three KPI numbers for the card, or null (protected, no KPI widget, slow, failed). `budgetMs` is for tests.
 * The record id and revision key the cache, so an edited dashboard shows its new numbers.
 */
export async function shareCardData(row: AdminDashboardRow, rec: DashboardRecord, budgetMs: number = CARD_DATA_BUDGET_MS): Promise<ShareCardNumbers | null> {
    if (rec.share.hasPassword) return null;
    return cachedCardNumbers(`${rec.id}:${rec.rev}`, () => loadDashboard(row, rec), budgetMs);
}
