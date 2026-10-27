import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ConnectGoogleButton } from './ConnectGoogleButton';

/** The only large brand-colour block on the site (DESIGN 5.16). */
export function FinalCta({
    title = 'See every site you own on one screen.',
    description = 'Connect Google once. Read-only, no card, no site limit.',
}: {
    title?: string;
    description?: string;
}) {
    return (
        <section aria-labelledby="final-cta-title" className="bg-canvas py-16 md:py-24">
            <div className="mx-auto max-w-[1200px] px-4 md:px-6">
                <div className="rounded-panel bg-brand px-6 py-12 text-center text-brand-fg md:p-16">
                    <h2 id="final-cta-title" className="mx-auto max-w-[720px] text-balance text-[1.875rem] leading-9 font-semibold tracking-[-0.025em] md:text-display-sm">
                        {title}
                    </h2>
                    <p className="mx-auto mt-4 max-w-[560px] text-lead opacity-80">{description}</p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <ConnectGoogleButton
                            size="xl"
                            variant="google"
                            mark
                            className="w-full border-transparent sm:w-auto"
                        />
                        <Link
                            href="/demo"
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-body-lg font-medium text-brand-fg ring-1 ring-white/30 transition-colors duration-120 hover:bg-white/10 sm:w-auto"
                        >
                            See the live demo
                            <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
