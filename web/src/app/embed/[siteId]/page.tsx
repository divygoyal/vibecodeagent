'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import {
    convertCitiesToGlobeVisitors, convertToActivityFeed,
    getWarmthDot, type ActivityFeedItem, type GlobeVisitor,
} from '@/lib/globeUtils';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

// ─── Demo visitors (fallback when no token or API error) ───
const DEMO_VISITORS: GlobeVisitor[] = [
    { id: '1', lat: 37.77, lng: -122.42, name: 'coral falcon', country: 'United States', avatarColor: '#f87171', avatarInitial: 'CF', warmth: 0.8, users: 3 },
    { id: '2', lat: 51.51, lng: -0.13, name: 'jade owl', country: 'United Kingdom', avatarColor: '#34d399', avatarInitial: 'JO', warmth: 0.7, users: 2 },
    { id: '3', lat: 20.59, lng: 78.96, name: 'amber wolf', country: 'India', avatarColor: '#fbbf24', avatarInitial: 'AW', warmth: 0.5, users: 2 },
    { id: '4', lat: 35.69, lng: 139.69, name: 'silver crane', country: 'Japan', avatarColor: '#a78bfa', avatarInitial: 'SC', warmth: 0.65, users: 1 },
    { id: '5', lat: -33.87, lng: 151.21, name: 'rose finch', country: 'Australia', avatarColor: '#fb923c', avatarInitial: 'RF', warmth: 0.6, users: 1 },
    { id: '6', lat: 52.52, lng: 13.41, name: 'teal hawk', country: 'Germany', avatarColor: '#22d3ee', avatarInitial: 'TH', warmth: 0.55, users: 1 },
    { id: '7', lat: 1.35, lng: 103.82, name: 'bronze panda', country: 'Singapore', avatarColor: '#e879f9', avatarInitial: 'BP', warmth: 0.45, users: 1 },
    { id: '8', lat: 56.26, lng: 9.50, name: 'topaz crow', country: 'Denmark', avatarColor: '#4ade80', avatarInitial: 'TC', warmth: 0.4, users: 1 },
    { id: '9', lat: -23.55, lng: -46.63, name: 'scarlet ibis', country: 'Brazil', avatarColor: '#f472b6', avatarInitial: 'SI', warmth: 0.35, users: 1 },
    { id: '10', lat: 48.86, lng: 2.35, name: 'cobalt wren', country: 'France', avatarColor: '#60a5fa', avatarInitial: 'CW', warmth: 0.5, users: 1 },
    { id: '11', lat: 37.57, lng: 126.98, name: 'golden swift', country: 'South Korea', avatarColor: '#facc15', avatarInitial: 'GS', warmth: 0.45, users: 1 },
    { id: '12', lat: 43.65, lng: -79.38, name: 'ivory lark', country: 'Canada', avatarColor: '#c084fc', avatarInitial: 'IL', warmth: 0.55, users: 1 },
];
const DEMO_BY_COUNTRY = DEMO_VISITORS.map(v => ({ country: v.country, users: v.users ?? 1 }));
const DEMO_ACTIVITY = [
    { id: 'a1', name: 'coral falcon', country: 'United States', page: '500+ Agent Skills for Claude Code, Cursor & AI Assistants', event: 'visited' as const, warmth: 0.8, time: 'a few seconds ago' },
    { id: 'a2', name: 'jade owl', country: 'United Kingdom', page: 'Your Site | 1,500+ MCP Servers, AI Rules', event: 'visited' as const, warmth: 0.7, time: '8 seconds ago' },
    { id: 'a3', name: 'amber wolf', country: 'India', page: 'Best MCP Servers for Cursor IDE', event: 'visited' as const, warmth: 0.5, time: '15 seconds ago' },
    { id: 'a4', name: 'silver crane', country: 'Japan', event: 'exited to' as const, exitUrl: 'apps.apple.com/app/...', warmth: 0.65, time: '24 seconds ago' },
    { id: 'a5', name: 'rose finch', country: 'Australia', page: 'AI Coding Assistant Comparison 2026', event: 'visited' as const, warmth: 0.6, time: '31 seconds ago' },
    { id: 'a6', name: 'teal hawk', country: 'Germany', page: 'How to Build Custom MCP Servers', event: 'visited' as const, warmth: 0.55, time: '45 seconds ago' },
    { id: 'a7', name: 'bronze panda', country: 'Singapore', page: 'AI Tools for SEO in 2026', event: 'visited' as const, warmth: 0.45, time: '1 minute ago' },
    { id: 'a8', name: 'topaz crow', country: 'Denmark', page: 'Getting Started with MCP Protocol', event: 'visited' as const, warmth: 0.4, time: '2 minutes ago' },
];

function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

function formatTimeAgo(timestamp: number): string {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'a few seconds ago';
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 120) return '1 minute ago';
    return `${Math.floor(diff / 60)} minutes ago`;
}

