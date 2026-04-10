'use client';

import type { ReactNode } from 'react';
import useSWR from 'swr';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import {
    Activity,
    ArrowUpRight,
    Clock3,
    Eye,
    Globe2,
    MousePointerClick,
    ShieldCheck,
    TrendingUp,
    Users,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { ShareUmamiDashboardData, ShareUmamiRealtimeData } from '@/lib/shareUmamiData';

const RANGE_OPTIONS = ['7d', '30d', '90d'] as const;

function formatNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        notation: value >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1000 ? 1 : 0,
    }).format(value);
}

function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (minutes <= 0) {
        return `${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}

function formatDelta(value: number | null) {
    if (value === null || Number.isNaN(value)) {
        return 'No comparison';
    }

    const sign = value > 0 ? '+' : '';
    return `${sign}${value}% vs previous`;
}

async function fetcher<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load shared analytics');
    }
    return response.json() as Promise<T>;
}

function StatCard({
    label,
    value,
    delta,
    icon,
}: {
    label: string;
    value: string;
    delta: string;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-500">{label}</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600">{icon}</span>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">{delta}</div>
        </div>
    );
}

function BreakdownCard({
    title,
    items,
}: {
    title: string;
    items: Array<{ label: string; value: number }>;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <span className="text-xs text-slate-400">{items.length} rows</span>
            </div>
            <div className="mt-4 space-y-3">
                {items.length ? items.map((item) => (
                    <div key={`${title}-${item.label}`} className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-slate-600">{item.label}</span>
                        <span className="shrink-0 text-sm font-medium text-slate-900">{formatNumber(item.value)}</span>
                    </div>
                )) : (
                    <p className="text-sm text-slate-400">No data available for this range.</p>
                )}
            </div>
        </div>
    );
}

function SharedUmamiPage({
    token,
    siteUrl,
    views,
}: {
    token: string;
    siteUrl: string;
    views: number;
}) {
    const [range, setRange] = useQueryState(
        'range',
        parseAsStringEnum([...RANGE_OPTIONS]).withDefault('30d').withOptions({ history: 'push' }),
    );

    const dashboardUrl = `/api/share/${token}/umami/dashboard?range=${range}`;
    const realtimeUrl = `/api/share/${token}/umami/realtime`;

    const {
        data,
        error,
        isLoading,
    } = useSWR<ShareUmamiDashboardData>(dashboardUrl, fetcher, {
        revalidateOnFocus: false,
    });

    const { data: liveData } = useSWR<ShareUmamiRealtimeData>(realtimeUrl, fetcher, {
        refreshInterval: 20_000,
        revalidateOnFocus: false,
        fallbackData: data?.realtime,
    });

    const realtime = liveData || data?.realtime;
    const siteLabel = siteUrl || 'Shared Property';

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#f3f4f6_100%)] text-slate-900">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                TrafficClaw Shared Analytics
                            </div>
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Umami Share Fork Preview</h1>
                                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                                    The public URL stays on TrafficClaw while this page blends TrafficClaw history with Umami-style reporting for the post-cutover window.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                                    <Globe2 className="h-4 w-4 text-slate-400" />
                                    {siteLabel}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                                    <Eye className="h-4 w-4 text-slate-400" />
                                    {views} share views
                                </span>
                                {data?.source.label && (
                                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                                        <ArrowUpRight className="h-4 w-4" />
                                        {data.source.label}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1">
                                {RANGE_OPTIONS.map((option) => (
                                    <button
                                        key={option}
                                        onClick={() => setRange(option)}
                                        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                                            range === option
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {option.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            {data?.source.message && (
                                <p className="max-w-sm text-xs leading-5 text-slate-500">
                                    {data.source.message}
                                </p>
                            )}
                        </div>
                    </div>
                </header>

                {error && (
                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error.message}
                    </div>
                )}

                {isLoading && !data && (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
                        Loading shared analytics...
                    </div>
                )}

                {data && (
                    <>
                        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                            <StatCard
                                label="Pageviews"
                                value={formatNumber(data.summary.pageviews.value)}
                                delta={formatDelta(data.summary.pageviews.change)}
                                icon={<TrendingUp className="h-4 w-4" />}
                            />
                            <StatCard
                                label="Visitors"
                                value={formatNumber(data.summary.visitors.value)}
                                delta={formatDelta(data.summary.visitors.change)}
                                icon={<Users className="h-4 w-4" />}
                            />
                            <StatCard
                                label="Visits"
                                value={formatNumber(data.summary.visits.value)}
                                delta={formatDelta(data.summary.visits.change)}
                                icon={<MousePointerClick className="h-4 w-4" />}
                            />
                            <StatCard
                                label="Bounce Rate"
                                value={`${data.summary.bounceRate.value}%`}
                                delta={formatDelta(data.summary.bounceRate.change)}
                                icon={<Activity className="h-4 w-4" />}
                            />
                            <StatCard
                                label="Visit Duration"
                                value={formatDuration(data.summary.visitDuration.value)}
                                delta={formatDelta(data.summary.visitDuration.change)}
                                icon={<Clock3 className="h-4 w-4" />}
                            />
                        </section>

                        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_60px_rgba(15,23,42,0.06)]">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-950">Traffic Trend</h2>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Daily pageviews and visits across the selected shared range.
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                                        {range.toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-6 h-[320px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.series}>
                                            <defs>
                                                <linearGradient id="trafficclaw-pageviews" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="trafficclaw-visits" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke="#e2e8f0" vertical={false} />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: 16,
                                                    border: '1px solid #e2e8f0',
                                                    background: '#ffffff',
                                                    boxShadow: '0 16px 50px rgba(15,23,42,0.08)',
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="pageviews"
                                                stroke="#10b981"
                                                fill="url(#trafficclaw-pageviews)"
                                                strokeWidth={2.5}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="visits"
                                                stroke="#0f172a"
                                                fill="url(#trafficclaw-visits)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_60px_rgba(15,23,42,0.06)]">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-950">Realtime Pulse</h2>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Refreshed every 20 seconds using the active source.
                                        </p>
                                    </div>
                                    {realtime && (
                                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                            {realtime.activeVisitors} live
                                        </span>
                                    )}
                                </div>
                                <div className="mt-5 grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Active</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                                            {realtime ? formatNumber(realtime.activeVisitors) : '0'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Views</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                                            {realtime ? formatNumber(realtime.totalViews) : '0'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Visitors</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                                            {realtime ? formatNumber(realtime.totalVisitors) : '0'}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-5 h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={realtime?.series || []}>
                                            <CartesianGrid stroke="#e2e8f0" vertical={false} />
                                            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: 16,
                                                    border: '1px solid #e2e8f0',
                                                    background: '#ffffff',
                                                    boxShadow: '0 16px 50px rgba(15,23,42,0.08)',
                                                }}
                                            />
                                            <Bar dataKey="views" radius={[10, 10, 0, 0]} fill="#10b981" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>

                        <section className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                            <BreakdownCard title="Top Pages" items={data.breakdowns.pages} />
                            <BreakdownCard title="Referrers" items={data.breakdowns.referrers} />
                            <BreakdownCard title="Devices" items={data.breakdowns.devices} />
                            <BreakdownCard title="Countries" items={data.breakdowns.countries} />
                        </section>

                        {realtime && (
                            <section className="mt-6 grid gap-4 lg:grid-cols-3">
                                <BreakdownCard title="Live Pages" items={realtime.pages} />
                                <BreakdownCard title="Live Referrers" items={realtime.referrers} />
                                <BreakdownCard title="Live Countries" items={realtime.countries} />
                            </section>
                        )}

                        <footer className="mt-10 flex flex-col gap-3 border-t border-slate-200 px-1 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                Shared via TrafficClaw using a TrafficClaw-branded Umami bridge.
                            </div>
                            <div className="flex items-center gap-3">
                                <span>Token: {token.slice(0, 12)}...</span>
                                {data.source.cutoverAt && (
                                    <span>Cutover: {new Date(data.source.cutoverAt).toLocaleDateString('en-US')}</span>
                                )}
                            </div>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SharedUmamiClient(props: {
    token: string;
    siteUrl: string;
    views: number;
}) {
    return (
        <NuqsAdapter>
            <SharedUmamiPage {...props} />
        </NuqsAdapter>
    );
}
