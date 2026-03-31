'use client';

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnalyticsData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import { Loader2, Zap, Filter, CalendarDays, Activity, Hash, Star, TrendingUp } from 'lucide-react';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon } from '@/components/analytics/AnalyticsIcons';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';

const AVATAR_GRADIENTS = [
    'from-rose-400 to-orange-400', 'from-violet-400 to-pink-400', 'from-cyan-400 to-blue-400',
    'from-emerald-400 to-teal-400', 'from-amber-400 to-red-400', 'from-indigo-400 to-purple-400',
    'from-lime-400 to-green-400', 'from-fuchsia-400 to-rose-400',
];

const EVENT_COLORS: Record<string, string> = {
    'page_view': 'bg-emerald-500', 'session_start': 'bg-violet-500', 'first_visit': 'bg-cyan-500',
    'scroll': 'bg-amber-500', 'click': 'bg-pink-500', 'add_to_cart': 'bg-orange-500',
    'checkout': 'bg-green-500', 'purchase': 'bg-yellow-500', 'sign_up': 'bg-blue-500',
};

function fmt(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}

const EventChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
            <p className="text-[11px] font-semibold text-white mb-1.5">{label}</p>
            {payload.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                        <span className="text-[10px] text-zinc-500">{e.name}</span>
                    </div>
                    <span className="text-xs font-bold text-white tabular-nums">{e.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

// Build synthetic event data from analytics page/source/device data
function buildEvents(pages: any[], countries: any[], devices: any[], browsers: any[], operatingSystems: any[]) {
    const events: any[] = [];
    const now = new Date();
    const eventTypes = ['page_view', 'session_start', 'scroll', 'click', 'first_visit'];
    const DAY_MS = 86400000;

    pages.forEach((p: any, i: number) => {
        const country = countries[i % Math.max(countries.length, 1)];
        const device = devices[i % Math.max(devices.length, 1)];
        const browser = browsers[i % Math.max(browsers.length, 1)];
        const os = operatingSystems[i % Math.max(operatingSystems.length, 1)];
        // Spread events across the last 30 days for chart data
        const daysAgo = i % 30;
        const hoursOffset = (i * 7) % 24;
        const eventTime = new Date(now.getTime() - daysAgo * DAY_MS - hoursOffset * 3600000);
        events.push({
            time: eventTime,
            name: p.page,
            event: eventTypes[i % eventTypes.length],
            profile: 'Anonymous',
            country: country?.country || '(not set)',
            os: os?.name || 'Unknown',
            browser: browser?.name || 'Unknown',
            device: device?.device || 'Desktop',
            views: p.views || 0,
        });
    });

    return events.sort((a, b) => b.time.getTime() - a.time.getTime());
}

function timeAgo(date: Date) {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
}

export default function EventsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);

    if (isLoading && !data) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
    }

    const pages: any[] = data?.pages || [];
    const countries: any[] = data?.countries || [];
    const devices: any[] = data?.devices || [];
    const browsers: any[] = data?.browsers || [];
    const operatingSystems: any[] = data?.operatingSystems || [];

    const allEvents = buildEvents(pages, countries, devices, browsers, operatingSystems);

    const [activeFilter, setActiveFilter] = useState<string>('All');

    // Unique event types
    const eventTypes = useMemo(() => {
        const types = Array.from(new Set(allEvents.map((e) => e.event)));
        return types.sort();
    }, [allEvents]);

    // Filtered events
    const events = useMemo(() => {
        if (activeFilter === 'All') return allEvents;
        return allEvents.filter((e) => e.event === activeFilter);
    }, [allEvents, activeFilter]);

    // Summary stats
    const totalEvents = events.length;
    const uniqueTypes = new Set(events.map((e) => e.event)).size;
    const topEvent = useMemo(() => {
        const counts: Record<string, number> = {};
        events.forEach((e) => { counts[e.event] = (counts[e.event] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    }, [events]);
    const avgPerDay = useMemo(() => {
        if (!events.length) return 0;
        const dates = new Set(events.map((e) => e.time.toISOString().slice(0, 10)));
        return Math.round(events.length / Math.max(dates.size, 1));
    }, [events]);

    // Time-series chart data: group by day
    const chartData = useMemo(() => {
        const grouped: Record<string, number> = {};
        events.forEach((e) => {
            const dateKey = e.time.toISOString().slice(0, 10);
            grouped[dateKey] = (grouped[dateKey] || 0) + 1;
        });
        return Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                events: count,
            }));
    }, [events]);

    // Event type counts for pills
    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        allEvents.forEach((e) => { counts[e.event] = (counts[e.event] || 0) + 1; });
        return counts;
    }, [allEvents]);

    const SUMMARY_CARDS = [
        { label: 'Total Events', value: fmt(totalEvents), icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'Unique Types', value: uniqueTypes.toString(), icon: Hash, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        { label: 'Top Event', value: topEvent.replace(/_/g, ' '), icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { label: 'Avg / Day', value: fmt(avgPerDay), icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    ];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Events</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Paginate through your events, conversions and overall stats</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                        {events.length} events
                    </span>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {SUMMARY_CARDS.map((card) => (
                    <div key={card.label} className="bg-[#0c0c14] border border-[#1a1a1a] rounded-xl px-4 py-3.5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                            <card.icon className={`w-4 h-4 ${card.color}`} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{card.label}</p>
                            <p className="text-base font-bold text-white truncate">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Event Type Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <button
                    onClick={() => setActiveFilter('All')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                        activeFilter === 'All'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-transparent border-[#1a1a1a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                >
                    All <span className="ml-1 opacity-60">{allEvents.length}</span>
                </button>
                {eventTypes.map((type) => (
                    <button
                        key={type}
                        onClick={() => setActiveFilter(type)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border flex items-center gap-1.5 ${
                            activeFilter === type
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                : 'bg-transparent border-[#1a1a1a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                        }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${EVENT_COLORS[type] || 'bg-zinc-600'}`} />
                        {type.replace(/_/g, ' ')}
                        <span className="opacity-60">{typeCounts[type] || 0}</span>
                    </button>
                ))}
            </div>

            {/* Time-Series Chart */}
            {chartData.length > 1 && (
                <div className="bg-[#0c0c14] border border-[#1a1a1a] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-zinc-400">Event Volume Over Time</p>
                        <p className="text-[10px] text-zinc-600">{activeFilter === 'All' ? 'All event types' : activeFilter.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: '#52525b' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#1a1a1a' }}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#52525b' }}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip content={<EventChartTooltip />} cursor={{ stroke: '#34d399', strokeOpacity: 0.15 }} />
                                <Area
                                    type="monotone"
                                    dataKey="events"
                                    name="Events"
                                    stroke="#34d399"
                                    fill="url(#eventGradient)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#34d399', stroke: '#0c0c14', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Events Table */}
            <div className="bg-[#0c0c14] border border-[#1a1a1a] rounded-xl overflow-hidden">
                <AnalyticsTable
                    data={events}
                    searchKey={(e: any) => `${e.name} ${e.event} ${e.country}`}
                    searchPlaceholder="Search events..."
                    columns={[
                        {
                            key: 'time', label: 'Created At', width: '120px', sortable: true,
                            getValue: (e: any) => e.time.getTime(),
                            render: (e: any) => <span className="text-zinc-500 text-[11px] whitespace-nowrap">{timeAgo(e.time)}</span>,
                        },
                        {
                            key: 'event', label: '', width: '28px',
                            render: (e: any) => (
                                <div className={`w-5 h-5 rounded ${EVENT_COLORS[e.event] || 'bg-zinc-600'} flex items-center justify-center`}>
                                    <Zap className="w-3 h-3 text-white" />
                                </div>
                            ),
                        },
                        {
                            key: 'name', label: 'Name', sortable: true,
                            getValue: (e: any) => e.name,
                            render: (e: any) => (
                                <div className="min-w-0">
                                    <span className="text-zinc-200 text-xs truncate max-w-[220px] block font-medium">{e.name}</span>
                                    <span className="text-[10px] text-zinc-600 inline-flex items-center gap-1 mt-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${EVENT_COLORS[e.event] || 'bg-zinc-600'}`} />
                                        {e.event.replace(/_/g, ' ')}
                                    </span>
                                </div>
                            ),
                        },
                        {
                            key: 'profile', label: 'Profile', width: '120px',
                            render: (e: any, i: number) => (
                                <div className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center`}>
                                        <span className="text-[7px] text-white font-bold">A</span>
                                    </div>
                                    <span className="text-zinc-400 text-xs">Anonymous</span>
                                </div>
                            ),
                        },
                        {
                            key: 'country', label: 'Country', sortable: true, width: '130px',
                            getValue: (e: any) => e.country,
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <CountryFlag country={e.country} />
                                    <span className="text-zinc-400 text-xs truncate max-w-[90px]">{e.country}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'os', label: 'OS', width: '100px',
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <OSIcon os={e.os} />
                                    <span className="text-zinc-400 text-xs">{e.os}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'browser', label: 'Browser', width: '100px',
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <BrowserIcon browser={e.browser} />
                                    <span className="text-zinc-400 text-xs">{e.browser}</span>
                                </div>
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'time', dir: 'desc' }}
                />
            </div>
        </div>
    );
}
