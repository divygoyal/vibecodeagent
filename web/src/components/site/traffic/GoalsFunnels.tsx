'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDown, GitBranch, Pencil, Plus, Target, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDuration, fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import type { FunnelDefinition, FunnelSuggestion, GoalDefinition, GoalDefinitionType, GoalSuggestion } from '@/lib/analyticsDefinitions';
import { BarList } from '@/components/charts/BarList';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toaster';
import { LoadError } from '../SiteStates';
import { fetchJson, useSite, useSiteRange } from '../useSiteData';

/** The old analytics APIs take a range key, not dates (custom ranges fall back to the nearest key). */
function useLegacyRangeKey() {
    const { dr } = useSiteRange();
    return dr.value.preset === 'custom' ? dr.legacyRange : dr.value.preset;
}

const inputCls = 'h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-fg">{label}</span>
            {children}
            {hint ? <span className="text-meta text-fg-muted">{hint}</span> : null}
        </label>
    );
}

type Pick<T, S> = { kind: 'saved'; key: string; item: T } | { kind: 'suggestion'; key: string; item: S };

function ListButton({ active, onClick, title, sub, badge }: { active: boolean; onClick: () => void; title: string; sub: string; badge?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn('flex w-full flex-col gap-0.5 rounded-control px-3 py-2 text-left transition-colors duration-120', active ? 'bg-brand-soft text-brand-soft-fg' : 'hover:bg-subtle')}
        >
            <span className="flex items-center gap-2 text-body-sm font-medium text-fg">
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {badge ? <Badge variant="neutral">{badge}</Badge> : null}
            </span>
            <span className="truncate text-meta text-fg-muted">{sub}</span>
        </button>
    );
}

// ─── Goals ──────────────────────────────────────────────────────────────────

interface GoalAnalytics {
    definition: GoalDefinition;
    summary: { conversions: number; totalSessions: number; rate: number; change: number; rateChange: number };
    trend: { date: string; conversions: number; users: number }[];
    sourceContribution: { source: string; conversions: number; share: number }[];
    pageContribution: { page: string; conversions: number; share: number }[];
    explanation: string;
}

interface GoalEditor { mode: 'create' | 'edit'; id?: string; name: string; description: string; type: GoalDefinitionType; target: string }

