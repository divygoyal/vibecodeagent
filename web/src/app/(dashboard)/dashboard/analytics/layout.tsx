'use client';

import { LegacySiteRedirect } from '@/components/shell/LegacySiteRedirect';

// The analytics sub-pages import their context from '../layout'.
export { AnalyticsContext, useAnalyticsContext } from './AnalyticsFrame';

function tabFromPath(pathname: string) {
    const sub = pathname.replace(/^\/dashboard\/analytics\/?/, '').split('/')[0];
    if (sub === 'pages') return { section: 'pages' as const };
    return sub ? { tab: sub } : {};
}

/**
 * /dashboard/analytics/* moved to /dashboard/s/<host>/traffic?tab=<sub>
 * (and /pages to /dashboard/s/<host>/pages). The old page files stay as the
 * content of the new routes until they are rebuilt.
 */
export default function AnalyticsLegacyLayout() {
    return <LegacySiteRedirect section="traffic" tabFromPath={tabFromPath} />;
}
