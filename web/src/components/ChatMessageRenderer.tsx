'use client';

import { memo, useState, useMemo, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Copy, Check, ExternalLink, ChevronDown, ChevronRight,
    CheckCircle2, Loader2, ArrowRight
} from 'lucide-react';
import type { Components } from 'react-markdown';
import { SmartChartPanel, type StructuredToolResult } from './chat/ChatCharts';
import { splitContentOnChartTags, renderSnapshotChart } from './chat/SnapshotChartRenderer';
import type { DashboardSnapshot } from './chat/SnapshotChartRenderer';
import { ThinkingBlock } from './chat/ThinkingBlock';
import { PlanCard, type ChatPlan } from './chat/PlanCard';
import { MessageFeedback } from './chat/MessageFeedback';
import { preprocessMarkers } from './chat/InlineMarkers';
import { CriticBadge, type CriticVerdict } from './chat/CriticBadge';
import { highlightNumbersInChildren } from './chat/HighlightedNumbers';
import { AnswerLink, AnswerTable, AnswerTd, AnswerTh } from './chat/AnswerParts';
import { useCurrentSite } from './shell/useCurrentSite';
import { linkAnswer, type AnswerSite } from '@/lib/chat/answerFormat';
import type { SiteEntry } from '@/lib/sites/siteDirectory';
import { safeParseToolResult } from '@/lib/chatUtils';

