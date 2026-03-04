'use client';

import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { Send, X, Sparkles, Minimize2, Maximize2, Coins, RotateCcw, ChevronDown, Globe } from 'lucide-react';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import ChatMessageRenderer from './ChatMessageRenderer';
import { buildSnapshot } from '@/lib/chatUtils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    tools?: { name: string; args: any; result?: string; structuredData?: any }[];
}

interface SiteOption {
    id: string;
    label: string;
    type: string;
}

const QUICK_PROMPTS = [
    '🎯 What is the ONE thing I should do today to grow?',
    '🚨 Why did my traffic drop?',
    '💰 Which pages are money pits? (high impressions, low clicks)',
    '📈 Keywords on page 2 I can push to page 1',
    '📝 Give me 5 blog post ideas based on my data',
    '📊 Grade my SEO (A-F)',
    '⚡ Are my Core Web Vitals hurting my rankings?',
    '🔮 Growth opportunities I am missing',
];

const THINKING_PHASES = [
    'Warming up brain cells...',
    'Scanning your data...',
    'Crunching the numbers...',
    'Connecting the dots...',
    'Hunting for insights...',
    'Downloading intelligence...',
    'Processing at light speed...',
    'Reading the data tea leaves...',
    'Asking the data gods...',
    'Decoding the matrix...',
];

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Digging through search data...',
    get_analytics_breakdown: 'Poking around your analytics...',
    run_page_audit: 'Running a health check on pages...',
    calculate_revenue_impact: 'Counting potential dollars...',
    generate_content_strategy: 'Cooking up content ideas...',
    analyze_keyword_clusters: 'Clustering your keywords...',
    compare_time_periods: 'Comparing time periods...',
    find_cannibalization: 'Checking for cannibalization...',
    suggest_internal_links: 'Finding linking opportunities...',
    generate_meta_tags: 'Crafting meta tags...',
};

// Simple markdown-ish renderer for bot responses
function renderMessage(text: string) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
        let processed = line;

        if (processed.startsWith('### ')) {
            elements.push(<h4 key={idx} className="text-sm font-bold text-emerald-300 mt-3 mb-1">{processed.slice(4)}</h4>);
            return;
        }
        if (processed.startsWith('## ')) {
            elements.push(<h3 key={idx} className="text-sm font-bold text-emerald-200 mt-4 mb-1">{processed.slice(3)}</h3>);
            return;
        }
        if (processed.startsWith('# ')) {
            elements.push(<h2 key={idx} className="text-base font-bold text-white mt-4 mb-2">{processed.slice(2)}</h2>);
            return;
        }

        if (processed.match(/^---+$/)) {
            elements.push(<hr key={idx} className="border-white/5 my-3" />);
            return;
        }

        if (!processed.trim()) {
            elements.push(<div key={idx} className="h-2" />);
            return;
        }

        processed = processed
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="bg-white/8 px-1 py-0.5 rounded text-emerald-300 text-[11px]">$1</code>');

        if (processed.match(/^[\-\*•]\s/)) {
            elements.push(
                <div key={idx} className="flex gap-2 pl-1 py-0.5">
                    <span className="text-emerald-500/70 flex-shrink-0 mt-0.5">•</span>
                    <span dangerouslySetInnerHTML={{ __html: processed.slice(2) }} />
                </div>
            );
            return;
        }

        const numMatch = processed.match(/^(\d+)\.\s(.+)/);
        if (numMatch) {
            elements.push(
                <div key={idx} className="flex gap-2 pl-1 py-0.5">
                    <span className="text-emerald-500/70 flex-shrink-0 font-mono text-xs w-5 text-right mt-0.5">{numMatch[1]}.</span>
                    <span dangerouslySetInnerHTML={{ __html: numMatch[2] }} />
                </div>
            );
            return;
        }

        elements.push(<p key={idx} className="py-0.5" dangerouslySetInnerHTML={{ __html: processed }} />);
    });

    return <>{elements}</>;
}

