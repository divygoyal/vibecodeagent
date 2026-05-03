'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import {
    Globe, ChevronDown, Loader2, ArrowUp, ArrowRight, RotateCcw, Search, Sparkles, Target, TrendingDown, Lightbulb, Lock,
    Github
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

type ActionChip = {
    label: string;
    prompt: string;
    mode?: 'briefing';
    icon: LucideIcon;
};

const BRIEFING_PROMPT = 'Give me my morning briefing — what changed overnight and what should I focus on today?';

const ACTION_CHIPS: ActionChip[] = [
    {
        label: 'Traffic drop',
        prompt: 'Why did my traffic drop recently? Pinpoint the date, the affected pages, and the most likely cause.',
        icon: TrendingDown,
    },
    {
        label: 'SEO issues',
        prompt: 'Find the biggest SEO issues hurting my traffic right now and rank them by revenue impact.',
        icon: Search,
    },
    {
        label: 'Top opportunities',
        prompt: 'What should I fix first this month to grow traffic faster?',
        icon: Target,
    },
    {
        label: 'Content ideas',
        prompt: 'Suggest 5 content ideas based on my existing keywords and gaps in my site.',
        icon: Lightbulb,
    },
] as const;

type HeroCard = {
    title: string;
    description: string;
    prompt: string;
    icon: LucideIcon;
    accent: 'cyan' | 'emerald';
};

const HERO_CARDS: HeroCard[] = [
    {
        title: 'Why did my traffic drop?',
        description: 'Analyze changes, spot issues, and get actionable recommendations.',
        prompt: 'Why did my traffic drop recently? Pinpoint the date, the affected pages, and the most likely cause.',
        icon: TrendingDown,
        accent: 'cyan',
    },
    {
        title: 'What are my top growth opportunities?',
        description: 'Discover high-impact opportunities to drive more traffic and conversions.',
        prompt: 'What are my top growth opportunities right now? Rank by expected revenue impact.',
        icon: Target,
        accent: 'emerald',
    },
] as const;

