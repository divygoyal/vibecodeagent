import Link from 'next/link';
import { ArrowRight, Bot, LayoutDashboard, LayoutGrid, Trophy, type LucideIcon } from 'lucide-react';

import { Button, Pill } from '@/components/ui';
import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';
import { Section, SectionHeading } from '../site/Section';

export function HomeHero() {
    return (
        <div className="mx-auto max-w-[880px] px-4 pt-14 text-center md:px-6 md:pt-20">
            <Pill tone="neutral">Free · Google Analytics 4 + Search Console</Pill>
            <h1 className="mt-5 text-balance text-display-sm text-fg md:text-display lg:text-display-lg">
                All your sites. One screen. Free.
            </h1>
            <p className="mx-auto mt-5 max-w-[680px] text-pretty text-lead text-fg-secondary">
                Connect Google once and see clicks, impressions and visitors for every site you own. Build dashboards,
                show verified traffic on a public leaderboard, and ask ChatGPT or Claude about your numbers.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <ConnectGoogleButton size="xl" mark />
                <Button asChild variant="secondary" size="xl" trailingIcon={ArrowRight}>
                    <Link href="/demo">See the live demo</Link>
                </Button>
            </div>
            <p className="mt-4 text-meta text-fg-muted">Read-only access · No card · No site limit</p>
        </div>
    );
}

const PILLARS: Array<{ icon: LucideIcon; title: string; text: string; href: string; cta: string }> = [
    {
        icon: LayoutGrid,
        title: 'Portfolio',
        text: 'Every Analytics property and Search Console site as one card: clicks, impressions, users, deltas and a sparkline. Drops of 30% or more get flagged.',
        href: '/demo',
        cta: 'Open the demo',
    },
    {
        icon: LayoutDashboard,
        title: 'Dashboards',
        text: 'Drag widgets onto a grid, mix data from any of your sites, and share a read-only link or an embed. A friendlier Looker Studio.',
        href: '#dashboards',
        cta: 'See a dashboard',
    },
    {
        icon: Trophy,
        title: 'Leaderboard',
        text: 'Put a site on the public leaderboard with numbers straight from Google. You decide what is public; Search Console owners rank.',
        href: '/leaderboard',
        cta: 'View the leaderboard',
    },
    {
        icon: Bot,
        title: 'ChatGPT & Claude',
        text: 'Connect your Analytics and Search Console to ChatGPT or Claude and ask about any site in plain English. Read-only, and free.',
        href: '#ai',
        cta: 'How it works',
    },
];

export function Pillars() {
    return (
        <Section id="product" labelledBy="product-title" className="pt-0 md:pt-0">
            <SectionHeading
                id="product-title"
                eyebrow="One Google sign-in"
                title="Four things you get, all free"
                description="TrafficClaw reads your Google Analytics 4 and Search Console data with read-only access and puts it to work in four ways."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PILLARS.map((p) => (
                    <Link
                        key={p.title}
                        href={p.href}
                        className="group tc-card flex flex-col rounded-card border border-border-subtle bg-surface p-6 shadow-card transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0"
                    >
                        <span className="inline-flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                            <p.icon aria-hidden size={20} strokeWidth={1.75} />
                        </span>
                        <h3 className="mt-4 text-title text-fg">{p.title}</h3>
                        <p className="mt-2 flex-1 text-body text-fg-secondary">{p.text}</p>
                        <span className="mt-4 inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary group-hover:text-fg">
                            {p.cta}
                            <ArrowRight aria-hidden size={14} strokeWidth={1.75} className="transition-transform duration-120 group-hover:translate-x-0.5" />
                        </span>
                    </Link>
                ))}
            </div>
        </Section>
    );
}

const STEPS = [
    {
        title: 'Connect Google',
        text: 'Sign in with Google and allow read-only access to Analytics and Search Console. No script to install, no card.',
    },
    {
        title: 'See every site',
        text: 'Your portfolio fills in with every property and site your account can see, paired by domain, with the numbers that changed.',
    },
    {
        title: 'Share, rank or ask',
        text: 'Build a dashboard and share it, add a site to the leaderboard, or connect ChatGPT or Claude and ask questions.',
    },
];

export function HowItWorks() {
    return (
        <Section id="how-it-works" tone="surface" labelledBy="how-title">
            <SectionHeading id="how-title" eyebrow="How it works" title="Up and running in three steps" align="center" />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
                {STEPS.map((s, i) => (
                    <li key={s.title} className="rounded-card border border-border-subtle bg-canvas p-6">
                        <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand text-body-sm font-semibold text-brand-fg">{i + 1}</span>
                        <h3 className="mt-4 text-title text-fg">{s.title}</h3>
                        <p className="mt-2 text-body-lg text-fg-secondary">{s.text}</p>
                    </li>
                ))}
            </ol>
        </Section>
    );
}

export function WhyFree() {
    const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
    const points = [
        {
            title: 'Your data stays in Google',
            text: 'TrafficClaw reads your numbers with read-only access and draws them. That costs us very little per site, so there is no site limit.',
        },
        {
            title: 'AI runs on your plan',
            text: 'When you ask ChatGPT or Claude through the connector, the AI runs on your account with them, not on ours.',
        },
        {
            title: 'Only Ask messages are paid',
            text: `The built-in Ask chat costs us AI fees. You start with ${FREE_START_CREDITS} messages; plans from $${growth.priceUsd} a month add more. Later we plan to earn from labelled sponsor slots on the leaderboard.`,
        },
    ];
    return (
        <Section id="why-free" labelledBy="why-free-title">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                <SectionHeading
                    id="why-free-title"
                    eyebrow="Why free?"
                    title="Free, because most of it is cheap to run"
                    description="We would rather tell you how the money works than hide it in the small print."
                />
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                    {points.map((p) => (
                        <div key={p.title} className="rounded-card border border-border-subtle bg-surface p-5 shadow-card">
                            <h3 className="text-title-sm text-fg">{p.title}</h3>
                            <p className="mt-1.5 text-body text-fg-secondary">{p.text}</p>
                        </div>
                    ))}
                    <Link href="/pricing" className="inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary hover:text-fg sm:col-span-3 lg:col-span-1">
                        See pricing <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </Link>
                </div>
            </div>
        </Section>
    );
}
