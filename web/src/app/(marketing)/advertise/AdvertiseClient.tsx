'use client';

/**
 * Budget-based sponsorship planner.
 *
 * The flow the user asked for: enter a total budget, pick targeting, see a
 * proposed allocation across multiple verified sites with cost and estimated
 * reach per site, add or remove sites, then submit ONE combined request.
 *
 * All of the decision logic lives in `@/lib/sponsorshipAllocation` as pure
 * functions. This file is presentation and state only — no arithmetic that
 * matters happens here, which is what makes the numbers testable.
 *
 * Honesty constraints baked into the UI:
 *   - Reach is summed across sites and never deduplicated, because we have no
 *     cross-site identity. It is labelled an upper bound everywhere it appears.
 *   - A slot is indivisible: you cannot buy 40% of a sponsorship. So the plan
 *     is a selection, and leftover budget is shown rather than hidden.
 *   - Every included and excluded site carries the reason it was included or
 *     excluded, straight from the allocator.
 */

import { useMemo, useState } from 'react';
import {
    ArrowUpRight,
    Check,
    Loader2,
    Megaphone,
    Minus,
    Plus,
    ShieldCheck,
    SlidersHorizontal,
} from 'lucide-react';
import {
    allocateBudget,
    applyTargeting,
    type AllocationCandidate,
    type AllocationStrategy,
} from '@/lib/sponsorshipAllocation';
import { formatCents } from '@/lib/sponsorshipPricing';

export interface AdvertiseSite {
    entryId: number;
    name: string;
    domain: string | null;
    slug: string | null;
    description: string | null;
    category: string | null;
    primaryCountry: string | null;
    monthlyVisitors: number;
    priceCents: number;
    estimatedImpressions: number;
    impliedCpm: number;
    priceSource: 'publisher' | 'computed';
    acceptingRequests: boolean;
    floorPriced: boolean;
}

const BUDGET_PRESETS = [250, 500, 1_000, 2_500, 5_000];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('en-US');
}

