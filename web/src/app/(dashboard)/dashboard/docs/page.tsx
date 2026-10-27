'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
    BarChart3, LayoutDashboard, LayoutGrid, LifeBuoy, Plug, Rocket, Sparkles, Trophy, Gauge,
    type LucideIcon,
} from 'lucide-react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Kbd } from '@/components/ui/Kbd';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Docs (DESIGN 4.1): one page, one section per part of the app, with a short
 * "on this page" list. Static content (a client file only because the buttons
 * take icon components as props).
 */

interface Section {
    id: string;
    label: string;
    icon: LucideIcon;
}

const SECTIONS: Section[] = [
    { id: 'getting-started', label: 'Getting started', icon: Rocket },
    { id: 'portfolio', label: 'Portfolio', icon: LayoutGrid },
    { id: 'site-pages', label: 'Site pages', icon: Gauge },
    { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'connect-ai', label: 'Connect AI', icon: Plug },
    { id: 'ask', label: 'Ask', icon: Sparkles },
    { id: 'help', label: 'Help', icon: LifeBuoy },
];

export default function DocsPage() {
    return (
        <div className="max-w-[1040px]">
            <PageHeader title="Docs" subtitle={`How ${BRAND_NAME} works, one part at a time`} />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
                <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
                    <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
                        {SECTIONS.map((s) => {
                            const Icon = s.icon;
                            return (
                                <li key={s.id} className="shrink-0">
                                    <a
                                        href={`#${s.id}`}
                                        className="flex h-8 items-center gap-2 rounded-control px-2.5 text-body-sm font-medium text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg"
                                    >
                                        <Icon aria-hidden size={14} strokeWidth={1.75} />
                                        {s.label}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="flex min-w-0 max-w-[720px] flex-col gap-10">
                    <DocSection id="getting-started" title="Getting started" lead={`${BRAND_NAME} puts every site you own on one screen. It is free; only Ask messages are paid.`}>
                        <Steps
                            items={[
                                ['Sign in with Google', 'We ask for read-only access to Search Console and Google Analytics. We can never change anything in your Google accounts.'],
                                ['Review your sites', 'Setup lists every Search Console site and Analytics property you can open, and how they pair up. You do not have to pick one.'],
                                ['Open your portfolio', 'One card per site with clicks, impressions, visitors and trends. Click a card to go deeper.'],
                                ['Ask, build, share', 'Ask questions in plain English, build a dashboard, join the leaderboard or connect ChatGPT and Claude.'],
                            ]}
                        />
                        <Callout title="What is free">
                            Portfolio, every site page, dashboards, the leaderboard and Connect AI have no limit on sites. You get 5 Ask messages to start; paid plans only add more Ask messages (see <Link className="underline underline-offset-2" href="/dashboard/plan">Plan</Link>).
                        </Callout>
                    </DocSection>

                    <DocSection id="portfolio" title="Portfolio" lead="The home page: how are all my sites doing?">
                        <List
                            items={[
                                'One card per site: Search Console clicks, impressions and average position, plus Analytics users and sessions, each with its change against the previous period.',
                                'Pick the range at the top: 7 days, 28 days, 3 months or 12 months, always compared with the period before.',
                                'Search, sort (most clicks, biggest growth, biggest drop, A to Z), filter (all, Search Console, Analytics, starred) and switch between cards and a table. The table exports to CSV.',
                                'A red or amber chip appears when clicks or users fall by more than 30%, or when a site has had no traffic for two days or more. The Alerts panel lists them.',
                                'A site shows its Analytics property when the property\'s web address matches the Search Console site. You can change a pairing from the site\'s menu.',
                            ]}
                        />
                        <Callout title="Fresh data">
                            Search Console data is about two days behind, like in Google. Sites sync when you open the page if the last sync is older than six hours, and a first sync reads up to 16 months of history.
                        </Callout>
                    </DocSection>

                    <DocSection id="site-pages" title="Site pages" lead="Everything about one site, under the site switcher.">
                        <List
                            items={[
                                'Overview: Search Console and Analytics side by side for the site.',
                                'Traffic: Analytics reports (sources, audience, events, funnels, retention, journeys, realtime).',
                                'Search: queries, pages, countries, devices and the opportunities hiding in them.',
                                'Pages: Analytics and Search Console numbers for each page, merged.',
                                'Actions: what to fix next, ranked, each with the evidence and a suggested fix.',
                            ]}
                        />
                        <p className="text-body text-fg-secondary">
                            Switch site from the top of the sidebar, or press <Kbd>g</Kbd> then <Kbd>s</Kbd>. The date range and the comparison live in the address bar, so a link to a page keeps its range. Press <Kbd>⌘K</Kbd> to search the whole app.
                        </p>
                    </DocSection>

                    <DocSection id="dashboards" title="Dashboards" lead="Build your own reports from widgets, then share them.">
                        <List
                            items={[
                                'Start from a template or an empty page. Each widget chooses its own data source: any of your Analytics properties or Search Console sites, or all of them together.',
                                'Widgets include scorecards with comparison, time series, stacked bars, maps, tables with heat bars, donuts, text, images and section headers.',
                                'A date range and a comparison control the whole dashboard. Switch between edit and view, undo and redo, and use it on a phone.',
                                'Share a read-only public link, embed it in another page, or protect it with a password. You can also duplicate a dashboard as a template.',
                            ]}
                        />
                    </DocSection>

                    <DocSection id="leaderboard" title="Leaderboard" lead="Show off verified traffic, if you want to.">
                        <List
                            items={[
                                'Join from the Leaderboard page: pick a site from your portfolio, choose a category and a short description, set your privacy and publish.',
                                'A listing is Verified when you are an owner or full user of the site in Search Console. Connected Analytics is a second signal. Unverified listings do not rank.',
                                'You decide what is public for each number: exact, a range such as 10K to 50K, or hidden. Pages, queries and countries stay hidden until you turn them on. You can pause or delete your listing any time.',
                                'Turn on "open to offers" to receive sponsorship, partnership or acquisition requests. A live badge you can embed is available for every listing.',
                            ]}
                        />
                    </DocSection>

                    <DocSection id="connect-ai" title="Connect AI" lead="Ask ChatGPT or Claude about your traffic, for free.">
                        <p className="text-body text-fg-secondary">
                            {BRAND_NAME} runs a read-only connector at <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[0.9em] text-fg">https://trafficclaw.com/mcp</code>.
                            Add it to ChatGPT, Claude.ai, Claude Desktop, Claude Code, Cursor or VS Code and ask about your portfolio, Analytics reports, Search Console queries, period comparisons and what to fix next.
                        </p>
                        <List
                            items={[
                                'Sign in with your TrafficClaw account when the app asks. You approve access once and can revoke it at any time.',
                                'Connected apps, when they were last used and personal API keys are listed on the Connect AI page.',
                                'The connector is read only, free, and rate limited per account. It does not use your Ask messages.',
                            ]}
                        />
                        <div><Button asChild variant="secondary" size="sm"><Link href="/dashboard/connect-ai">Open Connect AI</Link></Button></div>
                    </DocSection>

                    <DocSection id="ask" title="Ask" lead="An analyst that reads your data and shows its work.">
                        <List
                            items={[
                                'Ask uses live Analytics and Search Console data for the site named in the chip next to the box. Change the chip to ask about another site.',
                                'It runs reports, compares periods, finds cannibalization, audits pages and suggests internal links, then answers with numbers, charts and tables you can check.',
                                'Past conversations are in History. Charts can be downloaded as CSV.',
                                'One question is one message. You start with 5; paid plans add more every month. Questions through Connect AI do not count.',
                            ]}
                        />
                        <Card padding="sm">
                            <p className="text-body-sm font-medium text-fg">Questions to try</p>
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {[
                                    'Why did my traffic change in the last 28 days?',
                                    'Which keywords are on page 2 that I can push to page 1?',
                                    'Which pages get lots of impressions but few clicks?',
                                    'What is the one thing I should do today to grow?',
                                    'Give me 5 blog post ideas based on my data.',
                                ].map((q) => (
                                    <li key={q}>
                                        <Link
                                            href={`/dashboard/ask?q=${encodeURIComponent(q)}&prefill=1`}
                                            className="block rounded-control bg-surface-sunken px-3 py-2 text-body-sm text-fg-secondary transition-colors duration-120 hover:bg-subtle hover:text-fg"
                                        >
                                            {q}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </DocSection>

                    <DocSection id="help" title="Help" lead="Common questions.">
                        <Faq
                            items={[
                                ['A site is missing', 'Only sites your Google account can open show up. Add the site to Search Console or Analytics with that account, then press Reconnect in Settings, Google.'],
                                ['My numbers differ from Google', 'Search Console is about two days behind and rounds some queries. Analytics may sample large date ranges. Compare the same dates and the same property.'],
                                ['I changed Google accounts', 'Open Settings, Google and press Reconnect. Sign in with the account that owns your sites.'],
                                ['How do I delete my account?', 'Settings, Danger zone. On request we remove your account and all the data stored with it.'],
                            ]}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="secondary" size="sm" icon={LifeBuoy}><Link href="/dashboard/support">Contact support</Link></Button>
                            <Button asChild variant="ghost" size="sm" icon={BarChart3}><Link href="/dashboard">Back to portfolio</Link></Button>
                        </div>
                    </DocSection>
                </div>
            </div>
        </div>
    );
}

function DocSection({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4">
            <div>
                <h2 id={`${id}-title`} className="text-heading text-fg">{title}</h2>
                <p className="mt-1 text-body-lg text-fg-muted">{lead}</p>
            </div>
            {children}
        </section>
    );
}

function Steps({ items }: { items: [string, string][] }) {
    return (
        <ol className="flex flex-col gap-3">
            {items.map(([title, body], i) => (
                <li key={title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-meta font-medium text-fg-secondary tabular-nums">{i + 1}</span>
                    <div className="min-w-0">
                        <p className="text-body font-medium text-fg">{title}</p>
                        <p className="mt-0.5 text-body text-fg-muted">{body}</p>
                    </div>
                </li>
            ))}
        </ol>
    );
}

function List({ items }: { items: string[] }) {
    return (
        <ul className="flex flex-col gap-2.5">
            {items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-body-lg text-fg-secondary">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fg-faint" />
                    <span className="min-w-0">{item}</span>
                </li>
            ))}
        </ul>
    );
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-card border border-border-subtle bg-surface-sunken p-4">
            <p className="text-body font-medium text-fg">{title}</p>
            <p className="mt-1 text-body text-fg-muted">{children}</p>
        </div>
    );
}

function Faq({ items }: { items: [string, string][] }) {
    return (
        <div className="flex flex-col gap-2">
            {items.map(([q, a]) => (
                <details key={q} className="group rounded-control border border-border-subtle bg-surface open:bg-surface-sunken">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 text-body font-medium text-fg [&::-webkit-details-marker]:hidden">
                        <span>{q}</span>
                        <span aria-hidden className="shrink-0 text-title-sm leading-none text-fg-muted transition-transform duration-120 group-open:rotate-45">+</span>
                    </summary>
                    <p className="px-4 pb-3.5 text-body text-fg-muted">{a}</p>
                </details>
            ))}
        </div>
    );
}
