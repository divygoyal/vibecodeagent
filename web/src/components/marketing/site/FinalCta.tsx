import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { ConnectGoogleButton } from './ConnectGoogleButton';

/** The only large brand-colour block on the site (DESIGN 5.16). */
export function FinalCta({
    title = 'See every site you own on one screen.',
    description = <>Connect Google once. <span className="whitespace-nowrap">Read-only</span>, nothing to install, no card, no site limit.</>,
    secondary = { href: '/demo', label: 'See the live demo' },
    primaryLabel,
    className,
}: {
    title?: string;
    description?: ReactNode;
    /** The outline link next to Connect Google (the demo page points elsewhere). */
    secondary?: { href: string; label: string };
    /** Label of the Google button (default: ConnectGoogleButton's own). */
    primaryLabel?: string;
    /** Extra classes on the section (e.g. less top padding after a section that already ends with air). */
    className?: string;
}) {
    return (
        <section aria-labelledby="final-cta-title" className={cn('bg-canvas py-16 md:py-24', className)}>
            <div className="mx-auto max-w-[1200px] px-4 md:px-6">
                <div className="rounded-panel bg-brand px-6 py-12 text-center text-brand-fg md:p-16">
                    <h2 id="final-cta-title" className="mx-auto max-w-[720px] text-balance text-[1.875rem] leading-9 font-semibold tracking-[-0.025em] md:text-display-sm">
                        {title}
                    </h2>
                    <p className="mx-auto mt-4 max-w-[640px] text-balance text-lead opacity-80 dark:opacity-100">{description}</p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <ConnectGoogleButton
                            size="xl"
                            variant="google"
                            mark
                            label={primaryLabel}
                            className="w-full border-transparent sm:w-auto"
                        />
                        <Link
                            href={secondary.href}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-body-lg font-medium text-brand-fg ring-1 ring-white/30 transition-colors duration-120 hover:bg-white/10 sm:w-auto"
                        >
                            {secondary.label}
                            <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
