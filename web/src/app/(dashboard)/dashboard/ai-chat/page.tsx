'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    Send, Sparkles, RotateCcw, Globe, ChevronDown,
    MessageSquare, Zap, Target, TrendingUp, Brain,
    Loader2, ArrowUp
} from 'lucide-react';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';

const STARTER_PROMPTS = [
    { icon: Target, text: 'What is the ONE thing I should do today to grow?', color: 'emerald' },
    { icon: TrendingUp, text: 'Which keywords can I push to page 1?', color: 'cyan' },
    { icon: Zap, text: 'Find me quick wins — low CTR, high impressions', color: 'amber' },
    { icon: Brain, text: 'Grade my SEO from A to F with a full breakdown', color: 'violet' },
];

const THINKING_PHASES = [
    'Warming up brain cells...', 'Scanning your data...', 'Crunching the numbers...',
    'Connecting the dots...', 'Hunting for insights...', 'Processing at light speed...',
];

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Analyzing search data...',
    get_analytics_breakdown: 'Checking analytics...',
    run_page_audit: 'Running page audit...',
    calculate_revenue_impact: 'Calculating revenue...',
    generate_content_strategy: 'Generating strategy...',
    analyze_keyword_clusters: 'Clustering keywords...',
    compare_time_periods: 'Comparing periods...',
    find_cannibalization: 'Detecting cannibalization...',
    suggest_internal_links: 'Finding link opportunities...',
    generate_meta_tags: 'Generating meta tags...',
};

