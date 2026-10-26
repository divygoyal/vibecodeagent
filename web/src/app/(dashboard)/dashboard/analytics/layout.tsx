'use client';

import { LegacySiteRedirect } from '@/components/shell/LegacySiteRedirect';

function tabFromPath(pathname: string) {
    const sub = pathname.replace(/^\/dashboard\/analytics\/?/, '').split('/')[0];
    if (sub === 'pages') return { section: 'pages' as const };
    return sub ? { tab: sub } : {};
}

/**
 * /dashboard/analytics/* moved to /dashboard/s/<host>/traffic?tab=<sub>
 * (/pages to /dashboard/s/<host>/pages). The Traffic page maps the old sub-page
 * names (goals -> events, sessions -> sources, performance -> the audit).
 * Waits for the user's own saved site; no site -> Portfolio. Never shows a demo site.
 */
export default function AnalyticsLegacyLayout() {
    return <LegacySiteRedirect section="traffic" tabFromPath={tabFromPath} />;
}
