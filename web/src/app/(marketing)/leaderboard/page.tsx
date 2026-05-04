'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
    Trophy, Sparkles, Clock, ShieldCheck,
    ArrowUpRight, ArrowDownRight, Search as SearchIcon,
    ChevronDown, ChevronLeft, ChevronRight, Users, Zap,
    AlertTriangle, Flame, ArrowRight,
} from 'lucide-react';

interface LeaderboardEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    mrr_range: string | null;
    looking_for: string[];
    twitter_handle: string | null;
    monthly_visitors: number;
    monthly_pageviews: number;
    engagement_rate: number;
    bounce_rate: number;
    visitor_trend: number;
    is_verified: boolean;
    verification_status?: string;
    primary_country?: string | null;
    last_refreshed: string | null;
    created_at: string | null;
}

interface LeaderboardListResponse {
    entries: LeaderboardEntry[];
    total: number;
    page: number;
    pageSize: number;
}

const CATEGORIES = [
    { value: 'all', label: 'All Categories' },
    { value: 'SaaS', label: 'SaaS' },
    { value: 'E-commerce', label: 'E-commerce' },
    { value: 'Blog', label: 'Blog' },
    { value: 'Agency', label: 'Agency' },
    { value: 'Tool', label: 'Tool' },
    { value: 'Other', label: 'Other' },
];

const MRR_RANGES = [
    { value: 'all', label: 'All Revenue' },
    { value: '$0-500', label: '$0-$500' },
    { value: '$500-1K', label: '$500-$1K' },
    { value: '$1K-5K', label: '$1K-$5K' },
    { value: '$5K-10K', label: '$5K-$10K' },
    { value: '$10K+', label: '$10K+' },
];

const COUNTRIES = [
    { value: 'all', label: 'All Countries' },
    { value: 'US', label: 'United States' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'IN', label: 'India' },
    { value: 'CA', label: 'Canada' },
    { value: 'DE', label: 'Germany' },
    { value: 'FR', label: 'France' },
    { value: 'AU', label: 'Australia' },
    { value: 'BR', label: 'Brazil' },
    { value: 'JP', label: 'Japan' },
];

const SORT_TABS = [
    { value: 'traffic', label: 'Traffic', icon: Users },
    { value: 'engagement', label: 'Engagement', icon: Zap },
    { value: 'movers', label: 'Movers', icon: Flame },
    { value: 'newest', label: 'Newest', icon: Clock },
];

const LOOKING_FOR_COLORS: Record<string, string> = {
    partner: 'bg-[#14C4E1]/10 text-[#7AD9DA] border-[#14C4E1]/22',
    visibility: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    buyer: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

const PAGE_SIZE = 25;

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
            {children}
        </div>
    );
}

