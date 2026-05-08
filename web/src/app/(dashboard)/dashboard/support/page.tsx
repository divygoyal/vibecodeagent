'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
    LifeBuoy,
    Mail,
    Send,
    Sparkles,
    Clock,
    ShieldCheck,
    AlertCircle,
    Loader2,
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
        description: 'Best for product questions, integration help, partnership chat.',
    },
    {
        address: 'trafficclaw@gmail.com',
        label: 'Backup inbox',
        description: 'If your message bounces or you can’t reach the main address.',
    },
] as const;

function formatTimestamp(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

    // Mark admin replies read once on mount so the sidebar badge clears.
    // We don't need to await — best-effort, the SWR poll above will keep
    // local state fresh either way.
    useEffect(() => {
        void fetch('/api/support/messages/read', { method: 'PATCH' });
    }, []);

    // Stick to the bottom whenever new messages land — unless the user has
    // intentionally scrolled up to read older context.
    useEffect(() => {
        if (!autoScroll) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages, autoScroll]);

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
        // Optimistic insert so the bubble appears instantly even on slow networks.
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
                // Roll back the optimistic bubble.
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
            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="mb-6 sm:mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    <LifeBuoy className="h-3 w-3" />
                    Help &amp; Support
                </div>
                <h1 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-white">
                    How can we help?
                </h1>
                <p className="mt-2 text-sm text-zinc-400 max-w-xl">
                    Drop a message below — we read every one personally and reply within 24 hours.
                    Prefer email? Use one of the addresses below.
                </p>
            </header>

            {/* ── Email contact cards ───────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {SUPPORT_EMAILS.map((c) => (
                    <a
                        key={c.address}
                        href={`mailto:${c.address}`}
                        className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
                    >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                            <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                                    {c.label}
                                </span>
                                <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                    Click to email
                                </span>
                            </div>
                            <div className="mt-1 text-sm font-medium text-white truncate">{c.address}</div>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{c.description}</p>
                        </div>
                    </a>
                ))}
            </div>

            {/* ── Chat panel ────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col overflow-hidden h-[min(640px,calc(100vh-340px))] min-h-[420px]">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 bg-white/[0.015]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-black">
                            <Sparkles className="h-3.5 w-3.5" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white">TrafficClaw Support</div>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Typically replies within 24h
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                        <ShieldCheck className="h-3 w-3" />
                        Private — only you and the team can read this
                    </div>
                </div>

                {/* Message list */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
                >
                    {isLoading && messages.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                                <LifeBuoy className="h-5 w-5" />
                            </div>
                            <h3 className="text-base font-semibold text-white">No messages yet</h3>
                            <p className="mt-1.5 text-sm text-zinc-400 max-w-xs">
                                Drop us a message below — bug reports, feature requests, billing questions, anything.
                                We read every one personally.
                            </p>
                        </div>
                    ) : (
                        messages.map((m) => (
                            <MessageRow
                                key={m.id}
                                msg={m}
                                userName={userName}
                                userImage={userImage}
                                userInitial={userInitial}
                            />
                        ))
                    )}
                </div>

                {/* Composer */}
                <div className="border-t border-white/[0.06] bg-[var(--sidebar-bg,#0a0b0e)] px-3 py-3">
                    <div
                        className={`flex items-end gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 border transition-colors ${
                            tooLong
                                ? 'border-red-500/40 focus-within:border-red-500/60'
                                : 'border-white/[0.04] focus-within:border-emerald-500/30'
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
                            placeholder="Tell us what's on your mind… (Shift+Enter for newline)"
                            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none leading-relaxed"
                            rows={1}
                            style={{ minHeight: '24px', maxHeight: '160px' }}
                            disabled={sending}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!canSend}
                            className="w-9 h-9 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-emerald-500 enabled:text-white text-zinc-500 transition-all enabled:hover:bg-emerald-400 flex-shrink-0"
                            aria-label="Send message"
                        >
                            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                    </div>

                    {nearLimit && (
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

function MessageRow({
    msg,
    userName,
    userImage,
    userInitial,
}: {
    msg: SupportMessage;
    userName: string;
    userImage: string | null;
    userInitial: string;
}) {
    const isUser = msg.author_type === 'user';
    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isUser
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-black'
                }`}
            >
                {isUser ? (
                    userImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={userImage} alt={userName} className="h-full w-full rounded-full object-cover" />
                    ) : (
                        userInitial
                    )
                ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                )}
            </div>

            {/* Bubble */}
            <div className={`min-w-0 max-w-[80%] sm:max-w-[70%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-zinc-400">
                        {isUser ? userName : 'TrafficClaw Support'}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimestamp(msg.created_at)}
                    </span>
                </div>
                <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                            ? 'bg-cyan-500/15 text-cyan-50 border border-cyan-500/20 rounded-tr-md'
                            : 'bg-white/[0.04] text-zinc-100 border border-white/[0.06] rounded-tl-md'
                    }`}
                >
                    {msg.content}
                </div>
            </div>
        </div>
    );
}
