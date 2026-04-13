'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const LineChart = dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), { ssr: false });
const Line = dynamic(() => import('recharts').then(m => ({ default: m.Line })), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => ({ default: m.PieChart })), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => ({ default: m.Pie })), { ssr: false });
const Cell = dynamic(() => import('recharts').then(m => ({ default: m.Cell })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Loader2,
    PencilLine,
    Plus,
    Sparkles,
    Target,
    Trash2,
    TrendingUp,
    Trophy,
} from 'lucide-react';

import type { GoalDefinition, GoalDefinitionType, GoalSuggestion } from '@/lib/analyticsDefinitions';
import { getGa4AvailabilityCopy } from '@/lib/dashboardSelection';
import {
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsContext } from '../layout';

interface GoalDefinitionsResponse {
    definitions: GoalDefinition[];
    suggestions: GoalSuggestion[];
}

interface GoalAnalyticsResponse {
    definition: GoalDefinition;
    summary: {
        conversions: number;
        totalSessions: number;
        rate: number;
        change: number;
        rateChange: number;
    };
    trend: Array<{
        date: string;
        conversions: number;
        users: number;
    }>;
    sourceContribution: Array<{
        source: string;
        conversions: number;
        share: number;
    }>;
    pageContribution: Array<{
        page: string;
        conversions: number;
        share: number;
    }>;
    explanation: string;
}

interface GoalEditorState {
    open: boolean;
    mode: 'create' | 'edit';
    editingId?: string;
    values: {
        name: string;
        description: string;
        type: GoalDefinitionType;
        target: string;
    };
}

interface GoalBoardEntry {
    key: string;
    selection: GoalSelection;
    data: GoalAnalyticsResponse;
    color: string;
}

type GoalSelection =
    | {
        kind: 'saved';
        key: string;
        item: GoalDefinition;
    }
    | {
        kind: 'suggestion';
        key: string;
        item: GoalSuggestion;
    };

interface TrendTooltipEntry {
    color?: string;
    dataKey?: string;
    name?: string;
    value?: number;
}

const GOAL_COLORS = ['#37E6C7', '#4E9BFF', '#C07DFF', '#F08AC2'];
const EMPTY_DEFINITIONS: GoalDefinition[] = [];
const EMPTY_SUGGESTIONS: GoalSuggestion[] = [];
const EMPTY_BOARD: GoalBoardEntry[] = [];

const EMPTY_EDITOR: GoalEditorState = {
    open: false,
    mode: 'create',
    values: {
        name: '',
        description: '',
        type: 'event_count',
        target: '',
    },
};

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error || body.detail || 'Request failed');
    }
    return body;
}

function formatCompactNumber(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    return value.toLocaleString();
}

function formatPercent(value: number, digits = 1) {
    return `${value.toFixed(digits)}%`;
}