// ── Brand marks for the connector pills (inline so we don't pull in a brand-icon lib) ──
const WordpressMark = ({ className = 'h-4 w-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12a9 9 0 0 0 5.2 8.15L4.6 9.65A8.96 8.96 0 0 0 3 12Z" fill="currentColor" />
        <path d="M19.6 7.7a8.96 8.96 0 0 1 .9 8.7l-3.6-9.85a4 4 0 0 1 2.7 1.15Z" fill="currentColor" opacity="0.85" />
        <path d="M11 4.4 14 13l-1.7 5.4a9 9 0 0 0 5.6-2.1L13.4 4.5l-2.4-.1Z" fill="currentColor" opacity="0.7" />
    </svg>
);
const VercelMark = ({ className = 'h-4 w-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M12 3 22 20H2L12 3Z" />
    </svg>
);
const Ga4Mark = ({ className = 'h-4 w-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="4" y="11" width="4" height="9" rx="1.5" fill="#F9AB00" />
        <rect x="10" y="7" width="4" height="13" rx="1.5" fill="#F9AB00" opacity="0.85" />
        <rect x="16" y="3" width="4" height="17" rx="1.5" fill="#E37400" />
    </svg>
);
const SearchConsoleMark = ({ className = 'h-4 w-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14.5" cy="14" r="2" stroke="#22d3ee" strokeWidth="1.6" />
        <path d="m16 15.5 2 2" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);

type ConnectorPill = {
    key: string;
    label: string;
    Icon: (props: { className?: string }) => React.ReactElement;
    iconWrapClass: string;
    connected: boolean;
};

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

    const connectorPills: ConnectorPill[] = useMemo(() => ([
        {
            key: 'github',
            label: 'GitHub',
            Icon: ({ className }) => <Github className={className ?? 'h-4 w-4'} />,
            iconWrapClass: 'bg-white/[0.06] text-zinc-100 border-white/[0.08]',
            connected: hasGithubConnection,
        },
        {
            key: 'wordpress',
            label: 'WordPress',
            Icon: WordpressMark,
            iconWrapClass: 'bg-[#21759b]/15 text-[#5fbcd9] border-[#21759b]/30',
            connected: false,
        },
        {
            key: 'vercel',
            label: 'Vercel',
            Icon: VercelMark,
            iconWrapClass: 'bg-white/[0.06] text-white border-white/[0.08]',
            connected: false,
        },
        {
            key: 'ga4',
            label: 'GA4',
            Icon: Ga4Mark,
            iconWrapClass: 'bg-[#F9AB00]/10 border-[#F9AB00]/25',
            connected: hasGoogleConnection,
        },
        {
            key: 'gsc',
            label: 'Search Console',
            Icon: SearchConsoleMark,
            iconWrapClass: 'bg-white/[0.04] text-zinc-100 border-white/[0.08]',
            connected: hasGoogleConnection,
        },
    ]), [hasGithubConnection, hasGoogleConnection]);
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
                    <div className="relative min-h-full px-4 pt-6 pb-12 sm:px-6 lg:px-10">
                        {/* Ambient background glow + subtle grid */}
                        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_82%_22%,rgba(16,185,129,0.10),transparent_28%),linear-gradient(180deg,#02060a_0%,#000_100%)]" />
                            <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(rgba(34,211,238,0.18) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0))' }} />
                            <div className="absolute left-1/2 top-[36%] h-[300px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_70%)] blur-3xl" />
                        </div>

                        <div className="relative mx-auto w-full max-w-6xl">
                            {/* ── Connector pills row ── */}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                {connectorPills.map((pill) => {
                                    const ConnectorIcon = pill.Icon;
                                    const baseClass = 'group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 transition-all hover:border-white/[0.16] hover:bg-white/[0.04]';
                                    const inner = (
                                        <>
                                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${pill.iconWrapClass}`}>
                                                <ConnectorIcon className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[13px] font-medium text-white">{pill.label}</div>
                                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                                                    <span
                                                        className={`inline-block h-1.5 w-1.5 rounded-full ${pill.connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-zinc-600'}`}
                                                    />
                                                    <span className={pill.connected ? 'text-emerald-300' : 'text-zinc-500'}>
                                                        {pill.connected ? 'Connected' : 'Connect'}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    );
                                    return pill.connected ? (
                                        <div key={pill.key} className={baseClass}>{inner}</div>
                                    ) : (
                                        <Link key={pill.key} href="/dashboard/settings" className={baseClass}>{inner}</Link>
                                    );
                                })}
                            </div>

                            {/* ── Headline + eyebrow ── */}
                            <div className="mt-12 flex flex-col items-center text-center">
                                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/[0.05] px-4 py-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">AI Growth Copilot</span>
                                </div>

                                <h1 className="mt-7 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-white sm:text-[56px] sm:leading-[1.05]">
                                    Ask anything about{' '}
                                    <span className="bg-[linear-gradient(135deg,#67e8f9_0%,#22d3ee_55%,#0ea5e9_100%)] bg-clip-text text-transparent">your traffic</span>
                                </h1>
                                <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-400">
                                    Get instant insights about traffic, SEO, content, and growth opportunities across your website.
                                </p>
                            </div>

                            {/* ── Glow input row ── */}
                            <div className="relative mx-auto mt-10 w-full max-w-4xl">
                                <div aria-hidden className="absolute -inset-x-4 -inset-y-3 rounded-[36px] bg-[linear-gradient(90deg,rgba(34,211,238,0.20),rgba(16,185,129,0.18),rgba(34,211,238,0.10))] blur-2xl" />
                                <div className="relative rounded-[24px] border border-cyan-400/20 bg-[#06090e]/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                                    <div className="flex items-center gap-3 rounded-[20px] border border-white/[0.05] bg-[#0a0f14]/80 px-4 py-3.5 sm:px-5">
                                        <Sparkles className="h-5 w-5 shrink-0 text-cyan-300" />
                                        <textarea
                                            ref={textareaRef}
                                            value={input}
                                            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Ask why traffic dropped, find SEO issues, or discover growth opportunities…"
                                            disabled={isLoading || !dataReady}
                                            rows={1}
                                            className="min-h-[28px] flex-1 bg-transparent text-[15px] leading-relaxed text-white placeholder-zinc-500 outline-none resize-none max-h-40 disabled:opacity-40"
                                        />
                                        <div className="flex items-center gap-2 pl-2">
                                            <div className="relative" ref={dropdownRef}>
                                                <button
                                                    onClick={() => setSiteOpen(!siteOpen)}
                                                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] text-zinc-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06]"
                                                >
                                                    <Globe className="h-3.5 w-3.5 text-cyan-300" />
                                                    <span className="max-w-[140px] truncate">{siteLabel}</span>
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
                                                aria-label="Send"
                                                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-500 transition-all enabled:bg-[linear-gradient(135deg,#22d3ee_0%,#0ea5e9_100%)] enabled:text-[#031014] enabled:shadow-[0_10px_30px_rgba(34,211,238,0.30)] enabled:hover:brightness-110"
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Action chips ── */}
                            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                                {ACTION_CHIPS.map((chip) => {
                                    const Icon = chip.icon;
                                    return (
                                        <button
                                            key={chip.label}
                                            type="button"
                                            onClick={() => sendMessage(chip.prompt, chip.mode ? { mode: chip.mode } : undefined)}
                                            disabled={isLoading || !dataReady}
                                            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] text-zinc-200 transition-all hover:border-cyan-400/30 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
                                        >
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-cyan-300">
                                                <Icon className="h-3 w-3" />
                                            </span>
                                            <span>{chip.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── Hero suggestion cards ── */}
                            <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-2">
                                {HERO_CARDS.map((card) => {
                                    const Icon = card.icon;
                                    const accentBg = card.accent === 'cyan'
                                        ? 'bg-cyan-500/[0.08] border-cyan-400/20 text-cyan-300'
                                        : 'bg-emerald-500/[0.08] border-emerald-400/20 text-emerald-300';
                                    const decorPath = card.accent === 'cyan'
                                        ? 'M0 70 Q40 60 80 50 T160 35 T260 25 T360 15'
                                        : 'M0 60 L30 50 L60 65 L90 35 L120 50 L160 30 L210 45 L260 20 L320 35 L380 15';
                                    return (
                                        <button
                                            key={card.title}
                                            type="button"
                                            onClick={() => sendMessage(card.prompt)}
                                            disabled={isLoading || !dataReady}
                                            className="group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#070b11]/85 p-6 text-left transition-all hover:border-white/[0.16] hover:bg-[#0a0f15]/90 disabled:opacity-40"
                                        >
                                            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accentBg}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div className="mt-5 pr-12">
                                                <div className="text-[16px] font-semibold text-white">{card.title}</div>
                                                <div className="mt-2 text-[13px] leading-6 text-zinc-400">{card.description}</div>
                                            </div>
                                            {/* Decorative sparkline at bottom-right */}
                                            <svg
                                                aria-hidden
                                                viewBox="0 0 380 80"
                                                className="pointer-events-none absolute bottom-2 right-2 h-12 w-2/3 opacity-40"
                                            >
                                                <path d={decorPath} fill="none" stroke={card.accent === 'cyan' ? '#22d3ee' : '#34d399'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <span className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition-all group-hover:border-cyan-400/30 group-hover:text-white">
                                                <ArrowRight className="h-4 w-4" />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {!dataReady && hasGoogleConnection && (
                                <div className="mt-10 flex items-center justify-center gap-2 text-xs text-zinc-500">
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
