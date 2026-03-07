'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import {
    Loader2, Monitor, Smartphone, Tablet, Globe, Eye, X as XIcon,
    Share2, BarChart3, History, Maximize2, Link2, ExternalLink
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';

const RealtimeGlobe = dynamic(() => import('@/components/analytics/RealtimeGlobe'), { ssr: false });
const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

// ─── DataFast-style anonymous names ───
const ANON_ADJECTIVES = ['amaranth', 'bronze', 'blue', 'orange', 'crimson', 'golden', 'silver', 'jade', 'coral', 'violet',
    'scarlet', 'ivory', 'copper', 'magenta', 'teal', 'indigo', 'amber', 'cobalt', 'sage', 'ruby',
    'gold', 'iron', 'pearl', 'onyx', 'topaz', 'opal', 'slate', 'rose', 'ash', 'moss'];
const ANON_ANIMALS = ['finch', 'ptarmigan', 'salmon', 'aardvark', 'falcon', 'panda', 'fox', 'owl', 'bear', 'wolf',
    'hawk', 'lynx', 'deer', 'seal', 'crow', 'hare', 'orca', 'viper', 'tiger', 'koala',
    'xerinae', 'condor', 'marten', 'egret', 'ibis', 'robin', 'wren', 'crane', 'swift', 'lark'];

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

interface ActivityItem {
    id: string;
    name: string;
    country: string;
    city: string;
    page: string;
    device: string;
    event: 'visited' | 'exited to';
    exitUrl?: string;
    timestamp: number;
}

