import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';

import { Button, MetricDelta } from '@/components/ui';
import { SITE_URL } from '@/lib/brand';
import { fmtFull } from '@/lib/format';
import type { DemoPortfolio } from '../demo/types';
import { CopyField } from '../site/CopyField';
import { Section, SectionHeading } from '../site/Section';
import { SiteIcon } from '../site/SiteIcon';

const QUESTIONS = [
    { tag: 'Search', q: 'Which of my sites lost the most clicks this month?' },
    { tag: 'Traffic', q: 'Where do my ChatGPT visitors land?' },
    { tag: 'Growth', q: 'What should I fix first on my biggest site?' },
];

const CLIENTS = ['ChatGPT', 'Claude', 'Claude Code', 'Cursor', 'VS Code'];

/**
 * "Ask ChatGPT or Claude" (PRODUCT 4): what the hosted MCP server is, the URL,
 * the safety promises, and an example answer computed from sample data.
 */
export function McpSection({ portfolio }: { portfolio: DemoPortfolio }) {
    const losers = portfolio.sites
        .filter((s) => s.search && s.search.prev && s.search.cur.clicks < s.search.prev.clicks)
        .map((s) => ({ site: s, diff: s.search!.cur.clicks - (s.search!.prev?.clicks ?? 0) }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 3);
    const top = losers[0];

    return (
        <Section id="ai" tone="surface" labelledBy="ai-title">
            <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                    <SectionHeading
                        id="ai-title"
                        eyebrow="ChatGPT & Claude"
                        title="Ask the AI you already use about your traffic"
                        description="TrafficClaw runs a hosted MCP server. Add it to ChatGPT or Claude once, approve read-only access, and ask about any of your sites in plain English. The AI runs on your own ChatGPT or Claude plan, so it costs you no Ask messages."
                    />
                    <ul className="mt-6 space-y-3 text-body-lg text-fg-secondary">
                        {[
                            'Read-only: it cannot change anything in Analytics, Search Console or TrafficClaw.',
                            'Share all your sites or only the ones you pick. Revoke access any time.',
                            'Tools cover your portfolio, Analytics reports, Search Console queries, top movers and what to fix next.',
                        ].map((t) => (
                            <li key={t} className="flex gap-3">
                                <Check aria-hidden size={18} strokeWidth={2} className="mt-1 shrink-0 text-brand-text" />
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-8 max-w-[480px]">
                        <p className="mb-1.5 text-body-sm font-medium text-fg">MCP server URL</p>
                        <CopyField value={`${SITE_URL}/mcp`} label="MCP server URL" />
                        <p className="mt-2 text-body-sm text-fg-muted">Works with {CLIENTS.join(', ')} and other MCP clients.</p>
                    </div>
                    <div className="mt-8">
                        <Button asChild variant="secondary" size="lg" trailingIcon={ArrowRight}>
                            <Link href="/ai">How to set it up</Link>
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-card border border-border-subtle bg-canvas p-5">
                        <p className="text-body-sm font-medium text-fg-secondary">Try asking</p>
                        <ul className="mt-3 space-y-2">
                            {QUESTIONS.map((item) => (
                                <li key={item.q} className="rounded-control border border-border-subtle bg-surface px-4 py-3 shadow-xs">
                                    <span className="text-caption uppercase tracking-[0.04em] text-fg-muted">{item.tag}</span>
                                    <span className="mt-0.5 block text-body-lg text-fg">“{item.q}”</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {top ? (
                        <figure className="rounded-card border border-border-subtle bg-surface p-5 shadow-card">
                            <figcaption className="mb-3 flex items-center justify-between gap-2 text-meta text-fg-muted">
                                <span className="inline-flex items-center gap-1.5">
                                    <Sparkles aria-hidden size={14} strokeWidth={1.75} />
                                    Example answer
                                </span>
                                <span>sample data</span>
                            </figcaption>
                            <p className="text-body-lg text-fg">
                                <strong className="font-semibold">{top.site.label}</strong> lost the most clicks in the last 28 days:{' '}
                                {fmtFull(top.site.search!.cur.clicks)}, down from {fmtFull(top.site.search!.prev!.clicks)}.
                                {losers.length > 1 ? ` ${losers.length - 1 === 1 ? 'One more site is' : `${losers.length - 1} more sites are`} also down.` : ''}
                            </p>
                            <ul className="mt-4 divide-y divide-border-subtle rounded-control border border-border-subtle">
                                {losers.map(({ site }) => (
                                    <li key={site.key} className="flex items-center gap-3 px-3 py-2.5">
                                        <SiteIcon host={site.host} size={16} />
                                        <span className="min-w-0 flex-1 truncate text-body text-fg">{site.label}</span>
                                        <span className="text-body tabular-nums text-fg">{fmtFull(site.search!.cur.clicks)}</span>
                                        <MetricDelta metric="clicks" current={site.search!.cur.clicks} previous={site.search!.prev?.clicks} className="w-16 justify-end" />
                                    </li>
                                ))}
                            </ul>
                        </figure>
                    ) : null}
                </div>
            </div>
        </Section>
    );
}
