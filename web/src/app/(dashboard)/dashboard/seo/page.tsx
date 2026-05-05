'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

import DemoModeBanner from '@/components/DemoModeBanner';
import EmptyState, { ConnectGoogleState } from '@/components/EmptyState';
import KeywordDetailDrawer from '@/components/KeywordDetailDrawer';
import PageDetailDrawer from '@/components/PageDetailDrawer';
import { useRegistration } from '../layout';
import { useContainerStatus, useSeoData, useSiteList } from '@/lib/useDashboardData';
import { DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { exportSeoData } from '@/lib/exportUtils';

import SeoHeader from '@/components/seo/SeoHeader';
import SeoKpiGrid, { type SeoKpis } from '@/components/seo/SeoKpiGrid';
import SeoTrendPanel, { type SeoTrendPoint } from '@/components/seo/SeoTrendPanel';
import SeoQueriesPagesPanel, { type SeoQuery, type SeoPageRow } from '@/components/seo/SeoQueriesPagesPanel';
import SeoMovementPanel from '@/components/seo/SeoMovementPanel';
import SeoIssuesPanel from '@/components/seo/SeoIssuesPanel';
import SeoPageHealthPanel from '@/components/seo/SeoPageHealthPanel';
import { type SeoRecommendation } from '@/components/seo/SeoInsightsList';

interface Site {
    siteUrl: string;
}

export default function SEOPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const typedSites = sites as Site[];
    // Workspace selection is owned by /dashboard/setup; SEO page just reads it.
    const { selectedSite, range, isDemoWorkspace, demoDomainLabel } = useRegistration();

    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

    const activeSite = isDemoWorkspace ? DEMO_SITE_URL : selectedSite;

    const { data: seoData, isLoading, isError } = useSeoData(
        'all',
        activeSite,
        hasGoogleConnection && (isDemoWorkspace || !!activeSite),
        range,
        isDemoWorkspace,
    );

    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <ConnectGoogleState feature="Search Console data and keyword rankings" />
            </div>
        );
    }

    if ((isLoading || containerLoading) && !seoData) {
        return (
            <div className="min-h-[60vh]">
                <EmptyState variant="loading" title="Loading SEO data…" description="Fetching your Search Console rankings" />
            </div>
        );
    }

    if (isError && !seoData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold text-white mb-2">Couldn&apos;t load SEO data</h2>
                    <p className="text-sm text-zinc-400 mb-1">
                        The selected property may not be accessible or doesn&apos;t exist in your Search Console.
                    </p>
                    <p className="text-xs text-zinc-600">
                        Error: {isError?.message || isError?.info?.error || 'Server returned 502'}
                    </p>
                </div>

                {/* Switch workspace to pick a different property */}
                <Link
                    href="/dashboard/setup"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#7AD9DA] bg-[#14C4E1]/14 hover:bg-[#14C4E1]/22 border border-[#14C4E1]/22 rounded-xl transition-colors"
                >
                    Switch workspace →
                </Link>

                <button
                    onClick={() => signIn('google')}
                    className="text-xs text-emerald-400 hover:underline"
                >
                    Or re-connect your Google account →
                </button>
            </div>
        );
    }

    const kpis = (seoData?.kpis as SeoKpis | undefined) ?? null;
    const queries = (Array.isArray(seoData?.queries) ? seoData.queries : []) as SeoQuery[];
    const pages = (Array.isArray(seoData?.pages) ? seoData.pages : []) as SeoPageRow[];
    const recommendations = (Array.isArray(seoData?.recommendations) ? seoData.recommendations : []) as SeoRecommendation[];
    const trend = (Array.isArray(seoData?.trend) ? seoData.trend : []) as SeoTrendPoint[];

    return (
        <div className="space-y-6">
            {isDemoWorkspace ? (
                <DemoModeBanner
                    description="You're viewing demo data because this account does not have any Google Analytics or Search Console properties yet."
                    secondaryDescription={`TrafficClaw is using ${demoDomainLabel} as a safe demo workspace until you connect your own Google data.`}
                />
            ) : null}

            {/* Missing-source banner — SEO needs a Search Console site. */}
            {!isDemoWorkspace && hasGoogleConnection && !selectedSite && typedSites.length > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 text-[12.5px] text-amber-100/90 leading-relaxed">
                        <span className="font-semibold text-amber-200">SEO features need a Search Console site.</span>{' '}
                        Pick one to see queries, pages, and rankings.{' '}
                        <Link href="/dashboard/setup" className="underline font-semibold hover:text-amber-50">
                            Pick one now →
                        </Link>
                    </div>
                </div>
            ) : null}

            <SeoHeader
                siteUrl={activeSite || ''}
                isDemo={isDemoWorkspace}
                canExport={!!seoData}
                onExport={() => exportSeoData(seoData)}
            />

            {kpis ? <SeoKpiGrid kpis={kpis} /> : null}

            <SeoTrendPanel trend={trend} recommendations={recommendations} />

            <SeoQueriesPagesPanel
                queries={queries}
                pages={pages}
                onSelectKeyword={setSelectedKeyword}
                onSelectPage={setSelectedPageUrl}
            />

            <SeoMovementPanel
                activeSite={activeSite || null}
                onSelectKeyword={setSelectedKeyword}
            />

            <SeoIssuesPanel
                activeSite={activeSite || null}
                onSelectKeyword={setSelectedKeyword}
            />

            <SeoPageHealthPanel suggestedPages={pages.slice(0, 4).map(p => p.page)} />

            <KeywordDetailDrawer
                isOpen={!!selectedKeyword}
                onClose={() => setSelectedKeyword(null)}
                keyword={selectedKeyword}
                siteUrl={activeSite || null}
            />
            <PageDetailDrawer
                isOpen={!!selectedPageUrl}
                onClose={() => setSelectedPageUrl(null)}
                pageUrl={selectedPageUrl}
                siteUrl={activeSite || null}
            />
        </div>
    );
}
