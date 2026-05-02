'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ShieldCheck, ShieldAlert, ExternalLink, ArrowUpRight, ArrowDownRight,
    Users, Eye, Zap, Timer, TrendingUp, ArrowLeft, Copy, Check,
    Twitter, Globe, ChevronDown,
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

export interface StartupProfileData {
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
    avg_session_duration: number;
    visitor_trend: number;
    is_verified: boolean;
    verification_status?: string;
    primary_country?: string | null;
    last_refreshed: string | null;
    created_at: string | null;
    history?: Array<{
        recorded_on: string | null;
        monthly_visitors: number;
        rank_overall: number | null;
        rank_in_category: number | null;
    }>;
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

function LogoIcon({ name, url, size = 'lg' }: { name: string; url: string | null; size?: 'sm' | 'lg' }) {
    const sizeClass = size === 'lg' ? 'w-16 h-16 text-2xl rounded-2xl' : 'w-10 h-10 text-base rounded-xl';
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className={`${sizeClass} object-cover ring-1 ring-white/10`} />
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
    return (
        <div className={`${sizeClass} bg-gradient-to-br ${colors[name.length % colors.length]} flex items-center justify-center text-white font-bold shadow-lg`}>
            {initial}
        </div>
    );
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.08] transition text-zinc-400 hover:text-white"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : label}
        </button>
    );
}

