'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
    BarChart3, FileText, Radio, Zap, Users,
    X, Filter, GitCompare, Loader2, Gauge, Target, GitBranch,
    Download, Share2, Activity, Route
} from 'lucide-react';
import dynamic from 'next/dynamic';

import { useRegistration } from '../layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import DemoModeBanner from '@/components/DemoModeBanner';
import { AnalyticsSubpageEmptyState } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { getGa4AvailabilityCopy } from '@/lib/dashboardSelection';
import { useContainerStatus } from '@/lib/useDashboardData';
import { useFilterStore } from '@/stores/analyticsFilterStore';
import { ConnectGoogleState } from '@/components/EmptyState';
import FilterBuilder from '@/components/analytics/FilterBuilder';

const TABS = [
    { key: '', label: 'Main', icon: BarChart3 },
    { key: '/realtime', label: 'Realtime', icon: Radio, pulse: true },
    { key: '/performance', label: 'Performance', icon: Gauge },
    { key: '/goals', label: 'Goals', icon: Target },
    { key: '/funnels', label: 'Funnels', icon: GitBranch },
    { key: '/retention', label: 'Retention', icon: Activity },
    { key: '/journeys', label: 'Journeys', icon: Route },
    { key: '/pages', label: 'Pages', icon: FileText },
    { key: '/sessions', label: 'Sessions', icon: Users },
    { key: '/events', label: 'Events', icon: Zap },
];

// Shared analytics context for sub-pages
export const AnalyticsContext = React.createContext<{
    selectedProperty: string;
    resolvedPropertyId: string;
    selectedSite: string;
    range: string;
    setRange: (r: string) => void;
    hasGoogleConnection: boolean;
    hasGa4Properties: boolean;
    ga4Availability: 'available' | 'site_unmatched' | 'inventory_empty' | 'inventory_error';
    propertyInventoryError: string | null;
    isDemoWorkspace: boolean;
    demoDomainLabel: string;
    openShareDashboard: () => void;
}>({
    selectedProperty: '',
    resolvedPropertyId: '',
    selectedSite: '',
    range: '30d',
    setRange: () => {},
    hasGoogleConnection: false,
    hasGa4Properties: false,
    ga4Availability: 'inventory_empty',
    propertyInventoryError: null,
    isDemoWorkspace: false,
    demoDomainLabel: '',
    openShareDashboard: () => {},
});

export const useAnalyticsContext = () => React.useContext(AnalyticsContext);

