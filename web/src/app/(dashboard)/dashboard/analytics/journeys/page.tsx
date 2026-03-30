'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Route, ArrowRight, LogIn, LogOut, TrendingUp, Clock,
    MousePointer, BarChart3, ChevronRight, Footprints,
    Loader2, ChevronDown,
} from 'lucide-react';
import useSWR from 'swr';
import { useAnalyticsContext } from '../layout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Helpers ───

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function stepGradient(index: number, total: number): string {
    if (index === total - 1) return 'from-red-500/20 to-red-400/10';
    const gradients = [
        'from-emerald-500/20 to-emerald-400/10',
        'from-emerald-400/15 to-teal-400/10',
        'from-teal-400/12 to-cyan-400/8',
        'from-cyan-400/10 to-zinc-400/8',
        'from-zinc-400/8 to-zinc-500/5',
    ];
    return gradients[Math.min(index, gradients.length - 1)];
}

function stepBorder(index: number, total: number): string {
    if (index === total - 1) return 'border-red-500/20';
    const borders = [
        'border-emerald-500/25',
        'border-emerald-400/20',
        'border-teal-400/15',
        'border-cyan-400/12',
        'border-zinc-500/10',
    ];
    return borders[Math.min(index, borders.length - 1)];
}

function stepTextAccent(index: number, total: number): string {
    if (index === total - 1) return 'text-red-400';
    const colors = [
        'text-emerald-400',
        'text-emerald-300',
        'text-teal-300',
        'text-cyan-300/80',
        'text-zinc-400',
    ];
    return colors[Math.min(index, colors.length - 1)];
}

function connectorColor(index: number, total: number): string {
    if (index >= total - 2) return 'text-zinc-700';
    const colors = [
        'text-emerald-500/40',
        'text-emerald-400/30',
        'text-teal-400/25',
        'text-cyan-400/20',
    ];
    return colors[Math.min(index, colors.length - 1)];
}

function truncatePath(path: string, maxLen: number = 18): string {
    if (path === 'EXIT') return 'EXIT';
    if (path.length <= maxLen) return path;
    return path.slice(0, maxLen - 1) + '\u2026';
}

// ─── Flow Line (connecting bar between steps) ───

function FlowLine({ percentage, index, total }: { percentage: number; index: number; total: number }) {
    const width = Math.max(24, Math.min(64, percentage * 2));
    const opacity = Math.max(0.15, Math.min(0.6, percentage / 30));

    return (
        <div className="flex items-center mx-0.5 sm:mx-1 flex-shrink-0" style={{ width: `${width}px` }}>
            <div className="relative w-full h-[2px] rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-white/[0.06]" />
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                    className={`absolute inset-y-0 left-0 rounded-full ${
                        index >= total - 2
                            ? 'bg-zinc-600'
                            : 'bg-gradient-to-r from-emerald-500/60 to-teal-400/40'
                    }`}
                    style={{ opacity }}
                />
            </div>
            <ArrowRight className={`w-3 h-3 flex-shrink-0 -ml-0.5 ${connectorColor(index, total)}`} />
        </div>
    );
}

// ─── Journey Step Box ───

function JourneyStep({ path, percentage, index, total }: {
    path: string; percentage: number; index: number; total: number;
}) {
    const isExit = path === 'EXIT';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + index * 0.08, duration: 0.35 }}
            className={`flex-shrink-0 relative group rounded-lg border ${stepBorder(index, total)} bg-gradient-to-br ${stepGradient(index, total)} px-3 py-2 min-w-[90px] sm:min-w-[110px] transition hover:bg-white/[0.04]`}
        >
            {/* Step number badge */}
            {!isExit && (
                <div className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                    index === 0 ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}>
                    {index + 1}
                </div>
            )}

            <div className="flex items-center gap-1.5 mb-1">
                {isExit ? (
                    <LogOut className="w-3 h-3 text-red-400" />
                ) : index === 0 ? (
                    <LogIn className="w-3 h-3 text-emerald-400" />
                ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-600" />
                )}
                <span className={`text-xs font-semibold truncate ${isExit ? 'text-red-400' : 'text-white'}`} title={path}>
                    {truncatePath(path)}
                </span>
            </div>

            <span className={`text-[10px] font-medium tabular-nums ${stepTextAccent(index, total)}`}>
                {percentage}% of users
            </span>
        </motion.div>
    );
}

// ─── Single Journey Row ───

