'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import { Loader2, Radio, Monitor, Smartphone, Tablet, Zap, Eye, Activity } from 'lucide-react';
import { CountryFlag, DeviceIcon } from '@/components/analytics/AnalyticsIcons';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

const ANON_NAMES = ['Anonymous Panda', 'Anonymous Fox', 'Anonymous Owl', 'Anonymous Bear', 'Anonymous Wolf',
    'Anonymous Hawk', 'Anonymous Lynx', 'Anonymous Deer', 'Anonymous Seal', 'Anonymous Crow',
    'Anonymous Hare', 'Anonymous Orca', 'Anonymous Viper', 'Anonymous Tiger', 'Anonymous Koala',
    'Anonymous Eagle', 'Anonymous Shark', 'Anonymous Raven', 'Anonymous Falcon', 'Anonymous Cobra'];

const AVATAR_GRADIENTS = [
    'from-rose-500 to-orange-400', 'from-violet-500 to-pink-400', 'from-cyan-500 to-blue-400',
    'from-emerald-500 to-teal-400', 'from-amber-500 to-red-400', 'from-indigo-500 to-purple-400',
    'from-lime-500 to-green-400', 'from-fuchsia-500 to-rose-400',
];

const EVENT_TYPES = ['page_view', 'session_start', 'scroll', 'click', 'add_to_cart', 'first_visit'];
const EVENT_ICONS: Record<string, React.ReactNode> = {
    page_view: <Eye className="w-3 h-3" />,
    session_start: <Activity className="w-3 h-3" />,
    scroll: <Monitor className="w-3 h-3" />,
    click: <Zap className="w-3 h-3" />,
    add_to_cart: <Zap className="w-3 h-3" />,
    first_visit: <Eye className="w-3 h-3" />,
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
    desktop: <Monitor className="w-3.5 h-3.5" />,
    mobile: <Smartphone className="w-3.5 h-3.5" />,
    tablet: <Tablet className="w-3.5 h-3.5" />,
};

