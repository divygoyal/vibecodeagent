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
import { ActionList, ActionRow } from '../ActionCard';
import { ACTION_TYPE_LABEL, topClickGain } from '../lib/actionText';
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

const PAGE_SIZE = 20;
export function ActionsPage() {
    const site = useSite();
    const [status, setStatus] = useTabParam(STATUSES, { name: 'status' });
    const [typeRaw, setType] = useStringParam('type');
    const [impactRaw, setImpact] = useStringParam('impact');
    const type = (typeRaw && typeRaw in ACTION_TYPE_LABEL ? typeRaw : 'all') as TypeFilter;
    const impact = (impactRaw === 'high' || impactRaw === 'medium' || impactRaw === 'low' ? impactRaw : 'all') as ImpactFilter;
    const { list, open, settled, actions, audit, setStatus: save, saveUnavailable } = useSiteActions({ includeAudit: true });

    const byStatus = useMemo(() => ({
        open,
        done: list.filter((a) => a.status === 'done'),
        dismissed: list.filter((a) => a.status === 'dismissed'),
    }), [list, open]);
    const shown = byStatus[status].filter((a) => (type === 'all' || a.type === type) && (impact === 'all' || a.impact === impact));
    // Open: the shared order (useSiteActions), so the Overview's top 3 are the first 3 rows here.
    const ranked = status === 'open' ? shown : [...shown].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    // Rows are ~56 px, so 20 fit before "Show more"; filters reset it.
    const listKey = `${status}|${type}|${impact}`;
    const [limitFor, setLimitFor] = useState<{ key: string; n: number }>({ key: listKey, n: PAGE_SIZE });
    const limit = limitFor.key === listKey ? limitFor.n : PAGE_SIZE;
    // The numbers the top 5 click tasks show (not their sort scores), so the header adds up what the rows say.
    const top5 = topClickGain(byStatus.open);
    const loading = actions.state === 'loading';
    // Counts wait for the audit too (the list does not), so a count never jumps from 16 to 18 or disagrees with the Overview.
    const counting = loading || (actions.state !== 'error' && !settled);
    const types = useMemo(() => [...new Set(list.map((a) => a.type))], [list]);

    return (
        <div className="flex flex-col">
            <SiteHeader
                section="Actions"
                search={!site.hasGa4}
                both
                source={counting ? 'Finding what to fix next…' : `${fmtFull(byStatus.open.length)} open${top5 > 0 ? ` · about +${fmtCompact(top5)} clicks a month if you finish the top 5` : ''}`}
                actions={<Button asChild variant="secondary" icon={ClipboardCheck}><Link href={`${siteHref(site.host, 'actions')}/audit`}>Site audit</Link></Button>}
                tabs={(
                    <Tabs
                        ariaLabel="Task status"
                        value={status}
                        onValueChange={setStatus}
                        items={[
                            { value: 'open', label: 'Open', count: counting ? undefined : fmtFull(byStatus.open.length) },
                            { value: 'done', label: 'Done', count: counting ? undefined : fmtFull(byStatus.done.length) },
                            { value: 'dismissed', label: 'Dismissed', count: counting ? undefined : fmtFull(byStatus.dismissed.length) },
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
                {!loading && ranked.length ? <span className="ml-auto text-meta text-fg-muted max-sm:w-full">Open a task for the why and the fix. Ask AI uses 1 message.</span> : null}
            </div>
            {actions.state === 'error' ? <LoadError error={actions.error} onRetry={actions.mutate} className="mb-4" /> : null}
            {actions.data?.partial.length ? (
                <Banner variant="warn" className="mb-4">Some data could not be read ({actions.data.partial.join(', ')}), so this list may be incomplete.</Banner>
            ) : null}
            {saveUnavailable ? <Banner variant="neutral" className="mb-4">Done and Dismiss can&apos;t be saved right now. Try again later.</Banner> : null}
            {loading ? (
                <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="px-4 py-3 md:px-5"><Skeleton className="h-9" /></div>)}</Card>
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
                    <Card padding="none" className="overflow-hidden">
                        <ActionList>
                            {ranked.slice(0, limit).map((a) => (
                                <ActionRow
                                    key={a.id}
                                    action={a}
                                    site={{ ga4: site.ga4, gsc: site.gsc, siteHost: site.siteHost }}
                                    canSave={!saveUnavailable}
                                    onStatus={(s: ActionStatus, undo: ActionStatus) => void save(a, s, { undo })}
                                />
                            ))}
                        </ActionList>
                    </Card>
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
