'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Link2, ExternalLink, Monitor, Smartphone, Tablet, Navigation } from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import {
    convertCitiesToGlobeVisitors, convertToActivityFeed,
    getWarmthDot, hashStr, predictWarmth, ADJECTIVES, ANIMALS,
    type ActivityFeedItem, type GlobeVisitor,
} from '@/lib/globeUtils';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

// ─── Demo data (fallback) ───
const DEMO_VISITORS: GlobeVisitor[] = [
    { id: '1', lat: 37.77, lng: -122.42, name: 'coral falcon', country: 'United States', avatarColor: '#f87171', avatarInitial: 'CF', warmth: 0.8, users: 3 },
    { id: '2', lat: 51.51, lng: -0.13, name: 'jade owl', country: 'United Kingdom', avatarColor: '#34d399', avatarInitial: 'JO', warmth: 0.7, users: 2 },
    { id: '3', lat: 20.59, lng: 78.96, name: 'amber wolf', country: 'India', avatarColor: '#fbbf24', avatarInitial: 'AW', warmth: 0.5, users: 2 },
    { id: '4', lat: 35.69, lng: 139.69, name: 'silver crane', country: 'Japan', avatarColor: '#a78bfa', avatarInitial: 'SC', warmth: 0.65, users: 1 },
    { id: '5', lat: -33.87, lng: 151.21, name: 'rose finch', country: 'Australia', avatarColor: '#fb923c', avatarInitial: 'RF', warmth: 0.6, users: 1 },
    { id: '6', lat: 52.52, lng: 13.41, name: 'teal hawk', country: 'Germany', avatarColor: '#22d3ee', avatarInitial: 'TH', warmth: 0.55, users: 1 },
    { id: '7', lat: 1.35, lng: 103.82, name: 'bronze panda', country: 'Singapore', avatarColor: '#e879f9', avatarInitial: 'BP', warmth: 0.45, users: 1 },
    { id: '8', lat: -23.55, lng: -46.63, name: 'scarlet ibis', country: 'Brazil', avatarColor: '#f472b6', avatarInitial: 'SI', warmth: 0.35, users: 1 },
];
const DEMO_BY_COUNTRY = DEMO_VISITORS.map(v => ({ country: v.country, users: v.users ?? 1 }));
const DEMO_ACTIVITY: ActivityFeedItem[] = [
    { id: 'a1', name: 'coral falcon', country: 'United States', page: '/dashboard/analytics', event: 'visited', timestamp: Date.now() - 8000, warmth: 0.7, estValue: '$2.45', confidence: 82 },
    { id: 'a2', name: 'jade owl', country: 'United Kingdom', page: '/pricing', event: 'visited', timestamp: Date.now() - 24000, warmth: 0.8, estValue: '$3.10', confidence: 88 },
    { id: 'a3', name: 'amber wolf', country: 'India', page: '', event: 'exited to', exitUrl: 'github.com/trafficclaw', timestamp: Date.now() - 41000, warmth: 0.65, estValue: '$1.80', confidence: 75 },
    { id: 'a4', name: 'silver crane', country: 'Japan', page: '/docs/api', event: 'visited', timestamp: Date.now() - 63000, warmth: 0.7, estValue: '$2.60', confidence: 80 },
];

function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

function getWarmthRing(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

function formatTimeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'a few seconds ago';
    if (s < 60) return `${s} seconds ago`;
    const m = Math.floor(s / 60);
    return `${m} minute${m > 1 ? 's' : ''} ago`;
}