export default function AdvertiseClient({ sites }: { sites: AdvertiseSite[] }) {
    const [budget, setBudget] = useState(1_000);
    const [strategy, setStrategy] = useState<AllocationStrategy>('reach');
    const [categories, setCategories] = useState<string[]>([]);
    const [countries, setCountries] = useState<string[]>([]);
    const [maxSites, setMaxSites] = useState(0);
    const [excludedIds, setExcludedIds] = useState<number[]>([]);
    const [pinnedIds, setPinnedIds] = useState<number[]>([]);

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [advertiserSite, setAdvertiserSite] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [sentSummary, setSentSummary] = useState<{ siteCount: number; totalCents: number } | null>(null);

    const allCategories = useMemo(
        () => Array.from(new Set(sites.map((s) => s.category).filter((c): c is string => Boolean(c)))).sort(),
        [sites],
    );
    const allCountries = useMemo(
        () =>
            Array.from(
                new Set(sites.map((s) => s.primaryCountry).filter((c): c is string => Boolean(c))),
            ).sort(),
        [sites],
    );

    const candidates: AllocationCandidate[] = useMemo(
        () =>
            sites.map((s) => ({
                entryId: s.entryId,
                name: s.name,
                domain: s.domain,
                slug: s.slug,
                category: s.category,
                primaryCountry: s.primaryCountry,
                priceCents: s.priceCents,
                estimatedImpressions: s.estimatedImpressions,
                monthlyVisitors: s.monthlyVisitors,
                acceptingRequests: s.acceptingRequests,
            })),
        [sites],
    );

    const targeted = useMemo(
        () => applyTargeting(candidates, { categories, countries }),
        [candidates, categories, countries],
    );

    const plan = useMemo(
        () =>
            allocateBudget({
                budgetCents: budget * 100,
                candidates: targeted,
                strategy,
                maxSites: maxSites || undefined,
                pinnedIds,
                excludedIds,
            }),
        [budget, targeted, strategy, maxSites, pinnedIds, excludedIds],
    );

    const byId = useMemo(() => new Map(sites.map((s) => [s.entryId, s])), [sites]);

    /** Null when the targeting filters matched nothing at all — a different
     *  message from "matched things, none affordable". */
    const cheapestMatchCents = useMemo(() => {
        const prices = targeted.filter((c) => c.acceptingRequests && c.priceCents > 0).map((c) => c.priceCents);
        return prices.length > 0 ? Math.min(...prices) : null;
    }, [targeted]);

    function toggle<T>(list: T[], value: T): T[] {
        return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    }

    function removeSite(entryId: number) {
        setPinnedIds((p) => p.filter((id) => id !== entryId));
        setExcludedIds((e) => (e.includes(entryId) ? e : [...e, entryId]));
    }

    function addSite(entryId: number) {
        setExcludedIds((e) => e.filter((id) => id !== entryId));
        setPinnedIds((p) => (p.includes(entryId) ? p : [...p, entryId]));
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!EMAIL_RE.test(email.trim())) {
            setError('Enter an email address the publishers can reply to.');
            return;
        }
        if (plan.selected.length === 0) {
            setError('Your plan is empty. Raise the budget or widen the targeting.');
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
                    site: advertiserSite.trim() || undefined,
                    message: message.trim() || undefined,
                    budgetCents: budget * 100,
                    entryIds: plan.selected.map((l) => l.entryId),
                    source: 'budget',
                    sourcePath: '/advertise',
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                setError(data?.error || 'Could not send that. Try again.');
                setStatus('idle');
                return;
            }
            setSentSummary({ siteCount: data.siteCount, totalCents: data.totalCents });
            setStatus('sent');
        } catch {
            setError('Could not send that. Check your connection and try again.');
            setStatus('idle');
        }
    }

    const affordableSkipped = plan.skipped.filter((l) => l.note !== 'Removed from this plan');
    const removedSites = plan.skipped.filter((l) => l.note === 'Removed from this plan');

    return (
        <div className="relative min-h-screen bg-[#010101] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,196,225,0.10),transparent_38%),linear-gradient(180deg,#030303_0%,#000000_100%)]" />

            <div className="relative mx-auto max-w-[1140px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 lg:px-8">
                <header className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
                        Sponsorship marketplace
                    </div>
                    <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                        Set a budget. Get a plan.
                    </h1>
                    <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base">
                        Every site here has connected its own Google Analytics through read-only OAuth, so
                        the traffic numbers are pulled from the source and refreshed daily rather than
                        typed into a form. Tell us what you have to spend and we will propose an
                        allocation across the sites that match.
                    </p>
                </header>

                {sites.length === 0 ? (
                    <p className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-sm text-zinc-400">
                        No verified inventory is available right now. Check the{' '}
                        <a href="/leaderboard" className="text-[#7AD9DA] underline">
                            leaderboard
                        </a>{' '}
                        for sites that have connected analytics.
                    </p>
                ) : (
                    <>
                        {/* ---------------------------- controls ---------------------------- */}
                        <section className="mt-10 rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 sm:p-8">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="h-4 w-4 text-[#7AD9DA]" />
                                <h2 className="text-lg font-semibold tracking-[-0.02em]">Your budget</h2>
                            </div>

                            <div className="mt-5 flex flex-wrap items-end gap-5">
                                <label className="block">
                                    <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                        Total to spend (30 days)
                                    </span>
                                    <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5">
                                        <span className="text-lg text-zinc-500">$</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={50}
                                            value={budget}
                                            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
                                            className="w-28 bg-transparent text-lg font-semibold tabular-nums text-white focus:outline-none"
                                        />
                                    </div>
                                </label>
                                <div className="flex flex-wrap gap-2 pb-1">
                                    {BUDGET_PRESETS.map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setBudget(p)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                                budget === p
                                                    ? 'border-[#14C4E1]/40 bg-[#14C4E1]/12 text-[#dff9ff]'
                                                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            ${p.toLocaleString('en-US')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-6 grid gap-5 border-t border-white/[0.05] pt-5 sm:grid-cols-2">
                                <div>
                                    <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                        Optimise for
                                    </span>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {(
                                            [
                                                ['reach', 'Most reach per dollar'],
                                                ['spread', 'Most sites'],
                                            ] as Array<[AllocationStrategy, string]>
                                        ).map(([id, label]) => (
                                            <button
                                                key={id}
                                                onClick={() => setStrategy(id)}
                                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                                    strategy === id
                                                        ? 'border-[#14C4E1]/40 bg-[#14C4E1]/12 text-[#dff9ff]'
                                                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                        Cap the number of sites
                                    </span>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {[0, 3, 5, 10].map((n) => (
                                            <button
                                                key={n}
                                                onClick={() => setMaxSites(n)}
                                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                                    maxSites === n
                                                        ? 'border-[#14C4E1]/40 bg-[#14C4E1]/12 text-[#dff9ff]'
                                                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                {n === 0 ? 'No cap' : `Max ${n}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {(allCategories.length > 0 || allCountries.length > 0) && (
                                <div className="mt-5 grid gap-5 border-t border-white/[0.05] pt-5 sm:grid-cols-2">
                                    {allCategories.length > 0 && (
                                        <div>
                                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                                Categories
                                            </span>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {allCategories.map((c) => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setCategories((prev) => toggle(prev, c))}
                                                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                                            categories.includes(c)
                                                                ? 'border-[#14C4E1]/40 bg-[#14C4E1]/12 text-[#dff9ff]'
                                                                : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
                                                        }`}
                                                    >
                                                        {c}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {allCountries.length > 0 && (
                                        <div>
                                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                                Top audience country
                                            </span>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {allCountries.map((c) => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setCountries((prev) => toggle(prev, c))}
                                                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                                            countries.includes(c)
                                                                ? 'border-[#14C4E1]/40 bg-[#14C4E1]/12 text-[#dff9ff]'
                                                                : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
                                                        }`}
                                                    >
                                                        {c}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <p className="mt-5 text-[12px] text-zinc-500">
                                {sites.length} verified {sites.length === 1 ? 'site' : 'sites'} listed &middot;{' '}
                                {targeted.length} match your targeting &middot; {plan.selected.length} fit your
                                budget
                            </p>
                        </section>

                        {/* ------------------------ plan summary ------------------------ */}
                        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <SummaryTile
                                label="Sites in plan"
                                value={String(plan.selected.length)}
                                sub={`of ${targeted.length} matching`}
                            />
                            <SummaryTile
                                label="Total cost"
                                value={formatCents(plan.totalCostCents)}
                                sub={`${plan.utilisationPct}% of budget · ${formatCents(
                                    plan.remainingCents,
                                )} unspent`}
                                accent
                            />
                            <SummaryTile
                                label="Est. impressions"
                                value={formatCount(plan.totalImpressions)}
                                sub="summed, not deduplicated"
                            />
                            <SummaryTile
                                label="Blended CPM"
                                value={plan.blendedCpm > 0 ? `$${plan.blendedCpm.toFixed(2)}` : '—'}
                                sub="cost per 1,000 impressions"
                            />
                        </section>

                        {plan.pinnedOverBudget && (
                            <p className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-[13px] text-amber-200">
                                One or more sites you added do not fit this budget. They are listed below
                                rather than dropped silently — raise the budget or remove something else.
                            </p>
                        )}

                        {/* --------------------------- the plan --------------------------- */}
                        <section className="mt-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))]">
                            <div className="border-b border-white/[0.06] px-6 py-4 sm:px-8">
                                <h2 className="text-lg font-semibold tracking-[-0.02em]">Proposed plan</h2>
                                <p className="mt-1 text-[12px] text-zinc-500">
                                    Each row is one whole 30-day sponsor slot — slots are not divisible, which
                                    is why some budget may go unspent.
                                </p>
                            </div>

                            {plan.selected.length === 0 ? (
                                <p className="px-6 py-8 text-sm text-zinc-400 sm:px-8">
                                    {cheapestMatchCents === null
                                        ? 'No sites match your targeting. Clear a filter to see inventory again.'
                                        : `Nothing fits this budget yet. The cheapest matching site costs ${formatCents(
                                              cheapestMatchCents,
                                          )}.`}
                                </p>
                            ) : (
                                <div className="divide-y divide-white/[0.05]">
                                    {plan.selected.map((line) => {
                                        const site = byId.get(line.entryId);
                                        return (
                                            <PlanRow
                                                key={line.entryId}
                                                name={line.name}
                                                domain={line.domain}
                                                slug={line.slug}
                                                entryId={line.entryId}
                                                category={line.category}
                                                country={line.primaryCountry}
                                                priceCents={line.priceCents}
                                                impressions={line.estimatedImpressions}
                                                visitors={line.monthlyVisitors}
                                                cpm={site?.impliedCpm ?? 0}
                                                priceSource={site?.priceSource ?? 'computed'}
                                                note={line.note}
                                                inPlan
                                                onToggle={() => removeSite(line.entryId)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* --------------------- add more / removed --------------------- */}
                        {(affordableSkipped.length > 0 || removedSites.length > 0) && (
                            <section className="mt-6 overflow-hidden rounded-[26px] border border-white/[0.06] bg-white/[0.015]">
                                <div className="border-b border-white/[0.05] px-6 py-4 sm:px-8">
                                    <h2 className="text-sm font-semibold tracking-[-0.01em] text-zinc-300">
                                        Not in the plan
                                    </h2>
                                    <p className="mt-1 text-[12px] text-zinc-500">
                                        Add any of these and the allocator will refit the rest around them.
                                    </p>
                                </div>
                                <div className="divide-y divide-white/[0.04]">
                                    {[...removedSites, ...affordableSkipped].slice(0, 25).map((line) => {
                                        const site = byId.get(line.entryId);
                                        return (
                                            <PlanRow
                                                key={line.entryId}
                                                name={line.name}
                                                domain={line.domain}
                                                slug={line.slug}
                                                entryId={line.entryId}
                                                category={line.category}
                                                country={line.primaryCountry}
                                                priceCents={line.priceCents}
                                                impressions={line.estimatedImpressions}
                                                visitors={line.monthlyVisitors}
                                                cpm={site?.impliedCpm ?? 0}
                                                priceSource={site?.priceSource ?? 'computed'}
                                                note={line.note}
                                                inPlan={false}
                                                onToggle={() => addSite(line.entryId)}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ---------------------------- submit ---------------------------- */}
                        <section className="mt-6 rounded-[26px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 sm:p-8">
                            {status === 'sent' && sentSummary ? (
                                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-5 py-5">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                                        <Check className="h-4 w-4" /> Request sent to {sentSummary.siteCount}{' '}
                                        {sentSummary.siteCount === 1 ? 'publisher' : 'publishers'}
                                    </div>
                                    <p className="mt-2 text-[13px] leading-6 text-zinc-300">
                                        Total quoted: {formatCents(sentSummary.totalCents)}. Every publisher has
                                        your email address and can reply directly. Nothing has been charged —
                                        whoever accepts agrees the creative with you and TrafficClaw sends one
                                        invoice by hand.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={submit}>
                                    <h2 className="text-lg font-semibold tracking-[-0.02em]">
                                        Send this plan as one request
                                    </h2>
                                    <p className="mt-1 text-[12px] text-zinc-500">
                                        {plan.selected.length} {plan.selected.length === 1 ? 'site' : 'sites'} &middot;{' '}
                                        {formatCents(plan.totalCostCents)} &middot; one email to each publisher
                                    </p>

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                                    <label className="mt-3 block">
                                        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                            What are you advertising?
                                        </span>
                                        <input
                                            value={advertiserSite}
                                            onChange={(e) => setAdvertiserSite(e.target.value)}
                                            placeholder="yourproduct.com"
                                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                                        />
                                    </label>
                                    <label className="mt-3 block">
                                        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                            Message to the publishers
                                        </span>
                                        <textarea
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            rows={3}
                                            placeholder="Which weeks you want, what the creative is, and any offer you want to make."
                                            className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#14C4E1]/40 focus:outline-none"
                                        />
                                    </label>

                                    {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}

                                    <div className="mt-5 flex flex-wrap items-center gap-4">
                                        <button
                                            type="submit"
                                            disabled={status === 'sending' || plan.selected.length === 0}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#14C4E1]/30 bg-[linear-gradient(135deg,rgba(20,196,225,0.22),rgba(122,217,218,0.08))] px-4 py-2.5 text-sm font-semibold text-[#dff9ff] transition hover:brightness-110 disabled:opacity-40"
                                        >
                                            {status === 'sending' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Megaphone className="h-4 w-4" />
                                            )}
                                            {status === 'sending' ? 'Sending' : 'Send request'}
                                        </button>
                                        <p className="flex items-start gap-1.5 text-[11px] leading-5 text-zinc-500">
                                            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7AD9DA]" />
                                            No payment now and no account needed. Prices are re-checked on the
                                            server before anything is sent.
                                        </p>
                                    </div>
                                </form>
                            )}
                        </section>

                        <p className="mt-8 text-[11px] leading-6 text-zinc-600">
                            Impression estimates assume a site-wide slot renders on 85% of a site&apos;s
                            verified pageviews. Reach totals are summed across sites and are not
                            deduplicated — these audiences overlap, so treat any multi-site total as an
                            upper bound. Prices are capped to a $2&ndash;8 CPM band anchored on EthicalAds&apos;
                            reported ~$2.50 publisher CPM; sites priced at the $25 floor are labelled as
                            such because their implied CPM sits above that band.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

function SummaryTile({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: string;
    sub: string;
    accent?: boolean;
}) {
    return (
        <div
            className={`rounded-2xl border p-5 ${
                accent
                    ? 'border-[#14C4E1]/22 bg-[#14C4E1]/[0.06]'
                    : 'border-white/[0.07] bg-white/[0.02]'
            }`}
        >
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {label}
            </div>
            <div className="mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-white">
                {value}
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">{sub}</div>
        </div>
    );
}

function PlanRow({
    name,
    domain,
    slug,
    entryId,
    category,
    country,
    priceCents,
    impressions,
    visitors,
    cpm,
    priceSource,
    note,
    inPlan,
    onToggle,
}: {
    name: string;
    domain: string | null;
    slug: string | null;
    entryId: number;
    category: string | null;
    country: string | null;
    priceCents: number;
    impressions: number;
    visitors: number;
    cpm: number;
    priceSource: 'publisher' | 'computed';
    note: string;
    inPlan: boolean;
    onToggle: () => void;
}) {
    return (
        <div className={`flex flex-wrap items-center gap-4 px-6 py-4 sm:px-8 ${inPlan ? '' : 'opacity-70'}`}>
            <div className="min-w-[180px] flex-1">
                <a
                    href={`/leaderboard/${slug || entryId}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-white transition hover:text-[#7AD9DA]"
                >
                    {name}
                    <ArrowUpRight className="h-3 w-3 text-zinc-600" />
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                    {domain && <span>{domain}</span>}
                    {category && <span>&middot; {category}</span>}
                    {country && <span>&middot; {country}</span>}
                </div>
            </div>

            <div className="w-20 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Visitors</div>
                <div className="text-sm tabular-nums text-zinc-300">{formatCount(visitors)}</div>
            </div>
            <div className="w-24 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Impressions</div>
                <div className="text-sm tabular-nums text-zinc-300">{formatCount(impressions)}</div>
            </div>
            <div className="w-16 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">CPM</div>
                <div className="text-sm tabular-nums text-zinc-300">${cpm.toFixed(2)}</div>
            </div>
            <div className="w-24 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                    {priceSource === 'publisher' ? 'Their price' : 'Price'}
                </div>
                <div className="text-sm font-semibold tabular-nums text-white">
                    {formatCents(priceCents)}
                </div>
            </div>

            <div className="flex min-w-[190px] flex-1 items-center justify-end gap-3">
                <span className="text-right text-[11px] text-zinc-500">{note}</span>
                <button
                    onClick={onToggle}
                    aria-label={inPlan ? `Remove ${name} from plan` : `Add ${name} to plan`}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                        inPlan
                            ? 'border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:border-red-400/30 hover:text-red-300'
                            : 'border-[#14C4E1]/30 bg-[#14C4E1]/10 text-[#7AD9DA] hover:brightness-125'
                    }`}
                >
                    {inPlan ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
            </div>
        </div>
    );
}
