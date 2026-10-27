import Link from 'next/link';
import { ArrowRight, Check, LayoutGrid, ListChecks, MessagesSquare, PanelsTopLeft, Trophy, type LucideIcon } from 'lucide-react';

import { Button, MetricDelta } from '@/components/ui';
import { fmtCompact } from '@/lib/format';
import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';
import type { DemoActions, DemoPortfolio } from '../demo/types';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';
import { Section, SectionHeading } from '../site/Section';
import { SiteIcon } from '../site/SiteIcon';
import { FixNextPreview } from './FixNextPreview';

/** Products TrafficClaw works with: plain names, no logos (brand guidelines; see NOTES-R2-HOME). */
const WORKS_WITH = ['Google Analytics 4', 'Search Console', 'ChatGPT', 'Claude', 'Cursor'];

export function HomeHero() {
    return (
        <div className="mx-auto max-w-[880px] px-4 pt-14 text-center md:px-6 md:pt-20">
            <Link
                href="/ai"
                className="group inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border-subtle bg-surface py-1 pr-3 pl-1 text-body-sm text-fg-secondary shadow-xs transition-colors duration-120 hover:border-border hover:text-fg"
            >
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-meta font-medium text-brand-soft-fg">New</span>
                <span className="truncate">Ask ChatGPT or Claude about your traffic</span>
                <ArrowRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 transition-transform duration-120 group-hover:translate-x-0.5" />
            </Link>
            <h1 className="mt-5 text-balance text-display-sm text-fg md:text-display lg:text-display-lg">
                All your sites. One screen. Free.
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-pretty text-lead text-fg-secondary">
                Connect Google once. Every Analytics property and Search Console site you own lands on one screen, with what
                changed and what to fix next.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <ConnectGoogleButton size="xl" mark />
                <Button asChild variant="secondary" size="xl" trailingIcon={<ArrowRight aria-hidden size={18} strokeWidth={1.75} />}>
                    <Link href="/demo">See the live demo</Link>
                </Button>
            </div>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-meta text-fg-muted">
                <Link href="/security" className="tap-area underline decoration-border-strong decoration-dotted underline-offset-4 hover:text-fg hover:decoration-solid">
                    Read-only access
                </Link>
                <span aria-hidden>·</span>
                <span>Nothing to install</span>
                <span aria-hidden>·</span>
                <span>No card</span>
                <span aria-hidden>·</span>
                <span>No site limit</span>
            </p>
            {/* One row at every width: on phones it scrolls sideways (fade at the right edge) instead of wrapping,
                so the product picture stays high on the first screen. */}
            <div className="-mx-4 mt-5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:overflow-visible sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max items-center gap-3 sm:mx-auto sm:gap-4">
                    <p className="shrink-0 text-meta text-fg-muted">Works with</p>
                    <ul aria-label="Works with" className="flex items-center gap-x-4 text-meta font-medium whitespace-nowrap text-fg-secondary sm:gap-x-5 sm:text-body-sm">
                        {WORKS_WITH.map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

const PILLARS: Array<{ icon: LucideIcon; label: string; title: string; text: string; href: string; cta: string }> = [
    {
        icon: LayoutGrid,
        label: 'Portfolio',
        title: 'Every site, one glance',
        text: 'Every Analytics property and Search Console site becomes a card: clicks, impressions, visitors, trend and change. Drops of 30% or more get flagged, so you open the sites that need you first.',
        href: '/demo',
        cta: 'Open the demo',
    },
    {
        icon: PanelsTopLeft,
        label: 'Dashboards',
        title: 'Dashboards without the setup',
        text: 'Start from a template, drag widgets onto a grid and mix data from any of your sites. Share a read-only link, with a password if you want one, or embed it.',
        href: '#dashboards',
        cta: 'See a dashboard',
    },
    {
        icon: Trophy,
        label: 'Leaderboard',
        title: 'Proof, not screenshots',
        text: 'Put a site on the public leaderboard with numbers straight from Google. You choose what is public, and only owners verified in Search Console can rank.',
        href: '/leaderboard',
        cta: 'View the leaderboard',
    },
    {
        icon: MessagesSquare,
        label: 'ChatGPT & Claude',
        title: 'Ask the AI you already use',
        text: 'Add one URL to ChatGPT or Claude and ask about any of your sites in plain English. Read-only, free, and it runs on your own AI plan.',
        href: '#ai',
        cta: 'How it works',
    },
];

/**
 * "What you get": four outcome-led cards plus the fifth, wide "What to fix next"
 * card with the Actions page in miniature (teardown-b 13.3, steal list #12/#22).
 */
export function Pillars({ actions }: { actions: DemoActions | null }) {
    return (
        <Section id="product" labelledBy="product-title" className="pt-0 md:pt-0">
            <SectionHeading
                id="product-title"
                eyebrow="One Google sign-in"
                title="What you get, free"
                description="TrafficClaw reads your Google Analytics 4 and Search Console data with read-only access and turns it into five things you can use today."
            />
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PILLARS.map((p) => (
                    <Link
                        key={p.title}
                        href={p.href}
                        className="group tc-card flex flex-col rounded-card border border-border-subtle bg-surface p-5 shadow-card transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0 md:p-6"
                    >
                        <span className="flex items-center gap-2.5">
                            <span className="inline-flex size-8 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                                <p.icon aria-hidden size={16} strokeWidth={1.75} />
                            </span>
                            <span className="text-body-sm font-medium text-fg-muted">{p.label}</span>
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

            {actions && actions.actions.length ? (
                <article
                    aria-labelledby="fix-next-title"
                    className="tc-card mt-4 grid grid-cols-1 items-center gap-8 rounded-card border border-border-subtle bg-surface p-5 shadow-card md:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
                >
                    <div>
                        <span className="flex items-center gap-2.5">
                            <span className="inline-flex size-8 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                                <ListChecks aria-hidden size={16} strokeWidth={1.75} />
                            </span>
                            <span className="text-body-sm font-medium text-fg-muted">What to fix next</span>
                        </span>
                        <h3 id="fix-next-title" className="mt-4 text-balance text-heading text-fg md:text-heading-lg">
                            A to-do list ranked by clicks
                        </h3>
                        <p className="mt-3 text-pretty text-body-lg text-fg-secondary">
                            TrafficClaw reads your Search Console and Analytics data and ranks tasks by what each could bring, such as
                            moving a query from page two onto page one. Every task shows the numbers behind it and a suggested fix, and
                            you can ask AI about it.
                        </p>
                        <p className="mt-4 text-body text-fg-muted">
                            Covers queries close to page one, pages with a low click-through rate, decaying pages, cannibalization
                            and sudden drops. Mark a task done or dismiss it, and it leaves your list.
                        </p>
                        <div className="mt-6">
                            <ConnectGoogleButton size="lg" variant="secondary" mark label="See yours, free" className="w-full sm:w-auto" />
                        </div>
                    </div>
                    <FixNextPreview data={actions} />
                </article>
            ) : null}
        </Section>
    );
}

/* ─── How it works ─── */

function StepPermissions() {
    return (
        <div className="rounded-control border border-border-subtle bg-surface p-3 shadow-xs">
            <p className="text-meta text-fg-muted">TrafficClaw wants to</p>
            <ul className="mt-2 space-y-1.5">
                {[
                    { text: 'See your Google Analytics data', scope: 'analytics.readonly' },
                    { text: 'See your Search Console data', scope: 'webmasters.readonly' },
                ].map((s) => (
                    <li key={s.scope} className="flex items-start gap-2">
                        <Check aria-hidden size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-brand-text" />
                        <span className="min-w-0">
                            <span className="block text-body-sm text-fg">{s.text}</span>
                            <code className="font-mono text-caption text-fg-muted">{s.scope}</code>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function StepSites({ portfolio }: { portfolio: DemoPortfolio }) {
    const sites = portfolio.sites.filter((s) => s.search && s.search.prev).slice(0, 3);
    return (
        <ul className="divide-y divide-border-subtle rounded-control border border-border-subtle bg-surface shadow-xs">
            {sites.map((site) => (
                <li key={site.key} className="flex items-center gap-2.5 px-3 py-2">
                    <SiteIcon host={site.host} size={16} />
                    <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{site.label}</span>
                    <span className="text-body-sm tabular-nums text-fg">{fmtCompact(site.search!.cur.clicks)}</span>
                    <MetricDelta metric="clicks" current={site.search!.cur.clicks} previous={site.search!.prev?.clicks} className="w-14 justify-end" />
                </li>
            ))}
            <li className="px-3 py-2 text-meta text-fg-muted">
                {portfolio.totals.sites.total} sites · clicks, last 28 days · sample data
            </li>
        </ul>
    );
}

function StepNext({ actions }: { actions: DemoActions | null }) {
    const top = actions?.actions[0];
    return (
        <div className="space-y-2">
            {top ? (
                <div className="flex items-center gap-3 rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-xs">
                    <ListChecks aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                    <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{top.title}</span>
                    <span className="shrink-0 text-body-sm font-medium tabular-nums text-fg">+{fmtCompact(top.gain)}</span>
                </div>
            ) : null}
            <div className="flex items-center gap-3 rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-xs">
                <PanelsTopLeft aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">Share a client report</span>
                <span className="shrink-0 text-meta text-fg-muted">read-only link</span>
            </div>
            <div className="flex items-center gap-3 rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-xs">
                <MessagesSquare aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">“Which site lost the most clicks?”</span>
                <span className="shrink-0 text-meta text-fg-muted">ChatGPT</span>
            </div>
        </div>
    );
}

/** Three steps, each with the real thing you see at that step (no numbered dark circles, critique #15). */
export function HowItWorks({ portfolio, actions }: { portfolio: DemoPortfolio; actions: DemoActions | null }) {
    const steps = [
        {
            title: 'Sign in with Google',
            text: 'Allow read-only access to Analytics and Search Console. That is the whole setup: no script on your sites, no card.',
            visual: <StepPermissions />,
            link: { href: '/security', label: 'What we read and store' },
        },
        {
            title: 'Every site shows up',
            text: 'Each property and site your account can see becomes a card, paired by domain, with the numbers that changed.',
            visual: <StepSites portfolio={portfolio} />,
            link: { href: '/demo', label: 'Open the demo' },
        },
        {
            title: 'Fix, share or ask',
            text: 'Start with the top task, send a client a live dashboard, or ask ChatGPT or Claude about any site.',
            visual: <StepNext actions={actions} />,
            link: { href: '/ai', label: 'Connect ChatGPT or Claude' },
        },
    ];
    return (
        <Section id="how-it-works" tone="surface" labelledBy="how-title">
            <SectionHeading
                id="how-title"
                eyebrow="How it works"
                title={<>From Google <span className="whitespace-nowrap">sign-in</span> to your first fix</>}
                description="Nothing to install and nothing to configure. TrafficClaw finds your sites and does the sums."
            />
            <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                {steps.map((s, i) => (
                    <li key={s.title} className="flex flex-col rounded-card border border-border-subtle bg-canvas p-5 md:p-6">
                        <p className="text-body-sm font-medium text-brand-text">Step {i + 1}</p>
                        <h3 className="mt-1.5 text-title text-fg">{s.title}</h3>
                        <p className="mt-2 text-body text-fg-secondary">{s.text}</p>
                        <div className="mt-5 flex-1">{s.visual}</div>
                        <Link href={s.link.href} className="tap-area mt-4 inline-flex items-center gap-1 self-start text-body-sm font-medium text-fg-secondary hover:text-fg">
                            {s.link.label}
                            <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                        </Link>
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
            <div className="grid gap-10 grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                <SectionHeading
                    id="why-free-title"
                    eyebrow="Why free?"
                    title="Free, because most of it is cheap to run"
                    description="We would rather tell you how the money works than hide it in the small print."
                />
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 lg:grid-cols-1">
                    {points.map((p) => (
                        <div key={p.title} className="rounded-card border border-border-subtle bg-surface p-5 shadow-card">
                            <h3 className="text-title-sm text-fg">{p.title}</h3>
                            <p className="mt-1.5 text-body text-fg-secondary">{p.text}</p>
                        </div>
                    ))}
                    <Link href="/pricing" className="tap-area inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary hover:text-fg sm:col-span-3 lg:col-span-1">
                        See pricing <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </Link>
                </div>
            </div>
        </Section>
    );
}