const ShareDashboardModal = dynamic(() => import('@/components/ShareDashboardModal'), { ssr: false });

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isMainAnalyticsRoute = pathname === '/dashboard/analytics';
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const {
        resolvedPropertyId,
        resolvedSiteUrl,
        selectedSite,
        range,
        setRange,
        hasGa4Properties,
        ga4Availability,
        propertyInventoryError,
        siteInventoryError,
        propertyInventoryLoading,
        isDemoWorkspace,
        demoDomainLabel,
    } = useRegistration();
    const { filters, clearFilter, clearAll, compareMode, setCompareMode, advancedFilters, removeAdvancedFilter } = useFilterStore();
    const [shareOpen, setShareOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const requiresGa4 = pathname !== '/dashboard/analytics/performance';
    const activeSiteUrl = resolvedSiteUrl || (siteInventoryError ? selectedSite : '');
    const ga4AvailabilityCopy = useMemo(
        () => getGa4AvailabilityCopy(ga4Availability, activeSiteUrl, propertyInventoryError),
        [activeSiteUrl, ga4Availability, propertyInventoryError],
    );

    const simpleFilterCount = useMemo(
        () => Object.values(filters).filter((arr) => arr.length > 0).length,
        [filters],
    );
    const activeFilterCount = simpleFilterCount + advancedFilters.length;
    const showGa4LoadingState = requiresGa4 && propertyInventoryLoading && !resolvedPropertyId && !isDemoWorkspace;
    const showGa4UnavailableState = requiresGa4 && !propertyInventoryLoading && ga4Availability !== 'available' && !isDemoWorkspace;

    // Not connected state
    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="real traffic data, visitor insights, and performance metrics" /></div>;
    }

    return (
        <AnalyticsContext.Provider
            value={{
                selectedProperty: resolvedPropertyId,
                resolvedPropertyId,
                selectedSite: activeSiteUrl,
                range,
                setRange,
                hasGoogleConnection,
                hasGa4Properties,
                ga4Availability,
                propertyInventoryError,
                isDemoWorkspace,
                demoDomainLabel,
                openShareDashboard: () => setShareOpen(true),
            }}
        >
            <div className="space-y-0">
                {/* ─── Sticky Top Bar ─── */}
                <div className="sticky top-0 z-20 -mx-6 px-6 pb-2" style={{ background: 'linear-gradient(180deg, #000000 0%, #000000 88%, transparent 100%)' }}>
                    {/* Single row: Tabs left, Controls right */}
                    <div className="flex items-center rounded-[22px] border border-white/[0.08] bg-[#090b0d]/95 px-2 shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                        {/* Tabs — scrollable */}
                        <div className="flex-1 overflow-x-auto scrollbar-hide min-w-0">
                            <div className="flex items-center gap-0 min-w-0">
                            {TABS.map(tab => {
                                const href = `/dashboard/analytics${tab.key}`;
                                const isActive = tab.key === ''
                                    ? pathname === '/dashboard/analytics'
                                    : pathname === href;
                                return (
                                    <Link
                                        key={tab.key}
                                        href={href}
                                        className={`relative flex items-center justify-center gap-1.5 sm:gap-2 flex-none h-11 px-3 sm:px-4 text-[12px] font-semibold transition-colors whitespace-nowrap ${
                                            isActive
                                                ? 'text-white'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                    >
                                        {isActive ? (
                                            <span className="absolute inset-x-1.5 inset-y-1 rounded-[14px] border border-white/[0.06] bg-white/[0.04]" />
                                        ) : null}
                                        <tab.icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                        <span className="relative z-10">{tab.label}</span>
                                        {'pulse' in tab && tab.pulse && (
                                            <span className="relative z-10 ml-0.5 flex h-1.5 w-1.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                                            </span>
                                        )}
                                        {isActive ? (
                                            <span className="absolute bottom-0 left-4 right-4 h-px rounded-full bg-white" />
                                        ) : null}
                                    </Link>
                                );
                            })}
                            </div>
                        </div>

                        {/* Controls — right side */}
                        {!isMainAnalyticsRoute ? (
                            <div className="ml-3 flex shrink-0 items-center gap-2 border-l border-white/[0.06] pl-3">
                                <FilterBuilder />

                                <div className="relative">
                                    <button
                                        onClick={() => setExportOpen(!exportOpen)}
                                        className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[#0f1216] text-zinc-400 transition hover:border-white/[0.14] hover:bg-[#13171c] hover:text-zinc-200"
                                        title="Export data"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                    </button>
                                    {exportOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                                            <div className="absolute right-0 top-full mt-2 z-50 min-w-[180px] rounded-[18px] border border-white/[0.1] bg-[#090b0d] py-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
                                                <button
                                                    onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-analytics')); setExportOpen(false); }}
                                                    className="w-full px-4 py-2 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04]"
                                                >
                                                    Export CSV
                                                </button>
                                                <button
                                                    onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-zip')); setExportOpen(false); }}
                                                    className="w-full px-4 py-2 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04]"
                                                >
                                                    Export ZIP (all data)
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShareOpen(true)}
                                    className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[#0f1216] text-zinc-400 transition hover:border-white/[0.14] hover:bg-[#13171c] hover:text-zinc-200"
                                    title="Share dashboard"
                                >
                                    <Share2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                    onClick={() => setCompareMode(!compareMode)}
                                    className={`flex h-10 items-center gap-1.5 rounded-[14px] border px-3.5 text-[12px] font-semibold transition ${
                                        compareMode
                                            ? 'border-cyan-500/24 bg-cyan-500/[0.12] text-cyan-300 shadow-[0_10px_28px_rgba(31,190,215,0.12)]'
                                            : 'border-white/[0.08] bg-[#0f1216] text-zinc-400 hover:border-white/[0.14] hover:bg-[#13171c] hover:text-zinc-200'
                                    }`}
                                    title="Compare with previous period"
                                >
                                    <GitCompare className="w-3 h-3" />
                                    <span className="hidden sm:inline">Compare</span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* ─── Active Global Filters Bar ─── */}
                <AnimatePresence>
                    {!isMainAnalyticsRoute && activeFilterCount > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center gap-2 pt-2 pb-1 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                                    <Filter className="w-3 h-3" />
                                    Filters
                                </div>
                                {/* Simple dimension filter pills */}
                                {Object.entries(filters).map(([dim, values]) =>
                                    values.map((val: string) => (
                                        <motion.button
                                            key={`${dim}-${val}`}
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.9, opacity: 0 }}
                                            onClick={() => clearFilter(dim as keyof typeof filters)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/[0.08] border border-blue-500/20 text-blue-400 text-[11px] font-medium hover:bg-blue-500/[0.12] transition group"
                                        >
                                            <span className="capitalize">{dim}:</span> {val}
                                            <X className="w-3 h-3 text-blue-500/50 group-hover:text-blue-300 transition" />
                                        </motion.button>
                                    ))
                                )}
                                {/* Advanced filter pills */}
                                {advancedFilters.map((filter, i) => {
                                    const negative = filter.type === 'not_equals' || filter.type === 'not_contains';
                                    const typeLabel = filter.type === 'equals' ? '=' : filter.type === 'not_equals' ? '!=' : filter.type === 'contains' ? '~' : '!~';
                                    return (
                                        <motion.button
                                            key={`adv-${filter.parameter}-${filter.type}-${filter.value}-${i}`}
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.9, opacity: 0 }}
                                            onClick={() => removeAdvancedFilter(i)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition group border ${
                                                negative
                                                    ? 'bg-red-500/[0.08] border-red-500/20 text-red-400 hover:bg-red-500/[0.12]'
                                                    : 'bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.12]'
                                            }`}
                                        >
                                            <span className="opacity-70 capitalize">{filter.parameter.replace('_', ' ')}</span>
                                            <span className="opacity-50">{typeLabel}</span>
                                            <span>&quot;{filter.value}&quot;</span>
                                            <X className={`w-3 h-3 transition ${
                                                negative
                                                    ? 'text-red-500/50 group-hover:text-red-300'
                                                    : 'text-emerald-500/50 group-hover:text-emerald-300'
                                            }`} />
                                        </motion.button>
                                    );
                                })}
                                <button
                                    onClick={clearAll}
                                    className="text-[10px] text-zinc-600 hover:text-zinc-300 transition ml-1"
                                >
                                    Clear all
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ─── Page content ─── */}
                <div className="pt-2 sm:pt-3">
                    {isDemoWorkspace ? (
                        <div className="pb-3">
                            <DemoModeBanner
                                description="You’re viewing demo data because this Google account does not have any Google Analytics or Search Console properties yet."
                                secondaryDescription={`${demoDomainLabel} is being used as the demo workspace so you can explore the dashboard before connecting your own property.`}
                            />
                        </div>
                    ) : null}
                    {(containerLoading || showGa4LoadingState) ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                        </div>
                    ) : showGa4UnavailableState ? (
                        <AnalyticsSubpageEmptyState
                            title={ga4AvailabilityCopy.title}
                            description={ga4AvailabilityCopy.description}
                        />
                    ) : <ErrorBoundary>{children}</ErrorBoundary>}
                </div>

                {/* Share Modal */}
                <ShareDashboardModal
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    propertyId={resolvedPropertyId}
                />
            </div>
        </AnalyticsContext.Provider>
    );
}
