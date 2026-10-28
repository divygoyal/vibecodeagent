import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui';
import { McpTranscript, topClickMovers } from '@/components/connect-ai/McpTranscript';
import { SITE_URL } from '@/lib/brand';
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
    const movers = topClickMovers(portfolio.sites, ['lost']);

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

                {movers ? <McpTranscript movers={movers} caption={`Example answer from sample data · ${MCP_TOOLS} read-only tools`} /> : null}
            </div>
        </Section>
    );
}
