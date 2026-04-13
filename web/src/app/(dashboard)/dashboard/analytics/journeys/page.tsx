'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { motion } from 'framer-motion';
import {
    Route, LogIn, LogOut, TrendingUp, Clock,
    Footprints, BarChart3,
    Filter, X,
} from 'lucide-react';
import useSWR from 'swr';
import {
    AnalyticsInsightList,
    AnalyticsSubpageBadge,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    AnalyticsSubpagePanel,
    AnalyticsSubpageShell,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsContext } from '../layout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Color Palette ───

const COLORS = ['#34d399', '#3b82f6', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c', '#22d3ee', '#ef4444'];

function getColor(index: number) {
    return COLORS[index % COLORS.length];
}

// ─── Helpers ───

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function truncatePath(path: string, maxLen: number = 25): string {
    if (path === 'EXIT') return 'EXIT';
    if (path.length <= maxLen) return path;
    return path.slice(0, maxLen - 1) + '\u2026';
}

// ─── Types ───

interface Journey {
    id: number;
    steps: string[];
    users: number;
    percentage: number;
    avgDuration: number;
}

interface SankeyNodeExtra {
    name: string;
    step: number;
}

interface SankeyLinkExtra {
    source: number;
    target: number;
    value: number;
}

interface SankeyChartNode extends SankeyNodeExtra {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    index: number;
    value?: number;
}

interface SankeyChartLink {
    source: SankeyChartNode;
    target: SankeyChartNode;
    value: number;
    width: number;
}

interface JourneyOverview {
    avgPathLength: number;
    avgTimeOnSite: number;
    bounceRate: number;
    mostCommonPath: string;
}

interface LandingPageRow {
    page: string;
    entries: number;
    percentage: number;
    avgPagesAfter: number;
}

interface ExitPageRow {
    page: string;
    exits: number;
    percentage: number;
    avgSessionDuration: number;
}

interface JourneyResponse {
    overview: JourneyOverview;
    journeys: Journey[];
    landingPages: LandingPageRow[];
    exitPages: ExitPageRow[];
}

// ─── Sankey Diagram Component ───

function SankeyDiagram({ journeys, width, height }: { journeys: Journey[]; width: number; height: number }) {
    const [hoveredLink, setHoveredLink] = useState<number | null>(null);
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

    const { nodes, links } = useMemo(() => {
        const nodeMap = new Map<string, number>();
        const nodeList: SankeyNodeExtra[] = [];
        const linkList: SankeyLinkExtra[] = [];

        journeys.forEach(journey => {
            journey.steps.forEach((step, i) => {
                const key = `${i}:${step}`;
                if (!nodeMap.has(key)) {
                    nodeMap.set(key, nodeList.length);
                    nodeList.push({ name: step, step: i });
                }

                if (i > 0) {
                    const prevKey = `${i - 1}:${journey.steps[i - 1]}`;
                    const source = nodeMap.get(prevKey)!;
                    const target = nodeMap.get(key)!;
                    const existing = linkList.find(l => l.source === source && l.target === target);
                    if (existing) {
                        existing.value += journey.users;
                    } else {
                        linkList.push({ source, target, value: journey.users });
                    }
                }
            });
        });

        return { nodes: nodeList, links: linkList };
    }, [journeys]);

    const sankeyData = useMemo(() => {
        if (nodes.length === 0 || links.length === 0) return null;

        const padding = 140; // space for labels on right side
        const s = sankey<SankeyNodeExtra, SankeyLinkExtra>()
            .nodeWidth(18)
            .nodePadding(14)
            .extent([[0, 8], [width - padding, height - 8]]);

        try {
            return s({
                nodes: nodes.map(d => ({ ...d })),
                links: links.map(d => ({ ...d })),
            }) as { nodes: SankeyChartNode[]; links: SankeyChartLink[] };
        } catch {
            return null;
        }
    }, [nodes, links, width, height]);

    if (!sankeyData) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Not enough data to render flow diagram
            </div>
        );
    }

    // Determine max step for column headers
    const maxStep = Math.max(...sankeyData.nodes.map((n) => n.step ?? 0));

    // Compute column x positions for step headers
    const stepPositions: { step: number; x: number }[] = [];
    for (let s = 0; s <= maxStep; s++) {
        const nodesInStep = sankeyData.nodes.filter((n) => n.step === s);
        if (nodesInStep.length > 0) {
            const x0 = nodesInStep[0].x0 ?? 0;
            const x1 = nodesInStep[0].x1 ?? 0;
            stepPositions.push({ step: s, x: (x0 + x1) / 2 });
        }
    }

    return (
        <div className="relative">
            {/* Step column headers */}
            <div className="flex mb-3" style={{ paddingRight: 140 }}>
                {stepPositions.map(({ step, x }) => (
                    <div
                        key={step}
                        className="absolute text-[11px] font-semibold text-zinc-500"
                        style={{ left: x, transform: 'translateX(-50%)' }}
                    >
                        Step {step + 1}
                    </div>
                ))}
            </div>

            <svg width={width} height={height} className="overflow-visible">
                {/* Links */}
                <g>
                    {sankeyData.links.map((link, i) => {
                        const sourceNode = link.source;
                        const isHighlighted = hoveredLink === i ||
                            hoveredNode === sourceNode.index ||
                            hoveredNode === link.target.index;
                        const isExit = link.target.name === 'EXIT';

                        return (
                            <motion.path
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.1 + i * 0.02, duration: 0.4 }}
                                d={sankeyLinkHorizontal()(link) || ''}
                                fill="none"
                                stroke={isExit ? '#ef4444' : getColor(sourceNode.step ?? 0)}
                                strokeOpacity={isHighlighted ? 0.6 : 0.2}
                                strokeWidth={Math.max(1, link.width)}
                                onMouseEnter={(e) => {
                                    setHoveredLink(i);
                                    setTooltip({
                                        x: e.clientX,
                                        y: e.clientY,
                                        content: `${sourceNode.name} → ${link.target.name}: ${link.value.toLocaleString()} users`,
                                    });
                                }}
                                onMouseMove={(e) => {
                                    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                                }}
                                onMouseLeave={() => {
                                    setHoveredLink(null);
                                    setTooltip(null);
                                }}
                                style={{ cursor: 'pointer', transition: 'stroke-opacity 200ms' }}
                            />
                        );
                    })}
                </g>

                {/* Nodes */}
                <g>
                    {sankeyData.nodes.map((node, i) => {
                        const nodeHeight = Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0));
                        const isExit = node.name === 'EXIT';
                        const isHovered = hoveredNode === i;
                        const nodeValue = (node.value ?? 0) as number;
                        const color = isExit ? '#ef4444' : getColor(node.step ?? i);

                        return (
                            <motion.g
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 + i * 0.03, duration: 0.4 }}
                            >
                                <rect
                                    x={node.x0}
                                    y={node.y0}
                                    width={(node.x1 ?? 0) - (node.x0 ?? 0)}
                                    height={nodeHeight}
                                    fill={color}
                                    fillOpacity={isHovered ? 1 : 0.85}
                                    rx={3}
                                    onMouseEnter={() => setHoveredNode(i)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    style={{ cursor: 'pointer', transition: 'fill-opacity 200ms' }}
                                />
                                {/* Node label */}
                                <text
                                    x={(node.x1 ?? 0) + 6}
                                    y={((node.y0 ?? 0) + (node.y1 ?? 0)) / 2}
                                    dy="0.35em"
                                    className="text-[10px] fill-zinc-400 select-none pointer-events-none"
                                    style={{ fontFamily: 'inherit' }}
                                >
                                    {truncatePath(node.name ?? '', 22)}
                                </text>
                                {/* Value label */}
                                {nodeHeight > 14 && (
                                    <text
                                        x={(node.x1 ?? 0) + 6}
                                        y={((node.y0 ?? 0) + (node.y1 ?? 0)) / 2 + 12}
                                        dy="0.35em"
                                        className="text-[9px] fill-zinc-600 select-none pointer-events-none"
                                        style={{ fontFamily: 'inherit' }}
                                    >
                                        {nodeValue.toLocaleString()} users
                                    </text>
                                )}
                            </motion.g>
                        );
                    })}
                </g>
            </svg>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 shadow-xl text-xs text-white pointer-events-none"
                    style={{
                        left: tooltip.x + 12,
                        top: tooltip.y - 10,
                    }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
}

