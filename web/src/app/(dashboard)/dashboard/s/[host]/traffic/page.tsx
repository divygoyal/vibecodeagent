'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';

import { ANALYTICS_TABS, AnalyticsFrame, type AnalyticsTab } from '../../../analytics/AnalyticsFrame';
import { siteHref } from '@/components/shell/nav';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { LegacySitePage } from '../LegacySitePage';

const loading = () => <PageSkeleton />;
const TAB_CONTENT: Record<Exclude<AnalyticsTab, 'pages'>, ComponentType> = {
    '': dynamic(() => import('../../../analytics/page'), { loading }),
    realtime: dynamic(() => import('../../../analytics/realtime/page'), { loading }),
    performance: dynamic(() => import('../../../analytics/performance/page'), { loading }),
    goals: dynamic(() => import('../../../analytics/goals/page'), { loading }),
    funnels: dynamic(() => import('../../../analytics/funnels/page'), { loading }),
    retention: dynamic(() => import('../../../analytics/retention/page'), { loading }),
    journeys: dynamic(() => import('../../../analytics/journeys/page'), { loading }),
    sessions: dynamic(() => import('../../../analytics/sessions/page'), { loading }),
    events: dynamic(() => import('../../../analytics/events/page'), { loading }),
};

/** Traffic (GA4), ?tab=realtime|performance|goals|funnels|retention|journeys|sessions|events. Old content for now. */
export default function SiteTrafficPage() {
    const params = useSearchParams();
    const { site } = useCurrentSite();
    const raw = params?.get('tab') ?? '';
    const tab = (ANALYTICS_TABS.some((t) => t.key === raw) && raw !== 'pages' ? raw : '') as Exclude<AnalyticsTab, 'pages'>;
    const Content = TAB_CONTENT[tab];
    const traffic = site ? siteHref(site.host, 'traffic') : '';
    const pages = site ? siteHref(site.host, 'pages') : '';
    return (
        <LegacySitePage section="traffic">
            <AnalyticsFrame activeTab={tab} tabHref={(k) => (k === 'pages' ? pages : k ? `${traffic}?tab=${k}` : traffic)}>
                <Content />
            </AnalyticsFrame>
        </LegacySitePage>
    );
}
