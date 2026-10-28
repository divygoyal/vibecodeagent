'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ActionList, ActionRow } from '@/components/site/ActionCard';
import type { ActionStatus } from '@/components/site/lib/types';
import type { SiteActionWithStatus } from '@/components/site/useSiteActions';
import { demoHref } from '../demoLinks';
import type { LiveFixesRow } from '../homeLive';
import { LiveFrame } from './parts';

const SHOWN = 5;

/**
 * The site's fix list on sample data (round 6): the app's compact ActionRow, ranked like the Actions page. Rows open
 * to the why and the suggested fix; Mark done and Dismiss play the app's animation and take the row off this list
 * only (nothing is saved, and the page says so); Ask AI opens the question in the live demo's Ask.
 */
export function FixesLive({ data }: { data: LiveFixesRow }) {
    const [status, setStatus] = useState<Record<string, ActionStatus>>({});
    const all = useMemo<SiteActionWithStatus[]>(
        () => data.actions.map((a) => ({ ...a, status: status[a.id] ?? 'open', updatedAt: null })),
        [data.actions, status],
    );
    const open = all.filter((a) => a.status === 'open');
    const closed = data.actions.length - open.length;
    const remaining = data.total - closed;
    const top = open.slice(0, SHOWN);
    return (
        <LiveFrame hint="Open a task, then try Mark done." href={data.links.actions} linkLabel="See every task in the live demo">
            <Card as="section" aria-label="What to fix next" className="flex min-w-0 flex-col">
                <CardHeader
                    title="What to fix next"
                    description={`Top ${top.length} of ${fmtFull(remaining)} open tasks, ranked by expected impact`}
                    actions={(
                        <Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight} className="max-sm:hidden">
                            <Link href={data.links.actions}>All {fmtFull(remaining)} actions</Link>
                        </Button>
                    )}
                />
                {closed ? (
                    <p data-live-note="" className="-mt-1 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
                        Sample list: {closed} {closed === 1 ? 'task' : 'tasks'} closed here only, nothing is saved.
                        <button type="button" onClick={() => setStatus({})} className="tap-area inline-flex items-center gap-1 font-medium text-brand-text hover:underline">
                            <RotateCcw aria-hidden size={12} /> Reset
                        </button>
                    </p>
                ) : null}
                {top.length ? (
                    <ActionList className="-mx-5 -mb-5 border-t border-border-subtle max-md:[&>li:nth-child(n+5)]:hidden">
                        {top.map((a, i) => (
                            <ActionRow
                                key={a.id}
                                action={a}
                                site={data.site}
                                defaultOpen={i === 0 && closed === 0}
                                onStatus={(s) => setStatus((m) => ({ ...m, [a.id]: s }))}
                                askLink={demoHref}
                            />
                        ))}
                    </ActionList>
                ) : (
                    <p className="pb-1 text-body-sm text-fg-secondary">All sample tasks closed. <button type="button" onClick={() => setStatus({})} className="font-medium text-brand-text hover:underline">Bring them back</button></p>
                )}
            </Card>
        </LiveFrame>
    );
}