// ─── Slider Control ───

function SliderControl({ label, value, onChange, min, max, step = 1 }: {
    label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
    return (
        <div className="flex items-center gap-3">
            <label className="text-[11px] text-zinc-400 font-medium whitespace-nowrap min-w-[100px]">
                {label}: <span className="text-white font-bold">{value}</span>
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-white/[0.06] rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3.5
                    [&::-webkit-slider-thumb]:h-3.5
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-emerald-400
                    [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-[#0a0a0a]
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-lg"
            />
        </div>
    );
}

// ─── Step Filter Input ───

function StepFilterInput({ step, value, onChange, onClear }: {
    step: number; value: string; onChange: (v: string) => void; onClear: () => void;
}) {
    return (
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
            <span className="text-[10px] font-semibold text-zinc-500 whitespace-nowrap">
                Step {step}
            </span>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Filter path..."
                className="flex-1 bg-transparent text-[11px] text-white placeholder-zinc-600 outline-none min-w-[80px]"
            />
            {value && (
                <button onClick={onClear} className="text-zinc-600 hover:text-zinc-300 transition">
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

// ─── Landing Pages Table ───

function LandingPagesSection({ pages }: { pages: LandingPageRow[] }) {
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
                    <span className="col-span-5 text-[11px] text-zinc-500 font-semibold">Page</span>
                    <span className="col-span-2 text-[11px] text-zinc-500 font-semibold text-right">Entries</span>
                    <span className="col-span-2 text-[11px] text-zinc-500 font-semibold text-right">Share</span>
                    <span className="col-span-3 text-[11px] text-zinc-500 font-semibold text-right">Avg Pages After</span>
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

function ExitPagesSection({ pages }: { pages: ExitPageRow[] }) {
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
                    <span className="col-span-5 text-[11px] text-zinc-500 font-semibold">Page</span>
                    <span className="col-span-2 text-[11px] text-zinc-500 font-semibold text-right">Exits</span>
                    <span className="col-span-2 text-[11px] text-zinc-500 font-semibold text-right">Share</span>
                    <span className="col-span-3 text-[11px] text-zinc-500 font-semibold text-right">Avg Session</span>
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

// ─── Main Page ───

export default function JourneysPage() {
    const { selectedProperty, range } = useAnalyticsContext();
    const { data, isLoading, error } = useSWR<JourneyResponse>(
        selectedProperty ? `/api/analytics/journeys?propertyId=${selectedProperty}&range=${range}` : null,
        fetcher
    );

    // Controls
    const [stepCount, setStepCount] = useState(4);
    const [maxJourneys, setMaxJourneys] = useState(50);
    const [stepFilters, setStepFilters] = useState<Record<number, string>>({});
    const [showFilters, setShowFilters] = useState(false);

    // Responsive container
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(800);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Filter and limit journeys
    const filteredJourneys = useMemo(() => {
        const journeys: Journey[] = data?.journeys || [];

        return journeys
            .filter(j => {
                // Filter by step count: only include journeys with exactly stepCount steps
                // (counting EXIT as a step)
                if (j.steps.length > stepCount) return false;

                // Apply step path filters
                for (const [stepIdx, filterVal] of Object.entries(stepFilters)) {
                    if (!filterVal) continue;
                    const idx = Number(stepIdx);
                    const step = j.steps[idx];
                    if (!step) return false;
                    if (!step.toLowerCase().includes(filterVal.toLowerCase())) return false;
                }

                return true;
            })
            .slice(0, maxJourneys);
    }, [data?.journeys, stepCount, maxJourneys, stepFilters]);

    const updateStepFilter = useCallback((step: number, value: string) => {
        setStepFilters(prev => ({ ...prev, [step]: value }));
    }, []);

    const clearStepFilter = useCallback((step: number) => {
        setStepFilters(prev => {
            const next = { ...prev };
            delete next[step];
            return next;
        });
    }, []);

    const activeFilterCount = Object.values(stepFilters).filter(v => v).length;

    // Compute diagram height based on unique nodes
    const diagramHeight = useMemo(() => {
        const uniqueNodes = new Set<string>();
        filteredJourneys.forEach(j => {
            j.steps.forEach((s, i) => uniqueNodes.add(`${i}:${s}`));
        });
        return Math.max(300, Math.min(600, uniqueNodes.size * 28));
    }, [filteredJourneys]);

    // ─── Loading ───

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Journeys" />;
    }

    // ─── Error ───

    if (error) {
        return (
            <AnalyticsSubpageEmptyState
                title="Journey data is temporarily unavailable"
                description="We couldn't load the latest path exploration view right now. Try again in a moment."
            />
        );
    }

    const overview = data?.overview;
    const landingPages = data?.landingPages || [];
    const exitPages = data?.exitPages || [];
    const journeys: Journey[] = data?.journeys || [];

    return (
        <AnalyticsSubpageShell
            eyebrow="Journeys"
            title="Journeys"
            description="Path exploration, entries, and exits."
            actions={(
                <div className="flex items-center gap-3">
                    <AnalyticsSubpageBadge label={`${filteredJourneys.length} visible journeys`} tone="emerald" />
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            showFilters || activeFilterCount > 0
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
                        }`}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        Filters
                        {activeFilterCount > 0 ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold">
                                {activeFilterCount}
                            </span>
                        ) : null}
                    </button>
                </div>
            )}
        >
            <AnalyticsSubpageMetricGrid>
                <AnalyticsSubpageMetricCard
                    label="Avg Path Length"
                    value={`${overview?.avgPathLength ?? 0} pages`}
                    icon={Footprints}
                    tone="emerald"
                />
                <AnalyticsSubpageMetricCard
                    label="Avg Time on Site"
                    value={formatDuration(overview?.avgTimeOnSite ?? 0)}
                    icon={Clock}
                    tone="cyan"
                />
                <AnalyticsSubpageMetricCard
                    label="Bounce Rate"
                    value={`${overview?.bounceRate ?? 0}%`}
                    icon={TrendingUp}
                    tone="mixed"
                />
                <AnalyticsSubpageMetricCard
                    label="Most Common Path"
                    value={overview?.mostCommonPath ?? '-'}
                    icon={BarChart3}
                    tone="amber"
                />
            </AnalyticsSubpageMetricGrid>

            <AnalyticsSubpagePanel
                title="Flow controls"
                action={<AnalyticsSubpageBadge label={`Max ${stepCount} steps`} tone="mixed" />}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SliderControl
                        label="Max Steps"
                        value={stepCount}
                        onChange={setStepCount}
                        min={2}
                        max={6}
                    />
                    <SliderControl
                        label="Max Journeys"
                        value={maxJourneys}
                        onChange={setMaxJourneys}
                        min={10}
                        max={200}
                        step={10}
                    />
                </div>

                {showFilters ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 border-t border-white/[0.06] pt-4">
                            <p className="mb-3 text-[11px] font-semibold text-zinc-500">
                                Step filters
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                {Array.from({ length: stepCount }, (_, i) => (
                                    <StepFilterInput
                                        key={i}
                                        step={i + 1}
                                        value={stepFilters[i] || ''}
                                        onChange={(value) => updateStepFilter(i, value)}
                                        onClear={() => clearStepFilter(i)}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </AnalyticsSubpagePanel>

            <AnalyticsSubpagePanel
                title="Path explorer"
                className="overflow-hidden"
            >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <div ref={containerRef} className="min-w-0">
                        {filteredJourneys.length > 0 ? (
                            <div className="overflow-x-auto -mx-2 px-2">
                                <SankeyDiagram
                                    journeys={filteredJourneys}
                                    width={Math.max(600, containerWidth - 40)}
                                    height={diagramHeight}
                                />
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/[0.1] bg-white/[0.02] p-6 text-center">
                                <Route className="h-8 w-8 text-zinc-600" />
                                <p className="text-sm text-zinc-400">No journeys match the current filters.</p>
                                <button
                                    onClick={() => {
                                        setStepFilters({});
                                        setStepCount(4);
                                        setMaxJourneys(50);
                                    }}
                                    className="text-xs font-medium text-emerald-400 transition hover:text-emerald-300"
                                >
                                    Reset filters
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <AnalyticsInsightList
                            items={[
                                {
                                    label: 'Most common path',
                                    value: overview?.mostCommonPath ?? 'No path data',
                                    note: 'Use this as the baseline route to compare against the rest of the explorer.',
                                },
                                {
                                    label: 'Top landing page',
                                    value: landingPages[0]?.page || 'No landing data',
                                    note: landingPages[0]
                                        ? `${landingPages[0].entries.toLocaleString()} entries • ${landingPages[0].percentage}% share`
                                        : 'No landing page breakdown is available yet.',
                                },
                                {
                                    label: 'Top exit page',
                                    value: exitPages[0]?.page || 'No exit data',
                                    note: exitPages[0]
                                        ? `${exitPages[0].exits.toLocaleString()} exits • ${exitPages[0].percentage}% share`
                                        : 'No exit page breakdown is available yet.',
                                },
                            ]}
                        />
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LandingPagesSection pages={landingPages} />
                <ExitPagesSection pages={exitPages} />
            </div>

            {journeys.length === 0 ? (
                <AnalyticsSubpageEmptyState
                    title="No journey data yet"
                    description="Journey analysis will become useful once the property has enough navigation volume to model page-to-page paths."
                />
            ) : null}
        </AnalyticsSubpageShell>
    );
}
