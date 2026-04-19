'use client';

import dynamic from 'next/dynamic';
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Legend = dynamic(() => import('recharts').then(m => ({ default: m.Legend })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
import { Activity, DatabaseZap, Sparkles, Zap } from 'lucide-react';

import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import {
    AnalyticsInsightList,
    AnalyticsSubpageBadge,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    AnalyticsSubpagePanel,
    AnalyticsSubpageShell,
    formatCompactNumber,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsSubpageData } from '@/lib/useAnalyticsSubpageData';
import { useAnalyticsContext } from '../layout';

interface EventsResponse {
    summary: {
        eventCount: number;
        activeUsers: number;
        trackedTypes: number;
        keyEvents: string[];
        focusEvent: string;
    };
    topEvents: Array<{
        name: string;
        eventCount: number;
        users: number;
        isKeyEvent: boolean;
    }>;
    trend: Array<Record<string, string | number>>;
    trendKeys: string[];
    focusEvent: string;
    pageBreakdown: Array<{
        page: string;
        eventCount: number;
        users: number;
    }>;
    sourceBreakdown: Array<{
        source: string;
        eventCount: number;
    }>;
    deviceBreakdown: Array<{
        device: string;
        eventCount: number;
    }>;
}

interface ChartTooltipEntry {
    dataKey: string;
    color: string;
    name: string;
    value: number;
}

const trendPalette = ['#33CF96', '#1FBED7', '#F7B955', '#A78BFA'];

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function EventTooltip({
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
                            <span className="text-[11px] text-zinc-500">{String(item.name).replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-xs font-semibold text-white">{formatCompactNumber(item.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function EventsPage() {
    const { selectedProperty, range, hasGoogleConnection, isDemoWorkspace } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsSubpageData<EventsResponse>(
        '/api/analytics/events',
        selectedProperty,
        range,
        hasGoogleConnection,
        180_000,
        isDemoWorkspace,
    );

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Event analysis" />;
    }

    if (!data) {
        return (
            <AnalyticsSubpageEmptyState
                title="Event analysis is temporarily unavailable"
                description="We couldn't load the latest event breakdown just now. Try again in a moment."
            />
        );
    }

    const topEvent = data.topEvents[0];

    return (
        <AnalyticsSubpageShell
            eyebrow="Events"
            title="Events"
            description="Real GA4 event demand, key-event emphasis, and breakdowns."
            actions={
                <AnalyticsSubpageBadge
                    label={`Focus event: ${data.focusEvent.replace(/_/g, ' ')}`}
                    tone="emerald"
                    icon={Zap}
                />
            }
        >
            <AnalyticsSubpageMetricGrid>
                <AnalyticsSubpageMetricCard
                    label="Event Count"
                    value={formatCompactNumber(data.summary.eventCount)}
                    icon={Activity}
                    tone="emerald"
                />
                <AnalyticsSubpageMetricCard
                    label="Tracked Users"
                    value={formatCompactNumber(data.summary.activeUsers)}
                    icon={Sparkles}
                    tone="cyan"
                />
                <AnalyticsSubpageMetricCard
                    label="Event Types"
                    value={formatCompactNumber(data.summary.trackedTypes)}
                    icon={DatabaseZap}
                    tone="mixed"
                />
                <AnalyticsSubpageMetricCard
                    label="Key Events"
                    value={formatCompactNumber(data.summary.keyEvents.length)}
                    icon={Zap}
                    tone="amber"
                />
            </AnalyticsSubpageMetricGrid>

            <AnalyticsSubpagePanel
                title="Event demand"
            >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <div className="rounded-[24px] border border-white/[0.06] bg-[#050505] p-4 sm:p-5">
                        <div className="mb-4">
                            <p className="text-[11px] font-semibold text-zinc-500">Event trend</p>
                            <p className="mt-1 text-sm text-zinc-400">Top event names for the current range.</p>
                        </div>
                        <div className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.trend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="eventsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#33CF96" stopOpacity={0.18} />
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
                                    <Tooltip content={<EventTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.22)', strokeWidth: 1 }} />
                                    <Legend
                                        verticalAlign="top"
                                        height={32}
                                        formatter={(value) => <span className="text-[11px] text-zinc-400">{String(value).replace(/_/g, ' ')}</span>}
                                    />
                                    {data.trendKeys.map((eventName, index) => (
                                        <Area
                                            key={eventName}
                                            type="monotone"
                                            dataKey={eventName}
                                            name={eventName}
                                            stroke={trendPalette[index % trendPalette.length]}
                                            fill={index === 0 ? 'url(#eventsAreaGradient)' : 'none'}
                                            fillOpacity={index === 0 ? 1 : 0}
                                            strokeWidth={index === 0 ? 2.4 : 2}
                                            dot={false}
                                            activeDot={{ r: 4, fill: trendPalette[index % trendPalette.length], stroke: '#050505', strokeWidth: 2 }}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <AnalyticsInsightList
                            items={[
                                {
                                    label: 'Top event',
                                    value: topEvent ? topEvent.name.replace(/_/g, ' ') : 'No data',
                                    note: topEvent ? `${formatCompactNumber(topEvent.eventCount)} events • ${formatCompactNumber(topEvent.users)} users` : 'No event data yet.',
                                },
                                {
                                    label: 'Focus page count',
                                    value: formatCompactNumber(data.pageBreakdown.length),
                                    note: `Pages where ${data.focusEvent.replace(/_/g, ' ')} appears most often.`,
                                },
                                {
                                    label: 'Key-event coverage',
                                    value: data.summary.keyEvents.length > 0 ? data.summary.keyEvents.map((event) => event.replace(/_/g, ' ')).join(', ') : 'No key events found',
                                    note: 'We highlight conversion-leaning event names when they exist.',
                                },
                            ]}
                        />
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            <div className="grid gap-5 xl:grid-cols-2">
                <AnalyticsSubpagePanel
                    title="Top events"
                    tone="emerald"
                >
                    <AnalyticsTable
                        data={data.topEvents}
                        searchKey={(item) => item.name}
                        searchPlaceholder="Search events..."
                        defaultSort={{ key: 'eventCount', dir: 'desc' }}
                        columns={[
                            {
                                key: 'name',
                                label: 'Event',
                                sortable: true,
                                getValue: (item) => item.name,
                                render: (item) => (
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2.5 w-2.5 rounded-full ${item.isKeyEvent ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                        <div>
                                            <p className="text-xs font-medium text-zinc-200">{item.name.replace(/_/g, ' ')}</p>
                                            <p className="text-[11px] text-zinc-500">{item.isKeyEvent ? 'Key event candidate' : 'Supporting event'}</p>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                key: 'eventCount',
                                label: 'Count',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.eventCount,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.eventCount)}</span>,
                            },
                            {
                                key: 'users',
                                label: 'Users',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.users,
                                render: (item) => <span className="text-xs text-zinc-400">{formatCompactNumber(item.users)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>

                <AnalyticsSubpagePanel
                    title="Page breakdown"
                    tone="cyan"
                >
                    <AnalyticsTable
                        data={data.pageBreakdown}
                        searchKey={(item) => item.page}
                        searchPlaceholder="Search pages..."
                        defaultSort={{ key: 'eventCount', dir: 'desc' }}
                        columns={[
                            {
                                key: 'page',
                                label: 'Page',
                                sortable: true,
                                getValue: (item) => item.page,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.page}</span>,
                            },
                            {
                                key: 'eventCount',
                                label: 'Events',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.eventCount,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.eventCount)}</span>,
                            },
                            {
                                key: 'users',
                                label: 'Users',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.users,
                                render: (item) => <span className="text-xs text-zinc-400">{formatCompactNumber(item.users)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <AnalyticsSubpagePanel
                    title="Source breakdown"
                >
                    <AnalyticsTable
                        data={data.sourceBreakdown}
                        showSearch={false}
                        defaultSort={{ key: 'eventCount', dir: 'desc' }}
                        columns={[
                            {
                                key: 'source',
                                label: 'Source',
                                sortable: true,
                                getValue: (item) => item.source,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.source}</span>,
                            },
                            {
                                key: 'eventCount',
                                label: 'Events',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.eventCount,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.eventCount)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>

                <AnalyticsSubpagePanel
                    title="Device breakdown"
                >
                    <AnalyticsTable
                        data={data.deviceBreakdown}
                        showSearch={false}
                        defaultSort={{ key: 'eventCount', dir: 'desc' }}
                        columns={[
                            {
                                key: 'device',
                                label: 'Device',
                                sortable: true,
                                getValue: (item) => item.device,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.device}</span>,
                            },
                            {
                                key: 'eventCount',
                                label: 'Events',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.eventCount,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.eventCount)}</span>,
                            },
                        ]}
                    />
                </AnalyticsSubpagePanel>
            </div>
        </AnalyticsSubpageShell>
    );
}
