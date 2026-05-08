'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    LifeBuoy,
    Mail,
    Send,
    Sparkles,
    ShieldCheck,
    AlertCircle,
    Loader2,
    Check,
    CheckCheck,
} from 'lucide-react';
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

const SUPPORT_EMAILS = [
    {
        address: 'hello@trafficclaw.com',
        label: 'Talk to a human',
    },
    {
        address: 'trafficclaw@gmail.com',
        label: 'Backup inbox',
    },
] as const;

function formatTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatRelative(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// True when this message should hide its avatar + author label because the
// previous message is from the same sender and arrived within 5 minutes.
function shouldGroup(prev: SupportMessage | undefined, curr: SupportMessage): boolean {
    if (!prev) return false;
    if (prev.author_type !== curr.author_type) return false;
    if (!prev.created_at || !curr.created_at) return false;
    const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return gap < 5 * 60 * 1000;
}

export default function SupportPage() {
    const { data: session } = useSession();
    const userName = session?.user?.name || 'You';
    const userImage = (session?.user as { image?: string | null } | undefined)?.image || null;
    const userInitial = (userName.trim()[0] || 'Y').toUpperCase();

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

    // Mark admin replies read once on mount so the sidebar / header badge clears.
    useEffect(() => {
        void fetch('/api/support/messages/read', { method: 'PATCH' });
    }, []);

    // Stick to bottom on new messages unless the user has scrolled up to read history.
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
                    toast.error(payload?.error || 'Couldn’t send message — please try again.');
                }
                await mutate();
            } else {
                await mutate();
            }
        } catch {
            toast.error('Network error — your message wasn’t sent. Try again.');
            await mutate();
        } finally {
            setSending(false);
            composerRef.current?.focus();
        }
    };

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setAutoScroll(distFromBottom < 80);
    };

    return (
        <div className="min-h-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-5xl mx-auto w-full">
            {/* ── Page header ───────────────────────────────────────────── */}
            <header className="mb-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    <LifeBuoy className="h-3 w-3" />
                    Help &amp; Support
                </div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-white">
                    How can we help?
                </h1>
                <p className="mt-1.5 text-sm text-zinc-400 max-w-xl">
                    Drop a message below — we read every one personally and reply within 24 hours.
                </p>
            </header>

            {/* ── Compact email cards (secondary) ───────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
                {SUPPORT_EMAILS.map((c) => (
                    <a
                        key={c.address}
                        href={`mailto:${c.address}`}
                        className="group flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3.5 py-2.5 transition-all hover:border-emerald-500/25 hover:bg-emerald-500/[0.04]"
                    >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                            <Mail className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                                {c.label}
                            </div>
                            <div className="text-[13px] font-medium text-white truncate">{c.address}</div>
                        </div>
                        <span className="text-[10px] text-zinc-600 group-hover:text-emerald-400/70 transition-colors flex-shrink-0">
                            Send →
                        </span>
                    </a>
                ))}
            </div>

            {/* ── Hero chat panel ───────────────────────────────────────── */}
            <section
                className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] via-white/[0.02] to-transparent flex flex-col overflow-hidden h-[min(720px,calc(100vh-300px))] min-h-[500px] shadow-2xl shadow-black/50"
            >
                {/* Glow accent in the corner */}
                <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-cyan-500/[0.06] blur-3xl" />

                {/* Chat header */}
                <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5 bg-gradient-to-r from-white/[0.03] to-transparent backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-lg shadow-emerald-500/20">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0a0d12]" />
                            </span>
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white">TrafficClaw Support</div>
                            <div className="text-[11px] text-emerald-400/90">Online · Typically replies within 24h</div>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <ShieldCheck className="h-3 w-3" />
                        Private — only you and the team
                    </div>
                </div>

                {/* Message viewport */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="relative flex-1 overflow-y-auto px-4 sm:px-6 py-6"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)',
                        backgroundSize: '24px 24px',
                    }}
                >
                    {isLoading && messages.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <ConversationStream
                            messages={messages}
                            userName={userName}
                            userImage={userImage}
                            userInitial={userInitial}
                            sending={sending}
                        />
                    )}
                </div>

                {/* Composer */}
                <div className="relative border-t border-white/[0.06] bg-[#0a0d12]/80 backdrop-blur-md px-3 sm:px-4 py-3">
                    <div
                        className={`flex items-end gap-2 bg-white/[0.04] rounded-2xl px-4 py-3 border-2 transition-all ${
                            tooLong
                                ? 'border-red-500/40 focus-within:border-red-500/60 focus-within:shadow-[0_0_0_4px_rgba(239,68,68,0.08)]'
                                : 'border-white/[0.06] focus-within:border-emerald-500/40 focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]'
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
                            placeholder="Tell us what's on your mind…"
                            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
                            rows={1}
                            style={{ minHeight: '24px', maxHeight: '160px' }}
                            disabled={sending}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!canSend}
                            className={`h-9 w-9 sm:h-9 sm:w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                                canSend
                                    ? 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105 active:scale-95'
                                    : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'
                            }`}
                            aria-label="Send message"
                        >
                            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                    </div>

                    {nearLimit ? (
                        <div className="mt-1.5 px-1 flex items-center justify-between gap-3">
                            <span className={`text-[10px] font-medium ${tooLong ? 'text-red-400' : 'text-amber-500/80'}`}>
                                {tooLong
                                    ? `Message too long — shorten by ${(length - MAX_INPUT_CHARS).toLocaleString()} characters`
                                    : 'Long message — that’s fine, we’ll read it carefully'}
                            </span>
                            <span className={`text-[10px] font-mono tabular-nums ${tooLong ? 'text-red-400' : 'text-amber-500/70'}`}>
                                {length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                            </span>
                        </div>
                    ) : (
                        <div className="mt-1.5 px-1 flex items-center justify-between gap-3 text-[10px] text-zinc-600">
                            <span>Press <kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-mono text-[9px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] font-mono text-[9px]">Shift+Enter</kbd> for newline</span>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Footnote ──────────────────────────────────────────────── */}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
                <AlertCircle className="h-3 w-3" />
                For urgent issues outside business hours, email us directly — we’re notified faster on email.
            </p>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
            <div className="relative mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-400 ring-1 ring-emerald-500/20">
                    <LifeBuoy className="h-7 w-7" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                </span>
            </div>
            <h3 className="text-base font-semibold text-white">Start the conversation</h3>
            <p className="mt-1.5 text-sm text-zinc-400 max-w-xs leading-relaxed">
                Bug reports, feature requests, billing questions — anything goes. We read every one personally.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-zinc-600">
                <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.05]">💡 Feature idea</span>
                <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.05]">🐛 Bug report</span>
                <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.05]">💳 Billing question</span>
                <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.05]">❓ How do I…</span>
            </div>
        </div>
    );
}

function ConversationStream({
    messages,
    userName,
    userImage,
    userInitial,
    sending,
}: {
    messages: SupportMessage[];
    userName: string;
    userImage: string | null;
    userInitial: string;
    sending: boolean;
}) {
    return (
        <div className="space-y-1.5">
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
                            <MessageBubble
                                msg={m}
                                grouped={grouped}
                                isLastInGroup={isLastInGroup}
                                userName={userName}
                                userImage={userImage}
                                userInitial={userInitial}
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
        <div className="flex items-center gap-3 my-4 first:mt-0">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-500 px-2">
                {dayLabel(iso)}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>
    );
}

function MessageBubble({
    msg,
    grouped,
    isLastInGroup,
    userName,
    userImage,
    userInitial,
    pending,
    delivered,
}: {
    msg: SupportMessage;
    grouped: boolean;
    isLastInGroup: boolean;
    userName: string;
    userImage: string | null;
    userInitial: string;
    pending: boolean;
    delivered: boolean;
}) {
    const isUser = msg.author_type === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${grouped ? 'mt-0.5' : 'mt-3'}`}
        >
            {/* Avatar (only on first message in a group) */}
            <div className="w-8 flex-shrink-0">
                {!grouped && (
                    <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold overflow-hidden ${
                            isUser
                                ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
                                : 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-md shadow-emerald-500/20'
                        }`}
                    >
                        {isUser ? (
                            userImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={userImage} alt={userName} className="h-full w-full object-cover" />
                            ) : (
                                userInitial
                            )
                        ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                        )}
                    </div>
                )}
            </div>

            {/* Bubble + author label */}
            <div className={`min-w-0 max-w-[80%] sm:max-w-[68%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                {!grouped && (
                    <div className={`flex items-center gap-2 mb-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="text-[11px] font-semibold text-zinc-300">
                            {isUser ? userName : 'TrafficClaw Support'}
                        </span>
                        <span className="text-[10px] text-zinc-600 tabular-nums">
                            {formatTime(msg.created_at)}
                        </span>
                    </div>
                )}
                <div
                    className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-md ${
                        isUser
                            ? `bg-gradient-to-br from-cyan-500/20 to-cyan-600/15 text-cyan-50 border border-cyan-500/25 shadow-cyan-500/10 ${grouped ? 'rounded-tr-2xl' : 'rounded-tr-md'}`
                            : `bg-gradient-to-br from-white/[0.07] to-white/[0.04] text-zinc-100 border border-white/[0.08] shadow-black/30 ${grouped ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                    }`}
                >
                    {msg.content}
                </div>
                {/* Per-bubble time + status (only on the last message of a group) */}
                {isLastInGroup && (
                    <div className={`flex items-center gap-1 mt-1 px-1 text-[10px] text-zinc-600 ${isUser ? 'flex-row-reverse' : ''}`}>
                        <span className="tabular-nums">{formatRelative(msg.created_at)}</span>
                        {isUser && (
                            pending ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : delivered ? (
                                msg.read_at ? <CheckCheck className="h-3 w-3 text-emerald-400" /> : <Check className="h-3 w-3" />
                            ) : null
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