// Memoized message bubble — prevents re-rendering old messages when new chunks arrive
const MessageBubble = memo(function MessageBubble({ msg, isExpanded, isStreaming, snapshot, onSuggestionClick }: { msg: Message; isExpanded: boolean; isStreaming?: boolean; snapshot?: any; onSuggestionClick?: (s: string) => void }) {
    return (
        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${isExpanded ? 'max-w-[75%]' : 'max-w-[88%]'} rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-emerald-500/[0.08] text-emerald-100 border border-emerald-500/[0.12] rounded-br-sm'
                : 'bg-white/[0.02] text-zinc-300 border border-white/[0.06] rounded-bl-sm'
                }`}>
                {msg.role === 'assistant' ? (
                    <ChatMessageRenderer content={msg.content} tools={msg.tools} isStreaming={isStreaming} snapshot={snapshot} onSuggestionClick={onSuggestionClick} />
                ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
                <div className="text-[10px] text-zinc-700 mt-2 select-none">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        </div>
    );
});

// Fun animated robot thinking indicator
const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const [phase, setPhase] = useState(0);
    const [eyesClosed, setEyesClosed] = useState(false);

    useEffect(() => {
        const msgTimer = setInterval(() => setPhase(p => (p + 1) % THINKING_PHASES.length), 2500);
        const blinkTimer = setInterval(() => {
            setEyesClosed(true);
            setTimeout(() => setEyesClosed(false), 150);
        }, 3000);
        return () => { clearInterval(msgTimer); clearInterval(blinkTimer); };
    }, []);

    const message = activeTool ? (TOOL_LABELS[activeTool] || 'Running analysis...') : THINKING_PHASES[phase];

    return (
        <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] rounded-bl-sm">
                <div className="flex items-center gap-3">
                    {/* Cute robot */}
                    <div className="relative flex-shrink-0 w-8" style={{ height: 36 }}>
                        {/* Antenna tip */}
                        <div
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                            style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }}
                        />
                        {/* Antenna stem */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-px h-1 bg-emerald-500/40" />
                        {/* Head */}
                        <div className="absolute top-3 inset-x-0 bottom-0 rounded-lg bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center gap-2">
                            <div
                                className="rounded-full bg-emerald-400 transition-all duration-100"
                                style={{ width: 5, height: eyesClosed ? 1 : 5, boxShadow: '0 0 4px rgba(52,211,153,0.6)' }}
                            />
                            <div
                                className="rounded-full bg-cyan-400 transition-all duration-100"
                                style={{ width: 5, height: eyesClosed ? 1 : 5, boxShadow: '0 0 4px rgba(34,211,238,0.6)' }}
                            />
                        </div>
                    </div>
                    {/* Message + dots */}
                    <div className="min-w-0">
                        <span className="text-[12px] text-zinc-400 font-medium">{message}</span>
                        <div className="flex gap-1 mt-1.5">
                            {[0, 1, 2].map(i => (
                                <div
                                    key={i}
                                    className="w-1 h-1 rounded-full bg-emerald-400/60 animate-bounce"
                                    style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default function AIChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "👋 **Hey! I'm your AI Analyst.**\n\nI have your live analytics & SEO data loaded. Ask me anything — I give **verdicts**, not advice.\n\n*Select a website above, then ask away.*",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [credits, setCredits] = useState<number | null>(null);
    const [selectedChatSite, setSelectedChatSite] = useState('');
    const [showSiteDropdown, setShowSiteDropdown] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Self-sufficient data fetching: chatbot loads its own data for selected site ──
    const { hasGoogleConnection } = useContainerStatus();
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const { properties: ga4Properties } = usePropertyList(hasGoogleConnection);

    // Derive combined site list from SWR hooks
    const allSites = useMemo<SiteOption[]>(() => {
        const sites = Array.isArray(gscSites) ? gscSites : [];
        const properties = Array.isArray(ga4Properties) ? ga4Properties : [];
        return [
            ...sites.map((s: any) => ({ id: s.siteUrl, label: s.siteUrl.replace('sc-domain:', '').replace('https://', '').replace('http://', '').replace(/\/$/, ''), type: 'GSC' })),
            ...properties.filter((p: any) => !sites.some((s: any) => s.siteUrl.includes(p.displayName || p.property)))
                .map((p: any) => ({ id: p.property, label: p.displayName || p.property, type: 'GA4' })),
        ];
    }, [gscSites, ga4Properties]);

    // Auto-select first site when list loads
    useEffect(() => {
        if (allSites.length > 0 && !selectedChatSite) {
            setSelectedChatSite(allSites[0].id);
        }
    }, [allSites, selectedChatSite]);

    // Match selected GSC site to GA4 property (same logic as page.tsx)
    const matchedProperty = useMemo(() => {
        if (!selectedChatSite || ga4Properties.length === 0) return ga4Properties[0];
        const domain = selectedChatSite.replace('sc-domain:', '').replace('https://', '').replace('/', '');
        const domainRoot = domain.split('.')[0];
        return (
            ga4Properties.find((p: any) => p.displayName?.toLowerCase().includes(domain.toLowerCase())) ||
            ga4Properties.find((p: any) => (p.propertyId || p.property || '').toLowerCase().includes(domainRoot.toLowerCase())) ||
            ga4Properties.find((p: any) => p.displayName?.toLowerCase().includes(domainRoot.toLowerCase())) ||
            ga4Properties[0]
        );
    }, [selectedChatSite, ga4Properties]);

    // Fetch analytics & SEO data for the chatbot's selected site
    const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData('all', matchedProperty?.property, hasGoogleConnection && !!selectedChatSite);
    const { data: seoData, isLoading: seoLoading } = useSeoData('all', selectedChatSite, hasGoogleConnection && !!selectedChatSite);

    // Track whether data is ready for sending messages
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;

    // Build snapshot for chart rendering in messages
    const snapshot = useMemo(() => buildSnapshot(analyticsData, seoData), [analyticsData, seoData]);

    // ── Refs for stable callback access (avoids dependency-loop in useCallback) ──
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const inputRef2 = useRef(input);
    inputRef2.current = input;
    const isLoadingRef = useRef(isLoading);
    isLoadingRef.current = isLoading;
    const analyticsRef = useRef(analyticsData);
    analyticsRef.current = analyticsData;
    const seoRef = useRef(seoData);
    seoRef.current = seoData;
    const selectedSiteRef = useRef(selectedChatSite);
    selectedSiteRef.current = selectedChatSite;

    // ── Streaming batching: accumulate chunks and flush via rAF ──
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
            // Create a new last message object so React detects the change
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

    // Cleanup rAF on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) {
            if (isExpanded) {
                textareaRef.current?.focus();
            } else {
                inputRef.current?.focus();
            }
        }
    }, [isOpen, isExpanded]);

    // ── sendMessage: stable callback — reads from refs, no deps on messages/input/etc. ──
    const sendMessage = useCallback(async (text?: string, options?: { mode?: string }) => {
        const messageText = text || inputRef2.current.trim();
        if (!messageText || isLoadingRef.current) return;

        const currentAnalytics = analyticsRef.current;
        const currentSeo = seoRef.current;
        const currentMessages = messagesRef.current;
        const currentSite = selectedSiteRef.current;

        const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date(), tools: [] }]);
        setInput('');
        setIsLoading(true);

        try {
            // Only inject full data context on the first user message.
            // Subsequent messages use conversation history — Gemini remembers.
            const isFirstUserMessage = currentMessages.filter(m => m.role === 'user').length === 0;

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

            if (!res.ok) {
                if (res.status === 402) {
                    try {
                        const errorData = await res.json();
                        const creditMsg = errorData.response || `⚡ You've run out of messages! **1 credit = 1 message.**\n\nGet more to continue using TrafficClaw AI.`;
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { ...updated[updated.length - 1], content: creditMsg };
                            return updated;
                        });
                        if (errorData.credits !== undefined) setCredits(errorData.credits);
                    } catch {
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { ...updated[updated.length - 1], content: '⚡ **Out of messages!** Please purchase more to continue.' };
                            return updated;
                        });
                    }
                    setIsLoading(false);
                    return;
                }
                throw new Error('Failed to get response');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No readable stream available');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                // Keep the last partial line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;

                    try {
                        const data = JSON.parse(dataStr);

                        if (data.type === 'text') {
                            // Batched via rAF — no setState per chunk
                            appendStreamText(data.content);
                        } else if (data.type === 'tool_start') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = [...(last.tools || []), { name: data.name, args: data.args }];
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_result') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map(t =>
                                    t.name === data.name && !t.result ? { ...t, result: data.result || 'Done', structuredData: data.structuredData } : t
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'credits') {
                            setCredits(data.value);
                        } else if (data.type === 'error') {
                            appendStreamText(`\n\n⚠️ **Error:** ${data.message}`);
                        }
                    } catch {
                        // skip parse error
                    }
                }
            }

            // Flush any remaining buffered stream text
            if (streamBufferRef.current) {
                if (rafIdRef.current !== null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                }
                flushStreamBuffer();
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '⚠️ **Connection Error**\n\nCouldn\'t reach the AI service. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [appendStreamText, flushStreamBuffer]); // stable deps only

    // ── Stable ref for event listener — never re-adds ──
    const sendMessageRef = useRef(sendMessage);
    sendMessageRef.current = sendMessage;

    // ── Daily briefing: auto-send on first open of the day ──
    const briefingSentRef = useRef(false);

    useEffect(() => {
        if (!isOpen || briefingSentRef.current || !dataReady || isLoading) return;
        if (messages.length > 1) return; // Widget starts with 1 welcome message
        if (!analyticsData && !seoData) return; // Need actual data for briefing

        const today = new Date().toISOString().split('T')[0];
        const lastBriefing = localStorage.getItem('tc-last-briefing-date');
        if (lastBriefing === today) return;

        briefingSentRef.current = true;
        localStorage.setItem('tc-last-briefing-date', today);
        setTimeout(() => {
            sendMessageRef.current('Give me my morning briefing — what changed overnight and what should I focus on today?', { mode: 'briefing' });
        }, 500); // Small delay to let widget fully animate open
    }, [isOpen, dataReady, messages.length, isLoading, analyticsData, seoData]);

    // Listen for external "Ask AI" events (from Intelligence Center)
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const question = ce.detail?.question;
            if (question) {
                setIsOpen(true);
                setTimeout(() => {
                    sendMessageRef.current(question);
                }, 300);
            }
        };
        window.addEventListener('trafficclaw:ask-ai', handler);
        return () => window.removeEventListener('trafficclaw:ask-ai', handler);
    }, []); // empty deps — listener is added once, never thrashes

    const clearChat = useCallback(() => {
        setMessages([{
            role: 'assistant',
            content: "🔄 **Chat cleared.** What would you like to investigate?",
            timestamp: new Date(),
        }]);
    }, []);

    // ─── Floating button (closed state) ───
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 group"
            >
                <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-teal-400 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-110 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-black group-hover:rotate-12 transition-transform" />
                    </div>
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                </div>
            </button>
        );
    }

    const currentSiteLabel = allSites.find(s => s.id === selectedChatSite)?.label || 'Select website';
    const lastMsg = messages[messages.length - 1];
    const activeTool = isLoading ? lastMsg?.tools?.find(t => !t.result)?.name : undefined;

    // ─── Chat window ───
    return (
        <div className={`fixed z-50 ${isExpanded ? 'inset-4 lg:inset-8' : 'bottom-6 right-6 w-[440px] h-[640px]'} transition-all duration-300`}>
            <div className="w-full h-full bg-[#0a0a0f] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
                {/* ── Header ── */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-emerald-500/[0.04] to-cyan-500/[0.04]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center relative">
                            <Sparkles className="w-4 h-4 text-black" />
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[#0a0a0f]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white leading-none">AI Analyst</h3>
                            {/* Site selector inline */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5"
                                >
                                    <Globe className="w-2.5 h-2.5" />
                                    <span className="max-w-[120px] truncate">{currentSiteLabel}</span>
                                    <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showSiteDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showSiteDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowSiteDropdown(false)} />
                                        <div className="absolute left-0 top-full mt-1 z-50 bg-[#111116] border border-white/[0.08] rounded-lg shadow-2xl shadow-black/60 py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                                            {allSites.length === 0 ? (
                                                <div className="px-3 py-2 text-[11px] text-zinc-600">No sites connected</div>
                                            ) : (
                                                allSites.map(site => (
                                                    <button
                                                        key={site.id}
                                                        onClick={() => { setSelectedChatSite(site.id); setShowSiteDropdown(false); }}
                                                        className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition ${selectedChatSite === site.id
                                                            ? 'text-emerald-400 bg-emerald-500/[0.06]'
                                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                                                            }`}
                                                    >
                                                        <Globe className="w-3 h-3 flex-shrink-0" />
                                                        <span className="truncate">{site.label}</span>
                                                        <span className="ml-auto text-[9px] text-zinc-600">{site.type}</span>
                                                        {selectedChatSite === site.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" />}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {credits !== null && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/8 border border-amber-500/15 mr-1">
                                <Coins className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] font-bold text-amber-400">{credits}</span>
                            </div>
                        )}
                        <button onClick={clearChat} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors" title="Clear chat">
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors">
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Messages ── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                    {messages.map((msg, i) => {
                        if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                        const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                        return <MessageBubble key={i} msg={msg} isExpanded={isExpanded} isStreaming={isLastAssistant && isLoading} snapshot={snapshot} onSuggestionClick={(s) => sendMessage(s)} />;
                    })}

                    {/* Thinking indicator — cute robot with cycling messages */}
                    {isLoading && (!lastMsg?.content || activeTool) && (
                        <ThinkingIndicator activeTool={activeTool} />
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Quick Prompts ── */}
                {messages.length <= 2 && (
                    <div className="px-4 pb-2">
                        {!dataReady && (
                            <div className="text-[10px] text-zinc-600 mb-1.5 flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full border border-emerald-500/30 border-t-emerald-400 animate-spin" />
                                Loading your data...
                            </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(prompt)}
                                    disabled={!dataReady || isLoading}
                                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/[0.15] hover:bg-emerald-500/[0.03] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-500 disabled:hover:border-white/[0.04] disabled:hover:bg-white/[0.02]"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Input ── */}
                <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.01]">
                    <div className="flex items-center gap-2">
                        {isExpanded ? (
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                placeholder="Ask anything..."
                                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/20 transition resize-none min-h-[44px] max-h-[120px]"
                                disabled={isLoading}
                                rows={1}
                            />
                        ) : (
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Ask anything..."
                                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/20 transition"
                                disabled={isLoading}
                            />
                        )}
                        <button
                            onClick={() => sendMessage()}
                            disabled={isLoading || !input.trim()}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-black flex items-center justify-center hover:opacity-90 transition disabled:opacity-30 flex-shrink-0"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    {credits !== null && credits < 30 && (
                        <div className="mt-1.5 px-1">
                            <span className="text-[9px] text-amber-500/70 font-medium">Low messages: {credits}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
