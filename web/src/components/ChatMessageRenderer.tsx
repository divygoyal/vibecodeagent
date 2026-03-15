'use client';

import { memo, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Copy, Check, ExternalLink, ChevronDown, ChevronRight,
    CheckCircle2, Loader2, ArrowRight
} from 'lucide-react';
import type { Components } from 'react-markdown';
import { SmartChartPanel } from './chat/ChatCharts';
import { splitContentOnChartTags, renderSnapshotChart } from './chat/SnapshotChartRenderer';
import type { DashboardSnapshot } from './chat/SnapshotChartRenderer';
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
        <div className="relative group my-4 rounded-xl overflow-hidden bg-[#111] border border-zinc-800/60">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
                <span className="text-[11px] text-zinc-500 font-mono">{language || 'code'}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-white transition-colors">
                    {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
                <code className="text-zinc-300 font-mono">{children}</code>
            </pre>
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

export function ToolCallCard({ tool }: { tool: ToolCall }) {
    const [expanded, setExpanded] = useState(false);
    const isDone = !!tool.result;

    return (
        <div className="my-2 flex items-center gap-2.5 text-sm">
            {isDone
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                : <Loader2 className="w-4 h-4 text-zinc-500 flex-shrink-0 animate-spin" />}
            <button
                onClick={() => isDone && setExpanded(!expanded)}
                className={`text-zinc-400 ${isDone ? 'hover:text-white cursor-pointer' : ''} transition-colors`}
            >
                {TOOL_NAMES[tool.name] || tool.name}
            </button>
            {isDone && (expanded
                ? <ChevronDown className="w-3 h-3 text-zinc-600" />
                : <ChevronRight className="w-3 h-3 text-zinc-600" />
            )}
            {expanded && tool.result && (
                <div className="w-full mt-1">
                    <pre className="text-[11px] text-zinc-500 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap bg-[#111] rounded-lg p-3">
                        {typeof tool.result === 'string' && tool.result.length > 500 ? tool.result.slice(0, 500) + '...' : tool.result}
                    </pre>
                </div>
            )}
        </div>
    );
}

/* ─── Markdown Overrides (Grok-inspired: clean, large, readable) ─── */
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="text-xl font-bold text-white mt-8 mb-3">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-lg font-bold text-white mt-7 mb-3">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-base font-semibold text-white mt-5 mb-2">{children}</h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold text-zinc-200 mt-4 mb-1.5">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="text-[15px] text-zinc-300 leading-[1.8] my-3">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="text-white font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="text-zinc-400">{children}</em>
    ),
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 decoration-emerald-500/30 hover:decoration-emerald-400/60 inline-flex items-center gap-1 transition-colors">
            {children}<ExternalLink className="w-3 h-3" />
        </a>
    ),
    ul: ({ children }) => (
        <ul className="space-y-2 my-4">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="space-y-2 my-4 list-none">{children}</ol>
    ),
    li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
            <li className="flex gap-3 text-[15px] text-zinc-300 leading-relaxed">
                {ordered ? (
                    <span className="flex-shrink-0 mt-[2px] w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[11px] font-bold">
                        {(index ?? 0) + 1}
                    </span>
                ) : (
                    <span className="flex-shrink-0 mt-[10px] w-1.5 h-1.5 rounded-full bg-zinc-600" />
                )}
                <div className="flex-1 min-w-0">{children}</div>
            </li>
        );
    },
    blockquote: ({ children }) => (
        <div className="my-4 pl-4 border-l-2 border-zinc-700 py-1">
            <div className="text-[14px] text-zinc-400 italic leading-relaxed">{children}</div>
        </div>
    ),
    hr: () => <hr className="border-zinc-800 my-6" />,
    code: ({ children, className }) => {
        const isBlock = className?.startsWith('language-');
        if (isBlock) return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>;
        return (
            <code className="bg-zinc-800/80 text-emerald-300 px-1.5 py-0.5 rounded text-[13px] font-mono">
                {children}
            </code>
        );
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
        <div className="my-5 rounded-xl overflow-hidden border border-zinc-800/60 bg-[#111]">
            <div className="overflow-x-auto">
                <table className="w-full text-[13px]">{children}</table>
            </div>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="border-b border-zinc-800/80">{children}</thead>
    ),
    tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/40">{children}</tbody>,
    tr: ({ children }) => <tr className="hover:bg-white/[0.02]">{children}</tr>,
    th: ({ children }) => (
        <th className="px-4 py-3 text-left text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-3 text-zinc-300">{children}</td>
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
    const { cleanContent, suggestions } = useMemo(
        () => isStreaming ? { cleanContent: content, suggestions: [] } : parseSuggestions(content || ''),
        [content, isStreaming]
    );

    const hasLiveToolResult = tools?.some(t =>
        (t.name === 'get_search_performance' || t.name === 'get_analytics_breakdown') && (t.structuredData || t.result)
    );

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

    const segments = useMemo(() => splitContentOnChartTags(cleanContent || ''), [cleanContent]);

    return (
        <div className="chat-message-content">
            {/* Tool calls */}
            {tools && tools.length > 0 && (
                <div className="mb-4 space-y-1">
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
                <div className="flex flex-wrap gap-2 mt-6">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(s)}
                            className="group text-[13px] text-zinc-400 px-4 py-2.5 rounded-full bg-[#1a1a1a] hover:bg-[#252525] hover:text-white transition-all flex items-center gap-1.5"
                        >
                            {s}
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            )}

            {/* Streaming cursor */}
            {isStreaming && (
                <span className="inline-block w-0.5 h-5 bg-white/60 animate-pulse ml-0.5 align-middle rounded-full" />
            )}
        </div>
    );
});
