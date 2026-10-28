import Link from 'next/link';
import { ArrowRight, Wrench } from 'lucide-react';

import { Button, Favicon, MetricDelta } from '@/components/ui';
import { SITE_URL } from '@/lib/brand';
import { fmtCompact, fmtFull } from '@/lib/format';
import type { PortfolioResponse } from '@/lib/portfolio/types';
import { CopyField } from '../site/CopyField';
import { Section, SectionHeading } from '../site/Section';
import { ChatGptMark, ClaudeMark } from './BrandMarks';
import { LogoChip } from './Hero';

const MCP_TOOLS = 13;

/**
 * "Ask ChatGPT or Claude": the connector URL to copy, the clients, and a sample conversation whose answer
 * is computed from the demo portfolio (the same numbers the hero shows), with the real MCP tool name.
 */
export function McpSection({ portfolio, askHref }: { portfolio: PortfolioResponse; askHref: string }) {
    const losers = portfolio.sites
        .filter((s) => s.search && s.search.prev && s.search.cur.clicks < s.search.prev.clicks && s.search.prev.clicks >= 100)
        .map((s) => ({ site: s, diff: s.search!.cur.clicks - s.search!.prev!.clicks }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 3);
    const top = losers[0];

    return (
        <Section id="ai" tone="surface" labelledBy="ai-title">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                <div>
                    <SectionHeading
                        id="ai-title"
                        eyebrow="ChatGPT & Claude"
                        title="Ask your AI about your traffic"
                        description="Paste one URL into ChatGPT or Claude. Read-only, free, and it runs on your own AI plan."
                    />
                    <div className="mt-6 max-w-[460px]">
                        <CopyField value={`${SITE_URL}/mcp`} label="MCP server URL" />
                        <ul aria-label="Works with" className="mt-4 flex flex-wrap gap-2">
                            <LogoChip mark={<ChatGptMark size={16} className="text-fg" />} label="ChatGPT" />
                            <LogoChip mark={<ClaudeMark size={16} />} label="Claude" />
                            <LogoChip mark={<span aria-hidden className="font-mono text-caption text-fg-muted">{'>_'}</span>} label="Claude Code, Cursor, VS Code" />
                        </ul>
                    </div>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        {/* No Google button here: the tour's call to action sits right above (one per ~2 phone screens). */}
                        <Button asChild variant="secondary" size="xl" trailingIcon={<ArrowRight aria-hidden size={18} strokeWidth={1.75} />}>
                            <Link href="/ai">Set it up in ChatGPT or Claude</Link>
                        </Button>
                    </div>
                    <p className="mt-5 text-body-sm text-fg-secondary">
                        No AI account? <Link href={askHref} className="font-medium text-brand-text underline-offset-4 hover:underline">Ask works inside TrafficClaw too</Link>.
                    </p>
                </div>

                {top ? (
                    <figure className="min-w-0">
                        <div className="overflow-hidden rounded-panel border border-border-subtle bg-canvas shadow-card">
                            <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-4 py-2.5">
                                <ClaudeMark size={16} />
                                <span className="text-body-sm font-medium text-fg">Claude</span>
                                <span className="text-meta text-fg-muted">with TrafficClaw connected</span>
                            </div>
                            <div className="space-y-4 p-4 md:p-6">
                                <p className="ml-auto max-w-[85%] rounded-[18px] rounded-br-md bg-subtle px-4 py-2.5 text-body text-fg">
                                    Which of my sites lost the most Google clicks this month?
                                </p>
                                <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-meta text-fg-muted">
                                    <Wrench aria-hidden size={12} strokeWidth={1.75} />
                                    Used <code className="font-mono text-fg-secondary">top_movers</code>
                                </p>
                                <div className="text-body text-fg">
                                    <p>
                                        <strong className="font-semibold">{top.site.label}</strong> lost the most: {fmtFull(top.site.search!.cur.clicks)} clicks,
                                        down from {fmtFull(top.site.search!.prev!.clicks)}.
                                        {losers.length > 1 ? ` ${losers.length - 1} more ${losers.length - 1 === 1 ? 'site is' : 'sites are'} down too:` : ''}
                                    </p>
                                    <ul className="mt-3 divide-y divide-border-subtle rounded-control border border-border-subtle bg-surface">
                                        {losers.map(({ site }) => (
                                            <li key={site.key} className="flex items-center gap-3 px-3 py-2.5">
                                                <Favicon host={site.host} size={16} />
                                                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{site.label}</span>
                                                <span className="text-body-sm tabular-nums text-fg"><span className="sm:hidden">{fmtCompact(site.search!.cur.clicks)}</span><span className="max-sm:hidden">{fmtFull(site.search!.cur.clicks)}</span></span>
                                                <MetricDelta metric="clicks" current={site.search!.cur.clicks} previous={site.search!.prev?.clicks} className="w-14 justify-end sm:w-16" />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <figcaption className="mt-3 text-meta text-fg-secondary">
                            Example answer from sample data · {MCP_TOOLS} read-only tools
                        </figcaption>
                    </figure>
                ) : null}
            </div>
        </Section>
    );
}
