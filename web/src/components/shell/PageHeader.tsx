'use client';

import Link from 'next/link';
import { isValidElement, useEffect, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useOptionalShell } from './ShellContext';

/**
 * True when the actions hold an Ask AI action: an AskButton (a `prompt` and a
 * `site`) or a link into /dashboard/ask. Walks fragments and asChild wrappers.
 */
export function hasAskAction(node: ReactNode, depth = 0): boolean {
    if (depth > 5 || node === null || node === undefined || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some((n) => hasAskAction(n, depth + 1));
    if (!isValidElement(node)) return false;
    const props = node.props as { prompt?: unknown; site?: unknown; href?: unknown; children?: ReactNode };
    if (typeof props.prompt === 'string' && props.site !== undefined) return true;
    if (typeof props.href === 'string' && props.href.startsWith('/dashboard/ask')) return true;
    return hasAskAction(props.children, depth + 1);
}

export interface PageHeaderProps {
    /** Page title (one h1 per page). Site pages pass the host. */
    title: ReactNode;
    /** Dot-separated facts: "8 of 12 sites synced · Free plan · last 3 months vs previous". */
    subtitle?: ReactNode;
    /** Leading icon, e.g. <Favicon size={24} /> on site pages. */
    icon?: ReactNode;
    /** Next to the title: <Badge>Domain</Badge> <Badge>GA4</Badge> <StatusPill …/>. */
    badges?: ReactNode;
    /** Right side, in order: SearchInput, Select, then <DateRangeControl /> last. */
    actions?: ReactNode;
    /** Optional second right-side row (e.g. view toggles under the actions). */
    secondaryActions?: ReactNode;
    /** Tabs row under the header (<Tabs variant="underline" />). */
    tabs?: ReactNode;
    /** Keep the badges on phones (short status pills such as "4 connected"); default hides them under 640px. */
    keepBadgesOnPhone?: boolean;
    /** Shows a back arrow link before the title. */
    backHref?: string;
    /** Italic demo note: "Illustrative portfolio". */
    note?: ReactNode;
    className?: string;
}

/**
 * Page title row (DESIGN 3.2). Render it as the first child of a page; the
 * shell provides the sidebar, topbar and breadcrumb. On mobile the title
 * shrinks and the actions become one horizontally scrolling row.
 */
export function PageHeader({ title, subtitle, icon, badges, keepBadgesOnPhone, actions, secondaryActions, tabs, backHref, note, className }: PageHeaderProps) {
    // One Ask AI per screen (critique #7): a header with its own Ask hides the topbar's.
    const shell = useOptionalShell();
    const setPageAsk = shell?.setPageAsk;
    const ownAsk = hasAskAction(actions) || hasAskAction(secondaryActions);
    useEffect(() => {
        if (!setPageAsk || !ownAsk) return;
        setPageAsk(true);
        return () => setPageAsk(false);
    }, [setPageAsk, ownAsk]);
    return (
        <header className={cn('mb-6', className)}>
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {backHref ? (
                            <Link href={backHref} aria-label="Back" className="tap-area -ml-1 flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-subtle hover:text-fg">
                                <ArrowLeft aria-hidden size={16} />
                            </Link>
                        ) : null}
                        {icon ? <span className="flex shrink-0">{icon}</span> : null}
                        <h1 className="min-w-0 truncate text-title text-fg md:text-heading" title={typeof title === 'string' ? title : undefined}>{title}</h1>
                        {/* Phones: no badges, so they never squeeze the title (critique #8). */}
                        {badges ? <div className={cn('flex shrink-0 flex-wrap items-center gap-1.5', !keepBadgesOnPhone && 'max-sm:hidden')}>{badges}</div> : null}
                    </div>
                    {subtitle ? <p className="mt-1 text-body-sm text-pretty text-fg-muted">{subtitle}</p> : null}
                    {note ? <p className="mt-0.5 text-meta text-fg-muted italic">{note}</p> : null}
                </div>
                {actions || secondaryActions ? (
                    <div className="flex min-w-0 flex-col gap-2 md:items-end">
                        {actions ? (
                            // Phones: the last action (the date range) leads, and the row wraps
                            // upwards instead of running off the screen (critique #8).
                            <div className="flex flex-wrap items-center gap-2 max-md:flex-row-reverse max-md:flex-wrap-reverse max-md:justify-end md:justify-end">
                                {actions}
                            </div>
                        ) : null}
                        {secondaryActions ? <div className="flex flex-wrap items-center gap-2">{secondaryActions}</div> : null}
                    </div>
                ) : null}
            </div>
            {tabs ? <div className="mt-4">{tabs}</div> : null}
        </header>
    );
}
