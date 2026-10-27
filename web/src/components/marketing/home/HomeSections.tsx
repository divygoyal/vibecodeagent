import Link from 'next/link';
import { ArrowRight, Bot, Database, MessageSquareText, type LucideIcon } from 'lucide-react';

import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';

/** "Why free?": how the money works, in three short cards. */
export function WhyFree() {
    const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
    const points: Array<{ icon: LucideIcon; title: string; text: string }> = [
        { icon: Database, title: 'Your data stays in Google', text: 'We only read and chart it, so there is no site limit.' },
        { icon: Bot, title: 'AI runs on your plan', text: 'ChatGPT and Claude answer on your own account.' },
        {
            icon: MessageSquareText,
            title: 'Only Ask messages are paid',
            text: `${FREE_START_CREDITS} free to start. More from $${growth.priceUsd} a month.`,
        },
    ];
    return (
        <section id="why-free" aria-labelledby="why-free-title" className="scroll-mt-20 border-y border-border-subtle bg-surface py-12 md:py-16">
            <div className="mx-auto grid max-w-[1200px] px-4 md:px-6 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-12">
                <div>
                    <p className="mb-2 text-body-sm font-medium text-brand-text">Why free?</p>
                    <h2 id="why-free-title" className="text-balance text-heading text-fg md:text-heading-lg">Most of it costs us very little to run</h2>
                    <Link href="/pricing" className="tap-area mt-3 inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary hover:text-fg">
                        See pricing <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </Link>
                </div>
                <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
                    {points.map((p) => (
                        <li key={p.title} className="flex gap-3 sm:flex-col sm:gap-2">
                            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                                <p.icon aria-hidden size={18} strokeWidth={1.75} />
                            </span>
                            <span>
                                <span className="block text-title-sm text-fg">{p.title}</span>
                                <span className="mt-0.5 block text-body text-fg-secondary">{p.text}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
