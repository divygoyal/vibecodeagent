'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    Target, Plus, TrendingUp, TrendingDown, ArrowRight,
    BarChart3, Globe, Zap, Loader2, X,
} from 'lucide-react';
import useSWR from 'swr';
import { useAnalyticsContext } from '../layout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Custom Goal Storage (localStorage) ───

const GOALS_STORAGE_KEY = 'tc-custom-goals';

interface CustomGoal {
    id: string;
    name: string;
    type: 'page_visit' | 'custom_event';
    target: string; // page path like '/pricing'
    description?: string;
}

function loadGoals(): CustomGoal[] {
    if (typeof window === 'undefined') return [];
    try {
        const saved = localStorage.getItem(GOALS_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function saveGoals(goals: CustomGoal[]) {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

// ─── Helpers ───

function rateColor(rate: number): string {
    if (rate >= 10) return 'text-emerald-400';
    if (rate >= 4) return 'text-amber-400';
    return 'text-red-400';
}

function rateBg(rate: number): string {
    if (rate >= 10) return 'bg-emerald-500/10 border-emerald-500/20';
    if (rate >= 4) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
}

function rateRingColor(rate: number): string {
    if (rate >= 10) return '#34d399';
    if (rate >= 4) return '#fbbf24';
    return '#ef4444';
}

// ─── Chart Tooltip ───

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[180px]">
            <p className="text-[11px] font-semibold text-white mb-2">{label}</p>
            <div className="space-y-1.5">
                {payload.map((e: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                            <span className="text-[10px] text-zinc-500">{e.name}</span>
                        </div>
                        <span className="text-xs font-bold text-white tabular-nums">{e.value?.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Conversion Rate Ring ───

function ConversionRing({ rate, size = 48 }: { rate: number; size?: number }) {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(rate, 100) / 100) * circ;
    const color = rateRingColor(rate);

    return (
        <svg width={size} height={size} className="flex-shrink-0">
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={3}
            />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={color} strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="transition-all duration-700"
            />
            <text
                x={size / 2} y={size / 2}
                textAnchor="middle" dominantBaseline="central"
                className="fill-white text-[9px] font-bold"
            >
                {rate}%
            </text>
        </svg>
    );
}

// ─── Goal Card ───

function GoalCard({ goal, index, isSelected, onSelect, onDelete }: {
    goal: any; index: number; isSelected: boolean; onSelect: () => void; onDelete?: () => void;
}) {
    const up = goal.change > 0;
    return (
        <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            onClick={onSelect}
            className={`premium-card p-4 sm:p-5 text-left w-full transition-all duration-300 relative group/card ${
                isSelected
                    ? 'ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-500/5'
                    : 'hover:ring-1 hover:ring-white/10'
            }`}
        >
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="absolute top-2 right-2 p-1 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover/card:opacity-100 hover:bg-red-500/20 transition-all z-10"
                    title="Delete goal"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${goal.color}15` }}
                    >
                        <Target className="w-4 h-4" style={{ color: goal.color }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white">{goal.name}</h3>
                        <p className="text-[10px] text-zinc-600 mt-0.5">{goal.target}</p>
                    </div>
                </div>
                <ConversionRing rate={goal.rate} size={40} />
            </div>

            <div className="flex items-end justify-between">
                <div>
                    <p className="text-2xl font-bold text-white tabular-nums">{goal.conversions}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">conversions/day</p>
                </div>
                <div className="text-right">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {up ? '+' : ''}{goal.change}%
                    </span>
                    <p className={`text-[10px] mt-0.5 font-medium border rounded-full px-2 py-0.5 ${rateBg(goal.rate)} ${rateColor(goal.rate)}`}>
                        Rate: {goal.rate}%
                    </p>
                </div>
            </div>

            {/* Mini sparkline */}
            <div className="mt-3 h-8 opacity-60">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={goal.trend.slice(-14)}>
                        <defs>
                            <linearGradient id={`spark-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={goal.color} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={goal.color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone" dataKey="value"
                            stroke={goal.color} strokeWidth={1.5}
                            fill={`url(#spark-${goal.id})`}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.button>
    );
}

// ─── Create Goal Form (collapsed by default) ───

function CreateGoalForm({ onClose, onSave }: { onClose: () => void; onSave: (goal: CustomGoal) => void }) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'page_visit' | 'custom_event'>('page_visit');
    const [target, setTarget] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = () => {
        if (!name.trim() || !target.trim()) return;
        const newGoal: CustomGoal = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: name.trim(),
            type,
            target: target.trim(),
            description: description.trim() || undefined,
        };
        onSave(newGoal);
        setName('');
        setType('page_visit');
        setTarget('');
        setDescription('');
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
        >
            <div className="premium-card p-5 sm:p-6 mt-4">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">Create New Goal</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                        <X className="w-4 h-4 text-zinc-500" />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-1.5">Goal Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Newsletter Signup"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-1.5">Goal Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as 'page_visit' | 'custom_event')}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition appearance-none"
                        >
                            <option value="page_visit">Page Visit</option>
                            <option value="custom_event">Custom Event</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-1.5">Target URL / Event</label>
                        <input
                            type="text"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            placeholder="e.g., /thank-you or form_submit"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-zinc-500 font-medium mb-1.5">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this goal track?"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-white/[0.06]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition rounded-lg hover:bg-white/[0.04]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim() || !target.trim()}
                        className="px-5 py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg transition shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-500"
                    >
                        Create Goal
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Source Breakdown Bar ───

function SourceBar({ source, maxConversions }: { source: any; maxConversions: number }) {
    const pct = maxConversions > 0 ? (source.conversions / maxConversions) * 100 : 0;
    return (
        <div className="flex items-center gap-3 group">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: source.color }} />
            <span className="text-xs text-zinc-400 w-28 truncate group-hover:text-zinc-200 transition">{source.source}</span>
            <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="h-full rounded-full"
                    style={{ background: source.color }}
                />
            </div>
            <span className="text-xs text-zinc-300 tabular-nums font-medium w-10 text-right">{source.percentage}%</span>
            <span className="text-[10px] text-zinc-600 tabular-nums w-8 text-right">{source.conversions}</span>
        </div>
    );
}

// ─── Main Page ───

export default function GoalsPage() {
    const { selectedProperty, range } = useAnalyticsContext();
    const [customGoals, setCustomGoals] = useState<CustomGoal[]>([]);
    const [selectedGoal, setSelectedGoal] = useState<string>('all');
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Load custom goals from localStorage on mount
    useEffect(() => {
        setCustomGoals(loadGoals());
    }, []);

    const customPages = customGoals.map(g => g.target).join(',');
    const swrKey = selectedProperty
        ? `/api/analytics/goals?propertyId=${selectedProperty}&range=${range}${customPages ? `&pages=${customPages}` : ''}`
        : null;

    const { data, isLoading, error, mutate } = useSWR(swrKey, fetcher);

    const handleSaveGoal = useCallback((goal: CustomGoal) => {
        setCustomGoals(prev => {
            const updated = [...prev, goal];
            saveGoals(updated);
            return updated;
        });
        setShowCreateForm(false);
        // mutate will auto-trigger because swrKey changes via customPages
    }, []);

    const handleDeleteGoal = useCallback((goalId: string) => {
        setCustomGoals(prev => {
            const updated = prev.filter(g => g.id !== goalId);
            saveGoals(updated);
            return updated;
        });
        // mutate will auto-trigger because swrKey changes via customPages
    }, []);

    // Build merged trend data for the chart
    const chartData = useMemo(() => {
        if (!data?.goals) return [];
        const goals = data.goals;
        const dateMap: Record<string, any> = {};

        goals.forEach((goal: any) => {
            goal.trend.forEach((t: any) => {
                if (!dateMap[t.date]) {
                    dateMap[t.date] = { date: t.date };
                }
                dateMap[t.date][goal.name] = t.value;
            });
        });

        return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
    }, [data]);

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
                    <Target className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium">Failed to load goals</p>
            </div>
        );
    }

    const goals = data?.goals || [];
    const bySource = data?.bySource || [];
    const topPages = data?.topPages || [];
    const totalConversions = data?.totalConversions || 0;
    const totalSessions = data?.totalSessions || 0;
    const maxSourceConversions = Math.max(...bySource.map((s: any) => s.conversions), 1);

    // Filter chart data based on selected goal
    const visibleGoals = selectedGoal === 'all'
        ? goals
        : goals.filter((g: any) => g.name === selectedGoal);

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
                        <Target className="w-5 h-5 text-emerald-400" />
                        Conversion Goals
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Track and optimize your conversion targets across {totalSessions.toLocaleString()} sessions
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 hover:border-emerald-500/30 transition group"
                >
                    <Plus className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-90 transition-transform duration-300" />
                    Create Goal
                </button>
            </motion.div>

            {/* ─── Create Goal Form (collapsed) ─── */}
            <AnimatePresence>
                {showCreateForm && <CreateGoalForm onClose={() => setShowCreateForm(false)} onSave={handleSaveGoal} />}
            </AnimatePresence>

            {/* ─── Summary Stats ─── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
                {[
                    { label: 'Total Conversions', value: totalConversions, icon: Zap, color: 'emerald' },
                    { label: 'Total Sessions', value: totalSessions, icon: Globe, color: 'blue' },
                    { label: 'Avg. Rate', value: `${(goals.reduce((s: number, g: any) => s + g.rate, 0) / goals.length).toFixed(1)}%`, icon: BarChart3, color: 'violet' },
                    { label: 'Active Goals', value: goals.length, icon: Target, color: 'pink' },
                ].map((stat, i) => (
                    <div key={i} className="premium-card p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-6 h-6 rounded-md bg-${stat.color}-500/10 flex items-center justify-center`}>
                                <stat.icon className={`w-3 h-3 text-${stat.color}-400`} />
                            </div>
                            <span className="text-[10px] text-zinc-500 font-medium">{stat.label}</span>
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-white tabular-nums">
                            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                        </p>
                    </div>
                ))}
            </motion.div>

            {/* ─── Goal Cards Grid ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {goals.map((goal: any, i: number) => {
                    // Check if this goal corresponds to a custom goal (by matching target page)
                    const matchingCustomGoal = customGoals.find(cg => cg.target === goal.target);
                    return (
                        <GoalCard
                            key={goal.id}
                            goal={goal}
                            index={i}
                            isSelected={selectedGoal === goal.name}
                            onSelect={() => setSelectedGoal(selectedGoal === goal.name ? 'all' : goal.name)}
                            onDelete={matchingCustomGoal ? () => handleDeleteGoal(matchingCustomGoal.id) : undefined}
                        />
                    );
                })}
            </div>

            {/* ─── Conversion Trend Chart ─── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="premium-card p-5 sm:p-6"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <h3 className="text-sm font-semibold text-white">Conversion Trend</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={() => setSelectedGoal('all')}
                            className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition ${
                                selectedGoal === 'all'
                                    ? 'bg-white/[0.08] text-white'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                            }`}
                        >
                            All Goals
                        </button>
                        {goals.map((goal: any) => (
                            <button
                                key={goal.id}
                                onClick={() => setSelectedGoal(selectedGoal === goal.name ? 'all' : goal.name)}
                                className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition flex items-center gap-1.5 ${
                                    selectedGoal === goal.name
                                        ? 'bg-white/[0.08] text-white'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ background: goal.color }} />
                                {goal.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-[280px] sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                {goals.map((goal: any) => (
                                    <linearGradient key={goal.id} id={`grad-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={goal.color} stopOpacity={0.2} />
                                        <stop offset="100%" stopColor={goal.color} stopOpacity={0} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: '#52525b', fontSize: 10 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                                tickFormatter={(v) => {
                                    const d = new Date(v);
                                    return `${d.getMonth() + 1}/${d.getDate()}`;
                                }}
                            />
                            <YAxis
                                tick={{ fill: '#52525b', fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                width={35}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            {visibleGoals.map((goal: any) => (
                                <Area
                                    key={goal.id}
                                    type="monotone"
                                    dataKey={goal.name}
                                    name={goal.name}
                                    stroke={goal.color}
                                    strokeWidth={2}
                                    fill={`url(#grad-${goal.id})`}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0, fill: goal.color }}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ─── Bottom Grid: Source Breakdown + Top Converting Pages ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                {/* Goal Breakdown by Source */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="premium-card p-5 sm:p-6"
                >
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-white">Goal Breakdown by Source</h3>
                            <p className="text-[10px] text-zinc-600">Where your conversions come from</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {bySource.map((source: any, i: number) => (
                            <motion.div
                                key={source.source}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.25 + i * 0.05 }}
                            >
                                <SourceBar source={source} maxConversions={maxSourceConversions} />
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-5 pt-4 border-t border-white/[0.06]">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">Total from all sources</span>
                            <span className="text-xs font-bold text-white tabular-nums">{totalConversions.toLocaleString()} conversions</span>
                        </div>
                    </div>
                </motion.div>

                {/* Top Converting Pages */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="premium-card p-5 sm:p-6"
                >
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-violet-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-white">Top Converting Pages</h3>
                            <p className="text-[10px] text-zinc-600">Pages with the highest conversions</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {topPages.map((page: any, i: number) => (
                            <motion.div
                                key={page.page}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 + i * 0.04 }}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition group"
                            >
                                <span className="text-[10px] text-zinc-600 font-mono w-5 text-right tabular-nums">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-zinc-300 truncate font-medium group-hover:text-white transition">{page.page}</span>
                                        <ArrowRight className="w-3 h-3 text-zinc-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition" />
                                    </div>
                                    <span className="text-[10px] text-zinc-600 truncate block">{page.title}</span>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <span className="text-xs font-bold text-white tabular-nums">{page.conversions}</span>
                                    <span className={`block text-[10px] font-medium tabular-nums ${rateColor(page.rate)}`}>{page.rate}%</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