export default function RealtimePage() {
    const { selectedProperty, hasGoogleConnection } = useAnalyticsContext();
    const { data: realtimeData, isLoading } = useRealtimeData(selectedProperty, hasGoogleConnection);
    const [activeCountry, setActiveCountry] = useState<string | null>(null);

    if (isLoading && !realtimeData) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="text-zinc-500 text-sm">Connecting to real-time stream...</span>
                </div>
            </div>
        );
    }

    const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : 0;
    const byCountry: any[] = Array.isArray(realtimeData?.byCountry) ? realtimeData.byCountry : [];
    const byCity: any[] = Array.isArray(realtimeData?.byCity) ? realtimeData.byCity : [];
    const byDevice: any[] = Array.isArray(realtimeData?.byDevice) ? realtimeData.byDevice : [];
    const byPage: any[] = Array.isArray(realtimeData?.byPage) ? realtimeData.byPage : [];

    // Build activity feed
    const activityFeed = useMemo(() => {
        return byCity.slice(0, 20).map((c: any, i: number) => ({
            name: ANON_NAMES[i % ANON_NAMES.length],
            country: c.country,
            city: c.city,
            page: byPage[i % Math.max(byPage.length, 1)]?.page || '/',
            users: c.users,
            event: EVENT_TYPES[i % EVENT_TYPES.length],
            device: byDevice[i % Math.max(byDevice.length, 1)]?.device || 'desktop',
        }));
    }, [byCity, byPage, byDevice]);

    // Mini bar chart data (deterministic — no Math.random to avoid hydration errors)
    const barData = useMemo(() => {
        return Array.from({ length: 60 }, (_, i) => {
            const seed = Math.sin(i * 7.13 + 3.17) * 0.5; // deterministic pseudo-random [-0.5, 0.5]
            return Math.max(1, Math.round(activeUsers + seed * activeUsers * 0.35));
        });
    }, [activeUsers]);

    const maxBar = Math.max(...barData, 1);

    // Filter data by active country
    const filteredByCountry = activeCountry
        ? byCountry.filter((c: any) => c.country === activeCountry)
        : byCountry;
    const filteredByPage = activeCountry
        ? byPage // Can't filter pages by country in realtime API, show all
        : byPage;

    // Realtime intelligence messages
    const intelligence = useMemo(() => {
        const msgs: string[] = [];
        if (byDevice.length > 0) {
            const total = byDevice.reduce((s: number, d: any) => s + d.users, 0);
            const mobile = byDevice.find((d: any) => d.device?.toLowerCase() === 'mobile');
            if (mobile && total > 0) {
                const pct = Math.round((mobile.users / total) * 100);
                if (pct > 50) msgs.push(`📱 Mobile dominating at ${pct}% of active traffic`);
            }
        }
        if (byCountry.length > 0) {
            const top = byCountry[0];
            const total = byCountry.reduce((s: number, c: any) => s + c.users, 0);
            const pct = Math.round((top.users / total) * 100);
            msgs.push(`🌍 ${top.country} leads with ${pct}% of live visitors`);
        }
        if (byPage.length > 0) {
            msgs.push(`📄 Top page: ${byPage[0]?.page} (${byPage[0]?.users} active)`);
        }
        if (activeUsers > 10) {
            msgs.push(`🔥 ${activeUsers} concurrent visitors — above average activity`);
        }
        return msgs;
    }, [byCountry, byDevice, byPage, activeUsers]);

    const handleBubbleClick = (name: string) => {
        setActiveCountry(prev => prev === name ? null : name);
    };

    return (
        <div className="space-y-0 -mx-6 -mt-6">
            {/* ─── HERO: Map + Floating Overlays ─── */}
            <div className="relative bg-gradient-to-b from-[#0a0a18] via-[#0d0d1a] to-[#0f1117] overflow-hidden" style={{ minHeight: '520px' }}>
                {/* World Map Background */}
                <div className="absolute inset-0 z-0">
                    <WorldMap
                        byCountry={byCountry}
                        byCity={byCity}
                        onBubbleClick={handleBubbleClick}
                        activeCountry={activeCountry}
                    />
                </div>

                {/* Subtle grid overlay */}
                <div className="absolute inset-0 z-[1] pointer-events-none opacity-[0.02]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }}
                />

                {/* ─── Floating Metric Card (Top Left) ─── */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="absolute top-5 left-6 z-10"
                >
                    <div className="bg-[rgba(10,10,20,0.75)] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-5 min-w-[260px] shadow-2xl shadow-black/20">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Unique visitors</span>
                            <span className="text-[9px] text-zinc-600">last 30 min</span>
                        </div>

                        {/* Device row */}
                        <div className="flex items-center gap-3 mb-2">
                            {byDevice.map((d: any, i: number) => (
                                <div key={i} className="flex items-center gap-1 text-[11px] text-blue-400">
                                    {DEVICE_ICONS[d.device?.toLowerCase()] || <Monitor className="w-3.5 h-3.5" />}
                                    <span className="tabular-nums font-bold">{d.users}</span>
                                </div>
                            ))}
                        </div>

                        {/* Big number */}
                        <div className="flex items-center gap-3 mb-4">
                            <AnimatedCounter value={activeUsers} className="text-5xl font-bold text-white tabular-nums tracking-tight" />
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                            </span>
                        </div>

                        {/* Mini bar chart */}
                        <div className="flex items-end gap-[1px] h-[48px]">
                            {barData.map((v, i) => {
                                const h = Math.max((v / maxBar) * 100, 4);
                                return (
                                    <motion.div
                                        key={i}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${h}%` }}
                                        transition={{ duration: 0.3, delay: i * 0.01 }}
                                        className="flex-1 bg-blue-500/50 hover:bg-blue-400/70 rounded-t-[1px] transition-colors"
                                        title={`~${v}`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* ─── Live Event Feed (Left Side, below metric card) ─── */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="absolute top-[280px] left-6 z-10 w-[320px]"
                >
                    <div className="bg-[rgba(10,10,20,0.7)] backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
                        <div className="space-y-0 max-h-[220px] overflow-y-auto">
                            {activityFeed.slice(0, 5).map((log, i) => (
                                <motion.div
                                    key={`${log.name}-${i}`}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.4 + i * 0.08 }}
                                    className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition"
                                >
                                    {/* Event icon */}
                                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-400">
                                        {EVENT_ICONS[log.event] || <Zap className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-white truncate">{log.event.replace('_', ' ')}</span>
                                            <span className="text-[10px] text-zinc-600">·</span>
                                            <span className="text-[10px] text-emerald-400 font-mono truncate">{log.page}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {/* Referrer/device icons */}
                                            <CountryFlag country={log.country} />
                                            <DeviceIcon device={log.device} />
                                            <span className="text-[9px] text-zinc-600">·</span>
                                            <span className="text-[9px] text-zinc-700">
                                                {i === 0 ? 'just now' : `${i} min ago`}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* ─── Active Filter Indicator (Top Right) ─── */}
                <AnimatePresence>
                    {activeCountry && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-5 right-6 z-10"
                        >
                            <button
                                onClick={() => setActiveCountry(null)}
                                className="flex items-center gap-2 px-4 py-2 bg-[rgba(10,10,20,0.8)] backdrop-blur-xl border border-blue-500/30 rounded-xl text-xs text-blue-400 hover:border-blue-400/50 transition shadow-lg"
                            >
                                <CountryFlag country={activeCountry} />
                                Filtered: {activeCountry}
                                <span className="text-zinc-500 hover:text-white ml-1">&times;</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── Realtime Intelligence ─── */}
            {intelligence.length > 0 && (
                <div className="px-6 pt-5">
                    <div className="flex items-center gap-3 overflow-x-auto pb-1">
                        {intelligence.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex-shrink-0 px-3.5 py-2 bg-[rgba(255,255,255,0.025)] border border-white/[0.06] rounded-xl text-[11px] text-zinc-300 whitespace-nowrap"
                            >
                                {msg}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Data Tables Section ─── */}
            <div className="px-6 pt-5 pb-6 space-y-5">
                {/* Geo + Pages side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Geo Table */}
                    <div className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                        <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-sm font-semibold text-white">Geo</h3>
                            <div className="flex">{byCountry.slice(0, 6).map((c: any, i: number) => <CountryFlag key={i} country={c.country} />)}</div>
                        </div>
                        <AnalyticsTable
                            data={filteredByCountry.map((c: any) => ({ name: c.country, events: c.users, sessions: c.users }))}
                            showSearch={false}
                            onRowClick={(item: any) => handleBubbleClick(item.name)}
                            activeRow={(item: any) => item.name === activeCountry}
                            columns={[
                                {
                                    key: 'name', label: 'Country', sortable: true,
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
                                    render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums font-medium">{item.events}</span>,
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

                    {/* Pages Table */}
                    <div className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                        <h3 className="text-sm font-semibold text-white mb-3">Active Pages</h3>
                        <AnalyticsTable
                            data={filteredByPage.map((p: any) => ({ path: p.page, events: p.users, sessions: p.users }))}
                            searchKey={(item: any) => item.path}
                            searchPlaceholder="Search pages..."
                            columns={[
                                {
                                    key: 'path', label: 'Path', sortable: true,
                                    getValue: (item: any) => item.path,
                                    render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[220px] block font-mono">{item.path}</span>,
                                },
                                {
                                    key: 'events', label: 'Events', align: 'right' as const, sortable: true,
                                    getValue: (item: any) => item.events,
                                    render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums font-medium">{item.events}</span>,
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

                {/* Devices */}
                <div className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <h3 className="text-sm font-semibold text-white mb-3">Devices</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {byDevice.map((d: any, i: number) => {
                            const total = byDevice.reduce((s: number, dd: any) => s + dd.users, 0);
                            const pct = total > 0 ? Math.round((d.users / total) * 100) : 0;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                            {DEVICE_ICONS[d.device?.toLowerCase()] || <Monitor className="w-4 h-4" />}
                                        </div>
                                        <span className="text-xs text-zinc-400 capitalize">{d.device}</span>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <AnimatedCounter value={d.users} className="text-2xl font-bold text-white tabular-nums" />
                                        <span className="text-xs text-blue-400 font-medium tabular-nums">{pct}%</span>
                                    </div>
                                    <div className="mt-2 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
                                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
