'use client';

import AnalyticsMainPage from '../../analytics/page';
import { AnalyticsFrame } from '../../analytics/AnalyticsFrame';
import { siteHref } from '@/components/shell/nav';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { LegacySitePage } from './LegacySitePage';

/** Site overview (DESIGN 5.4). For now: the old GA4 overview content. */
export default function SiteOverviewPage() {
    const { site } = useCurrentSite();
    const base = site ? siteHref(site.host, 'traffic') : '';
    return (
        <LegacySitePage section="">
            <AnalyticsFrame activeTab="" hideTabs tabHref={(k) => (k ? `${base}?tab=${k}` : base)}>
                <AnalyticsMainPage />
            </AnalyticsFrame>
        </LegacySitePage>
    );
}
