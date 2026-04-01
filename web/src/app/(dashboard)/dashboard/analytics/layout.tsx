'use client';

import React, { useState, useEffect } from 'react';
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
import { usePropertyList, useContainerStatus } from '@/lib/useDashboardData';
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
    range: string;
    setRange: (r: string) => void;
    hasGoogleConnection: boolean;
}>({
    selectedProperty: '',
    range: '30d',
    setRange: () => {},
    hasGoogleConnection: false,
});

export const useAnalyticsContext = () => React.useContext(AnalyticsContext);

const ShareDashboardModal = dynamic(() => import('@/components/ShareDashboardModal'), { ssr: false });

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const { selectedProperty, setSelectedProperty, range, setRange } = useRegistration();
    const { filters, clearFilter, clearAll, compareMode, setCompareMode, advancedFilters, removeAdvancedFilter } = useFilterStore();
    const [shareOpen, setShareOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);

    useEffect(() => {
        if (properties.length > 0 && !selectedProperty) {
            setSelectedProperty(properties[0].property);
        }
    }, [properties, selectedProperty, setSelectedProperty]);

    // Not connected state
    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="real traffic data, visitor insights, and performance metrics" /></div>;
    }

    const simpleFilterCount = Object.values(filters).filter(arr => arr.length > 0).length;
    const activeFilterCount = simpleFilterCount + advancedFilters.length;

    return (
        <AnalyticsContext.Provider value={{ selectedProperty, range, setRange, hasGoogleConnection }}>
            <div className="space-y-0 analytics-shell">
                {/* ─── Sticky Top Bar ─── */}
                <div className="sticky top-0 z-20 -mx-6 px-6 pb-0 analytics-shell-header">
                    {/* Single row: Tabs left, Controls right */}
                    <div className="analytics-shell-topbar flex items-center gap-2 px-3 sm:px-4">
                        {/* Tabs — scrollable */}
                        <div className="flex-1 overflow-x-auto scrollbar-hide min-w-0">
                            <div className="flex items-center gap-0 -mb-px min-w-0">
                            {TABS.map(tab => {
                                const href = `/dashboard/analytics${tab.key}`;
                                const isActive = tab.key === ''
                                    ? pathname === '/dashboard/analytics'
                                    : pathname === href;
                                return (
                                    <Link
                                        key={tab.key}
                                        href={href}
                                        className={`analytics-shell-tab flex-none whitespace-nowrap ${isActive ? 'is-active' : ''}`}
                                    >
                                        <tab.icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                        {tab.label}
                                        {'pulse' in tab && tab.pulse && (
                                            <span className="relative flex h-1.5 w-1.5 ml-0.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                            </div>
                        </div>

                        {/* Controls — right side */}
                        <div className="flex items-center gap-1.5 shrink-0 py-2 pl-2">
                            <FilterBuilder />

                            <div className="relative">
                                <button
                                    onClick={() => setExportOpen(!exportOpen)}
                                    className="analytics-shell-action w-9 h-9 px-0"
                                    title="Export data"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                                {exportOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                                        <div className="analytics-shell-menu absolute right-0 top-full mt-2 z-50 min-w-[180px] py-1.5">
                                            <button
                                                onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-analytics')); setExportOpen(false); }}
                                                className="w-full px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.04]"
                                            >
                                                Export CSV
                                            </button>
                                            <button
                                                onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-zip')); setExportOpen(false); }}
                                                className="w-full px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.04]"
                                            >
                                                Export ZIP (all data)
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => setShareOpen(true)}
                                className="analytics-shell-action w-9 h-9 px-0"
                                title="Share dashboard"
                            >
                                <Share2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                                onClick={() => setCompareMode(!compareMode)}
                                className={`analytics-shell-action text-[11px] ${compareMode ? 'is-active' : ''}`}
                                title="Compare with previous period"
                            >
                                <GitCompare className="w-3 h-3" />
                                <span className="hidden sm:inline">Compare</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── Active Global Filters Bar ─── */}
                <AnimatePresence>
                    {activeFilterCount > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center gap-2 px-1 pt-3 pb-1.5 flex-wrap">
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
                                            className="analytics-filter-pill group rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300 transition hover:bg-cyan-400/[0.14]"
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
                                            className={`analytics-filter-pill group rounded-full transition ${
                                                negative
                                                    ? 'border-red-400/20 bg-red-500/[0.08] text-red-300 hover:bg-red-500/[0.12]'
                                                    : 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/[0.12]'
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
                <div className="pt-3 sm:pt-4">
                    {(propsLoading || containerLoading) ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                        </div>
                    ) : children}
                </div>

                {/* Share Modal */}
                <ShareDashboardModal
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    propertyId={selectedProperty}
                />
            </div>
        </AnalyticsContext.Provider>
    );
}
