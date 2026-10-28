import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Search, Sparkles } from 'lucide-react';

import { Breadcrumbs, breadcrumbLd, HeroActions, JsonLd } from '@/components/marketing/alternatives/AlternativePage';
import { ProductShot } from '@/components/marketing/alternatives/ProductShot';
import { SetupTabs } from '@/components/connect-ai/SetupTabs';
import { PROMPT_GROUPS } from '@/components/connect-ai/setupClients';
import { ConnectGoogleButton } from '@/components/marketing/site/ConnectGoogleButton';
import { CopyField } from '@/components/marketing/site/CopyField';
import { Faq } from '@/components/marketing/site/Faq';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { Section, SectionHeading } from '@/components/marketing/site/Section';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';

const PATH = '/guides/connect-search-console-to-claude';
const TITLE = 'Connect Google Search Console and GA4 to Claude and ChatGPT';
const DESCRIPTION = 'Step by step: connect Google Search Console and Google Analytics 4 to Claude or ChatGPT with one free, read-only MCP connector. Server URL, setup for each app, and example questions to ask.';
const MCP_URL = `${SITE_URL}/mcp`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: PATH, type: 'article' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

const STEPS: Array<{ title: string; body: string; ld?: string }> = [
    { title: 'Connect Google to TrafficClaw', body: 'Sign in with Google. TrafficClaw asks for read-only access to Analytics and Search Console, nothing else. Every site your Google account can see is listed.' },
    { title: 'Copy the server URL', body: 'One URL works for every site and every app. It is in the box below, with a copy button.', ld: `Copy the server URL ${MCP_URL}. One URL works for every site and every app.` },
    { title: 'Add it to Claude or ChatGPT', body: 'Paste it as a custom connector (Claude) or custom MCP server (ChatGPT). Pick OAuth.' },
    { title: 'Approve and choose sites', body: 'Sign in with Google in the window that opens, pick which sites the app may read, and click Allow.' },
    { title: 'Ask a question', body: 'Start a chat, make sure the TrafficClaw connector is on, and ask about your traffic.' },
];

const FAQ = [
    { q: 'Do I need both Search Console and Google Analytics 4?', a: 'No. The connector reads whichever of the two your Google account can see for each site. Most people connect both so the AI can follow a query from Search Console through to sessions in GA4.' },
    { q: 'Is it free?', a: 'Yes. The TrafficClaw connector is free, with a fair-use limit of about 60 tool calls a minute. Your AI app writes the answers, on your own Claude or ChatGPT plan.' },
    { q: 'Can the AI change anything in Google?', a: 'No. TrafficClaw only asks Google for read-only access, and every tool is read-only.' },
    { q: 'Why can I not find "custom connector" in my app?', a: 'Custom connectors depend on your plan and settings. In ChatGPT, custom MCP servers may need developer mode, or an admin in Business and Enterprise workspaces. In Claude Team and Enterprise, an Owner adds the connector under Organization settings, then each member connects their own Google account.' },
    { q: 'Which apps does the same URL work with?', a: 'ChatGPT, Claude on the web, desktop and mobile, Claude Code, Cursor, VS Code and any app that supports remote MCP servers over HTTP.' },
    { q: 'How do I disconnect?', a: 'Open Connect AI in your TrafficClaw dashboard and press Revoke next to the app. It loses access within seconds.' },
];

