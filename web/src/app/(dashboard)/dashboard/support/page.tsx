'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowUp, Check, CheckCheck, Loader2 } from 'lucide-react';
import { MAX_INPUT_CHARS, WARN_INPUT_CHARS, ERR_MESSAGE_TOO_LONG } from '@/lib/chatLimits';

type SupportMessage = {
    id: number;
    author_type: 'user' | 'admin';
    author_admin_id: string | null;
    content: string;
    created_at: string | null;
    read_at: string | null;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

function formatTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayKey(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const diffDay = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDay < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
}

// Group messages from the same sender within 5 min so consecutive replies
// don't repeat the avatar + name on every line.
function shouldGroup(prev: SupportMessage | undefined, curr: SupportMessage): boolean {
    if (!prev) return false;
    if (prev.author_type !== curr.author_type) return false;
    if (!prev.created_at || !curr.created_at) return false;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
}

export default function SupportPage() {
    const { data: session } = useSession();
    const userName = session?.user?.name?.split(' ')[0] || 'You';

    const { data, isLoading, mutate } = useSWR<{ messages: SupportMessage[]; exists?: boolean }>(
        '/api/support/messages',
        fetcher,
        { refreshInterval: 30_000, revalidateOnFocus: true },
    );
    const messages = useMemo(() => data?.messages ?? [], [data]);

    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        void fetch('/api/support/messages/read', { method: 'PATCH' });
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages, autoScroll, sending]);

    const length = input.length;
    const tooLong = length > MAX_INPUT_CHARS;
    const nearLimit = length >= WARN_INPUT_CHARS;
    const canSend = Boolean(input.trim()) && !tooLong && !sending;

    const handleSend = async () => {
        const content = input.trim();
        if (!content || sending) return;
        if (content.length > MAX_INPUT_CHARS) {
            toast.error(`Message is too long (${content.length.toLocaleString()} chars). Trim or split it.`);
            return;
        }
        setSending(true);
        const optimistic: SupportMessage = {
            id: -Date.now(),
            author_type: 'user',
            author_admin_id: null,
            content,
            created_at: new Date().toISOString(),
            read_at: null,
        };
        await mutate(
            (prev) => ({ ...(prev || { messages: [] }), messages: [...(prev?.messages || []), optimistic] }),
            false,
        );
        setInput('');
        setAutoScroll(true);
        try {
            const res = await fetch('/api/support/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (payload?.code === ERR_MESSAGE_TOO_LONG) {
                    toast.error(payload.error || 'Message too long.');
                } else {
                    toast.error(payload?.error || 'Couldn’t send your message. Try again.');
                }
                await mutate();
            } else {
                await mutate();
            }
        } catch {
            toast.error('Network error — your message wasn’t sent.');
            await mutate();
        } finally {
            setSending(false);
            composerRef.current?.focus();
        }
    };

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    };

    return (
        <div className="min-h-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-3xl mx-auto w-full">
            {/* Title block — quiet, no decorative chip */}
            <header className="mb-6">
                <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.02em] text-white leading-tight">
                    Help &amp; Support
                </h1>
                <p className="mt-1.5 text-[14px] text-zinc-400">
                    We typically reply within 24 hours. Drop a message below.
                </p>
            </header>

            {/* Conversation card */}
            <section className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 overflow-hidden flex flex-col h-[min(680px,calc(100vh-280px))] min-h-[480px]">
                {/* Header strip */}
                <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 text-[12px] font-semibold tracking-wide">
                        TC
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-white">TrafficClaw Support</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Online · We&apos;ll reply within 24h
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
                >
                    {isLoading && messages.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-zinc-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <EmptyState userName={userName} />
                    ) : (
                        <ConversationStream messages={messages} sending={sending} />
                    )}
                </div>

                {/* Composer */}
                <div className="border-t border-white/[0.05] p-3">
                    <div
                        className={`flex items-end gap-2 rounded-xl px-3.5 py-2.5 bg-white/[0.03] border transition-colors ${
                            tooLong
                                ? 'border-red-500/40 focus-within:border-red-500/60'
                                : 'border-white/[0.06] focus-within:border-emerald-500/40'
                        }`}
                    >
                        <textarea
                            ref={composerRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (canSend) void handleSend();
                                }
                            }}
                            placeholder="Message TrafficClaw Support…"
                            className="flex-1 bg-transparent text-[14px] text-white placeholder-zinc-600 focus:outline-none resize-none leading-relaxed"
                            rows={1}
                            style={{ minHeight: '24px', maxHeight: '160px' }}
                            disabled={sending}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!canSend}
                            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                                canSend
                                    ? 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95'
                                    : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'
                            }`}
                            aria-label="Send message"
                        >
                            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                        </button>
                    </div>

                    <div className="mt-1.5 px-1 flex items-center justify-between gap-3 text-[10px]">
                        {nearLimit ? (
                            <>
                                <span className={`font-medium ${tooLong ? 'text-red-400' : 'text-amber-500/80'}`}>
                                    {tooLong
                                        ? `Too long — shorten by ${(length - MAX_INPUT_CHARS).toLocaleString()} chars`
                                        : 'Long message — that’s fine, we’ll read it'}
                                </span>
                                <span className={`font-mono tabular-nums ${tooLong ? 'text-red-400' : 'text-amber-500/70'}`}>
                                    {length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                                </span>
                            </>
                        ) : (
                            <span className="text-zinc-600">
                                <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono text-[9px]">Enter</kbd>
                                {' to send · '}
                                <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono text-[9px]">Shift+Enter</kbd>
                                {' for newline'}
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {/* Email fallback — quiet text, not big cards */}
            <p className="mt-6 text-[12px] text-zinc-500 text-center">
                Prefer email?{' '}
                <a href="mailto:hello@trafficclaw.com" className="text-zinc-300 hover:text-emerald-300 transition-colors underline-offset-4 hover:underline">
                    hello@trafficclaw.com
                </a>
                {' · '}
                <a href="mailto:trafficclaw@gmail.com" className="text-zinc-300 hover:text-emerald-300 transition-colors underline-offset-4 hover:underline">
                    trafficclaw@gmail.com
                </a>
            </p>
        </div>
    );
}

function EmptyState({ userName }: { userName: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <h3 className="text-[15px] font-semibold text-white">Hi {userName}, how can we help?</h3>
            <p className="mt-1.5 text-[13px] text-zinc-500 max-w-sm leading-relaxed">
                Bug reports, billing, feature requests — anything. We read every message personally and reply within 24 hours.
            </p>
        </div>
    );
}

function ConversationStream({ messages, sending }: { messages: SupportMessage[]; sending: boolean }) {
    return (
        <div className="space-y-1">
            <AnimatePresence initial={false}>
                {messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const grouped = shouldGroup(prev, m);
                    const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                    const isLastInGroup = !next || next.author_type !== m.author_type || !shouldGroup(m, next);
                    const isOptimistic = m.id < 0;
                    return (
                        <div key={m.id}>
                            {showDay && <DaySeparator iso={m.created_at} />}
                            <Bubble
                                msg={m}
                                grouped={grouped}
                                isLastInGroup={isLastInGroup}
                                pending={isOptimistic && sending}
                                delivered={!isOptimistic}
                            />
                        </div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function DaySeparator({ iso }: { iso: string | null }) {
    return (
        <div className="flex items-center justify-center my-4 first:mt-0">
            <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-zinc-600 px-2.5 py-0.5 rounded-full bg-white/[0.02] border border-white/[0.04]">
                {dayLabel(iso)}
            </span>
        </div>
    );
}

function Bubble({
    msg,
    grouped,
    isLastInGroup,
    pending,
    delivered,
}: {
    msg: SupportMessage;
    grouped: boolean;
    isLastInGroup: boolean;
    pending: boolean;
    delivered: boolean;
}) {
    const isUser = msg.author_type === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-3'}`}
        >
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[78%] sm:max-w-[68%]`}>
                {!grouped && (
                    <div className="text-[11px] text-zinc-500 mb-1 px-1">
                        {isUser ? null : 'TrafficClaw Support'}
                    </div>
                )}
                <div
                    className={`px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                            ? `bg-emerald-500 text-emerald-50 ${grouped ? 'rounded-2xl' : 'rounded-2xl rounded-tr-md'}`
                            : `bg-white/[0.06] text-zinc-100 ${grouped ? 'rounded-2xl' : 'rounded-2xl rounded-tl-md'}`
                    }`}
                >
                    {msg.content}
                </div>
                {isLastInGroup && (
                    <div className={`flex items-center gap-1 mt-1 px-1 text-[10px] text-zinc-600 tabular-nums ${isUser ? 'flex-row-reverse' : ''}`}>
                        <span>{formatTime(msg.created_at)}</span>
                        {isUser && (
                            pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : delivered
                                ? msg.read_at
                                    ? <CheckCheck className="h-3 w-3 text-emerald-400" />
                                    : <Check className="h-3 w-3" />
                                : null
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
