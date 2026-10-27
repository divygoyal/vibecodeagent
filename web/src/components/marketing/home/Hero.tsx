import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';
import { AnalyticsMark, ChatGptMark, ClaudeMark, SearchConsoleMark } from './BrandMarks';

export const PRIMARY_CTA = 'Continue with Google';
export const SECONDARY_CTA = 'Explore the live demo';

const WORKS_WITH = [
    { label: 'Google Analytics 4', mark: <AnalyticsMark size={16} /> },
    { label: 'Search Console', mark: <SearchConsoleMark size={16} /> },
    { label: 'ChatGPT', mark: <ChatGptMark size={16} className="text-fg" /> },
    { label: 'Claude', mark: <ClaudeMark size={16} /> },
];

const TRUST = ['Read-only access', 'Nothing to install', 'No card', 'No site limit'];

/** Pill-shaped "works with" chip: a product mark and its plain name. */
export function LogoChip({ mark, label, className }: { mark: ReactNode; label: string; className?: string }) {
    return (
        <li className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 text-body-sm font-medium whitespace-nowrap text-fg-secondary shadow-xs ${className ?? ''}`}>
            {mark}
            {label}
        </li>
    );
}

/**
 * Hero copy block: announcement pill, H1, one line, the two CTAs (Google sign-in, live demo), a trust line
 * and "works with" chips with the real product marks. The product frame follows it (page.tsx).
 */
export function HeroCopy({ demoHref }: { demoHref: string }) {
    return (
        <div className="mx-auto max-w-[900px] px-4 pt-12 text-center md:px-6 md:pt-20">
            <Link
                href="/ai"
                className="group inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border-subtle bg-surface py-1 pr-3 pl-1 text-body-sm text-fg-secondary shadow-xs transition-colors duration-120 hover:border-border hover:text-fg"
            >
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-meta font-medium text-brand-soft-fg">New</span>
                <span className="truncate">Ask ChatGPT or Claude about your traffic</span>
                <ArrowRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 transition-transform duration-120 group-hover:translate-x-0.5" />
            </Link>
            <h1 className="mt-5 text-balance text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-fg sm:text-display md:text-display-lg">
                All your sites. One screen. Free.
            </h1>
            <p className="mx-auto mt-5 max-w-[600px] text-pretty text-lead text-fg-secondary">
                Connect Google once. Every Analytics and Search Console site you own shows up, with what changed and what to fix next.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <ConnectGoogleButton size="xl" mark label={PRIMARY_CTA} />
                <Button asChild variant="secondary" size="xl" trailingIcon={<ArrowRight aria-hidden size={18} strokeWidth={1.75} />}>
                    <Link href={demoHref}>{SECONDARY_CTA}</Link>
                </Button>
            </div>
            <ul aria-label="The basics" className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-body-sm text-fg-muted">
                {TRUST.map((t) => (
                    <li key={t} className="inline-flex items-center gap-1.5">
                        <Check aria-hidden size={14} strokeWidth={2.5} className="text-brand-text" />
                        {t === 'Read-only access' ? (
                            <Link href="/security" className="tap-area underline decoration-border-strong decoration-dotted underline-offset-4 hover:text-fg hover:decoration-solid">{t}</Link>
                        ) : t}
                    </li>
                ))}
            </ul>
            {/* One row; on phones it scrolls sideways with a fade instead of wrapping into a tall block. */}
            <div className="-mx-4 mt-6 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max items-center gap-2 sm:mx-auto">
                    <span className="mr-1 shrink-0 text-meta text-fg-muted">Works with</span>
                    <ul aria-label="Works with" className="flex items-center gap-2">
                        {WORKS_WITH.map((w) => <LogoChip key={w.label} mark={w.mark} label={w.label} />)}
                    </ul>
                </div>
            </div>
        </div>
    );
}

/** Small mono pointer above the live frame ("this is real, try it"), DataFast-style but plain. */
export function InteractivePointer() {
    return (
        <div aria-hidden className="mb-2 flex items-end justify-end gap-2 pr-2 text-fg-muted md:pr-10">
            <span className="font-mono text-caption">Interactive demo · try the range, sort and tiles</span>
            <svg width="36" height="28" viewBox="0 0 36 28" fill="none" className="mb-[-14px] shrink-0">
                <path d="M2 2c14 0 24 6 28 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M24 18l6 5 3-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}
