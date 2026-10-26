import type { ReactNode } from 'react';

import { Pill } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Page section with the marketing rhythm: py-24 desktop / py-16 mobile, 1200px content (DESIGN 5.16). */
export function Section({
    id,
    tone = 'canvas',
    className,
    innerClassName,
    children,
    labelledBy,
}: {
    id?: string;
    tone?: 'canvas' | 'surface';
    className?: string;
    innerClassName?: string;
    children: ReactNode;
    labelledBy?: string;
}) {
    return (
        <section
            id={id}
            aria-labelledby={labelledBy}
            className={cn('scroll-mt-20 py-16 md:py-24', tone === 'surface' ? 'border-y border-border-subtle bg-surface' : 'bg-canvas', className)}
        >
            <div className={cn('mx-auto max-w-[1200px] px-4 md:px-6', innerClassName)}>{children}</div>
        </section>
    );
}

/** Eyebrow pill + section title (display-sm) + lead description. */
export function SectionHeading({
    id,
    eyebrow,
    title,
    description,
    align = 'left',
    as: H = 'h2',
    className,
}: {
    id?: string;
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    align?: 'left' | 'center';
    as?: 'h1' | 'h2';
    className?: string;
}) {
    return (
        <div className={cn(align === 'center' ? 'mx-auto max-w-[720px] text-center' : 'max-w-[720px]', className)}>
            {eyebrow ? <Pill tone="neutral" className="mb-4">{eyebrow}</Pill> : null}
            <H id={id} className={cn('text-balance text-fg', H === 'h1' ? 'text-display-sm md:text-display' : 'text-[1.875rem] leading-9 font-semibold tracking-[-0.025em] md:text-display-sm')}>
                {title}
            </H>
            {description ? (
                <p className={cn('mt-4 text-pretty text-lead text-fg-secondary', align === 'center' ? 'mx-auto max-w-[640px]' : 'max-w-[640px]')}>{description}</p>
            ) : null}
        </div>
    );
}

/** A simple browser frame around real product UI (DESIGN 2.8). */
export function BrowserFrame({ url, children, className, bodyClassName }: { url: string; children: ReactNode; className?: string; bodyClassName?: string }) {
    return (
        <div className={cn('overflow-hidden rounded-panel border border-border-subtle bg-surface shadow-card', className)}>
            <div className="flex h-10 items-center gap-3 border-b border-border-subtle bg-surface px-4">
                <div aria-hidden className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="size-2.5 rounded-full bg-border" />
                </div>
                <div className="mx-auto flex h-6 min-w-0 max-w-[360px] flex-1 items-center justify-center truncate rounded-full bg-subtle px-3 font-mono text-caption text-fg-muted">
                    {url}
                </div>
                <div aria-hidden className="w-[42px]" />
            </div>
            <div className={cn('bg-canvas', bodyClassName)}>{children}</div>
        </div>
    );
}