/* ─── Thinking Indicator ─── */
const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const [phase, setPhase] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setPhase(p => (p + 1) % THINKING_PHASES.length), 2500);
        return () => clearInterval(timer);
    }, []);
    const message = activeTool ? (TOOL_LABELS[activeTool] || 'Running analysis...') : THINKING_PHASES[phase];

    return (
        <div className="flex justify-start">
            <div className="px-5 py-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] rounded-bl-sm max-w-lg">
                <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                        </div>
                    </div>
                    <div className="min-w-0">
                        <span className="text-[13px] text-zinc-400 font-medium">{message}</span>
                        <div className="flex gap-1 mt-1.5">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce"
                                    style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default function AIChat() {
    const { selectedSite, setSelectedSite } = useRegistration();
    const { hasGoogleConnection } = useContainerStatus();
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const { properties: ga4Properties } = usePropertyList(hasGoogleConnection);

    const { messages, setMessages, clearChat: storeClearChat } = useChatStore();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTool, setActiveTool] = useState<string | undefined>();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Match GA4 property to selected site
    const matchedProperty = useMemo(() => {
        if (!selectedSite || ga4Properties.length === 0) return ga4Properties[0];
        const domain = selectedSite.replace('sc-domain:', '').replace('https://', '').replace('/', '');
        const domainRoot = domain.split('.')[0];
        return (
            ga4Properties.find((p: any) => p.displayName?.toLowerCase().includes(domain.toLowerCase())) ||
            ga4Properties.find((p: any) => (p.propertyId || p.property || '').toLowerCase().includes(domainRoot.toLowerCase())) ||
            ga4Properties.find((p: any) => p.displayName?.toLowerCase().includes(domainRoot.toLowerCase())) ||
            ga4Properties[0]
        );
    }, [selectedSite, ga4Properties]);

    // Fetch data for context
    const { data: analyticsData } = useAnalyticsData('all', matchedProperty?.property, hasGoogleConnection && !!selectedSite);
    const { data: seoData } = useSeoData('all', selectedSite, hasGoogleConnection && !!selectedSite);
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;

    // Build snapshot for chart rendering in messages
    const snapshot = useMemo(() => buildSnapshot(analyticsData, seoData), [analyticsData, seoData]);

    // Refs for stable callbacks
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const analyticsRef = useRef(analyticsData);
    analyticsRef.current = analyticsData;
    const seoRef = useRef(seoData);
    seoRef.current = seoData;
    const selectedSiteRef = useRef(selectedSite);
    selectedSiteRef.current = selectedSite;

    // Stream batching
    const streamBufferRef = useRef('');
    const rafIdRef = useRef<number | null>(null);

    const flushStreamBuffer = useCallback(() => {
        rafIdRef.current = null;
        const buffered = streamBufferRef.current;
        if (!buffered) return;
        streamBufferRef.current = '';
        setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + buffered };
            return updated;
        });
    }, []);

    const appendStreamText = useCallback((text: string) => {
        streamBufferRef.current += text;
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(flushStreamBuffer);
        }
    }, [flushStreamBuffer]);

    useEffect(() => {
        return () => { if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current); };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!siteDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setSiteDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [siteDropdownOpen]);

    const sendMessage = useCallback(async (text?: string, options?: { mode?: string }) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        const currentAnalytics = analyticsRef.current;
        const currentSeo = seoRef.current;
        const currentMessages = messagesRef.current;
        const currentSite = selectedSiteRef.current;

        const userMessage: ChatMessage = { role: 'user', content: messageText, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date().toISOString(), tools: [] }]);
        setInput('');
        setIsLoading(true);
        setActiveTool(undefined);

        try {
            const isFirstUserMessage = currentMessages.filter(m => m.role === 'user').length === 0;

            // Hard timeout: abort if no response headers within 30s
            const abortController = new AbortController();
            const ttfbTimeout = setTimeout(() => abortController.abort(), 30000);

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: currentSite,
                    // Full context on first message, reduced KPI-only context on subsequent messages
                    analyticsContext: currentAnalytics ? (isFirstUserMessage ? {
                        kpis: currentAnalytics.kpis,
                        topSources: currentAnalytics.sources?.slice(0, 8),
                        topPages: currentAnalytics.pages?.slice(0, 10),
                        topCountries: currentAnalytics.countries?.slice(0, 8),
                        devices: currentAnalytics.devices,
                        channels: currentAnalytics.channels?.slice(0, 6),
                    } : { kpis: currentAnalytics.kpis }) : null,
                    seoContext: currentSeo ? (isFirstUserMessage ? {
                        kpis: currentSeo.kpis,
                        topQueries: currentSeo.queries?.slice(0, 15),
                        topPages: currentSeo.pages?.slice(0, 8),
                        recommendations: currentSeo.recommendations,
                    } : { kpis: currentSeo.kpis }) : null,
                    history: currentMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                    mode: options?.mode,
                }),
            });
            clearTimeout(ttfbTimeout); // Response started, cancel TTFB timeout

            if (!res.ok) {
                if (res.status === 402) {
                    const errorData = await res.json().catch(() => ({}));
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: errorData.response || "You've run out of messages. Get more credits to continue."
                        };
                        return updated;
                    });
                    setIsLoading(false);
                    return;
                }
                throw new Error('Failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'text') {
                            appendStreamText(data.content);
                        } else if (data.type === 'tool_start') {
                            setActiveTool(data.name);
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = [...(last.tools || []), { name: data.name, args: data.args }];
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_result') {
                            setActiveTool(undefined);
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map(t =>
                                    t.name === data.name && !t.result ? { ...t, result: data.result || 'Done', structuredData: data.structuredData } : t
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'error') {
                            appendStreamText(`\n\n**Error:** ${data.message}`);
                        }
                    } catch { /* skip parse error */ }
                }
            }

            if (streamBufferRef.current) {
                if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
                flushStreamBuffer();
            }
        } catch (err: any) {
            const isTimeout = err?.name === 'AbortError';
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                        ...last,
                        content: (last.content || '') + (isTimeout
                            ? '\n\n⚠️ **Request timed out.** The AI took too long to respond. Try a simpler question or try again.'
                            : '\n\n⚠️ **Connection Error.** Couldn\'t reach the AI service. Please try again.'),
                    };
                    return updated;
                }
                return prev;
            });
        } finally {
            setIsLoading(false);
            setActiveTool(undefined);
        }
    }, [input, isLoading, appendStreamText, flushStreamBuffer]);

    // ── Daily briefing: auto-send on first visit of the day ──
    const sendMessageRef = useRef(sendMessage);
    sendMessageRef.current = sendMessage;
    const briefingSentRef = useRef(false);

    useEffect(() => {
        if (briefingSentRef.current || messages.length > 0 || !dataReady || isLoading) return;
        if (!analyticsData && !seoData) return; // Need actual data for briefing

        const today = new Date().toISOString().split('T')[0];
        const lastBriefing = localStorage.getItem('tc-last-briefing-date');
        if (lastBriefing === today) return;

        briefingSentRef.current = true;
        localStorage.setItem('tc-last-briefing-date', today);
        sendMessageRef.current('Give me my morning briefing — what changed overnight and what should I focus on today?', { mode: 'briefing' });
    }, [dataReady, messages.length, isLoading, analyticsData, seoData]);

    const clearChat = useCallback(() => {
        storeClearChat();
    }, [storeClearChat]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };

    const siteLabel = selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : 'Select a site';
    const lastMsg = messages[messages.length - 1];
    const showEmpty = messages.length === 0;

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] bg-[#050508]/80 backdrop-blur-md flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white">AI Analyst</h1>
                        <p className="text-[10px] text-zinc-500">Powered by your live data</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Site Selector */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                            className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 hover:border-zinc-600 transition min-w-[180px]"
                        >
                            <Globe className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="truncate flex-1 text-left">{siteLabel}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {siteDropdownOpen && gscSites.length > 0 && (
                            <div className="absolute right-0 top-full mt-1 z-50 bg-[#0a0a0f] border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[220px] max-h-[240px] overflow-y-auto">
                                {gscSites.map((site: any) => {
                                    const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                    const isSelected = site.siteUrl === selectedSite;
                                    return (
                                        <button key={site.siteUrl}
                                            onClick={() => { setSelectedSite(site.siteUrl); setSiteDropdownOpen(false); }}
                                            className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition ${isSelected ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}
                                        >
                                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span className="truncate">{label}</span>
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 ml-auto" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {messages.length > 0 && (
                        <button onClick={clearChat} className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-white transition" title="Clear chat">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto">
                {showEmpty ? (
                    /* Empty state with starter prompts */
                    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-6">
                            <Sparkles className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">AI SEO Analyst</h2>
                        <p className="text-sm text-zinc-500 text-center max-w-md mb-8">
                            I have your live analytics and SEO data loaded. Ask me anything — I give <span className="text-emerald-400 font-semibold">verdicts</span>, not just advice.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                            {STARTER_PROMPTS.map((prompt, i) => {
                                const Icon = prompt.icon;
                                const colorMap: Record<string, string> = {
                                    emerald: 'border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]',
                                    cyan: 'border-cyan-500/15 hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]',
                                    amber: 'border-amber-500/15 hover:border-amber-500/30 hover:bg-amber-500/[0.04]',
                                    violet: 'border-violet-500/15 hover:border-violet-500/30 hover:bg-violet-500/[0.04]',
                                };
                                const iconColorMap: Record<string, string> = {
                                    emerald: 'text-emerald-400', cyan: 'text-cyan-400', amber: 'text-amber-400', violet: 'text-violet-400',
                                };
                                return (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(prompt.text)}
                                        disabled={isLoading || !dataReady}
                                        className={`flex items-start gap-3 p-4 rounded-xl border bg-white/[0.01] ${colorMap[prompt.color]} transition-all text-left disabled:opacity-40`}
                                    >
                                        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColorMap[prompt.color]}`} />
                                        <span className="text-xs text-zinc-300 leading-relaxed">{prompt.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {!dataReady && hasGoogleConnection && (
                            <div className="flex items-center gap-2 mt-6 text-xs text-zinc-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading your data...
                            </div>
                        )}
                    </div>
                ) : (
                    /* Chat messages */
                    <div className="px-6 py-4 space-y-4 max-w-3xl mx-auto">
                        {messages.map((msg, i) => {
                            if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                            return (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`${msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[85%] w-full'} rounded-2xl px-5 py-4 text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-emerald-500/[0.08] text-emerald-100 border border-emerald-500/[0.12] rounded-br-sm'
                                        : 'bg-white/[0.02] text-zinc-300 border border-white/[0.04] rounded-bl-sm'
                                        }`}>
                                        {msg.role === 'assistant' ? (
                                            <ChatMessageRenderer content={msg.content} tools={msg.tools} isStreaming={isLastAssistant && isLoading} snapshot={snapshot} onSuggestionClick={(s) => sendMessage(s)} />
                                        ) : (
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {isLoading && (!lastMsg?.content || activeTool) && (
                            <ThinkingIndicator activeTool={activeTool} />
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 border-t border-white/[0.04] bg-[#050508]/80 backdrop-blur-md px-6 py-4">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-end gap-3 bg-zinc-900/80 border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-emerald-500/30 transition-colors">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                            onKeyDown={handleKeyDown}
                            placeholder={dataReady ? 'Ask about your SEO, traffic, keywords...' : 'Loading your data...'}
                            disabled={isLoading || !dataReady}
                            rows={1}
                            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none max-h-40 disabled:opacity-50"
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading || !dataReady}
                            className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-all flex-shrink-0"
                        >
                            <ArrowUp className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-[10px] text-zinc-600 text-center mt-2">
                        AI responses are based on your live Google Analytics & Search Console data
                    </p>
                </div>
            </div>
        </div>
    );
}
