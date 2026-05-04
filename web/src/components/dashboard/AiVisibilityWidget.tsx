'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, Loader2, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

interface PromptCheckResult {
    prompt: string;
    cited: boolean;
    citationDomains: string[];
    competitorDomains: string[];
    answerExcerpt: string;
    fetchedAt: string;
    error?: string;
}

interface AiVisibilityResponse {
    userDomain: string | null;
    results: PromptCheckResult[];
    summary: {
        total: number;
        cited: number;
        citedRate: number;
        topCompetitors: Array<{ domain: string; count: number }>;
    };
}

interface AiVisibilityWidgetProps {
    siteUrl: string;
}

const STORAGE_KEY_PREFIX = 'tc-ai-visibility-prompts:';
const RESULTS_KEY_PREFIX = 'tc-ai-visibility-results:';
const MAX_PROMPTS = 10;

function loadPrompts(siteKey: string): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_PREFIX + siteKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string').slice(0, MAX_PROMPTS) : [];
    } catch {
        return [];
    }
}

function savePrompts(siteKey: string, prompts: string[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + siteKey, JSON.stringify(prompts.slice(0, MAX_PROMPTS)));
    } catch {
        // Ignore storage errors (quota, private mode)
    }
}

function loadResults(siteKey: string): AiVisibilityResponse | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(RESULTS_KEY_PREFIX + siteKey);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveResults(siteKey: string, results: AiVisibilityResponse) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(RESULTS_KEY_PREFIX + siteKey, JSON.stringify(results));
    } catch {
        // Ignore
    }
}

