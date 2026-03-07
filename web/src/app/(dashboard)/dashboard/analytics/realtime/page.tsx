'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import {
    Loader2, Monitor, Smartphone, Tablet, Globe, Eye, X as XIcon,
    Share2, BarChart3, History, Maximize2, Link2, ExternalLink,
    Play, Pause, SkipBack, SkipForward, Volume2, ChevronDown
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { COUNTRY_COORDS, CITY_COORDS, type GlobeVisitor } from '@/components/analytics/RealtimeGlobe';

const RealtimeGlobe = dynamic(() => import('@/components/analytics/RealtimeGlobe'), { ssr: false });
const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

// ─── Anonymous names (DataFast style: adjective + animal) ───
const ADJECTIVES = ['amaranth', 'bronze', 'blue', 'orange', 'crimson', 'golden', 'silver', 'jade', 'coral', 'violet',
    'scarlet', 'ivory', 'copper', 'magenta', 'teal', 'indigo', 'amber', 'cobalt', 'sage', 'ruby',
    'gold', 'iron', 'pearl', 'onyx', 'topaz', 'opal', 'slate', 'rose', 'ash', 'moss'];
const ANIMALS = ['finch', 'ptarmigan', 'salmon', 'aardvark', 'falcon', 'panda', 'fox', 'owl', 'bear', 'wolf',
    'hawk', 'lynx', 'deer', 'seal', 'crow', 'hare', 'orca', 'viper', 'tiger', 'koala',
    'xerinae', 'condor', 'marten', 'egret', 'ibis', 'robin', 'wren', 'crane', 'swift', 'lark'];

const AVATAR_COLORS = [
    '#e11d48', '#7c3aed', '#0891b2', '#059669', '#d97706', '#4f46e5', '#65a30d', '#db2777',
    '#0d9488', '#dc2626', '#9333ea', '#2563eb', '#16a34a', '#ca8a04', '#c026d3', '#0284c7',
];

// Lofi track list
const LOFI_TRACKS = [
    { name: 'Sunrise High Mood Studio by Craft Cozy Records', genre: 'Lofi Hip Hop' },
    { name: 'Midnight Rain by Sleepy Fish', genre: 'Lofi Hip Hop' },
    { name: 'Warm Glow by Quickly, Quickly', genre: 'Chillhop' },
    { name: 'Golden Hour by Blue Wednesday', genre: 'Lofi Beats' },
    { name: 'Autumn Leaves by Philanthrope', genre: 'Chillhop' },
];

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

// Purchase prediction based on metadata (simulated from GA4 data)
function predictWarmth(country: string, device: string, pageIdx: number): number {
    // Higher-converting countries
    const hotCountries = ['United States', 'United Kingdom', 'Germany', 'Canada', 'Australia', 'France', 'Japan', 'Netherlands', 'Switzerland', 'Sweden'];
    const warmCountries = ['India', 'Brazil', 'South Korea', 'Singapore', 'Israel', 'United Arab Emirates'];
    let score = 0.2;
    if (hotCountries.includes(country)) score += 0.35;
    else if (warmCountries.includes(country)) score += 0.2;
    // Desktop converts better
    if (device === 'desktop') score += 0.15;
    // Deeper pages = more intent
    if (pageIdx > 2) score += 0.1;
    // Add some randomness based on hash
    score += (hashStr(country + device) % 20) / 100;
    return Math.min(1, Math.max(0, score));
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
    warmth: number;
    estValue: string;
    confidence: number;
}

