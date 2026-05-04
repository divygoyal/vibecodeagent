'use client';

/**
 * AIChatbot — chat widget orchestrator.
 *
 * After the B5-full split, this file is a thin state container. It owns:
 *   • all useState / useRef / useCallback hooks
 *   • the SSE streaming loop in sendMessage()
 *   • event listeners (open-ai-chat, trafficclaw:ask-ai, Esc-to-close)
 *   • the floating-button (closed) + chat-window (open) composition
 *
 * Presentation lives in components/chat/*:
 *   ChatHeader      — header bar, site picker, action buttons
 *   HistoryPanel    — overlay listing past threads
 *   QuickPrompts    — empty-state prompt chips + Daily Briefing button
 *   ChatInput       — textarea + Send/Stop button
 *   MessageBubble   — single message row (memoized)
 *   ReasoningTrace  — Claude-style live narration timeline (replaces the
 *                     old ThinkingIndicator pulsing-orb)
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, persistMessage, getOrCreateThreadId, setActiveThreadId, type ChatMessage } from '@/stores/chatStore';
import { toast } from 'sonner';
import ConfirmDialog from './ConfirmDialog';
import { ChatHeader } from './chat/ChatHeader';
import { HistoryPanel, type HistoryThread } from './chat/HistoryPanel';
import { QuickPrompts } from './chat/QuickPrompts';
import { ChatInput } from './chat/ChatInput';
import { MessageBubble } from './chat/MessageBubble';
import { ReasoningTrace, narrateToolStart, narrateToolResult, type TraceLine } from './chat/ReasoningTrace';

type Message = ChatMessage;

interface SiteOption {
    id: string;
    label: string;
    type: string;
}

const WELCOME_MESSAGE: Message = {
    role: 'assistant',
    content: "👋 **Hey! I'm your AI Analyst.**\n\nI have your live analytics & SEO data loaded. Ask me anything — I give **verdicts**, not advice.\n\n*Select a website above, then ask away.*",
    timestamp: new Date().toISOString(),
};

export default function AIChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const { messages: storeMessages, setMessages, clearChat: storeClearChat } = useChatStore();
    // Show welcome message when store is empty
    const messages = storeMessages.length > 0 ? storeMessages : [WELCOME_MESSAGE];
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [credits, setCredits] = useState<number | null>(null);
    const [showCreditAnim, setShowCreditAnim] = useState(false);
    const [selectedChatSite, setSelectedChatSite] = useState('');
    const [showSiteDropdown, setShowSiteDropdown] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Self-sufficient data fetching: chatbot loads its own data for selected site ──
    const { hasGoogleConnection } = useContainerStatus();
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const { properties: ga4Properties, isLoading: propertiesLoading } = usePropertyList(hasGoogleConnection);
    const hasRealGa4Property = ga4Properties.length > 0;

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

    // B5-thin: lifted AbortController so the Stop button can abort the
    // in-flight fetch from outside sendMessage's closure. Reset per-turn.
    const abortRef = useRef<AbortController | null>(null);

    // B2-thin: classified intent for the current/last assistant turn —
    // streamed from the server as type:'intent' once classification lands.
    const lastIntentRef = useRef<string | null>(null);

    // B5-full: planning state — true while the planner is running pre-stream.
    // Drives the "Planning…" indicator so the user knows why first-token is
    // delayed by ~2s on diagnostic intents.
    const [isPlanning, setIsPlanning] = useState(false);

    // B5-polish: live reasoning trace — array of lines that fades in as SSE
    // events arrive (planning → tool starts → tool results → reasoning).
    // Replaces the static cycling-phrase orb with Claude-style live narration.
    const [traceLines, setTraceLines] = useState<TraceLine[]>([]);
    const traceCounterRef = useRef(0);
    const pushTraceLine = useCallback((text: string) => {
        const id = `tl-${++traceCounterRef.current}-${Date.now()}`;
        setTraceLines(prev => [...prev, { id, text }]);
    }, []);

    const handleStop = useCallback(() => {
        if (abortRef.current) {
            try { abortRef.current.abort(); } catch { /* already aborted */ }
            // Best-effort telemetry — server logs the interrupt for tool-latency analysis
            try {
                fetch('/api/ai-chat/interrupt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threadId: getOrCreateThreadId(), directive: 'user_stopped' }),
                });
            } catch { /* swallow */ }
        }
    }, []);

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

    // Debounced scroll to prevent jank during rapid streaming updates
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, [messages]);

    useEffect(() => {
        if (isOpen) {
            if (isExpanded) {
                textareaRef.current?.focus();
            } else {
                inputRef.current?.focus();
            }
            // Scroll to bottom when opening with existing messages
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
            }, 50);
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

        const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date().toISOString(), tools: [] }]);
        setInput('');
        setIsLoading(true);
        setIsPlanning(false);
        setTraceLines([]); // reset trace per-turn

        // B-1: persist the user turn to the server (best-effort, fire-and-forget)
        const turnStartedAt = Date.now();
        void persistMessage(
            { role: 'user', content: messageText },
            { title: messageText.slice(0, 80), site_url: currentSite },
        );

        try {
            // A1: Send compressed-but-COMPLETE context every turn — not just first.
            // Otherwise Gemini hallucinates by turn 5 ("what was my #3 keyword?" → wrong).
            // Compressed (top 8 queries + top 5 pages + KPIs) ≈ +500 tokens/turn,
            // still well under context budget.
            // B5-thin: AbortController lives in abortRef so the Stop button
            // can call .abort() from outside this closure.
            const abortController = new AbortController();
            abortRef.current = abortController;
            const ttfbTimeout = setTimeout(() => abortController.abort(), 60000);

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: currentSite,
                    analyticsContext: currentAnalytics ? {
                        kpis: currentAnalytics.kpis,
                        topSources: currentAnalytics.sources?.slice(0, 6),
                        topPages: currentAnalytics.pages?.slice(0, 5),
                        topCountries: currentAnalytics.countries?.slice(0, 6),
                        devices: currentAnalytics.devices,
                        channels: currentAnalytics.channels?.slice(0, 5),
                    } : null,
                    seoContext: currentSeo ? {
                        kpis: currentSeo.kpis,
                        topQueries: currentSeo.queries?.slice(0, 8),
                        topPages: currentSeo.pages?.slice(0, 5),
                        recommendations: currentSeo.recommendations?.slice(0, 3),
                    } : null,
                    history: currentMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                    mode: options?.mode,
                    // B1-full: pass the thread id so the server can load this thread's
                    // rolling summary + write extracted facts back tagged to it.
                    threadId: getOrCreateThreadId(),
                }),
            });
            clearTimeout(ttfbTimeout); // Response started, cancel TTFB timeout

            if (!res.ok) {
                if (res.status === 402 || res.status === 409) {
                    try {
                        const errorData = await res.json();
                        const creditMsg = errorData.response || (res.status === 402
                            ? `⚡ You've run out of messages! **1 credit = 1 message.**\n\nGet more to continue using TrafficClaw AI.`
                            : 'AI Chat is unavailable because this account does not have any Google Analytics property connected yet.');
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { ...updated[updated.length - 1], content: creditMsg };
                            return updated;
                        });
                        if (res.status === 402 && errorData.credits !== undefined) setCredits(errorData.credits);
                    } catch {
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                ...updated[updated.length - 1],
                                content: res.status === 402
                                    ? '⚡ **Out of messages!** Please purchase more to continue.'
                                    : 'AI Chat is unavailable because this account does not have any Google Analytics property connected yet.',
                            };
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
                        } else if (data.type === 'thinking_block') {
                            // B5-full: append to the message's `thinking` field.
                            // Streamed in real time so the user can watch it grow.
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.thinking = (last.thinking || '') + data.content;
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'planning') {
                            setIsPlanning(true);
                            pushTraceLine('Planning the approach…');
                        } else if (data.type === 'planning_done') {
                            setIsPlanning(false);
                        } else if (data.type === 'plan_proposed') {
                            // B5-full: planner's structured plan, attached to the
                            // in-flight message so the PlanCard renders it inline.
                            setIsPlanning(false);
                            if (data.plan?.summary) pushTraceLine(data.plan.summary);
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.plan = data.plan;
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'critic_verdict') {
                            // B5-full: critic's score + diagnosis.
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.critic = {
                                    score: data.score,
                                    groundedness: data.groundedness,
                                    completeness: data.completeness,
                                    format: data.format,
                                    notes: data.notes,
                                };
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_start') {
                            pushTraceLine(narrateToolStart(data.name));
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = [...(last.tools || []), { name: data.name, args: data.args }];
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_result') {
                            pushTraceLine(narrateToolResult(data.name, data.result));
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map(t =>
                                    t.name === data.name && !t.result ? { ...t, result: data.result || 'Done', structuredData: data.structuredData } : t
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'intent') {
                            // B2-thin: server-side IntentRouter result (one of 7 labels).
                            // We just stash it for telemetry / future per-intent UI tweaks.
                            lastIntentRef.current = data.value || null;
                        } else if (data.type === 'tool_progress') {
                            // A6: heartbeat for slow tools — annotate the in-flight tool
                            // with its elapsed seconds so the UI can show "Running X… (12s)".
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map(t =>
                                    t.name === data.name && !t.result
                                        ? ({ ...t, elapsedSec: data.elapsedSec } as any)
                                        : t
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'credits') {
                            setCredits(prev => {
                                if (prev !== null && data.value < prev) {
                                    setShowCreditAnim(true);
                                    setTimeout(() => setShowCreditAnim(false), 1500);
                                    // Track credit usage in localStorage for history
                                    try {
                                        const history = JSON.parse(localStorage.getItem('tc-credit-usage') || '[]');
                                        history.push({ date: new Date().toISOString(), action: 'AI Chat message', amount: -1 });
                                        localStorage.setItem('tc-credit-usage', JSON.stringify(history.slice(-50)));
                                    } catch { /* skip */ }
                                } else if (prev !== null && data.value > prev) {
                                    // Credit was refunded
                                    try {
                                        const history = JSON.parse(localStorage.getItem('tc-credit-usage') || '[]');
                                        history.push({ date: new Date().toISOString(), action: 'Credit refunded (error)', amount: 1 });
                                        localStorage.setItem('tc-credit-usage', JSON.stringify(history.slice(-50)));
                                    } catch { /* skip */ }
                                }
                                return data.value;
                            });
                        } else if (data.type === 'error') {
                            appendStreamText(`\n\n⚠️ **Error:** ${data.message}`);
                            setMessages(prev => {
                                const updated = [...prev];
                                updated[updated.length - 1] = { ...updated[updated.length - 1], hasError: true };
                                return updated;
                            });
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

            // B-1: persist the completed assistant turn (read latest content + tools
            // from the messages ref since setMessages has finished by now).
            try {
                const latest = messagesRef.current[messagesRef.current.length - 1];
                if (latest?.role === 'assistant' && latest.content) {
                    void persistMessage({
                        role: 'assistant',
                        content: latest.content,
                        tools: latest.tools,
                        intent: lastIntentRef.current || undefined,
                        latency_ms: Date.now() - turnStartedAt,
                    });
                }
            } catch { /* persistence is best-effort */ }
        } catch (err: any) {
            const isTimeout = err?.name === 'AbortError';
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                        ...last,
                        content: (last.content || '') + (isTimeout
                            ? '\n\n⚠️ **Request timed out.** The AI took too long to respond. Try a simpler question.'
                            : '\n\n⚠️ **Connection Error.** Couldn\'t reach the AI service.'),
                        hasError: true,
                    };
                    return updated;
                }
                return [...prev, {
                    role: 'assistant',
                    content: isTimeout
                        ? '⚠️ **Request timed out.** The AI took too long to respond. Try a simpler question.'
                        : '⚠️ **Connection Error.** Couldn\'t reach the AI service.',
                    timestamp: new Date().toISOString(),
                    hasError: true,
                }];
            });
        } finally {
            setIsLoading(false);
            setIsPlanning(false);
        }
    }, [appendStreamText, flushStreamBuffer]); // stable deps only

    // ── Stable ref for event listener — never re-adds ──
    const sendMessageRef = useRef(sendMessage);
    sendMessageRef.current = sendMessage;

    // A5: Briefing is now opt-in via button (see QUICK_PROMPTS section below).
    // The auto-fire useEffect was burning a credit before the user typed anything,
    // and was non-discoverable when it WORKED. Tracking last-shown date so the
    // button shows "Already viewed today" instead of letting users re-fire it.
    const [briefingDoneToday, setBriefingDoneToday] = useState(false);
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        try {
            if (localStorage.getItem('tc-last-briefing-date') === today) {
                setBriefingDoneToday(true);
            }
        } catch { /* private mode */ }
    }, []);
    const requestBriefing = useCallback(() => {
        if (briefingDoneToday || isLoading || !dataReady) return;
        const today = new Date().toISOString().split('T')[0];
        try { localStorage.setItem('tc-last-briefing-date', today); } catch { /* skip */ }
        setBriefingDoneToday(true);
        sendMessageRef.current('Give me my morning briefing — what changed overnight and what should I focus on today?', { mode: 'briefing' });
    }, [briefingDoneToday, isLoading, dataReady]);

    // Listen for external "Ask AI" events (from Intelligence Center)
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const question = ce.detail?.question;
            const site = ce.detail?.site;
            if (question) {
                if (site) setSelectedChatSite(site);
                setIsOpen(true);
                setTimeout(() => {
                    sendMessageRef.current(question);
                }, 300);
            }
        };
        window.addEventListener('trafficclaw:ask-ai', handler);
        return () => window.removeEventListener('trafficclaw:ask-ai', handler);
    }, []); // empty deps — listener is added once, never thrashes

    useEffect(() => {
        const handler = () => setIsOpen(true);
        window.addEventListener('open-ai-chat', handler);
        return () => window.removeEventListener('open-ai-chat', handler);
    }, []);

    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // B1-full: thread sidebar state — list of past threads + load handler.
    const [showHistory, setShowHistory] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyThreads, setHistoryThreads] = useState<HistoryThread[]>([]);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/chat-store?action=list_threads&limit=30');
            if (res.ok) {
                const data = await res.json();
                setHistoryThreads(Array.isArray(data?.threads) ? data.threads : []);
            }
        } catch { /* offline ok */ }
        finally { setHistoryLoading(false); }
    }, []);

    const loadThread = useCallback(async (threadId: string) => {
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/chat-store?action=list_messages&thread=${encodeURIComponent(threadId)}&limit=200`);
            if (res.ok) {
                const data = await res.json();
                const msgs = Array.isArray(data?.messages) ? data.messages : [];
                // Map server messages → client ChatMessage shape
                const mapped: Message[] = msgs
                    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
                    .map((m: any) => ({
                        role: m.role,
                        content: m.content || '',
                        timestamp: m.created_at || new Date().toISOString(),
                        tools: m.tools_json ? (() => { try { return JSON.parse(m.tools_json); } catch { return undefined; } })() : undefined,
                    }));
                setActiveThreadId(threadId);
                setMessages(mapped.length > 0 ? mapped : []);
                setShowHistory(false);
            }
        } catch { /* swallow */ }
        finally { setHistoryLoading(false); }
    }, [setMessages]);

    const clearChat = useCallback(() => {
        storeClearChat();
        toast.success('Chat cleared');
    }, [storeClearChat]);

    // Escape key to close chat
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen]);

    if (!hasGoogleConnection || (!propertiesLoading && !hasRealGa4Property)) {
        return null;
    }

    // ─── Floating button (closed state) ───
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-[4.75rem] right-4 z-50 group sm:bottom-24 sm:right-6 lg:bottom-6"
                aria-label="Open AI chat"
            >
                <div className="relative">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-teal-400 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-110 flex items-center justify-center">
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
        <div className={`fixed z-50 ${isExpanded ? 'inset-4 lg:inset-8' : 'bottom-0 right-0 w-full h-full sm:bottom-6 sm:right-6 sm:w-[440px] sm:h-[640px]'} transition-all duration-300`}>
            <div className="w-full h-full bg-[var(--sidebar-bg)] border border-[var(--card-border)] rounded-none sm:rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden relative">
                <ChatHeader
                    currentSiteLabel={currentSiteLabel}
                    allSites={allSites}
                    selectedChatSite={selectedChatSite}
                    onSiteChange={setSelectedChatSite}
                    showSiteDropdown={showSiteDropdown}
                    setShowSiteDropdown={setShowSiteDropdown}
                    credits={credits}
                    showCreditAnim={showCreditAnim}
                    showHistory={showHistory}
                    onHistoryClick={() => { setShowHistory(prev => { if (!prev) void fetchHistory(); return !prev; }); }}
                    onClearClick={() => setShowClearConfirm(true)}
                    isExpanded={isExpanded}
                    onExpandToggle={() => setIsExpanded(!isExpanded)}
                    onClose={() => setIsOpen(false)}
                />

                {showHistory && (
                    <HistoryPanel
                        threads={historyThreads}
                        loading={historyLoading}
                        onSelect={loadThread}
                        onClose={() => setShowHistory(false)}
                    />
                )}

                {/* ── Messages ── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                    {messages.map((msg, i) => {
                        if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                        const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                        return (
                            <div key={`${msg.timestamp}-${i}`}>
                                <MessageBubble msg={msg} isExpanded={isExpanded} isStreaming={isLastAssistant && isLoading} snapshot={snapshot} onSuggestionClick={(s) => sendMessage(s)} />
                                {msg.hasError && !isLoading && (
                                    <div className="flex justify-start mt-1">
                                        <button
                                            onClick={() => {
                                                const lastUserMsg = [...messages].slice(0, i).reverse().find(m => m.role === 'user');
                                                if (lastUserMsg) {
                                                    setMessages(prev => prev.slice(0, -1));
                                                    sendMessage(lastUserMsg.content);
                                                }
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.08] hover:text-white transition"
                                        >
                                            ↻ Retry
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* B5-polish: live reasoning trace replaces the static thinking
                        orb. Shows plan summary + each tool start/result narration as
                        events arrive — same pattern Claude uses to keep users from
                        bouncing during multi-second tool runs. Hides once the
                        assistant message has actual content. */}
                    {isLoading && !lastMsg?.content && (
                        <ReasoningTrace lines={traceLines} active={isLoading} />
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {!messages.some(m => m.role === 'user') && !isLoading && (
                    <QuickPrompts
                        dataReady={dataReady}
                        briefingDoneToday={briefingDoneToday}
                        onBriefingClick={requestBriefing}
                        onPromptClick={(prompt) => sendMessage(prompt)}
                    />
                )}

                <ChatInput
                    ref={isExpanded ? textareaRef : (inputRef as unknown as React.RefObject<HTMLTextAreaElement>)}
                    input={input}
                    onChange={setInput}
                    onSubmit={() => sendMessage()}
                    isLoading={isLoading}
                    onStop={handleStop}
                    isExpanded={isExpanded}
                    credits={credits}
                />
            </div>

            <ConfirmDialog
                open={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={clearChat}
                title="Clear chat history?"
                description="This will delete all messages in this conversation. This action cannot be undone."
                confirmLabel="Clear All"
                variant="danger"
            />
        </div>
    );
}
