'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RotateCcw } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/format';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export interface HistoryThread {
    id: string;
    title: string;
    last_message_at: string;
    site_url?: string;
}

function hostOf(siteUrl?: string): string {
    return siteUrl ? siteUrl.replace(/^sc-domain:|^https?:\/\//, '').replace(/\/$/, '') : '';
}

/** Past conversations, loaded from the chat store when the drawer opens (DESIGN 5.11 threads column). */
export function HistoryDrawer({ open, onOpenChange, activeId, onSelect }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeId: string | null;
    onSelect: (threadId: string) => void | Promise<void>;
}) {
    const [threads, setThreads] = useState<HistoryThread[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/chat-store?action=list_threads&limit=30');
            if (!res.ok) {
                setError('Could not load past conversations.');
                return;
            }
            const data = await res.json();
            setThreads(Array.isArray(data?.threads) ? data.threads : []);
        } catch {
            setError('Could not load past conversations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    return (
        <Drawer open={open} onOpenChange={onOpenChange} title="History" subtitle="Your past questions to Ask">
            {loading && threads.length === 0 ? (
                <div className="flex flex-col gap-2" aria-busy>
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" rounded="card" />)}
                </div>
            ) : error ? (
                <Banner variant="danger" actions={<Button size="sm" icon={RotateCcw} onClick={() => void load()}>Try again</Button>}>{error}</Banner>
            ) : threads.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No saved conversations yet" description="Ask a question and it will show up here." />
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {threads.map((t) => (
                        <li key={t.id}>
                            <button
                                type="button"
                                onClick={() => void onSelect(t.id)}
                                aria-current={t.id === activeId ? 'true' : undefined}
                                className={cn(
                                    'flex w-full items-start justify-between gap-3 rounded-control border border-transparent px-3 py-2.5 text-left transition-colors duration-120 hover:bg-subtle',
                                    t.id === activeId && 'border-border bg-subtle',
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-body font-medium text-fg">{t.title || 'Untitled'}</span>
                                    {hostOf(t.site_url) ? <span className="block truncate text-meta text-fg-muted">{hostOf(t.site_url)}</span> : null}
                                </span>
                                <span className="shrink-0 text-meta text-fg-muted tabular-nums">
                                    {t.last_message_at ? fmtDay(t.last_message_at) : ''}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Drawer>
    );
}
