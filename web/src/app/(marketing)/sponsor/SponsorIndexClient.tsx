'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Megaphone,
    Search as SearchIcon, ShieldCheck, Users, Zap, Globe2, Handshake, BadgeDollarSign,
} from 'lucide-react';
import {
    BILLING_PERIODS,
    billingPeriodLabel,
    formatAvailability,
    formatSlotPrice,
    type AdSlot,
} from '@/lib/adSlots';

// ────────────────────────────────────────────────────────────────────────────
// Types — wire shape of GET /api/sponsor-inventory
// ────────────────────────────────────────────────────────────────────────────

export interface SponsorInventoryEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    monthly_visitors: number;
    monthly_pageviews: number;
    engagement_rate: number;
    visitor_trend: number;
    primary_country: string | null;
    verification_status: string | null;
    last_refreshed: string | null;
    topic_labels: string[];
}

export interface SponsorInventoryItem extends AdSlot {
    entry: SponsorInventoryEntry;
}

export interface SponsorInventoryResponse {
    slots: SponsorInventoryItem[];
    total: number;
    sites: number;
}

type SortValue = 'traffic' | 'price_asc' | 'price_desc' | 'newest';

const SORT_OPTIONS: ReadonlyArray<{ value: SortValue; label: string }> = [
    { value: 'traffic', label: 'Most traffic' },
    { value: 'price_asc', label: 'Price low → high' },
    { value: 'price_desc', label: 'Price high → low' },
    { value: 'newest', label: 'Newest' },
];

// ────────────────────────────────────────────────────────────────────────────
// Small visual helpers (local copies of the leaderboard page's look)
// ────────────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function autoLogoFromHost(websiteUrl: string | null | undefined): string | null {
    if (!websiteUrl) return null;
    try {
        const withScheme = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
        const host = new URL(withScheme).hostname.replace(/^www\./, '');
        return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null;
    } catch {
        return null;
    }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
            {children}
        </div>
    );
}

function PremiumBackdrop() {
    return (
        <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_18%),linear-gradient(180deg,#030303_0%,#010101_24%,#000000_100%)]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 18% 16%, rgba(255,255,255,0.26) 0 1px, transparent 1.5px), radial-gradient(circle at 72% 24%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 58% 62%, rgba(255,255,255,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 86% 52%, rgba(255,255,255,0.16) 0 1px, transparent 1.5px)',
                    backgroundSize: '320px 320px, 420px 420px, 520px 520px, 640px 640px',
                }}
            />
            <div className="pointer-events-none absolute left-1/2 top-[10%] h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.14),transparent_60%)] blur-[120px]" />
            <div className="pointer-events-none absolute right-[8%] top-[24%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(122,217,218,0.14),transparent_60%)] blur-[110px]" />
        </>
    );
}

