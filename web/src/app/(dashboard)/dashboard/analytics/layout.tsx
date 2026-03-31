'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
    BarChart3, FileText, Radio, Zap, Users, ChevronDown,
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

// ─── Custom Property Dropdown ───
function PropertyDropdown({ properties, value, onChange }: { properties: any[]; value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const current = properties.find((p: any) => p.property === value);
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 text-[11px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] hover:border-white/[0.12] transition min-w-0 sm:min-w-[140px]"
            >
                <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-2.5 h-2.5 text-blue-400" />
                </div>
                <span className="truncate max-w-[80px] sm:max-w-[160px] font-medium">{current?.displayName || current?.property || 'Select property'}</span>
                <ChevronDown className={`w-3 h-3 text-zinc-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 mt-1.5 z-50 bg-[#0a0a0f] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/40 py-1.5 min-w-[220px] overflow-hidden">
                        <div className="px-3 pb-1.5 pt-0.5">
                            <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">Properties</span>
                        </div>
                        {properties.map((p: any) => (
                            <button
                                key={p.property}
                                onClick={() => { onChange(p.property); setOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2.5 transition ${
                                    value === p.property
                                        ? 'text-blue-400 bg-blue-500/[0.08]'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                    value === p.property ? 'bg-blue-500/20' : 'bg-white/[0.04]'
                                }`}>
                                    <BarChart3 className="w-3 h-3" />
                                </div>
                                <span className="truncate font-medium">{p.displayName || p.property}</span>
                                {value === p.property && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

const ShareDashboardModal = dynamic(() => import('@/components/ShareDashboardModal'), { ssr: false });

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const { selectedProperty, setSelectedProperty, range, setRange } = useRegistration();
    const { filters, clearFilter, clearAll, compareMode, setCompareMode, advancedFilters, removeAdvancedFilter, clearAdvancedFilters } = useFilterStore();
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
            <div className="space-y-0 overflow-hidden">
                {/* ─── Sticky Top Bar ─── */}
                <div className="sticky top-0 z-20 -mx-6 px-6 pb-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #000000 0%, #000000 92%, transparent 100%)' }}>
                    {/* Row 1: Property & Date Range & Controls */}
                    <div className="flex items-center justify-between py-1.5 sm:py-2 overflow-hidden">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight shrink-0 truncate">Analytics</h1>
                            {/* Property selector (custom dropdown) */}
                            {properties.length > 0 && (
                                <div className="min-w-0 w-auto max-w-[120px] sm:max-w-[200px]">
                                    <PropertyDropdown
                                        properties={properties}
                                        value={selectedProperty}
                                        onChange={setSelectedProperty}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {/* Advanced Filter Builder */}
                            <FilterBuilder />

                            {/* Export dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setExportOpen(!exportOpen)}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1] transition"
                                    title="Export data"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                                {exportOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 z-50 bg-[#0a0a0f] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[160px]">
                                            <button
                                                onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-analytics')); setExportOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] transition"
                                            >
                                                Export CSV
                                            </button>
                                            <button
                                                onClick={() => { window.dispatchEvent(new CustomEvent('trafficclaw:export-zip')); setExportOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] transition"
                                            >
                                                Export ZIP (all data)
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Share */}
                            <button
                                onClick={() => setShareOpen(true)}
                                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1] transition"
                                title="Share dashboard"
                            >
                                <Share2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Compare mode */}
                            <button
                                onClick={() => setCompareMode(!compareMode)}
                                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 text-[11px] rounded-lg border transition ${
                                    compareMode
                                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        : 'bg-white/[0.03] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1]'
                                }`}
                                title="Compare with previous period"
                            >
                                <GitCompare className="w-3 h-3" />
                                <span className="hidden sm:inline">Compare</span>
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Tabs — full-width on mobile, scrollable */}
                    <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0 scrollbar-hide">
                        <div className="flex items-center gap-0 -mb-px border-b border-white/[0.04] min-w-0 w-full sm:w-auto">
                            {TABS.map(tab => {
                                const href = `/dashboard/analytics${tab.key}`;
                                const isActive = tab.key === ''
                                    ? pathname === '/dashboard/analytics'
                                    : pathname === href;
                                return (
                                    <Link
                                        key={tab.key}
                                        href={href}
                                        className={`flex items-center justify-center gap-1.5 sm:gap-2 flex-none px-2 sm:px-3 py-2 sm:py-2 min-h-[36px] sm:min-h-0 text-xs sm:text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                                            isActive
                                                ? 'text-white border-white'
                                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                                        }`}
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
                                            onClick={() => clearFilter(dim as any)}
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
