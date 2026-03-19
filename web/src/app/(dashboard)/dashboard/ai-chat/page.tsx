'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    Globe, ChevronDown, Loader2, ArrowUp, RotateCcw, Sparkles
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';

const STARTER_CHIPS = [
    'Why did my traffic drop?',
    'Quick wins I can fix today',
    'Grade my SEO (A-F)',
    'Keywords I can push to page 1',
    'Top pages & why they work',
    'Revenue I\'m leaving on the table',
];

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Searching your data',
    get_analytics_breakdown: 'Analyzing traffic',
    run_page_audit: 'Running audit',
    calculate_revenue_impact: 'Calculating revenue',
    generate_content_strategy: 'Building strategy',
    analyze_keyword_clusters: 'Clustering keywords',
    compare_time_periods: 'Comparing periods',
    find_cannibalization: 'Checking cannibalization',
    suggest_internal_links: 'Finding links',
    generate_meta_tags: 'Generating tags',
};

/* ─── Thinking Indicator (Gemini-style) ─── */
const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const label = activeTool ? TOOL_LABELS[activeTool] || 'Working...' : 'Thinking';
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="relative flex items-center justify-center w-6 h-6">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                <Sparkles className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-sm text-zinc-500 animate-pulse">{label}</span>
        </div>
    );
});

