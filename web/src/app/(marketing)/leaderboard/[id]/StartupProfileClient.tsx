'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ShieldCheck, ShieldAlert, ExternalLink, ArrowUpRight, ArrowDownRight,
    Users, Eye, Zap, Timer, ArrowLeft, Copy, Check,
    Twitter, Globe, ChevronDown, Sparkles,
} from 'lucide-react';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
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
            <div className="pointer-events-none absolute left-1/2 top-[8%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(20,196,225,0.16),transparent_60%)] blur-[120px]" />
        </>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
            {children}
        </div>
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

function LogoIcon({
    name,
    url,
    websiteUrl,
    size = 'lg',
}: {
    name: string;
    url: string | null;
    websiteUrl?: string | null;
    size?: 'sm' | 'lg';
}) {
    const sizeClass = size === 'lg' ? 'h-20 w-20 rounded-2xl text-3xl' : 'h-10 w-10 rounded-xl text-base';
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
                className={`${sizeClass} object-cover ring-1 ring-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.45)]`}
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
    return (
        <div className={`${sizeClass} flex items-center justify-center bg-gradient-to-br ${palettes[name.length % palettes.length]} text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_60px_rgba(0,0,0,0.45)]`}>
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
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[#14C4E1]/30 hover:bg-white/[0.06] hover:text-white"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-[#7AD9DA]" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : label}
        </button>
    );
}

const LOOKING_FOR_COLORS: Record<string, string> = {
    partner: 'bg-[#14C4E1]/10 text-[#7AD9DA] border-[#14C4E1]/22',
    visibility: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    buyer: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

function VerificationBadge({ status }: { status?: string }) {
    if (status === 'verified') {
        return (
            <span title="GA4 property and website host match — verified daily" className="inline-flex items-center gap-1.5 rounded-full border border-[#14C4E1]/30 bg-[linear-gradient(135deg,rgba(20,196,225,0.18),rgba(122,217,218,0.06))] px-3 py-1 text-[11px] font-semibold text-[#dff9ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <ShieldCheck className="h-3 w-3" /> Verified
            </span>
        );
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return (
            <span title="GA4 property does not match the claimed website" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-3 py-1 text-[11px] font-semibold text-amber-200">
                <ShieldAlert className="h-3 w-3" /> Unverified
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-zinc-400">
            Pending
        </span>
    );
}

function VisitorSparkline({
    history,
    currentVisitors,
    visitorTrend,
}: {
    history: StartupProfileData['history'];
    currentVisitors: number;
    visitorTrend: number;
}) {
    // Derive the chart series. Order of preference:
    //   1. Real history with ≥2 days — plot as-is.
    //   2. Single history row — synthesize a 28-days-ago point using the current
    //      trend so the chart still draws a line (no awkward empty box).
    //   3. No history at all — synthesize a two-point line from the trend.
    const data: Array<{ date: string; visitors: number; synthetic: boolean }> = [];
    if (history && history.length >= 2) {
        for (const h of history) {
            data.push({
                date: h.recorded_on || '',
                visitors: h.monthly_visitors || 0,
                synthetic: false,
            });
        }
    } else if (currentVisitors > 0) {
        const today = new Date();
        const baselineDate = new Date(today);
        baselineDate.setDate(baselineDate.getDate() - 28);
        // If trend is positive the "before" point is lower; if negative it's higher.
        const baseline = visitorTrend !== 0
            ? Math.max(0, Math.round(currentVisitors / (1 + visitorTrend / 100)))
            : Math.max(0, Math.round(currentVisitors * 0.92));
        data.push({
            date: baselineDate.toISOString().slice(0, 10),
            visitors: baseline,
            synthetic: true,
        });
        const todayPoint = history && history.length === 1
            ? history[0]
            : { recorded_on: today.toISOString().slice(0, 10), monthly_visitors: currentVisitors };
        data.push({
            date: todayPoint.recorded_on || today.toISOString().slice(0, 10),
            visitors: todayPoint.monthly_visitors || currentVisitors,
            synthetic: history?.length !== 1,
        });
    }

    if (data.length < 2) {
        return (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] text-center text-[12px] italic text-zinc-500">
                Visitor history fills in after the daily refresh.
            </div>
        );
    }

    const isSynthetic = data.some((d) => d.synthetic);

    return (
        <div className="space-y-2">
            <div className="h-40 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                        <defs>
                            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#14C4E1" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="#14C4E1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={{
                                background: '#04070d',
                                border: '1px solid rgba(20,196,225,0.3)',
                                borderRadius: 12,
                                fontSize: 11,
                                boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                            }}
                            labelStyle={{ color: '#94a3b8' }}
                            itemStyle={{ color: '#7AD9DA' }}
                            formatter={(value: number | undefined) => [formatNumber(value ?? 0), 'Visitors']}
                        />
                        <Area
                            type="monotone"
                            dataKey="visitors"
                            stroke="#7AD9DA"
                            strokeWidth={2}
                            fill="url(#sparkFill)"
                            isAnimationActive={false}
                            strokeDasharray={isSynthetic ? '4 3' : undefined}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            {isSynthetic && (
                <p className="text-[10px] italic text-zinc-600">
                    Day-1 reading — the daily refresh fills in real history points over time.
                </p>
            )}
        </div>
    );
}

