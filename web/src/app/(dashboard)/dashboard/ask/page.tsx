'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { History, Plus } from 'lucide-react';

import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { PageHeader } from '@/components/shell/PageHeader';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { useRegistration } from '@/components/shell/workspaceContext';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { ReasoningTrace, narrateToolResult, narrateToolStart, type TraceLine } from '@/components/chat/ReasoningTrace';
import { buildAnalyticsContext, buildSeoContext, buildSnapshot } from '@/lib/chatUtils';
import {
    useAnalyticsData, useConnections, useCredits, usePropertyList, useSeoData,
} from '@/lib/useDashboardData';
import {
    getOrCreateThreadId, persistMessage, setActiveThreadId, useChatStore, type ChatMessage,
} from '@/stores/chatStore';
import { AskEmpty } from './AskEmpty';
import { Composer } from './Composer';
import { ProviderConnectionCallback, QuestionFromQuery, type DeepLinkOptions } from './DeepLink';
import { HistoryDrawer } from './HistoryDrawer';

type DashboardPropertyOption = {
    displayName?: string;
    propertyId?: string;
    property?: string;
};

const statusFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/**
 * Ask (DESIGN 5.11): the in-app AI analyst.
 *
 * Streaming, function calling, credits, persistence and the workspace data
 * context work exactly as before (/api/ai-chat SSE, chatStore). This file is the
 * new layout around them: header, conversation, sticky composer with a site
 * chip and a credits line, calm states for "AI unavailable", out of messages and
 * missing Google data, history, and `?q=` deep links.
 */
