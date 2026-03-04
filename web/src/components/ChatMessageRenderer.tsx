'use client';

import { memo, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Copy, Check, ExternalLink, ChevronDown, ChevronRight,
    Wrench, CheckCircle2, Loader2, AlertCircle
} from 'lucide-react';
import type { Components } from 'react-markdown';
import { SmartChartPanel } from './chat/ChatCharts';
import { splitContentOnChartTags, renderSnapshotChart } from './chat/SnapshotChartRenderer';
import type { DashboardSnapshot } from './chat/SnapshotChartRenderer';
import { safeParseToolResult } from '@/lib/chatUtils';

/* ─── Code Block with Copy ─── */
function CodeBlock({ children, className }: { children: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const language = className?.replace('language-', '') || '';

    const handleCopy = () => {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-3 rounded-xl overflow-hidden border border-white/[0.08]">
            {language && (
                <div className="flex items-center justify-between px-4 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{language}</span>
                    <button onClick={handleCopy} className="text-zinc-500 hover:text-white transition p-1 rounded">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}
            <pre className="p-4 overflow-x-auto bg-[#0d0d14] text-[12px] leading-relaxed">
                <code className="text-zinc-300 font-mono">{children}</code>
            </pre>
            {!language && (
                <button onClick={handleCopy} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1]">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                </button>
            )}
        </div>
    );
}

/* ─── Tool Call Card ─── */
export interface ToolCall {
    name: string;
    args?: any;
    result?: string;
    structuredData?: { dimensions: string[]; rows: any[]; totals?: any };
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
    const [expanded, setExpanded] = useState(false);
    const isDone = !!tool.result;
    const TOOL_NAMES: Record<string, string> = {
        get_search_performance: 'Search Performance',
        get_analytics_breakdown: 'Analytics Breakdown',
        run_page_audit: 'Page Audit',
        calculate_revenue_impact: 'Revenue Impact',
        generate_content_strategy: 'Content Strategy',
        analyze_keyword_clusters: 'Keyword Clusters',
        compare_time_periods: 'Period Comparison',
        find_cannibalization: 'Cannibalization Check',
        suggest_internal_links: 'Internal Links',
        generate_meta_tags: 'Meta Tags',
    };

    return (
        <div className="my-2 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition text-left"
            >
                {isDone
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <Loader2 className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-spin" />}
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-zinc-300">{TOOL_NAMES[tool.name] || tool.name}</span>
                    {tool.args && (
                        <span className="text-[10px] text-zinc-500 ml-2">
                            {Object.entries(tool.args).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`).join(', ')}
                        </span>
                    )}
                </div>
                {isDone && (expanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                    : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                )}
            </button>
            {expanded && tool.result && (
                <div className="px-4 pb-3 border-t border-white/[0.06]">
                    <pre className="text-[11px] text-zinc-400 font-mono mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {typeof tool.result === 'string' && tool.result.length > 500
                            ? tool.result.slice(0, 500) + '...'
                            : tool.result}
                    </pre>
                </div>
            )}
        </div>
    );
}

/* ─── Markdown Component Overrides ─── */
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="text-lg font-bold text-white mt-5 mb-2 pb-1.5 border-b border-white/[0.08]">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-base font-bold text-emerald-200 mt-4 mb-2 pb-1 border-b border-white/[0.06]">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-sm font-bold text-emerald-300 mt-3 mb-1">{children}</h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="text-[13px] text-zinc-300 leading-relaxed my-1.5">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="text-white font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="text-zinc-400 italic">{children}</em>
    ),
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 inline-flex items-center gap-1">
            {children}<ExternalLink className="w-3 h-3" />
        </a>
    ),
    ul: ({ children }) => (
        <ul className="space-y-1 my-2 ml-1">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="space-y-1 my-2 ml-1 list-none">{children}</ol>
    ),
    li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
            <li className="flex gap-2 text-[13px] text-zinc-300">
                <span className="text-emerald-500/70 flex-shrink-0 mt-0.5 font-mono text-xs min-w-[1rem] text-right">
                    {ordered ? `${(index ?? 0) + 1}.` : ''}
                </span>
                <div className="flex-1">{children}</div>
            </li>
        );
    },
    blockquote: ({ children }) => (
        <div className="my-3 pl-3 border-l-2 border-emerald-500/30 bg-emerald-500/[0.04] rounded-r-lg py-2 pr-3">
            <div className="text-[12px] text-zinc-300 italic">{children}</div>
        </div>
    ),
    hr: () => <hr className="border-white/[0.06] my-4" />,
    code: ({ children, className, ...rest }) => {
        const isBlock = className?.startsWith('language-');
        if (isBlock) {
            return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>;
        }
        return (
            <code className="bg-white/[0.08] text-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-mono">
                {children}
            </code>
        );
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
        <div className="my-3 rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">{children}</table>
            </div>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-white/[0.04] border-b border-white/[0.08]">{children}</thead>
    ),
    tbody: ({ children }) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
    tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
    th: ({ children }) => (
        <th className="px-3 py-2 text-left text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-3 py-2 text-zinc-300 font-mono">{children}</td>
    ),
};

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
    isStreaming?: boolean;
    snapshot?: DashboardSnapshot;
    onSuggestionClick?: (suggestion: string) => void;
}

export default memo(function ChatMessageRenderer({ content, tools, isStreaming, snapshot, onSuggestionClick }: ChatMessageRendererProps) {
    // Parse follow-up suggestions from content (only when not streaming)
    const { cleanContent, suggestions } = useMemo(
        () => isStreaming ? { cleanContent: content, suggestions: [] } : parseSuggestions(content || ''),
        [content, isStreaming]
    );

    // Check if we have live tool results with structured data (takes priority over snapshot charts)
    const hasLiveToolResult = tools?.some(t =>
        (t.name === 'get_search_performance' || t.name === 'get_analytics_breakdown') && (t.structuredData || t.result)
    );

    // Parse tool results for SmartChartPanel
    const liveCharts = useMemo(() => {
        if (!tools) return [];
        return tools
            .filter(t => t.result || t.structuredData)
            .map(t => {
                const parsed = t.structuredData || safeParseToolResult(t.result);
                return parsed?.rows?.length ? { key: t.name, result: parsed } : null;
            })
            .filter(Boolean) as { key: string; result: any }[];
    }, [tools]);

    // Split content on chart tags
    const segments = useMemo(() => splitContentOnChartTags(cleanContent || ''), [cleanContent]);

    return (
        <div className="chat-message-content space-y-0.5">
            {/* Tool call cards */}
            {tools && tools.length > 0 && (
                <div className="mb-2">
                    {tools.map((tool, i) => (
                        <ToolCallCard key={`${tool.name}-${i}`} tool={tool} />
                    ))}
                </div>
            )}

            {/* Live charts from tool results (SmartChartPanel) */}
            {liveCharts.length > 0 && (
                <div className="mb-2">
                    {liveCharts.map(({ key, result }) => (
                        <SmartChartPanel key={key} result={result} />
                    ))}
                </div>
            )}

            {/* Interleaved markdown + snapshot charts */}
            {segments.map((seg, i) =>
                seg.type === 'chart' ? (
                    // Render snapshot chart only if no live tool result covers this data
                    !hasLiveToolResult && snapshot ? (
                        <div key={`chart-${i}`}>{renderSnapshotChart(seg.tag, snapshot, seg.payload)}</div>
                    ) : null
                ) : (
                    seg.content.trim() ? (
                        <div key={`text-${i}`} className="prose-dark">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {seg.content}
                            </ReactMarkdown>
                        </div>
                    ) : null
                )
            )}

            {/* Follow-up suggestion chips */}
            {suggestions.length > 0 && !isStreaming && onSuggestionClick && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(s)}
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.12] hover:border-emerald-500/[0.25] transition-all"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Streaming cursor */}
            {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
            )}
        </div>
    );
});
