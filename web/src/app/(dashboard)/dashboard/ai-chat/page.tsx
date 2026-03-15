'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    Send, Sparkles, RotateCcw, Globe, ChevronDown,
    MessageSquare, Zap, Target, TrendingUp, Brain,
    Loader2, ArrowUp, Bot, User, Search, BarChart3, Shield
} from 'lucide-react';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';

const STARTER_PROMPTS = [
    { icon: Target, text: 'What is the ONE thing I should do today to grow?', color: 'emerald', tag: 'Growth' },
    { icon: TrendingUp, text: 'Which keywords can I push to page 1?', color: 'cyan', tag: 'Keywords' },
    { icon: Zap, text: 'Find me quick wins — low CTR, high impressions', color: 'amber', tag: 'Quick Wins' },
    { icon: Brain, text: 'Grade my SEO from A to F with a full breakdown', color: 'violet', tag: 'Audit' },
    { icon: Search, text: 'Why did my traffic drop recently?', color: 'rose', tag: 'Diagnosis' },
    { icon: BarChart3, text: 'Show me my top performing pages and why they work', color: 'blue', tag: 'Analysis' },
];

const THINKING_PHASES = [
    { text: 'Analyzing your data...', icon: '📊' },
    { text: 'Scanning search performance...', icon: '🔍' },
    { text: 'Crunching the numbers...', icon: '⚡' },
    { text: 'Connecting the dots...', icon: '🧠' },
    { text: 'Hunting for insights...', icon: '🎯' },
    { text: 'Almost there...', icon: '✨' },
];

const TOOL_LABELS: Record<string, { text: string; icon: string }> = {
    get_search_performance: { text: 'Pulling search data...', icon: '🔍' },
    get_analytics_breakdown: { text: 'Analyzing traffic...', icon: '📈' },
    run_page_audit: { text: 'Auditing page...', icon: '🛡️' },
    calculate_revenue_impact: { text: 'Calculating revenue...', icon: '💰' },
    generate_content_strategy: { text: 'Building strategy...', icon: '📝' },
    analyze_keyword_clusters: { text: 'Clustering keywords...', icon: '🏷️' },
    compare_time_periods: { text: 'Comparing periods...', icon: '📅' },
    find_cannibalization: { text: 'Detecting cannibalization...', icon: '⚠️' },
    suggest_internal_links: { text: 'Finding link opportunities...', icon: '🔗' },
    generate_meta_tags: { text: 'Generating meta tags...', icon: '🏷️' },
};

