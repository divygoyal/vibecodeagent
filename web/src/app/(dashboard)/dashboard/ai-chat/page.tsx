'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    AlertTriangle, Globe, ChevronDown, Loader2, ArrowUp, RotateCcw, Search, Sparkles, Target, TrendingDown, Lock
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DemoModeBanner from '@/components/DemoModeBanner';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';

type DashboardSiteOption = {
    siteUrl: string;
};

type DashboardPropertyOption = {
    displayName?: string;
    propertyId?: string;
    property?: string;
};

type SignalChip = {
    label: string;
    prompt: string;
    mode?: 'briefing';
    icon: LucideIcon;
    tone: 'amber' | 'cyan' | 'emerald';
};

const BRIEFING_PROMPT = 'Give me my morning briefing — what changed overnight and what should I focus on today?';

const SIGNAL_CHIPS: SignalChip[] = [
    {
        label: 'Traffic anomaly detected',
        prompt: BRIEFING_PROMPT,
        mode: 'briefing',
        icon: AlertTriangle,
        tone: 'amber',
    },
    {
        label: 'Pages lost conversions',
        prompt: 'Which pages lost conversions recently, and what changed on them?',
        icon: TrendingDown,
        tone: 'cyan',
    },
    {
        label: 'Best opportunities this month',
        prompt: 'What should I fix first this month to grow traffic faster?',
        icon: Target,
        tone: 'emerald',
    },
] as const;

