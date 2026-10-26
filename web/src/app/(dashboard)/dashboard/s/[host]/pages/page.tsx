'use client';

import AnalyticsPagesPage from '../../../analytics/pages/page';
import { AnalyticsFrame } from '../../../analytics/AnalyticsFrame';
import { siteHref } from '@/components/shell/nav';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { LegacySitePage } from '../LegacySitePage';

/** Pages (GA4 + GSC merged, DESIGN 5.7). For now: the old GA4 pages report. */
export default function SitePagesPage() {
    const { site } = useCurrentSite();
    const traffic = site ? siteHref(site.host, 'traffic') : '';
    return (
        <LegacySitePage section="pages">
            <AnalyticsFrame activeTab="pages" tabHref={(k) => (k === 'pages' ? (site ? siteHref(site.host, 'pages') : '') : k ? `${traffic}?tab=${k}` : traffic)}>
                <AnalyticsPagesPage />
            </AnalyticsFrame>
        </LegacySitePage>
    );
}