/* ─── Thinking Indicator ─── */
const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const [phase, setPhase] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setPhase(p => (p + 1) % THINKING_PHASES.length), 2500);
        return () => clearInterval(timer);
    }, []);

    const toolInfo = activeTool ? TOOL_LABELS[activeTool] : null;
    const message = toolInfo?.text || THINKING_PHASES[phase].text;
    const icon = toolInfo?.icon || THINKING_PHASES[phase].icon;

    return (
        <div className="flex gap-3 items-start">
            <div className="flex-shrink-0 mt-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Bot className="w-4 h-4 text-white" />
                </div>
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[13px] text-zinc-400 font-medium">{message}</span>
                </div>
                <div className="flex gap-1 mt-2">
                    {[0, 1, 2].map(i => (
                        <div key={i}
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                            style={{
                                animation: 'pulse-dot 1.4s ease-in-out infinite',
                                animationDelay: `${i * 200}ms`,
                            }}
                        />
                    ))}
                </div>
            </div>
            <style jsx>{`
                @keyframes pulse-dot {
                    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
});

/* ─── Time formatter ─── */
function formatTime(ts?: string) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
                            ? '\n\n**Request timed out.** The AI took too long to respond. Try a simpler question or try again.'
                            : '\n\n**Connection Error.** Couldn\'t reach the AI service. Please try again.'),
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
        if (!analyticsData && !seoData) return;

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
        <div className="flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] bg-[#08080c]">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] bg-[#0a0a10]/90 backdrop-blur-xl flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a10]" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white tracking-tight">AI Analyst</h1>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                            <span className="inline-block w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                            Powered by your live data
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Site Selector */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                            className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] text-white text-xs rounded-xl px-3.5 py-2 hover:border-white/[0.15] hover:bg-white/[0.06] transition-all min-w-[180px]"
                        >
                            <Globe className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="truncate flex-1 text-left text-zinc-300">{siteLabel}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {siteDropdownOpen && gscSites.length > 0 && (
                            <div className="absolute right-0 top-full mt-2 z-50 bg-[#111118] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 py-1.5 min-w-[240px] max-h-[260px] overflow-y-auto">
                                {gscSites.map((site: any) => {
                                    const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                    const isSelected = site.siteUrl === selectedSite;
                                    return (
                                        <button key={site.siteUrl}
                                            onClick={() => { setSelectedSite(site.siteUrl); setSiteDropdownOpen(false); }}
                                            className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2.5 transition-all ${isSelected ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}
                                        >
                                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span className="truncate">{label}</span>
                                            {isSelected && <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 ml-auto" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {messages.length > 0 && (
                        <button onClick={clearChat} className="p-2 rounded-xl hover:bg-white/[0.06] text-zinc-500 hover:text-white transition-all" title="New chat">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Messages Area ── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5 hover:scrollbar-thumb-white/10">
                {showEmpty ? (
                    /* ── Empty State ── */
                    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                        <div className="relative mb-8">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10 flex items-center justify-center">
                                <Bot className="w-10 h-10 text-emerald-400" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <Sparkles className="w-3.5 h-3.5 text-white" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">What can I help with?</h2>
                        <p className="text-sm text-zinc-500 text-center max-w-md mb-10 leading-relaxed">
                            Your live analytics data is loaded. I give <span className="text-emerald-400 font-semibold">specific verdicts</span> with revenue impact — not generic advice.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
                            {STARTER_PROMPTS.map((prompt, i) => {
                                const Icon = prompt.icon;
                                const colorMap: Record<string, string> = {
                                    emerald: 'group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.04] group-hover:shadow-emerald-500/5',
                                    cyan: 'group-hover:border-cyan-500/30 group-hover:bg-cyan-500/[0.04] group-hover:shadow-cyan-500/5',
                                    amber: 'group-hover:border-amber-500/30 group-hover:bg-amber-500/[0.04] group-hover:shadow-amber-500/5',
                                    violet: 'group-hover:border-violet-500/30 group-hover:bg-violet-500/[0.04] group-hover:shadow-violet-500/5',
                                    rose: 'group-hover:border-rose-500/30 group-hover:bg-rose-500/[0.04] group-hover:shadow-rose-500/5',
                                    blue: 'group-hover:border-blue-500/30 group-hover:bg-blue-500/[0.04] group-hover:shadow-blue-500/5',
                                };
                                const iconColorMap: Record<string, string> = {
                                    emerald: 'text-emerald-400 bg-emerald-500/10', cyan: 'text-cyan-400 bg-cyan-500/10',
                                    amber: 'text-amber-400 bg-amber-500/10', violet: 'text-violet-400 bg-violet-500/10',
                                    rose: 'text-rose-400 bg-rose-500/10', blue: 'text-blue-400 bg-blue-500/10',
                                };
                                const tagColorMap: Record<string, string> = {
                                    emerald: 'text-emerald-500 bg-emerald-500/10', cyan: 'text-cyan-500 bg-cyan-500/10',
                                    amber: 'text-amber-500 bg-amber-500/10', violet: 'text-violet-500 bg-violet-500/10',
                                    rose: 'text-rose-500 bg-rose-500/10', blue: 'text-blue-500 bg-blue-500/10',
                                };
                                return (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(prompt.text)}
                                        disabled={isLoading || !dataReady}
                                        className={`group flex flex-col gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] ${colorMap[prompt.color]} transition-all duration-200 text-left disabled:opacity-40 shadow-lg shadow-black/20 hover:shadow-xl`}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <div className={`w-8 h-8 rounded-lg ${iconColorMap[prompt.color]} flex items-center justify-center`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tagColorMap[prompt.color]}`}>{prompt.tag}</span>
                                        </div>
                                        <span className="text-xs text-zinc-300 leading-relaxed">{prompt.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {!dataReady && hasGoogleConnection && (
                            <div className="flex items-center gap-2.5 mt-8 text-xs text-zinc-500 bg-zinc-900/50 rounded-full px-4 py-2 border border-zinc-800">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                Loading your analytics data...
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── Chat Messages ── */
                    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-6">
                        {messages.map((msg, i) => {
                            if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                            const isUser = msg.role === 'user';

                            return (
                                <div key={i} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                                    {/* Avatar */}
                                    <div className="flex-shrink-0 mt-1">
                                        {isUser ? (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                                                <User className="w-4 h-4 text-white" />
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                <Bot className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Message */}
                                    <div className={`min-w-0 ${isUser ? 'max-w-[75%]' : 'max-w-[85%] flex-1'}`}>
                                        {/* Name + time */}
                                        <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'justify-end' : ''}`}>
                                            <span className="text-[11px] font-semibold text-zinc-500">{isUser ? 'You' : 'AI Analyst'}</span>
                                            <span className="text-[10px] text-zinc-600">{formatTime(msg.timestamp)}</span>
                                        </div>

                                        <div className={`rounded-2xl px-5 py-4 text-sm leading-relaxed ${isUser
                                            ? 'bg-gradient-to-br from-emerald-500/[0.12] to-cyan-500/[0.06] text-emerald-50 border border-emerald-500/[0.15] rounded-tr-sm'
                                            : 'bg-zinc-900/60 text-zinc-300 border border-zinc-800/60 rounded-tl-sm'
                                        }`}>
                                            {msg.role === 'assistant' ? (
                                                <ChatMessageRenderer content={msg.content} tools={msg.tools} isStreaming={isLastAssistant && isLoading} snapshot={snapshot} onSuggestionClick={(s) => sendMessage(s)} />
                                            ) : (
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                            )}
                                        </div>
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

            {/* ── Input Area ── */}
            <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#0a0a10]/90 backdrop-blur-xl px-4 sm:px-6 py-4">
                <div className="max-w-3xl mx-auto">
                    <div className="relative flex items-end gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl px-4 py-3 focus-within:border-emerald-500/30 focus-within:shadow-lg focus-within:shadow-emerald-500/5 transition-all duration-200">
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
                            className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white transition-all flex-shrink-0 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
                        >
                            <ArrowUp className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-[10px] text-zinc-600 text-center mt-2.5">
                        Analyzing your live Google Analytics & Search Console data
                    </p>
                </div>
            </div>
        </div>
    );
}
