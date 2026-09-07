'use client';

/**
 * Publisher-side pricing control, mounted under the existing Leaderboard tab.
 *
 * The single highest-value thing this screen does is tell the publisher what to
 * charge. Indie builders do not know, and an empty price field gets abandoned.
 * So every verified site arrives pre-priced by the model, and this form only
 * exists for publishers who disagree with the suggestion.
 *
 * Saving nothing is a valid state: with no override row the public profile uses
 * the computed price, which is why the reset button ("use the suggestion")
 * sends `price_cents: null` rather than deleting anything.
 *
 * A new component rather than more lines in LeaderboardOptIn.tsx, which is
 * already 765 lines. Nothing about that file changes.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Megaphone } from 'lucide-react';
import {
    MIN_MONTHLY_PRICE_CENTS,
    PLATFORM_FEE_PCT,
    computeSponsorshipQuote,
    formatCents,
    type SponsorshipPricingInput,
} from '@/lib/sponsorshipPricing';

interface PublisherEntry extends SponsorshipPricingInput {
    id: number;
    slug: string | null;
    startup_name: string;
    website_url: string | null;
    is_active?: boolean;
}

interface ListingState {
    price_cents: number | null;
    floor_cents: number | null;
    accepting_requests: boolean;
    placement_note: string | null;
}

export default function SponsorshipPricing() {
    const [entries, setEntries] = useState<PublisherEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/leaderboard/join', { cache: 'no-store' });
                const data = await res.json();
                if (!cancelled) {
                    setEntries(Array.isArray(data?.entries) ? data.entries : []);
                }
            } catch {
                if (!cancelled) setEntries([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your sponsorship pricing
            </div>
        );
    }

    const sellable = entries.filter(
        (e) => e.is_active !== false && computeSponsorshipQuote(e).sellable,
    );

    if (sellable.length === 0) return null;

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-[#7AD9DA]" />
                <h3 className="text-base font-semibold tracking-[-0.01em] text-white">
                    Sponsorship pricing
                </h3>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-zinc-400">
                Your verified sites are already listed for sponsorship at the suggested price below —
                you do not have to do anything. Change it here if you disagree. There is no script to
                install and nothing is booked without your reply, so an unsold slot costs you nothing.
            </p>

            <div className="mt-5 space-y-4">
                {sellable.map((entry) => (
                    <EntryPricingRow key={entry.id} entry={entry} />
                ))}
            </div>

            <p className="mt-5 border-t border-white/[0.05] pt-4 text-[11px] leading-5 text-zinc-500">
                TrafficClaw takes {PLATFORM_FEE_PCT}% of a completed sponsorship, half of what Paved
                charges newsletter publishers. Minimum price is{' '}
                {formatCents(MIN_MONTHLY_PRICE_CENTS)} per 30 days — below that the invoice costs more
                than the deal.
            </p>
        </div>
    );
}

function EntryPricingRow({ entry }: { entry: PublisherEntry }) {
    const quote = computeSponsorshipQuote(entry);

    const [listing, setListing] = useState<ListingState | null>(null);
    const [priceInput, setPriceInput] = useState('');
    const [floorInput, setFloorInput] = useState('');
    const [note, setNote] = useState('');
    const [accepting, setAccepting] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/sponsorship/listing?entry_id=${entry.id}`, {
                cache: 'no-store',
            });
            if (!res.ok) return;
            const data = (await res.json()) as { listing: ListingState | null };
            setListing(data.listing);
            if (data.listing) {
                setPriceInput(
                    data.listing.price_cents ? String(Math.round(data.listing.price_cents / 100)) : '',
                );
                setFloorInput(
                    data.listing.floor_cents ? String(Math.round(data.listing.floor_cents / 100)) : '',
                );
                setNote(data.listing.placement_note || '');
                setAccepting(data.listing.accepting_requests);
            }
        } catch {
            /* leave defaults — a failed read just shows the suggestion */
        }
    }, [entry.id]);

    useEffect(() => {
        void load();
    }, [load]);

    async function save(overrides?: Partial<{ price_cents: number | null }>) {
        setSaving(true);
        setError(null);
        setSaved(false);

        const parsedPrice = priceInput.trim() === '' ? null : Math.round(Number(priceInput) * 100);
        const parsedFloor = floorInput.trim() === '' ? null : Math.round(Number(floorInput) * 100);

        if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < MIN_MONTHLY_PRICE_CENTS)) {
            setError(`Minimum price is ${formatCents(MIN_MONTHLY_PRICE_CENTS)}.`);
            setSaving(false);
            return;
        }

        const priceToSend = overrides && 'price_cents' in overrides ? overrides.price_cents : parsedPrice;

        try {
            const res = await fetch('/api/sponsorship/listing', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entry_id: entry.id,
                    price_cents: priceToSend,
                    floor_cents: parsedFloor,
                    accepting_requests: accepting,
                    placement_note: note,
                    auto_price_cents_at_save: quote.suggestedMonthlyCents,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                setError(data?.error || 'Could not save that.');
                setSaving(false);
                return;
            }
            setListing(data.listing);
            if (priceToSend === null) setPriceInput('');
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch {
            setError('Could not save that. Try again.');
        } finally {
            setSaving(false);
        }
    }

    const usingOverride = Boolean(listing?.price_cents);
    const livePriceCents = listing?.price_cents || quote.suggestedMonthlyCents;

    return (
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <a
                        href={`/leaderboard/${entry.slug || entry.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-white transition hover:text-[#7AD9DA]"
                    >
                        {entry.startup_name}
                    </a>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                        {quote.estimatedImpressions.toLocaleString('en-US')} est. impressions / 30 days
                        {quote.floorApplied && ' · priced at the platform floor'}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                        {usingOverride ? 'Your price' : 'Suggested'}
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-white">
                        {formatCents(livePriceCents)}
                    </div>
                    <div className="text-[10px] text-zinc-600">
                        you keep {formatCents(Math.round(livePriceCents * (1 - PLATFORM_FEE_PCT / 100)))}
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Your price / 30 days
                    </span>
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-2">
                        <span className="text-sm text-zinc-500">$</span>
                        <input
                            type="number"
                            min={MIN_MONTHLY_PRICE_CENTS / 100}
                            step={5}
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder={String(Math.round(quote.suggestedMonthlyCents / 100))}
                            className="w-full bg-transparent text-sm tabular-nums text-white placeholder:text-zinc-600 focus:outline-none"
                        />
                    </div>
                </label>
                <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Lowest you would accept
                    </span>
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-2">
                        <span className="text-sm text-zinc-500">$</span>
                        <input
                            type="number"
                            min={MIN_MONTHLY_PRICE_CENTS / 100}
                            step={5}
                            value={floorInput}
                            onChange={(e) => setFloorInput(e.target.value)}
                            placeholder="Optional"
                            className="w-full bg-transparent text-sm tabular-nums text-white placeholder:text-zinc-600 focus:outline-none"
                        />
                    </div>
                </label>
            </div>

            <label className="mt-3 block">
                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    Where the ad goes
                </span>
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. sidebar card, above the fold on every article"
                    className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                    onClick={() => void save()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-semibold text-[#dff9ff] transition hover:brightness-125 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {saved ? 'Saved' : 'Save'}
                </button>
                {usingOverride && (
                    <button
                        onClick={() => void save({ price_cents: null })}
                        disabled={saving}
                        className="text-xs text-zinc-500 transition hover:text-zinc-300 disabled:opacity-50"
                    >
                        Use the suggested {formatCents(quote.suggestedMonthlyCents)} instead
                    </button>
                )}
                <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                    <input
                        type="checkbox"
                        checked={accepting}
                        onChange={(e) => setAccepting(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#14C4E1]"
                    />
                    Accepting requests
                </label>
                {saved && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                        <Check className="h-3.5 w-3.5" /> Updated
                    </span>
                )}
            </div>

            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}

            {!usingOverride && (
                <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                    Built from {(entry.monthly_pageviews || 0).toLocaleString('en-US')} verified
                    pageviews at a ${quote.effectiveCpm.toFixed(2)} CPM. Sites your size with this
                    audience quality typically clear{' '}
                    {formatCents(quote.foundingMonthlyCents)}&ndash;{formatCents(quote.suggestedMonthlyCents)}.
                </p>
            )}
        </div>
    );
}
