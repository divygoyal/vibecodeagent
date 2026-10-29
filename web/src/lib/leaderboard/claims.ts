/**
 * What the leaderboard may say about verification, in one place. The facts (admin/leaderboard_v3.py, leaderboard_core.py):
 * Search Console proves the owner owns the site (verified owner or full user of the property); visitor numbers are Google
 * Analytics 4 active users (the "users" column); clicks and impressions are Search Console. Search Console has no visitors,
 * so no copy may say visitor numbers are confirmed, verified or checked through Search Console.
 */

/** The short line for cards and badges. */
export const VERIFICATION_CLAIM = 'Ownership verified in Google Search Console · visitors from Google Analytics';

/** The same fact as a sentence for descriptions and tooltips. */
export const VERIFICATION_SENTENCE = 'Owners are verified in Google Search Console; visitor numbers come from Google Analytics.';

/** Tooltip of the traffic badge: the visitor number, then where it comes from and what was verified. */
export function trafficBadgeTitle(visitors: string, brand: string): string {
    return `Verified traffic: ${visitors} visitors in the last 28 days, from Google Analytics. Site ownership verified in Google Search Console on ${brand}`;
}