export default function EmbedGlobePage() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const mapRef = useRef<RealtimeMapboxHandle>(null);
    const [isAutoPanning, setIsAutoPanning] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [realtimeData, setRealtimeData] = useState<Record<string, any> | null>(null);
    const [isDemo, setIsDemo] = useState(!token);
    const lastDataRef = useRef<string>('');
    const intervalRef = useRef<number>(60_000);

    // ─── Adaptive polling ───
    useEffect(() => {
        if (!token) return;
        let timeoutId: ReturnType<typeof setTimeout>;
        let cancelled = false;

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/embed/realtime?token=${encodeURIComponent(token)}`);
                if (res.status === 429) {
                    intervalRef.current = 180_000;
                } else if (res.ok) {
                    const data = await res.json();
                    const dataStr = JSON.stringify(data);
                    intervalRef.current = dataStr !== lastDataRef.current ? 60_000 : 120_000;
                    lastDataRef.current = dataStr;
                    setRealtimeData(data);
                    setIsDemo(false);
                } else if (!realtimeData) {
                    setIsDemo(true);
                }
            } catch {
                if (!realtimeData) setIsDemo(true);
            }
            if (!cancelled && document.visibilityState === 'visible') {
                timeoutId = setTimeout(fetchData, intervalRef.current);
            }
        };

        const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData(); };
        document.addEventListener('visibilitychange', handleVisibility);
        fetchData();
        return () => { cancelled = true; clearTimeout(timeoutId); document.removeEventListener('visibilitychange', handleVisibility); };
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Data conversion ───
    const realVisitors = useMemo(() => {
        if (!realtimeData || isDemo) return [];
        return convertCitiesToGlobeVisitors(
            Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [],
            Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : [],
        );
    }, [realtimeData, isDemo]);

    const realActivity = useMemo<ActivityFeedItem[]>(() => {
        if (!realtimeData || isDemo) return [];
        return convertToActivityFeed(
            Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [],
            Array.isArray(realtimeData.byPage) ? realtimeData.byPage : [],
            [],
        );
    }, [realtimeData, isDemo]);

    const realByCountry = useMemo<{ country: string; users: number }[]>(() => {
        if (!realtimeData || isDemo) return [];
        return (Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : []).map((c: { country?: string; users?: number }) => ({
            country: String(c.country ?? ''), users: Number(c.users) || 0,
        }));
    }, [realtimeData, isDemo]);

    // ─── Display data ───
    const hasRealData = !isDemo && realVisitors.length > 0;
    const displayVisitors = hasRealData ? realVisitors : DEMO_VISITORS;
    const displayByCountry = hasRealData ? realByCountry : DEMO_BY_COUNTRY;
    const displayActivity = hasRealData ? realActivity : DEMO_ACTIVITY;
    const activeUsers = hasRealData ? (realtimeData?.activeUsers || 0) : DEMO_VISITORS.reduce((s, v) => s + (v.users ?? 1), 0);
    const estTotalValue = Math.max(1, Math.round(activeUsers * 0.08));

    const toggleAutoPan = useCallback(() => {
        if (mapRef.current) {
            const newVal = mapRef.current.toggleAutoPan();
            setIsAutoPanning(newVal);
        }
    }, []);

    const handleAutoPanChange = useCallback((enabled: boolean) => {
        setIsAutoPanning(enabled);
    }, []);

    return (
        <div className="flex flex-col relative w-screen h-screen overflow-hidden sm:block" style={{ background: '#080c18' }}>
            {/* ─── Globe ─── */}
            <div className="relative flex-1 min-h-0 sm:absolute sm:inset-0 order-0">
                <div className="absolute inset-0">
                    <RealtimeGlobeMaplibre
                        ref={mapRef}
                        visitors={displayVisitors}
                        byCountry={displayByCountry}
                        autoPan={isAutoPanning}
                        onAutoPanChange={handleAutoPanChange}
                    />
                </div>
            </div>

            {/* ═══ TOP-LEFT: Stats Panel ═══ */}
            <div className="relative z-10 flex-shrink-0 -order-1 sm:absolute sm:top-4 sm:left-4 sm:z-20">
                <div className="p-3 sm:absolute sm:top-4 sm:left-4 sm:bg-black/60 sm:backdrop-blur-sm sm:rounded-xl sm:p-4 sm:border sm:border-white/10 sm:max-w-xs">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                                <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                                <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                                <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                            </svg>
                            <span className="text-[14px] font-bold text-white tracking-tight">TrafficClaw</span>
                        </div>
                        <div className="w-px h-4 bg-zinc-600/50 mx-0.5" />
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.15em]">Real-Time</span>
                        {isDemo && (
                            <>
                                <div className="w-px h-4 bg-zinc-600/50 mx-0.5" />
                                <span className="text-[9px] font-bold text-yellow-500/80 uppercase tracking-wider">Demo</span>
                            </>
                        )}
                    </div>

                    {/* Visitor count */}
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <span className="text-[13px] text-zinc-300">
                            <span className="font-bold text-white">{activeUsers}</span> visitors on
                        </span>
                        <span className="text-[13px] font-bold text-white">your site</span>
                        <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">${estTotalValue}</span>)</span>
                    </div>

                    <div className="h-px bg-white/[0.05] mb-2" />

                    {/* Countries */}
                    <div className="space-y-2">
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Countries</span>
                            <div className="flex flex-wrap gap-1">
                                {displayByCountry.slice(0, 4).map((c, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[12px]">
                                        <CountryFlag country={c.country} />
                                        <span className="text-zinc-300">{c.country}</span>
                                        <span className="text-zinc-500">({c.users})</span>
                                    </div>
                                ))}
                                {displayByCountry.length > 4 && (
                                    <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-zinc-400">
                                        +{displayByCountry.length - 4}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Devices (desktop only) */}
                        <div className="hidden sm:flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                            <div className="flex flex-wrap gap-1.5">
                                <div className="flex items-center gap-1 text-[12px]">
                                    <Monitor className="w-3 h-3 text-zinc-400" />
                                    <span className="text-zinc-300">Desktop</span>
                                    <span className="text-zinc-500">({activeUsers})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ TOP-RIGHT: Controls ═══ */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 hidden sm:block">
                <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl p-1 border border-white/10">
                    <button
                        onClick={toggleAutoPan}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isAutoPanning ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.08] text-zinc-500 hover:text-white'}`}
                        title={isAutoPanning ? 'Stop auto-panning' : 'Auto-pan'}
                    >
                        <Navigation className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ═══ BOTTOM-LEFT: Activity Feed ═══ */}
            <div className="relative z-10 flex-shrink-0 order-1 sm:absolute sm:bottom-4 sm:left-4 sm:z-20 max-w-full sm:max-w-sm">
                <div className="sm:bg-black/60 sm:backdrop-blur-sm sm:rounded-xl sm:border sm:border-white/10 overflow-hidden">
                    <div className="max-h-[180px] sm:max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                        {displayActivity.map((item, i) => (
                            <div key={item.id} className="px-3 sm:px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group">
                                <div className="flex items-start gap-2.5">
                                    <div className="relative flex-shrink-0 mt-0.5">
                                        <div
                                            className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800"
                                            style={{ boxShadow: `0 0 0 2px ${getWarmthRing(item.warmth)}` }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={getAvatarUrl(item.name)} alt="" className="w-full h-full" />
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#080c18] ${getWarmthDot(item.warmth)}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-x-1 leading-snug">
                                            <span className="text-[12px] font-bold text-white">{item.name}</span>
                                            <span className="text-[12px] text-zinc-500">from</span>
                                            <CountryFlag country={item.country} />
                                            <span className="text-[12px] font-bold text-white">{item.country}</span>
                                            <span className="text-[12px] text-zinc-500">{item.event}</span>
                                            {item.event === 'visited' ? (
                                                <span className="text-[12px] text-zinc-300 font-mono">{item.page}</span>
                                            ) : (
                                                <>
                                                    <ExternalLink className="w-2.5 h-2.5 text-zinc-600" />
                                                    <span className="text-[11px] text-zinc-500 truncate">{item.exitUrl}</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-zinc-600">{formatTimeAgo(item.timestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ BOTTOM-RIGHT: Powered By ═══ */}
            <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 hidden sm:block">
                <div className="flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                        <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                        <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                    </svg>
                    <a href="https://trafficclaw.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 font-medium hover:text-zinc-300 transition">
                        Powered by <span className="text-emerald-400 font-semibold">TrafficClaw</span>
                    </a>
                </div>
            </div>
        </div>
    );
}
