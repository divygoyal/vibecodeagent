'use client';

/**
 * "Sponsor this site" panel on the existing public profile.
 *
 * A separate component rather than more lines inside StartupProfileClient,
 * which is already 638 lines. The parent renders it as one extra section and
 * nothing else about that file changes.
 *
 * The panel shows a price, shows how the price was derived, and takes an email
 * address. That is the whole demand test. There is no cart, no checkout, no
 * account creation and no payment — the price breakdown is here precisely
 * because a buyer being asked to pay a stranger needs to see the arithmetic.
 */

import { useState } from 'react';
import { ArrowUpRight, Check, Loader2, Megaphone, ShieldCheck } from 'lucide-react';
import {
    FOUNDING_RATE_MULTIPLIER,
    SLOT_LABEL,
    formatCents,
    resolveSponsorshipPrice,
    type PublisherListingOverride,
    type SponsorshipPricingInput,
} from '@/lib/sponsorshipPricing';

interface SponsorshipPanelProps {
    entryId: number;
    entryName: string;
    pricingInput: SponsorshipPricingInput;
    listing: PublisherListingOverride | null;
    /** Path recorded on the request so we can tell which surface converts. */
    sourcePath: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SponsorshipPanel({
    entryId,
    entryName,
    pricingInput,
    listing,
    sourcePath,
}: SponsorshipPanelProps) {
    const price = resolveSponsorshipPrice(pricingInput, listing);

    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [site, setSite] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    // Nothing sellable — render nothing rather than an empty priced box. An
    // unverified or sub-threshold entry keeps its profile exactly as before.
    if (!price.sellable) return null;

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!EMAIL_RE.test(email.trim())) {
            setError('Enter an email address the publisher can reply to.');
            return;
        }
        setStatus('sending');
        try {
            const res = await fetch('/api/sponsorship/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    name: name.trim() || undefined,
                    site: site.trim() || undefined,
                    message: message.trim() || undefined,
                    entryIds: [entryId],
                    source: 'profile',
                    sourcePath,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                setError(data?.error || 'Could not send that. Try again.');
                setStatus('idle');
                return;
            }
            setStatus('sent');
        } catch {
            setError('Could not send that. Check your connection and try again.');
            setStatus('idle');
        }
    }

    const discountPct = Math.round((1 - FOUNDING_RATE_MULTIPLIER) * 100);

    return (
        <div className="mt-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-8">
            <div className="mb-2 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-[#7AD9DA]" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Sponsor this site</h2>
            </div>
            <p className="text-sm leading-6 text-zinc-400">
                {entryName} sells one {SLOT_LABEL.toLowerCase()}. Traffic is verified from its own Google
                Analytics, so you are not buying against a screenshot.
            </p>

            {/* Price block — the focal element of the panel. */}
            <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-[#14C4E1]/22 bg-[#14C4E1]/[0.06] p-5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7AD9DA]">
                        {price.priceSource === 'publisher' ? "Publisher's price" : 'Suggested price'}
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                        <span className="text-[2.4rem] font-semibold leading-none tracking-[-0.04em] text-white tabular-nums">
                            {formatCents(price.listPriceCents)}
                        </span>
                        <span className="mb-1 text-xs text-zinc-400">/ 30 days</span>
                    </div>
                    <div className="mt-3 space-y-1 text-[12px] text-zinc-400">
                        <div className="flex justify-between gap-4">
                            <span>Est. impressions</span>
                            <span className="tabular-nums text-zinc-200">
                                {price.estimatedImpressions.toLocaleString('en-US')}
                            </span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span>Effective CPM</span>
                            <span className="tabular-nums text-zinc-200">${price.impliedCpm.toFixed(2)}</span>
                        </div>
                    </div>
                    {price.floorApplied && (
                        <p className="mt-3 text-[11px] leading-5 text-amber-300/90">
                            Priced at the {formatCents(2500)} platform floor, which puts the CPM above the
                            usual ${'2\u20138'} band. Small site, small invoice — the overhead sets the price,
                            not the traffic.
                        </p>
                    )}
                    {price.floorCents !== null && price.floorCents < price.listPriceCents && (
                        <p className="mt-3 text-[11px] text-zinc-500">
                            Publisher will consider offers down to {formatCents(price.floorCents)}.
                        </p>
                    )}
                </div>

                {/* How the number was reached. */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        How this price is built
                    </div>
                    <div className="mt-3 space-y-1.5">
                        {price.factors.map((f) => (
                            <div key={f.label} className="flex items-baseline justify-between gap-3 text-[12px]">
                                <span className="text-zinc-400">
                                    {f.label}
                                    <span className="ml-1.5 text-zinc-600">{f.detail}</span>
                                </span>
                                {f.multiplier !== 1 && (
                                    <span className="shrink-0 tabular-nums text-zinc-300">
                                        &times;{f.multiplier.toFixed(2)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 border-t border-white/[0.05] pt-3 text-[11px] leading-5 text-zinc-500">
                        {price.priceSource === 'publisher'
                            ? 'The publisher set their own price. The breakdown above is what our model suggested.'
                            : 'Verified pageviews \u00d7 the multipliers above, capped to a $2\u20138 CPM band.'}
                    </p>
                </div>
            </div>

            {/* Founding-rate note, applied at render and never inside the formula. */}
            <p className="mt-4 text-[12px] text-zinc-400">
                First-sponsor rate: ask for {discountPct}% off (
                <span className="font-semibold text-[#dff9ff]">
                    {formatCents(price.foundingMonthlyCents)}
                </span>
                ) while this marketplace is new. Say so in your message.
            </p>

            {/* Action */}
            {!price.acceptingRequests ? (
                <p className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] text-zinc-400">
                    This publisher has paused sponsorship requests. The listing stays up — check back.
                </p>
            ) : status === 'sent' ? (
                <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                        <Check className="h-4 w-4" /> Request sent
                    </div>
                    <p className="mt-1.5 text-[13px] leading-6 text-zinc-300">
                        {entryName} has been emailed with your address, and you have a copy. There is no
                        payment step yet — if they accept, you agree the creative directly and
                        TrafficClaw invoices you by hand.
                    </p>
                </div>
            ) : !open ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#14C4E1]/30 bg-[linear-gradient(135deg,rgba(20,196,225,0.22),rgba(122,217,218,0.08))] px-4 py-2.5 text-sm font-semibold text-[#dff9ff] transition hover:brightness-110"
                    >
                        <Megaphone className="h-4 w-4" />
                        Request sponsorship
                    </button>
                    <a
                        href="/advertise"
                        className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-[#7AD9DA]"
                    >
                        Plan a budget across several sites
                        <ArrowUpRight className="h-3 w-3" />
                    </a>
                </div>
            ) : (
                <form onSubmit={submit} className="mt-6 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                Your email
                            </span>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                Your name
                            </span>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Optional"
                                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                            />
                        </label>
                    </div>
                    <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                            What are you advertising?
                        </span>
                        <input
                            value={site}
                            onChange={(e) => setSite(e.target.value)}
                            placeholder="yourproduct.com"
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                            Message to the publisher
                        </span>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Which weeks you want, what the creative is, and any offer you want to make."
                            className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                        />
                    </label>

                    {error && <p className="text-[12px] text-red-300">{error}</p>}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={status === 'sending'}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#14C4E1]/30 bg-[linear-gradient(135deg,rgba(20,196,225,0.22),rgba(122,217,218,0.08))] px-4 py-2.5 text-sm font-semibold text-[#dff9ff] transition hover:brightness-110 disabled:opacity-50"
                        >
                            {status === 'sending' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Megaphone className="h-4 w-4" />
                            )}
                            {status === 'sending' ? 'Sending' : 'Send request'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-xs text-zinc-500 transition hover:text-zinc-300"
                        >
                            Cancel
                        </button>
                    </div>
                    <p className="flex items-start gap-1.5 text-[11px] leading-5 text-zinc-500">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7AD9DA]" />
                        No payment now and no account needed. This emails the publisher with your address
                        so the two of you can agree terms; nothing is booked until they reply.
                    </p>
                </form>
            )}
        </div>
    );
}
