'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { useFilterStore, DashboardFilters } from '@/stores/analyticsFilterStore';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon, ReferrerIcon } from './AnalyticsIcons';

interface DrilldownData {
    title: string;
    dimension: keyof DashboardFilters;
    value: string;
    metrics?: { label: string; value: string | number; change?: number }[];
    breakdown?: { label: string; value: number; icon?: React.ReactNode }[];
    topPages?: { page: string; views: number }[];
}

interface DrilldownDrawerProps {
    open: boolean;
    onClose: () => void;
    data: DrilldownData | null;
}

export default function DrilldownDrawer({ open, onClose, data }: DrilldownDrawerProps) {
    const { toggleFilter } = useFilterStore();

    if (!data) return null;

    const maxBreakdown = data.breakdown?.reduce((max, b) => Math.max(max, b.value), 0) || 1;

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 bg-[#0a0a12] border-l border-white/[0.08] shadow-2xl overflow-y-auto"
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-[#0a0a12]/90 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 flex items-center justify-between z-10">
                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Drilldown</p>
                                <h2 className="text-lg font-bold text-white mt-0.5">{data.value}</h2>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-white transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Metric cards */}
                            {data.metrics && data.metrics.length > 0 && (
                                <div className="grid grid-cols-2 gap-3">
                                    {data.metrics.map((m, i) => (
                                        <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{m.label}</p>
                                            <p className="text-xl font-bold text-white mt-1 tabular-nums">{typeof m.value === 'number' ? m.value.toLocaleString() : m.value}</p>
                                            {m.change != null && m.change !== 0 && (
                                                <div className={`flex items-center gap-1 mt-1 text-[11px] font-semibold ${m.change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {m.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {m.change > 0 ? '+' : ''}{m.change}%
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Breakdown bars */}
                            {data.breakdown && data.breakdown.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Breakdown</h3>
                                    <div className="space-y-2">
                                        {data.breakdown.map((b, i) => {
                                            const pct = (b.value / maxBreakdown) * 100;
                                            return (
                                                <div key={i} className="group">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2">
                                                            {b.icon}
                                                            <span className="text-xs text-zinc-300">{b.label}</span>
                                                        </div>
                                                        <span className="text-xs text-zinc-400 tabular-nums font-medium">{b.value.toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${Math.max(pct, 2)}%` }}
                                                            transition={{ duration: 0.5, delay: i * 0.05 }}
                                                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Top Pages */}
                            {data.topPages && data.topPages.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Pages</h3>
                                    <div className="space-y-1">
                                        {data.topPages.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between py-1.5 hover:bg-white/[0.02] rounded-lg px-2 -mx-2 transition">
                                                <span className="text-xs text-zinc-300 truncate max-w-[240px] font-mono">{p.page}</span>
                                                <span className="text-xs text-zinc-400 tabular-nums ml-3">{p.views.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Filter button */}
                            <button
                                onClick={() => {
                                    toggleFilter(data.dimension, data.value);
                                    onClose();
                                }}
                                className="w-full py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl hover:opacity-90 transition"
                            >
                                Filter dashboard by &ldquo;{data.value}&rdquo;
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
