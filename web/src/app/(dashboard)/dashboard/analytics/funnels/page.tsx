'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    GitBranch, Plus, ArrowRight, TrendingDown, Percent,
    ChevronDown, Loader2, Clock, Zap, X, AlertTriangle,
    CheckCircle2, Users, Trash2,
} from 'lucide-react';
import useSWR from 'swr';
import { useAnalyticsContext } from '../layout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Custom Funnel Storage (localStorage) ───

const FUNNELS_STORAGE_KEY = 'tc-custom-funnels';

interface CustomFunnel {
    id: string;
    name: string;
    steps: string[]; // page paths like ['/', '/pricing', '/signup']
}

function loadFunnels(): CustomFunnel[] {
    if (typeof window === 'undefined') return [];
    try {
        const saved = localStorage.getItem(FUNNELS_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function saveFunnels(funnels: CustomFunnel[]) {
    localStorage.setItem(FUNNELS_STORAGE_KEY, JSON.stringify(funnels));
}

// ─── Step Color Gradient ───

function stepColor(stepIndex: number, _totalSteps: number): string {
    const colors = [
        'from-emerald-500 to-emerald-400',
        'from-emerald-400/80 to-teal-400/70',
        'from-teal-400/60 to-cyan-400/50',
        'from-cyan-400/40 to-zinc-400/30',
        'from-zinc-400/25 to-zinc-500/20',
    ];
    const i = Math.min(stepIndex, colors.length - 1);
    return colors[i];
}

function stepBorderColor(stepIndex: number): string {
    const borders = [
        'border-emerald-500/30',
        'border-emerald-400/20',
        'border-teal-400/15',
        'border-cyan-400/10',
        'border-zinc-500/10',
    ];
    return borders[Math.min(stepIndex, borders.length - 1)];
}

function stepTextColor(stepIndex: number): string {
    const colors = [
        'text-emerald-400',
        'text-emerald-300',
        'text-teal-300',
        'text-cyan-300/70',
        'text-zinc-400',
    ];
    return colors[Math.min(stepIndex, colors.length - 1)];
}

// ─── Funnel Step Card ───

function FunnelStep({ step, index, totalSteps, isLast }: {
    step: any; index: number; totalSteps: number; isLast: boolean;
}) {
    const barWidthPercent = step.percentOfTotal;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
            className="flex items-center gap-2 sm:gap-3"
        >
            {/* Step Card */}
            <div className={`flex-1 relative group`}>
                {/* Funnel bar background */}
                <div
                    className={`relative rounded-xl border ${stepBorderColor(index)} bg-white/[0.02] p-3 sm:p-4 overflow-hidden transition hover:bg-white/[0.04]`}
                >
                    {/* Gradient fill bar indicating relative volume */}
                    <div
                        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${stepColor(index, totalSteps)} opacity-[0.07] rounded-xl transition-all duration-700`}
                        style={{ width: `${barWidthPercent}%` }}
                    />

                    <div className="relative z-10">
                        {/* Step name and number */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${stepColor(index, totalSteps)} flex items-center justify-center`}>
                                    <span className="text-[8px] font-bold text-white">{index + 1}</span>
                                </div>
                                <span className="text-xs sm:text-sm font-semibold text-white">{step.name}</span>
                            </div>
                            {index > 0 && step.dropFromPrevious > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-red-400/80 bg-red-500/8 border border-red-500/10 rounded-full px-2 py-0.5">
                                    <TrendingDown className="w-2.5 h-2.5" />
                                    -{step.dropFromPrevious.toFixed(1)}%
                                </span>
                            )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{step.count.toLocaleString()}</p>
                                <p className="text-[10px] text-zinc-600">visitors</p>
                            </div>
                            <div className="text-right">
                                <p className={`text-sm font-bold tabular-nums ${stepTextColor(index)}`}>
                                    {step.percentOfTotal}%
                                </p>
                                <p className="text-[10px] text-zinc-600">of total</p>
                            </div>
                        </div>

                        {/* Visual bar showing relative width */}
                        <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidthPercent}%` }}
                                transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
                                className={`h-full rounded-full bg-gradient-to-r ${stepColor(index, totalSteps)}`}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Arrow connector (except for last step) */}
            {!isLast && (
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                    <ArrowRight className="w-4 h-4 text-zinc-700" />
                    {step.dropFromPrevious > 0 || index === 0 ? null : null}
                </div>
            )}
        </motion.div>
    );
}

// ─── Funnel Section ───

function FunnelSection({ funnel, index }: { funnel: any; index: number }) {
    const [isExpanded, setIsExpanded] = useState(index === 0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
            className="premium-card overflow-hidden"
        >
            {/* Header (always visible, clickable to expand/collapse) */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-white/[0.02] transition"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 flex items-center justify-center">
                        <GitBranch className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm sm:text-base font-bold text-white">{funnel.name}</h3>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{funnel.description}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6">
                    {/* Quick stats */}
                    <div className="hidden sm:flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-zinc-500">Conversion</p>
                            <p className="text-sm font-bold text-emerald-400 tabular-nums">{funnel.overallRate}%</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-zinc-500">Entries</p>
                            <p className="text-sm font-bold text-white tabular-nums">{funnel.totalEntries.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-zinc-500">Completions</p>
                            <p className="text-sm font-bold text-white tabular-nums">{funnel.completions.toLocaleString()}</p>
                        </div>
                    </div>

                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Expandable content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
                            {/* Divider */}
                            <div className="border-t border-white/[0.06]" />

                            {/* Mobile quick stats */}
                            <div className="grid grid-cols-3 gap-3 sm:hidden">
                                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                                    <Percent className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{funnel.overallRate}%</p>
                                    <p className="text-[9px] text-zinc-600">Conversion</p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                                    <Users className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{funnel.totalEntries.toLocaleString()}</p>
                                    <p className="text-[9px] text-zinc-600">Entries</p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{funnel.completions.toLocaleString()}</p>
                                    <p className="text-[9px] text-zinc-600">Completions</p>
                                </div>
                            </div>

                            {/* Funnel Steps - Horizontal on desktop, vertical on mobile */}
                            <div className="hidden lg:block">
                                <div className="flex items-stretch gap-2">
                                    {funnel.steps.map((step: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2" style={{ flex: `${step.percentOfTotal} 0 0` }}>
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.15 + i * 0.08 }}
                                                className={`flex-1 rounded-xl border ${stepBorderColor(i)} bg-white/[0.02] p-4 relative overflow-hidden hover:bg-white/[0.04] transition`}
                                            >
                                                {/* Background fill */}
                                                <div
                                                    className={`absolute inset-0 bg-gradient-to-b ${stepColor(i, funnel.steps.length)} opacity-[0.05]`}
                                                />
                                                <div className="relative z-10">
                                                    <div className="flex items-center gap-1.5 mb-2">
                                                        <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${stepColor(i, funnel.steps.length)} flex items-center justify-center`}>
                                                            <span className="text-[8px] font-bold text-white">{i + 1}</span>
                                                        </div>
                                                        <span className="text-xs font-semibold text-white truncate">{step.name}</span>
                                                    </div>
                                                    <p className="text-xl font-bold text-white tabular-nums">{step.count.toLocaleString()}</p>
                                                    <p className={`text-xs font-medium tabular-nums mt-0.5 ${stepTextColor(i)}`}>{step.percentOfTotal}%</p>
                                                    {i > 0 && step.dropFromPrevious > 0 && (
                                                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-red-400/80">
                                                            <TrendingDown className="w-2.5 h-2.5" />
                                                            -{step.dropFromPrevious.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                            {i < funnel.steps.length - 1 && (
                                                <ArrowRight className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Vertical funnel for mobile/tablet */}
                            <div className="lg:hidden space-y-2">
                                {funnel.steps.map((step: any, i: number) => (
                                    <FunnelStep
                                        key={i}
                                        step={step}
                                        index={i}
                                        totalSteps={funnel.steps.length}
                                        isLast={i === funnel.steps.length - 1}
                                    />
                                ))}
                            </div>

                            {/* Overall conversion bar */}
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-zinc-400 font-medium">Overall Conversion Rate</span>
                                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{funnel.overallRate}%</span>
                                </div>
                                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(funnel.overallRate * 4, 100)}%` }}
                                        transition={{ duration: 0.8, delay: 0.3 }}
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                    {/* Biggest drop-off */}
                                    <div className="flex items-center gap-2.5 bg-red-500/[0.05] border border-red-500/10 rounded-lg p-3">
                                        <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-zinc-500 font-medium">Biggest Drop-off</p>
                                            <p className="text-xs text-red-400 font-semibold truncate">
                                                {funnel.biggestDrop.from} → {funnel.biggestDrop.to}
                                            </p>
                                            <p className="text-[10px] text-red-400/60 tabular-nums">-{funnel.biggestDrop.rate}%</p>
                                        </div>
                                    </div>

                                    {/* Avg time to complete */}
                                    <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-medium">Avg. Time</p>
                                            <p className="text-xs text-white font-semibold">{funnel.avgTimeToComplete}</p>
                                        </div>
                                    </div>

                                    {/* Completions */}
                                    <div className="flex items-center gap-2.5 bg-emerald-500/[0.05] border border-emerald-500/10 rounded-lg p-3">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-medium">Completions</p>
                                            <p className="text-xs text-white font-semibold tabular-nums">
                                                {funnel.completions.toLocaleString()} / {funnel.totalEntries.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Create Funnel Form (collapsed) ───

function CreateFunnelForm({ onClose }: { onClose: () => void }) {
    const [steps, setSteps] = useState(['', '']);

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
        >
            <div className="premium-card p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">Create New Funnel</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                        <X className="w-4 h-4 text-zinc-500" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-1.5">Funnel Name</label>
                        <input
                            type="text"
                            placeholder="e.g., Purchase Funnel"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-2">Funnel Steps</label>
                        <div className="space-y-2">
                            {steps.map((step, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${stepColor(i, steps.length)} flex items-center justify-center flex-shrink-0`}>
                                        <span className="text-[8px] font-bold text-white">{i + 1}</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={`Step ${i + 1} (URL or event name)`}
                                        value={step}
                                        onChange={(e) => {
                                            const newSteps = [...steps];
                                            newSteps[i] = e.target.value;
                                            setSteps(newSteps);
                                        }}
                                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition"
                                    />
                                    {steps.length > 2 && (
                                        <button
                                            onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition"
                                        >
                                            <X className="w-3.5 h-3.5 text-zinc-600 hover:text-red-400" />
                                        </button>
                                    )}
                                    {i < steps.length - 1 && (
                                        <ArrowRight className="w-3 h-3 text-zinc-700 flex-shrink-0 hidden sm:block" />
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setSteps([...steps, ''])}
                            className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-emerald-400 transition"
                        >
                            <Plus className="w-3 h-3" />
                            Add Step
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-white/[0.06]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition rounded-lg hover:bg-white/[0.04]"
                    >
                        Cancel
                    </button>
                    <button className="px-5 py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg transition shadow-lg shadow-emerald-500/20">
                        Create Funnel
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Main Page ───

export default function FunnelsPage() {
    const { selectedProperty, range } = useAnalyticsContext();
    const { data, isLoading, error } = useSWR(
        selectedProperty ? `/api/analytics/funnels?propertyId=${selectedProperty}&range=${range}` : null,
        fetcher
    );
    const [showCreateForm, setShowCreateForm] = useState(false);

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <GitBranch className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium">Failed to load funnels</p>
            </div>
        );
    }

    const funnels = data?.funnels || [];
    const totalCompletions = funnels.reduce((s: number, f: any) => s + f.completions, 0);
    const totalEntries = funnels.reduce((s: number, f: any) => s + f.totalEntries, 0);
    const avgConversion = totalEntries > 0 ? ((totalCompletions / totalEntries) * 100).toFixed(1) : '0';

    return (
        <div className="space-y-6">
            {/* ─── Header ─── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-emerald-400" />
                        Funnels
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Visualize user journeys and identify drop-off points
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 hover:border-emerald-500/30 transition group"
                >
                    <Plus className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-90 transition-transform duration-300" />
                    Create Funnel
                </button>
            </motion.div>

            {/* ─── Create Funnel Form (collapsed) ─── */}
            <AnimatePresence>
                {showCreateForm && <CreateFunnelForm onClose={() => setShowCreateForm(false)} />}
            </AnimatePresence>

            {/* ─── Summary Stats ─── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
                {[
                    { label: 'Active Funnels', value: funnels.length, icon: GitBranch, color: 'emerald' },
                    { label: 'Total Entries', value: totalEntries.toLocaleString(), icon: Users, color: 'blue' },
                    { label: 'Completions', value: totalCompletions.toLocaleString(), icon: CheckCircle2, color: 'violet' },
                    { label: 'Avg. Conversion', value: `${avgConversion}%`, icon: Percent, color: 'pink' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + i * 0.04 }}
                        className="premium-card p-3 sm:p-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-6 h-6 rounded-md bg-${stat.color}-500/10 flex items-center justify-center`}>
                                <stat.icon className={`w-3 h-3 text-${stat.color}-400`} />
                            </div>
                            <span className="text-[10px] text-zinc-500 font-medium">{stat.label}</span>
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{stat.value}</p>
                    </motion.div>
                ))}
            </motion.div>

            {/* ─── Funnel Sections ─── */}
            <div className="space-y-4">
                {funnels.map((funnel: any, i: number) => (
                    <FunnelSection key={funnel.id} funnel={funnel} index={i} />
                ))}
            </div>

            {/* ─── Empty state ─── */}
            {funnels.length === 0 && (
                <div className="premium-card p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                        <GitBranch className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">No funnels yet</h3>
                    <p className="text-xs text-zinc-500 mb-4 max-w-sm mx-auto">
                        Create your first funnel to start tracking user journeys and identifying conversion bottlenecks.
                    </p>
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg transition shadow-lg shadow-emerald-500/20"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Create Your First Funnel
                    </button>
                </div>
            )}
        </div>
    );
}