export default function StartupProfileClient({ entry, profileUrl }: { entry: StartupProfileData; profileUrl: string }) {
    const [showBadge, setShowBadge] = useState(false);

    const baseOrigin = profileUrl.replace(/\/leaderboard\/\d+$/, '');
    const minimalBadgeUrl = `${baseOrigin}/api/badges/${entry.id}`;
    const rankBadgeUrl = `${minimalBadgeUrl}?variant=rank`;
    const htmlEmbed = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">\n  <img src="${minimalBadgeUrl}" alt="Verified on TrafficClaw" height="48" />\n</a>`;
    const rankHtmlEmbed = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">\n  <img src="${rankBadgeUrl}" alt="${entry.startup_name} — TrafficClaw rank" height="48" />\n</a>`;
    const markdownEmbed = `[![Verified on TrafficClaw](${minimalBadgeUrl})](${profileUrl})`;
    const tweetText = `Just got verified on TrafficClaw! Check out ${entry.startup_name}'s real traffic stats ${profileUrl}`;

    return (
        <div className="relative min-h-screen overflow-x-clip bg-[#010101] text-white">
            <PremiumBackdrop />

            <div className="relative mx-auto max-w-[1080px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 lg:px-8">
                <Link
                    href="/leaderboard"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-[#7AD9DA]"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to leaderboard
                </Link>

                {/* Hero card */}
                <div className="mt-6 overflow-hidden rounded-[32px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.1),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-10">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                        <LogoIcon name={entry.startup_name} url={entry.logo_url} websiteUrl={entry.website_url} size="lg" />
                        <div className="min-w-0 flex-1">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <SectionLabel>{entry.category || 'Startup'}</SectionLabel>
                                <VerificationBadge status={entry.verification_status} />
                            </div>
                            <h1 className="text-balance text-3xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-[3.6rem] lg:leading-[1.02]">
                                {entry.startup_name}
                            </h1>
                            {entry.description && (
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                                    {entry.description}
                                </p>
                            )}

                            <div className="mt-5 flex flex-wrap items-center gap-2">
                                {entry.website_url && (
                                    <a
                                        href={entry.website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[#14C4E1]/35 hover:text-[#dff9ff]"
                                    >
                                        <Globe className="h-3.5 w-3.5" />
                                        {entry.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {entry.twitter_handle && (
                                    <a
                                        href={`https://x.com/${entry.twitter_handle.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[#14C4E1]/35 hover:text-[#dff9ff]"
                                    >
                                        <Twitter className="h-3.5 w-3.5" />
                                        @{entry.twitter_handle.replace('@', '')}
                                    </a>
                                )}
                                {entry.mrr_range && (
                                    <span className="rounded-full border border-[#14C4E1]/22 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-medium text-[#dff9ff]">
                                        MRR · {entry.mrr_range}
                                    </span>
                                )}
                                {entry.primary_country && (
                                    <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-400">
                                        {entry.primary_country}
                                    </span>
                                )}
                                {entry.looking_for?.map((tag) => (
                                    <span
                                        key={tag}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                                            LOOKING_FOR_COLORS[tag] || 'border-white/[0.08] bg-white/[0.02] text-zinc-400'
                                        }`}
                                    >
                                        🎯 {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stat tiles */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    <StatTile
                        icon={<Users className="h-4 w-4 text-[#7AD9DA]" />}
                        accent="cyan"
                        label="Monthly visitors"
                        value={formatNumber(entry.monthly_visitors)}
                        trend={entry.visitor_trend}
                    />
                    <StatTile
                        icon={<Eye className="h-4 w-4 text-[#7AD9DA]" />}
                        accent="cyan"
                        label="Pageviews"
                        value={formatNumber(entry.monthly_pageviews)}
                    />
                    <StatTile
                        icon={<Zap className="h-4 w-4 text-amber-300" />}
                        accent="amber"
                        label="Engagement"
                        value={`${entry.engagement_rate}%`}
                    />
                    <StatTile
                        icon={<Timer className="h-4 w-4 text-purple-300" />}
                        accent="purple"
                        label="Avg session"
                        value={formatDuration(entry.avg_session_duration)}
                    />
                </div>

                {/* Visitor history */}
                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_36%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-8">
                        <div className="mb-4 flex items-end justify-between">
                            <div className="space-y-2">
                                <SectionLabel>Visitor history</SectionLabel>
                                <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">Last 30 days</h2>
                            </div>
                            {entry.visitor_trend !== 0 && (
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                                        entry.visitor_trend > 0
                                            ? 'border-emerald-400/22 bg-emerald-500/10 text-emerald-300'
                                            : 'border-red-400/22 bg-red-500/10 text-red-300'
                                    }`}
                                >
                                    {entry.visitor_trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {Math.abs(entry.visitor_trend)}% / 30d
                                </span>
                            )}
                        </div>
                        <VisitorSparkline
                            history={entry.history}
                            currentVisitors={entry.monthly_visitors}
                            visitorTrend={entry.visitor_trend}
                        />
                    </div>

                    <div className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-8">
                        <SectionLabel>Traffic details</SectionLabel>
                        <div className="mt-5 space-y-1.5">
                            <DetailRow label="Monthly visitors" value={entry.monthly_visitors.toLocaleString()} />
                            <DetailRow label="Monthly pageviews" value={entry.monthly_pageviews.toLocaleString()} />
                            <DetailRow label="Engagement rate" value={`${entry.engagement_rate}%`} />
                            <DetailRow label="Bounce rate" value={`${entry.bounce_rate}%`} />
                            <DetailRow label="Avg session" value={formatDuration(entry.avg_session_duration)} />
                            <DetailRow
                                label="30-day trend"
                                value={`${entry.visitor_trend > 0 ? '+' : ''}${entry.visitor_trend}%`}
                                tone={entry.visitor_trend > 0 ? 'green' : entry.visitor_trend < 0 ? 'red' : undefined}
                            />
                        </div>
                        <div className="mt-5 space-y-1 border-t border-white/[0.04] pt-4">
                            {entry.last_refreshed && (
                                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                                    Last refresh ·{' '}
                                    <span className="text-zinc-400">
                                        {new Date(entry.last_refreshed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </p>
                            )}
                            {entry.created_at && (
                                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                                    First listed ·{' '}
                                    <span className="text-zinc-400">
                                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Share + embed */}
                <div className="mt-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-8">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <SectionLabel>Share</SectionLabel>
                            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">Show off your verified traffic</h2>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                                Drop a badge on your site or share the listing — every click sends a backlink to your verified profile.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <a
                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 py-2 text-xs font-semibold text-[#031017] shadow-[0_14px_32px_rgba(20,196,225,0.22)] transition hover:brightness-105"
                            >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                Share on X
                            </a>
                            <CopyButton text={profileUrl} label="Copy link" />
                        </div>
                    </div>

                    <button
                        onClick={() => setShowBadge(!showBadge)}
                        className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-[#14C4E1]/30 hover:text-white"
                    >
                        <Sparkles className="h-3.5 w-3.5 text-[#7AD9DA]" />
                        Embed badge
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBadge ? 'rotate-180' : ''}`} />
                    </button>

                    {showBadge && (
                        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="rounded-2xl border border-white/[0.06] bg-[#04070d]/80 p-5">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7AD9DA]">Live preview</div>
                                <div className="mt-4 flex flex-col items-center gap-3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={minimalBadgeUrl} alt="Verified on TrafficClaw" height={48} />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={rankBadgeUrl} alt={`${entry.startup_name} — TrafficClaw category rank`} height={48} />
                                </div>
                                <p className="mt-4 text-center text-[10px] text-zinc-500">
                                    Both badges refresh hourly. The rank-aware variant updates automatically as your placement changes.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <SnippetBlock label="HTML — minimal" code={htmlEmbed} />
                                <SnippetBlock label="HTML — rank-aware" code={rankHtmlEmbed} />
                                <SnippetBlock label="Markdown" code={markdownEmbed} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatTile({
    icon,
    accent,
    label,
    value,
    trend,
}: {
    icon: React.ReactNode;
    accent: 'cyan' | 'amber' | 'purple';
    label: string;
    value: string;
    trend?: number;
}) {
    const ringColor = accent === 'amber' ? 'rgba(251,191,36,0.18)' : accent === 'purple' ? 'rgba(168,85,247,0.18)' : 'rgba(20,196,225,0.18)';
    return (
        <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_50px_rgba(0,0,0,0.42)]"
            style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 50px rgba(0,0,0,0.42), 0 0 0 1px ${ringColor} inset` }}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(82,226,245,0.06),transparent_36%)]" />
            <div className="relative">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                        {icon}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</span>
                </div>
                <div className="mt-3 flex items-end gap-2">
                    <span className="text-[1.85rem] font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">{value}</span>
                    {trend !== undefined && trend !== 0 && (
                        <span
                            className={`mb-1 inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                trend > 0 ? 'border-emerald-400/22 bg-emerald-500/10 text-emerald-300' : 'border-red-400/22 bg-red-500/10 text-red-300'
                            }`}
                        >
                            {trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(trend)}%
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
    return (
        <div className="flex items-center justify-between border-b border-white/[0.04] py-2.5 last:border-b-0">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
            <span
                className={`text-sm font-semibold tabular-nums ${
                    tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-white'
                }`}
            >
                {value}
            </span>
        </div>
    );
}

function SnippetBlock({ label, code }: { label: string; code: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-[#04070d]/80 p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</span>
                <CopyButton text={code} label="Copy" />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-zinc-300 font-mono">
                {code}
            </pre>
        </div>
    );
}
