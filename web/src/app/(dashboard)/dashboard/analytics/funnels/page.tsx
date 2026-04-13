'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    CheckCircle2,
    ChevronRight,
    Clock3,
    GitBranch,
    Loader2,
    PencilLine,
    Plus,
    Save,
    Trash2,
    Users,
    X,
} from 'lucide-react';

import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import {
    AnalyticsInsightList,
    AnalyticsSectionLink,
    AnalyticsSubpageBadge,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    AnalyticsSubpagePanel,
    AnalyticsSubpageShell,
    formatCompactNumber,
    formatDuration,
    formatPercent,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import type { FunnelDefinition, FunnelSuggestion } from '@/lib/analyticsDefinitions';
import { useAnalyticsContext } from '../layout';

interface FunnelDefinitionsResponse {
    definitions: FunnelDefinition[];
    suggestions: FunnelSuggestion[];
}

interface FunnelAnalyticsResponse {
    definition: FunnelDefinition;
    steps: Array<{
        name: string;
        count: number;
        users: number;
        avgDuration: number;
        percentOfTotal: number;
        dropFromPrevious: number;
    }>;
    summary: {
        totalEntries: number;
        completions: number;
        overallRate: number;
        completionChange: number;
        avgCompletionSessionDuration: number;
    };
    biggestDrop: {
        from: string;
        to: string;
        rate: number;
    };
    trend: Array<{
        date: string;
        entries: number;
        completions: number;
    }>;
}

interface FunnelEditorState {
    open: boolean;
    mode: 'create' | 'edit';
    editingId?: string;
    values: {
        name: string;
        description: string;
        steps: string[];
    };
}

interface ChartTooltipEntry {
    dataKey: string;
    color: string;
    name: string;
    value: number;
}

type FunnelSelection =
    | {
        kind: 'saved';
        key: string;
        item: FunnelDefinition;
    }
    | {
        kind: 'suggestion';
        key: string;
        item: FunnelSuggestion;
    };

const EMPTY_EDITOR: FunnelEditorState = {
    open: false,
    mode: 'create',
    values: {
        name: '',
        description: '',
        steps: ['', '', ''],
    },
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error || body.detail || 'Request failed');
    }
    return body;
}

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildSelection(
    selectedKey: string | null,
    definitions: FunnelDefinition[],
    suggestions: FunnelSuggestion[],
): FunnelSelection | null {
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

    if (definitions[0]) {
        return { kind: 'saved', key: `saved:${definitions[0].id}`, item: definitions[0] };
    }

    if (suggestions[0]) {
        return { kind: 'suggestion', key: 'suggestion:0', item: suggestions[0] };
    }

    return null;
}

function FunnelTrendTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: ChartTooltipEntry[];
    label?: string | number;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[#050505]/95 px-4 py-3 shadow-2xl backdrop-blur">
            <p className="text-[11px] font-semibold text-white">{formatAxisDate(label ? String(label) : '')}</p>
            <div className="mt-2 space-y-1.5">
                {payload.map((item) => (
                    <div key={item.dataKey} className="flex items-center justify-between gap-5">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[11px] text-zinc-500">{item.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-white">
                            {formatCompactNumber(item.value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function FunnelPickerCard({
    title,
    subtitle,
    selected,
    badge,
    onClick,
    onEdit,
    onDelete,
}: {
    title: string;
    subtitle: string;
    selected: boolean;
    badge: ReactNode;
    onClick: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    return (
        <div
            className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                selected
                    ? 'border-cyan-500/30 bg-cyan-500/[0.08] shadow-[0_0_0_1px_rgba(31,190,215,0.08)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-5 text-zinc-500">{subtitle}</p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                    {badge}
                    {onEdit ? (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition hover:border-white/[0.14] hover:text-white"
                        >
                            <PencilLine className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                    {onDelete ? (
                        <button
                            type="button"
                            onClick={onDelete}
                            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-500 transition hover:border-red-500/20 hover:text-red-400"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function FunnelEditor({
    state,
    saving,
    onClose,
    onChange,
    onSubmit,
}: {
    state: FunnelEditorState;
    saving: boolean;
    onClose: () => void;
    onChange: (next: FunnelEditorState['values']) => void;
    onSubmit: () => void;
}) {
    const steps = state.values.steps;

    return (
        <div className="rounded-[24px] border border-white/[0.08] bg-[#050505] p-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold text-zinc-500">
                        {state.mode === 'create' ? 'Create funnel' : 'Edit funnel'}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">Save this flow for the current property.</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-500 transition hover:border-white/[0.14] hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                    <span className="text-[11px] font-medium text-zinc-500">Funnel name</span>
                    <input
                        value={state.values.name}
                        onChange={(event) => onChange({ ...state.values, name: event.target.value })}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/30"
                        placeholder="Pricing to signup"
                    />
                </label>
                <label className="grid gap-2">
                    <span className="text-[11px] font-medium text-zinc-500">Description</span>
                    <textarea
                        value={state.values.description}
                        onChange={(event) => onChange({ ...state.values, description: event.target.value })}
                        rows={3}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/30"
                        placeholder="Explain the flow you want to measure."
                    />
                </label>
                <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-500">Steps</span>
                        <button
                            type="button"
                            onClick={() => onChange({ ...state.values, steps: [...steps, ''] })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-400 transition hover:border-white/[0.12] hover:text-white"
                        >
                            <Plus className="h-3 w-3" />
                            Add step
                        </button>
                    </div>

                    {steps.map((step, index) => (
                        <div key={`${index}-${step}`} className="flex items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/[0.08] text-xs font-semibold text-cyan-300">
                                {index + 1}
                            </div>
                            <input
                                value={step}
                                onChange={(event) => {
                                    const nextSteps = [...steps];
                                    nextSteps[index] = event.target.value;
                                    onChange({ ...state.values, steps: nextSteps });
                                }}
                                className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/30"
                                placeholder="/pricing"
                            />
                            {steps.length > 2 ? (
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...state.values, steps: steps.filter((_, stepIndex) => stepIndex !== index) })}
                                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-500 transition hover:border-red-500/20 hover:text-red-400"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.06] pt-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/[0.12] hover:text-white"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={saving || !state.values.name.trim() || steps.filter((step) => step.trim()).length < 2}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {state.mode === 'create' ? 'Save funnel' : 'Update funnel'}
                </button>
            </div>
        </div>
    );
}

function FunnelStepCard({
    index,
    step,
    isLast,
}: {
    index: number;
    step: FunnelAnalyticsResponse['steps'][number];
    isLast: boolean;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-500">Step {index + 1}</p>
                        <p className="mt-2 truncate text-sm font-semibold text-white">{step.name}</p>
                    </div>
                    <AnalyticsSubpageBadge
                        label={`${step.percentOfTotal.toFixed(0)}% of entry`}
                        tone={index === 0 ? 'emerald' : 'cyan'}
                    />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                        <p className="text-[11px] font-semibold text-zinc-500">Users</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatCompactNumber(step.count)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-zinc-500">Drop-off</p>
                        <p className="mt-1 text-lg font-semibold text-white">
                            {index === 0 ? '—' : formatPercent(step.dropFromPrevious, 1)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-zinc-500">Avg session</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatDuration(step.avgDuration)}</p>
                    </div>
                </div>
            </div>
            {!isLast ? <ChevronRight className="h-5 w-5 shrink-0 text-zinc-700" /> : null}
        </div>
    );
}

export default function FunnelsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [editor, setEditor] = useState<FunnelEditorState>(EMPTY_EDITOR);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const definitionsKey = selectedProperty && hasGoogleConnection
        ? `/api/analytics/funnels/definitions?propertyId=${encodeURIComponent(selectedProperty)}&range=${encodeURIComponent(range)}`
        : null;

    const {
        data: definitionData,
        isLoading: definitionsLoading,
        mutate: mutateDefinitions,
    } = useSWR<FunnelDefinitionsResponse>(definitionsKey, fetchJson, {
        keepPreviousData: true,
    });

    const definitions = useMemo(() => definitionData?.definitions ?? [], [definitionData?.definitions]);
    const suggestions = useMemo(() => definitionData?.suggestions ?? [], [definitionData?.suggestions]);

    const selectedFunnel = useMemo(
        () => buildSelection(selectedKey, definitions, suggestions),
        [selectedKey, definitions, suggestions],
    );

    useEffect(() => {
        if (!selectedFunnel) {
            const fallback = buildSelection(null, definitions, suggestions);
            setSelectedKey(fallback?.key || null);
            return;
        }

        if (selectedFunnel.key !== selectedKey) {
            setSelectedKey(selectedFunnel.key);
        }
    }, [definitions, selectedFunnel, selectedKey, suggestions]);

    const funnelQuery = useMemo(() => {
        if (!selectedProperty || !selectedFunnel) return null;

        const params = new URLSearchParams({
            propertyId: selectedProperty,
            range,
            steps: selectedFunnel.item.steps.join(','),
            name: selectedFunnel.item.name,
        });

        if ('description' in selectedFunnel.item && selectedFunnel.item.description) {
            params.set('description', selectedFunnel.item.description);
        }

        return `/api/analytics/funnels?${params.toString()}`;
    }, [range, selectedFunnel, selectedProperty]);

    const {
        data,
        isLoading: analyticsLoading,
        error: analyticsError,
    } = useSWR<FunnelAnalyticsResponse>(funnelQuery, fetchJson, {
        keepPreviousData: true,
    });

    const openCreate = (prefill?: Partial<FunnelEditorState['values']>) => {
        setEditor({
            open: true,
            mode: 'create',
            values: {
                name: prefill?.name || '',
                description: prefill?.description || '',
                steps: prefill?.steps?.length ? prefill.steps : ['', '', ''],
            },
        });
    };

    const openEdit = (definition: FunnelDefinition) => {
        setEditor({
            open: true,
            mode: 'edit',
            editingId: definition.id,
            values: {
                name: definition.name,
                description: definition.description || '',
                steps: definition.steps.length ? definition.steps : ['', '', ''],
            },
        });
    };

    const closeEditor = () => setEditor(EMPTY_EDITOR);

    const submitEditor = async () => {
        if (!selectedProperty) return;

        try {
            setSaving(true);
            const payload = {
                propertyId: selectedProperty,
                name: editor.values.name.trim(),
                description: editor.values.description.trim(),
                steps: editor.values.steps.map((step) => step.trim()).filter(Boolean),
            };

            const response = editor.mode === 'create'
                ? await fetchJson<FunnelDefinition>('/api/analytics/funnels/definitions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                : await fetchJson<FunnelDefinition>(`/api/analytics/funnels/definitions/${editor.editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

            await mutateDefinitions();
            if (response?.id) {
                setSelectedKey(`saved:${response.id}`);
            }
            closeEditor();
        } catch (error) {
            console.error('Failed to save funnel definition:', error);
        } finally {
            setSaving(false);
        }
    };

    const deleteFunnel = async (definition: FunnelDefinition) => {
        try {
            setDeletingId(definition.id);
            await fetchJson(`/api/analytics/funnels/definitions/${definition.id}`, {
                method: 'DELETE',
            });
            await mutateDefinitions();
            setSelectedKey(null);
        } catch (error) {
            console.error('Failed to delete funnel definition:', error);
        } finally {
            setDeletingId(null);
        }
    };

    if (definitionsLoading && !definitionData) {
        return <AnalyticsSubpageLoadingState title="Funnels" />;
    }

    if (!selectedProperty || (!selectedFunnel && !definitionsLoading)) {
        return (
            <AnalyticsSubpageEmptyState
                title="No funnel context available"
                description="Connect Google Analytics and choose a property to start saving funnel definitions."
            />
        );
    }

    const starterSelection = selectedFunnel?.kind === 'suggestion';
    const stepTableRows = data?.steps || [];

    return (
        <AnalyticsSubpageShell
            eyebrow="Funnels"
            title="Funnels"
            description="Saved step flows with honest drop-off and completion signals."
            actions={(
                <div className="flex items-center gap-3">
                    {selectedFunnel ? (
                        <AnalyticsSubpageBadge
                            label={selectedFunnel.kind === 'saved' ? 'Saved funnel' : 'Starter suggestion'}
                            tone={selectedFunnel.kind === 'saved' ? 'cyan' : 'amber'}
                        />
                    ) : null}
                    <button
                        type="button"
                        onClick={() => openCreate()}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/12 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-500/35 hover:bg-cyan-500/18"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        New funnel
                    </button>
                </div>
            )}
        >
            <AnalyticsSubpagePanel
                title="Funnel definitions"
                description="Saved and suggested flows."
            >
                <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                    <div className="space-y-5">
                        <div>
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-[11px] font-semibold text-zinc-500">Saved funnels</p>
                                <AnalyticsSubpageBadge label={`${definitions.length} saved`} tone="cyan" />
                            </div>
                            <div className="space-y-3">
                                {definitions.length ? definitions.map((definition) => (
                                    <FunnelPickerCard
                                        key={definition.id}
                                        title={definition.name}
                                        subtitle={definition.description || definition.steps.join(' → ')}
                                        selected={selectedKey === `saved:${definition.id}`}
                                        onClick={() => setSelectedKey(`saved:${definition.id}`)}
                                        onEdit={() => openEdit(definition)}
                                        onDelete={() => deleteFunnel(definition)}
                                        badge={<AnalyticsSubpageBadge label={`${definition.steps.length} steps`} tone="cyan" />}
                                    />
                                )) : (
                                    <div className="rounded-[22px] border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-5 text-sm text-zinc-500">
                                        No saved funnels yet. Use a starter suggestion below or create your own.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-[11px] font-semibold text-zinc-500">Starters</p>
                                <AnalyticsSubpageBadge label={`${suggestions.length} suggested`} tone="amber" />
                            </div>
                            <div className="space-y-3">
                                {suggestions.length ? suggestions.map((suggestion, index) => (
                                    <FunnelPickerCard
                                        key={`${suggestion.name}-${index}`}
                                        title={suggestion.name}
                                        subtitle={suggestion.description}
                                        selected={selectedKey === `suggestion:${index}`}
                                        onClick={() => setSelectedKey(`suggestion:${index}`)}
                                        onEdit={() => openCreate({
                                            name: suggestion.name,
                                            description: suggestion.description,
                                            steps: suggestion.steps,
                                        })}
                                        badge={<AnalyticsSubpageBadge label={`${suggestion.steps.length} steps`} tone="amber" />}
                                    />
                                )) : (
                                    <div className="rounded-[22px] border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-5 text-sm text-zinc-500">
                                        No starter suggestions were generated for this property yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {editor.open ? (
                            <FunnelEditor
                                state={editor}
                                saving={saving}
                                onClose={closeEditor}
                                onChange={(values) => setEditor((prev) => ({ ...prev, values }))}
                                onSubmit={submitEditor}
                            />
                        ) : (
                            <div className="rounded-[24px] border border-white/[0.08] bg-[#050505] p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold text-zinc-500">Selected funnel</p>
                                        <h3 className="mt-2 text-xl font-semibold text-white">
                                            {selectedFunnel?.item.name || 'Select a funnel'}
                                        </h3>
                                        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                                            {'description' in (selectedFunnel?.item || {}) && selectedFunnel?.item.description
                                                ? selectedFunnel.item.description
                                                : 'Pick a funnel to load the completion view.'}
                                        </p>
                                    </div>
                                    {selectedFunnel ? (
                                        <AnalyticsSubpageBadge
                                            label={`${selectedFunnel.item.steps.length} steps`}
                                            tone={selectedFunnel.kind === 'saved' ? 'cyan' : 'amber'}
                                        />
                                    ) : null}
                                </div>

                                <div className="mt-5 grid gap-3 md:grid-cols-3">
                                    {selectedFunnel?.item.steps.map((step, index) => (
                                        <div key={`${step}-${index}`} className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-4">
                                            <p className="text-[11px] font-semibold text-zinc-500">Step {index + 1}</p>
                                            <p className="mt-2 text-sm font-medium text-white">{step}</p>
                                        </div>
                                    ))}
                                </div>

                                {starterSelection ? (
                                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
                                        <AnalyticsSectionLink
                                            label="Save starter as funnel"
                                            onClick={() => openCreate({
                                                name: selectedFunnel.item.name,
                                                description: 'description' in selectedFunnel.item ? selectedFunnel.item.description : '',
                                                steps: selectedFunnel.item.steps,
                                            })}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            {analyticsLoading && !data ? (
                <AnalyticsSubpageLoadingState title="Funnel analytics" />
            ) : analyticsError || !data ? (
                <AnalyticsSubpageEmptyState
                    title="Funnel analytics are temporarily unavailable"
                    description="We couldn't compute the latest funnel view right now. Try again in a moment."
                />
            ) : (
                <>
                    <AnalyticsSubpageMetricGrid>
                        <AnalyticsSubpageMetricCard
                            label="Total Entries"
                            value={formatCompactNumber(data.summary.totalEntries)}
                            icon={Users}
                            tone="cyan"
                        />
                        <AnalyticsSubpageMetricCard
                            label="Completions"
                            value={formatCompactNumber(data.summary.completions)}
                            icon={CheckCircle2}
                            tone="emerald"
                            trend={data.summary.completionChange}
                        />
                        <AnalyticsSubpageMetricCard
                            label="Overall Rate"
                            value={formatPercent(data.summary.overallRate, 1)}
                            icon={GitBranch}
                            tone="mixed"
                        />
                        <AnalyticsSubpageMetricCard
                            label="Avg Completion Session"
                            value={formatDuration(data.summary.avgCompletionSessionDuration)}
                            icon={Clock3}
                            tone="amber"
                        />
                    </AnalyticsSubpageMetricGrid>

                    <AnalyticsSubpagePanel
                        title="Completion trend"
                    >
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                            <div className="rounded-[24px] border border-white/[0.06] bg-[#050505] p-4 sm:p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[11px] font-semibold text-zinc-500">Entries vs completions</p>
                                        <p className="mt-1 text-sm text-zinc-400">Top-of-funnel volume vs final-step wins.</p>
                                    </div>
                                    <AnalyticsSubpageBadge label={`${data.definition.steps.length} steps`} tone="cyan" />
                                </div>
                                <div className="h-[320px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.trend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="funnelEntriesGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#1FBED7" stopOpacity={0.22} />
                                                    <stop offset="100%" stopColor="#1FBED7" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={formatAxisDate}
                                                tick={{ fontSize: 11, fill: '#71717a' }}
                                                tickLine={false}
                                                axisLine={false}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: '#71717a' }}
                                                tickLine={false}
                                                axisLine={false}
                                                width={44}
                                            />
                                            <Tooltip content={<FunnelTrendTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.22)', strokeWidth: 1 }} />
                                            <Area
                                                type="monotone"
                                                dataKey="entries"
                                                name="Entries"
                                                stroke="#1FBED7"
                                                fill="url(#funnelEntriesGradient)"
                                                strokeWidth={2.5}
                                                dot={false}
                                                activeDot={{ r: 5, fill: '#1FBED7', stroke: '#050505', strokeWidth: 2 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="completions"
                                                name="Completions"
                                                stroke="#33CF96"
                                                fillOpacity={0}
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 4, fill: '#33CF96', stroke: '#050505', strokeWidth: 2 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <AnalyticsInsightList
                                    items={[
                                        {
                                            label: 'Biggest leak',
                                            value: data.biggestDrop.rate > 0
                                                ? `${data.biggestDrop.from} → ${data.biggestDrop.to}`
                                                : 'No major leak detected',
                                            note: data.biggestDrop.rate > 0
                                                ? `${formatPercent(data.biggestDrop.rate, 1)} drop between adjacent steps`
                                                : 'No material leak in the current range.',
                                        },
                                        {
                                            label: 'Entry volume',
                                            value: formatCompactNumber(data.summary.totalEntries),
                                            note: `${data.definition.steps[0]} is the current entry step.`,
                                        },
                                        {
                                            label: 'Completion rate',
                                            value: formatPercent(data.summary.overallRate, 1),
                                            note: `${formatCompactNumber(data.summary.completions)} completions from ${formatCompactNumber(data.summary.totalEntries)} entries in the selected range.`,
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    </AnalyticsSubpagePanel>

                    <AnalyticsSubpagePanel
                        title="Step breakdown"
                    >
                        <div className="space-y-3">
                            {data.steps.map((step, index) => (
                                <FunnelStepCard
                                    key={`${step.name}-${index}`}
                                    index={index}
                                    step={step}
                                    isLast={index === data.steps.length - 1}
                                />
                            ))}
                        </div>
                    </AnalyticsSubpagePanel>

                    <AnalyticsSubpagePanel
                        title="Step table"
                    >
                        <AnalyticsTable
                            data={stepTableRows}
                            showSearch={false}
                            defaultSort={{ key: 'count', dir: 'desc' }}
                            columns={[
                                {
                                    key: 'name',
                                    label: 'Step',
                                    sortable: true,
                                    getValue: (item) => item.name,
                                    render: (item) => <span className="text-xs font-medium text-zinc-200">{item.name}</span>,
                                },
                                {
                                    key: 'count',
                                    label: 'Users',
                                    align: 'right',
                                    sortable: true,
                                    getValue: (item) => item.count,
                                    render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.count)}</span>,
                                },
                                {
                                    key: 'percentOfTotal',
                                    label: '% of entry',
                                    align: 'right',
                                    sortable: true,
                                    getValue: (item) => item.percentOfTotal,
                                    render: (item) => <span className="text-xs text-cyan-300">{item.percentOfTotal.toFixed(0)}%</span>,
                                },
                                {
                                    key: 'dropFromPrevious',
                                    label: 'Drop-off',
                                    align: 'right',
                                    sortable: true,
                                    getValue: (item) => item.dropFromPrevious,
                                    render: (item, index) => (
                                        <span className="text-xs text-zinc-400">
                                            {index === 0 ? '—' : `${item.dropFromPrevious.toFixed(1)}%`}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'avgDuration',
                                    label: 'Avg session',
                                    align: 'right',
                                    sortable: true,
                                    getValue: (item) => item.avgDuration,
                                    render: (item) => <span className="text-xs text-zinc-400">{formatDuration(item.avgDuration)}</span>,
                                },
                            ]}
                        />
                    </AnalyticsSubpagePanel>

                    {deletingId ? (
                        <div className="flex items-center justify-end">
                            <AnalyticsSubpageBadge label={`Deleting ${deletingId}`} tone="amber" />
                        </div>
                    ) : null}
                </>
            )}
        </AnalyticsSubpageShell>
    );
}
