import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';
import { AnalyticsMark, ChatGptMark, ClaudeMark, SearchConsoleMark } from './BrandMarks';

/** The one sign-up label, everywhere (also ConnectGoogleButton's default and the demo bar's wording). */
export const PRIMARY_CTA = 'Connect Google — it\'s free';
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
                <span className="truncate"><span className="sm:hidden">ChatGPT &amp; Claude connector</span><span className="max-sm:hidden">Ask ChatGPT or Claude about your traffic</span></span>
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
            <ul aria-label="The basics" className="mx-auto mt-5 grid w-fit grid-cols-2 gap-x-5 gap-y-1.5 text-left text-body-sm text-fg-muted sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-4">
                {TRUST.map((t) => (
                    <li key={t} className="inline-flex items-center gap-1.5">
                        <Check aria-hidden size={14} strokeWidth={2.5} className="text-brand-text" />
                        {t === 'Read-only access' ? (
                            <Link href="/security" className="tap-area underline decoration-border-strong decoration-dotted underline-offset-4 hover:text-fg hover:decoration-solid">{t}</Link>
                        ) : t}
                    </li>
                ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span className="w-full text-meta text-fg-muted sm:mr-1 sm:w-auto">Works with</span>
                <ul aria-label="Works with" className="flex flex-wrap items-center justify-center gap-2">
                    {WORKS_WITH.map((w) => <LogoChip key={w.label} mark={w.mark} label={w.label} />)}
                </ul>
            </div>
        </div>
    );
}