export default function AskPage() {
    const {
        selectedSite,
        selectedProperty: workspaceProperty,
        hasGa4Properties,
        propertyInventoryLoading,
    } = useRegistration();
    const { site } = useCurrentSite();
    const { hasGoogleConnection, refresh: refreshContainer } = useConnections();
    const { credits, isLoading: creditsLoading, refresh: refreshCredits } = useCredits();

    // Is the model configured on this server? (null while the check runs.)
    const { data: aiStatus, isLoading: aiStatusLoading } = useSWR<{ available: boolean }>('/api/ai-chat/status', statusFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
    const [unavailableSeen, setUnavailableSeen] = useState(false);
    const aiUnavailable = aiStatus?.available === false || unavailableSeen;

    const { properties: ga4Properties } = usePropertyList(hasGoogleConnection);
    const normalizedProperties = useMemo(
        () => (Array.isArray(ga4Properties) ? (ga4Properties as DashboardPropertyOption[]) : []),
        [ga4Properties],
    );

    const { messages, setMessages, clearChat: storeClearChat } = useChatStore();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // Claude-style live reasoning trace: a growing list of narration lines.
    const [traceLines, setTraceLines] = useState<TraceLine[]>([]);
    const traceCounterRef = useRef(0);
    const pushTraceLine = useCallback((text: string) => {
        const id = `tl-${++traceCounterRef.current}-${Date.now()}`;
        setTraceLines((prev) => [...prev, { id, text }]);
    }, []);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    // GA4 property strictly from the workspace pairing: no fuzzy match, no
    // first-available fallback.
    const matchedProperty = useMemo(() => {
        if (!workspaceProperty || normalizedProperties.length === 0) return undefined;
        return normalizedProperties.find((property) => property.property === workspaceProperty);
    }, [normalizedProperties, workspaceProperty]);

    const analyticsEnabled = hasGoogleConnection && !!matchedProperty?.property;
    const seoEnabled = hasGoogleConnection && !!selectedSite;
    const {
        data: analyticsData,
        isLoading: analyticsLoading,
        refresh: refreshAnalytics,
    } = useAnalyticsData('all', matchedProperty?.property, analyticsEnabled);
    const {
        data: seoData,
        isLoading: seoLoading,
        refresh: refreshSeo,
    } = useSeoData('all', selectedSite, seoEnabled);
    const showGa4LockedState = !propertyInventoryLoading && !hasGa4Properties && !selectedSite;
    const hasEnabledGoogleSource = analyticsEnabled || seoEnabled;
    const enabledSourcesSettled = (!analyticsEnabled || !analyticsLoading) && (!seoEnabled || !seoLoading);
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;
    const dataLoadFailed =
        !propertyInventoryLoading && !showGa4LockedState && hasEnabledGoogleSource && !dataReady && enabledSourcesSettled;
    const dataLoading =
        hasGoogleConnection && !dataReady && !dataLoadFailed && (propertyInventoryLoading || hasEnabledGoogleSource);
    const retryGoogleData = useCallback(() => {
        if (analyticsEnabled) void refreshAnalytics();
        if (seoEnabled) void refreshSeo();
    }, [analyticsEnabled, refreshAnalytics, refreshSeo, seoEnabled]);
    const snapshot = useMemo(() => buildSnapshot(analyticsData, seoData), [analyticsData, seoData]);

    // Refs for stable callbacks.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const analyticsRef = useRef(analyticsData);
    analyticsRef.current = analyticsData;
    const seoRef = useRef(seoData);
    seoRef.current = seoData;
    const selectedSiteRef = useRef(selectedSite);
    selectedSiteRef.current = selectedSite;

    // Stream batching: text deltas flush once per animation frame.
    const streamBufferRef = useRef('');
    const rafIdRef = useRef<number | null>(null);

    const flushStreamBuffer = useCallback(() => {
        rafIdRef.current = null;
        const buffered = streamBufferRef.current;
        if (!buffered) return;
        streamBufferRef.current = '';
        setMessages((prev) => {
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
        if (messages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages]);

    const sendMessage = useCallback(async (text?: string, options?: { mode?: string; fromTag?: string }) => {
        const messageText = (text ?? input).trim();
        if (!messageText || isLoading) return;

        const currentAnalytics = analyticsRef.current;
        const currentSeo = seoRef.current;
        const currentMessages = messagesRef.current;
        const currentSite = selectedSiteRef.current;

        const userMessage: ChatMessage = { role: 'user', content: messageText, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date().toISOString(), tools: [] }]);
        setTraceLines([]);
        setInput('');
        setIsLoading(true);

        // Persist the user turn (fire and forget). Failure is non-fatal. The
        // title is only set on the first message so the row is not re-titled.
        const turnStartedAt = Date.now();
        const isFirstUserTurn = currentMessages.filter((m) => m.role === 'user').length === 0;
        void persistMessage(
            { role: 'user', content: messageText },
            isFirstUserTurn ? { title: messageText.slice(0, 80), site_url: currentSite || undefined } : undefined,
        );

        try {
            const abortController = new AbortController();
            const ttfbTimeout = setTimeout(() => abortController.abort(), 30000);

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: currentSite,
                    selectedRepo: null,
                    repoIsAuto: false,
                    // Sent on every turn: a KPI-only snapshot made multi-turn
                    // diagnostics forget the keyword and page lists. The shared
                    // helpers cap row counts, so the payload stays bounded.
                    analyticsContext: currentAnalytics ? buildAnalyticsContext(currentAnalytics) : null,
                    seoContext: currentSeo ? buildSeoContext(currentSeo) : null,
                    history: currentMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
                    mode: options?.mode,
                    fromTag: options?.fromTag ?? null,
                }),
            });
            clearTimeout(ttfbTimeout);

            if (!res.ok) {
                if (res.status === 402 || res.status === 409) {
                    const errorData = await res.json().catch(() => ({}));
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: res.status === 402
                                ? 'You have used all your Ask messages. Get more on the Plan page, or ask ChatGPT or Claude through Connect AI, which does not use these messages.'
                                : (typeof errorData.response === 'string' && errorData.response) || 'Ask is unavailable because this account does not have a Google Analytics property connected yet.',
                        };
                        return updated;
                    });
                    if (res.status === 402) void refreshCredits();
                    setIsLoading(false);
                    return;
                }
                throw new Error('Failed');
            }

            // Without a model key the route answers with plain JSON instead of a stream.
            if ((res.headers.get('content-type') || '').includes('application/json')) {
                const payload = await res.json().catch(() => ({}));
                setUnavailableSeen(true);
                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: (typeof payload.response === 'string' && payload.response) || 'Ask is unavailable right now.',
                    };
                    return updated;
                });
                setIsLoading(false);
                return;
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
                        } else if (data.type === 'credits') {
                            // Live balance from the server: update the counter without a refetch.
                            if (typeof data.value === 'number') {
                                void refreshCredits((prev: Record<string, unknown> | undefined) => ({ ...(prev ?? {}), credits: data.value }), { revalidate: false });
                            }
                        } else if (data.type === 'planning') {
                            pushTraceLine('Planning the approach…');
                        } else if (data.type === 'plan_proposed') {
                            if (data.plan?.summary) pushTraceLine(data.plan.summary);
                            setMessages((prev) => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.plan = data.plan;
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'critic_verdict') {
                            setMessages((prev) => {
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
                            setMessages((prev) => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = [...(last.tools || []), { name: data.name, args: data.args }];
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_result') {
                            pushTraceLine(narrateToolResult(data.name, data.result));
                            setMessages((prev) => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map((t) =>
                                    t.name === data.name && !t.result ? { ...t, result: data.result || 'Done', structuredData: data.structuredData } : t,
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'error') {
                            appendStreamText(`\n\n**Error:** ${data.message}`);
                        }
                    } catch { /* skip malformed event */ }
                }
            }

            if (streamBufferRef.current) {
                if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
                flushStreamBuffer();
            }

            // Persist the finished assistant turn and keep its DB id so the
            // feedback buttons have a real row to submit against. Best effort.
            try {
                const latest = messagesRef.current[messagesRef.current.length - 1];
                if (latest?.role === 'assistant' && latest.content) {
                    const persisted = await persistMessage({
                        role: 'assistant',
                        content: latest.content,
                        tools: latest.tools,
                        latency_ms: Date.now() - turnStartedAt,
                    });
                    if (persisted?.id) {
                        setMessages((prev) => {
                            const next = [...prev];
                            const lastIdx = next.length - 1;
                            if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
                                next[lastIdx] = { ...next[lastIdx], id: persisted.id };
                            }
                            return next;
                        });
                    }
                }
            } catch { /* persistence is best-effort */ }
        } catch (err: unknown) {
            const isTimeout =
                (err instanceof DOMException && err.name === 'AbortError') ||
                (err instanceof Error && err.name === 'AbortError');
            setMessages((prev) => {
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
            // The server deducts one message per turn (and refunds on failure): re-read the balance.
            void refreshCredits();
        }
    }, [appendStreamText, flushStreamBuffer, input, isLoading, pushTraceLine, refreshCredits, setMessages]);

    const outOfMessages = credits !== null && credits < 1;
    const hasSource = !showGa4LockedState;
    const canAsk = !aiUnavailable && !outOfMessages && hasSource && dataReady && !isLoading;

    // Deep links: send when Ask can answer, otherwise leave the question in the composer.
    const canAskRef = useRef(canAsk);
    canAskRef.current = canAsk;
    const sendRef = useRef(sendMessage);
    sendRef.current = sendMessage;
    const handleQuestion = useCallback((q: string, opts: DeepLinkOptions) => {
        if (opts.prefillOnly || !canAskRef.current) {
            setInput(q);
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(q.length, q.length);
            });
            return;
        }
        void sendRef.current(q, { fromTag: opts.fromTag });
    }, []);

    const newChat = useCallback(() => {
        storeClearChat();
        setTraceLines([]);
        setInput('');
        textareaRef.current?.focus();
    }, [storeClearChat]);

    // Open a past conversation (same mapping the old floating widget used).
    const openThread = useCallback(async (threadId: string) => {
        try {
            const res = await fetch(`/api/chat-store?action=list_messages&thread=${encodeURIComponent(threadId)}&limit=200`);
            if (!res.ok) {
                toast.error('Could not load that conversation. Try again.');
                return;
            }
            const data = await res.json();
            const rows = Array.isArray(data?.messages) ? data.messages : [];
            const mapped: ChatMessage[] = rows
                .filter((m: { role?: string }) => m.role === 'user' || m.role === 'assistant')
                .map((m: { role: 'user' | 'assistant'; content?: string; created_at?: string; tools_json?: string }) => ({
                    role: m.role,
                    content: m.content || '',
                    timestamp: m.created_at || new Date().toISOString(),
                    tools: m.tools_json ? (() => { try { return JSON.parse(m.tools_json as string); } catch { return []; } })() : undefined,
                }));
            setActiveThreadId(threadId);
            setMessages(mapped);
            setHistoryOpen(false);
        } catch {
            toast.error('Could not load that conversation. Try again.');
        }
    }, [setMessages]);

    const lastMsg = messages[messages.length - 1];
    const showEmpty = messages.length === 0;
    const siteLabel = site?.label ?? null;

    const placeholder = aiUnavailable
        ? 'Ask is unavailable right now'
        : showGa4LockedState
            ? 'Connect Google Analytics or Search Console to start asking'
            : dataLoadFailed
                ? 'Your Google data could not be loaded. Try again above'
                : dataLoading
                    ? 'Loading your Google data…'
                    : 'Ask about your traffic…';

    return (
        <div className="flex min-h-[calc(100dvh-6rem)] flex-col md:min-h-[calc(100dvh-7.5rem)]">
            {/* Side effects: must mount on every render path or deep links are dropped when a chat exists. */}
            <Suspense fallback={null}>
                <QuestionFromQuery ready={!dataLoading && !aiStatusLoading && !creditsLoading} onQuestion={handleQuestion} />
            </Suspense>
            <Suspense fallback={null}>
                <ProviderConnectionCallback onConnected={refreshContainer} />
            </Suspense>

            <PageHeader
                title="Ask"
                subtitle="Ask about your traffic in plain English"
                actions={(
                    <>
                        {!showEmpty ? (
                            <Button variant="secondary" size="sm" icon={Plus} onClick={newChat}>New chat</Button>
                        ) : null}
                        <Button variant="secondary" size="sm" icon={History} onClick={() => setHistoryOpen(true)}>History</Button>
                    </>
                )}
            />

            {/* Conversation */}
            <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col">
                {showEmpty ? (
                    <AskEmpty
                        siteLabel={siteLabel}
                        disabled={!canAsk}
                        onPick={(q) => void sendMessage(q)}
                    />
                ) : (
                    <div role="log" aria-label="Conversation" aria-live="polite" className="flex-1 pb-6">
                        {messages.map((msg, i) => {
                            if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                            return msg.role === 'user' ? (
                                <div key={i} className="mb-6 flex justify-end">
                                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-subtle px-4 py-2.5 text-body-lg text-fg">
                                        {msg.content}
                                    </p>
                                </div>
                            ) : (
                                <article key={i} aria-label="Answer" className="mb-8">
                                    <ChatMessageRenderer
                                        content={msg.content}
                                        tools={msg.tools}
                                        plan={msg.plan}
                                        critic={msg.critic}
                                        isStreaming={isLastAssistant && isLoading}
                                        snapshot={snapshot}
                                        onSuggestionClick={(s) => void sendMessage(s)}
                                        messageId={msg.id}
                                        threadId={getOrCreateThreadId()}
                                    />
                                </article>
                            );
                        })}
                        {isLoading && !lastMsg?.content ? <ReasoningTrace lines={traceLines} active={isLoading} /> : null}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Composer: sticky at the bottom with the states that affect it above */}
            <div className="sticky bottom-0 z-10 -mx-4 mt-2 bg-canvas px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:-mx-6 md:px-6 md:pb-0">
                <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
                    {aiUnavailable ? (
                        <Banner
                            variant="info"
                            title="Ask is unavailable right now"
                            actions={<Button asChild variant="secondary" size="sm"><Link href="/dashboard/connect-ai">Connect AI</Link></Button>}
                        >
                            We cannot reach the AI service, so questions cannot be answered yet. Your data pages still work, and ChatGPT or Claude can answer through Connect AI.
                        </Banner>
                    ) : null}
                    {showGa4LockedState ? (
                        <Banner
                            variant="info"
                            title="Connect Google to use Ask"
                            actions={hasGoogleConnection
                                ? <Button asChild variant="secondary" size="sm"><Link href="/dashboard/setup">Review your sites</Link></Button>
                                : <Button variant="google" size="sm" onClick={() => void signIn('google', { callbackUrl: '/dashboard/ask?connected=google' }, { prompt: 'select_account consent' })}><GoogleMark />Connect Google</Button>}
                        >
                            Ask answers from your Search Console and Analytics data, and none is connected yet.
                        </Banner>
                    ) : null}
                    {dataLoadFailed ? (
                        <Banner
                            variant="danger"
                            title="Could not load your Google data"
                            actions={(
                                <>
                                    <Button size="sm" onClick={retryGoogleData}>Try again</Button>
                                    <Button asChild variant="ghost" size="sm"><Link href="/dashboard/setup">Review your sites</Link></Button>
                                </>
                            )}
                        >
                            Try again, or switch to another site if this one is no longer available.
                        </Banner>
                    ) : null}
                    {!hasGoogleConnection && !showGa4LockedState ? (
                        <Banner
                            variant="neutral"
                            actions={<Button variant="google" size="sm" onClick={() => void signIn('google', { callbackUrl: '/dashboard/ask?connected=google' }, { prompt: 'select_account consent' })}><GoogleMark />Connect Google</Button>}
                        >
                            Connect Google so answers use your own data.
                        </Banner>
                    ) : null}
                    <Composer
                        value={input}
                        onChange={setInput}
                        onSend={() => void sendMessage()}
                        textareaRef={textareaRef}
                        sendDisabled={!canAsk || !input.trim()}
                        inputDisabled={isLoading || (!dataReady && !dataLoadFailed) || showGa4LockedState}
                        placeholder={placeholder}
                        isLoading={isLoading}
                        unavailable={aiUnavailable}
                        credits={credits}
                    />
                </div>
            </div>

            <HistoryDrawer
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                activeId={historyOpen ? getOrCreateThreadId() : null}
                onSelect={openThread}
            />
        </div>
    );
}
