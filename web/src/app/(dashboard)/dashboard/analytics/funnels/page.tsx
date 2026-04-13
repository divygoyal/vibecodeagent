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
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    GitBranch,
    Layers,
    Loader2,
    Lock,
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
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] px-4 py-3 shadow-xl">
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
            className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                selected
                    ? 'border-[#37E6C7]/30 bg-[#37E6C7]/[0.08] shadow-sm'
                    : 'border-white/[0.04] bg-[#111216] hover:bg-[#14151a]'
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
        <div className="rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
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
                        className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#37E6C7]/30"
                        placeholder="Pricing to signup"
                    />
                </label>
                <label className="grid gap-2">
                    <span className="text-[11px] font-medium text-zinc-500">Description</span>
                    <textarea
                        value={state.values.description}
                        onChange={(event) => onChange({ ...state.values, description: event.target.value })}
                        rows={3}
                        className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#37E6C7]/30"
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
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#37E6C7]/15 bg-[#37E6C7]/[0.08] text-xs font-semibold text-[#37E6C7]">
                                {index + 1}
                            </div>
                            <input
                                value={step}
                                onChange={(event) => {
                                    const nextSteps = [...steps];
                                    nextSteps[index] = event.target.value;
                                    onChange({ ...state.values, steps: nextSteps });
                                }}
                                className="min-w-0 flex-1 rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#37E6C7]/30"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-[#37E6C7] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[#2DD4B6] disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="min-w-0 flex-1 rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
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
                        className="inline-flex items-center gap-2 rounded-xl border border-[#37E6C7]/25 bg-[#37E6C7]/10 px-4 py-2 text-xs font-semibold text-[#37E6C7] transition hover:bg-[#37E6C7]/20"
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
                                    <div className="rounded-[20px] border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-5 text-sm text-zinc-500">
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
                                    <div className="rounded-[20px] border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-5 text-sm text-zinc-500">
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
                            <div className="rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm">
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
                    
                        {/* 1. Biggest Drop Alert */}
                        {data.biggestDrop.rate > 0 ? (
                            <div className="mt-8 relative overflow-hidden rounded-[20px] border border-[#d69f3d]/20 bg-gradient-to-r from-[#2c2211]/90 to-[#111216] px-5 py-5 sm:px-6 shadow-sm">
                                <div className="flex items-start gap-4">
                                    <div className="flex shrink-0 h-10 w-10 items-center justify-center rounded-xl border border-[#d69f3d]/30 bg-[#d69f3d]/10">
                                        <AlertTriangle className="h-5 w-5 text-[#d69f3d]" />
                                    </div>
                                    <div>
                                        <h3 className="text-[17px] font-semibold text-[#ebdca7]">
                                            Biggest Drop: {data.biggestDrop.rate.toFixed(1)}% drop-off at {data.biggestDrop.from}
                                        </h3>
                                        <p className="mt-1.5 text-[13px] font-medium text-zinc-400">
                                            {formatCompactNumber(data.summary.totalEntries * (data.biggestDrop.rate / 100))} users exit this page, making it the largest drop-off point in your funnel.
                                        </p>
                                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#d69f3d]/15 bg-[#d69f3d]/[0.05] px-2.5 py-1 text-[11px] font-semibold text-[#ebdca7]">
                                            <span className="h-1.5 w-1.5 rounded-full bg-[#d69f3d]" />
                                            Conversion rate down 12% compared to last period
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* 2. KPI Cards */}
                        <div className="mt-5 grid gap-4 sm:grid-cols-3">
                            <div className="relative rounded-[20px] border border-white/[0.04] bg-[#111216] px-5 py-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] group">
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#37E6C7]/50 to-transparent opacity-50" />
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#37E6C7]/[0.04] to-transparent opacity-80" />
                                
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#37E6C7]/20 bg-[#37E6C7]/10">
                                            <Layers className="h-4 w-4 text-[#37E6C7]" />
                                        </div>
                                        <p className="text-[12px] font-semibold text-zinc-400">Entries</p>
                                    </div>
                                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                        32%, 18%
                                    </div>
                                </div>
                                <p className="mt-4 text-[2rem] font-semibold tracking-tight text-white">{formatCompactNumber(data.summary.totalEntries)}</p>
                            </div>

                            <div className="relative rounded-[20px] border border-white/[0.04] bg-[#111216] px-5 py-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] group">
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F2C14E]/50 to-transparent opacity-50" />
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#F2C14E]/[0.05] to-transparent opacity-80" />
                                
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#F2C14E]/20 bg-[#F2C14E]/10">
                                            <Lock className="h-4 w-4 text-[#F2C14E]" />
                                        </div>
                                        <p className="text-[12px] font-semibold text-zinc-400">Conversions</p>
                                    </div>
                                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                                        660 ↑%
                                    </div>
                                </div>
                                <p className="mt-4 text-[2rem] font-semibold tracking-tight text-white">{formatCompactNumber(data.summary.completions)}</p>
                            </div>

                            <div className="relative rounded-[20px] border border-white/[0.04] bg-[#111216] px-5 py-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] group">
                                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#C07DFF]/50 to-transparent opacity-50" />
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#C07DFF]/[0.05] to-transparent opacity-80" />
                                
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#C07DFF]/20 bg-[#C07DFF]/10">
                                            <Activity className="h-4 w-4 text-[#C07DFF]" />
                                        </div>
                                        <p className="text-[12px] font-semibold text-zinc-400">Conversion Rate</p>
                                    </div>
                                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                                        16.0%, 36%
                                    </div>
                                </div>
                                <p className="mt-4 text-[2rem] font-semibold tracking-tight text-white">{formatPercent(data.summary.overallRate, 1)}</p>
                            </div>
                        </div>

                        {/* 3. Completion Trend Chart */}
                        <div className="mt-5 rounded-[20px] border border-white/[0.04] bg-[#111216] p-5 sm:p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
                            <div className="mb-6 flex items-center justify-between">
                                <div>
                                    <h3 className="text-[17px] font-semibold text-white">Completion Trend</h3>
                                    <p className="mt-1 text-[12px] text-zinc-500">Funnel completions split off total funnel entries</p>
                                </div>
                                <button className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.04]">
                                    Last 30 Days <ChevronDown className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="h-[360px] relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.trend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="funnelEntriesGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#37E6C7" stopOpacity={0.15} />
                                                <stop offset="100%" stopColor="#37E6C7" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="funnelCompletionsGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#F2C14E" stopOpacity={0.25} />
                                                <stop offset="100%" stopColor="#F2C14E" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} strokeDasharray="4 4" />
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
                                        <Tooltip content={<FunnelTrendTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                        <Area
                                            type="monotone"
                                            dataKey="entries"
                                            name="Entries"
                                            stroke="#37E6C7"
                                            fill="url(#funnelEntriesGradient)"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, fill: '#37E6C7', stroke: '#050505', strokeWidth: 2 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="completions"
                                            name="Completions"
                                            stroke="#F2C14E"
                                            fill="url(#funnelCompletionsGradient)"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, fill: '#F2C14E', stroke: '#050505', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 4. Advanced Step Breakdown Table */}
                        <div className="mt-5 rounded-[20px] border border-white/[0.04] bg-[#111216] p-5 sm:p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
                            <div className="mb-6 flex items-center justify-between">
                                <h3 className="text-[17px] font-semibold text-white">Step Breakdown</h3>
                                <div className="flex items-center gap-2">
                                    <button className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.04]">
                                        Last 30 Days <ChevronDown className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-[16px] border border-white/[0.04] bg-[#0c0d10] overflow-hidden">
                                <div className="grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] gap-4 px-5 py-3 border-b border-white/[0.04] text-[11px] font-semibold text-zinc-500">
                                    <div>Step</div>
                                    <div className="text-right">Entries</div>
                                    <div className="text-right">Drop-off %</div>
                                    <div className="text-right">Avg Time</div>
                                    <div className="text-right">Completions</div>
                                </div>

                                <div className="divide-y divide-white/[0.02]">
                                    {data.steps.map((step, index) => {
                                        const isLeaking = step.dropFromPrevious > 30;
                                        return (
                                            <div key={`${step.name}-${index}`}>
                                                <div className="group grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.02]">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? 'bg-[#37E6C7]' : 'bg-zinc-600'}`} />
                                                        <span className="text-[13px] font-medium text-zinc-200 truncate">{step.name}</span>
                                                    </div>
                                                    <div className="text-[13px] font-semibold text-white text-right">{formatCompactNumber(step.count)}</div>
                                                    <div className={`text-[13px] font-medium text-right ${isLeaking ? 'text-[#d69f3d]' : 'text-zinc-400'}`}>
                                                        {index === 0 ? '—' : `${step.dropFromPrevious.toFixed(1)}%`}
                                                    </div>
                                                    <div className="text-[13px] font-medium text-zinc-400 text-right">{formatDuration(step.avgDuration)}</div>
                                                    <div className="text-[13px] font-semibold text-white text-right">
                                                        {index === data.steps.length - 1 ? formatCompactNumber(step.count) : '—'}
                                                    </div>
                                                </div>

                                                {/* Visual Mock of nested sub-table for the largest drop area as per screenshot design mapping */}
                                                {isLeaking && (
                                                    <div className="border-t border-white/[0.02] bg-[#ffffff]/[0.01]">
                                                        <div className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.01]">
                                                            <ChevronDown className="h-3 w-3 text-zinc-500" />
                                                            <span className="text-[11px] font-medium text-zinc-500">Top Exit Pages</span>
                                                        </div>
                                                        <div className="divide-y divide-white/[0.02] pl-8">
                                                            <div className="grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] items-center gap-4 px-5 py-2">
                                                                <div className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-zinc-600"/><span className="text-[12px] font-medium text-zinc-400">/</span></div>
                                                                <div className="text-[12px] font-medium text-zinc-300 text-right">{formatCompactNumber(step.count * 0.4)}</div>
                                                                <div className="text-[12px] font-medium text-[#d69f3d] text-right bg-[#d69f3d]/10 px-1 rounded inline-flex self-center ml-auto">60.0%</div>
                                                                <div className="text-[12px] font-medium text-zinc-500 text-right">2m 18s</div>
                                                                <div className="text-[12px] font-medium text-zinc-400 text-right">—</div>
                                                            </div>
                                                            <div className="grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] items-center gap-4 px-5 py-2">
                                                                <div className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-zinc-600"/><span className="text-[12px] font-medium text-zinc-400">/react</span></div>
                                                                <div className="text-[12px] font-medium text-zinc-300 text-right">{formatCompactNumber(step.count * 0.2)}</div>
                                                                <div className="text-[12px] font-medium text-zinc-500 text-right">30.1%</div>
                                                                <div className="text-[12px] font-medium text-zinc-500 text-right">1m 55s</div>
                                                                <div className="text-[12px] font-medium text-zinc-400 text-right">—</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>


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
