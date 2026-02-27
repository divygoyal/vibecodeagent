'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Sparkles, Minimize2, Maximize2, Coins, RotateCcw, ChevronDown, Globe } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    tools?: { name: string; args: any; result?: string }[];
}

interface AIChatbotProps {
    analyticsData?: any;
    seoData?: any;
}

interface SiteOption {
    id: string;
    label: string;
    type: string;
}

const QUICK_PROMPTS = [
    '🔴 What is bleeding money?',
    '🎯 Striking distance keywords',
    '📊 Grade my SEO (A-F)',
    '💰 Missed revenue',
    '📱 Mobile vs desktop',
    '🔮 Growth opportunities',
];

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

export default function AIChatbot({ analyticsData, seoData }: AIChatbotProps) {
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
    const [allSites, setAllSites] = useState<SiteOption[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch available sites on mount (plain fetch, no SWR dependency)
    useEffect(() => {
        async function loadSites() {
            try {
                const [sitesRes, propsRes] = await Promise.all([
                    fetch('/api/seo?mode=list').then(r => r.ok ? r.json() : []).catch(() => []),
                    fetch('/api/analytics?mode=list').then(r => r.ok ? r.json() : []).catch(() => []),
                ]);
                const sites = Array.isArray(sitesRes) ? sitesRes : [];
                const properties = Array.isArray(propsRes) ? propsRes : [];
                const combined: SiteOption[] = [
                    ...sites.map((s: any) => ({ id: s.siteUrl, label: s.siteUrl.replace('sc-domain:', '').replace('https://', '').replace('http://', '').replace(/\/$/, ''), type: 'GSC' })),
                    ...properties.filter((p: any) => !sites.some((s: any) => s.siteUrl.includes(p.displayName || p.property)))
                        .map((p: any) => ({ id: p.property, label: p.displayName || p.property, type: 'GA4' })),
                ];
                setAllSites(combined);
                if (combined.length > 0) setSelectedChatSite(prev => prev || combined[0].id);
            } catch { /* silent */ }
        }
        loadSites();
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

    const sendMessage = useCallback(async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date(), tools: [] }]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: selectedChatSite,
                    analyticsContext: analyticsData ? {
                        kpis: analyticsData.kpis,
                        topSources: analyticsData.sources?.slice(0, 15),
                        topPages: analyticsData.pages?.slice(0, 20),
                        topCountries: analyticsData.countries?.slice(0, 15),
                        devices: analyticsData.devices,
                        browsers: analyticsData.browsers?.slice(0, 10),
                        channels: analyticsData.channels?.slice(0, 10),
                        referrers: analyticsData.referrers?.slice(0, 15),
                        cities: analyticsData.cities?.slice(0, 12),
                        languages: analyticsData.languages?.slice(0, 8),
                        entryPages: analyticsData.entryPages?.slice(0, 10),
                        operatingSystems: analyticsData.operatingSystems?.slice(0, 5),
                    } : null,
                    seoContext: seoData ? {
                        kpis: seoData.kpis,
                        topQueries: seoData.queries?.slice(0, 25),
                        topPages: seoData.pages?.slice(0, 15),
                        recommendations: seoData.recommendations,
                        trend: seoData.trend?.slice(-14),
                    } : null,
                    history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!res.ok) {
                // Handle credit exhaustion (402) specially
                if (res.status === 402) {
                    try {
                        const errorData = await res.json();
                        const creditMsg = errorData.response || `⚡ You've run out of credits! Each AI analysis costs **10 credits**.\n\n🛒 **Get more credits** to continue using TrafficClaw AI.`;
                        setMessages(prev => {
                            const newMessages = [...prev];
                            const last = newMessages[newMessages.length - 1];
                            last.content = creditMsg;
                            return newMessages;
                        });
                        if (errorData.credits !== undefined) setCredits(errorData.credits);
                    } catch {
                        setMessages(prev => {
                            const newMessages = [...prev];
                            const last = newMessages[newMessages.length - 1];
                            last.content = '⚡ **Out of credits!** Please purchase more credits to continue.';
                            return newMessages;
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

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;

                        try {
                            const data = JSON.parse(dataStr);

                            if (data.type === 'text') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const last = newMessages[newMessages.length - 1];
                                    last.content += data.content;
                                    return newMessages;
                                });
                            } else if (data.type === 'tool_start') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const last = newMessages[newMessages.length - 1];
                                    if (!last.tools) last.tools = [];
                                    last.tools.push({ name: data.name, args: data.args });
                                    return newMessages;
                                });
                            } else if (data.type === 'tool_result') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const last = newMessages[newMessages.length - 1];
                                    const tool = last.tools?.find(t => t.name === data.name && !t.result);
                                    if (tool) {
                                        tool.result = data.result || 'Done';
                                    }
                                    return newMessages;
                                });
                            } else if (data.type === 'credits') {
                                setCredits(data.value);
                            } else if (data.type === 'error') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const last = newMessages[newMessages.length - 1];
                                    last.content += `\n\n⚠️ **Error:** ${data.message}`;
                                    return newMessages;
                                });
                            }
                        } catch (e) {
                            // skip parse error
                        }
                    }
                }
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
    }, [input, isLoading, analyticsData, seoData, messages, selectedChatSite]);

    const clearChat = () => {
        setMessages([{
            role: 'assistant',
            content: "🔄 **Chat cleared.** What would you like to investigate?",
            timestamp: new Date(),
        }]);
    };

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
                        // Skip rendering empty assistant placeholder messages
                        if (msg.role === 'assistant' && !msg.content && (!msg.tools || msg.tools.length === 0)) return null;
                        return (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`${isExpanded ? 'max-w-[75%]' : 'max-w-[88%]'} rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-emerald-500/[0.08] text-emerald-100 border border-emerald-500/[0.12] rounded-br-sm'
                                    : 'bg-white/[0.02] text-zinc-300 border border-white/[0.06] rounded-bl-sm'
                                    }`}>
                                    {msg.role === 'assistant' ? (
                                        <div className="space-y-1 text-[13px]">
                                            <div className="space-y-0.5">{renderMessage(msg.content)}</div>
                                        </div>
                                    ) : (
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                    )}
                                    <div className="text-[10px] text-zinc-700 mt-2 select-none">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* ChatGPT/Gemini-style thinking indicator */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex items-center gap-2 px-3 py-2">
                                <div className="relative w-5 h-5">
                                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                                </div>
                                <span className="text-[12px] text-zinc-500 animate-pulse">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Quick Prompts ── */}
                {messages.length <= 2 && (
                    <div className="px-4 pb-2">
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(prompt)}
                                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/[0.15] hover:bg-emerald-500/[0.03] transition-all"
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
                            <span className="text-[9px] text-amber-500/70 font-medium">Low credits: {credits}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