function JourneyRow({ journey, index }: {
    journey: { id: number; steps: string[]; users: number; percentage: number; avgDuration: number };
    index: number;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const total = journey.steps.length;

    // Calculate rough step percentages (diminishing)
    const stepPercentages = journey.steps.map((_, i) => {
        if (i === total - 1) return journey.percentage;
        const factor = 1 - (i / (total - 1)) * 0.6;
        return Math.round(journey.percentage * factor * 10) / 10;
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.35 }}
            className="premium-card overflow-hidden"
        >
            {/* Clickable header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left hover:bg-white/[0.02] transition"
            >
                {/* Rank badge */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/15 to-cyan-500/8 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-400">#{index + 1}</span>
                </div>

                {/* Path preview (inline) */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                        {journey.steps.map((step, i) => (
                            <span key={i} className="flex items-center gap-1">
                                <span className={`text-xs font-medium truncate ${
                                    step === 'EXIT' ? 'text-red-400' : i === 0 ? 'text-emerald-400' : 'text-zinc-300'
                                }`}>
                                    {truncatePath(step, 14)}
                                </span>
                                {i < journey.steps.length - 1 && (
                                    <ArrowRight className="w-3 h-3 text-zinc-700 flex-shrink-0" />
                                )}
                            </span>
                        ))}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                        {journey.users.toLocaleString()} users &middot; {formatDuration(journey.avgDuration)} avg
                    </p>
                </div>

                {/* Quick stats */}
                <div className="hidden sm:flex items-center gap-5">
                    <div className="text-right">
                        <p className="text-xs text-zinc-500">Users</p>
                        <p className="text-sm font-bold text-white tabular-nums">{journey.users.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-zinc-500">Share</p>
                        <p className="text-sm font-bold text-emerald-400 tabular-nums">{journey.percentage}%</p>
                    </div>
                </div>

                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded flow visualization */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                            <div className="border-t border-white/[0.06] pt-4" />

                            {/* Flow visualization */}
                            <div className="overflow-x-auto scrollbar-hide -mx-2 px-2">
                                <div className="flex items-center py-3 min-w-max">
                                    {journey.steps.map((step, i) => (
                                        <div key={i} className="flex items-center">
                                            <JourneyStep
                                                path={step}
                                                percentage={stepPercentages[i]}
                                                index={i}
                                                total={total}
                                            />
                                            {i < total - 1 && (
                                                <FlowLine
                                                    percentage={stepPercentages[i]}
                                                    index={i}
                                                    total={total}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stats row */}
                            <div className="grid grid-cols-3 gap-3 mt-3">
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <Footprints className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{journey.steps.length - 1}</p>
                                    <p className="text-[9px] text-zinc-600">Steps</p>
                                </div>
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <Clock className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{formatDuration(journey.avgDuration)}</p>
                                    <p className="text-[9px] text-zinc-600">Avg Duration</p>
                                </div>
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-center">
                                    <MousePointer className="w-3.5 h-3.5 text-violet-400 mx-auto mb-1" />
                                    <p className="text-xs font-bold text-white tabular-nums">{journey.users.toLocaleString()}</p>
                                    <p className="text-[9px] text-zinc-600">Users</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Overview Stat Card ───

function OverviewCard({ label, value, icon: Icon, color, delay }: {
    label: string; value: string; icon: any; color: string; delay: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.35 }}
            className="premium-card p-3 sm:p-4"
        >
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-md bg-${color}-500/10 flex items-center justify-center`}>
                    <Icon className={`w-3 h-3 text-${color}-400`} />
                </div>
                <span className="text-[10px] text-zinc-500 font-medium">{label}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{value}</p>
        </motion.div>
    );
}

// ─── Landing Pages Table ───

function LandingPagesSection({ pages }: { pages: any[] }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="premium-card overflow-hidden"
        >
            <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <LogIn className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-white">Top Landing Pages</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Where users enter your site</p>
                </div>
            </div>

            <div className="p-4 sm:p-5 pt-3 sm:pt-4">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-3 pb-2 border-b border-white/[0.06]">
                    <span className="col-span-5 text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Page</span>
                    <span className="col-span-2 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Entries</span>
                    <span className="col-span-2 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Share</span>
                    <span className="col-span-3 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Avg Pages After</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-white/[0.04]">
                    {pages.map((page, i) => (
                        <motion.div
                            key={page.page}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + i * 0.05 }}
                            className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition rounded-lg group"
                        >
                            <div className="col-span-5 flex items-center gap-2 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" style={{ opacity: 1 - i * 0.18 }} />
                                <span className="text-xs text-white font-medium truncate">{page.page}</span>
                            </div>
                            <span className="col-span-2 text-xs text-zinc-300 font-medium tabular-nums text-right">
                                {page.entries.toLocaleString()}
                            </span>
                            <span className="col-span-2 text-xs text-emerald-400 font-semibold tabular-nums text-right">
                                {page.percentage}%
                            </span>
                            <div className="col-span-3 flex items-center justify-end gap-2">
                                <div className="hidden sm:block flex-1 max-w-[60px] h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-teal-400/40"
                                        style={{ width: `${Math.min((page.avgPagesAfter / 4) * 100, 100)}%` }}
                                    />
                                </div>
                                <span className="text-xs text-zinc-300 font-medium tabular-nums">{page.avgPagesAfter}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Exit Pages Table ───

function ExitPagesSection({ pages }: { pages: any[] }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="premium-card overflow-hidden"
        >
            <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-0">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <LogOut className="w-4 h-4 text-red-400" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-white">Top Exit Pages</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Where users leave your site</p>
                </div>
            </div>

            <div className="p-4 sm:p-5 pt-3 sm:pt-4">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-3 pb-2 border-b border-white/[0.06]">
                    <span className="col-span-5 text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Page</span>
                    <span className="col-span-2 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Exits</span>
                    <span className="col-span-2 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Share</span>
                    <span className="col-span-3 text-[10px] text-zinc-600 font-medium uppercase tracking-wider text-right">Avg Session</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-white/[0.04]">
                    {pages.map((page, i) => (
                        <motion.div
                            key={page.page}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + i * 0.05 }}
                            className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition rounded-lg group"
                        >
                            <div className="col-span-5 flex items-center gap-2 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" style={{ opacity: 1 - i * 0.15 }} />
                                <span className="text-xs text-white font-medium truncate">{page.page}</span>
                            </div>
                            <span className="col-span-2 text-xs text-zinc-300 font-medium tabular-nums text-right">
                                {page.exits.toLocaleString()}
                            </span>
                            <span className="col-span-2 text-xs text-red-400 font-semibold tabular-nums text-right">
                                {page.percentage}%
                            </span>
                            <div className="col-span-3 flex items-center justify-end gap-2">
                                <div className="hidden sm:block flex-1 max-w-[60px] h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-blue-500/50 to-cyan-400/30"
                                        style={{ width: `${Math.min((page.avgSessionDuration / 400) * 100, 100)}%` }}
                                    />
                                </div>
                                <span className="text-xs text-zinc-300 font-medium tabular-nums">{formatDuration(page.avgSessionDuration)}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Filter Tabs ───

type FilterOption = 'top10' | 'top20' | 'all';

function FilterTabs({ active, onChange }: { active: FilterOption; onChange: (f: FilterOption) => void }) {
    const options: { key: FilterOption; label: string }[] = [
        { key: 'top10', label: 'Top 10' },
        { key: 'top20', label: 'Top 20' },
        { key: 'all', label: 'All' },
    ];

    return (
        <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
            {options.map(opt => (
                <button
                    key={opt.key}
                    onClick={() => onChange(opt.key)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition ${
                        active === opt.key
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

// ─── Main Page ───

export default function JourneysPage() {
    const { selectedProperty, range } = useAnalyticsContext();
    const { data, isLoading, error } = useSWR(
        selectedProperty ? `/api/analytics/journeys?propertyId=${selectedProperty}&range=${range}` : null,
        fetcher
    );
    const [filter, setFilter] = useState<FilterOption>('top10');

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
                    <Route className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium">Failed to load journey data</p>
            </div>
        );
    }

    const overview = data?.overview;
    const journeys = data?.journeys || [];
    const landingPages = data?.landingPages || [];
    const exitPages = data?.exitPages || [];

    // Apply filter
    const filteredJourneys = filter === 'top10'
        ? journeys.slice(0, 10)
        : filter === 'top20'
            ? journeys.slice(0, 20)
            : journeys;

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
                        <Route className="w-5 h-5 text-emerald-400" />
                        User Journeys
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        How users navigate through your site from entry to exit
                    </p>
                </div>
                <FilterTabs active={filter} onChange={setFilter} />
            </motion.div>

            {/* ─── Overview Cards ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <OverviewCard
                    label="Avg Path Length"
                    value={`${overview?.avgPathLength ?? 0} pages`}
                    icon={Footprints}
                    color="emerald"
                    delay={0.05}
                />
                <OverviewCard
                    label="Avg Time on Site"
                    value={formatDuration(overview?.avgTimeOnSite ?? 0)}
                    icon={Clock}
                    color="blue"
                    delay={0.09}
                />
                <OverviewCard
                    label="Bounce Rate"
                    value={`${overview?.bounceRate ?? 0}%`}
                    icon={TrendingUp}
                    color="pink"
                    delay={0.13}
                />
                <OverviewCard
                    label="Most Common Path"
                    value={overview?.mostCommonPath ?? '-'}
                    icon={BarChart3}
                    color="violet"
                    delay={0.17}
                />
            </div>

            {/* ─── Top Entry → Exit Flows ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
            >
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                        <ArrowRight className="w-3 h-3 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">Top Entry &rarr; Exit Flows</h3>
                    <span className="text-[10px] text-zinc-600 ml-1">{filteredJourneys.length} journeys</span>
                </div>

                <div className="space-y-3">
                    {filteredJourneys.map((journey: any, i: number) => (
                        <JourneyRow key={journey.id} journey={journey} index={i} />
                    ))}
                </div>
            </motion.div>

            {/* ─── Landing & Exit Pages (side by side on desktop) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LandingPagesSection pages={landingPages} />
                <ExitPagesSection pages={exitPages} />
            </div>

            {/* ─── Empty state ─── */}
            {journeys.length === 0 && (
                <div className="premium-card p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                        <Route className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">No journey data yet</h3>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                        Journey data will appear once your site has enough traffic for path analysis.
                    </p>
                </div>
            )}
        </div>
    );
}
