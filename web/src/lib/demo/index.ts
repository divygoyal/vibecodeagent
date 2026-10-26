/**
 * Demo data mode: deterministic, realistic Google Analytics 4 and Search
 * Console data for local development, screenshots and (later) a public
 * read-only demo. Pure functions, seeded randomness, no network.
 *
 * Turn it on for a dev server with TC_DEMO_DATA=1 (scripts/dev/up.sh does
 * this). instrumentation.ts then installs the fetch shim in fetchShim.ts.
 * Production is unaffected: nothing here runs unless that flag is set.
 *
 * The generic entry points answer arbitrary requests:
 *   demoRunReport(propertyId, gaRunReportBody)
 *   demoRunRealtimeReport(propertyId, gaRealtimeBody)
 *   demoSearchAnalytics(siteUrl, gscQueryBody)
 */

export {
    getDemoSites,
    getDemoSite,
    getDemoAccounts,
    getDemoAccount,
    findSiteByPropertyId,
    findSiteBySiteUrl,
    demoAccessToken,
    demoRefreshToken,
    accountKeyFromToken,
    DEMO_DEFAULT_ACCOUNT,
    type DemoSite,
    type DemoShape,
    type DemoGoogleAccount,
} from './catalog';
export { demoRunReport, demoRunRealtimeReport, demoMetadata, realtimeActiveUsers, DemoApiError, type GaReportRequest } from './ga4';
export { demoSearchAnalytics, demoListSites, demoGetSite, demoSitemaps, demoUrlInspection, ctrForPosition, type GscQueryRequest } from './gsc';
export { demoAccountSummaries, demoPropertyList, demoProperty, demoDataStreams } from './gaAdmin';
export { demoPagespeed, demoCruxRecord } from './pagespeed';
export { demoGoogleFetch, installDemoGoogleFetch } from './fetchShim';

/** True when the server was started with TC_DEMO_DATA=1. */
export function isDemoDataEnabled(): boolean {
    return process.env.TC_DEMO_DATA === '1';
}
