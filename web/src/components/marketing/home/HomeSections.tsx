import Link from 'next/link';
import { ArrowRight, Bot, Database, MessageSquareText, type LucideIcon } from 'lucide-react';

import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';
import { Section, SectionHeading } from '../site/Section';

/** "Why free?": how the money works, in three short cards. */
export function WhyFree() {
    const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
    const points: Array<{ icon: LucideIcon; title: string; text: string }> = [
        { icon: Database, title: 'Your data stays in Google', text: 'We read and draw it. That costs little, so no site limit.' },
        { icon: Bot, title: 'AI runs on your plan', text: 'ChatGPT and Claude answer on your account, not ours.' },
        {
            icon: MessageSquareText,
            title: 'Only Ask messages are paid',
            text: `${FREE_START_CREDITS} free to start. More from $${growth.priceUsd} a month.`,
        },
    ];
    return (
        <Section id="why-free" labelledBy="why-free-title">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading id="why-free-title" eyebrow="Why free?" title="Free, because it is cheap to run" />
                <Link href="/pricing" className="tap-area inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary hover:text-fg">
                    See pricing <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                </Link>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {points.map((p) => (
                    <li key={p.title} className="rounded-card border border-border-subtle bg-surface p-5 shadow-card">
                        <span className="inline-flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                            <p.icon aria-hidden size={18} strokeWidth={1.75} />
                        </span>
                        <h3 className="mt-4 text-title-sm text-fg">{p.title}</h3>
                        <p className="mt-1 text-body text-fg-secondary">{p.text}</p>
                    </li>
                ))}
            </ul>
        </Section>
    );
}
