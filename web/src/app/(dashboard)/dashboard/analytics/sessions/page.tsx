'use client';

import dynamic from 'next/dynamic';
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
import { Activity, Clock3, Layers3, Users2 } from 'lucide-react';

import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import {
    AnalyticsInsightList,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    AnalyticsSubpagePanel,
    AnalyticsSubpageShell,
    formatCompactNumber,
    formatDuration,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsSubpageData } from '@/lib/useAnalyticsSubpageData';
import { useAnalyticsContext } from '../layout';

interface QualityRow {
    label: string;
    sessions: number;
    engagedSessions: number;
    engagementRate: number;
    avgDuration: number;
    bounceRate: number;
    share: number;
    qualityScore: number;
}

interface SessionsResponse {
    summary: {
        sessions: number;
        engagedSessions: number;
        activeUsers: number;
        pagesPerSession: number;
        avgSessionDuration: number;
        bounceRate: number;
        engagementRate: number;
    };
    trend: Array<{
        date: string;
        sessions: number;
        engagedSessions: number;
    }>;
    landingPatterns: QualityRow[];
    channelQuality: QualityRow[];
    deviceQuality: QualityRow[];
    referrerQuality: QualityRow[];
}

interface ChartTooltipEntry {
    dataKey: string;
    color: string;
    name: string;
    value: number;
}

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: ChartTooltipEntry[];
    label?: string | number;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[#050505]/95 px-4 py-3 shadow-2xl backdrop-blur">
            <p className="text-[11px] font-semibold text-white">{formatAxisDate(label ? String(label) : '')}</p>
            <div className="mt-2 space-y-1.5">
                {payload.map((item) => (
                    <div key={item.dataKey} className="flex items-center justify-between gap-5">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[11px] text-zinc-500">{item.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-white">{formatCompactNumber(item.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SessionsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsSubpageData<SessionsResponse>(
        '/api/analytics/sessions',
        selectedProperty,
        range,
        hasGoogleConnection,
        180_000,
    );

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Session quality" />;
    }

    if (!data) {
        return (
            <AnalyticsSubpageEmptyState
                title="Session analysis is temporarily unavailable"
                description="We couldn't load the latest session-quality view right now. Try again in a little while."
            />
        );
    }

    const strongestChannel = data.channelQuality[0];
    const strongestDevice = data.deviceQuality[0];
    const strongestLanding = data.landingPatterns[0];

    return (
        <AnalyticsSubpageShell
            eyebrow="Sessions"
            title="Sessions"
            description="Session quality, depth, and acquisition strength without fake visitor rows."
        >
            <AnalyticsSubpageMetricGrid>
                <AnalyticsSubpageMetricCard
                    label="Sessions"
                    value={formatCompactNumber(data.summary.sessions)}
                    icon={Users2}
                    tone="emerald"
                />
                <AnalyticsSubpageMetricCard
                    label="Engaged Sessions"
                    value={formatCompactNumber(data.summary.engagedSessions)}
                    icon={Activity}
                    tone="cyan"
                />
                <AnalyticsSubpageMetricCard
                    label="Pages / Session"
                    value={data.summary.pagesPerSession.toFixed(2)}
                    icon={Layers3}
                    tone="mixed"
                />
                <AnalyticsSubpageMetricCard
                    label="Avg Session Duration"
                    value={formatDuration(data.summary.avgSessionDuration)}
                    icon={Clock3}
                    tone="amber"
                />
            </AnalyticsSubpageMetricGrid>

            <AnalyticsSubpagePanel
                title="Session demand"
            >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <div className="rounded-[24px] border border-white/[0.06] bg-[#050505] p-4 sm:p-5">
                        <div className="mb-4">
                            <p className="text-[11px] font-semibold text-zinc-500">Session quality trend</p>
                            <p className="mt-1 text-sm text-zinc-400">
                                Engagement rate is {data.summary.engagementRate.toFixed(1)}% with a bounce rate of {data.summary.bounceRate.toFixed(1)}%.
                            </p>
                        </div>
                        <div className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.trend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="sessionGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#33CF96" stopOpacity={0.22} />
                                            <stop offset="100%" stopColor="#33CF96" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatAxisDate}
                                        tick={{ fontSize: 11, fill: '#71717a' }}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#71717a' }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={44}
                                    />
                                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.22)', strokeWidth: 1 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="sessions"
                                        name="Sessions"
                                        stroke="#33CF96"
                                        fill="url(#sessionGradient)"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 5, fill: '#33CF96', stroke: '#050505', strokeWidth: 2 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="engagedSessions"
                                        name="Engaged sessions"
                                        stroke="#1FBED7"
                                        fillOpacity={0}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, fill: '#1FBED7', stroke: '#050505', strokeWidth: 2 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <AnalyticsInsightList
                            items={[
                                {
                                    label: 'Best channel quality',
                                    value: strongestChannel ? strongestChannel.label : 'No data',
                                    note: strongestChannel ? `${strongestChannel.engagementRate.toFixed(1)}% engagement • score ${strongestChannel.qualityScore}` : 'No channel data yet.',
                                },
                                {
                                    label: 'Best device quality',
                                    value: strongestDevice ? strongestDevice.label : 'No data',
                                    note: strongestDevice ? `${formatDuration(strongestDevice.avgDuration)} avg duration • ${strongestDevice.bounceRate.toFixed(1)}% bounce` : 'No device data yet.',
                                },
                                {
                                    label: 'Strongest landing',
                                    value: strongestLanding ? strongestLanding.label : 'No data',
                                    note: strongestLanding ? `${formatCompactNumber(strongestLanding.sessions)} sessions • ${strongestLanding.engagementRate.toFixed(1)}% engagement` : 'No landing data yet.',
                                },
                            ]}
                        />
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            <div className="grid gap-5 xl:grid-cols-2">
                <AnalyticsSubpagePanel
                    title="Channel quality"
                    tone="emerald"
                >
                    <AnalyticsTable
                        data={data.channelQuality}
                        showSearch={false}
                        defaultSort={{ key: 'quality', dir: 'desc' }}
                        columns={[
                            {
                                key: 'label',
                                label: 'Channel',
                                sortable: true,
                                getValue: (item) => item.label,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.label}</span>,
                            },
                            {
                                key: 'sessions',
                                label: 'Sessions',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.sessions,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.sessions)}</span>,
                            },
                            {
                                key: 'engagement',
                                label: 'Engagement',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.engagementRate,
                                render: (item) => <span className="text-xs text-emerald-300">{item.engagementRate.toFixed(1)}%</span>,
                            },
                            {
                                key: 'quality',
                                label: 'Quality',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.qualityScore,
                                render: (item) => <span className="text-xs text-zinc-400">{item.qualityScore.toFixed(1)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>

                <AnalyticsSubpagePanel
                    title="Device quality"
                    tone="cyan"
                >
                    <AnalyticsTable
                        data={data.deviceQuality}
                        showSearch={false}
                        defaultSort={{ key: 'sessions', dir: 'desc' }}
                        columns={[
                            {
                                key: 'label',
                                label: 'Device',
                                sortable: true,
                                getValue: (item) => item.label,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.label}</span>,
                            },
                            {
                                key: 'sessions',
                                label: 'Sessions',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.sessions,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.sessions)}</span>,
                            },
                            {
                                key: 'duration',
                                label: 'Avg duration',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.avgDuration,
                                render: (item) => <span className="text-xs text-zinc-300">{formatDuration(item.avgDuration)}</span>,
                            },
                            {
                                key: 'bounce',
                                label: 'Bounce',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.bounceRate,
                                render: (item) => <span className="text-xs text-zinc-400">{item.bounceRate.toFixed(1)}%</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <AnalyticsSubpagePanel
                    title="Landing patterns"
                >
                    <AnalyticsTable
                        data={data.landingPatterns}
                        searchKey={(item) => item.label}
                        searchPlaceholder="Search landing pages..."
                        defaultSort={{ key: 'sessions', dir: 'desc' }}
                        columns={[
                            {
                                key: 'label',
                                label: 'Landing page',
                                sortable: true,
                                getValue: (item) => item.label,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.label}</span>,
                            },
                            {
                                key: 'sessions',
                                label: 'Sessions',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.sessions,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.sessions)}</span>,
                            },
                            {
                                key: 'engagement',
                                label: 'Engagement',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.engagementRate,
                                render: (item) => <span className="text-xs text-emerald-300">{item.engagementRate.toFixed(1)}%</span>,
                            },
                            {
                                key: 'share',
                                label: 'Share',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.share,
                                render: (item) => <span className="text-xs text-zinc-400">{item.share.toFixed(1)}%</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>

                <AnalyticsSubpagePanel
                    title="Referrer quality"
                >
                    <AnalyticsTable
                        data={data.referrerQuality}
                        searchKey={(item) => item.label}
                        searchPlaceholder="Search referrers..."
                        defaultSort={{ key: 'sessions', dir: 'desc' }}
                        columns={[
                            {
                                key: 'label',
                                label: 'Referrer',
                                sortable: true,
                                getValue: (item) => item.label,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.label}</span>,
                            },
                            {
                                key: 'sessions',
                                label: 'Sessions',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.sessions,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.sessions)}</span>,
                            },
                            {
                                key: 'duration',
                                label: 'Avg duration',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.avgDuration,
                                render: (item) => <span className="text-xs text-zinc-300">{formatDuration(item.avgDuration)}</span>,
                            },
                            {
                                key: 'quality',
                                label: 'Quality',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.qualityScore,
                                render: (item) => <span className="text-xs text-zinc-400">{item.qualityScore.toFixed(1)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>
            </div>
        </AnalyticsSubpageShell>
    );
}
