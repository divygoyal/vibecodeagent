'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
    BarChart3, FileText, Radio, Zap, Users, ChevronDown,
    CalendarDays, X, Filter, GitCompare, Loader2
} from 'lucide-react';
import { useRegistration } from '../layout';
import { usePropertyList, useContainerStatus } from '@/lib/useDashboardData';
import { signIn } from 'next-auth/react';
import { useFilterStore } from '@/stores/analyticsFilterStore';

const TABS = [
    { key: '', label: 'Overview', icon: BarChart3 },
    { key: '/pages', label: 'Pages', icon: FileText },
    { key: '/realtime', label: 'Realtime', icon: Radio },
    { key: '/events', label: 'Events', icon: Zap },
    { key: '/sessions', label: 'Sessions', icon: Users },
];

const RANGES = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: 'Last 7 days' },
    { value: '14d', label: 'Last 14 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '6m', label: 'Last 6 months' },
    { value: '12m', label: 'Last 12 months' },
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
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] hover:border-white/[0.12] transition min-w-[140px]"
            >
                <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-2.5 h-2.5 text-blue-400" />
                </div>
                <span className="truncate max-w-[160px] font-medium">{current?.displayName || current?.property || 'Select property'}</span>
                <ChevronDown className={`w-3 h-3 text-zinc-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 mt-1.5 z-50 bg-[#111116] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/40 py-1.5 min-w-[220px] overflow-hidden">
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

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const { selectedProperty, setSelectedProperty } = useRegistration();
    const [range, setRange] = useState('30d');
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);
    const { filters, clearFilter, clearAll, compareMode, setCompareMode } = useFilterStore();

    useEffect(() => {
        if (properties.length > 0 && !selectedProperty) {
            setSelectedProperty(properties[0].property);
        }
    }, [properties, selectedProperty, setSelectedProperty]);

    // Not connected state
    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                    <BarChart3 className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Connect Google Analytics</h2>
                <p className="text-sm text-zinc-500 text-center max-w-md">
                    Sign in with Google to connect your Analytics properties and see real traffic data, visitor insights, and performance metrics.
                </p>
                <button
                    onClick={() => signIn('google')}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition shadow-lg shadow-blue-500/20"
                >
                    Connect Google
                </button>
            </div>
        );
    }

    const isRealtime = pathname?.includes('/realtime');
    const activeFilterCount = Object.values(filters).filter(arr => arr.length > 0).length;

    return (
        <AnalyticsContext.Provider value={{ selectedProperty, range, setRange, hasGoogleConnection }}>
            <div className="space-y-0">
                {/* ─── Sticky Top Bar ─── */}
                <div className="sticky top-0 z-20 -mx-6 px-6 pb-0" style={{ background: 'linear-gradient(180deg, #09090b 0%, #09090b 92%, transparent 100%)' }}>
                    {/* Row 1: Property & Date Range & Controls */}
                    <div className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-bold text-white tracking-tight">Analytics</h1>
                            {/* Property selector (custom dropdown) */}
                            {properties.length > 0 && (
                                <PropertyDropdown
                                    properties={properties}
                                    value={selectedProperty}
                                    onChange={setSelectedProperty}
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Compare mode */}
                            <button
                                onClick={() => setCompareMode(!compareMode)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition ${
                                    compareMode
                                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        : 'bg-white/[0.03] border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1]'
                                }`}
                                title="Compare with previous period"
                            >
                                <GitCompare className="w-3 h-3" />
                                Compare
                            </button>

                            {/* Date range */}
                            {!isRealtime && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition"
                                    >
                                        <CalendarDays className="w-3.5 h-3.5" />
                                        {RANGES.find(r => r.value === range)?.label || 'Last 30 days'}
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showRangeDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowRangeDropdown(false)} />
                                            <div className="absolute right-0 mt-1 z-50 bg-[#0c0c10] border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[160px]">
                                                {RANGES.map(r => (
                                                    <button
                                                        key={r.value}
                                                        onClick={() => { setRange(r.value); setShowRangeDropdown(false); }}
                                                        className={`w-full text-left px-4 py-2 text-[11px] transition ${
                                                            range === r.value ? 'text-blue-400 bg-blue-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                        }`}
                                                    >
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Row 2: Tabs */}
                    <div className="flex items-center gap-0 -mb-px border-b border-white/[0.06]">
                        {TABS.map(tab => {
                            const href = `/dashboard/analytics${tab.key}`;
                            const isActive = tab.key === ''
                                ? pathname === '/dashboard/analytics'
                                : pathname === href;
                            return (
                                <Link
                                    key={tab.key}
                                    href={href}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
                                        isActive
                                            ? 'text-blue-400 border-blue-400'
                                            : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-white/[0.1]'
                                    }`}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                    {tab.key === '/realtime' && (
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

                {/* ─── Active Global Filters Bar ─── */}
                <AnimatePresence>
                    {activeFilterCount > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center gap-2 pt-4 pb-1 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                                    <Filter className="w-3 h-3" />
                                    Filters
                                </div>
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
                <div className="pt-5">
                    {(propsLoading || containerLoading) ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                        </div>
                    ) : children}
                </div>
            </div>
        </AnalyticsContext.Provider>
    );
}