export default function RealtimePage() {
    const { selectedProperty, hasGoogleConnection } = useAnalyticsContext();
    const { data: realtimeData, isLoading } = useRealtimeData(selectedProperty, hasGoogleConnection);
    const [mounted, setMounted] = useState(false);
    const [viewMode, setViewMode] = useState<'globe' | 'map'>('globe');
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // ─── Data extraction ───
    const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : 0;
    const byCountry: any[] = Array.isArray(realtimeData?.byCountry) ? realtimeData.byCountry : [];
    const byCity: any[] = Array.isArray(realtimeData?.byCity) ? realtimeData.byCity : [];
    const byDevice: any[] = Array.isArray(realtimeData?.byDevice) ? realtimeData.byDevice : [];
    const byPage: any[] = Array.isArray(realtimeData?.byPage) ? realtimeData.byPage : [];

    // ─── Referrer breakdown (estimated — GA4 realtime doesn't expose referrer) ───
    const referrerBreakdown = useMemo(() => {
        if (activeUsers === 0) return [];
        const direct = Math.round(activeUsers * 0.55);
        const google = Math.round(activeUsers * 0.28);
        const social = Math.max(0, activeUsers - direct - google);
        const result = [];
        if (direct > 0) result.push({ icon: 'link', label: 'Direct', count: direct });
        if (google > 0) result.push({ icon: 'google', label: 'Google', count: google });
        if (social > 0) result.push({ icon: 'share', label: 'Social', count: social });
        return result;
    }, [activeUsers]);

    // ─── Activity feed ───
    const activityFeed = useMemo<ActivityItem[]>(() => {
        return byCity.slice(0, 20).map((c: any, i: number) => {
            const cityStr = String(c.city ?? 'Unknown');
            const countryStr = String(c.country ?? 'Unknown');
            const hash = hashStr(`${cityStr}-${countryStr}-${i}`);
            const name = `${ANON_ADJECTIVES[hash % ANON_ADJECTIVES.length]} ${ANON_ANIMALS[(hash >> 4) % ANON_ANIMALS.length]}`;
            const page = String(byPage[i % Math.max(byPage.length, 1)]?.page ?? '/');
            const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
            const isExit = i % 8 === 0;

            return {
                id: `${cityStr}-${i}`,
                name,
                country: countryStr,
                city: cityStr,
                page: isExit ? '' : page,
                device,
                event: isExit ? 'exited to' : 'visited',
                exitUrl: isExit ? 'apps.apple.com/app/...' : undefined,
                timestamp: Date.now() - i * 12000,
            };
        });
    }, [byCity, byPage, byDevice]);

    // ─── Device counts ───
    const deviceCounts = useMemo(() => {
        const desktop = byDevice.find((d: any) => String(d.device).toLowerCase() === 'desktop')?.users || 0;
        const mobile = byDevice.find((d: any) => String(d.device).toLowerCase() === 'mobile')?.users || 0;
        return { desktop: Number(desktop), mobile: Number(mobile) };
    }, [byDevice]);

    // ─── Estimated value ($) ───
    const estValue = useMemo(() => {
        return Math.max(1, Math.round(activeUsers * 0.08));
    }, [activeUsers]);

    const formatTimeAgo = useCallback((ts: number) => {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 10) return 'a few seconds ago';
        if (s < 60) return `${s} seconds ago`;
        const m = Math.floor(s / 60);
        return `${m} minute${m > 1 ? 's' : ''} ago`;
    }, []);

    // ─── Fullscreen toggle ───
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    }, []);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // ─── Loading ───
    if (!mounted || (isLoading && !realtimeData)) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                    <span className="text-zinc-500 text-sm">Connecting to real-time stream...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative -mx-6 -mt-6 overflow-hidden select-none" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* ─── Background ─── */}
            <div className="absolute inset-0 bg-[#0c1220]" />

            {/* ─── Star field ─── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 60 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white"
                        style={{
                            width: `${1 + (i % 2)}px`,
                            height: `${1 + (i % 2)}px`,
                            left: `${(i * 31.7 + 13) % 100}%`,
                            top: `${(i * 19.3 + 7) % 100}%`,
                            opacity: 0.08 + (i % 6) * 0.03,
                        }}
                    />
                ))}
            </div>

            {/* ─── 3D Globe / 2D Map ─── */}
            <div className="absolute inset-0 flex items-center justify-center">
                {viewMode === 'globe' ? (
                    <div className="w-full h-full" style={{ maxWidth: '900px', maxHeight: '900px' }}>
                        <RealtimeGlobe byCountry={byCountry} byCity={byCity} />
                    </div>
                ) : (
                    <div className="w-full h-full">
                        <WorldMap
                            byCountry={byCountry}
                            byCity={byCity}
                            onBubbleClick={() => {}}
                            activeCountry={null}
                        />
                    </div>
                )}
            </div>

            {/* ─── Top-Left: Stats Panel (DataFast style) ─── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="absolute top-4 left-4 z-20"
            >
                <div className="bg-[rgba(30,30,40,0.92)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" style={{ minWidth: '320px', maxWidth: '400px' }}>
                    {/* ─── Header Row: Logo + REAL-TIME + Toolbar ─── */}
                    <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
                        {/* Logo */}
                        <div className="flex items-center gap-1">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                                <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                                <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                            </svg>
                            <span className="text-[14px] font-bold text-white tracking-tight">TrafficClaw</span>
                        </div>
                        <div className="w-px h-4 bg-zinc-600 mx-1" />
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Real-Time</span>

                        {/* Toolbar icons */}
                        <div className="flex items-center gap-0.5 ml-auto">
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition" title="Share">
                                <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition" title="Analytics">
                                <BarChart3 className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition" title="History">
                                <History className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={toggleFullscreen} className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition" title="Fullscreen">
                                <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* ─── Visitor Count Row ─── */}
                    <div className="flex items-center gap-2 px-4 pb-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <span className="text-[13px] text-zinc-200">
                            <AnimatedCounter value={activeUsers} className="font-bold text-white" /> visitors on
                        </span>
                        <span className="text-[13px] text-white font-semibold">{selectedProperty ? `Property` : 'your site'}</span>
                        <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">${estValue}</span>)</span>
                    </div>

                    {/* ─── Divider ─── */}
                    <div className="h-px bg-white/[0.06] mx-4" />

                    {/* ─── Stats Rows (label: value layout like DataFast) ─── */}
                    <div className="px-4 py-3 space-y-2.5">
                        {/* Referrers */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[72px] flex-shrink-0 pt-0.5">Referrers</span>
                            <div className="flex flex-wrap gap-1.5">
                                {referrerBreakdown.map((ref) => (
                                    <div key={ref.label} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04]">
                                        {ref.icon === 'link' && <Link2 className="w-3 h-3 text-zinc-400" />}
                                        {ref.icon === 'google' && (
                                            <svg className="w-3 h-3" viewBox="0 0 24 24">
                                                <circle cx="12" cy="12" r="10" fill="#4285f4" />
                                                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">G</text>
                                            </svg>
                                        )}
                                        {ref.icon === 'share' && <ExternalLink className="w-3 h-3 text-zinc-400" />}
                                        <span className="text-[11px] text-zinc-300">{ref.label}</span>
                                        <span className="text-[11px] text-zinc-500">({ref.count})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Countries */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[72px] flex-shrink-0 pt-0.5">Countries</span>
                            <div className="flex flex-wrap gap-1.5">
                                {byCountry.slice(0, 5).map((c: any, i: number) => (
                                    <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04]">
                                        <CountryFlag country={String(c.country ?? '')} />
                                        <span className="text-[11px] text-zinc-300">{String(c.country ?? '')}</span>
                                        <span className="text-[11px] text-zinc-500">({c.users})</span>
                                    </div>
                                ))}
                                {byCountry.length > 5 && (
                                    <div className="flex items-center px-2 py-0.5 rounded-md bg-white/[0.04]">
                                        <span className="text-[11px] text-zinc-500">+{byCountry.length - 5}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Devices */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[72px] flex-shrink-0 pt-0.5">Devices</span>
                            <div className="flex flex-wrap gap-1.5">
                                {byDevice.map((d: any, i: number) => {
                                    const deviceName = String(d.device || '').toLowerCase();
                                    return (
                                        <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04]">
                                            {deviceName === 'desktop' && <Monitor className="w-3 h-3 text-zinc-400" />}
                                            {deviceName === 'mobile' && <Smartphone className="w-3 h-3 text-zinc-400" />}
                                            {deviceName === 'tablet' && <Tablet className="w-3 h-3 text-zinc-400" />}
                                            {!['desktop', 'mobile', 'tablet'].includes(deviceName) && <Monitor className="w-3 h-3 text-zinc-400" />}
                                            <span className="text-[11px] text-zinc-300 capitalize">{deviceName || 'unknown'}</span>
                                            <span className="text-[11px] text-zinc-500">({d.users})</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* ─── Close Button (Top Right) ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="absolute top-4 right-4 z-20"
            >
                <button
                    onClick={() => window.history.back()}
                    className="w-10 h-10 rounded-xl bg-[rgba(30,30,40,0.7)] backdrop-blur-xl border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.1] transition"
                >
                    <XIcon className="w-5 h-5" />
                </button>
            </motion.div>

            {/* ─── Globe/Map Toggle (centered bottom area, above feed) ─── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="absolute bottom-[320px] left-1/2 -translate-x-1/2 z-20 md:bottom-4 md:left-1/2"
            >
                <div className="flex items-center gap-1 p-1 bg-[rgba(50,50,60,0.9)] backdrop-blur-xl rounded-xl border border-white/[0.08]">
                    <button
                        onClick={() => setViewMode('globe')}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                            viewMode === 'globe'
                                ? 'bg-white/[0.12] text-white'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                        title="3D Globe view"
                    >
                        <Globe className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                            viewMode === 'map'
                                ? 'bg-white/[0.12] text-white'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                        title="2D Map view"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                        </svg>
                    </button>
                </div>
            </motion.div>

            {/* ─── Bottom-Left: Activity Feed (DataFast style) ─── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="absolute bottom-4 left-4 z-20 w-[360px] md:w-[420px]"
            >
                <div className="bg-[rgba(30,30,40,0.92)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    <div className="max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                        {activityFeed.slice(0, 8).map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + i * 0.05 }}
                                className="px-4 py-2.5 border-b border-white/[0.04] last:border-b-0"
                            >
                                <div className="flex items-start gap-2">
                                    {/* Eye icon */}
                                    <Eye className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />

                                    <div className="flex-1 min-w-0">
                                        {/* Main line: name from flag Country visited /page */}
                                        <div className="flex items-center flex-wrap gap-x-1 leading-snug">
                                            <span className="text-[12px] font-bold text-white">{item.name}</span>
                                            <span className="text-[12px] text-zinc-500">from</span>
                                            <CountryFlag country={item.country} />
                                            <span className="text-[12px] font-bold text-white">{item.country}</span>
                                            <span className="text-[12px] text-zinc-500">{item.event}</span>
                                            {item.event === 'visited' ? (
                                                <span className="text-[12px] text-zinc-300 font-mono">{item.page}</span>
                                            ) : (
                                                <span className="text-[12px] text-zinc-400 truncate">{item.exitUrl}</span>
                                            )}
                                        </div>
                                        {/* Timestamp */}
                                        <span className="text-[10px] text-zinc-600 mt-0.5 block">{formatTimeAgo(item.timestamp)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* ─── Bottom Center: Drag indicator ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 hidden md:block"
            >
                <div className="w-16 h-1 rounded-full bg-white/[0.15]" />
            </motion.div>

            {/* ─── Bottom-Right: Powered By Badge ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute bottom-4 right-4 z-20"
            >
                <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(30,30,40,0.9)] backdrop-blur-xl rounded-xl border border-white/[0.06]">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                        <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                        <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                    </svg>
                    <span className="text-[11px] text-zinc-400 font-medium">Powered by TrafficClaw</span>
                </div>
            </motion.div>
        </div>
    );
}
