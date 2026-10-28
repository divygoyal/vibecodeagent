'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Activity, BarChart3, FileText, GitBranch, Globe2, Radio, Route, Share2, Target } from 'lucide-react';

import { fmtDateRange } from '@/lib/format';
import { Tabs } from '@/components/ui/Tabs';
import { siteHref } from '@/components/shell/nav';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { FilterBar, SiteFilterProvider } from '../filters/SiteFilters';
import { COHORT_MODES, cohortSpan, cohortUnit, type CohortMode } from '../lib/cohorts';
import { SiteHeader } from '../SiteHeader';
import { AskButton, SourceMissing } from '../SiteStates';
import { useSite } from '../useSiteData';
import { useTabParam } from '../useTabParam';
import { TrafficOverviewTab } from './OverviewTab';
import { LiveCount } from './RealtimeTab';

const loading = () => <PageSkeleton />;
const PagesTab = dynamic(() => import('./TablesTabs').then((m) => m.TrafficPagesTab), { loading });
const SourcesTab = dynamic(() => import('./TablesTabs').then((m) => m.TrafficSourcesTab), { loading });
const AudienceTab = dynamic(() => import('./TablesTabs').then((m) => m.TrafficAudienceTab), { loading });
const RealtimeTab = dynamic(() => import('./RealtimeTab').then((m) => m.TrafficRealtimeTab), { loading });
const EventsTab = dynamic(() => import('./MoreTabs').then((m) => m.EventsTab), { loading });
const FunnelsTab = dynamic(() => import('./GoalsFunnels').then((m) => m.FunnelsTab), { loading });
const JourneysTab = dynamic(() => import('./JourneysTab').then((m) => m.JourneysTab), { loading });
const RetentionTab = dynamic(() => import('./MoreTabs').then((m) => m.RetentionTab), { loading });

export const TRAFFIC_TABS = ['overview', 'pages', 'sources', 'audience', 'realtime', 'events', 'funnels', 'journeys', 'retention'] as const;
type TrafficTab = (typeof TRAFFIC_TABS)[number];

/** Old /dashboard/analytics/<sub> names (the middleware sends them as ?tab=<sub>). */
const ALIASES: Record<string, TrafficTab> = { goals: 'events', sessions: 'sources', main: 'overview', geo: 'audience', devices: 'audience' };

/** Tabs whose GA4 reports take the click-to-filter filters. */
const FILTERED_TABS = new Set<TrafficTab>(['overview', 'pages', 'sources', 'audience', 'events']);

const ITEMS: { value: TrafficTab; label: string; icon: typeof BarChart3 }[] = [
    { value: 'overview', label: 'Overview', icon: BarChart3 },
    { value: 'pages', label: 'Pages', icon: FileText },
    { value: 'sources', label: 'Sources', icon: Share2 },
    { value: 'audience', label: 'Audience', icon: Globe2 },
    { value: 'realtime', label: 'Realtime', icon: Radio },
    { value: 'events', label: 'Events & goals', icon: Target },
    { value: 'funnels', label: 'Funnels', icon: GitBranch },
    { value: 'journeys', label: 'Journeys', icon: Route },
    { value: 'retention', label: 'Retention', icon: Activity },
];

function retentionNote(mode: CohortMode): string {
    const span = cohortSpan(mode);
    return `Cohorts of new users, ${span.count} ${cohortUnit(mode, span.count)}: ${fmtDateRange(span.start, span.end)}`;
}

/** Traffic (GA4), DESIGN 5.6. `?tab=` keeps the old analytics sub-page names working. */
export function TrafficPage() {
    const site = useSite();
    const router = useRouter();
    const [tab, setTab] = useTabParam(TRAFFIC_TABS, { aliases: ALIASES });

    // Core Web Vitals (old "Performance" sub-page) now live with the audit.
    const params = useSearchParams();
    const legacyPerformance = params?.get('tab') === 'performance';
    useEffect(() => {
        if (legacyPerformance && site.host) router.replace(`${siteHref(site.host, 'actions')}/audit`);
    }, [legacyPerformance, site.host, router]);

    // Realtime and Retention have their own windows: no date controls there, the subtitle names the window
    // instead (round 5, audit item 17).
    const [cohort] = useTabParam(COHORT_MODES, { name: 'cohort' });
    const ownWindow = tab === 'realtime' || tab === 'retention';
    const rangeNote = tab === 'realtime' ? 'Last 30 minutes · updates every 30 s' : tab === 'retention' ? retentionNote(cohort) : undefined;

    const content: Record<TrafficTab, React.ReactNode> = {
        overview: <TrafficOverviewTab />,
        pages: <PagesTab />,
        sources: <SourcesTab />,
        audience: <AudienceTab />,
        realtime: <RealtimeTab />,
        events: <EventsTab />,
        funnels: <FunnelsTab />,
        journeys: <JourneysTab />,
        retention: <RetentionTab />,
    };

    return (
        <SiteFilterProvider>
            <div className="flex flex-col">
                <SiteHeader
                    section="Traffic"
                    source={site.site?.ga4Name ? `Google Analytics 4 · ${site.site.ga4Name}` : 'Google Analytics 4'}
                    noRange={ownWindow}
                    rangeNote={rangeNote}
                    actions={site.hasGa4 ? (
                        <>
                            {tab === 'realtime' ? null : <LiveCount />}
                            <AskButton prompt={`How is traffic on ${site.siteHost ?? site.label} doing? Which channels and pages changed most?`} site={{ ga4: site.ga4, gsc: site.gsc }} label="Ask AI" from="site:traffic" />
                        </>
                    ) : undefined}
                    tabs={site.hasGa4 ? <Tabs<TrafficTab> ariaLabel="Traffic reports" items={ITEMS} value={tab} onValueChange={setTab} panelIdPrefix="traffic" /> : undefined}
                />
                {!site.hasGa4 ? <SourceMissing source="ga4" variant="page" /> : legacyPerformance ? <PageSkeleton /> : (
                    <div role="tabpanel" id={`traffic-${tab}`} aria-label={ITEMS.find((i) => i.value === tab)?.label}>
                        <FilterBar applies={FILTERED_TABS.has(tab)} hint={tab === 'overview'} />
                        {content[tab]}
                    </div>
                )}
            </div>
        </SiteFilterProvider>
    );
}