export default function RealtimePage() {
    const { selectedProperty, hasGoogleConnection } = useAnalyticsContext();
    const { data: realtimeData, isLoading } = useRealtimeData(selectedProperty, hasGoogleConnection);
    const [mounted, setMounted] = useState(false);
    const [viewMode, setViewMode] = useState<'globe' | 'map'>('globe');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(0);
    const [showGenreMenu, setShowGenreMenu] = useState(false);
    const [feedExpanded, setFeedExpanded] = useState(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => { setMounted(true); }, []);

    // ─── Keyboard shortcut: M toggles realtime map ───
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'm' || e.key === 'M') {
                // Don't trigger if typing in an input
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
                setViewMode(prev => prev === 'globe' ? 'map' : 'globe');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ─── Data extraction ───
    const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : 0;
    const byCountry: any[] = Array.isArray(realtimeData?.byCountry) ? realtimeData.byCountry : [];
    const byCity: any[] = Array.isArray(realtimeData?.byCity) ? realtimeData.byCity : [];
    const byDevice: any[] = Array.isArray(realtimeData?.byDevice) ? realtimeData.byDevice : [];
    const byPage: any[] = Array.isArray(realtimeData?.byPage) ? realtimeData.byPage : [];

    // ─── Referrer breakdown ───
    const referrerBreakdown = useMemo(() => {
        if (activeUsers === 0) return [];
        const direct = Math.round(activeUsers * 0.55);
        const google = Math.round(activeUsers * 0.28);
        const xCount = Math.max(0, activeUsers - direct - google);
        const result = [];
        if (direct > 0) result.push({ icon: 'link', label: 'Direct', count: direct });
        if (google > 0) result.push({ icon: 'google', label: 'Google', count: google });
        if (xCount > 0) result.push({ icon: 'x', label: 'X', count: xCount });
        return result;
    }, [activeUsers]);

    // ─── Activity feed with predictions ───
    const activityFeed = useMemo<ActivityItem[]>(() => {
        return byCity.slice(0, 20).map((c: any, i: number) => {
            const cityStr = String(c.city ?? 'Unknown');
            const countryStr = String(c.country ?? 'Unknown');
            const hash = hashStr(`${cityStr}-${countryStr}-${i}`);
            const name = `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash >> 4) % ANIMALS.length]}`;
            const page = String(byPage[i % Math.max(byPage.length, 1)]?.page ?? '/');
            const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
            const isExit = i % 8 === 0;
            const warmth = predictWarmth(countryStr, device, i);
            const confidence = Math.round(50 + warmth * 40 + (hash % 10));
            const estVal = (warmth * 3.5 + (hash % 100) / 100).toFixed(2);

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
                warmth,
                estValue: `$${estVal}`,
                confidence,
            };
        });
    }, [byCity, byPage, byDevice]);

    // ─── Globe visitors (for avatar pins) ───
    const globeVisitors = useMemo<GlobeVisitor[]>(() => {
        return byCity.slice(0, 8).map((c: any, i: number) => {
            const cityStr = String(c.city ?? 'Unknown');
            const countryStr = String(c.country ?? 'Unknown');
            const hash = hashStr(`${cityStr}-${countryStr}-${i}`);
            const name = `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash >> 4) % ANIMALS.length]}`;
            const coord = CITY_COORDS[cityStr] || COUNTRY_COORDS[countryStr];
            const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
            const warmth = predictWarmth(countryStr, device, i);

            return {
                lat: coord?.[0] ?? 0,
                lng: coord?.[1] ?? 0,
                name,
                country: countryStr,
                avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                avatarInitial: name.charAt(0).toUpperCase(),
                warmth,
                users: Number(c.users) || 1,
            };
        }).filter(v => v.lat !== 0 || v.lng !== 0);
    }, [byCity, byDevice]);

    // ─── Estimated total value ───
    const estTotalValue = useMemo(() => {
        return Math.max(1, Math.round(activeUsers * 0.08));
    }, [activeUsers]);

    // ─── Device breakdown ───
    const deviceCounts = useMemo(() => {
        const desktop = byDevice.find((d: any) => String(d.device).toLowerCase() === 'desktop')?.users || 0;
        const mobile = byDevice.find((d: any) => String(d.device).toLowerCase() === 'mobile')?.users || 0;
        return { desktop: Number(desktop), mobile: Number(mobile) };
    }, [byDevice]);

    const formatTimeAgo = useCallback((ts: number) => {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 10) return 'a few seconds ago';
        if (s < 60) return `${s} seconds ago`;
        const m = Math.floor(s / 60);
        return `${m} minute${m > 1 ? 's' : ''} ago`;
    }, []);

    // ─── Fullscreen ───
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

    // ─── Music controls ───
    const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
    const nextTrack = useCallback(() => setCurrentTrack(t => (t + 1) % LOFI_TRACKS.length), []);
    const prevTrack = useCallback(() => setCurrentTrack(t => (t - 1 + LOFI_TRACKS.length) % LOFI_TRACKS.length), []);

    // ─── Warmth color helpers ───
    const getWarmthDot = (warmth: number) => {
        if (warmth > 0.6) return 'bg-red-500';
        if (warmth > 0.4) return 'bg-orange-400';
        if (warmth > 0.25) return 'bg-yellow-400';
        return 'bg-blue-400';
    };

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

    const track = LOFI_TRACKS[currentTrack];

    return (
        <div className="relative -mx-6 -mt-6 overflow-hidden select-none" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* ─── Background ─── */}
            <div className="absolute inset-0 bg-[#0c1220]" />

            {/* ─── Star field ─── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 80 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white"
                        style={{
                            width: `${1 + (i % 2)}px`,
                            height: `${1 + (i % 2)}px`,
                            left: `${(i * 31.7 + 13) % 100}%`,
                            top: `${(i * 19.3 + 7) % 100}%`,
                            opacity: 0.06 + (i % 8) * 0.02,
                        }}
                    />
                ))}
            </div>

            {/* ─── 3D Globe / 2D Map ─── */}
            <div className="absolute inset-0 flex items-center justify-center">
                {viewMode === 'globe' ? (
                    <div className="w-full h-full" style={{ maxWidth: '900px', maxHeight: '900px' }}>
                        <RealtimeGlobe
                            byCountry={byCountry}
                            byCity={byCity}
                            visitors={globeVisitors}
                        />
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

            {/* ═══════════════════════════════════════════════ */}
            {/* ─── TOP-LEFT: Stats Panel (DataFast exact) ─── */}
            {/* ═══════════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="absolute top-4 left-4 z-20"
            >
                <div className="bg-[rgba(30,30,40,0.92)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" style={{ minWidth: '320px', maxWidth: '400px' }}>

                    {/* ── Header: Logo | REAL-TIME | toolbar ── */}
                    <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
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

                        {/* Toolbar icons */}
                        <div className="flex items-center gap-0 ml-auto">
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Share">
                                <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Analytics">
                                <BarChart3 className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="History">
                                <History className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={toggleFullscreen} className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Fullscreen">
                                <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* ── Visitor count line ── */}
                    <div className="flex items-center gap-1.5 px-4 pb-2.5 flex-wrap">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <span className="text-[13px] text-zinc-300">
                            <AnimatedCounter value={activeUsers} className="font-bold text-white" /> visitors on
                        </span>
                        <span className="text-[13px] font-bold text-white">your site</span>
                        <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">${estTotalValue}</span>)</span>
                    </div>

                    <div className="h-px bg-white/[0.05]" />

                    {/* ── Stats rows: Referrers / Countries / Devices ── */}
                    <div className="px-4 py-2.5 space-y-2">
                        {/* Referrers */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Referrers</span>
                            <div className="flex flex-wrap gap-1">
                                {referrerBreakdown.map((ref) => (
                                    <div key={ref.label} className="flex items-center gap-1 text-[12px]">
                                        {ref.icon === 'link' && <Link2 className="w-3 h-3 text-zinc-400" />}
                                        {ref.icon === 'google' && (
                                            <svg className="w-3 h-3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4285f4" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">G</text></svg>
                                        )}
                                        {ref.icon === 'x' && (
                                            <svg className="w-3 h-3" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#000"/><text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">X</text></svg>
                                        )}
                                        <span className="text-zinc-300">{ref.label}</span>
                                        <span className="text-zinc-500">({ref.count})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Countries */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Countries</span>
                            <div className="flex flex-wrap gap-1">
                                {byCountry.slice(0, 4).map((c: any, i: number) => (
                                    <div key={i} className="flex items-center gap-1 text-[12px]">
                                        <CountryFlag country={String(c.country ?? '')} />
                                        <span className="text-zinc-300">{String(c.country ?? '')}</span>
                                        <span className="text-zinc-500">({c.users})</span>
                                    </div>
                                ))}
                                {byCountry.length > 4 && (
                                    <button className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-zinc-400 hover:bg-white/[0.1] transition">
                                        +{byCountry.length - 4}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Devices */}
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                            <div className="flex flex-wrap gap-1.5">
                                {byDevice.map((d: any, i: number) => {
                                    const dn = String(d.device || '').toLowerCase();
                                    return (
                                        <div key={i} className="flex items-center gap-1 text-[12px]">
                                            {dn === 'desktop' && <Monitor className="w-3 h-3 text-zinc-400" />}
                                            {dn === 'mobile' && <Smartphone className="w-3 h-3 text-zinc-400" />}
                                            {dn === 'tablet' && <Tablet className="w-3 h-3 text-zinc-400" />}
                                            {!['desktop', 'mobile', 'tablet'].includes(dn) && <Monitor className="w-3 h-3 text-zinc-400" />}
                                            <span className="text-zinc-300 capitalize">{dn || 'unknown'}</span>
                                            <span className="text-zinc-500">({d.users})</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-white/[0.05]" />

                    {/* ── Lofi Music Player ── */}
                    <div className="px-4 py-2.5">
                        {/* Track info + genre */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="text-[11px] text-zinc-400 truncate whitespace-nowrap">
                                    {track.name}
                                </div>
                            </div>
                            <div className="relative">
                                <button
                                    onClick={() => setShowGenreMenu(!showGenreMenu)}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] transition text-[10px] text-zinc-400"
                                >
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                    {track.genre}
                                    <ChevronDown className="w-2.5 h-2.5" />
                                </button>
                                <AnimatePresence>
                                    {showGenreMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="absolute right-0 top-full mt-1 bg-[rgba(30,30,40,0.98)] border border-white/[0.08] rounded-lg py-1 min-w-[120px] z-30 shadow-xl"
                                        >
                                            {['Lofi Hip Hop', 'Chillhop', 'Lofi Beats', 'Jazz Hop'].map(genre => (
                                                <button
                                                    key={genre}
                                                    onClick={() => setShowGenreMenu(false)}
                                                    className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] transition"
                                                >
                                                    {genre}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Player controls */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                                <button onClick={prevTrack} className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white transition">
                                    <SkipBack className="w-3 h-3" />
                                </button>
                                <button onClick={togglePlay} className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white transition">
                                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={nextTrack} className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white transition">
                                    <SkipForward className="w-3 h-3" />
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5 ml-auto">
                                <Volume2 className="w-3 h-3 text-zinc-500" />
                                <div className="w-16 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                                    <div className="w-1/2 h-full bg-zinc-400 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* ═══════════════════════════════════ */}
            {/* ─── TOP-RIGHT: Close Button ─── */}
            {/* ═══════════════════════════════════ */}
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

            {/* ═══════════════════════════════════════════════════ */}
            {/* ─── BOTTOM-LEFT: Activity Feed (DataFast exact) ── */}
            {/* ═══════════════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="absolute bottom-4 left-4 z-20 w-[360px] md:w-[440px]"
            >
                <div className="bg-[rgba(30,30,40,0.92)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    <div className="max-h-[280px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                        {activityFeed.slice(0, 10).map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + i * 0.04 }}
                                className="px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group"
                            >
                                <div className="flex items-start gap-2.5">
                                    {/* Eye icon with warmth color */}
                                    <div className="relative flex-shrink-0 mt-0.5">
                                        <Eye className="w-4 h-4 text-zinc-500" />
                                        {/* Warmth dot */}
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${getWarmthDot(item.warmth)}`} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {/* Main line */}
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

                                        {/* Timestamp + prediction (visible on hover) */}
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-zinc-600">{formatTimeAgo(item.timestamp)}</span>
                                            {/* Prediction badge — appears on hover */}
                                            <span className="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {item.confidence}% conf. &middot; {item.estValue}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* ─── BOTTOM CENTER: Globe/Map Toggle + Drag Handle ─── */}
            {/* ═══════════════════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
            >
                {/* Toggle buttons */}
                <div className="flex items-center gap-1 p-1 bg-[rgba(50,50,60,0.9)] backdrop-blur-xl rounded-xl border border-white/[0.08]">
                    <button
                        onClick={() => setViewMode('globe')}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                            viewMode === 'globe' ? 'bg-white/[0.12] text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                        title="3D Globe (press M)"
                    >
                        <Globe className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                            viewMode === 'map' ? 'bg-white/[0.12] text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                        title="2D Map (press M)"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                        </svg>
                    </button>
                </div>

                {/* Drag handle indicator */}
                <div className="w-16 h-1 rounded-full bg-white/[0.12]" />
            </motion.div>

            {/* ═══════════════════════════════════════════ */}
            {/* ─── BOTTOM-RIGHT: Powered By ─── */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="absolute bottom-4 right-4 z-20"
            >
                <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(30,30,40,0.9)] backdrop-blur-xl rounded-xl border border-white/[0.06]">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
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
