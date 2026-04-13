'use client';

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Clock3, FileText, LogIn, MousePointerSquareDashed } from 'lucide-react';

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
    formatDuration,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsSubpageData } from '@/lib/useAnalyticsSubpageData';
import { useAnalyticsContext } from '../layout';

interface PagesResponse {
    summary: {
        pageViews: number;
        sessions: number;
        users: number;
        pagesPerSession: number;
        avgSessionDuration: number;
        bounceRate: number;
    };
    trend: Array<{
        date: string;
        views: number;
        sessions: number;
        users: number;
        avgDuration: number;
        bounceRate: number;
    }>;
    topPages: Array<{
        page: string;
        title: string;
        views: number;
        users: number;
        avgDuration: number;
        bounceRate: number;
        engagementRate: number;
    }>;
    landingPages: Array<{
        page: string;
        sessions: number;
        users: number;
        bounceRate: number;
        engagementRate: number;
        share: number;
    }>;
    exitPages: Array<{
        page: string;
        exits: number;
        views: number;
        share: number;
    }>;
    exitMetricSource: string;
}

interface ChartTooltipEntry {
    dataKey: string;
    color: string;
    name: string;
    value: number | string;
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
                        <span className="text-xs font-semibold text-white">
                            {typeof item.value === 'number' ? formatCompactNumber(item.value) : item.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PagesPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsSubpageData<PagesResponse>(
        '/api/analytics/pages',
        selectedProperty,
        range,
        hasGoogleConnection,
        180_000,
    );

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Page performance" />;
    }

    if (!data) {
        return (
            <AnalyticsSubpageEmptyState
                title="Page analysis is temporarily unavailable"
                description="We couldn't load the latest page-level analytics just now. Try again in a moment."
            />
        );
    }

    const strongestPage = data.topPages[0];
    const strongestLanding = data.landingPages[0];
    const strongestExit = data.exitPages[0];

    return (
        <AnalyticsSubpageShell
            eyebrow="Pages"
            title="Pages"
            description="Landing pages, top destinations, and exits in one view."
            actions={
                <AnalyticsSubpageBadge
                    label={data.exitMetricSource === 'exits' ? 'Exit metric from GA4' : 'Last-touch proxy from page views'}
                    tone={data.exitMetricSource === 'exits' ? 'emerald' : 'amber'}
                />
            }
        >
            <AnalyticsSubpageMetricGrid>
                <AnalyticsSubpageMetricCard
                    label="Page Views"
                    value={formatCompactNumber(data.summary.pageViews)}
                    icon={FileText}
                    tone="emerald"
                />
                <AnalyticsSubpageMetricCard
                    label="Sessions"
                    value={formatCompactNumber(data.summary.sessions)}
                    icon={MousePointerSquareDashed}
                    tone="cyan"
                />
                <AnalyticsSubpageMetricCard
                    label="Pages / Session"
                    value={data.summary.pagesPerSession.toFixed(2)}
                    icon={LogIn}
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
                title="Traffic"
            >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <div className="rounded-[24px] border border-white/[0.06] bg-[#050505] p-4 sm:p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold text-zinc-500">Page demand</p>
                                    <p className="mt-1 text-sm text-zinc-400">Views and sessions over time.</p>
                                </div>
                                <AnalyticsSubpageBadge label={`Bounce ${data.summary.bounceRate.toFixed(1)}%`} tone="mixed" />
                            </div>
                        <div className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.trend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="pagesViewsGradient" x1="0" y1="0" x2="0" y2="1">
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
                                        dataKey="views"
                                        name="Page views"
                                        stroke="#33CF96"
                                        fill="url(#pagesViewsGradient)"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 5, fill: '#33CF96', stroke: '#050505', strokeWidth: 2 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="sessions"
                                        name="Sessions"
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
                                    label: 'Strongest page',
                                    value: strongestPage ? strongestPage.page : 'No data',
                                    note: strongestPage ? `${formatCompactNumber(strongestPage.views)} views • ${strongestPage.engagementRate.toFixed(1)}% engagement` : 'No page data yet.',
                                },
                                {
                                    label: 'Top landing page',
                                    value: strongestLanding ? strongestLanding.page : 'No data',
                                    note: strongestLanding ? `${formatCompactNumber(strongestLanding.sessions)} landing sessions • ${strongestLanding.share.toFixed(1)}% share` : 'No landing page data yet.',
                                },
                                {
                                    label: data.exitMetricSource === 'exits' ? 'Top exit page' : 'Top last-touch page',
                                    value: strongestExit ? strongestExit.page : 'No data',
                                    note: strongestExit ? `${formatCompactNumber(strongestExit.exits)} ${data.exitMetricSource === 'exits' ? 'exits' : 'views'} • ${strongestExit.share.toFixed(1)}% share` : 'No exit data yet.',
                                },
                            ]}
                        />
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            <div className="grid gap-5 xl:grid-cols-2">
                        <AnalyticsSubpagePanel
                            title="Landing pages"
                            tone="emerald"
                        >
                    <AnalyticsTable
                        data={data.landingPages}
                        showSearch={false}
                        defaultSort={{ key: 'sessions', dir: 'desc' }}
                        columns={[
                            {
                                key: 'page',
                                label: 'Landing page',
                                sortable: true,
                                getValue: (item) => item.page,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.page}</span>,
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
                            title={data.exitMetricSource === 'exits' ? 'Exit pages' : 'Last-touch pages'}
                            tone="amber"
                        >
                    <AnalyticsTable
                        data={data.exitPages}
                        showSearch={false}
                        defaultSort={{ key: 'exits', dir: 'desc' }}
                        columns={[
                            {
                                key: 'page',
                                label: 'Page',
                                sortable: true,
                                getValue: (item) => item.page,
                                render: (item) => <span className="text-xs font-medium text-zinc-200">{item.page}</span>,
                            },
                            {
                                key: 'exits',
                                label: data.exitMetricSource === 'exits' ? 'Exits' : 'Views',
                                align: 'right',
                                sortable: true,
                                getValue: (item) => item.exits,
                                render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.exits)}</span>,
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
            </div>

            <AnalyticsSubpagePanel
                title="Top pages"
            >
                <AnalyticsTable
                    data={data.topPages}
                    searchKey={(item) => `${item.page} ${item.title}`}
                    searchPlaceholder="Search pages..."
                    defaultSort={{ key: 'views', dir: 'desc' }}
                    columns={[
                        {
                            key: 'page',
                            label: 'Page',
                            sortable: true,
                            getValue: (item) => item.page,
                            render: (item) => (
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-white">{item.page}</p>
                                    <p className="truncate text-[11px] text-zinc-500">{item.title || item.page}</p>
                                </div>
                            ),
                        },
                        {
                            key: 'views',
                            label: 'Views',
                            align: 'right',
                            sortable: true,
                            getValue: (item) => item.views,
                            render: (item) => <span className="text-xs font-semibold text-white">{formatCompactNumber(item.views)}</span>,
                        },
                        {
                            key: 'users',
                            label: 'Users',
                            align: 'right',
                            sortable: true,
                            getValue: (item) => item.users,
                            render: (item) => <span className="text-xs text-zinc-300">{formatCompactNumber(item.users)}</span>,
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
                            key: 'duration',
                            label: 'Avg duration',
                            align: 'right',
                            sortable: true,
                            getValue: (item) => item.avgDuration,
                            render: (item) => <span className="text-xs text-zinc-400">{formatDuration(item.avgDuration)}</span>,
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
        </AnalyticsSubpageShell>
    );
}
