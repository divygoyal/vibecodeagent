'use client';

import dynamic from 'next/dynamic';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect } from 'react';
import { ArrowUpDown, BarChart3, FileSearch, Layers, Target } from 'lucide-react';

import { Tabs } from '@/components/ui/Tabs';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { SiteHeader } from '../SiteHeader';
import { AskButton, SourceMissing } from '../SiteStates';
import { useSite } from '../useSiteData';
import { useTabParam } from '../useTabParam';
import { DIMS, PerformanceTab } from './PerformanceTab';

const loading = () => <PageSkeleton />;
const OpportunitiesTab = dynamic(() => import('./OtherTabs').then((m) => m.OpportunitiesTab), { loading });
const CannibalizationTab = dynamic(() => import('./OtherTabs').then((m) => m.CannibalizationTab), { loading });
const MoversTab = dynamic(() => import('./OtherTabs').then((m) => m.MoversTab), { loading });
const IndexingTab = dynamic(() => import('./IndexingTab').then((m) => m.IndexingTab), { loading });

export const SEARCH_TABS = ['performance', 'opportunities', 'cannibalization', 'movers', 'indexing'] as const;
type SearchTab = (typeof SEARCH_TABS)[number];

const ITEMS = [
    { value: 'performance' as const, label: 'Performance', icon: BarChart3 },
    { value: 'opportunities' as const, label: 'Opportunities', icon: Target },
    { value: 'cannibalization' as const, label: 'Cannibalization', icon: Layers },
    { value: 'movers' as const, label: 'Winners & losers', icon: ArrowUpDown },
    { value: 'indexing' as const, label: 'Indexing', icon: FileSearch },
];

const ALIASES: Record<string, SearchTab> = { 'winners-losers': 'movers', winners: 'movers', losers: 'movers', inspect: 'indexing', sitemaps: 'indexing' };

/** Search (GSC), DESIGN 5.5. `?tab=queries|pages|countries|devices|appearance|dates` opens Performance on that table. */
export function SearchPage() {
    const site = useSite();
    const [tab, setTab] = useTabParam(SEARCH_TABS, { aliases: ALIASES });
    const [params, setParams] = useQueryStates({ tab: parseAsString, dim: parseAsString }, { history: 'replace', shallow: true, scroll: false });
    useEffect(() => {
        if (params.tab && (DIMS as readonly string[]).includes(params.tab)) void setParams({ tab: null, dim: params.tab === 'queries' ? null : params.tab });
    }, [params.tab, setParams]);

    const content: Record<SearchTab, React.ReactNode> = {
        performance: <PerformanceTab />,
        opportunities: <OpportunitiesTab />,
        cannibalization: <CannibalizationTab />,
        movers: <MoversTab />,
        indexing: <IndexingTab />,
    };
    return (
        <div className="flex flex-col">
            <SiteHeader
                section="Search"
                search
                source={!site.hasGsc ? 'Search Console · not connected' : site.site?.gscKind === 'domain' ? 'Search Console · domain property' : 'Search Console · URL-prefix property'}
                actions={site.hasGsc ? <AskButton prompt={`How is Google Search doing for ${site.siteHost ?? site.label}? What are the biggest search opportunities right now?`} site={{ ga4: site.ga4, gsc: site.gsc }} from="seo:overview" /> : undefined}
                tabs={site.hasGsc ? <Tabs<SearchTab> ariaLabel="Search reports" items={ITEMS} value={tab} onValueChange={setTab} panelIdPrefix="search" /> : undefined}
            />
            {!site.hasGsc ? <SourceMissing source="gsc" variant="page" /> : (
                <div role="tabpanel" id={`search-${tab}`} aria-label={ITEMS.find((i) => i.value === tab)?.label}>{content[tab]}</div>
            )}
        </div>
    );
}
