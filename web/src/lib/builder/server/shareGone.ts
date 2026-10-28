import { getPublicRow, isShareToken } from './store';

/**
 * True when a public dashboard token does not exist (malformed, deleted or unshared), so /view/<token> and
 * /embed/d/<token> can answer 404 instead of 200 (round 7 audit #19). An admin outage is not "gone": the page then
 * loads and says "Could not load this dashboard". Server only.
 */
export async function shareGone(token: string): Promise<boolean> {
    if (!isShareToken(token)) return true;
    try {
        return (await getPublicRow(token, false)) === null;
    } catch {
        return false;
    }
}
