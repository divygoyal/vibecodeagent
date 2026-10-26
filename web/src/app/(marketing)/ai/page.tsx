import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Eye, ListChecks, Lock, Plug, ShieldCheck, Undo2 } from 'lucide-react';
import { SetupTabs } from '@/components/connect-ai/SetupTabs';
import { TOOL_SUMMARIES } from '@/components/connect-ai/toolSummaries';
import { Badge, Button, Card } from '@/components/ui';
import { resourceUrl } from '@/lib/mcp/config';

export const metadata: Metadata = {
    title: 'Use your Google Analytics and Search Console in ChatGPT and Claude',
    description: 'Connect Google Analytics 4 and Search Console to ChatGPT, Claude, Cursor and any MCP app. Ask about every site you own. Read-only, you choose the sites, free.',
    alternates: { canonical: '/ai' },
    openGraph: {
        title: 'Use your Google Analytics and Search Console in ChatGPT and Claude',
        description: 'One connector for all your GA4 properties and Search Console sites. Read-only and free.',
        url: '/ai',
    },
};

const TRY_ASKING: { area: string; prompt: string }[] = [
    { area: 'Search', prompt: 'Which of my sites lost the most clicks this month, and why?' },
    { area: 'Traffic', prompt: 'Where do visitors from ChatGPT land on my site?' },
    { area: 'Growth', prompt: 'What should I fix first on my main site?' },
];

const FAQ: { q: string; a: string }[] = [
    { q: 'Is it really free?', a: 'Yes. The connector is free for every TrafficClaw account, with a fair-use limit of about 60 tool calls a minute. Your AI app writes the answers, so there is nothing for us to charge for.' },
    { q: 'Which apps work?', a: 'ChatGPT, Claude (web, desktop and mobile), Claude Code, Cursor, VS Code and any app that supports remote MCP servers over HTTP. Apps without OAuth can use a personal API key.' },
    { q: 'What can the AI see?', a: 'Aggregate numbers from the GA4 properties and Search Console sites you choose: sessions, users, clicks, impressions, page paths and, unless you turn them off, search queries. No emails, no visitor-level data, nothing outside Analytics and Search Console.' },
    { q: 'Can it change anything?', a: 'No. Every tool is read-only, and TrafficClaw only asks Google for read-only access.' },
    { q: 'How do I disconnect?', a: 'Open Connect AI in your TrafficClaw dashboard and press Revoke next to the app. It loses access within seconds.' },
];

