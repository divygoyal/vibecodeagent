'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, Clock, LifeBuoy, Loader2, Lock, Mail, MessageCircle } from 'lucide-react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { openLiveChat } from '@/components/ui/chatWidget';
import { cn } from '@/lib/cn';
import { MAX_INPUT_CHARS, WARN_INPUT_CHARS, ERR_MESSAGE_TOO_LONG } from '@/lib/chatLimits';
import { BRAND_NAME } from '@/lib/brand';

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

// Group messages from the same sender within 5 minutes so consecutive replies
// do not repeat the sender name on every line.
function shouldGroup(prev: SupportMessage | undefined, curr: SupportMessage): boolean {
    if (!prev) return false;
    if (prev.author_type !== curr.author_type) return false;
    if (!prev.created_at || !curr.created_at) return false;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
}

/** Support (DESIGN 4.1): a private thread with the team, plus the other ways to reach us. */
export default function SupportPage() {
    const { data: session } = useSession();
    const userName = session?.user?.name?.split(' ')[0] || 'there';

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

    // Opening the page marks the team's replies as read.
    useEffect(() => {
        void fetch('/api/support/messages/read', { method: 'PATCH' });
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages, autoScroll, sending]);

    // Autosize the composer.
    useEffect(() => {
        const el = composerRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [input]);

    const length = input.length;
    const tooLong = length > MAX_INPUT_CHARS;
    const nearLimit = length >= WARN_INPUT_CHARS;
    const canSend = Boolean(input.trim()) && !tooLong && !sending;

    const handleSend = async () => {
        const content = input.trim();
        if (!content || sending) return;
        if (content.length > MAX_INPUT_CHARS) {
            toast.error(`Message is too long (${content.length.toLocaleString()} characters). Trim or split it.`);
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
                    toast.error(payload?.error || 'Could not send your message. Try again.');
                }
            }
            await mutate();
        } catch {
            toast.error('Network error: your message was not sent.');
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
        <div className="max-w-[1040px]">
            <PageHeader title="Support" subtitle="Ask us anything. We read every message and usually reply within 24 hours." />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                {/* Conversation */}
                <Card as="section" padding="none" aria-label="Conversation with support" className="flex h-[calc(100dvh-16rem)] min-h-[460px] max-h-[720px] flex-col overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
                            <LifeBuoy aria-hidden size={18} strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-title-sm text-fg">{BRAND_NAME} support</h2>
                            <p className="flex items-center gap-1.5 text-meta text-fg-muted"><Clock aria-hidden size={12} />Replies within 24 hours</p>
                        </div>
                    </div>

                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        role="log"
                        aria-label="Messages"
                        aria-live="polite"
                        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                    >
                        {isLoading && messages.length === 0 ? (
                            <div className="flex flex-col gap-3" aria-busy>
                                <Skeleton className="h-10 w-2/3" rounded="card" />
                                <Skeleton className="ml-auto h-10 w-1/2" rounded="card" />
                                <Skeleton className="h-10 w-3/5" rounded="card" />
                            </div>
                        ) : messages.length === 0 ? (
                            <EmptyState
                                variant="page"
                                icon={LifeBuoy}
                                title={`Hi ${userName}, how can we help?`}
                                description="Bug reports, billing, a missing site or a feature idea: write it below and a person will answer."
                                className="h-full justify-center py-0"
                            />
                        ) : (
                            <ConversationStream messages={messages} sending={sending} />
                        )}
                    </div>

                    <div className="border-t border-border-subtle p-3">
                        <div
                            className={cn(
                                'flex items-end gap-2 rounded-card border bg-surface px-3 py-2 transition-colors duration-120',
                                tooLong ? 'border-down' : 'border-border focus-within:border-border-strong',
                            )}
                        >
                            <label htmlFor="support-composer" className="sr-only">Message to support</label>
                            <textarea
                                id="support-composer"
                                ref={composerRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        if (canSend) void handleSend();
                                    }
                                }}
                                placeholder="Write a message…"
                                rows={1}
                                disabled={sending}
                                aria-invalid={tooLong || undefined}
                                className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-body-lg text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
                            />
                            <Button
                                variant="primary"
                                iconOnly
                                icon={ArrowUp}
                                aria-label="Send message"
                                onClick={() => void handleSend()}
                                disabled={!canSend}
                                loading={sending}
                                className="size-9 rounded-full"
                            />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-meta">
                            {nearLimit ? (
                                <>
                                    <span className={tooLong ? 'text-down' : 'text-warn'}>
                                        {tooLong ? `Too long: shorten by ${(length - MAX_INPUT_CHARS).toLocaleString()} characters` : 'Long message, that is fine, we will read it'}
                                    </span>
                                    <span className={cn('tabular-nums', tooLong ? 'text-down' : 'text-fg-muted')}>
                                        {length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                                    </span>
                                </>
                            ) : (
                                <span className="text-fg-muted">Enter to send, Shift+Enter for a new line</span>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Other ways to get help */}
                <aside aria-label="Other ways to get help" className="flex flex-col gap-3">
                    <OptionCard onClick={openLiveChat} icon={MessageCircle} title="Chat with us" subtitle="Live chat when the team is online" />
                    <OptionCard href="/dashboard/docs" icon={BookOpen} title="Docs" subtitle="Guides for every part of the app" />
                    <OptionCard href="mailto:hello@trafficclaw.com" icon={Mail} title="Email us" subtitle="hello@trafficclaw.com" external />
                    <Card padding="sm">
                        <h3 className="flex items-center gap-2 text-title-sm text-fg"><Clock aria-hidden size={16} className="text-fg-muted" />How support works</h3>
                        <p className="mt-1.5 text-body-sm text-fg-muted">
                            We answer in this thread, usually within 24 hours, Monday to Friday, 9am to 6pm UTC.
                        </p>
                    </Card>
                    <Card padding="sm">
                        <h3 className="flex items-center gap-2 text-title-sm text-fg"><Lock aria-hidden size={16} className="text-fg-muted" />Private</h3>
                        <p className="mt-1.5 text-body-sm text-fg-muted">
                            Only you and the team can read this conversation. We never share it.
                        </p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

function OptionCard({ href, onClick, icon: Icon, title, subtitle, external }: {
    href?: string;
    onClick?: () => void;
    icon: typeof Mail;
    title: string;
    subtitle: string;
    external?: boolean;
}) {
    const inner = (
        <Card padding="sm" interactive className="group flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                <Icon aria-hidden size={16} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-fg">{title}</span>
                <span className="block truncate text-body-sm text-fg-muted">{subtitle}</span>
            </span>
            <ArrowRight aria-hidden size={16} className="shrink-0 text-fg-faint transition-transform duration-120 group-hover:translate-x-0.5 group-hover:text-fg-muted" />
        </Card>
    );
    if (!href) return <button type="button" onClick={onClick} className="block w-full rounded-card text-left focus-visible:outline-2">{inner}</button>;
    return external
        ? <a href={href} className="block rounded-card focus-visible:outline-2">{inner}</a>
        : <Link href={href} className="block rounded-card focus-visible:outline-2">{inner}</Link>;
}

function ConversationStream({ messages, sending }: { messages: SupportMessage[]; sending: boolean }) {
    return (
        <div className="space-y-1">
            {messages.map((m, i) => {
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const grouped = shouldGroup(prev, m);
                const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                const isLastInGroup = !next || next.author_type !== m.author_type || !shouldGroup(m, next);
                const isOptimistic = m.id < 0;
                return (
                    <div key={m.id}>
                        {showDay ? <DaySeparator iso={m.created_at} /> : null}
                        <Bubble msg={m} grouped={grouped} isLastInGroup={isLastInGroup} pending={isOptimistic && sending} delivered={!isOptimistic} />
                    </div>
                );
            })}
        </div>
    );
}

function DaySeparator({ iso }: { iso: string | null }) {
    return (
        <div className="my-4 flex items-center justify-center first:mt-0">
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-caption text-fg-muted">{dayLabel(iso)}</span>
        </div>
    );
}

function Bubble({ msg, grouped, isLastInGroup, pending, delivered }: {
    msg: SupportMessage;
    grouped: boolean;
    isLastInGroup: boolean;
    pending: boolean;
    delivered: boolean;
}) {
    const isUser = msg.author_type === 'user';
    return (
        <div className={cn('flex animate-fade-in', isUser ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-3')}>
            <div className={cn('flex max-w-[82%] flex-col sm:max-w-[70%]', isUser ? 'items-end' : 'items-start')}>
                {!grouped && !isUser ? <div className="mb-1 px-1 text-meta text-fg-muted">{BRAND_NAME} support</div> : null}
                <div
                    className={cn(
                        'whitespace-pre-wrap break-words rounded-card px-3.5 py-2 text-body-lg',
                        isUser ? 'bg-subtle-strong text-fg' : 'border border-border-subtle bg-surface text-fg shadow-xs',
                    )}
                >
                    {msg.content}
                </div>
                {isLastInGroup ? (
                    <div className={cn('mt-1 flex items-center gap-1 px-1 text-caption text-fg-muted tabular-nums', isUser && 'flex-row-reverse')}>
                        <span>{formatTime(msg.created_at)}</span>
                        {isUser ? (
                            pending ? <Loader2 aria-label="Sending" className="size-3 animate-spin" />
                                : delivered
                                    ? msg.read_at
                                        ? <CheckCheck aria-label="Read" className="size-3.5 text-info" />
                                        : <Check aria-label="Sent" className="size-3.5" />
                                    : null
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
