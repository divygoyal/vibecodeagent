'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Check, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ACTION_TYPE_LABEL, shortImpact } from './lib/actionText';
import { displayPage, pageRef } from './lib/rules';
import type { ActionImpact, ActionStatus } from './lib/types';
import { askHref } from './SiteStates';
import type { SiteActionWithStatus } from './useSiteActions';

const IMPACT: Record<ActionImpact, { label: string; bars: number; tone: string }> = {
    high: { label: 'High impact', bars: 3, tone: 'bg-warn' },
    medium: { label: 'Medium impact', bars: 2, tone: 'bg-info' },
    low: { label: 'Low impact', bars: 1, tone: 'bg-fg-faint' },
};

/** Priority as signal bars (Linear-style), not a badge: 3 bars high, 2 medium, 1 low. */
export function ImpactBars({ impact, className }: { impact: ActionImpact; className?: string }) {
    const d = IMPACT[impact];
    return (
        <span className={cn('inline-flex h-3 shrink-0 items-end gap-[2px]', className)} title={d.label}>
            {[5, 8, 11].map((h, i) => (
                <span key={h} aria-hidden className={cn('w-[3px] rounded-[1px]', i < d.bars ? d.tone : 'bg-border')} style={{ height: h }} />
            ))}
            <span className="sr-only">{d.label}</span>
        </span>
    );
}

/**
 * One "what to fix next" task as a compact row (round 4, audit item 4): impact
 * bars, title, the page it is about and the monthly gain, about 56 px tall.
 * Each number shows once; the why, the suggested fix and the buttons open
 * under the row.
 */
export function ActionRow({ action, site, onStatus, canSave = true, defaultOpen = false, askLink }: {
    action: SiteActionWithStatus;
    site: { ga4: string | null; gsc: string | null; siteHost?: string | null };
    onStatus?: (status: ActionStatus, undo: ActionStatus) => void;
    canSave?: boolean;
    defaultOpen?: boolean;
    /** Rewrites the Ask link (the home page's sample rows send it through the live demo). */
    askLink?: (href: string) => string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const [leaving, setLeaving] = useState(false);
    const panelId = useId();
    const change = (status: ActionStatus) => {
        setLeaving(true);
        window.setTimeout(() => onStatus?.(status, action.status), 180);
    };
    const gain = shortImpact(action.expectedImpact);
    const page = action.page ? displayPage(pageRef(action.page), site.siteHost ?? null) : null;
    // The page the task is about (once: not when the title already names it); audit tasks say which check and page.
    const where = action.type === 'audit'
        ? `${ACTION_TYPE_LABEL.audit}${page ? ` · ${page === '/' ? 'homepage' : page}` : ''}`
        : page && !action.title.includes(page) ? page : ACTION_TYPE_LABEL[action.type];
    const stamp = action.status !== 'open' && action.updatedAt ? `${action.status === 'done' ? 'Done' : 'Dismissed'} ${fmtDay(action.updatedAt.slice(0, 10))}` : null;
    return (
        <li
            data-action-row
            className={cn('list-none transition-[opacity,transform] duration-180 ease-standard motion-reduce:transition-none', leaving && 'translate-x-2 opacity-0')}
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'group flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors duration-120 hover:bg-subtle/60 focus-visible:-outline-offset-2 md:px-5',
                    open && 'bg-subtle/60',
                )}
            >
                <ImpactBars impact={action.impact} />
                <span className="min-w-0 flex-1">
                    {/* Phones: the gain sits beside the title, so the page path under them gets the full width (round 4 polish). */}
                    <span className="flex min-w-0 items-start gap-3">
                        <span className="block min-w-0 flex-1 text-body-sm font-medium text-fg max-md:line-clamp-2 md:truncate [overflow-wrap:anywhere]">{action.title}</span>
                        {gain ? (
                            <span className="shrink-0 text-right leading-tight md:hidden">
                                <span className="block text-body-sm font-semibold text-fg tabular-nums">{gain.value}</span>
                                <span className="block text-meta text-fg-muted">{gain.unit}</span>
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-meta text-fg-muted">
                        {where}
                        {stamp ? <span> · {stamp}</span> : null}
                    </span>
                </span>
                {gain ? (
                    <span className="shrink-0 text-right leading-tight max-md:hidden">
                        <span className="block text-body-sm font-semibold text-fg tabular-nums">{gain.value}</span>
                        <span className="block text-meta text-fg-muted">{gain.unit}</span>
                    </span>
                ) : null}
                <ChevronDown aria-hidden size={16} className={cn('shrink-0 text-fg-muted transition-transform duration-120 group-hover:text-fg', open && 'rotate-180')} />
            </button>
            {open ? (
                <div id={panelId} className="border-t border-dashed border-border-subtle bg-surface-sunken/40 px-4 pb-3 pt-2.5 md:pl-[46px] md:pr-5">
                    <p className="text-body-sm text-fg-secondary [overflow-wrap:anywhere]">{action.summary}</p>
                    {!gain ? <p className="mt-1 text-body-sm font-medium text-fg">{action.expectedImpact}</p> : null}
                    <p className="mt-2.5 text-meta font-medium text-fg-muted">Suggested fix</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-body-sm text-fg-secondary">
                        {action.fix.map((f) => <li key={f}>{f}</li>)}
                    </ol>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="secondary" icon={Sparkles}>
                            <Link href={(askLink ?? String)(askHref(action.askPrompt, site, 'site:actions'))} title="Opens Ask with this question (uses 1 message)">Ask AI about this</Link>
                        </Button>
                        {canSave && onStatus ? (
                            action.status === 'open' ? (
                                <>
                                    <Button size="sm" variant="ghost" icon={Check} onClick={() => change('done')}>Mark done</Button>
                                    <Button size="sm" variant="ghost" icon={X} onClick={() => change('dismissed')}>Dismiss</Button>
                                </>
                            ) : (
                                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => change('open')}>Reopen</Button>
                            )
                        ) : null}
                    </div>
                </div>
            ) : null}
        </li>
    );
}

/** A list of task rows in one card-like frame (divider between rows). */
export function ActionList({ children, className }: { children: React.ReactNode; className?: string }) {
    return <ul className={cn('m-0 divide-y divide-border-subtle p-0', className)}>{children}</ul>;
}