export default function AiVisibilityWidget({ siteUrl }: AiVisibilityWidgetProps) {
    const siteKey = siteUrl || 'default';
    const [prompts, setPrompts] = useState<string[]>([]);
    const [newPrompt, setNewPrompt] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [response, setResponse] = useState<AiVisibilityResponse | null>(null);

    useEffect(() => {
        const stored = loadPrompts(siteKey);
        setPrompts(stored);
        const cached = loadResults(siteKey);
        if (cached) setResponse(cached);
    }, [siteKey]);

    const addPrompt = () => {
        const trimmed = newPrompt.trim();
        if (!trimmed) return;
        if (prompts.length >= MAX_PROMPTS) return;
        if (prompts.includes(trimmed)) return;
        const next = [...prompts, trimmed];
        setPrompts(next);
        savePrompts(siteKey, next);
        setNewPrompt('');
    };

    const removePrompt = (idx: number) => {
        const next = prompts.filter((_, i) => i !== idx);
        setPrompts(next);
        savePrompts(siteKey, next);
    };

    const runCheck = useCallback(async () => {
        if (prompts.length === 0) {
            setError('Add at least one prompt to track.');
            return;
        }
        setRunning(true);
        setError(null);
        try {
            const res = await fetch('/api/seo/ai-visibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompts, userDomain: siteUrl }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || `Request failed: ${res.status}`);
            } else {
                setResponse(data);
                saveResults(siteKey, data);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setRunning(false);
        }
    }, [prompts, siteUrl, siteKey]);

    const lastRun = response?.results[0]?.fetchedAt;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/[0.14] bg-[linear-gradient(135deg,rgba(167,139,250,0.07),rgba(244,114,182,0.04)_55%,transparent_95%)] p-5 sm:p-7">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-violet-500/[0.1] blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-pink-500/[0.06] blur-3xl" />
            <div className="relative">
                <div className="flex items-start gap-3 mb-5 flex-wrap">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-pink-400 flex items-center justify-center shadow-[0_8px_32px_rgba(167,139,250,0.35)]">
                        <Eye className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Generative Engine</div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-semibold border border-violet-500/30 tracking-wider">
                                GEMINI / AIO
                            </span>
                        </div>
                        <h4 className="text-base sm:text-lg font-bold tracking-tight text-white mt-0.5">AI Visibility Tracker</h4>
                        <p className="text-[11px] text-zinc-500 mt-0.5 max-w-md">
                            Track which prompts cite your domain in AI search. ChatGPT &amp; Perplexity coverage on paid plan.
                        </p>
                    </div>
                </div>

            {/* Summary card */}
            {response && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Cited</div>
                        <div className="text-xl font-bold text-emerald-400 tabular-nums">{response.summary.cited} / {response.summary.total}</div>
                    </div>
                    <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Cited Rate</div>
                        <div className="text-xl font-bold text-violet-400 tabular-nums">{response.summary.citedRate}%</div>
                    </div>
                    <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Top Competitor</div>
                        <div className="text-sm font-bold text-amber-400 truncate">
                            {response.summary.topCompetitors[0]?.domain || '—'}
                        </div>
                    </div>
                </div>
            )}

            {/* Add prompt */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addPrompt(); }}
                    placeholder='Prompt your customers ask (e.g. "best SEO tool for indie SaaS")'
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/30"
                    disabled={prompts.length >= MAX_PROMPTS}
                />
                <button
                    onClick={addPrompt}
                    disabled={!newPrompt.trim() || prompts.length >= MAX_PROMPTS}
                    className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 border border-white/[0.08] text-xs text-zinc-300 rounded-lg flex items-center gap-1.5 justify-center"
                >
                    <Plus className="w-3 h-3" /> Add
                </button>
                <button
                    onClick={runCheck}
                    disabled={running || prompts.length === 0}
                    className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2 justify-center"
                >
                    {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {running ? 'Checking…' : 'Run Check'}
                </button>
            </div>

            {prompts.length === 0 && !response && (
                <div className="text-center py-6 text-xs text-zinc-500 bg-black/10 border border-dashed border-white/[0.08] rounded-lg">
                    Add up to {MAX_PROMPTS} prompts that your customers might ask AI search engines, then run a check.
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {error}
                </div>
            )}

            {/* Prompts list */}
            {prompts.length > 0 && (
                <div className="space-y-1.5 mb-3">
                    {prompts.map((p, i) => {
                        const matchedResult = response?.results.find(r => r.prompt === p);
                        return (
                            <div
                                key={i}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                                    matchedResult
                                        ? matchedResult.cited
                                            ? 'bg-emerald-500/10 border-emerald-500/20'
                                            : 'bg-amber-500/5 border-amber-500/20'
                                        : 'bg-white/[0.02] border-white/[0.06]'
                                }`}
                            >
                                {matchedResult ? (
                                    matchedResult.cited ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                    )
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full bg-white/[0.06] flex-shrink-0" />
                                )}
                                <span className="flex-1 text-zinc-300 truncate">{p}</span>
                                {matchedResult && !matchedResult.cited && matchedResult.competitorDomains.length > 0 && (
                                    <span className="text-[10px] text-zinc-500 hidden sm:inline truncate max-w-[140px]">
                                        cited: {matchedResult.competitorDomains.slice(0, 2).join(', ')}
                                    </span>
                                )}
                                <button
                                    onClick={() => removePrompt(i)}
                                    className="text-zinc-600 hover:text-red-400 flex-shrink-0"
                                    title="Remove"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Top competitors */}
            {response && response.summary.topCompetitors.length > 0 && (
                <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3 mb-3">
                    <div className="text-[10px] font-semibold text-white uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-amber-400" /> Domains cited instead of yours
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {response.summary.topCompetitors.map((c, i) => (
                            <span key={i} className="text-[11px] px-2 py-1 rounded bg-white/[0.04] text-zinc-300">
                                {c.domain} <span className="text-zinc-500">×{c.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                <div className="text-[10px] text-zinc-600">
                    {lastRun ? `Last checked: ${new Date(lastRun).toLocaleString()}` : 'Not yet checked'}
                    {' • '}{prompts.length} / {MAX_PROMPTS} prompts
                </div>
                {response && response.summary.cited < response.summary.total && (
                    <FixWithBotButton
                        label="Help me get cited"
                        size="sm"
                        variant="solid"
                        context={`My AI Visibility on Gemini-grounded search: ${response.summary.cited}/${response.summary.total} prompts cite my domain. Top competitors winning citations: ${response.summary.topCompetitors.slice(0, 5).map(c => c.domain).join(', ')}. Help me design a content strategy to win more AI citations.`}
                        site={siteUrl}
                    />
                )}
            </div>
            </div>
        </div>
    );
}