/* ─── Code Block ─── */
function CodeBlock({ children, className }: { children: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const language = className?.replace('language-', '') || '';

    const handleCopy = () => {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-4 overflow-hidden rounded-card border border-border-subtle bg-surface-sunken">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
                <span className="font-mono text-meta text-fg-muted">{language || 'code'}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 rounded text-meta text-fg-muted transition-colors hover:text-fg">
                    {copied ? <><Check aria-hidden className="size-3.5 text-up" /> Copied</> : <><Copy aria-hidden className="size-3.5" /> Copy</>}
                </button>
            </div>
            <pre className="overflow-x-auto p-4 text-body-sm leading-relaxed">
                <code className="font-mono text-fg-secondary">{children}</code>
            </pre>
        </div>
    );
}

/* ─── Tool Call Card ─── */
export interface ToolCall {
    name: string;
    args?: unknown;
    /** A string from the stream, or a parsed object from a saved thread. */
    result?: string | Record<string, unknown>;
    structuredData?: { dimensions: string[]; rows: Record<string, unknown>[]; totals?: unknown };
    /** A6: streamed seconds-elapsed heartbeat from server for slow tools */
    elapsedSec?: number;
}

const TOOL_NAMES: Record<string, string> = {
    get_search_performance: 'Search Performance',
    run_ga4_report: 'GA4 Report',
    run_page_audit: 'PageSpeed Audit',
    run_site_audit: 'Site Audit (50+ checks)',
    inspect_url: 'GSC URL Inspection',
    cross_source_diagnose: 'Cross-Source Diagnosis',
    get_alerts: 'Alert Triage',
    run_funnel_analysis: 'Funnel Analysis',
    run_journey_analysis: 'Journey Analysis',
    run_cohort_retention: 'Cohort Retention',
    analyze_pr_seo_diff: 'PR SEO Diff',
    compute_site_health_score: 'Site Health Score',
    write_dashboard_annotation: 'Saved Annotation',
    calculate_revenue_impact: 'Revenue Impact',
    generate_content_strategy: 'Content Strategy',
    analyze_keyword_clusters: 'Keyword Clusters',
    compare_time_periods: 'Period Comparison',
    find_cannibalization: 'Cannibalization Check',
    suggest_internal_links: 'Internal Links',
    generate_meta_tags: 'Meta Tags',
    run_realtime_report: 'Realtime Report',
    get_custom_dimensions: 'Custom Dimensions',
};

/** Pretty-print a tool result when it is JSON; otherwise show it as it came. */
function prettyResult(result: ToolCall['result']): string {
    if (!result) return '';
    if (typeof result !== 'string') {
        try { return JSON.stringify(result, null, 2); } catch { return String(result); }
    }
    const trimmed = result.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /* not JSON */ }
    }
    return result;
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const isDone = !!tool.result;

    const displayContent = useMemo(() => prettyResult(tool.result), [tool.result]);

    const handleCopy = (e: MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(displayContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="rounded-control border border-border-subtle bg-surface-sunken text-body-sm">
            <button
                type="button"
                onClick={() => isDone && setExpanded(!expanded)}
                aria-expanded={isDone ? expanded : undefined}
                disabled={!isDone}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${isDone ? 'cursor-pointer text-fg-secondary hover:text-fg' : 'cursor-default text-fg-muted'} transition-colors`}
            >
                {isDone
                    ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-up" strokeWidth={1.75} />
                    : <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-fg-muted" strokeWidth={1.75} />}
                <span className="min-w-0 flex-1 truncate">{TOOL_NAMES[tool.name] || tool.name}</span>
                {/* A6: live elapsed-seconds while the tool is in flight */}
                {!isDone && typeof tool.elapsedSec === 'number' && tool.elapsedSec > 0 && (
                    <span className="text-meta text-fg-muted tabular-nums">{tool.elapsedSec}s</span>
                )}
                {isDone && (expanded
                    ? <ChevronDown aria-hidden className="size-3.5 text-fg-muted" />
                    : <ChevronRight aria-hidden className="size-3.5 text-fg-muted" />
                )}
            </button>
            {expanded && displayContent && (
                <div className="relative border-t border-border-subtle p-2">
                    <button
                        onClick={handleCopy}
                        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded px-2 py-1 text-meta text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
                        aria-label="Copy result"
                    >
                        {copied ? <><Check aria-hidden className="size-3.5 text-up" /> Copied</> : <><Copy aria-hidden className="size-3.5" /> Copy</>}
                    </button>
                    {/* Full result: scrollable and copyable. */}
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-surface p-3 pr-20 font-mono text-meta text-fg-secondary">
                        {displayContent}
                    </pre>
                </div>
            )}
        </div>
    );
}

/* ─── Markdown Overrides (Grok-inspired: clean, large, readable) ─── */
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="mb-2 mt-6 text-title text-fg">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-2 mt-6 text-title text-fg">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-1.5 mt-5 text-title-sm text-fg">{children}</h3>
    ),
    h4: ({ children }) => (
        <h4 className="mb-1 mt-4 text-body font-semibold text-fg">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="my-3 text-body-lg text-fg first:mt-0">
            {highlightNumbersInChildren(children, 'p')}
        </p>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold text-fg">
            {highlightNumbersInChildren(children, 'strong')}
        </strong>
    ),
    em: ({ children }) => (
        <em className="text-fg-muted">{children}</em>
    ),
    // Links into the app (site names, "its Search tab", added by linkAnswer) stay in the app; others open a new tab.
    a: ({ href, children }) => (
        <AnswerLink
            href={href}
            external={(h, c) => (
                <a href={h} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text underline decoration-border-strong underline-offset-2 transition-colors hover:decoration-brand-text">
                    {c}<ExternalLink aria-hidden className="size-3" />
                </a>
            )}
        >
            {children}
        </AnswerLink>
    ),
    ul: ({ children }) => (
        <ul className="my-3 space-y-2">{children}</ul>
    ),
    // Numbered steps: react-markdown 10 no longer tells `li` whether its list is ordered, so the number badge is a
    // CSS counter shown only under an <ol> (before round 5 every step rendered as a bullet).
    ol: ({ children }) => (
        <ol className="my-3 list-none space-y-2 [counter-reset:answer-step]">{children}</ol>
    ),
    li: ({ children }) => (
        <li className="flex gap-3 text-body-lg text-fg [counter-increment:answer-step]">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fg-faint [ol>li>&]:hidden" />
            <span aria-hidden className="mt-0.5 hidden size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-meta font-medium text-fg-secondary tabular-nums before:content-[counter(answer-step)] [ol>li>&]:flex" />
            <div className="min-w-0 flex-1">{highlightNumbersInChildren(children, 'li')}</div>
        </li>
    ),
    blockquote: ({ children }) => (
        <div className="my-4 border-l-2 border-border-strong py-0.5 pl-4">
            <div className="text-body text-fg-muted italic">{children}</div>
        </div>
    ),
    hr: () => <hr className="my-6 border-border-subtle" />,
    code: ({ children, className }) => {
        const isBlock = className?.startsWith('language-');
        if (isBlock) return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>;
        return (
            <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[0.9em] text-fg">
                {children}
            </code>
        );
    },
    pre: ({ children }) => <>{children}</>,
    // Tables (AnswerParts): numeric columns right-aligned, changes as ▲▼, a heat bar on the ranked
    // count, a sparkline above a table of dates. Scrolls inside the message.
    table: ({ node, children }) => <AnswerTable node={node}>{children}</AnswerTable>,
    thead: ({ children }) => (
        <thead className="border-b border-border-subtle bg-surface-sunken">{children}</thead>
    ),
    tbody: ({ children }) => <tbody className="divide-y divide-border-subtle">{children}</tbody>,
    tr: ({ children }) => <tr className="transition-colors hover:bg-subtle/50">{children}</tr>,
    th: ({ node, children }) => <AnswerTh node={node}>{children}</AnswerTh>,
    td: ({ node, children }) => <AnswerTd node={node}>{children}</AnswerTd>,
};

/* ─── Site links ─── */

/** The names an answer may use for each of the user's sites (host, www. host, GA4 name, stream host). */
function answerSites(sites: SiteEntry[]): AnswerSite[] {
    return sites.map((s) => {
        const names = [s.label, s.streamHost ?? '', s.ga4Name ? s.ga4Name.replace(/\s*[–—-]\s*(web|ga4|website|app|site)$/i, '') : ''];
        if (!/^ga4-\d+$/.test(s.host)) names.push(s.host.replace(/--\d+$/, ''), `www.${s.host.replace(/--\d+$/, '')}`);
        return { host: s.host, names: names.filter(Boolean) };
    });
}

/* ─── Suggestion Chip Parser ─── */
function parseSuggestions(text: string): { cleanContent: string; suggestions: string[] } {
    const match = text.match(/<!--\s*suggestions:\s*(\[[\s\S]*?\])\s*-->/);
    if (!match) return { cleanContent: text, suggestions: [] };
    try {
        const suggestions = JSON.parse(match[1]);
        if (!Array.isArray(suggestions)) return { cleanContent: text, suggestions: [] };
        const cleanContent = text.replace(match[0], '').trimEnd();
        return { cleanContent, suggestions: suggestions.slice(0, 3) };
    } catch {
        return { cleanContent: text, suggestions: [] };
    }
}

/* ─── Main Renderer ─── */
interface ChatMessageRendererProps {
    content: string;
    tools?: ToolCall[];
    /** B5-full: model's pre-tool reasoning. Rendered as a collapsible block
     *  above tool icons so users can read it OR hide it. Streamed live. */
    thinking?: string;
    /** B5-full: planner's structured plan. Rendered as a card above thinking. */
    plan?: ChatPlan;
    /** B5-full: critic's score + diagnosis. Rendered as a small badge below the answer. */
    critic?: CriticVerdict;
    isStreaming?: boolean;
    snapshot?: DashboardSnapshot;
    onSuggestionClick?: (suggestion: string) => void;
    /** chat_messages.id — when present (assistant turn finished streaming AND
     *  persistMessage resolved with a real id), renders 👍/👎 feedback row at
     *  the bottom. Absent for in-flight / user messages / un-persisted turns. */
    messageId?: number;
    /** Optional thread id — flows through to ChatFeedback rows for grouping. */
    threadId?: string;
}

export default memo(function ChatMessageRenderer({ content, tools, thinking, plan, critic, isStreaming, snapshot, onSuggestionClick, messageId, threadId }: ChatMessageRendererProps) {
    const { cleanContent, suggestions } = useMemo(() => {
        // Phase 2: pre-process inline citation [src:tool:id] + confidence
        // [conf:high|med|low] markers BEFORE parseSuggestions runs so the
        // suggestions extractor sees clean text. preprocessMarkers turns
        // each marker into a markdown italic chunk that ReactMarkdown can
        // render natively (no rehype-raw dependency required).
        const processed = preprocessMarkers(content || '');
        return isStreaming
            ? { cleanContent: processed, suggestions: [] }
            : parseSuggestions(processed);
    }, [content, isStreaming]);

    const hasLiveToolResult = tools?.some(t =>
        (t.name === 'get_search_performance' || t.name === 'run_ga4_report' || t.name === 'run_realtime_report') && (t.structuredData || t.result)
    );

    const liveCharts = useMemo(() => {
        if (!tools) return [];
        return tools
            .filter(t => t.result || t.structuredData)
            .map(t => {
                const parsed = t.structuredData || safeParseToolResult(t.result);
                return parsed?.rows?.length ? { key: t.name, result: parsed } : null;
            })
            .filter(Boolean) as { key: string; result: StructuredToolResult }[];
    }, [tools]);

    // Site names and "its Search tab" link into the app (the site Ask is about when no site is named).
    const { sites, host: currentHost } = useCurrentSite();
    const linkSites = useMemo(() => answerSites(sites), [sites]);
    const linked = useMemo(() => linkAnswer(cleanContent || '', linkSites, currentHost), [cleanContent, linkSites, currentHost]);
    const segments = useMemo(() => splitContentOnChartTags(linked), [linked]);

    return (
        <div className="chat-message-content">
            {/* B5-full: planner's plan card — rendered first so the user sees
                what's about to happen BEFORE thinking + tool icons. */}
            {plan && <PlanCard plan={plan} />}

            {/* B5-full: model's pre-tool reasoning, collapsible. Auto-opens
                while streaming so the user has something to watch; collapsible
                once the answer lands. Renders ABOVE tool icons because in the
                stream timeline reasoning happens first. */}
            {thinking && thinking.trim() && (
                <ThinkingBlock content={thinking} isStreaming={isStreaming && !content} />
            )}

            {/* Tool calls */}
            {tools && tools.length > 0 && (
                <div className="mb-3 space-y-1.5">
                    {tools.map((tool, i) => (
                        <ToolCallCard key={`${tool.name}-${i}`} tool={tool} />
                    ))}
                </div>
            )}

            {/* Live charts */}
            {liveCharts.length > 0 && (
                <div className="mb-4">
                    {liveCharts.map(({ key, result }) => (
                        <SmartChartPanel key={key} result={result} />
                    ))}
                </div>
            )}

            {/* Content */}
            {segments.map((seg, i) =>
                seg.type === 'chart' ? (
                    !hasLiveToolResult && snapshot ? (
                        <div key={`chart-${i}`}>{renderSnapshotChart(seg.tag, snapshot, seg.payload)}</div>
                    ) : null
                ) : (
                    seg.content.trim() ? (
                        <div key={`text-${i}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {seg.content}
                            </ReactMarkdown>
                        </div>
                    ) : null
                )
            )}

            {/* Follow-up chips */}
            {suggestions.length > 0 && !isStreaming && onSuggestionClick && (
                <div className="mt-5 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(s)}
                            className="group flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-left text-body-sm text-fg-secondary shadow-xs transition-colors hover:border-border-strong hover:bg-subtle hover:text-fg"
                        >
                            {s}
                            <ArrowRight aria-hidden className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </button>
                    ))}
                </div>
            )}

            {/* Streaming cursor */}
            {isStreaming && (
                <span aria-hidden className="ml-0.5 inline-block h-5 w-0.5 animate-pulse rounded-full bg-fg-muted align-middle" />
            )}

            {/* B5-full: critic verdict — at the bottom because it judges what
                the user just read. Only renders for personas where critic is
                enabled (DIAGNOSTIC, EXECUTIVE_SUMMARY). */}
            {!isStreaming && critic && <CriticBadge verdict={critic} />}

            {/* B-7: per-message feedback — only when the assistant turn has
                actually been persisted (we have a real DB message_id to attach
                the ChatFeedback row to). Hides for streaming / user / failed-
                persist messages. */}
            {!isStreaming && typeof messageId === 'number' && messageId > 0 && (
                <MessageFeedback messageId={messageId} threadId={threadId} />
            )}
        </div>
    );
});
