'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Handshake, Inbox, Mail, Megaphone, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toaster';
import { billingPeriodSuffix, formatCents, REQUEST_STATUS_FLOW } from '@/lib/adSlots';
import { timeAgo } from '@/lib/leaderboard/format';
import type { InboxItem } from '@/lib/leaderboard/types';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

const KIND: Record<InboxItem['kind'], { label: string; icon: typeof Mail; variant: 'brand' | 'info' | 'warn' }> = {
    sponsorship: { label: 'Sponsorship', icon: Megaphone, variant: 'warn' },
    acquisition: { label: 'Acquisition offer', icon: Tag, variant: 'brand' },
    partnership: { label: 'Partnership', icon: Handshake, variant: 'info' },
};

const INQUIRY_STATUSES = [
    { value: 'new', label: 'New' }, { value: 'read', label: 'Read' }, { value: 'replied', label: 'Replied' }, { value: 'archived', label: 'Archived' },
];

export function useInbox() {
    return useSWR<{ items: InboxItem[]; unread: number }>('/api/leaderboard/me/inbox', fetcher, { revalidateOnFocus: true });
}

export function InboxPanel({ entryId }: { entryId?: number }) {
    const { data, isLoading, mutate } = useInbox();
    const [busy, setBusy] = useState<string | null>(null);
    const items = (data?.items ?? []).filter((i) => entryId === undefined || i.entry_id === entryId);

    async function setStatus(item: InboxItem, source: 'inquiry' | 'slot_request', id: number, status: string) {
        const key = `${source}:${id}`;
        setBusy(key);
        try {
            const res = await fetch(`/api/leaderboard/me/inbox/${source}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not update.');
            await mutate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update.');
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card>
            <CardHeader title="Offers" description="Sponsorship, acquisition and partnership offers sent from your public profile. Reply to them by email." />
            {isLoading ? (
                <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" rounded="card" />)}</div>
            ) : items.length === 0 ? (
                <EmptyState variant="inline" icon={Inbox} title="No offers yet" description="Turn on what you are open to in the Profile tab. Offers show up here and by email." />
            ) : (
                <ul className="flex flex-col gap-3">
                    {items.map((it) => {
                        const k = KIND[it.kind];
                        const slotReq = it.slot_request;
                        const key = `${it.source}:${it.id}`;
                        return (
                            <li key={key} className="rounded-control border border-border-subtle p-3.5">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <Badge variant={k.variant}><k.icon aria-hidden size={11} /> {k.label}</Badge>
                                    <span className="text-body font-semibold text-fg">{it.name || it.email}</span>
                                    {it.company ? <span className="text-body-sm text-fg-muted">{it.company}</span> : null}
                                    <span className="text-meta text-fg-faint">{timeAgo(it.created_at)} · {it.site_name}</span>
                                    <span className="ml-auto flex items-center gap-2">
                                        {it.status === 'new' ? <Badge variant="up">New</Badge> : null}
                                        {it.source === 'inquiry' ? (
                                            <Select size="sm" ariaLabel="Status" value={it.status} disabled={busy === key} onValueChange={(v) => void setStatus(it, 'inquiry', it.id, v)} options={INQUIRY_STATUSES} className="w-32" />
                                        ) : (
                                            <Select size="sm" ariaLabel="Status" value={it.status} disabled={busy === key} onValueChange={(v) => void setStatus(it, 'slot_request', it.id, v)} options={REQUEST_STATUS_FLOW.map((s) => ({ value: s.value, label: s.label }))} className="w-32" />
                                        )}
                                    </span>
                                </div>
                                {it.message ? <p className="mt-2 whitespace-pre-line text-body text-fg-secondary">{it.message}</p> : null}
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-fg-muted">
                                    {it.budget ? <span>Budget: <span className="text-fg-secondary">{it.budget}</span></span> : null}
                                    {slotReq ? (
                                        <span className="flex flex-wrap items-center gap-2">
                                            Slot: <span className="text-fg-secondary">{slotReq.slot_name_at_request}</span>
                                            <span className="tabular-nums">{formatCents(slotReq.price_cents_at_request)} {billingPeriodSuffix(slotReq.billing_period_at_request)}</span>
                                            {it.source === 'inquiry' ? (
                                                <Select size="sm" ariaLabel="Slot request status" value={slotReq.status} disabled={busy === `slot_request:${slotReq.id}`} onValueChange={(v) => void setStatus(it, 'slot_request', slotReq.id, v)} options={REQUEST_STATUS_FLOW.map((s) => ({ value: s.value, label: s.label }))} className="w-32" />
                                            ) : null}
                                        </span>
                                    ) : null}
                                    <a href={`mailto:${it.email}?subject=${encodeURIComponent(`Re: your ${k.label.toLowerCase()} for ${it.site_name ?? 'my site'}`)}`} className="ml-auto inline-flex items-center gap-1.5 font-medium text-brand-text hover:underline">
                                        <Mail aria-hidden size={14} /> {it.email}
                                    </a>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
