'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3, FileText, Radio, Zap, Users, ChevronDown,
    CalendarDays, Download, RefreshCw, Loader2
} from 'lucide-react';
import { useRegistration } from '../layout';
import { usePropertyList, useContainerStatus } from '@/lib/useDashboardData';
import { signIn } from 'next-auth/react';

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

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const { selectedProperty, setSelectedProperty } = useRegistration();
    const [range, setRange] = useState('30d');
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);

    useEffect(() => {
        if (properties.length > 0 && !selectedProperty) {
            setSelectedProperty(properties[0].property);
        }
    }, [properties, selectedProperty, setSelectedProperty]);

    const currentTab = TABS.find(t =>
        t.key === '' ? pathname === '/dashboard/analytics' : pathname === `/dashboard/analytics${t.key}`
    );

    // Not connected state
    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <BarChart3 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Connect Google Analytics</h2>
                <p className="text-sm text-zinc-500 text-center max-w-md">
                    Sign in with Google to connect your Analytics properties and see real traffic data, visitor insights, and performance metrics.
                </p>
                <button
                    onClick={() => signIn('google')}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black text-sm font-semibold rounded-xl transition"
                >
                    Connect Google
                </button>
            </div>
        );
    }

    const isRealtime = pathname?.includes('/realtime');

    return (
        <AnalyticsContext.Provider value={{ selectedProperty, range, setRange, hasGoogleConnection }}>
            <div className="space-y-0">
                {/* Top Bar: Property selector + Date range + Tabs */}
                <div className="sticky top-0 z-20 bg-[#09090b] border-b border-white/[0.06] -mx-6 px-6 pb-0">
                    {/* Row 1: Property & Date Range */}
                    <div className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-bold text-white">Analytics</h1>
                            {/* Property selector */}
                            {properties.length > 1 && (
                                <select
                                    value={selectedProperty}
                                    onChange={e => setSelectedProperty(e.target.value)}
                                    className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-emerald-500/30"
                                >
                                    {properties.map((p: any) => (
                                        <option key={p.property} value={p.property}>{p.displayName || p.property}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Date range */}
                            {!isRealtime && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition"
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
                                                        className={`w-full text-left px-4 py-2 text-xs transition ${
                                                            range === r.value ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
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
                    <div className="flex items-center gap-0 -mb-px">
                        {TABS.map(tab => {
                            const href = `/dashboard/analytics${tab.key}`;
                            const isActive = tab.key === ''
                                ? pathname === '/dashboard/analytics'
                                : pathname === href;
                            return (
                                <Link
                                    key={tab.key}
                                    href={href}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                                        isActive
                                            ? 'text-emerald-400 border-emerald-400'
                                            : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-white/[0.1]'
                                    }`}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Page content */}
                <div className="pt-6">
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