const PROMPT_GROUPS = [
    {
        title: 'Understand performance',
        prompts: [
            'Why did traffic drop?',
            'What changed this month?',
            'Which channels underperform?',
        ],
    },
    {
        title: 'Find opportunities',
        prompts: [
            'Top conversion leaks',
            'Best pages to improve',
            'Where can I grow fastest?',
        ],
    },
] as const;

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Searching your data',
    run_ga4_report: 'Querying analytics',
    run_page_audit: 'Running audit',
    calculate_revenue_impact: 'Calculating revenue',
    generate_content_strategy: 'Building strategy',
    analyze_keyword_clusters: 'Clustering keywords',
    compare_time_periods: 'Comparing periods',
    find_cannibalization: 'Checking cannibalization',
    suggest_internal_links: 'Finding links',
    generate_meta_tags: 'Generating tags',
    run_realtime_report: 'Checking live visitors',
    get_custom_dimensions: 'Loading custom tracking',
    list_user_repos: 'Listing GitHub repos',
    get_repo_health: 'Checking repo health',
    search_repo_code: 'Searching code',
    get_recent_commits: 'Reading recent commits',
    get_pull_requests: 'Reviewing pull requests',
    get_repo_issues: 'Checking GitHub issues',
    get_workflow_runs: 'Checking CI runs',
    get_file_contents: 'Reading file from GitHub',
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
    const {
        selectedSite,
        setSelectedSite,
        hasGa4Properties,
        propertyInventoryLoading,
    } = useRegistration();
    const { hasGoogleConnection } = useContainerStatus();
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const { properties: ga4Properties } = usePropertyList(hasGoogleConnection);

    const normalizedSites = useMemo(
        () => (Array.isArray(gscSites) ? (gscSites as DashboardSiteOption[]) : []),
        [gscSites],
    );
    const normalizedProperties = useMemo(
        () => (Array.isArray(ga4Properties) ? (ga4Properties as DashboardPropertyOption[]) : []),
        [ga4Properties],
    );

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
        if (!selectedSite || normalizedProperties.length === 0) return normalizedProperties[0];
        const domain = selectedSite.replace('sc-domain:', '').replace('https://', '').replace('/', '');
        const domainRoot = domain.split('.')[0];
        return (
            normalizedProperties.find((property) => property.displayName?.toLowerCase().includes(domain.toLowerCase())) ||
            normalizedProperties.find((property) => (property.propertyId || property.property || '').toLowerCase().includes(domainRoot.toLowerCase())) ||
            normalizedProperties.find((property) => property.displayName?.toLowerCase().includes(domainRoot.toLowerCase())) ||
            normalizedProperties[0]
        );
    }, [normalizedProperties, selectedSite]);

    const { data: analyticsData } = useAnalyticsData('all', matchedProperty?.property, hasGoogleConnection && !!selectedSite);
    const { data: seoData } = useSeoData('all', selectedSite, hasGoogleConnection && !!selectedSite);
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;
    const snapshot = useMemo(() => buildSnapshot(analyticsData, seoData), [analyticsData, seoData]);
    const showGa4LockedState = !propertyInventoryLoading && !hasGa4Properties;

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
    }, [setMessages]);

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
                if (res.status === 402 || res.status === 409) {
                    const errorData = await res.json().catch(() => ({}));
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: errorData.response || (res.status === 402
                                ? "You've run out of messages. Get more credits to continue."
                                : 'AI Chat is unavailable because this account does not have any Google Analytics property connected yet.')
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
        } catch (err: unknown) {
            const isTimeout =
                (err instanceof DOMException && err.name === 'AbortError') ||
                (err instanceof Error && err.name === 'AbortError');
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
    }, [appendStreamText, flushStreamBuffer, input, isLoading, setMessages]);

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

    if (showGa4LockedState) {
        return (
            <div className="space-y-6">
                <DemoModeBanner
                    title="AI Chat Unavailable"
                    badgeLabel="GA4 Required"
                    description="AI Chat is unavailable because this account does not have any Google Analytics property connected yet."
                    secondaryDescription="Connect a different Google account or create a GA4 property to use AI Chat with your own analytics data."
                />
                <div className="rounded-[28px] border border-white/[0.08] bg-[#05070a] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
                    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.04]">
                            <Lock className="h-7 w-7 text-amber-300" />
                        </div>
                        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Connect GA4 to unlock AI Chat</h1>
                        <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-400">
                            TrafficClaw AI needs a real Google Analytics property before it can answer questions, inspect conversion leaks, or generate action plans from your own numbers.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] bg-black">

            {/* ── Messages / Empty State ── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                {showEmpty ? (
                    <div className="flex min-h-full items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
                        <section className="relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#03070c] px-5 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.38)] sm:px-8 sm:py-10 lg:px-10">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
                            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(rgba(34,211,238,0.16) 1px, transparent 1px)', backgroundSize: '18px 18px', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95), rgba(0,0,0,0.15))' }} />
                            <div className="pointer-events-none absolute inset-x-0 top-[26%] h-px bg-[linear-gradient(90deg,transparent,rgba(52,211,153,0.18),transparent)]" />
                            <div className="pointer-events-none absolute inset-x-0 top-[38%] h-[120px] bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.18),transparent_65%)] blur-3xl" />

                            <div className="relative">
                                <div className="flex justify-center">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
                                        <Sparkles className="h-4 w-4 text-emerald-300" />
                                        AI Analytics Copilot
                                    </div>
                                </div>

                                <div className="mx-auto mt-6 max-w-3xl text-center">
                                    <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.02]">
                                        Ask anything about your traffic
                                    </h1>
                                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                                        Get instant answers on sessions, channels, landing pages, conversion drops,
                                        and growth opportunities from your analytics and search data.
                                    </p>
                                </div>

                                <div className="mt-7 flex flex-wrap justify-center gap-3">
                                    {SIGNAL_CHIPS.map((chip) => {
                                        const Icon = chip.icon;
                                        const chipTone =
                                            chip.tone === 'amber'
                                                ? 'border-amber-500/20 bg-amber-500/[0.08] text-amber-100'
                                                : chip.tone === 'cyan'
                                                    ? 'border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-100'
                                                    : 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-100';

                                        return (
                                            <button
                                                key={chip.label}
                                                type="button"
                                                onClick={() => sendMessage(chip.prompt, chip.mode ? { mode: chip.mode } : undefined)}
                                                disabled={isLoading || !dataReady}
                                                className={`inline-flex min-h-[44px] items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition-all hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white disabled:opacity-40 ${chipTone}`}
                                            >
                                                <Icon className="h-4 w-4" />
                                                <span>{chip.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mx-auto mt-8 w-full max-w-4xl">
                                    <div className="absolute left-1/2 mt-6 h-16 w-[75%] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.12),rgba(52,211,153,0.14),rgba(34,211,238,0.08))] blur-2xl" />
                                    <div className="relative rounded-[28px] border border-white/[0.08] bg-[#05090e]/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
                                        <div className="flex items-center gap-3 rounded-[22px] border border-white/[0.06] bg-[#0a0f14] px-4 py-4 sm:px-5">
                                            <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                                            <textarea
                                                ref={textareaRef}
                                                value={input}
                                                onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Ask why traffic dropped, which pages leak conversions, or what to fix first..."
                                                disabled={isLoading || !dataReady}
                                                rows={1}
                                                className="min-h-[28px] flex-1 bg-transparent text-[15px] leading-relaxed text-white placeholder-zinc-500 outline-none resize-none max-h-40 disabled:opacity-40"
                                            />
                                            <div className="flex items-center gap-2 pl-2">
                                                <div className="relative" ref={dropdownRef}>
                                                    <button
                                                        onClick={() => setSiteOpen(!siteOpen)}
                                                        className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-zinc-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06]"
                                                    >
                                                        <Globe className="h-3.5 w-3.5 text-cyan-300" />
                                                        <span className="max-w-[120px] truncate">{siteLabel}</span>
                                                        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${siteOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {siteOpen && normalizedSites.length > 0 && (
                                                        <div className="absolute bottom-full right-0 z-50 mb-2 max-h-[260px] min-w-[220px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#11161c] py-1 shadow-2xl shadow-black/70">
                                                            {normalizedSites.map((site) => {
                                                                const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                                                const active = site.siteUrl === selectedSite;
                                                                return (
                                                                    <button
                                                                        key={site.siteUrl}
                                                                        onClick={() => { setSelectedSite(site.siteUrl); setSiteOpen(false); }}
                                                                        className={`w-full px-4 py-2.5 text-left text-xs transition-colors ${
                                                                            active
                                                                                ? 'bg-emerald-500/[0.08] text-emerald-300'
                                                                                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                                                                        }`}
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
                                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-700 text-zinc-500 transition-all enabled:bg-[linear-gradient(135deg,#34e1a3_0%,#22d3ee_100%)] enabled:text-[#031014] enabled:shadow-[0_10px_30px_rgba(52,225,163,0.24)] enabled:hover:brightness-105"
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mx-auto mt-8 grid max-w-4xl gap-4 lg:grid-cols-2">
                                    {PROMPT_GROUPS.map((group) => (
                                        <div key={group.title} className="rounded-[24px] border border-white/[0.08] bg-[#070c11]/90 p-4">
                                            <div className="text-sm font-medium text-zinc-300">{group.title}</div>
                                            <div className="mt-4 space-y-2">
                                                {group.prompts.map((prompt) => (
                                                    <button
                                                        key={prompt}
                                                        type="button"
                                                        onClick={() => sendMessage(prompt)}
                                                        disabled={isLoading || !dataReady}
                                                        className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0b1015] px-4 text-left text-sm text-zinc-200 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
                                                    >
                                                        <span>{prompt}</span>
                                                        <span className="text-zinc-500">›</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {!dataReady && hasGoogleConnection && (
                                    <div className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-500">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading your analytics and search data...
                                    </div>
                                )}
                            </div>
                        </section>
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
                                    <div className="max-w-[80%] bg-[#1a1a1a] text-white text-[15px] rounded-3xl px-5 py-3 leading-relaxed">
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
                <div className="flex-shrink-0 bg-black px-4 sm:px-6 pb-5 pt-2">
                    <div className="max-w-[760px] mx-auto">
                        <div className="flex items-center bg-[#1a1a1a] rounded-2xl px-5 py-3 border border-transparent focus-within:border-white/[0.08] focus-within:bg-[#1e1e1e] transition-all">
                            <textarea
                                value={input}
                                onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about traffic, pages, channels, or conversions"
                                disabled={isLoading}
                                rows={1}
                                className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-600 outline-none resize-none max-h-40 leading-relaxed"
                            />
                            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                {/* Site pill */}
                                <div className="relative" ref={!showEmpty ? dropdownRef : undefined}>
                                    <button
                                        onClick={() => setSiteOpen(!siteOpen)}
                                        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 bg-zinc-800 rounded-full px-3 py-1.5 transition-colors"
                                    >
                                        <Globe className="w-3 h-3" />
                                        <span className="max-w-[80px] truncate">{siteLabel}</span>
                                    </button>
                                    {siteOpen && normalizedSites.length > 0 && (
                                        <div className="absolute bottom-full mb-2 right-0 z-50 bg-[#1a1a1a] border border-zinc-800 rounded-xl shadow-2xl shadow-black/80 py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
                                            {normalizedSites.map((site) => {
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
                                    <button onClick={clearChat} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors" title="New chat">
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
