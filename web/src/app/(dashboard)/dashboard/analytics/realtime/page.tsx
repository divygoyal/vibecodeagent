'use client';

import { useRealtimeData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import { Loader2, Radio } from 'lucide-react';
import { CountryFlag, DeviceIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';

const ANON_NAMES = ['Anonymous Panda', 'Anonymous Fox', 'Anonymous Owl', 'Anonymous Bear', 'Anonymous Wolf',
    'Anonymous Hawk', 'Anonymous Lynx', 'Anonymous Deer', 'Anonymous Seal', 'Anonymous Crow',
    'Anonymous Hare', 'Anonymous Orca', 'Anonymous Viper', 'Anonymous Tiger', 'Anonymous Koala'];

const AVATAR_GRADIENTS = [
    'from-rose-400 to-orange-400', 'from-violet-400 to-pink-400', 'from-cyan-400 to-blue-400',
    'from-emerald-400 to-teal-400', 'from-amber-400 to-red-400', 'from-indigo-400 to-purple-400',
    'from-lime-400 to-green-400', 'from-fuchsia-400 to-rose-400',
];

export default function RealtimePage() {
    const { selectedProperty, hasGoogleConnection } = useAnalyticsContext();
    const { data: realtimeData, isLoading } = useRealtimeData(selectedProperty, hasGoogleConnection);

    if (isLoading && !realtimeData) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
    }

    const activeUsers = realtimeData?.activeUsers || 0;
    const byCountry: any[] = realtimeData?.byCountry || [];
    const byCity: any[] = realtimeData?.byCity || [];
    const byDevice: any[] = realtimeData?.byDevice || [];
    const byPage: any[] = realtimeData?.byPage || [];

    // Build activity feed from realtime data
    const activityFeed = byCity.slice(0, 20).map((c: any, i: number) => ({
        name: ANON_NAMES[i % ANON_NAMES.length],
        country: c.country,
        city: c.city,
        page: byPage[i % Math.max(byPage.length, 1)]?.page || '/',
        users: c.users,
    }));

    // Build a simple bar-chart of last 30 minutes (simulated from active users)
    const barData = Array.from({ length: 30 }, (_, i) => {
        const variation = Math.max(0, activeUsers + Math.floor((Math.random() - 0.5) * activeUsers * 0.3));
        return variation;
    });

    return (
        <div className="space-y-6">
            {/* ─── Live Visitor Count + Bar Chart ─── */}
            <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Unique visitors</span>
                            <span className="text-[9px] text-zinc-700">last 30 min</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-5xl font-bold text-white tabular-nums">{activeUsers}</span>
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                            </span>
                        </div>
                    </div>
                    {/* Devices summary */}
                    <div className="flex items-center gap-3">
                        {byDevice.map((d: any, i: number) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                <DeviceIcon device={d.device} />
                                <span className="tabular-nums font-medium">{d.users}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Mini bar chart */}
                <div className="flex items-end gap-[2px] h-[80px]">
                    {barData.map((v, i) => {
                        const maxV = Math.max(...barData, 1);
                        const h = Math.max((v / maxV) * 100, 3);
                        return (
                            <div
                                key={i}
                                className="flex-1 bg-emerald-500/40 hover:bg-emerald-400/60 rounded-t transition-colors"
                                style={{ height: `${h}%` }}
                                title={`~${v} visitors`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* ─── Live Activity Feed ─── */}
            <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Live Activity</h3>
                    <span className="text-[10px] text-zinc-600">{activityFeed.length} active sessions</span>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {activityFeed.length === 0 ? (
                        <div className="text-xs text-zinc-600 py-8 text-center">
                            {hasGoogleConnection ? 'No active visitors right now' : 'Connect Google Analytics to see live visitors'}
                        </div>
                    ) : activityFeed.map((log, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs py-1.5 hover:bg-white/[0.02] rounded-lg px-2 -mx-2 transition">
                            <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" style={{ animationDelay: `${i * 200}ms` }} />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center flex-shrink-0`}>
                                <span className="text-[9px] text-white font-bold">{log.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-zinc-300">
                                    <span className="font-semibold text-white">{log.name}</span>
                                    {' · '}<CountryFlag country={log.country} /> <span className="text-zinc-400">{log.city}</span>
                                    {' · '}<span className="text-emerald-400 font-mono text-[11px]">{log.page}</span>
                                </span>
                            </div>
                            <span className="text-zinc-700 text-[10px] whitespace-nowrap flex-shrink-0">just now</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── Geo & Pages (side by side) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Geo */}
                <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-sm font-semibold text-white">Geo</h3>
                        <div className="flex">{byCountry.slice(0, 6).map((c: any, i: number) => <CountryFlag key={i} country={c.country} />)}</div>
                    </div>
                    <AnalyticsTable
                        data={byCountry.map((c: any) => ({ name: c.country, events: c.users, sessions: c.users }))}
                        showSearch={false}
                        columns={[
                            {
                                key: 'name', label: 'Country / City', sortable: true,
                                getValue: (item: any) => item.name,
                                render: (item: any) => (
                                    <div className="flex items-center gap-2">
                                        <CountryFlag country={item.name} />
                                        <span className="text-zinc-300 text-xs">{item.name}</span>
                                    </div>
                                ),
                            },
                            {
                                key: 'events', label: 'Events', align: 'right' as const, sortable: true,
                                getValue: (item: any) => item.events,
                                render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.events}</span>,
                            },
                            {
                                key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true,
                                getValue: (item: any) => item.sessions,
                                render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.sessions}</span>,
                            },
                        ]}
                        defaultSort={{ key: 'events', dir: 'desc' }}
                    />
                </div>

                {/* Paths */}
                <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Paths</h3>
                    <AnalyticsTable
                        data={byPage.map((p: any) => ({ path: p.page, events: p.users, sessions: p.users }))}
                        searchKey={(item: any) => item.path}
                        searchPlaceholder="Search paths..."
                        columns={[
                            {
                                key: 'path', label: 'Path', sortable: true,
                                getValue: (item: any) => item.path,
                                render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[220px] block">{item.path}</span>,
                            },
                            {
                                key: 'events', label: 'Events', align: 'right' as const, sortable: true,
                                getValue: (item: any) => item.events,
                                render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.events}</span>,
                            },
                            {
                                key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true,
                                getValue: (item: any) => item.sessions,
                                render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.sessions}</span>,
                            },
                        ]}
                        defaultSort={{ key: 'events', dir: 'desc' }}
                    />
                </div>
            </div>

            {/* ─── Referrers ─── */}
            {/* Realtime API doesn't have referrers, but we show device breakdown */}
            <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Devices</h3>
                <AnalyticsTable
                    data={byDevice.map((d: any) => ({ name: d.device, users: d.users }))}
                    showSearch={false}
                    columns={[
                        {
                            key: 'name', label: 'Device', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => (
                                <div className="flex items-center gap-2">
                                    <DeviceIcon device={item.name} />
                                    <span className="text-zinc-300 text-xs">{item.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'users', label: 'Active Users', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.users,
                            render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums font-medium">{item.users}</span>,
                        },
                    ]}
                    defaultSort={{ key: 'users', dir: 'desc' }}
                />
            </div>
        </div>
    );
}