function AnswerPreview() {
    const rows = [
        { site: 'shop.example', clicks: 4410, delta: -28.5 },
        { site: 'blog.example', clicks: 1290, delta: 0.4 },
        { site: 'example.com', clicks: 9120, delta: 9.8 },
    ];
    const max = Math.max(...rows.map((r) => Math.abs(r.delta)));
    return (
        <Card padding="none" className="overflow-hidden">
            <div className="border-b border-border-subtle bg-surface-sunken px-4 py-2.5 text-meta text-fg-muted">Example answer · demo numbers</div>
            <div className="space-y-4 p-4 sm:p-5">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-subtle px-3.5 py-2 text-body text-fg">Which of my sites lost the most clicks this month, and why?</div>
                <div className="space-y-3 text-body text-fg">
                    <p className="flex items-center gap-2 text-meta text-fg-muted"><Plug aria-hidden size={14} strokeWidth={1.75} />Used TrafficClaw: portfolio_summary, top_movers</p>
                    <p><span className="font-medium">shop.example</span> lost the most: clicks fell 28.5% to 4,410. Two category pages account for most of the drop after slipping from position 4 to 9.</p>
                    <div className="rounded-control border border-border-subtle p-3" role="img" aria-label="Change in clicks by site: shop.example minus 28.5 percent, blog.example plus 0.4 percent, example.com plus 9.8 percent">
                        <div className="mb-2 text-meta text-fg-muted">Clicks vs previous 28 days</div>
                        <div className="space-y-2">
                            {rows.map((r) => (
                                <div key={r.site} className="grid grid-cols-[96px_1fr_56px] items-center gap-2 text-meta">
                                    <span className="truncate text-fg-secondary">{r.site}</span>
                                    <span className="relative h-2 rounded-full bg-subtle">
                                        <span className={r.delta < 0 ? 'absolute inset-y-0 rounded-full bg-down' : 'absolute inset-y-0 rounded-full bg-m-clicks'} style={{ left: 0, width: `${(Math.abs(r.delta) / max) * 100}%` }} />
                                    </span>
                                    <span className={r.delta < 0 ? 'text-right text-down tabular-nums' : 'text-right text-up tabular-nums'}>{r.delta > 0 ? '+' : ''}{r.delta}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <p>Fix first: refresh the two category pages and check their titles. Want the list of queries that moved?</p>
                </div>
            </div>
        </Card>
    );
}

export default function AiConnectorPage() {
    const url = resourceUrl();
    return (
        <div className="tc-root bg-canvas pb-20 pt-8 text-fg md:pt-12">
            <section className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="min-w-0">
                    <Badge variant="brand">MCP connector</Badge>
                    <h1 className="mt-4 text-display-sm text-fg md:text-display">Use your Google Analytics and Search Console in ChatGPT and Claude</h1>
                    <p className="mt-4 max-w-[600px] text-lead text-fg-secondary">Connect Google once, then ask the AI you already use about every site you own. Read-only, you pick the sites, and it&apos;s free.</p>
                    <div className="mt-7 flex flex-wrap gap-3">
                        <Button asChild variant="primary" size="xl"><Link href="/dashboard/connect-ai">Connect your sites<ArrowRight aria-hidden size={18} strokeWidth={1.75} /></Link></Button>
                        <Button asChild variant="secondary" size="xl"><a href="#tools">See the tools</a></Button>
                    </div>
                    <p className="mt-5 text-body text-fg-muted">Works with ChatGPT, Claude, Claude Code, Cursor, VS Code and other MCP apps.</p>
                </div>
                <Card padding="lg" className="min-w-0">
                    <h2 className="text-title-sm text-fg">Try asking</h2>
                    <ul className="mt-4 space-y-4">
                        {TRY_ASKING.map((t) => (
                            <li key={t.area}>
                                <div className="text-caption uppercase tracking-[0.04em] text-fg-muted">{t.area}</div>
                                <p className="mt-1 text-body-lg text-fg">&ldquo;{t.prompt}&rdquo;</p>
                            </li>
                        ))}
                    </ul>
                </Card>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-4 md:px-6" aria-labelledby="how">
                <h2 id="how" className="text-display-sm text-fg">How it works</h2>
                <ol className="mt-6 grid gap-4 md:grid-cols-3">
                    {[
                        ['Copy the server URL', 'One URL for every app. It works for all your sites.'],
                        ['Add it to your AI app', 'Paste it as a custom connector or MCP server.'],
                        ['Approve and pick sites', 'Sign in with Google and choose what the app may read.'],
                    ].map(([title, body], i) => (
                        <li key={title}>
                            <Card padding="lg" className="h-full">
                                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-body-sm font-semibold text-brand-soft-fg tabular-nums">{i + 1}</span>
                                <h3 className="mt-3 text-title text-fg">{title}</h3>
                                <p className="mt-1 text-body-lg text-fg-secondary">{body}</p>
                            </Card>
                        </li>
                    ))}
                </ol>
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <Card padding="lg" className="min-w-0">
                        <h3 className="text-title text-fg">Set it up</h3>
                        <p className="mt-1 mb-4 text-body text-fg-muted">Server URL: <span className="font-mono text-fg">{url}</span></p>
                        <SetupTabs url={url} />
                    </Card>
                    <AnswerPreview />
                </div>
            </section>

            <section id="tools" className="mx-auto mt-20 max-w-[1200px] scroll-mt-24 px-4 md:px-6" aria-labelledby="tools-title">
                <h2 id="tools-title" className="text-display-sm text-fg">13 read-only tools</h2>
                <p className="mt-2 max-w-[720px] text-lead text-fg-secondary">High-level answers first (portfolio, what to fix, what changed), with raw GA4 and Search Console reports when your AI needs them.</p>
                <Card padding="none" className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left">
                        <thead className="bg-surface-sunken text-meta text-fg-muted">
                            <tr><th className="px-4 py-2.5 font-medium">Tool</th><th className="px-4 py-2.5 font-medium">What it does</th><th className="px-4 py-2.5 font-medium">Example question</th></tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle text-body">
                            {TOOL_SUMMARIES.map((t) => (
                                <tr key={t.name}>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-fg">{t.name}</td>
                                    <td className="px-4 py-3 text-fg-secondary">{t.summary}</td>
                                    <td className="px-4 py-3 text-fg">&ldquo;{t.example}&rdquo;</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-4 md:px-6" aria-labelledby="privacy">
                <h2 id="privacy" className="text-display-sm text-fg">Your data, your call</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {[
                        { Icon: Eye, title: 'Read-only', body: 'No tool can change anything in Analytics, Search Console or TrafficClaw.' },
                        { Icon: ListChecks, title: 'You choose the sites', body: 'Share all sites or a few, and hide search queries per app if you prefer.' },
                        { Icon: Undo2, title: 'Revoke any time', body: 'Disconnect an app from your dashboard; it loses access within seconds.' },
                    ].map(({ Icon, title, body }) => (
                        <Card key={title} padding="lg">
                            <span className="flex size-10 items-center justify-center rounded-control bg-subtle text-fg"><Icon aria-hidden size={20} strokeWidth={1.75} /></span>
                            <h3 className="mt-3 text-title text-fg">{title}</h3>
                            <p className="mt-1 text-body-lg text-fg-secondary">{body}</p>
                        </Card>
                    ))}
                </div>
                <p className="mt-4 flex items-start gap-2 text-body text-fg-muted"><Lock aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />Google tokens stay on TrafficClaw&apos;s servers; AI apps get their own revocable access. Tool calls are logged without their contents for 30 days.</p>
            </section>

            <section className="mx-auto mt-20 max-w-[720px] px-4 md:px-6" aria-labelledby="faq">
                <h2 id="faq" className="text-display-sm text-fg">Questions</h2>
                <div className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
                    {FAQ.map((f) => (
                        <details key={f.q} className="group py-4">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-lg font-medium text-fg [&::-webkit-details-marker]:hidden">
                                {f.q}
                                <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-45">+</span>
                            </summary>
                            <p className="mt-2 text-body-lg text-fg-secondary">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-4 md:px-6">
                <Card padding="lg" className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-title text-fg"><ShieldCheck aria-hidden size={20} strokeWidth={1.75} className="text-brand-text" />Ask your AI about your traffic today</h2>
                        <p className="mt-1 text-body-lg text-fg-secondary">Connect Google, copy the URL, approve. About two minutes.</p>
                    </div>
                    <Button asChild variant="primary" size="xl"><Link href="/dashboard/connect-ai">Connect your sites<ArrowRight aria-hidden size={18} strokeWidth={1.75} /></Link></Button>
                </Card>
            </section>
        </div>
    );
}
