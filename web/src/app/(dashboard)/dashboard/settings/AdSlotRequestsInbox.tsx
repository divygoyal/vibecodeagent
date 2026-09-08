'use client';

/**
 * The publisher's inbox for ad slot requests.
 *
 * Every price on this screen is a snapshot taken when the buyer hit send
 * (`price_cents_at_request`), rendered through `formatCents`. Nothing is
 * recalculated, adjusted or projected — the paid tally is a plain count of
 * deals the publisher marked paid.
 *
 * Renders nothing when there are no requests, so a publisher who sells nothing
 * sees exactly the settings page they saw before.
 */

import { useEffect, useState } from 'react';
import { Inbox, Loader2, Mail, StickyNote, RefreshCw } from 'lucide-react';
import {
    REQUEST_STATUS_FLOW,
    requestStatusMeta,
    formatCents,
    billingPeriodSuffix,
    type AdSlotRequestRecord,
    type AdSlotRequestStatus,
} from '@/lib/adSlots';

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdSlotRequestsInbox() {
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<AdSlotRequestRecord[]>([]);
    const [paidCount, setPaidCount] = useState(0);
    const [paidCents, setPaidCents] = useState(0);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        void refresh();
    }, []);

    async function refresh() {
        setLoading(true);
        try {
            const res = await fetch('/api/ad-slots/requests', { cache: 'no-store' });
            const data = await res.json();
            setRequests(Array.isArray(data.requests) ? data.requests : []);
            setPaidCount(Number(data.paid_count) || 0);
            setPaidCents(Number(data.paid_cents) || 0);
        } catch {
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }

    /**
     * PATCH one request. `status` moves it along the pipeline (admin stamps
     * paid_at on 'paid'); `publisher_note` is private to the publisher.
     */
    async function patchRequest(
        id: number,
        body: { status?: AdSlotRequestStatus; publisher_note?: string },
    ) {
        setBusyId(id);
        setMessage(null);
        try {
            const res = await fetch(`/api/ad-slots/requests/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const raw = await res.text();
            let data: { success?: boolean; error?: string; detail?: string; request?: AdSlotRequestRecord } = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                setMessage({ tone: 'err', text: `Server returned ${res.status}.` });
                return false;
            }
            if (!res.ok || !data.success || !data.request) {
                setMessage({ tone: 'err', text: data.error || data.detail || `Could not update (status ${res.status}).` });
                return false;
            }

            // The admin response is authoritative for this row (it carries the
            // fresh status and paid_at); site_name isn't part of it, so keep ours.
            const updated = data.request;
            const nextRequests = requests.map((r) =>
                r.id === id ? { ...r, ...updated, site_name: r.site_name } : r,
            );
            setRequests(nextRequests);

            // Tally of deals actually marked paid. A count and a sum of
            // already-agreed amounts — nothing forecast.
            const paid = nextRequests.filter((r) => r.status === 'paid');
            setPaidCount(paid.length);
            setPaidCents(paid.reduce((sum, r) => sum + Number(r.price_cents_at_request || 0), 0));

            setMessage({
                tone: 'ok',
                text: body.status
                    ? `Marked ${requestStatusMeta(body.status).label.toLowerCase()}.`
                    : 'Note saved.',
            });
            return true;
        } catch {
            setMessage({ tone: 'err', text: 'Network error — please try again.' });
            return false;
        } finally {
            setBusyId(null);
        }
    }

    // Nothing to show: keep the settings page exactly as it is for publishers
    // who aren't selling anything.
    if (loading || requests.length === 0) return null;

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                        <Inbox className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-white">Ad slot requests</h2>
                        <p className="text-[10px] text-zinc-500">
                            Buyers who asked for one of your slots. Reply by email, then move the deal along here.
                        </p>
                    </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        {paidCount} paid{paidCents > 0 ? ` · ${formatCents(paidCents)}` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        aria-label="Refresh requests"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-400 transition hover:text-white"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {message && (
                <div
                    className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                        message.tone === 'ok'
                            ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/15 bg-red-500/10 text-red-300'
                    }`}
                >
                    {message.text}
                </div>
            )}

            <ul className="space-y-3">
                {requests.map((request) => (
                    <RequestRow
                        key={request.id}
                        request={request}
                        busy={busyId === request.id}
                        onPatch={(body) => patchRequest(request.id, body)}
                    />
                ))}
            </ul>
        </div>
    );
}

function RequestRow({
    request,
    busy,
    onPatch,
}: {
    request: AdSlotRequestRecord;
    busy: boolean;
    onPatch: (body: { status?: AdSlotRequestStatus; publisher_note?: string }) => Promise<boolean>;
}) {
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteDraft, setNoteDraft] = useState(request.publisher_note || '');
    const status = requestStatusMeta(request.status);

    // The price exactly as it was advertised when this buyer hit send.
    const snapshotPrice = `${formatCents(request.price_cents_at_request)} ${billingPeriodSuffix(request.billing_period_at_request)}`;

    return (
        <li className="rounded-xl border border-white/[0.06] bg-black/20 p-4 transition hover:border-white/[0.1]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                            {request.slot_name_at_request || 'Ad slot'}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                            {status.label}
                        </span>
                        {request.site_name && (
                            <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-400">
                                {request.site_name}
                            </span>
                        )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span className="font-semibold text-zinc-300">{snapshotPrice}</span>
                        <span>as listed when they asked</span>
                        {request.created_at && <span>· {formatDate(request.created_at)}</span>}
                        {request.paid_at && (
                            <span className="text-emerald-400">· paid {formatDate(request.paid_at)}</span>
                        )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {request.buyer_name && <span className="text-zinc-300">{request.buyer_name}</span>}
                        <a
                            href={`mailto:${request.buyer_email}`}
                            className="inline-flex items-center gap-1 text-zinc-400 underline decoration-white/20 underline-offset-2 transition hover:text-white"
                        >
                            <Mail className="h-3 w-3" />
                            {request.buyer_email}
                        </a>
                    </div>

                    {request.message && (
                        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-[11.5px] leading-5 text-zinc-400">
                            {request.message}
                        </p>
                    )}

                    {request.publisher_note && !noteOpen && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-zinc-500">
                            <StickyNote className="mt-0.5 h-3 w-3 flex-shrink-0" />
                            <span className="whitespace-pre-wrap">{request.publisher_note}</span>
                        </p>
                    )}
                </div>

                <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    {REQUEST_STATUS_FLOW.map((option) => {
                        const isCurrent = option.value === request.status;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                disabled={busy || isCurrent}
                                onClick={() => void onPatch({ status: option.value })}
                                aria-pressed={isCurrent}
                                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed ${
                                    isCurrent
                                        ? `${option.className} opacity-100`
                                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-white disabled:opacity-50'
                                }`}
                            >
                                {busy && !isCurrent ? <Loader2 className="h-3 w-3 animate-spin" /> : option.label}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setNoteOpen((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/[0.12] hover:text-white"
                    >
                        <StickyNote className="h-3 w-3" />
                        {request.publisher_note ? 'Edit note' : 'Add note'}
                    </button>
                </div>
            </div>

            {noteOpen && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <label className="mb-1 block text-xs font-medium text-zinc-400">
                        Private note (only you can see this)
                    </label>
                    <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        disabled={busy}
                        placeholder="Agreed to run in March, invoice sent."
                        className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                    />
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                                const ok = await onPatch({ publisher_note: noteDraft });
                                if (ok) setNoteOpen(false);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
                            Save note
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setNoteDraft(request.publisher_note || '');
                                setNoteOpen(false);
                            }}
                            className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
}