const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}${PATH}`,
    totalTime: 'PT3M',
    step: STEPS.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.ld ?? s.body })),
};

const GROUP_ICONS = { Traffic: BarChart3, Search: Search, 'Weekly digest': Sparkles } as const;

export default function ConnectSearchConsoleToClaudePage() {
    return (
        <>
            <JsonLd data={howToLd} />
            <JsonLd data={breadcrumbLd([{ label: 'Connect Search Console to Claude', path: PATH }])} />

            <section aria-labelledby="guide-title" className="bg-canvas">
                <div className="mx-auto max-w-[1200px] px-4 pt-10 pb-12 md:px-6 md:pt-14 md:pb-16">
                    <Breadcrumbs trail={[{ label: 'Guides' }, { label: 'Connect Search Console to Claude' }]} />
                    <div className="mt-8 max-w-[760px]">
                        <SectionHeading
                            as="h1"
                            id="guide-title"
                            eyebrow="Guide · about 3 minutes"
                            title="Connect Google Search Console and GA4 to Claude"
                            description="One free, read-only connector gives Claude or ChatGPT your Search Console and Analytics numbers for every site you own. Here is how to set it up, then what to ask."
                        />
                        <HeroActions callbackUrl="/dashboard/connect-ai" />
                    </div>
                </div>
            </section>

            <Section tone="surface" labelledBy="steps-title">
                <SectionHeading id="steps-title" eyebrow="The short version" title="Five steps" />
                <ol className="mt-8 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
                    {STEPS.map((s, i) => (
                        <li key={s.title} className="rounded-card border border-border-subtle bg-canvas p-5">
                            <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-body-sm font-semibold text-brand-soft-fg tabular-nums">{i + 1}</span>
                            <h3 className="mt-3 text-title-sm text-fg">{s.title}</h3>
                            <p className="mt-1 break-words text-body text-fg-secondary">{s.body}</p>
                        </li>
                    ))}
                </ol>
            </Section>

            <Section labelledBy="setup-title">
                <SectionHeading id="setup-title" eyebrow="Steps 2 and 3" title="Add the server to your app" description="Same URL everywhere. Pick your app for the exact clicks." />
                <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-[1fr_1.2fr]">
                    <div className="min-w-0 rounded-card border border-border-subtle bg-surface p-6 shadow-card">
                        <h3 className="text-title text-fg">Sign in, then copy the URL</h3>
                        <p className="mt-1 mb-4 text-body text-fg-secondary">An account is how you choose which sites an app may read.</p>
                        <ConnectGoogleButton size="lg" mark callbackUrl="/dashboard/connect-ai" />
                        <p className="mt-6 mb-2 text-body-sm font-medium text-fg">Server URL (MCP, Streamable HTTP)</p>
                        <CopyField value={MCP_URL} label="server URL" />
                        <p className="mt-3 text-meta text-fg-muted">It is an address for apps, not a web page. Paste it into your AI app.</p>
                    </div>
                    <div className="min-w-0 rounded-card border border-border-subtle bg-surface p-6 shadow-card">
                        <h3 className="mb-4 text-title text-fg">Add it to your app</h3>
                        <SetupTabs url={MCP_URL} urlShown />
                    </div>
                </div>
            </Section>

            <Section tone="surface" labelledBy="ask-title">
                <SectionHeading id="ask-title" eyebrow="Step 5" title="What to ask" description="Ask in plain words. The AI picks the right tool from the 13 read-only ones." />
                <div className="mt-8 grid gap-4 grid-cols-1 md:grid-cols-3">
                    {PROMPT_GROUPS.map((g) => {
                        const Icon = GROUP_ICONS[g.job as keyof typeof GROUP_ICONS] ?? Sparkles;
                        return (
                            <div key={g.job} className="rounded-card border border-border-subtle bg-canvas p-6">
                                <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg"><Icon aria-hidden size={20} strokeWidth={1.75} /></span>
                                <h3 className="mt-3 text-title text-fg">{g.job}</h3>
                                <p className="text-body-sm text-fg-muted">{g.hint}</p>
                                <ul className="mt-4 space-y-3">
                                    {g.prompts.map((p) => (
                                        <li key={p} className="rounded-control bg-surface px-3 py-2.5 text-body text-fg ring-1 ring-border-subtle">&ldquo;{p}&rdquo;</li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
                <p className="mt-6 text-body text-fg-secondary">
                    See all 13 tools and what each one does on <Link href="/ai#tools" className="text-brand-text underline underline-offset-4 hover:text-fg">Connect AI</Link>.
                </p>
            </Section>

            <Section labelledBy="see-title">
                <SectionHeading id="see-title" eyebrow="Prefer to look first?" title="The same numbers on screen" description="TrafficClaw also shows them as pages and dashboards. Open the live demo, no sign-in." />
                <div className="mt-8">
                    <ProductShot name="site" alt="A TrafficClaw site page with Search Console clicks and impressions next to Analytics sessions (demo data)." caption="What the connector reads, shown in the app. Demo data." />
                </div>
            </Section>

            <Section tone="surface" labelledBy="faq-title" innerClassName="max-w-[760px]">
                <SectionHeading id="faq-title" title="Questions" />
                <Faq items={FAQ} className="mt-8" />
                <p className="mt-6 text-body-sm text-fg-muted">
                    Compare tools: <Link href="/alternatives" className="underline underline-offset-4 hover:text-fg">TrafficClaw alternatives</Link>. Google Analytics and Search Console are trademarks of Google LLC; Claude and ChatGPT belong to their owners. {BRAND_NAME} is not affiliated with them.
                </p>
            </Section>

            <FinalCta title="Ask Claude about your traffic today." secondary={{ href: '/demo', label: 'Try the live demo' }} className="" />
        </>
    );
}