function LogoIcon({ name, url, websiteUrl }: { name: string; url: string | null; websiteUrl?: string | null }) {
    const fallback = autoLogoFromHost(websiteUrl);
    const [errored, setErrored] = useState(false);
    const resolved = !errored ? (url || fallback) : null;
    if (resolved) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={resolved}
                alt={name}
                onError={() => setErrored(true)}
                className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
            />
        );
    }
    const palettes = [
        'from-[#14C4E1] to-[#7AD9DA]',
        'from-purple-500 to-pink-500',
        'from-amber-400 to-orange-500',
        'from-blue-500 to-indigo-500',
        'from-rose-500 to-red-500',
    ];
    const palette = palettes[name.length % palettes.length];
    return (
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${palette} text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_24px_rgba(0,0,0,0.32)]`}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

function FilterSelect({
    value,
    onChange,
    options,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<{ value: string; label: string }>;
    label: string;
}) {
    const isActive = value !== 'all' && value !== 'traffic';
    return (
        <div className="relative">
            <select
                aria-label={label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`appearance-none rounded-full border px-3.5 py-2 pr-9 text-xs font-medium transition focus:outline-none ${
                    isActive
                        ? 'border-[#14C4E1]/35 bg-[#14C4E1]/10 text-[#dff9ff]'
                        : 'border-white/[0.1] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                }`}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 ${isActive ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side filter + sort. Only ever reorders/filters by the publisher's own
// numbers — nothing here derives a price.
// ────────────────────────────────────────────────────────────────────────────

function applyView(
    slots: SponsorInventoryItem[],
    { category, period, sort, search }: { category: string; period: string; sort: SortValue; search: string },
): SponsorInventoryItem[] {
    const needle = search.trim().toLowerCase();
    const filtered = slots.filter((slot) => {
        if (category !== 'all' && (slot.entry.category || 'Other') !== category) return false;
        if (period !== 'all' && slot.billing_period !== period) return false;
        if (needle) {
            const haystack = `${slot.entry.startup_name} ${slot.name}`.toLowerCase();
            if (!haystack.includes(needle)) return false;
        }
        return true;
    });
    const byTime = (s: SponsorInventoryItem) => (s.created_at ? new Date(s.created_at).getTime() : 0);
    return filtered.sort((a, b) => {
        switch (sort) {
            case 'price_asc':
                return a.price_cents - b.price_cents || b.entry.monthly_visitors - a.entry.monthly_visitors;
            case 'price_desc':
                return b.price_cents - a.price_cents || b.entry.monthly_visitors - a.entry.monthly_visitors;
            case 'newest':
                return byTime(b) - byTime(a) || b.id - a.id;
            default:
                return b.entry.monthly_visitors - a.entry.monthly_visitors || a.price_cents - b.price_cents;
        }
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Slot card
// ────────────────────────────────────────────────────────────────────────────

function SlotCard({ slot, reduceMotion, index }: { slot: SponsorInventoryItem; reduceMotion: boolean; index: number }) {
    const { entry } = slot;
    const profileHref = `/leaderboard/${entry.slug || entry.id}`;
    const requestHref = `${profileHref}#sponsor`;
    const availability = formatAvailability(slot);
    const soldOut = availability === 'Sold out' || availability === 'Unavailable';
    const [previewErrored, setPreviewErrored] = useState(false);
    const topics = (entry.topic_labels || []).slice(0, 3);

    return (
        <motion.article
            // `initial` stays identical on server and client so SSR markup matches;
            // reduced-motion users get the same end state with a zero-length transition.
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
            className="group relative flex flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_44%),linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.42)] transition-colors duration-300 hover:border-emerald-400/30"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(52,211,153,0.45),transparent)] opacity-0 transition-opacity group-hover:opacity-100" />

            {/* Site header */}
            <div className="flex items-center gap-2.5">
                <LogoIcon name={entry.startup_name} url={entry.logo_url} websiteUrl={entry.website_url} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <Link
                            href={profileHref}
                            className="truncate text-[13px] font-semibold text-white transition hover:text-[#dff9ff]"
                        >
                            {entry.startup_name}
                        </Link>
                        {entry.verification_status === 'verified' && (
                            <span
                                title="GA4 property and claimed website host match"
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#14C4E1]/14 text-[#7AD9DA]"
                            >
                                <ShieldCheck className="h-2.5 w-2.5" />
                            </span>
                        )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                        {entry.category && (
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-px text-[10px] text-zinc-400">
                                {entry.category}
                            </span>
                        )}
                        <span className="truncate text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                            {billingPeriodLabel(slot.billing_period)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Slot + price (publisher's number, verbatim) */}
            <div className="mt-5">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{slot.name}</h3>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[1.7rem] font-semibold leading-none tracking-[-0.04em] text-white">
                        {formatSlotPrice(slot)}
                    </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            soldOut
                                ? 'border-white/[0.1] bg-white/[0.03] text-zinc-500'
                                : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                        }`}
                    >
                        <Megaphone className="h-3 w-3" />
                        {availability}
                    </span>
                    <span className="text-[10px] text-zinc-600">Price set by the publisher</span>
                </div>
            </div>

            {(slot.preview_note || (slot.preview_image_url && !previewErrored)) && (
                <div className="mt-4 flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    {slot.preview_image_url && !previewErrored && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={slot.preview_image_url}
                            alt={`Preview of ${slot.name} on ${entry.startup_name}`}
                            onError={() => setPreviewErrored(true)}
                            className="h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                        />
                    )}
                    {slot.preview_note && (
                        <p className="line-clamp-2 text-[12px] leading-5 text-zinc-400">{slot.preview_note}</p>
                    )}
                </div>
            )}

            {/* Verified traffic strip — context beside the price, never an input to it */}
            <dl className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-white/[0.05] bg-black/30 px-3 py-2.5">
                <div className="min-w-0">
                    <dt className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Visitors</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-white">
                        <Users className="h-3 w-3 text-zinc-500" />
                        {formatNumber(entry.monthly_visitors)}
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Engaged</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-white">
                        <Zap className="h-3 w-3 text-zinc-500" />
                        {Math.round(entry.engagement_rate)}%
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">30-day</dt>
                    <dd className="mt-0.5 text-[13px] font-semibold">
                        {entry.visitor_trend === 0 ? (
                            <span className="text-zinc-500">—</span>
                        ) : (
                            <span className={`inline-flex items-center gap-0.5 ${entry.visitor_trend > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {entry.visitor_trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(entry.visitor_trend).toFixed(1)}%
                            </span>
                        )}
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Top geo</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-white">
                        <Globe2 className="h-3 w-3 text-zinc-500" />
                        {entry.primary_country || '—'}
                    </dd>
                </div>
            </dl>

            {topics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {topics.map((label) => (
                        <span key={label} className="rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {label}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-auto pt-5">
                <Link
                    href={requestHref}
                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 text-[13px] font-semibold text-emerald-200 transition hover:border-emerald-400/45 hover:bg-emerald-500/[0.18]"
                >
                    View &amp; request
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </motion.article>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function SponsorIndexClient({ initial }: { initial: SponsorInventoryResponse }) {
    const reduceMotion = useReducedMotion() ?? false;

    const [data, setData] = useState<SponsorInventoryResponse>(initial);
    const [category, setCategory] = useState('all');
    const [period, setPeriod] = useState('all');
    const [sort, setSort] = useState<SortValue>('traffic');
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // Category options come from the data itself so we never show a filter with
    // zero matches. Union of the initial payload and whatever we last fetched.
    const categoryOptions = useMemo(() => {
        const set = new Set<string>();
        for (const slot of [...initial.slots, ...data.slots]) set.add(slot.entry.category || 'Other');
        return [{ value: 'all', label: 'All categories' }, ...[...set].sort().map((c) => ({ value: c, label: c }))];
    }, [initial.slots, data.slots]);

    const periodOptions = useMemo(
        () => [{ value: 'all', label: 'Any billing period' }, ...BILLING_PERIODS.map((p) => ({ value: p.value, label: p.label }))],
        [],
    );

    // Refetch when a server-side filter changes so the list is fresh; the
    // client-side pass below keeps the UI instant in the meantime.
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (category !== 'all') params.set('category', category);
        if (period !== 'all') params.set('period', period);
        params.set('sort', sort);
        setRefreshing(true);
        fetch(`/api/sponsor-inventory?${params}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: Partial<SponsorInventoryResponse> | null) => {
                if (!json || !Array.isArray(json.slots)) return;
                setData({ slots: json.slots, total: Number(json.total) || json.slots.length, sites: Number(json.sites) || 0 });
            })
            .catch(() => {})
            .finally(() => {
                if (!controller.signal.aborted) setRefreshing(false);
            });
        return () => controller.abort();
    }, [category, period, sort]);

    const visible = useMemo(() => applyView(data.slots, { category, period, sort, search }), [data.slots, category, period, sort, search]);
    const visibleSites = useMemo(() => new Set(visible.map((s) => s.entry.id)).size, [visible]);
    const hasAnyInventory = initial.slots.length > 0 || data.slots.length > 0;
    const filtersActive = category !== 'all' || period !== 'all' || search.trim() !== '';

    const fade = (delay: number) => ({
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: reduceMotion ? { duration: 0 } : { duration: 0.5, delay },
    });

    return (
        <div className="relative min-h-screen overflow-x-clip bg-[#010101] text-white">
            <PremiumBackdrop />

            <section className="relative">
                <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-28 sm:px-6 sm:pb-16 sm:pt-36 lg:px-8 lg:pt-40">
                    <div className="mx-auto max-w-[860px] text-center">
                        <motion.div {...fade(0)} className="flex justify-center">
                            <SectionLabel>Sponsor</SectionLabel>
                        </motion.div>

                        <motion.h1
                            {...fade(0.05)}
                            className="mt-6 text-balance text-[2.4rem] font-semibold tracking-[-0.06em] text-white sm:text-5xl lg:text-[4.2rem] lg:leading-[0.98]"
                        >
                            Ad slots on{' '}
                            <span className="bg-[linear-gradient(135deg,#34d399_0%,#7AD9DA_55%,#dff9ff_100%)] bg-clip-text text-transparent">
                                verified indie sites
                            </span>
                        </motion.h1>

                        <motion.p {...fade(0.12)} className="mx-auto mt-6 max-w-[640px] text-base leading-7 text-[#d8dde6] sm:text-lg sm:leading-8">
                            <span className="font-semibold text-white">{initial.sites}</span> {initial.sites === 1 ? 'site' : 'sites'} ·{' '}
                            <span className="font-semibold text-white">{initial.total}</span> {initial.total === 1 ? 'slot' : 'slots'} · every visitor number is
                            pulled from the publisher&apos;s Google Analytics, every price is set by the publisher.
                        </motion.p>

                        <motion.div {...fade(0.18)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link
                                href="/leaderboard/join"
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-6 text-[14px] font-semibold text-[#031017] shadow-[0_18px_50px_rgba(20,196,225,0.28)] transition-all duration-200 hover:brightness-105"
                            >
                                List your site
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/leaderboard"
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-6 text-[14px] font-semibold text-white transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.06]"
                            >
                                See the leaderboard
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </section>

            <section className="relative pb-24">
                <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
                    {/* Filters */}
                    <motion.div
                        {...fade(0.22)}
                        className="mb-6 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_36%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-5"
                    >
                        <div className="flex flex-col gap-4">
                            <div className="relative">
                                <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by site or slot name — “newsletter”, “hero”, “BuildLog”…"
                                    aria-label="Search ad slots"
                                    className="w-full rounded-2xl border border-white/[0.08] bg-[#04070d] px-10 py-3 text-sm text-white placeholder:text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus:border-[#14C4E1]/40 focus:outline-none focus:ring-1 focus:ring-[#14C4E1]/30"
                                />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FilterSelect label="Category" value={category} onChange={setCategory} options={categoryOptions} />
                                    <FilterSelect label="Billing period" value={period} onChange={setPeriod} options={periodOptions} />
                                    <FilterSelect
                                        label="Sort"
                                        value={sort}
                                        onChange={(v) => setSort((SORT_OPTIONS.find((o) => o.value === v)?.value) || 'traffic')}
                                        options={SORT_OPTIONS}
                                    />
                                </div>
                                <p className="text-xs text-zinc-400" aria-live="polite">
                                    <span className="font-semibold text-white">{visible.length}</span> {visible.length === 1 ? 'slot' : 'slots'} on{' '}
                                    <span className="font-semibold text-white">{visibleSites}</span> {visibleSites === 1 ? 'site' : 'sites'}
                                    {refreshing && <span className="ml-2 text-zinc-600">· refreshing…</span>}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Grid */}
                    {visible.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {visible.map((slot, index) => (
                                <SlotCard key={slot.id} slot={slot} index={index} reduceMotion={reduceMotion} />
                            ))}
                        </div>
                    ) : (
                        <motion.div
                            {...fade(0)}
                            className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] px-6 py-20 text-center shadow-[0_40px_120px_rgba(0,0,0,0.48)]"
                        >
                            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/24 bg-emerald-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                <Megaphone className="h-6 w-6 text-emerald-300" />
                            </div>
                            {hasAnyInventory && filtersActive ? (
                                <>
                                    <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">No slots match these filters</h2>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">Try a different category, billing period or search term.</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCategory('all');
                                            setPeriod('all');
                                            setSearch('');
                                        }}
                                        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-5 text-sm font-semibold text-white transition hover:border-white/[0.2] hover:bg-white/[0.06]"
                                    >
                                        Clear filters
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">No slots listed yet.</h2>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                                        Verified sites can list theirs from Settings → Leaderboard.
                                    </p>
                                    <Link
                                        href="/leaderboard/join"
                                        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-sm font-semibold text-[#031017] shadow-[0_14px_38px_rgba(20,196,225,0.22)] transition hover:brightness-105"
                                    >
                                        List your site
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </>
                            )}
                        </motion.div>
                    )}

                    {/* Explainer */}
                    <motion.div
                        {...fade(0.1)}
                        className="mt-16 grid gap-4 rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:grid-cols-3 sm:p-8"
                    >
                        {[
                            {
                                icon: ShieldCheck,
                                title: 'Verified traffic',
                                body: 'Pulled daily from GA4, never self-reported.',
                            },
                            {
                                icon: BadgeDollarSign,
                                title: 'Publisher-set prices',
                                body: 'No algorithm, no bidding, no CPM.',
                            },
                            {
                                icon: Handshake,
                                title: 'Direct deals',
                                body: 'You request, the publisher accepts, you settle directly (payments coming later).',
                            },
                        ].map((item) => (
                            <div key={item.title} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/24 bg-emerald-500/10 text-emerald-300">
                                    <item.icon className="h-4 w-4" />
                                </span>
                                <div>
                                    <div className="text-sm font-semibold text-white">{item.title}</div>
                                    <div className="mt-1 text-xs leading-5 text-zinc-500">{item.body}</div>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
