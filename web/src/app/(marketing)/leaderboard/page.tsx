'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import {
    Trophy, TrendingUp, Sparkles, Clock, ShieldCheck,
    ExternalLink, ArrowUpRight, ArrowDownRight, Search,
    ChevronDown, Users, Eye, Zap, Filter
} from 'lucide-react';

interface LeaderboardEntry {
    id: number;
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
    last_refreshed: string | null;
    created_at: string | null;
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

const SORT_TABS = [
    { value: 'traffic', label: 'Traffic', icon: Users },
    { value: 'engagement', label: 'Engagement', icon: Zap },
    { value: 'newest', label: 'Newest', icon: Clock },
];

const LOOKING_FOR_COLORS: Record<string, string> = {
    partner: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    visibility: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    buyer: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) return <span className="text-2xl">🥇</span>;
    if (rank === 2) return <span className="text-2xl">🥈</span>;
    if (rank === 3) return <span className="text-2xl">🥉</span>;
    return <span className="text-lg font-bold text-zinc-500">{rank}</span>;
}

function LogoIcon({ name, url }: { name: string; url: string | null }) {
    if (url) {
        return (
            <img
                src={url}
                alt={name}
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10"
            />
        );
    }
    const initial = name.charAt(0).toUpperCase();
    const colors = [
        'from-emerald-500 to-cyan-500',
        'from-purple-500 to-pink-500',
        'from-amber-500 to-orange-500',
        'from-blue-500 to-indigo-500',
        'from-rose-500 to-red-500',
    ];
    const colorIdx = name.length % colors.length;
    return (
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white font-bold shadow-lg`}>
            {initial}
        </div>
    );
}

export default function LeaderboardPage() {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState('traffic');
    const [category, setCategory] = useState('all');
    const [mrr, setMrr] = useState('all');
    const { data: session } = useSession();

    useEffect(() => {
        fetchEntries();
    }, [sort, category, mrr]);

    async function fetchEntries() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ sort });
            if (category !== 'all') params.set('category', category);
            if (mrr !== 'all') params.set('mrr', mrr);

            const res = await fetch(`/api/leaderboard?${params}`);
            const data = await res.json();
            setEntries(Array.isArray(data) ? data : []);
        } catch {
            console.error('Failed to fetch leaderboard');
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.04] rounded-full blur-[120px]" />
                    <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-cyan-500/[0.03] rounded-full blur-[100px]" />
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.15] mb-6"
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-400">Verified via Google Analytics</span>
                    </motion.div>

                    {/* Heading */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-4xl sm:text-6xl font-bold tracking-tight"
                    >
                        <span className="text-white">Verified Traffic</span>
                        <br />
                        <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                            Leaderboard
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="mt-4 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto"
                    >
                        Real analytics from real startups. All traffic verified via Google Analytics OAuth.
                    </motion.p>

                    {/* CTA + Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        {session ? (
                            <Link
                                href="/dashboard/settings"
                                className="px-6 py-3 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20"
                            >
                                + Add Your Startup
                            </Link>
                        ) : (
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
                                className="px-6 py-3 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20"
                            >
                                + Add Your Startup (it&apos;s free)
                            </button>
                        )}
                    </motion.div>

                    {/* Value Props */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500"
                    >
                        <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Free backlink to grow your DR
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            List completely free
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            60 seconds to verify via Google
                        </span>
                    </motion.div>
                </div>
            </section>

            {/* Leaderboard Section */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
                {/* Filter Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6"
                >
                    {/* Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="appearance-none bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-xs text-zinc-300 cursor-pointer hover:bg-white/[0.06] transition focus:outline-none focus:border-emerald-500/30"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                        </div>

                        <div className="relative">
                            <select
                                value={mrr}
                                onChange={(e) => setMrr(e.target.value)}
                                className="appearance-none bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-xs text-zinc-300 cursor-pointer hover:bg-white/[0.06] transition focus:outline-none focus:border-emerald-500/30"
                            >
                                {MRR_RANGES.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                        </div>
                    </div>

                    {/* Sort Tabs */}
                    <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
                        {SORT_TABS.map(tab => (
                            <button
                                key={tab.value}
                                onClick={() => setSort(tab.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    sort === tab.value
                                        ? 'bg-white/[0.08] text-white'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Table Header */}
                <div className="hidden sm:grid grid-cols-[48px_1fr_140px_100px] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 border-b border-white/[0.04]">
                    <span>#</span>
                    <span>Startup</span>
                    <span className="text-right">Monthly Visitors</span>
                    <span className="text-right">Engagement</span>
                </div>

                {/* Entries */}
                <div className="space-y-2 mt-2">
                    <AnimatePresence mode="popLayout">
                        {loading ? (
                            // Skeleton
                            [...Array(5)].map((_, i) => (
                                <motion.div
                                    key={`skel-${i}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 animate-pulse"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/[0.05]" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 w-40 bg-white/[0.05] rounded" />
                                            <div className="h-3 w-64 bg-white/[0.03] rounded" />
                                        </div>
                                        <div className="h-6 w-24 bg-white/[0.05] rounded" />
                                    </div>
                                </motion.div>
                            ))
                        ) : entries.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-20"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-emerald-500/[0.08] flex items-center justify-center mx-auto mb-4">
                                    <Trophy className="w-7 h-7 text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">Be the first on the leaderboard!</h3>
                                <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
                                    Connect your Google Analytics and share your verified traffic to appear here.
                                </p>
                                <button
                                    onClick={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
                                    className="px-5 py-2.5 text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-all"
                                >
                                    + Add Your Startup
                                </button>
                            </motion.div>
                        ) : (
                            entries.map((entry, index) => (
                                <motion.div
                                    key={entry.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                    className="group relative bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-[48px_1fr_140px_100px] gap-3 sm:gap-4 items-center">
                                        {/* Rank */}
                                        <div className="hidden sm:flex items-center justify-center">
                                            <RankBadge rank={index + 1} />
                                        </div>

                                        {/* Startup Info */}
                                        <div className="flex items-start sm:items-center gap-3">
                                            <div className="flex sm:hidden items-center justify-center w-6">
                                                <RankBadge rank={index + 1} />
                                            </div>
                                            <LogoIcon name={entry.startup_name} url={entry.logo_url} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-white truncate">
                                                        {entry.startup_name}
                                                    </h3>
                                                    {entry.is_verified && (
                                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                                    )}
                                                    {entry.website_url && (
                                                        <a
                                                            href={entry.website_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-zinc-600 hover:text-zinc-400 transition"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                                {entry.description && (
                                                    <p className="text-xs text-zinc-500 truncate mt-0.5 max-w-md">
                                                        {entry.description}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                    {entry.mrr_range && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-medium">
                                                            $ {entry.mrr_range}
                                                        </span>
                                                    )}
                                                    {entry.category && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                                                            {entry.category}
                                                        </span>
                                                    )}
                                                    {entry.looking_for?.map(tag => (
                                                        <span
                                                            key={tag}
                                                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                                                                LOOKING_FOR_COLORS[tag] || 'bg-white/[0.04] text-zinc-400 border-white/[0.06]'
                                                            }`}
                                                        >
                                                            🎯 {tag}
                                                        </span>
                                                    ))}
                                                    {entry.twitter_handle && (
                                                        <a
                                                            href={`https://x.com/${entry.twitter_handle.replace('@', '')}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06] hover:text-cyan-400 hover:border-cyan-500/20 transition"
                                                        >
                                                            @{entry.twitter_handle.replace('@', '')}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Monthly Visitors */}
                                        <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0.5 pl-9 sm:pl-0">
                                            <span className="text-lg sm:text-xl font-bold text-white">
                                                {formatNumber(entry.monthly_visitors)}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {entry.visitor_trend !== 0 && (
                                                    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${
                                                        entry.visitor_trend > 0 ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                        {entry.visitor_trend > 0 ? (
                                                            <ArrowUpRight className="w-3 h-3" />
                                                        ) : (
                                                            <ArrowDownRight className="w-3 h-3" />
                                                        )}
                                                        {Math.abs(entry.visitor_trend)}%
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-zinc-600 hidden sm:inline">
                                                    monthly visitors
                                                </span>
                                            </div>
                                        </div>

                                        {/* Engagement */}
                                        <div className="hidden sm:flex flex-col items-end gap-0.5">
                                            <span className="text-lg font-bold text-white">
                                                {entry.engagement_rate}%
                                            </span>
                                            <span className="text-[10px] text-zinc-600">engagement</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom CTA */}
                {!loading && entries.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-center mt-12 pb-8"
                    >
                        <p className="text-sm text-zinc-500 mb-4">
                            Want to see your startup here?
                        </p>
                        <button
                            onClick={() => session
                                ? window.location.href = '/dashboard/settings'
                                : signIn('google', { callbackUrl: '/dashboard/settings' })
                            }
                            className="px-6 py-3 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20"
                        >
                            + Add Your Startup — It&apos;s Free
                        </button>
                    </motion.div>
                )}
            </section>
        </div>
    );
}