export default function EmbedGlobePage() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const mapRef = useRef<RealtimeMapboxHandle>(null);

    // ─── Real data state ───
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [realtimeData, setRealtimeData] = useState<Record<string, any> | null>(null);
    const [isDemo, setIsDemo] = useState(!token);
    const lastDataRef = useRef<string>('');
    const intervalRef = useRef<number>(60_000); // start at 60s

    // ─── Adaptive polling with visibility API ───
    useEffect(() => {
        if (!token) return;

        let timeoutId: ReturnType<typeof setTimeout>;
        let cancelled = false;

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/embed/realtime?token=${encodeURIComponent(token)}`);
                if (res.status === 429) {
                    // Rate limited — back off to 180s
                    intervalRef.current = 180_000;
                } else if (res.ok) {
                    const data = await res.json();
                    const dataStr = JSON.stringify(data);

                    // Adaptive interval: 60s if data changed, 120s if unchanged
                    if (dataStr !== lastDataRef.current) {
                        intervalRef.current = 60_000;
                    } else {
                        intervalRef.current = 120_000;
                    }
                    lastDataRef.current = dataStr;

                    setRealtimeData(data);
                    setIsDemo(false);
                } else {
                    // API error — keep showing last data or demo
                    if (!realtimeData) setIsDemo(true);
                }
            } catch {
                if (!realtimeData) setIsDemo(true);
            }

            // Schedule next poll if visible
            if (!cancelled && document.visibilityState === 'visible') {
                timeoutId = setTimeout(fetchData, intervalRef.current);
            }
        };

        // Visibility change handler — pause/resume polling
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchData(); // Resume immediately
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        fetchData(); // Initial fetch

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAutoPanChange = useCallback(() => {}, []);

    // ─── Convert real data to globe format ───
    const realVisitors = useMemo(() => {
        if (!realtimeData || isDemo) return [];
        const byCity = Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [];
        const byCountry = Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : [];
        return convertCitiesToGlobeVisitors(byCity, byCountry);
    }, [realtimeData, isDemo]);

    const realActivity = useMemo<ActivityFeedItem[]>(() => {
        if (!realtimeData || isDemo) return [];
        const byCity = Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [];
        const byPage = Array.isArray(realtimeData.byPage) ? realtimeData.byPage : [];
        return convertToActivityFeed(byCity, byPage, []);
    }, [realtimeData, isDemo]);

    const realByCountry = useMemo<{ country: string; users: number }[]>(() => {
        if (!realtimeData || isDemo) return [];
        return (Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : []).map((c: { country?: string; users?: number }) => ({
            country: String(c.country ?? ''),
            users: Number(c.users) || 0,
        }));
    }, [realtimeData, isDemo]);

    // ─── Select display data ───
    const hasRealData = !isDemo && realVisitors.length > 0;
    const displayVisitors = hasRealData ? realVisitors : DEMO_VISITORS;
    const displayByCountry = hasRealData ? realByCountry : DEMO_BY_COUNTRY;
    const activeUsers = hasRealData ? (realtimeData?.activeUsers || 0) : DEMO_VISITORS.reduce((s, v) => s + (v.users ?? 1), 0);
    const totalCountries = displayByCountry.length;

    // Activity feed: use real data with computed times, or demo with static times
    const displayActivity = hasRealData
        ? realActivity.map(item => ({
            ...item,
            time: formatTimeAgo(item.timestamp),
        }))
        : DEMO_ACTIVITY;

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-[#080c18]">
            {/* ─── Full-screen Globe ─── */}
            <div className="absolute inset-0">
                <RealtimeGlobeMaplibre
                    ref={mapRef}
                    visitors={displayVisitors}
                    byCountry={displayByCountry}
                    autoPan={true}
                    onAutoPanChange={handleAutoPanChange}
                />
            </div>

            {/* ─── Stats overlay (top-left) ─── */}
            <div className="absolute top-4 left-4 z-10 space-y-2">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Live Visitors</div>
                    <div className="text-3xl font-bold text-white tabular-nums">{activeUsers}</div>
                </div>
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Countries</div>
                    <div className="text-xl font-bold text-emerald-400 tabular-nums">{totalCountries}</div>
                </div>
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">Top Countries</div>
                    <div className="space-y-1">
                        {displayByCountry.slice(0, 5).map(c => (
                            <div key={c.country} className="flex items-center justify-between text-xs">
                                <span className="text-zinc-300 truncate mr-2">{c.country}</span>
                                <span className="text-zinc-500 tabular-nums">{c.users}</span>
                            </div>
                        ))}
                    </div>
                </div>
                {isDemo && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-yellow-500/80 font-semibold">Demo Data</span>
                    </div>
                )}
            </div>

            {/* ─── Activity feed (bottom-left) ─── */}
            <div className="absolute bottom-4 left-4 z-10 max-w-[340px] w-full">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/[0.06]">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Live Activity</span>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto">
                        {displayActivity.map(item => (
                            <div key={item.id} className="px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition">
                                <div className="flex items-start gap-2.5">
                                    <img
                                        src={getAvatarUrl(item.name)}
                                        alt=""
                                        className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-medium text-zinc-200">{item.name}</span>
                                            <div className={`w-1.5 h-1.5 rounded-full ${getWarmthDot(item.warmth)}`} />
                                        </div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5">
                                            {item.event === 'visited' ? (
                                                <span>{item.event} <span className="text-zinc-400">{item.page}</span></span>
                                            ) : (
                                                <span>{item.event} <span className="text-zinc-400">{item.exitUrl}</span></span>
                                            )}
                                        </div>
                                        <div className="text-[9px] text-zinc-600 mt-0.5">{item.country} &middot; {item.time}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── Powered by badge (bottom-right) ─── */}
            <a
                href="https://trafficclaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg hover:border-emerald-500/30 hover:bg-black/70 transition-all group"
            >
                <img src="/icon.svg" alt="TrafficClaw" className="w-4 h-4 rounded" />
                <span className="text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    Powered by <span className="font-semibold text-emerald-400">TrafficClaw</span>
                </span>
            </a>
        </div>
    );
}
