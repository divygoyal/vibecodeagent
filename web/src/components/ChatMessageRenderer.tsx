'use client';

import { memo, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Copy, Check, ExternalLink, ChevronDown, ChevronRight,
    Wrench, CheckCircle2, Loader2, AlertCircle, ArrowRight,
    AlertTriangle, Lightbulb, DollarSign, TrendingUp, Zap, Info
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
        <div className="relative group my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#0c0c14]">
            <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-medium">{language || 'code'}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/[0.06]">
                    {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed">
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

const TOOL_ICONS: Record<string, string> = {
    get_search_performance: '🔍',
    get_analytics_breakdown: '📊',
    run_page_audit: '🛡️',
    calculate_revenue_impact: '💰',
    generate_content_strategy: '📝',
    analyze_keyword_clusters: '🏷️',
    compare_time_periods: '📅',
    find_cannibalization: '⚠️',
    suggest_internal_links: '🔗',
    generate_meta_tags: '🏷️',
};

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
    const icon = TOOL_ICONS[tool.name] || '⚙️';

    return (
        <div className={`my-2 rounded-xl border overflow-hidden transition-all duration-300 ${isDone
            ? 'border-emerald-500/10 bg-emerald-500/[0.03]'
            : 'border-cyan-500/15 bg-cyan-500/[0.03]'
        }`}>
            <button
                onClick={() => isDone && setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition text-left"
            >
                <span className="text-sm">{icon}</span>
                {isDone
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <Loader2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 animate-spin" />}
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-zinc-300">{TOOL_NAMES[tool.name] || tool.name}</span>
                    {tool.args && (
                        <span className="text-[10px] text-zinc-500 ml-2">
                            {Object.entries(tool.args).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`).join(', ')}
                        </span>
                    )}
                </div>
                {isDone && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-emerald-500 font-medium uppercase tracking-wider">Done</span>
                        {expanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                            : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        }
                    </div>
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

/* ─── Detect heading emoji/keyword for smart icons ─── */
function getHeadingDecoration(text: string): { icon: React.ReactNode; accent: string } | null {
    const lower = typeof text === 'string' ? text.toLowerCase() : '';
    if (lower.includes('revenue') || lower.includes('money') || lower.includes('cost') || lower.includes('$'))
        return { icon: <DollarSign className="w-3.5 h-3.5" />, accent: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    if (lower.includes('action') || lower.includes('fix') || lower.includes('do this'))
        return { icon: <Zap className="w-3.5 h-3.5" />, accent: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
    if (lower.includes('warning') || lower.includes('critical') || lower.includes('issue'))
        return { icon: <AlertTriangle className="w-3.5 h-3.5" />, accent: 'text-red-400 bg-red-500/10 border-red-500/20' };
    if (lower.includes('tip') || lower.includes('bonus') || lower.includes('insight') || lower.includes('recommend'))
        return { icon: <Lightbulb className="w-3.5 h-3.5" />, accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (lower.includes('growth') || lower.includes('opportunity') || lower.includes('trend'))
        return { icon: <TrendingUp className="w-3.5 h-3.5" />, accent: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' };
    return null;
}

/* ─── Markdown Component Overrides ─── */
const markdownComponents: Components = {
    h1: ({ children }) => (
        <h1 className="text-lg font-bold text-white mt-6 mb-3 pb-2 border-b border-white/[0.08]">{children}</h1>
    ),
    h2: ({ children }) => {
        const text = typeof children === 'string' ? children : '';
        const deco = getHeadingDecoration(text);
        return (
            <div className="mt-5 mb-3">
                <h2 className="flex items-center gap-2 text-[15px] font-bold text-white">
                    {deco && (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border ${deco.accent}`}>
                            {deco.icon}
                        </span>
                    )}
                    {children}
                </h2>
            </div>
        );
    },
    h3: ({ children }) => (
        <h3 className="text-sm font-bold text-zinc-200 mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-emerald-500" />
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold text-zinc-300 mt-3 mb-1">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="text-[13px] text-zinc-300 leading-[1.7] my-2">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="text-white font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="text-zinc-400 italic">{children}</em>
    ),
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 decoration-emerald-500/30 hover:decoration-emerald-400/60 inline-flex items-center gap-1 transition-colors">
            {children}<ExternalLink className="w-3 h-3" />
        </a>
    ),
    ul: ({ children }) => (
        <ul className="space-y-1.5 my-3 ml-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="space-y-1.5 my-3 ml-0.5 list-none counter-reset-[item]">{children}</ol>
    ),
    li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
            <li className="flex gap-2.5 text-[13px] text-zinc-300 leading-relaxed">
                {ordered ? (
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                        {(index ?? 0) + 1}
                    </span>
                ) : (
                    <span className="flex-shrink-0 mt-[9px] w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                )}
                <div className="flex-1 min-w-0">{children}</div>
            </li>
        );
    },
    blockquote: ({ children }) => (
        <div className="my-3 pl-4 border-l-2 border-emerald-500/40 bg-emerald-500/[0.04] rounded-r-xl py-3 pr-4">
            <div className="text-[12px] text-zinc-300 italic leading-relaxed">{children}</div>
        </div>
    ),
    hr: () => <hr className="border-white/[0.06] my-5" />,
    code: ({ children, className, ...rest }) => {
        const isBlock = className?.startsWith('language-');
        if (isBlock) {
            return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>;
        }
        return (
            <code className="bg-white/[0.08] text-emerald-300 px-1.5 py-0.5 rounded-md text-[11px] font-mono border border-white/[0.04]">
                {children}
            </code>
        );
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
        <div className="my-4 rounded-xl border border-white/[0.08] overflow-hidden bg-white/[0.01]">
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">{children}</table>
            </div>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-white/[0.05] border-b border-white/[0.08]">{children}</thead>
    ),
    tbody: ({ children }) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
    tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
    th: ({ children }) => (
        <th className="px-4 py-2.5 text-left text-[10px] text-zinc-400 uppercase tracking-wider font-bold">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-2.5 text-zinc-300 font-mono text-[11px]">{children}</td>
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
        <div className="chat-message-content space-y-1">
            {/* Tool call cards */}
            {tools && tools.length > 0 && (
                <div className="mb-3">
                    {tools.map((tool, i) => (
                        <ToolCallCard key={`${tool.name}-${i}`} tool={tool} />
                    ))}
                </div>
            )}

            {/* Live charts from tool results (SmartChartPanel) */}
            {liveCharts.length > 0 && (
                <div className="mb-3">
                    {liveCharts.map(({ key, result }) => (
                        <SmartChartPanel key={key} result={result} />
                    ))}
                </div>
            )}

            {/* Interleaved markdown + snapshot charts */}
            {segments.map((seg, i) =>
                seg.type === 'chart' ? (
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
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(s)}
                            className="group flex items-center gap-1.5 text-[11px] px-3.5 py-2 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.12] hover:border-emerald-500/[0.3] transition-all duration-200"
                        >
                            {s}
                            <ArrowRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                        </button>
                    ))}
                </div>
            )}

            {/* Streaming cursor */}
            {isStreaming && (
                <span className="inline-block w-0.5 h-[18px] bg-emerald-400 rounded-full animate-pulse ml-0.5 align-middle" />
            )}
        </div>
    );
});