function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) {
        return (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-[linear-gradient(180deg,rgba(251,191,36,0.16),rgba(245,158,11,0.06))] text-[13px] font-bold text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_22px_rgba(245,158,11,0.18)]">
                01
            </span>
        );
    }
    if (rank === 2) {
        return (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-300/30 bg-[linear-gradient(180deg,rgba(212,212,216,0.16),rgba(161,161,170,0.04))] text-[13px] font-bold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_rgba(161,161,170,0.16)]">
                02
            </span>
        );
    }
    if (rank === 3) {
        return (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-400/35 bg-[linear-gradient(180deg,rgba(251,146,60,0.14),rgba(234,88,12,0.04))] text-[13px] font-bold text-orange-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_rgba(234,88,12,0.16)]">
                03
            </span>
        );
    }
    return (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-[12px] font-semibold tabular-nums text-zinc-400">
            {String(rank).padStart(2, '0')}
        </span>
    );
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
                className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10"
            />
        );
    }
    const initial = name.charAt(0).toUpperCase();
    const palettes = [
        'from-[#14C4E1] to-[#7AD9DA]',
        'from-purple-500 to-pink-500',
        'from-amber-400 to-orange-500',
        'from-blue-500 to-indigo-500',
        'from-rose-500 to-red-500',
    ];
    const palette = palettes[name.length % palettes.length];
    return (
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${palette} text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_24px_rgba(0,0,0,0.32)]`}>
            {initial}
        </div>
    );
}

function MoversRail({ entries }: { entries: LeaderboardEntry[] }) {
    if (entries.length === 0) return null;
    return (
        <section aria-label="Top movers this week" className="mb-12">
            <div className="mb-4 flex items-end justify-between">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">
                        <Flame className="h-3 w-3" />
                        Movers this week
                    </div>
                    <h2 className="text-lg font-semibold tracking-[-0.03em] text-white sm:text-xl">
                        Biggest 30-day visitor gains
                    </h2>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {entries.map((entry) => (
                    <Link
                        key={entry.id}
                        href={`/leaderboard/${entry.slug || entry.id}`}
                        className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.08),transparent_44%),linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_50px_rgba(0,0,0,0.42)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#14C4E1]/40 hover:shadow-[0_24px_60px_rgba(20,196,225,0.18)]"
                    >
                        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(122,217,218,0.45),transparent)] opacity-0 transition-opacity group-hover:opacity-100" />
                        <div className="mb-3 flex items-center gap-2.5">
                            <LogoIcon name={entry.startup_name} url={entry.logo_url} websiteUrl={entry.website_url} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold text-white">{entry.startup_name}</div>
                                <div className="truncate text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                    {entry.category || 'Startup'}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold tracking-[-0.04em] text-white">
                                {formatNumber(entry.monthly_visitors)}
                            </span>
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                <ArrowUpRight className="h-3 w-3" />
                                {Math.abs(entry.visitor_trend).toFixed(1)}%
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}

function VerifiedPill({ status }: { status: string | undefined }) {
    if (status === 'verified') {
        return (
            <span title="GA4 property and claimed website host match" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#14C4E1]/14 text-[#7AD9DA]">
                <ShieldCheck className="h-3 w-3" />
            </span>
        );
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return (
            <span title="GA4 property does not match the claimed website" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/14 text-amber-300">
                <AlertTriangle className="h-3 w-3" />
            </span>
        );
    }
    return null;
}

export default function LeaderboardPage() {
    return (
        <Suspense fallback={<LeaderboardLoadingFallback />}>
            <LeaderboardPageInner />
        </Suspense>
    );
}

function LeaderboardLoadingFallback() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[#010101] text-white">
            <PremiumBackdrop />
            <div className="relative flex min-h-screen items-center justify-center">
                <span className="text-sm text-zinc-500 animate-pulse">Loading leaderboard…</span>
            </div>
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
            <div className="pointer-events-none absolute left-1/2 top-[10%] h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(20,196,225,0.18),transparent_60%)] blur-[120px]" />
            <div className="pointer-events-none absolute right-[8%] top-[24%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(122,217,218,0.14),transparent_60%)] blur-[110px]" />
        </>
    );
}

function LeaderboardPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session } = useSession();

    const sort = searchParams.get('sort') || 'traffic';
    const category = searchParams.get('category') || 'all';
    const mrr = searchParams.get('mrr') || 'all';
    const country = searchParams.get('country') || 'all';
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const q = searchParams.get('q') || '';

    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [movers, setMovers] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState(q);

    const updateParams = useCallback(
        (next: Record<string, string | undefined>) => {
            const params = new URLSearchParams(searchParams.toString());
            for (const [key, value] of Object.entries(next)) {
                if (value === undefined || value === '' || value === 'all') {
                    params.delete(key);
                } else {
                    params.set(key, value);
                }
            }
            const queryString = params.toString();
            router.replace(queryString ? `/leaderboard?${queryString}` : '/leaderboard', { scroll: false });
        },
        [router, searchParams],
    );

    useEffect(() => {
        const trimmed = searchInput.trim();
        if (trimmed === q) return;
        const handle = setTimeout(() => {
            updateParams({ q: trimmed || undefined, page: '1' });
        }, 300);
        return () => clearTimeout(handle);
    }, [searchInput, q, updateParams]);

    useEffect(() => {
        let cancelled = false;
        async function fetchEntries() {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    sort,
                    page: String(page),
                    page_size: String(PAGE_SIZE),
                });
                if (category !== 'all') params.set('category', category);
                if (mrr !== 'all') params.set('mrr', mrr);
                if (country !== 'all') params.set('country', country);
                if (q) params.set('q', q);
                const res = await fetch(`/api/leaderboard?${params}`);
                if (!res.ok) throw new Error(String(res.status));
                const data = (await res.json()) as LeaderboardListResponse;
                if (cancelled) return;
                setEntries(data.entries || []);
                setTotal(data.total || 0);
            } catch {
                if (cancelled) return;
                setEntries([]);
                setTotal(0);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchEntries();
        return () => {
            cancelled = true;
        };
    }, [sort, category, mrr, country, q, page]);

    const moversFetchedFor = useRef<string>('');
    useEffect(() => {
        const key = category;
        if (moversFetchedFor.current === key) return;
        moversFetchedFor.current = key;
        const params = new URLSearchParams({ sort: 'movers', page: '1', page_size: '5' });
        if (category !== 'all') params.set('category', category);
        fetch(`/api/leaderboard?${params}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: LeaderboardListResponse | null) => {
                if (!data) return;
                setMovers((data.entries || []).filter((e) => e.visitor_trend > 0));
            })
            .catch(() => {});
    }, [category]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const baseRank = (page - 1) * PAGE_SIZE;
    const joinHref = '/leaderboard/join';

    return (
        <div className="relative min-h-screen overflow-x-clip bg-[#010101] text-white">
            <PremiumBackdrop />

            <section className="relative">
                <div className="mx-auto max-w-[1240px] px-4 pb-14 pt-28 sm:px-6 sm:pb-20 sm:pt-36 lg:px-8 lg:pb-24 lg:pt-44">
                    <div className="mx-auto max-w-[920px] text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45 }}
                            className="flex justify-center"
                        >
                            <SectionLabel>Verified · GA4 + Domain Match</SectionLabel>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.05 }}
                            className="mt-6 text-balance text-[2.6rem] font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-[4.6rem] lg:leading-[0.96]"
                        >
                            <span className="text-white">The verified</span>
                            <br />
                            <span className="bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_50%,#dff9ff_100%)] bg-clip-text text-transparent">
                                traffic leaderboard
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.12 }}
                            className="mx-auto mt-6 max-w-[620px] text-base leading-7 text-[#d8dde6] sm:text-lg sm:leading-8"
                        >
                            Real GA4 numbers, ranked daily. Every listing is matched against the website host its analytics property reports for — no inflated screenshots, no guesses.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.18 }}
                            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
                        >
                            {session ? (
                                <Link
                                    href={joinHref}
                                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-6 text-[14px] font-semibold text-[#031017] shadow-[0_18px_50px_rgba(20,196,225,0.28)] transition-all duration-200 hover:brightness-105"
                                >
                                    Add your startup
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            ) : (
                                <button
                                    onClick={() => signIn('google', { callbackUrl: joinHref })}
                                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-6 text-[14px] font-semibold text-[#031017] shadow-[0_18px_50px_rgba(20,196,225,0.28)] transition-all duration-200 hover:brightness-105"
                                >
                                    Add your startup — it&apos;s free
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            )}
                            <Link
                                href="#how-verification"
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-6 text-[14px] font-semibold text-white transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.06]"
                            >
                                How verification works
                            </Link>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.24 }}
                            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-zinc-400"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-[#7AD9DA]" />
                                Free backlink to grow your DR
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-[#7AD9DA]" />
                                List completely free
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-amber-300" />
                                60 seconds to verify via Google
                            </span>
                        </motion.div>
                    </div>
                </div>
            </section>

            <section className="relative pb-24">
                <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
                    <MoversRail entries={movers} />

                    <div className="mb-6 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_36%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-5">
                        <div className="flex flex-col gap-4">
                            <div className="relative">
                                <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    placeholder="Search startups by name or description…"
                                    className="w-full rounded-2xl border border-white/[0.08] bg-[#04070d] px-10 py-3 text-sm text-white placeholder:text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus:border-[#14C4E1]/40 focus:outline-none focus:ring-1 focus:ring-[#14C4E1]/30"
                                />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FilterSelect value={category} onChange={(v) => updateParams({ category: v, page: '1' })} options={CATEGORIES} />
                                    <FilterSelect value={mrr} onChange={(v) => updateParams({ mrr: v, page: '1' })} options={MRR_RANGES} />
                                    <FilterSelect value={country} onChange={(v) => updateParams({ country: v, page: '1' })} options={COUNTRIES} />
                                </div>

                                <div className="flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                    {SORT_TABS.map((tab) => (
                                        <button
                                            key={tab.value}
                                            onClick={() => updateParams({ sort: tab.value, page: '1' })}
                                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                                                sort === tab.value
                                                    ? 'bg-[linear-gradient(135deg,rgba(20,196,225,0.18),rgba(122,217,218,0.06))] text-[#7AD9DA] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                                                    : 'text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            <tab.icon className="h-3.5 w-3.5" />
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.05),transparent_36%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
                        <div className="hidden grid-cols-[80px_minmax(0,1fr)_140px_140px_120px] items-center gap-4 border-b border-white/[0.05] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 sm:grid">
                            <span>Rank</span>
                            <span>Startup</span>
                            <span className="text-right">Monthly visitors</span>
                            <span className="text-right">30-day trend</span>
                            <span className="text-right">Engagement</span>
                        </div>

                        <div>
                            <AnimatePresence mode="popLayout">
                                {loading ? (
                                    [...Array(6)].map((_, i) => (
                                        <motion.div
                                            key={`skel-${i}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="border-b border-white/[0.04] px-5 py-4 last:border-b-0"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="h-9 w-9 rounded-xl bg-white/[0.05] animate-pulse" />
                                                <div className="h-11 w-11 rounded-xl bg-white/[0.05] animate-pulse" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-3.5 w-44 rounded bg-white/[0.05] animate-pulse" />
                                                    <div className="h-3 w-72 rounded bg-white/[0.03] animate-pulse" />
                                                </div>
                                                <div className="h-6 w-20 rounded bg-white/[0.05] animate-pulse" />
                                                <div className="h-6 w-16 rounded bg-white/[0.04] animate-pulse" />
                                                <div className="h-6 w-14 rounded bg-white/[0.04] animate-pulse" />
                                            </div>
                                        </motion.div>
                                    ))
                                ) : entries.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="px-6 py-20 text-center"
                                    >
                                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#14C4E1]/24 bg-[#14C4E1]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                            <Trophy className="h-6 w-6 text-[#7AD9DA]" />
                                        </div>
                                        <h3 className="text-lg font-semibold tracking-[-0.03em] text-white">
                                            {q ? `No startups match "${q}"` : 'Be the first on the leaderboard'}
                                        </h3>
                                        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                                            {q
                                                ? 'Try a different search or clear filters.'
                                                : 'Connect your Google Analytics property and we&apos;ll verify it against your domain — listed instantly.'}
                                        </p>
                                        <button
                                            onClick={() => (session ? router.push(joinHref) : signIn('google', { callbackUrl: joinHref }))}
                                            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-sm font-semibold text-[#031017] shadow-[0_14px_38px_rgba(20,196,225,0.22)] transition hover:brightness-105"
                                        >
                                            Add your startup
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    </motion.div>
                                ) : (
                                    entries.map((entry, index) => (
                                        <motion.button
                                            key={entry.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.25, delay: index * 0.02 }}
                                            type="button"
                                            onClick={() => router.push(`/leaderboard/${entry.slug || entry.id}`)}
                                            className="group block w-full cursor-pointer border-b border-white/[0.04] px-5 py-4 text-left transition-all duration-200 last:border-b-0 hover:bg-[linear-gradient(90deg,rgba(20,196,225,0.06),transparent)]"
                                        >
                                            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[80px_minmax(0,1fr)_140px_140px_120px] sm:gap-4">
                                                <div className="hidden sm:flex sm:items-center sm:justify-start">
                                                    <RankBadge rank={baseRank + index + 1} />
                                                </div>

                                                <div className="flex items-start gap-3 sm:items-center">
                                                    <div className="flex sm:hidden">
                                                        <RankBadge rank={baseRank + index + 1} />
                                                    </div>
                                                    <LogoIcon name={entry.startup_name} url={entry.logo_url} websiteUrl={entry.website_url} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-white group-hover:text-[#dff9ff]">
                                                                {entry.startup_name}
                                                            </h3>
                                                            <VerifiedPill status={entry.verification_status} />
                                                        </div>
                                                        {entry.description && (
                                                            <p className="mt-1 line-clamp-1 max-w-xl text-[12px] leading-5 text-zinc-500">
                                                                {entry.description}
                                                            </p>
                                                        )}
                                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                            {entry.mrr_range && (
                                                                <span className="rounded-full border border-[#14C4E1]/22 bg-[#14C4E1]/10 px-2 py-0.5 text-[10px] font-medium text-[#dff9ff]">
                                                                    $ {entry.mrr_range}
                                                                </span>
                                                            )}
                                                            {entry.category && (
                                                                <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-400">
                                                                    {entry.category}
                                                                </span>
                                                            )}
                                                            {entry.primary_country && (
                                                                <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-400">
                                                                    {entry.primary_country}
                                                                </span>
                                                            )}
                                                            {entry.looking_for?.map((tag) => (
                                                                <span
                                                                    key={tag}
                                                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                                        LOOKING_FOR_COLORS[tag] || 'border-white/[0.08] bg-white/[0.02] text-zinc-400'
                                                                    }`}
                                                                >
                                                                    🎯 {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center sm:gap-0.5">
                                                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 sm:hidden">Visitors</span>
                                                    <span className="text-lg font-bold tracking-[-0.03em] text-white sm:text-xl">
                                                        {formatNumber(entry.monthly_visitors)}
                                                    </span>
                                                    <span className="hidden text-[10px] uppercase tracking-[0.2em] text-zinc-600 sm:inline">Monthly</span>
                                                </div>

                                                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center sm:gap-0.5">
                                                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 sm:hidden">Trend</span>
                                                    {entry.visitor_trend === 0 ? (
                                                        <span className="text-sm text-zinc-500">—</span>
                                                    ) : (
                                                        <span
                                                            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                                                entry.visitor_trend > 0
                                                                    ? 'border-emerald-400/22 bg-emerald-500/10 text-emerald-300'
                                                                    : 'border-red-400/22 bg-red-500/10 text-red-300'
                                                            }`}
                                                        >
                                                            {entry.visitor_trend > 0 ? (
                                                                <ArrowUpRight className="h-3 w-3" />
                                                            ) : (
                                                                <ArrowDownRight className="h-3 w-3" />
                                                            )}
                                                            {Math.abs(entry.visitor_trend)}%
                                                        </span>
                                                    )}
                                                    <span className="hidden text-[10px] uppercase tracking-[0.2em] text-zinc-600 sm:inline">30 days</span>
                                                </div>

                                                <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-0.5">
                                                    <span className="text-base font-semibold tracking-[-0.02em] text-white">
                                                        {entry.engagement_rate}%
                                                    </span>
                                                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Engagement</span>
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {!loading && totalPages > 1 && (
                        <div className="mt-6 flex flex-col items-start justify-between gap-3 px-1 sm:flex-row sm:items-center">
                            <span className="text-xs text-zinc-500">
                                Showing <span className="text-zinc-300">{baseRank + 1}–{Math.min(baseRank + entries.length, total)}</span> of{' '}
                                <span className="text-zinc-300">{total}</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => updateParams({ page: String(page - 1) })}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[#14C4E1]/30 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    Previous
                                </button>
                                <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-400">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => updateParams({ page: String(page + 1) })}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[#14C4E1]/30 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Next
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    <div id="how-verification" className="mt-16 overflow-hidden rounded-[32px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.08),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-10">
                        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div>
                                <SectionLabel>How we verify</SectionLabel>
                                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                                    Real numbers, matched to a real domain
                                </h2>
                                <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base">
                                    Listing once requires connecting your GA4 property. We then call Google&apos;s Admin API for the property&apos;s configured web stream URI and compare its host against the website you&apos;re listing. Mismatches never reach the public table.
                                </p>
                                <div className="mt-6 grid gap-3">
                                    {[
                                        { num: '01', title: 'Connect GA4', body: 'OAuth scope is read-only — analytics.readonly + webmasters.readonly. Nothing is written.' },
                                        { num: '02', title: 'Domain match', body: 'We compare the property’s defaultUri host (with www. stripped) to your claimed website.' },
                                        { num: '03', title: 'Daily refresh', body: 'A jittered cron job pulls 28-day visitor totals, country, engagement and trend.' },
                                    ].map((step) => (
                                        <div key={step.num} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#14C4E1]/24 bg-[#14C4E1]/10 text-[11px] font-semibold text-[#7AD9DA]">
                                                {step.num}
                                            </span>
                                            <div>
                                                <div className="text-sm font-semibold text-white">{step.title}</div>
                                                <div className="mt-1 text-xs leading-5 text-zinc-500">{step.body}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[26px] border border-white/[0.06] bg-[#04070d]/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_70px_rgba(0,0,0,0.5)]">
                                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7AD9DA]">Verification preview</span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#14C4E1]/24 bg-[#14C4E1]/10 px-2.5 py-1 text-[10px] font-semibold text-[#dff9ff]">
                                        <ShieldCheck className="h-3 w-3" />
                                        VERIFIED
                                    </span>
                                </div>
                                <div className="mt-5 space-y-3 text-[12.5px] font-mono">
                                    <Row label="property" value="properties/345678901" />
                                    <Row label="defaultUri" value="https://yoursite.com" highlight />
                                    <Row label="claimed" value="yoursite.com" highlight />
                                    <Row label="match" value="✓ host equal (www. stripped)" tone="ok" />
                                    <Row label="status" value="verified" tone="ok" />
                                </div>
                                <div className="mt-6 rounded-2xl border border-white/[0.05] bg-black/40 p-4">
                                    <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">If we can&apos;t match</div>
                                    <div className="mt-2 text-xs leading-5 text-zinc-400">
                                        The listing stays on the table with an amber <em className="not-italic text-amber-300">Unverified</em> pill so visitors know not to trust the numbers, and you can re-submit once the GA property points at the correct host.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function Row({ label, value, tone, highlight }: { label: string; value: string; tone?: 'ok' | 'warn'; highlight?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</span>
            <span
                className={`text-right ${
                    tone === 'ok'
                        ? 'text-emerald-300'
                        : tone === 'warn'
                        ? 'text-amber-300'
                        : highlight
                        ? 'text-[#7AD9DA]'
                        : 'text-zinc-200'
                }`}
            >
                {value}
            </span>
        </div>
    );
}

function FilterSelect({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    const isActive = value !== 'all';
    return (
        <div className="relative">
            <select
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
