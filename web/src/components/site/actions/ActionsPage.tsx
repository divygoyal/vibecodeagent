'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, ListChecks } from 'lucide-react';

import { fmtCompact, fmtFull } from '@/lib/format';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { siteHref } from '@/components/shell/nav';
import { ActionCard } from '../ActionCard';
import { ACTION_TYPE_LABEL } from '../lib/actionText';
import type { ActionImpact, ActionStatus, SiteAction } from '../lib/types';
import { SiteHeader } from '../SiteHeader';
import { LoadError } from '../SiteStates';
import { useSiteActions } from '../useSiteActions';
import { useSite } from '../useSiteData';
import { useStringParam, useTabParam } from '../useTabParam';

const STATUSES = ['open', 'done', 'dismissed'] as const;
type TypeFilter = 'all' | SiteAction['type'];
type ImpactFilter = 'all' | ActionImpact;

/** Actions (DESIGN 5.8): ranked "what to fix next" with evidence, impact, fix, Ask and Done. */

const PAGE_SIZE = 8;
export function ActionsPage() {
    const site = useSite();
    const [status, setStatus] = useTabParam(STATUSES, { name: 'status' });
    const [typeRaw, setType] = useStringParam('type');
    const [impactRaw, setImpact] = useStringParam('impact');
    const type = (typeRaw && typeRaw in ACTION_TYPE_LABEL ? typeRaw : 'all') as TypeFilter;
    const impact = (impactRaw === 'high' || impactRaw === 'medium' || impactRaw === 'low' ? impactRaw : 'all') as ImpactFilter;
    const { list, actions, audit, setStatus: save, saveUnavailable } = useSiteActions({ includeAudit: true });

    const byStatus = useMemo(() => ({
        open: list.filter((a) => a.status === 'open'),
        done: list.filter((a) => a.status === 'done'),
        dismissed: list.filter((a) => a.status === 'dismissed'),
    }), [list]);
    const shown = byStatus[status].filter((a) => (type === 'all' || a.type === type) && (impact === 'all' || a.impact === impact));
    const ranked = status === 'open'
        ? [...shown].sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.impact] - { high: 3, medium: 2, low: 1 }[a.impact]) || b.score - a.score)
        : [...shown].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    // Long lists show the top 8 first (QA: 18 expanded cards made a 6k px page); filters reset it.
    const listKey = `${status}|${type}|${impact}`;
    const [limitFor, setLimitFor] = useState<{ key: string; n: number }>({ key: listKey, n: PAGE_SIZE });
    const limit = limitFor.key === listKey ? limitFor.n : PAGE_SIZE;
    const top5 = byStatus.open.filter((a) => /clicks/.test(a.expectedImpact)).slice(0, 5).reduce((s, a) => s + (a.type === 'audit' ? 0 : a.score), 0);
    const loading = actions.state === 'loading';
    const types = useMemo(() => [...new Set(list.map((a) => a.type))], [list]);

    return (
        <div className="flex flex-col">
            <SiteHeader
                section="Actions"
                search={!site.hasGa4}
                source={loading ? 'Finding what to fix next…' : `${fmtFull(byStatus.open.length)} open${top5 > 0 ? ` · about +${fmtCompact(top5)} clicks a month if you finish the top 5` : ''}`}
                actions={<Button asChild variant="secondary" icon={ClipboardCheck}><Link href={`${siteHref(site.host, 'actions')}/audit`}>Site audit</Link></Button>}
                tabs={(
                    <Tabs
                        ariaLabel="Task status"
                        value={status}
                        onValueChange={setStatus}
                        items={[
                            { value: 'open', label: 'Open', count: loading ? undefined : fmtFull(byStatus.open.length) },
                            { value: 'done', label: 'Done', count: loading ? undefined : fmtFull(byStatus.done.length) },
                            { value: 'dismissed', label: 'Dismissed', count: loading ? undefined : fmtFull(byStatus.dismissed.length) },
                        ]}
                    />
                )}
            />
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Select<TypeFilter>
                    size="sm"
                    ariaLabel="Task type"
                    value={type}
                    onValueChange={(v) => void setType(v === 'all' ? null : v)}
                    options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t as TypeFilter, label: ACTION_TYPE_LABEL[t] }))]}
                />
                <Select<ImpactFilter>
                    size="sm"
                    ariaLabel="Impact"
                    value={impact}
                    onValueChange={(v) => void setImpact(v === 'all' ? null : v)}
                    options={[{ value: 'all', label: 'All impact' }, { value: 'high', label: 'High impact' }, { value: 'medium', label: 'Medium impact' }, { value: 'low', label: 'Low impact' }]}
                />
                {audit.state === 'loading' && site.homeUrl ? <span className="text-meta text-fg-muted">Checking your homepage for technical issues…</span> : null}
            </div>
            {actions.state === 'error' ? <LoadError error={actions.error} onRetry={actions.mutate} className="mb-4" /> : null}
            {actions.data?.partial.length ? (
                <Banner variant="warn" className="mb-4">Some data could not be read ({actions.data.partial.join(', ')}), so this list may be incomplete.</Banner>
            ) : null}
            {saveUnavailable ? <Banner variant="neutral" className="mb-4">Done and Dismiss can&apos;t be saved right now. Try again later.</Banner> : null}
            {loading ? (
                <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-card" />)}</div>
            ) : ranked.length === 0 ? (
                <Card padding="none">
                    <EmptyState
                        variant="card"
                        icon={status === 'open' ? CheckCircle2 : ListChecks}
                        title={status === 'open' ? (type !== 'all' || impact !== 'all' ? 'No open tasks match these filters' : 'Nothing to fix right now') : status === 'done' ? 'Nothing marked done yet' : 'Nothing dismissed'}
                        description={status === 'open' ? 'We check for decaying pages, near-page-one queries, low CTR, cannibalization, traffic drops and audit issues.' : 'Tasks you mark done or dismiss show up here.'}
                    />
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {ranked.slice(0, limit).map((a) => (
                        <ActionCard
                            key={a.id}
                            action={a}
                            site={{ ga4: site.ga4, gsc: site.gsc }}
                            canSave={!saveUnavailable}
                            onStatus={(s: ActionStatus, undo: ActionStatus) => void save(a, s, { undo })}
                        />
                    ))}
                    {ranked.length > limit ? (
                        <div className="flex justify-center">
                            <Button variant="secondary" onClick={() => setLimitFor({ key: listKey, n: limit + PAGE_SIZE })}>
                                Show {Math.min(PAGE_SIZE, ranked.length - limit)} more
                                <span className="text-fg-muted tabular-nums">· {fmtFull(ranked.length - limit)} left</span>
                            </Button>
                        </div>
                    ) : null}
                </div>
            )}
            {actions.data ? (
                <p className="mt-4 text-meta text-fg-muted">
                    Built from {[site.hasGsc && 'Search Console', site.hasGa4 && 'Google Analytics', audit.data && 'the homepage audit'].filter(Boolean).join(', ')} for the selected range, compared with the period before. Impact is relative to this site&apos;s own traffic.
                </p>
            ) : null}
        </div>
    );
}