function formatSignedPercent(value: number, digits = 1) {
    return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatSignedPoints(value: number) {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function typeLabel(type: GoalDefinitionType) {
    return type === 'event_count' ? 'Event goal' : 'Page goal';
}

function goalTargetLabel(selection: GoalSelection) {
    if (selection.item.type === 'event_count') {
        return selection.item.target.replace(/_/g, ' ');
    }

    return selection.item.target;
}

function buildSelection(
    selectedKey: string | null,
    definitions: GoalDefinition[],
    suggestions: GoalSuggestion[],
): GoalSelection | null {
    if (selectedKey?.startsWith('saved:')) {
        const item = definitions.find((definition) => definition.id === selectedKey.replace('saved:', ''));
        if (item) {
            return { kind: 'saved', key: selectedKey, item };
        }
    }

    if (selectedKey?.startsWith('suggestion:')) {
        const index = Number(selectedKey.replace('suggestion:', ''));
        const item = suggestions[index];
        if (item) {
            return { kind: 'suggestion', key: selectedKey, item };
        }
    }

    const activeDefinition = definitions.find((definition) => definition.isActive);
    if (activeDefinition) {
        return { kind: 'saved', key: `saved:${activeDefinition.id}`, item: activeDefinition };
    }

    if (definitions[0]) {
        return { kind: 'saved', key: `saved:${definitions[0].id}`, item: definitions[0] };
    }

    if (suggestions[0]) {
        return { kind: 'suggestion', key: 'suggestion:0', item: suggestions[0] };
    }

    return null;
}

function buildBoardSelections(
    selectedKey: string | null,
    definitions: GoalDefinition[],
    suggestions: GoalSuggestion[],
) {
    const selections: GoalSelection[] = [];
    const seen = new Set<string>();

    const append = (selection: GoalSelection | null) => {
        if (!selection || seen.has(selection.key) || selections.length >= 4) return;
        seen.add(selection.key);
        selections.push(selection);
    };

    append(buildSelection(selectedKey, definitions, suggestions));

    definitions
        .filter((definition) => definition.isActive)
        .forEach((definition) => append({ kind: 'saved', key: `saved:${definition.id}`, item: definition }));

    suggestions.forEach((suggestion, index) => {
        append({ kind: 'suggestion', key: `suggestion:${index}`, item: suggestion });
    });

    definitions
        .filter((definition) => !definition.isActive)
        .forEach((definition) => append({ kind: 'saved', key: `saved:${definition.id}`, item: definition }));

    return selections;
}

function buildGoalAnalyticsUrl(propertyId: string, range: string, selection: GoalSelection) {
    const params = new URLSearchParams({
        propertyId,
        range,
        type: selection.item.type,
        target: selection.item.target,
        name: selection.item.name,
    });

    const description = 'description' in selection.item ? selection.item.description || '' : selection.item.description;
    if (description) {
        params.set('description', description);
    }

    return `/api/analytics/goals?${params.toString()}`;
}

function previousValueFromChange(current: number, changePercent: number) {
    const denominator = 1 + changePercent / 100;
    if (!Number.isFinite(denominator) || denominator <= 0) return 0;
    return current / denominator;
}

function buildMergedTrend(board: GoalBoardEntry[]) {
    const points = new Map<string, Record<string, number | string>>();

    board.forEach((entry) => {
        entry.data.trend.forEach((point) => {
            const existing = points.get(point.date) || { date: point.date };
            existing[entry.key] = point.conversions;
            points.set(point.date, existing);
        });
    });

    return Array.from(points.values()).sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function deriveSpike(entry: GoalBoardEntry | null) {
    if (!entry || entry.data.trend.length < 3) return null;
    const peak = entry.data.trend.reduce((max, point) => (
        point.conversions > max.conversions ? point : max
    ), entry.data.trend[0]);
    const average = entry.data.trend.reduce((sum, point) => sum + point.conversions, 0) / entry.data.trend.length;

    if (peak.conversions <= average * 1.25) return null;

    return {
        date: peak.date,
        conversions: peak.conversions,
        lift: average ? ((peak.conversions - average) / average) * 100 : 0,
    };
}

function GoalTrendTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TrendTooltipEntry[];
    label?: string | number;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-2xl border border-white/[0.1] bg-[#08090b]/95 px-4 py-3 shadow-2xl backdrop-blur">
            <p className="text-[11px] font-semibold text-zinc-200">
                {label ? formatAxisDate(String(label)) : ''}
            </p>
            <div className="mt-2 space-y-1.5">
                {payload.map((item) => (
                    <div key={item.dataKey || item.name} className="flex items-center justify-between gap-5">
                        <div className="flex items-center gap-2">
                            <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: item.color || '#ffffff' }}
                            />
                            <span className="text-[11px] font-medium text-zinc-400">{item.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-white">
                            {formatCompactNumber(Number(item.value || 0))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GoalSparkline({ trend, color }: { trend: GoalAnalyticsResponse['trend']; color: string }) {
    if (!trend.length) {
        return <span className="text-[11px] font-medium text-zinc-600">No trend</span>;
    }

    return (
        <div className="h-10 w-[120px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                    <Line
                        type="monotone"
                        dataKey="conversions"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function GoalsKpiCard({
    label,
    value,
    accent,
    tone,
}: {
    label: string;
    value: string;
    accent: string;
    tone: 'cyan' | 'emerald' | 'violet' | 'rose';
}) {
    const toneText = {
        cyan: 'text-[#37E6C7]',
        emerald: 'text-[#37E6C7]',
        violet: 'text-[#C07DFF]',
        rose: 'text-[#F08AC2]',
    } as const;
    const toneBg = {
        cyan: 'bg-[#37E6C7]/10 border-[#37E6C7]/20',
        emerald: 'bg-[#37E6C7]/10 border-[#37E6C7]/20',
        violet: 'bg-[#C07DFF]/10 border-[#C07DFF]/20',
        rose: 'bg-[#F08AC2]/10 border-[#F08AC2]/20',
    } as const;

    return (
        <div className="rounded-[16px] border border-white/[0.04] bg-[#111216] p-5 transition-colors hover:bg-[#14151a]">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-[13px] font-medium text-[#8F95B2]">{label}</h3>
                <span className={cx('rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-sm', toneText[tone], toneBg[tone])}>
                    {accent}
                </span>
            </div>
            <p className="mt-4 text-[32px] font-semibold tracking-[-0.02em] text-white">
                {value}
            </p>
        </div>
    );
}

export default function GoalsPage() {
    const {
        selectedProperty,
        selectedSite,
        range,
        hasGoogleConnection,
        ga4Availability,
        propertyInventoryError,
    } = useAnalyticsContext();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [editorState, setEditorState] = useState<GoalEditorState>(EMPTY_EDITOR);
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const ga4AvailabilityCopy = getGa4AvailabilityCopy(ga4Availability, selectedSite, propertyInventoryError);

    const { data: definitionsResponse, error: definitionsError, isLoading: definitionsLoading, mutate: mutateDefinitions } = useSWR<GoalDefinitionsResponse>(
        selectedProperty && hasGoogleConnection
            ? `/api/analytics/goals/definitions?propertyId=${encodeURIComponent(selectedProperty)}&range=${encodeURIComponent(range)}`
            : null,
        fetchJson,
    );

    const definitions = useMemo(
        () => definitionsResponse?.definitions ?? EMPTY_DEFINITIONS,
        [definitionsResponse?.definitions],
    );
    const suggestions = useMemo(
        () => definitionsResponse?.suggestions ?? EMPTY_SUGGESTIONS,
        [definitionsResponse?.suggestions],
    );

    useEffect(() => {
        const nextSelection = buildSelection(selectedKey, definitions, suggestions);
        if (!nextSelection && (definitions.length || suggestions.length)) {
            const fallback = buildSelection(null, definitions, suggestions);
            setSelectedKey(fallback?.key || null);
            return;
        }

        if (selectedKey && !nextSelection) {
            const fallback = buildSelection(null, definitions, suggestions);
            setSelectedKey(fallback?.key || null);
        }
    }, [definitions, selectedKey, suggestions]);

    const currentSelection = useMemo(
        () => buildSelection(selectedKey, definitions, suggestions),
        [definitions, selectedKey, suggestions],
    );

    const boardSelections = useMemo(
        () => buildBoardSelections(selectedKey, definitions, suggestions),
        [definitions, selectedKey, suggestions],
    );

    const {
        data: boardData,
        error: boardError,
        isLoading: boardLoading,
        mutate: mutateBoard,
    } = useSWR<GoalBoardEntry[]>(
        selectedProperty && boardSelections.length
            ? ['goal-board', selectedProperty, range, boardSelections.map((selection) => selection.key).join('|')]
            : null,
        async () => {
            const results = await Promise.all(boardSelections.map(async (selection, index) => {
                try {
                    const data = await fetchJson<GoalAnalyticsResponse>(buildGoalAnalyticsUrl(selectedProperty, range, selection));
                    return {
                        key: selection.key,
                        selection,
                        data,
                        color: GOAL_COLORS[index % GOAL_COLORS.length],
                    };
                } catch {
                    return null;
                }
            }));

            return results.filter((entry): entry is GoalBoardEntry => Boolean(entry));
        },
    );

    const board = useMemo(
        () => boardData ?? EMPTY_BOARD,
        [boardData],
    );
    const selectedEntry = board.find((entry) => entry.key === currentSelection?.key) || board[0] || null;
    const mergedTrend = useMemo(() => buildMergedTrend(board), [board]);

    const totals = useMemo(() => {
        const totalConversions = board.reduce((sum, entry) => sum + entry.data.summary.conversions, 0);
        const totalSessions = board.reduce((sum, entry) => sum + entry.data.summary.totalSessions, 0);
        const activeGoals = definitions.filter((definition) => definition.isActive).length;
        const previousConversions = board.reduce((sum, entry) => (
            sum + previousValueFromChange(entry.data.summary.conversions, entry.data.summary.change)
        ), 0);
        const conversionChange = previousConversions
            ? ((totalConversions - previousConversions) / previousConversions) * 100
            : totalConversions > 0 ? 100 : 0;
        const averageRateChange = board.length
            ? board.reduce((sum, entry) => sum + entry.data.summary.rateChange, 0) / board.length
            : 0;

        return {
            totalConversions,
            totalSessions,
            conversionRate: totalSessions ? (totalConversions / totalSessions) * 100 : 0,
            activeGoals,
            conversionChange,
            averageRateChange,
        };
    }, [board, definitions]);

    const insights = useMemo(() => {
        const spike = deriveSpike(selectedEntry);
        const bestGoal = board.reduce<GoalBoardEntry | null>((currentBest, entry) => {
            if (!currentBest) return entry;
            return entry.data.summary.rate > currentBest.data.summary.rate ? entry : currentBest;
        }, null);
        const fallingGoal = board.reduce<GoalBoardEntry | null>((currentWorst, entry) => {
            if (!currentWorst) return entry;
            return entry.data.summary.change < currentWorst.data.summary.change ? entry : currentWorst;
        }, null);

        return { spike, bestGoal, fallingGoal };
    }, [board, selectedEntry]);

    const goalAlerts = useMemo(() => {
        const alerts: Array<{ tone: 'positive' | 'warning'; label: string; detail: string }> = [];

        if (selectedEntry?.data.sourceContribution[0]?.share > 55) {
            alerts.push({
                tone: 'warning',
                label: 'Source concentration',
                detail: `${selectedEntry.data.sourceContribution[0].source} drives ${formatPercent(selectedEntry.data.sourceContribution[0].share)} of ${selectedEntry.data.definition.name}.`,
            });
        }

        board
            .filter((entry) => entry.data.summary.change < 0)
            .slice(0, 2)
            .forEach((entry) => {
                alerts.push({
                    tone: 'warning',
                    label: entry.data.definition.name,
                    detail: `${formatSignedPercent(entry.data.summary.change)} vs previous period.`,
                });
            });

        if (selectedEntry?.data.summary.rateChange > 0) {
            alerts.push({
                tone: 'positive',
                label: 'Rate improvement',
                detail: `${selectedEntry.data.definition.name} moved ${formatSignedPoints(selectedEntry.data.summary.rateChange)} this range.`,
            });
        }

        return alerts.slice(0, 3);
    }, [board, selectedEntry]);

    const openCreate = () => {
        const starter = currentSelection?.kind === 'suggestion' ? currentSelection.item : suggestions[0];
        setActionError(null);
        setEditorState({
            open: true,
            mode: 'create',
            values: {
                name: starter?.name || '',
                description: starter?.description || '',
                type: starter?.type || 'event_count',
                target: starter?.target || '',
            },
        });
    };

    const openEdit = (definition: GoalDefinition) => {
        setActionError(null);
        setEditorState({
            open: true,
            mode: 'edit',
            editingId: definition.id,
            values: {
                name: definition.name,
                description: definition.description || '',
                type: definition.type,
                target: definition.target,
            },
        });
    };

    const closeEditor = () => {
        if (saving) return;
        setEditorState(EMPTY_EDITOR);
        setActionError(null);
    };

    const handleSave = async () => {
        if (!selectedProperty) return;
        const name = editorState.values.name.trim();
        const target = editorState.values.target.trim();

        if (!name || !target) {
            setActionError('Name and target are required.');
            return;
        }

        try {
            setSaving(true);
            setActionError(null);

            if (editorState.mode === 'create') {
                const created = await fetchJson<GoalDefinition>('/api/analytics/goals/definitions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        propertyId: selectedProperty,
                        name,
                        description: editorState.values.description.trim(),
                        type: editorState.values.type,
                        target,
                    }),
                });

                await mutateDefinitions();
                setSelectedKey(`saved:${created.id}`);
            } else if (editorState.editingId) {
                await fetchJson(`/api/analytics/goals/definitions/${editorState.editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        description: editorState.values.description.trim(),
                        type: editorState.values.type,
                        target,
                        isActive: true,
                    }),
                });

                await mutateDefinitions();
                setSelectedKey(`saved:${editorState.editingId}`);
            }

            await mutateBoard();
            setEditorState(EMPTY_EDITOR);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to save goal');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (definition: GoalDefinition) => {
        const confirmed = window.confirm(`Delete "${definition.name}"?`);
        if (!confirmed) return;

        try {
            setSaving(true);
            await fetchJson(`/api/analytics/goals/definitions/${definition.id}`, { method: 'DELETE' });
            await mutateDefinitions();
            await mutateBoard();
            if (selectedKey === `saved:${definition.id}`) {
                setSelectedKey(null);
            }
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to delete goal');
        } finally {
            setSaving(false);
        }
    };

    if (!hasGoogleConnection) {
        return (
            <AnalyticsSubpageEmptyState
                title="Goals need Google Analytics"
                description="Connect Google Analytics to create and analyze conversion goals."
            />
        );
    }

    if (!selectedProperty) {
        return (
            <AnalyticsSubpageEmptyState
                title={ga4AvailabilityCopy.title}
                description={ga4AvailabilityCopy.description}
            />
        );
    }

    if (definitionsLoading) {
        return <AnalyticsSubpageLoadingState title="Loading goals" cards={4} />;
    }

    if (definitionsError) {
        return (
            <AnalyticsSubpageEmptyState
                title="Goals are unavailable"
                description="We couldn't load your goal definitions right now."
            />
        );
    }

    if (!definitions.length && !suggestions.length) {
        return (
            <div className="rounded-[24px] border border-white/[0.08] bg-[#090b0d] px-6 py-12 text-center shadow-[0_24px_72px_rgba(0,0,0,0.22)]">
                <p className="text-lg font-semibold tracking-[-0.02em] text-white">No goals available</p>
                <p className="mx-auto mt-2 max-w-lg text-sm font-medium text-zinc-500">
                    Create a goal to start tracking conversion performance.
                </p>
                <div className="mt-5">
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.12] px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.18]"
                    >
                        <Plus className="h-4 w-4" />
                        Create goal
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-[28px] font-semibold tracking-tight text-white drop-shadow-sm">
                        Conversion Goals
                    </h1>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                        Track conversion performance, compare goals, and spot what&apos;s changed fast.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#111216] px-4 py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-[#15171c]"
                    >
                        Last 30 Days
                        <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center gap-2 rounded-xl border border-[#37E6C7]/30 bg-[#37E6C7]/10 px-4 py-2 text-[13px] font-medium text-[#37E6C7] transition hover:bg-[#37E6C7]/20"
                    >
                        <Plus className="h-4 w-4" />
                        Create Goal
                    </button>
                </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <GoalsKpiCard
                    label="Total Conversions"
                    value={formatCompactNumber(totals.totalConversions)}
                    accent={formatSignedPercent(totals.conversionChange)}
                    tone="cyan"
                />
                <GoalsKpiCard
                    label="Conversion Rate"
                    value={formatPercent(totals.conversionRate)}
                    accent={formatSignedPoints(totals.averageRateChange)}
                    tone="emerald"
                />
                <GoalsKpiCard
                    label="Tracked Sessions"
                    value={formatCompactNumber(totals.totalSessions)}
                    accent={`${board.length} tracked`}
                    tone="violet"
                />
                <GoalsKpiCard
                    label="Active Goals"
                    value={String(totals.activeGoals || board.length)}
                    accent={`${suggestions.length} suggestions`}
                    tone="rose"
                />
            </div>

            {boardLoading ? (
                <AnalyticsSubpageLoadingState title="Loading goal analytics" cards={4} />
            ) : boardError || !board.length ? (
                <AnalyticsSubpageEmptyState
                    title="Goal analytics are unavailable"
                    description="We couldn't load goal performance for the selected property."
                />
            ) : (
                <>
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.9fr)] items-start">
                        <div className="flex flex-col gap-6">
<section className="flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#37E6C7]/10 text-[#37E6C7]">
                                        <TrendingUp className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-[17px] font-semibold text-white">Performance</h2>
                                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Track conversion performance, compare goals, and find trends.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr>
                                            <th className="border-b border-white/[0.04] px-1 py-3 text-left text-[11px] font-medium text-zinc-500">Goal</th>
                                            <th className="border-b border-white/[0.04] px-4 py-3 text-right text-[11px] font-medium text-zinc-500">Total Conversions</th>
                                            <th className="border-b border-white/[0.04] px-4 py-3 text-left text-[11px] font-medium text-zinc-500">Conv. Rate</th>
                                            <th className="border-b border-white/[0.04] px-4 py-3 text-right text-[11px] font-medium text-zinc-500">Change</th>
                                            <th className="border-b border-white/[0.04] px-1 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {board.map((entry) => {
                                            const isSelected = entry.key === selectedEntry?.key;
                                            return (
                                                <tr
                                                    key={entry.key}
                                                    className={cx(
                                                        'group cursor-pointer transition-colors duration-200',
                                                        isSelected ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]',
                                                    )}
                                                    onClick={() => setSelectedKey(entry.key)}
                                                >
                                                    <td className="border-b border-white/[0.04] px-1 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="min-w-0">
                                                                <p className="flex items-center gap-2 truncate text-[14px] font-semibold text-white">
                                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                                                    {entry.data.definition.name}
                                                                </p>
                                                                <p className="mt-1 truncate text-[11px] font-medium text-zinc-500">
                                                                    {goalTargetLabel(entry.selection)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="border-b border-white/[0.04] px-4 py-4 text-right text-[14px] font-semibold text-white">
                                                        {formatCompactNumber(entry.data.summary.conversions)}
                                                    </td>
                                                    <td className="border-b border-white/[0.04] px-4 py-4">
                                                        <div className="flex w-[120px] items-center gap-3">
                                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(entry.data.summary.rate, 100)}%`, backgroundColor: entry.color }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td
                                                        className={cx(
                                                            'border-b border-white/[0.04] px-4 py-4 text-right text-[13px] font-semibold',
                                                            entry.data.summary.change >= 0 ? 'text-[#37E6C7]' : 'text-rose-400',
                                                        )}
                                                    >
                                                        {formatSignedPercent(entry.data.summary.change)}
                                                    </td>
                                                    <td className="border-b border-white/[0.04] px-1 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    openEdit(entry.data.definition);
                                                                }}
                                                                className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
                                                            >
                                                                <PencilLine className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleDelete(entry.data.definition);
                                                                }}
                                                                className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-rose-400"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

<section className="rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
                        <div className="flex items-center justify-between gap-3 px-2">
                            <div>
                                <h2 className="text-[17px] font-semibold text-white">Conversion Trend</h2>
                                <p className="mt-1 text-[13px] font-medium text-zinc-400">Goal momentum across the current range.</p>
                            </div>
                            <span className="rounded-full border border-white/[0.1] bg-white/[0.05] px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-zinc-300 shadow-sm">
                                {range.toUpperCase()}
                            </span>
                        </div>

                        <div className="mt-5 h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={mergedTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        {board.map((entry) => (
                                            <linearGradient key={entry.key} id={`goal-gradient-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={entry.color} stopOpacity={0.18} />
                                                <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatAxisDate}
                                        tick={{ fill: 'rgba(161,161,170,0.78)', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fill: 'rgba(161,161,170,0.78)', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={40}
                                    />
                                    <Tooltip content={<GoalTrendTooltip />} />
                                    {board.map((entry) => (
                                        <Area
                                            key={entry.key}
                                            type="monotone"
                                            dataKey={entry.key}
                                            name={entry.data.definition.name}
                                            stroke={entry.color}
                                            fill={`url(#goal-gradient-${entry.key})`}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, fill: entry.color, stroke: '#0b0d10', strokeWidth: 2 }}
                                            isAnimationActive={false}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

<section className="flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
                            <h2 className="text-[17px] font-semibold text-white">Breakdown by Source</h2>
                            <p className="mt-1 text-[13px] font-medium text-zinc-400">Where the selected goal is being completed.</p>

                            {selectedEntry?.data.sourceContribution.length ? (
                                <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center">
                                    <div className="mx-auto h-40 w-40 shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={selectedEntry.data.sourceContribution}
                                                    dataKey="conversions"
                                                    nameKey="source"
                                                    innerRadius={42}
                                                    outerRadius={62}
                                                    paddingAngle={3}
                                                    stroke="rgba(255,255,255,0.05)"
                                                    strokeWidth={1}
                                                >
                                                    {selectedEntry.data.sourceContribution.map((entry, index) => (
                                                        <Cell key={`${entry.source}-${index}`} fill={GOAL_COLORS[index % GOAL_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-2">
                                        {selectedEntry.data.sourceContribution.slice(0, 5).map((entry, index) => (
                                            <div key={entry.source} className="rounded-[16px] border border-white/[0.06] bg-[#101317] px-3 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GOAL_COLORS[index % GOAL_COLORS.length] }} />
                                                        <span className="truncate text-sm font-semibold text-white">{entry.source}</span>
                                                    </div>
                                                    <span className="text-[12px] font-semibold text-zinc-300">{formatPercent(entry.share)}</span>
                                                </div>
                                                <div className="mt-2 h-1.5 rounded-full bg-white/[0.05]">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${Math.min(entry.share, 100)}%`, backgroundColor: GOAL_COLORS[index % GOAL_COLORS.length] }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-5 text-sm font-medium text-zinc-500">No source contribution data available for this goal.</p>
                            )}
                        </section>
                        </div>
                        <div className="flex flex-col gap-6">
                        <section className="flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C07DFF]/10 text-[#C07DFF]">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div>
                                    <h2 className="text-[17px] font-semibold text-white">Insights &amp; Alerts</h2>
                                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Smart summaries and signals.</p>
                                </div>
                            </div>
                            
                            <div className="mt-4 space-y-3">
                                {insights.spike ? (
                                    <div className="rounded-[20px] border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.12] to-amber-500/[0.02] p-5 shadow-sm backdrop-blur-md">
                                        <div className="flex items-center gap-2 text-amber-300 drop-shadow-sm">
                                            <TrendingUp className="h-4 w-4" />
                                            <span className="text-sm font-bold tracking-tight">Spike detected</span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-white">
                                            {selectedEntry?.data.definition.name}
                                        </p>
                                        <p className="mt-1 text-[12px] font-medium text-zinc-300">
                                            {formatAxisDate(insights.spike.date)} hit {formatCompactNumber(insights.spike.conversions)} conversions, {formatSignedPercent(insights.spike.lift)} above the average day.
                                        </p>
                                    </div>
                                ) : null}

                                {insights.bestGoal ? (
                                    <div className="rounded-[20px] border border-[#37E6C7]/20 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] p-5 shadow-sm backdrop-blur-md">
                                        <div className="flex items-center gap-2 text-[#37E6C7] drop-shadow-sm">
                                            <Trophy className="h-4 w-4" />
                                            <span className="text-sm font-bold tracking-tight">Best converting goal</span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-white">{insights.bestGoal.data.definition.name}</p>
                                        <p className="mt-1 text-[12px] font-medium text-zinc-300">
                                            {formatCompactNumber(insights.bestGoal.data.summary.conversions)} conversions at {formatPercent(insights.bestGoal.data.summary.rate)}.
                                        </p>
                                    </div>
                                ) : null}

                                {insights.fallingGoal ? (
                                    <div className="rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent p-5 shadow-sm backdrop-blur-md">
                                        <div className="flex items-center gap-2 text-zinc-200 drop-shadow-sm">
                                            <AlertTriangle className="h-4 w-4 text-rose-400" />
                                            <span className="text-sm font-bold tracking-tight">Fastest declining goal</span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-white">{insights.fallingGoal.data.definition.name}</p>
                                        <p className="mt-1 text-[12px] font-medium text-zinc-300">
                                            {formatSignedPercent(insights.fallingGoal.data.summary.change)} vs the previous period.
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            {selectedEntry?.data.explanation ? (
                                <div className="mt-4 rounded-[18px] border border-white/[0.08] bg-[#101317] p-4">
                                    <p className="text-[12px] font-semibold text-zinc-500">Selected goal</p>
                                    <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                                        {selectedEntry.data.explanation}
                                    </p>
                                </div>
                            ) : null}
                            
                            <div className="my-6 border-t border-white/[0.04]"></div>
                            
                            <p className="mb-4 text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Active Alerts</p>
                            
                            <div className="mt-5 space-y-2.5">
                                {goalAlerts.length ? goalAlerts.map((alert, index) => (
                                    <div
                                        key={`${alert.label}-${index}`}
                                        className={cx(
                                            'rounded-[18px] border px-4 py-3.5',
                                            alert.tone === 'positive'
                                                ? 'border-[#37E6C7]/16 bg-[#37E6C7]/[0.07]'
                                                : 'border-amber-500/16 bg-amber-500/[0.07]',
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span
                                                className={cx(
                                                    'mt-1 h-2.5 w-2.5 rounded-full',
                                                    alert.tone === 'positive' ? 'bg-[#37E6C7]' : 'bg-amber-300',
                                                )}
                                            />
                                            <div>
                                                <p className="text-sm font-semibold text-white">{alert.label}</p>
                                                <p className="mt-1 text-[12px] font-medium text-zinc-300">{alert.detail}</p>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-[18px] border border-white/[0.06] bg-[#101317] px-4 py-4">
                                        <p className="text-sm font-semibold text-white">No immediate alerts</p>
                                        <p className="mt-1 text-[12px] font-medium text-zinc-400">
                                            Current goal set looks stable across the selected range.
                                        </p>
                                    </div>
                                )}
                            </div>
                        
                        </section>

<section className="flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
                            <h2 className="text-[17px] font-semibold text-white">Top Converting Pages</h2>
                            <p className="mt-1 text-[13px] font-medium text-zinc-400">Pages contributing the strongest goal volume.</p>

                            <div className="mt-5 space-y-2.5">
                                {selectedEntry?.data.pageContribution.length ? selectedEntry.data.pageContribution.slice(0, 5).map((entry, index) => (
                                    <div key={entry.page} className="rounded-[18px] border border-white/[0.06] bg-[#101317] px-4 py-3.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">{entry.page || 'Homepage'}</p>
                                                <p className="mt-1 text-[11px] font-medium text-zinc-400">#{index + 1} contribution</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-semibold text-white">{formatCompactNumber(entry.conversions)}</p>
                                                <p className="mt-1 text-[11px] font-medium text-emerald-300">{formatPercent(entry.share)}</p>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm font-medium text-zinc-500">No page contribution data available for this goal.</p>
                                )}
                            </div>
                        </section>
                        </div>
                    </div>                </>
            )}

            {editorState.open ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        onClick={closeEditor}
                    />
                    <div className="relative w-full max-w-[720px] rounded-[28px] border border-white/[0.1] bg-[#080a0d] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.56)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[12px] font-semibold text-zinc-500">
                                    {editorState.mode === 'create' ? 'Create goal' : 'Edit goal'}
                                </p>
                                <h2 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] text-white">
                                    {editorState.mode === 'create' ? 'Create a new goal' : 'Update goal'}
                                </h2>
                                <p className="mt-2 text-[13px] font-medium text-zinc-400">
                                    Keep the management flow compact while the analytics canvas stays clean.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEditor}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-semibold text-zinc-400 transition hover:border-white/[0.12] hover:text-white"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Goal name</span>
                                <input
                                    value={editorState.values.name}
                                    onChange={(event) => setEditorState((current) => ({
                                        ...current,
                                        values: { ...current.values, name: event.target.value },
                                    }))}
                                    className="w-full rounded-[16px] border border-white/[0.08] bg-[#101317] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-emerald-500/28"
                                    placeholder="Blog engagement"
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Goal type</span>
                                <select
                                    value={editorState.values.type}
                                    onChange={(event) => setEditorState((current) => ({
                                        ...current,
                                        values: { ...current.values, type: event.target.value as GoalDefinitionType },
                                    }))}
                                    className="w-full rounded-[16px] border border-white/[0.08] bg-[#101317] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-emerald-500/28"
                                >
                                    <option value="event_count">Event goal</option>
                                    <option value="page_visit">Page goal</option>
                                </select>
                            </label>

                            <label className="space-y-2 md:col-span-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Target</span>
                                <input
                                    value={editorState.values.target}
                                    onChange={(event) => setEditorState((current) => ({
                                        ...current,
                                        values: { ...current.values, target: event.target.value },
                                    }))}
                                    className="w-full rounded-[16px] border border-white/[0.08] bg-[#101317] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-emerald-500/28"
                                    placeholder={editorState.values.type === 'event_count' ? 'generate_lead' : '/pricing'}
                                />
                            </label>

                            <label className="space-y-2 md:col-span-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Description</span>
                                <textarea
                                    value={editorState.values.description}
                                    onChange={(event) => setEditorState((current) => ({
                                        ...current,
                                        values: { ...current.values, description: event.target.value },
                                    }))}
                                    className="min-h-[110px] w-full rounded-[16px] border border-white/[0.08] bg-[#101317] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-emerald-500/28"
                                    placeholder="What does success mean for this goal?"
                                />
                            </label>
                        </div>

                        {suggestions.length && editorState.mode === 'create' ? (
                            <div className="mt-6">
                                <div className="mb-3 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-emerald-300" />
                                    <p className="text-sm font-semibold text-white">Starter suggestions</p>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                    {suggestions.slice(0, 4).map((suggestion, index) => (
                                        <button
                                            key={`${suggestion.target}-${index}`}
                                            type="button"
                                            onClick={() => setEditorState((current) => ({
                                                ...current,
                                                values: {
                                                    name: suggestion.name,
                                                    description: suggestion.description,
                                                    type: suggestion.type,
                                                    target: suggestion.target,
                                                },
                                            }))}
                                            className="rounded-[18px] border border-white/[0.08] bg-[#101317] px-4 py-3 text-left transition hover:border-white/[0.12] hover:bg-[#14181d]"
                                        >
                                            <p className="text-sm font-semibold text-white">{suggestion.name}</p>
                                            <p className="mt-1 text-[11px] font-medium text-zinc-400">
                                                {typeLabel(suggestion.type)} • {suggestion.target}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {actionError ? (
                            <div className="mt-5 rounded-[18px] border border-rose-500/18 bg-rose-500/[0.08] px-4 py-3 text-sm font-medium text-rose-200">
                                {actionError}
                            </div>
                        ) : null}

                        <div className="mt-6 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-500">
                                <Target className="h-4 w-4 text-zinc-600" />
                                Saved per property using the existing goals backend.
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-[18px] border border-emerald-500/20 bg-emerald-500/[0.12] px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/28 hover:bg-emerald-500/[0.18] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {editorState.mode === 'create' ? 'Create Goal' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
