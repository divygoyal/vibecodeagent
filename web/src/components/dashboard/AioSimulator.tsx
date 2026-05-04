'use client';

import { useState } from 'react';
import { Search, Loader2, CheckCircle2, XCircle, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import ReactMarkdown, { type Components as MarkdownComponents } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import FixWithBotButton from '@/components/FixWithBotButton';

interface Citation {
    uri: string;
    domain: string;
    title?: string;
    matchesUserDomain: boolean;
}

interface AioCheckResult {
    query: string;
    answer: string;
    citations: Citation[];
    userCited: boolean;
    userDomain: string | null;
    competitorDomains: string[];
    citationCount: number;
    error?: string;
}

interface AioSimulatorProps {
    siteUrl: string;
    suggestedQueries?: string[];
}

const answerMarkdownComponents: MarkdownComponents = {
    h1: ({ children }) => <h2 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h2>,
    h2: ({ children }) => <h3 className="text-sm font-semibold text-white mt-3 mb-1.5">{children}</h3>,
    h3: ({ children }) => <h4 className="text-xs font-semibold text-white mt-2 mb-1">{children}</h4>,
    p: ({ children }) => <p className="text-xs text-zinc-300 leading-relaxed my-1.5">{children}</p>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">{children}</a>,
    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5 text-xs text-zinc-300">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5 text-xs text-zinc-300">{children}</ol>,
    li: ({ children }) => <li className="text-xs text-zinc-300">{children}</li>,
    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
    code: ({ children }) => <code className="bg-white/[0.04] text-emerald-300 px-1 rounded text-[11px] font-mono">{children}</code>,
};

export default function AioSimulator({ siteUrl, suggestedQueries = [] }: AioSimulatorProps) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AioCheckResult | null>(null);

    const run = async (q: string) => {
        if (!q.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/seo/aio-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, userDomain: siteUrl }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult({
                    query: q,
                    answer: '',
                    citations: [],
                    userCited: false,
                    userDomain: null,
                    competitorDomains: [],
                    citationCount: 0,
                    error: data.error,
                });
            } else {
                setResult(data);
            }
        } catch (err) {
            setResult({
                query: q,
                answer: '',
                citations: [],
                userCited: false,
                userDomain: null,
                competitorDomains: [],
                citationCount: 0,
                error: err instanceof Error ? err.message : 'Failed',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/[0.14] bg-[linear-gradient(135deg,rgba(96,165,250,0.06),rgba(167,139,250,0.04)_60%,transparent_95%)] p-5 sm:p-6">
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-blue-500/[0.08] blur-3xl" />
            <div className="relative flex items-center gap-3 mb-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/30 to-violet-500/15 border border-blue-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(96,165,250,0.18)]">
                    <Sparkles className="w-5 h-5 text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300/80">Answer Engine</div>
                    <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">AI Overview Simulator</h4>
                    <p className="text-[11px] text-zinc-500">Gemini-grounded — see who Google AI cites</p>
                </div>
            </div>
            <div className="relative">

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') run(query); }}
                    placeholder="Type a query your customers ask…"
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/30"
                />
                <button
                    onClick={() => run(query)}
                    disabled={loading || !query.trim()}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2 justify-center"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Simulate
                </button>
            </div>

            {suggestedQueries.length > 0 && !result && !loading && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] text-zinc-500 mr-1">Try:</span>
                    {suggestedQueries.slice(0, 4).map(q => (
                        <button
                            key={q}
                            onClick={() => { setQuery(q); run(q); }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white transition"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {result?.error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.error}
                </div>
            )}

            {result && !result.error && (
                <div className="space-y-3 mt-3">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${result.userCited ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                        {result.userCited ? (
                            <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                <span className="text-xs text-emerald-300">Your domain is cited by Gemini for this query.</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <span className="text-xs text-amber-300">
                                    Your domain is <strong>not</strong> cited. {result.competitorDomains.length > 0 ? `${result.competitorDomains.length} competitors are.` : ''}
                                </span>
                            </>
                        )}
                    </div>

                    <div className="bg-black/30 border border-white/[0.06] rounded-lg p-4 max-h-[260px] overflow-y-auto">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Generated answer</div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={answerMarkdownComponents}>
                            {result.answer || '(No answer returned)'}
                        </ReactMarkdown>
                    </div>

                    {result.citations.length > 0 && (
                        <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                                Citations ({result.citations.length})
                            </div>
                            <div className="space-y-1.5">
                                {result.citations.map((c, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                                            c.matchesUserDomain
                                                ? 'bg-emerald-500/10 border-emerald-500/20'
                                                : 'bg-white/[0.02] border-white/[0.06]'
                                        }`}
                                    >
                                        <span className={`font-medium ${c.matchesUserDomain ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                            {c.domain}
                                        </span>
                                        {c.matchesUserDomain && <span className="text-[10px] text-emerald-400">YOUR SITE</span>}
                                        {c.title && <span className="text-zinc-500 truncate flex-1 hidden sm:inline">{c.title}</span>}
                                        <a href={c.uri} target="_blank" rel="noopener noreferrer" className="ml-auto text-zinc-500 hover:text-emerald-400 flex-shrink-0">
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!result.userCited && (
                        <FixWithBotButton
                            label="How to get cited for this query"
                            size="md"
                            variant="solid"
                            context={`I want my site to be cited by Google AI Overviews / Gemini for the query "${result.query}". Currently cited: ${result.competitorDomains.slice(0, 5).join(', ') || 'none of my competitors'}. What content do I need to write or improve?`}
                            site={siteUrl}
                        />
                    )}
                </div>
            )}
            </div>
        </div>
    );
}
