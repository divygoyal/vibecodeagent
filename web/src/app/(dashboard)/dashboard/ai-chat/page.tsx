'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
    Globe, ChevronDown, Loader2, ArrowUp, RotateCcw, Sparkles, Lock, Github
} from 'lucide-react';
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

type Suggestion = { label: string; prompt: string };

const SUGGESTIONS: readonly Suggestion[] = [
    { label: 'Why did my traffic drop?', prompt: 'Why did my traffic drop recently? Pinpoint the date, the affected pages, and the most likely cause.' },
    { label: 'Top SEO issues', prompt: 'Find the biggest SEO issues hurting my traffic right now and rank them by revenue impact.' },
    { label: 'Best opportunities', prompt: 'What should I fix first this month to grow traffic faster?' },
    { label: 'Content ideas', prompt: 'Suggest 5 content ideas based on my existing keywords and gaps in my site.' },
] as const;

type ConnectorName = 'github' | 'wordpress' | 'vercel' | 'ga4' | 'gsc';

const CONNECTOR_LABELS: Record<ConnectorName, string> = {
    github: 'GitHub',
    wordpress: 'WordPress',
    vercel: 'Vercel',
    ga4: 'Google Analytics',
    gsc: 'Search Console',
};

function ConnectorIcon({ name, className = 'h-4 w-4' }: { name: ConnectorName; className?: string }) {
    switch (name) {
        case 'github':
            return <Github className={className} />;
        case 'wordpress':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M3 12a9 9 0 0 0 5.2 8.15L4.6 9.65A8.96 8.96 0 0 0 3 12Z" fill="currentColor" />
                    <path d="M19.6 7.7a8.96 8.96 0 0 1 .9 8.7l-3.6-9.85a4 4 0 0 1 2.7 1.15Z" fill="currentColor" opacity="0.85" />
                    <path d="M11 4.4 14 13l-1.7 5.4a9 9 0 0 0 5.6-2.1L13.4 4.5l-2.4-.1Z" fill="currentColor" opacity="0.7" />
                </svg>
            );
        case 'vercel':
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M12 3 22 20H2L12 3Z" />
                </svg>
            );
        case 'ga4':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <rect x="4" y="11" width="4" height="9" rx="1.5" fill="#F9AB00" />
                    <rect x="10" y="7" width="4" height="13" rx="1.5" fill="#F9AB00" opacity="0.85" />
                    <rect x="16" y="3" width="4" height="17" rx="1.5" fill="#E37400" />
                </svg>
            );
        case 'gsc':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="14.5" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m16 15.5 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            );
    }
}

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
    const { hasGoogleConnection, hasGithubConnection } = useContainerStatus();
    const { data: session } = useSession();
    const firstName = useMemo(() => session?.user?.name?.trim().split(/\s+/)[0] ?? '', [session?.user?.name]);
    const timeOfDay = useMemo(() => {
        const h = new Date().getHours();
        return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    }, []);

    const connectors: { name: ConnectorName; connected: boolean }[] = useMemo(() => ([
        { name: 'github', connected: hasGithubConnection },
        { name: 'wordpress', connected: false },
        { name: 'vercel', connected: false },
        { name: 'ga4', connected: hasGoogleConnection },
        { name: 'gsc', connected: hasGoogleConnection },
    ]), [hasGithubConnection, hasGoogleConnection]);
    const connectedCount = useMemo(() => connectors.filter(c => c.connected).length, [connectors]);
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
                    <div className="relative min-h-full overflow-hidden bg-[#050608]">
                        {/* Single soft radial — barely visible, gives the input area "weight" */}
                        <div aria-hidden className="pointer-events-none absolute inset-0">
                            <div className="absolute left-1/2 top-[52%] h-[520px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,217,218,0.07),transparent_65%)] blur-3xl" />
                            <div className="absolute left-1/2 top-[52%] h-[280px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.04),transparent_70%)] blur-2xl" />
                        </div>

                        {/* Connector status — small icon cluster with count, top-right */}
                        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
                            <div className="flex items-center gap-2.5">
                                <span className="hidden text-[11px] text-zinc-500 sm:inline">
                                    {connectedCount} of {connectors.length} sources connected
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {connectors.map((c) => {
                                        const tooltip = `${CONNECTOR_LABELS[c.name]} · ${c.connected ? 'Connected' : 'Click to connect'}`;
                                        const inner = (
                                            <>
                                                <ConnectorIcon name={c.name} className={`h-4 w-4 ${c.connected ? 'text-zinc-200' : 'text-zinc-500'}`} />
                                                <span
                                                    aria-hidden
                                                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${c.connected ? 'bg-emerald-400' : 'bg-zinc-700'}`}
                                                />
                                            </>
                                        );
                                        const base = 'relative flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-[#0a0d12] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors';
                                        return c.connected ? (
                                            <div key={c.name} className={`${base} cursor-default`} title={tooltip}>
                                                {inner}
                                            </div>
                                        ) : (
                                            <Link
                                                key={c.name}
                                                href="/dashboard/settings"
                                                className={`${base} hover:border-white/[0.14] hover:bg-[#0e1218]`}
                                                title={tooltip}
                                                aria-label={tooltip}
                                            >
                                                {inner}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Centered hero */}
                        <div className="relative flex min-h-full flex-col items-center justify-center px-4 pb-16 pt-24 sm:px-8 sm:pt-20">
                            <div className="text-center">
                                {firstName && (
                                    <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                                        Good {timeOfDay}, {firstName}
                                    </div>
                                )}
                                <h1 className="text-[34px] font-semibold tracking-tight text-zinc-100 sm:text-[42px]">
                                    How can I help today?
                                </h1>
                            </div>

                            {/* The hero input — elevated, weighted, distinctly highlighted */}
                            <div className="mt-10 w-full max-w-3xl">
                                <div
                                    className="rounded-2xl border border-white/[0.08] bg-[#0d1117]
                                               shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.5)]
                                               transition-[border-color,box-shadow] duration-200
                                               focus-within:border-[#7AD9DA]/55
                                               focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.5),0_0_0_4px_rgba(122,217,218,0.08)]"
                                >
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask anything about your traffic…"
                                        disabled={isLoading || !dataReady}
                                        rows={1}
                                        className="w-full resize-none bg-transparent px-6 pt-5 pb-3 text-[15.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 caret-emerald-400 outline-none max-h-44 disabled:opacity-40"
                                    />
                                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                                        <div className="relative" ref={dropdownRef}>
                                            <button
                                                onClick={() => setSiteOpen(!siteOpen)}
                                                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-transparent px-3 text-[12px] text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-zinc-100"
                                            >
                                                <Globe className="h-3.5 w-3.5 text-zinc-400" />
                                                <span className="max-w-[160px] truncate">{siteLabel}</span>
                                                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                            </button>
                                            {siteOpen && normalizedSites.length > 0 && (
                                                <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[260px] min-w-[260px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c0f14] py-1 shadow-2xl shadow-black/70">
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
                                            aria-label="Send"
                                            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#34d399] text-zinc-950
                                                       shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_8px_rgba(52,211,153,0.20)]
                                                       transition-all enabled:hover:brightness-105
                                                       disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                                        >
                                            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Suggestion buttons — pill-shaped, weighted, no icons */}
                            <div className="mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2 px-4">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s.label}
                                        onClick={() => sendMessage(s.prompt)}
                                        disabled={isLoading || !dataReady}
                                        className="rounded-full border border-white/[0.08] bg-[#0a0d12]/60 px-4 py-2 text-[13px] text-zinc-300
                                                   shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]
                                                   transition-all hover:border-white/[0.16] hover:bg-[#0e1218] hover:text-zinc-100
                                                   disabled:opacity-40"
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* Footer micro-text */}
                            <div className="mt-12 max-w-md text-center text-[11px] text-zinc-600">
                                Powered by Gemini · cross-references GA4{hasGoogleConnection && ', Search Console'}{hasGithubConnection && ', and your GitHub repos'}
                            </div>

                            {!dataReady && hasGoogleConnection && (
                                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Loading your analytics and search data…
                                </div>
                            )}
                        </div>
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