export default function AIChat() {
    const { data: session } = useSession();
    const firstName = session?.user?.name?.split(' ')[0] || '';
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
    const [siteOpen, setSiteOpen] = useState(false);
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

    const { data: analyticsData } = useAnalyticsData('all', matchedProperty?.property, hasGoogleConnection && !!selectedSite);
    const { data: seoData } = useSeoData('all', selectedSite, hasGoogleConnection && !!selectedSite);
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;
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

    useEffect(() => {
        if (!siteOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setSiteOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [siteOpen]);

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
            const abortController = new AbortController();
            const ttfbTimeout = setTimeout(() => abortController.abort(), 30000);

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: currentSite,
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
            clearTimeout(ttfbTimeout);

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
                    } catch { /* skip */ }
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
                            ? '\n\n**Request timed out.** Try a simpler question or try again.'
                            : '\n\n**Connection lost.** Please try again.'),
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

    // Daily briefing
    const sendMessageRef = useRef(sendMessage);
    sendMessageRef.current = sendMessage;
    const briefingSentRef = useRef(false);

    useEffect(() => {
        if (briefingSentRef.current || messages.length > 0 || !dataReady || isLoading) return;
        if (!analyticsData && !seoData) return;
        const today = new Date().toISOString().split('T')[0];
        const lastBriefing = localStorage.getItem('tc-last-briefing-date');
        if (lastBriefing === today) return;
        briefingSentRef.current = true;
        localStorage.setItem('tc-last-briefing-date', today);
        sendMessageRef.current('Give me my morning briefing — what changed overnight and what should I focus on today?', { mode: 'briefing' });
    }, [dataReady, messages.length, isLoading, analyticsData, seoData]);

    const clearChat = useCallback(() => { storeClearChat(); }, [storeClearChat]);

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

    const siteLabel = selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : 'Select site';
    const lastMsg = messages[messages.length - 1];
    const showEmpty = messages.length === 0;

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] bg-[var(--background)]">

            {/* ── Messages / Empty State ── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                {showEmpty ? (
                    /* ══════ Empty: Gemini-style centered ══════ */
                    <div className="flex flex-col items-center justify-center h-full px-6">
                        <div className="flex flex-col items-center mb-12">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-5 h-5 text-emerald-400" />
                                <span className="text-base text-zinc-400">{firstName ? `Hi ${firstName}` : 'Hi there'}</span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-medium text-white tracking-tight text-center">
                                What do you want to know?
                            </h1>
                        </div>

                        {/* ── Centered input (Gemini style) ── */}
                        <div className="w-full max-w-[640px] mb-6">
                            <div className="relative flex items-center bg-[var(--input-bg)] rounded-2xl px-5 py-4 border border-[var(--input-border)] focus-within:border-[var(--card-hover)] transition-all">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask about your SEO, traffic, keywords..."
                                    disabled={isLoading || !dataReady}
                                    rows={1}
                                    className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-600 outline-none resize-none max-h-40 disabled:opacity-40 leading-relaxed"
                                />
                                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                    {/* Site selector pill */}
                                    <div className="relative" ref={dropdownRef}>
                                        <button
                                            onClick={() => setSiteOpen(!siteOpen)}
                                            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 bg-[var(--input-bg)] border border-[var(--card-border)] rounded-full px-3 py-1.5 transition-colors"
                                        >
                                            <Globe className="w-3 h-3" />
                                            <span className="max-w-[100px] truncate">{siteLabel}</span>
                                            <ChevronDown className={`w-3 h-3 transition-transform ${siteOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {siteOpen && gscSites.length > 0 && (
                                            <div className="absolute bottom-full mb-2 right-0 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
                                                {gscSites.map((site: any) => {
                                                    const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                                    const active = site.siteUrl === selectedSite;
                                                    return (
                                                        <button key={site.siteUrl}
                                                            onClick={() => { setSelectedSite(site.siteUrl); setSiteOpen(false); }}
                                                            className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${active ? 'text-emerald-400 bg-emerald-500/[0.06]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => sendMessage()}
                                        disabled={!input.trim() || isLoading || !dataReady}
                                        className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-white enabled:text-black text-zinc-500 transition-all enabled:hover:bg-zinc-200"
                                    >
                                        <ArrowUp className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── Suggestion chips ── */}
                        <div className="flex flex-wrap justify-center gap-2 max-w-[640px]">
                            {STARTER_CHIPS.map((chip, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(chip)}
                                    disabled={isLoading || !dataReady}
                                    className="text-[13px] text-zinc-400 px-4 py-2.5 rounded-full bg-[var(--input-bg)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] transition-all disabled:opacity-30"
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>

                        {!dataReady && hasGoogleConnection && (
                            <div className="flex items-center gap-2 mt-8 text-xs text-zinc-500">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading your data...
                            </div>
                        )}
                    </div>
                ) : (
                    /* ══════ Chat messages: Grok-style full-width ══════ */
                    <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-8">
                        {messages.map((msg, i) => {
                            if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;

                            return msg.role === 'user' ? (
                                /* ── User message: right-aligned pill ── */
                                <div key={i} className="flex justify-end mb-8">
                                    <div className="max-w-[80%] bg-[var(--input-bg)] text-[var(--text-primary)] text-[15px] rounded-3xl px-5 py-3 leading-relaxed">
                                        {msg.content}
                                    </div>
                                </div>
                            ) : (
                                /* ── Assistant message: full-width, no bubble ── */
                                <div key={i} className="mb-10">
                                    <ChatMessageRenderer
                                        content={msg.content}
                                        tools={msg.tools}
                                        isStreaming={isLastAssistant && isLoading}
                                        snapshot={snapshot}
                                        onSuggestionClick={(s) => sendMessage(s)}
                                    />
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

            {/* ── Bottom input (only when chatting) ── */}
            {!showEmpty && (
                <div className="flex-shrink-0 bg-[var(--background)] px-4 sm:px-6 pb-5 pt-2">
                    <div className="max-w-[760px] mx-auto">
                        <div className="flex items-center bg-[var(--input-bg)] rounded-2xl px-5 py-3 border border-[var(--input-border)] focus-within:border-[var(--card-hover)] transition-all">
                            <textarea
                                value={input}
                                onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask anything"
                                disabled={isLoading}
                                rows={1}
                                className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-600 outline-none resize-none max-h-40 leading-relaxed"
                            />
                            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                {/* Site pill */}
                                <div className="relative" ref={!showEmpty ? dropdownRef : undefined}>
                                    <button
                                        onClick={() => setSiteOpen(!siteOpen)}
                                        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 bg-[var(--input-bg)] border border-[var(--card-border)] rounded-full px-3 py-1.5 transition-colors"
                                    >
                                        <Globe className="w-3 h-3" />
                                        <span className="max-w-[80px] truncate">{siteLabel}</span>
                                    </button>
                                    {siteOpen && gscSites.length > 0 && (
                                        <div className="absolute bottom-full mb-2 right-0 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
                                            {gscSites.map((site: any) => {
                                                const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                                const active = site.siteUrl === selectedSite;
                                                return (
                                                    <button key={site.siteUrl}
                                                        onClick={() => { setSelectedSite(site.siteUrl); setSiteOpen(false); }}
                                                        className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${active ? 'text-emerald-400 bg-emerald-500/[0.06]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {messages.length > 0 && (
                                    <button onClick={clearChat} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-600 hover:text-white hover:bg-[var(--card-hover)] transition-colors" title="New chat">
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || isLoading}
                                    className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-white enabled:text-black text-zinc-500 transition-all enabled:hover:bg-zinc-200"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
