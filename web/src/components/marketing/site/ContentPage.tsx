import type { ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Single-column content page (About, Privacy, Terms, Contact): max-w 720,
 * body-lg text, title/heading headings, brand-text prose links (DESIGN 5.21).
 */
export function ContentPage({
    title,
    crumb,
    lead,
    meta,
    children,
    footer,
}: {
    title: ReactNode;
    /** Breadcrumb label for this page. */
    crumb: string;
    lead?: ReactNode;
    meta?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className="bg-canvas">
            <div className="mx-auto max-w-[720px] px-4 pt-10 pb-16 md:px-6 md:pt-16 md:pb-24">
                <nav aria-label="Breadcrumb" className="mb-8">
                    <ol className="flex items-center gap-2 text-body-sm text-fg-muted">
                        <li><Link href="/" className="tap-area inline-block hover:text-fg">Home</Link></li>
                        <li aria-hidden>/</li>
                        <li aria-current="page" className="text-fg-secondary">{crumb}</li>
                    </ol>
                </nav>
                <h1 className="text-balance text-display-sm text-fg">{title}</h1>
                {lead ? <p className="mt-4 text-lead text-fg-secondary">{lead}</p> : null}
                {meta ? <p className="mt-3 text-body-sm text-fg-muted">{meta}</p> : null}
                <div className="mt-10">{children}</div>
                {footer ? <div className="mt-12 border-t border-border-subtle pt-6">{footer}</div> : null}
            </div>
        </div>
    );
}

/** Long-form text styles for policy and about pages. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                'text-body-lg text-fg-secondary',
                '[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-heading [&_h2]:text-fg [&_h2:first-child]:mt-0',
                '[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-title [&_h3]:text-fg',
                '[&_p]:mt-4 [&_p:first-child]:mt-0',
                '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:marker:text-fg-faint',
                '[&_strong]:font-medium [&_strong]:text-fg',
                '[&_a]:text-brand-text [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-fg',
                '[&_code]:rounded-badge [&_code]:bg-subtle [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-fg',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function CrossLinks({ links }: { links: Array<{ label: string; href: string }> }) {
    return (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
            {links.map((l) => (
                <Link key={l.href} href={l.href} className="tap-area inline-block text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
                    {l.label} →
                </Link>
            ))}
        </div>
    );
}