/** Goals (saved in TrafficClaw, measured from GA4): list, detail, create/edit/delete. */
export function GoalsPanel() {
    const { ga4 } = useSite();
    const range = useLegacyRangeKey();
    const defsKey = ga4 ? `/api/analytics/goals/definitions?${new URLSearchParams({ propertyId: ga4, range })}` : null;
    const defs = useSWR<{ definitions: GoalDefinition[]; suggestions: GoalSuggestion[] }>(defsKey, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
    const [selected, setSelected] = useState<string | null>(null);
    const [editor, setEditor] = useState<GoalEditor | null>(null);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState<GoalDefinition | null>(null);

    const picks: Pick<GoalDefinition, GoalSuggestion>[] = useMemo(() => [
        ...(defs.data?.definitions ?? []).map((d) => ({ kind: 'saved' as const, key: `saved:${d.id}`, item: d })),
        ...(defs.data?.suggestions ?? []).map((s, i) => ({ kind: 'suggestion' as const, key: `suggestion:${i}:${s.target}`, item: s })),
    ], [defs.data]);
    const current = picks.find((p) => p.key === selected) ?? picks[0] ?? null;

    const goalKey = ga4 && current ? `/api/analytics/goals?${new URLSearchParams({
        propertyId: ga4, range, type: current.item.type, target: current.item.target, name: current.item.name,
        ...(current.item.description ? { description: current.item.description } : {}),
    })}` : null;
    const goal = useSWR<GoalAnalytics>(goalKey, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });

    const save = async () => {
        if (!editor || !ga4) return;
        if (!editor.name.trim() || !editor.target.trim()) {
            toast.error('Name and target are required.');
            return;
        }
        setSaving(true);
        try {
            const payload = { name: editor.name.trim(), description: editor.description.trim(), type: editor.type, target: editor.target.trim() };
            if (editor.mode === 'create') {
                const created = await fetchJson<GoalDefinition>('/api/analytics/goals/definitions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: ga4, ...payload }),
                });
                setSelected(`saved:${created.id}`);
            } else if (editor.id) {
                await fetchJson(`/api/analytics/goals/definitions/${editor.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, isActive: true }),
                });
                setSelected(`saved:${editor.id}`);
            }
            await defs.mutate();
            setEditor(null);
            toast.success('Goal saved');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save the goal");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!toDelete) return;
        try {
            await fetchJson(`/api/analytics/goals/definitions/${toDelete.id}`, { method: 'DELETE' });
            await defs.mutate();
            setSelected(null);
            toast.success('Goal deleted');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't delete the goal");
        } finally {
            setToDelete(null);
        }
    };

    const g = goal.data;
    return (
        <Card padding="none" className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4 md:p-5">
                <div>
                    <h3 className="text-title-sm text-fg">Goals</h3>
                    <p className="mt-0.5 text-body-sm text-fg-muted">A page visit or an event you count as success. Saved in TrafficClaw, measured from GA4.</p>
                </div>
                <Button size="sm" icon={Plus} onClick={() => setEditor({ mode: 'create', name: '', description: '', type: 'event_count', target: '' })}>New goal</Button>
            </div>
            {defs.error && !defs.data ? <div className="p-4"><LoadError error={defs.error} onRetry={() => void defs.mutate()} /></div> : (
                <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="border-b border-border-subtle p-2 md:border-r md:border-b-0">
                        {!defs.data ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : picks.length === 0 ? (
                            <EmptyState variant="inline" icon={Target} title="No goals yet" description="Create one for a sign-up page or a purchase event." />
                        ) : (
                            <div className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto">
                                {picks.map((p) => (
                                    <ListButton key={p.key} active={current?.key === p.key} onClick={() => setSelected(p.key)} title={p.item.name}
                                        sub={`${p.item.type === 'page_visit' ? 'Page visit' : 'Event'}: ${p.item.target}`} badge={p.kind === 'suggestion' ? 'Suggested' : undefined} />
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 p-4 md:p-5">
                        {!current ? null : goal.error && !g ? <LoadError error={goal.error} onRetry={() => void goal.mutate()} /> : !g ? (
                            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-48" /></div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-title-sm text-fg">{current.item.name}</p>
                                        <p className="text-meta text-fg-muted">{current.item.type === 'page_visit' ? 'Visits to' : 'Event'} <code className="rounded bg-subtle px-1">{current.item.target}</code></p>
                                    </div>
                                    {current.kind === 'saved' ? (
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditor({ mode: 'edit', id: current.item.id, name: current.item.name, description: current.item.description ?? '', type: current.item.type, target: current.item.target })}>Edit</Button>
                                            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setToDelete(current.item)}>Delete</Button>
                                        </div>
                                    ) : (
                                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditor({ mode: 'create', name: current.item.name, description: current.item.description, type: current.item.type, target: current.item.target })}>Save this goal</Button>
                                    )}
                                </div>
                                <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                    <div><dt className="text-meta text-fg-muted">Goal completions</dt><dd className="flex items-baseline gap-2"><span className="text-stat text-fg">{fmtFull(g.summary.conversions)}</span><MetricDelta current={g.summary.conversions} previous={g.summary.change > -100 ? g.summary.conversions / (1 + g.summary.change / 100) : null} metric="conversions" /></dd></div>
                                    <div><dt className="text-meta text-fg-muted">Completion rate</dt><dd className="text-stat text-fg">{g.summary.rate.toFixed(2)}%</dd></div>
                                    <div><dt className="text-meta text-fg-muted">Sessions</dt><dd className="text-stat text-fg">{fmtFull(g.summary.totalSessions)}</dd></div>
                                </dl>
                                {g.explanation ? <p className="text-body-sm text-fg-secondary">{g.explanation}</p> : null}
                                <ChartCard title="Completions per day" height="compact" state={g.trend.length ? 'ready' : 'empty'} bare>
                                    <TimeSeriesChart data={g.trend as unknown as Record<string, number | string>[]} series={[{ metric: 'conversions', key: 'conversions', label: 'Goal completions' }]} height={200} ariaLabel={`${current.item.name} completions per day`} />
                                </ChartCard>
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div>
                                        <p className="mb-2 text-body-sm font-medium text-fg">By source</p>
                                        <BarList items={g.sourceContribution.map((s) => ({ key: s.source, label: s.source, text: s.source, value: s.conversions }))} metric="conversions" limit={6} labelHeader="Source" valueHeader="Completions" empty={<EmptyState variant="inline" title="No completions yet" />} />
                                    </div>
                                    <div>
                                        <p className="mb-2 text-body-sm font-medium text-fg">By page</p>
                                        <BarList items={g.pageContribution.map((s) => ({ key: s.page, label: s.page, text: s.page, value: s.conversions }))} metric="conversions" limit={6} labelHeader="Page" valueHeader="Completions" empty={<EmptyState variant="inline" title="No completions yet" />} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <Modal
                open={Boolean(editor)}
                onOpenChange={(o) => { if (!o) setEditor(null); }}
                title={editor?.mode === 'edit' ? 'Edit goal' : 'New goal'}
                description="Count a page visit or a GA4 event as a goal completion."
                footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Save goal</Button></>}
            >
                {editor ? (
                    <div className="flex flex-col gap-4">
                        <Field label="Name"><input className={inputCls} value={editor.name} maxLength={120} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Sign-ups" /></Field>
                        <Field label="Type">
                            <Select<GoalDefinitionType> ariaLabel="Goal type" value={editor.type} onValueChange={(t) => setEditor({ ...editor, type: t })}
                                options={[{ value: 'event_count', label: 'GA4 event' }, { value: 'page_visit', label: 'Page visit' }]} />
                        </Field>
                        <Field label={editor.type === 'page_visit' ? 'Page path' : 'Event name'} hint={editor.type === 'page_visit' ? 'For example /thank-you' : 'For example sign_up or purchase'}>
                            <input className={inputCls} value={editor.target} maxLength={300} onChange={(e) => setEditor({ ...editor, target: e.target.value })} />
                        </Field>
                        <Field label="Description (optional)"><input className={inputCls} value={editor.description} maxLength={300} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></Field>
                    </div>
                ) : null}
            </Modal>
            <ConfirmModal open={Boolean(toDelete)} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={`Delete "${toDelete?.name ?? ''}"?`}
                description="The goal is removed from TrafficClaw. Your GA4 data is not touched." confirmLabel="Delete goal" danger onConfirm={remove} />
        </Card>
    );
}

// ─── Funnels ────────────────────────────────────────────────────────────────

interface FunnelAnalytics {
    definition: FunnelDefinition;
    steps: { name: string; count: number; users: number; avgDuration: number; percentOfTotal: number; dropFromPrevious: number }[];
    summary: { totalEntries: number; completions: number; overallRate: number; completionChange: number; avgCompletionSessionDuration: number };
    biggestDrop: { from: string; to: string; rate: number };
    trend: { date: string; entries: number; completions: number }[];
}

interface FunnelEditor { mode: 'create' | 'edit'; id?: string; name: string; description: string; steps: string[] }

/** Traffic > Funnels: saved step flows with drop-off. */
export function FunnelsTab() {
    const { ga4 } = useSite();
    const range = useLegacyRangeKey();
    const defsKey = ga4 ? `/api/analytics/funnels/definitions?${new URLSearchParams({ propertyId: ga4, range })}` : null;
    const defs = useSWR<{ definitions: FunnelDefinition[]; suggestions: FunnelSuggestion[] }>(defsKey, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
    const [selected, setSelected] = useState<string | null>(null);
    const [editor, setEditor] = useState<FunnelEditor | null>(null);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState<FunnelDefinition | null>(null);

    const picks: Pick<FunnelDefinition, FunnelSuggestion>[] = useMemo(() => [
        ...(defs.data?.definitions ?? []).map((d) => ({ kind: 'saved' as const, key: `saved:${d.id}`, item: d })),
        ...(defs.data?.suggestions ?? []).map((s, i) => ({ kind: 'suggestion' as const, key: `suggestion:${i}:${s.steps.join('>')}`, item: s })),
    ], [defs.data]);
    const current = picks.find((p) => p.key === selected) ?? picks[0] ?? null;
    const fKey = ga4 && current ? `/api/analytics/funnels?${new URLSearchParams({
        propertyId: ga4, range, steps: current.item.steps.join(','), name: current.item.name,
        ...(current.item.description ? { description: current.item.description } : {}),
    })}` : null;
    const funnel = useSWR<FunnelAnalytics>(fKey, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });

    const save = async () => {
        if (!editor || !ga4) return;
        const steps = editor.steps.map((s) => s.trim()).filter(Boolean);
        if (!editor.name.trim() || steps.length < 2) {
            toast.error('Add a name and at least two steps.');
            return;
        }
        setSaving(true);
        try {
            const payload = { propertyId: ga4, name: editor.name.trim(), description: editor.description.trim(), steps };
            const res = editor.mode === 'create'
                ? await fetchJson<FunnelDefinition>('/api/analytics/funnels/definitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetchJson<FunnelDefinition>(`/api/analytics/funnels/definitions/${editor.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            await defs.mutate();
            if (res?.id) setSelected(`saved:${res.id}`);
            setEditor(null);
            toast.success('Funnel saved');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save the funnel");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!toDelete) return;
        try {
            await fetchJson(`/api/analytics/funnels/definitions/${toDelete.id}`, { method: 'DELETE' });
            await defs.mutate();
            setSelected(null);
            toast.success('Funnel deleted');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't delete the funnel");
        } finally {
            setToDelete(null);
        }
    };

    const f = funnel.data;
    const first = f?.steps[0]?.count ?? 0;
    return (
        <Card padding="none" className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4 md:p-5">
                <div>
                    <h3 className="text-title-sm text-fg">Funnels</h3>
                    <p className="mt-0.5 text-body-sm text-fg-muted">Pages or events in order. See where visitors drop off.</p>
                </div>
                <Button size="sm" icon={Plus} onClick={() => setEditor({ mode: 'create', name: '', description: '', steps: ['', '', ''] })}>New funnel</Button>
            </div>
            {defs.error && !defs.data ? <div className="p-4"><LoadError error={defs.error} onRetry={() => void defs.mutate()} /></div> : (
                <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="border-b border-border-subtle p-2 md:border-r md:border-b-0">
                        {!defs.data ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : picks.length === 0 ? (
                            <EmptyState variant="inline" icon={GitBranch} title="No funnels yet" description="Create one, for example home → pricing → sign-up." />
                        ) : (
                            <div className="flex max-h-[460px] flex-col gap-0.5 overflow-y-auto">
                                {picks.map((p) => (
                                    <ListButton key={p.key} active={current?.key === p.key} onClick={() => setSelected(p.key)} title={p.item.name} sub={p.item.steps.join(' → ')} badge={p.kind === 'suggestion' ? 'Suggested' : undefined} />
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 p-4 md:p-5">
                        {!current ? null : funnel.error && !f ? <LoadError error={funnel.error} onRetry={() => void funnel.mutate()} /> : !f ? (
                            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-48" /></div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <p className="text-title-sm text-fg">{current.item.name}</p>
                                    {current.kind === 'saved' ? (
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditor({ mode: 'edit', id: current.item.id, name: current.item.name, description: current.item.description ?? '', steps: [...current.item.steps] })}>Edit</Button>
                                            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setToDelete(current.item)}>Delete</Button>
                                        </div>
                                    ) : (
                                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditor({ mode: 'create', name: current.item.name, description: current.item.description, steps: [...current.item.steps] })}>Save this funnel</Button>
                                    )}
                                </div>
                                <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <div><dt className="text-meta text-fg-muted">Entered</dt><dd className="text-stat text-fg">{fmtFull(f.summary.totalEntries)}</dd></div>
                                    <div><dt className="text-meta text-fg-muted">Completed</dt><dd className="flex items-baseline gap-2"><span className="text-stat text-fg">{fmtFull(f.summary.completions)}</span><MetricDelta current={f.summary.completions} previous={f.summary.completionChange > -100 ? f.summary.completions / (1 + f.summary.completionChange / 100) : null} metric="conversions" /></dd></div>
                                    <div><dt className="text-meta text-fg-muted">Completion rate</dt><dd className="text-stat text-fg">{f.summary.overallRate.toFixed(1)}%</dd></div>
                                    <div><dt className="text-meta text-fg-muted">Avg. session (completed)</dt><dd className="text-stat text-fg">{fmtDuration(f.summary.avgCompletionSessionDuration)}</dd></div>
                                </dl>
                                <ol className="flex flex-col gap-1" aria-label="Funnel steps">
                                    {f.steps.map((s, i) => {
                                        const pct = first > 0 ? (s.count / first) * 100 : 0;
                                        return (
                                            <li key={`${s.name}-${i}`}>
                                                {i > 0 ? (
                                                    <p className="flex items-center gap-1.5 py-1 pl-1 text-meta text-fg-muted">
                                                        <ArrowDown aria-hidden size={12} /> {s.dropFromPrevious.toFixed(1)}% dropped off
                                                    </p>
                                                ) : null}
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 shrink-0 text-right text-meta text-fg-muted tabular-nums">{i + 1}</span>
                                                    <div className="relative min-w-0 flex-1 rounded-md bg-surface-sunken">
                                                        <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max(pct, 0.8)}%`, background: METRICS.conversions.color, opacity: 0.18 }} />
                                                        <span className="relative flex items-center justify-between gap-3 px-3 py-2">
                                                            <span className="min-w-0 truncate text-body-sm text-fg" title={s.name}>{s.name}</span>
                                                            <span className="shrink-0 text-body-sm text-fg tabular-nums">{fmtFull(s.count)} <span className="text-fg-muted">· {pct.toFixed(1)}%</span></span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                                {f.biggestDrop?.from ? (
                                    <p className="text-body-sm text-fg-secondary">Biggest drop: <span className="font-medium text-fg">{f.biggestDrop.from} → {f.biggestDrop.to}</span> ({f.biggestDrop.rate.toFixed(1)}% leave here).</p>
                                ) : null}
                                <ChartCard title="Completions per day" height="compact" state={f.trend.length ? 'ready' : 'empty'} bare>
                                    <TimeSeriesChart data={f.trend as unknown as Record<string, number | string>[]} series={[{ metric: 'conversions', key: 'completions', label: 'Completions' }]} height={200} ariaLabel="Funnel completions per day" />
                                </ChartCard>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <Modal
                open={Boolean(editor)}
                onOpenChange={(o) => { if (!o) setEditor(null); }}
                title={editor?.mode === 'edit' ? 'Edit funnel' : 'New funnel'}
                description="Each step is a page path (/pricing) or a GA4 event name (sign_up), in order."
                footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Save funnel</Button></>}
            >
                {editor ? (
                    <div className="flex flex-col gap-4">
                        <Field label="Name"><input className={inputCls} value={editor.name} maxLength={120} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Home to sign-up" /></Field>
                        <div className="flex flex-col gap-2">
                            <span className="text-body-sm font-medium text-fg">Steps</span>
                            {editor.steps.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="w-5 text-right text-meta text-fg-muted">{i + 1}</span>
                                    <input aria-label={`Step ${i + 1}`} className={inputCls} value={s} maxLength={300} onChange={(e) => setEditor({ ...editor, steps: editor.steps.map((x, k) => (k === i ? e.target.value : x)) })} placeholder={i === 0 ? '/' : i === 1 ? '/pricing' : 'sign_up'} />
                                    <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remove step ${i + 1}`} disabled={editor.steps.length <= 2} onClick={() => setEditor({ ...editor, steps: editor.steps.filter((_, k) => k !== i) })} />
                                </div>
                            ))}
                            <Button size="sm" variant="ghost" icon={Plus} className="self-start" disabled={editor.steps.length >= 8} onClick={() => setEditor({ ...editor, steps: [...editor.steps, ''] })}>Add step</Button>
                        </div>
                        <Field label="Description (optional)"><input className={inputCls} value={editor.description} maxLength={300} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></Field>
                    </div>
                ) : null}
            </Modal>
            <ConfirmModal open={Boolean(toDelete)} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={`Delete "${toDelete?.name ?? ''}"?`}
                description="The funnel is removed from TrafficClaw. Your GA4 data is not touched." confirmLabel="Delete funnel" danger onConfirm={remove} />
        </Card>
    );
}