const LOOKING_FOR_COLORS: Record<string, string> = {
    partner: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    visibility: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    buyer: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function VerificationBadge({ status }: { status?: string }) {
    if (status === 'verified') {
        return (
            <span title="GA4 property and website host match — verified daily" className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-medium border border-emerald-500/15">
                <ShieldCheck className="w-3 h-3" /> Verified
            </span>
        );
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return (
            <span title="GA4 property does not match the claimed website — not verified" className="flex items-center gap-1 bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full text-[10px] font-medium border border-amber-500/20">
                <ShieldAlert className="w-3 h-3" /> Unverified
            </span>
        );
    }
    return (
        <span title="Verification still pending" className="flex items-center gap-1 bg-white/[0.04] text-zinc-400 px-2.5 py-1 rounded-full text-[10px] font-medium border border-white/[0.06]">
            Pending
        </span>
    );
}

function VisitorSparkline({ history }: { history: StartupProfileData['history'] }) {
    if (!history || history.length < 2) {
        return (
            <div className="text-[11px] text-zinc-600 italic py-6 text-center">
                Visitor history fills in after the daily refresh.
            </div>
        );
    }
    const data = history.map((h) => ({
        date: h.recorded_on,
        visitors: h.monthly_visitors,
    }));
    return (
        <div className="h-24 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                        contentStyle={{
                            background: '#0b1014',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8,
                            fontSize: 11,
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        itemStyle={{ color: '#34d399' }}
                        formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Visitors']}
                    />
                    <Line
                        type="monotone"
                        dataKey="visitors"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default function StartupProfileClient({ entry, profileUrl }: { entry: StartupProfileData; profileUrl: string }) {
    const [showBadge, setShowBadge] = useState(false);

    const minimalBadgeUrl = `${profileUrl.replace(/\/leaderboard\/\d+$/, '')}/api/badges/${entry.id}`;
    const rankBadgeUrl = `${minimalBadgeUrl}?variant=rank`;
    const htmlEmbed = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">\n  <img src="${minimalBadgeUrl}" alt="Verified on TrafficClaw" height="48" />\n</a>`;
    const rankHtmlEmbed = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">\n  <img src="${rankBadgeUrl}" alt="${entry.startup_name} — TrafficClaw rank" height="48" />\n</a>`;
    const markdownEmbed = `[![Verified on TrafficClaw](${minimalBadgeUrl})](${profileUrl})`;
    const tweetText = `Just got verified on TrafficClaw! Check out ${entry.startup_name}'s real traffic stats ${profileUrl}`;

    return (
        <div className="min-h-screen">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.03] rounded-full blur-[120px]" />
            </div>

            <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-24">
                <Link
                    href="/leaderboard"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition mb-8"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to leaderboard
                </Link>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 sm:p-8 mb-6">
                    <div className="flex flex-col sm:flex-row items-start gap-5">
                        <LogoIcon name={entry.startup_name} url={entry.logo_url} size="lg" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-bold text-white">{entry.startup_name}</h1>
                                <VerificationBadge status={entry.verification_status} />
                            </div>
                            {entry.description && (
                                <p className="text-sm text-zinc-400 mb-3 max-w-lg">{entry.description}</p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                                {entry.website_url && (
                                    <a
                                        href={entry.website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-cyan-400 transition"
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        {entry.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                                {entry.twitter_handle && (
                                    <a
                                        href={`https://x.com/${entry.twitter_handle.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-cyan-400 transition"
                                    >
                                        <Twitter className="w-3.5 h-3.5" />
                                        @{entry.twitter_handle.replace('@', '')}
                                    </a>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                {entry.category && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                                        {entry.category}
                                    </span>
                                )}
                                {entry.mrr_range && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 font-medium">
                                        MRR: {entry.mrr_range}
                                    </span>
                                )}
                                {entry.primary_country && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                                        {entry.primary_country}
                                    </span>
                                )}
                                {entry.looking_for?.map((tag) => (
                                    <span
                                        key={tag}
                                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                                            LOOKING_FOR_COLORS[tag] || 'bg-white/[0.04] text-zinc-400 border-white/[0.06]'
                                        }`}
                                    >
                                        🎯 {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <StatCard
                        icon={<Users className="w-4 h-4 text-emerald-400" />}
                        label="Monthly Visitors"
                        value={formatNumber(entry.monthly_visitors)}
                        trend={entry.visitor_trend}
                    />
                    <StatCard
                        icon={<Eye className="w-4 h-4 text-cyan-400" />}
                        label="Pageviews"
                        value={formatNumber(entry.monthly_pageviews)}
                    />
                    <StatCard
                        icon={<Zap className="w-4 h-4 text-amber-400" />}
                        label="Engagement"
                        value={`${entry.engagement_rate}%`}
                    />
                    <StatCard
                        icon={<Timer className="w-4 h-4 text-purple-400" />}
                        label="Avg Session"
                        value={formatDuration(entry.avg_session_duration)}
                    />
                </div>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 mb-6">
                    <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        Visitor history (30 days)
                    </h2>
                    <VisitorSparkline history={entry.history} />
                </div>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 mb-6">
                    <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        Traffic Details
                    </h2>
                    <div className="space-y-3">
                        <DetailRow label="Monthly Visitors" value={entry.monthly_visitors.toLocaleString()} />
                        <DetailRow label="Monthly Pageviews" value={entry.monthly_pageviews.toLocaleString()} />
                        <DetailRow label="Engagement Rate" value={`${entry.engagement_rate}%`} />
                        <DetailRow label="Bounce Rate" value={`${entry.bounce_rate}%`} />
                        <DetailRow label="Avg Session Duration" value={formatDuration(entry.avg_session_duration)} />
                        <DetailRow
                            label="30-day Trend"
                            value={`${entry.visitor_trend > 0 ? '+' : ''}${entry.visitor_trend}%`}
                            highlight={entry.visitor_trend > 0 ? 'green' : entry.visitor_trend < 0 ? 'red' : undefined}
                        />
                    </div>
                    {entry.last_refreshed && (
                        <p className="text-[10px] text-zinc-600 mt-4 pt-3 border-t border-white/[0.04]">
                            Last verified: {new Date(entry.last_refreshed).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    )}
                    {entry.created_at && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                            First joined: {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    )}
                </div>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-white mb-4">Share this listing</h2>

                    <div className="flex items-center gap-3 mb-6">
                        <a
                            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.08] transition text-zinc-300"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                            Share on X
                        </a>
                        <CopyButton text={profileUrl} label="Copy Link" />
                    </div>

                    <button
                        onClick={() => setShowBadge(!showBadge)}
                        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition mb-4"
                    >
                        <span className="font-mono">&lt;/&gt;</span>
                        Embed Badge
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBadge ? 'rotate-180' : ''}`} />
                    </button>

                    {showBadge && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-4 flex flex-col items-center gap-3">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={minimalBadgeUrl} alt="Verified on TrafficClaw" height={48} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={rankBadgeUrl} alt={`${entry.startup_name} — TrafficClaw category rank`} height={48} />
                                <span className="text-[10px] text-zinc-600">Two variants. The rank badge updates automatically as your placement changes.</span>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">HTML — minimal</span>
                                    <CopyButton text={htmlEmbed} label="Copy HTML" />
                                </div>
                                <pre className="bg-black/40 border border-white/[0.06] rounded-lg p-3 text-[11px] text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                                    {htmlEmbed}
                                </pre>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">HTML — rank-aware</span>
                                    <CopyButton text={rankHtmlEmbed} label="Copy HTML" />
                                </div>
                                <pre className="bg-black/40 border border-white/[0.06] rounded-lg p-3 text-[11px] text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                                    {rankHtmlEmbed}
                                </pre>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Markdown</span>
                                    <CopyButton text={markdownEmbed} label="Copy Markdown" />
                                </div>
                                <pre className="bg-black/40 border border-white/[0.06] rounded-lg p-3 text-[11px] text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                                    {markdownEmbed}
                                </pre>
                            </div>

                            <p className="text-[10px] text-zinc-600 text-center">
                                When someone clicks this badge, it links back to this verified listing.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string; trend?: number }) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-[10px] text-zinc-500 font-medium">{label}</span>
            </div>
            <div className="flex items-end gap-2">
                <span className="text-xl font-bold text-white">{value}</span>
                {trend !== undefined && trend !== 0 && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-medium mb-0.5 ${
                        trend > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                        {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(trend)}%
                    </span>
                )}
            </div>
        </div>
    );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <span className="text-xs text-zinc-500">{label}</span>
            <span className={`text-sm font-semibold ${
                highlight === 'green' ? 'text-emerald-400' :
                highlight === 'red' ? 'text-red-400' : 'text-white'
            }`}>
                {value}
            </span>
        </div>
    );
}
