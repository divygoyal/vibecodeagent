'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ACTION_TYPE_LABEL } from './lib/actionText';
import type { ActionStatus } from './lib/types';
import { askHref } from './SiteStates';
import type { SiteActionWithStatus } from './useSiteActions';

const IMPACT = {
    high: { label: 'High impact', variant: 'warn' as const },
    medium: { label: 'Medium impact', variant: 'info' as const },
    low: { label: 'Low impact', variant: 'neutral' as const },
};

export function ImpactBadge({ impact }: { impact: keyof typeof IMPACT }) {
    return <Badge variant={IMPACT[impact].variant}>{IMPACT[impact].label}</Badge>;
}

/** One "what to fix next" task (DESIGN 5.8): badges, title, evidence, impact, fix, actions. */
export function ActionCard({ action, site, onStatus, compact, canSave = true, className }: {
    action: SiteActionWithStatus;
    site: { ga4: string | null; gsc: string | null };
    onStatus?: (status: ActionStatus, undo: ActionStatus) => void;
    compact?: boolean;
    canSave?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const change = (status: ActionStatus) => {
        setLeaving(true);
        window.setTimeout(() => onStatus?.(status, action.status), 180);
    };
    return (
        <Card
            padding="none"
            as="article"
            className={cn('overflow-hidden transition-[opacity,transform] duration-180 ease-standard motion-reduce:transition-none', leaving && 'translate-x-2 opacity-0', className)}
        >
            <div className="p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <ImpactBadge impact={action.impact} />
                    <Badge>{action.area}</Badge>
                    <span className="text-meta text-fg-muted">{ACTION_TYPE_LABEL[action.type]}</span>
                    {action.status !== 'open' && action.updatedAt ? (
                        <span className="ml-auto text-meta text-fg-muted">{action.status === 'done' ? 'Done' : 'Dismissed'} {fmtDay(action.updatedAt.slice(0, 10))}</span>
                    ) : null}
                </div>
                <h3 className="mt-2 text-title-sm text-fg [overflow-wrap:anywhere]">{action.title}</h3>
                <p className="mt-1 text-body-sm text-fg-secondary [overflow-wrap:anywhere]">{action.summary}</p>
                <p className="mt-2 text-body-sm font-medium text-fg">{action.expectedImpact}</p>
                {!compact ? (
                    <>
                        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                            {action.evidence.map((e) => (
                                <div key={`${e.label}-${e.value}`} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-dashed border-border-subtle pb-1.5">
                                    <dt className="shrink-0 text-meta text-fg-muted">{e.label}</dt>
                                    <dd className="min-w-0 truncate text-right text-body-sm text-fg tabular-nums" title={e.value}>{e.value}</dd>
                                </div>
                            ))}
                        </dl>
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            aria-expanded={open}
                            className="mt-3 inline-flex items-center gap-1 rounded text-body-sm font-medium text-fg-secondary hover:text-fg"
                        >
                            Suggested fix
                            <ChevronDown aria-hidden size={14} className={cn('transition-transform duration-120', open && 'rotate-180')} />
                        </button>
                        {open ? (
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-body-sm text-fg-secondary">
                                {action.fix.map((f) => <li key={f}>{f}</li>)}
                            </ol>
                        ) : null}
                    </>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-surface-sunken/60 px-4 py-2.5 md:px-5">
                <Button asChild size="sm" variant="secondary" icon={Sparkles}>
                    <Link href={askHref(action.askPrompt, site, 'site:actions')} title="Opens Ask with this question (uses 1 message)">Ask AI about this</Link>
                </Button>
                {canSave && onStatus ? (
                    action.status === 'open' ? (
                        <>
                            <Button size="sm" variant="ghost" icon={Check} onClick={() => change('done')}>Mark done</Button>
                            {!compact ? <Button size="sm" variant="ghost" icon={X} onClick={() => change('dismissed')}>Dismiss</Button> : null}
                        </>
                    ) : (
                        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => change('open')}>Reopen</Button>
                    )
                ) : null}
                <span className="ml-auto hidden text-meta text-fg-faint sm:inline">Ask uses 1 message</span>
            </div>
        </Card>
    );
}
