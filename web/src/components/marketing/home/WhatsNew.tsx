import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { fmtDay } from '@/lib/format';
import { HOME_HIGHLIGHTS } from '../changelog/entries';

/** Three dated highlights from the changelog (teardown-b 13.5): a quiet sign that the product ships. */
export function WhatsNew() {
    return (
        <section aria-labelledby="whats-new-title" className="bg-canvas pb-4 md:pb-8">
            <div className="mx-auto max-w-[1200px] px-4 md:px-6">
                <div className="rounded-card border border-border-subtle bg-surface p-5 shadow-card md:p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 id="whats-new-title" className="text-title text-fg">What’s new</h2>
                        <Link href="/changelog" className="tap-area inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary hover:text-fg">
                            See the changelog
                            <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                        </Link>
                    </div>
                    <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                        {HOME_HIGHLIGHTS.map((h) => (
                            <li key={h.title} className="border-t border-border-subtle pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6 md:first:border-l-0 md:first:pl-0 first:border-t-0 first:pt-0">
                                <Link href={h.href} className="group block">
                                    <time dateTime={h.date} className="text-meta text-fg-muted tabular-nums">{fmtDay(h.date)}</time>
                                    <p className="mt-1 text-body font-medium text-fg group-hover:underline group-hover:underline-offset-4">{h.title}</p>
                                    <p className="mt-0.5 text-body-sm text-fg-secondary">{h.text}</p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}
