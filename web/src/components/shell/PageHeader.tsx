import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/cn';

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
export function PageHeader({ title, subtitle, icon, badges, actions, secondaryActions, tabs, backHref, note, className }: PageHeaderProps) {
    return (
        <header className={cn('mb-6', className)}>
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {backHref ? (
                            <Link href={backHref} aria-label="Back" className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-subtle hover:text-fg">
                                <ArrowLeft aria-hidden size={16} />
                            </Link>
                        ) : null}
                        {icon ? <span className="flex shrink-0">{icon}</span> : null}
                        <h1 className="min-w-0 truncate text-title text-fg md:text-heading">{title}</h1>
                        {badges ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{badges}</div> : null}
                    </div>
                    {subtitle ? <p className="mt-1 text-body-sm text-fg-muted">{subtitle}</p> : null}
                    {note ? <p className="mt-0.5 text-meta text-fg-faint italic">{note}</p> : null}
                </div>
                {actions || secondaryActions ? (
                    <div className="-mx-4 flex min-w-0 flex-col gap-2 px-4 md:mx-0 md:items-end md:px-0">
                        {actions ? (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] max-md:flex-row-reverse max-md:justify-end md:flex-wrap md:justify-end md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
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
