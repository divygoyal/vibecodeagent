'use client';

import { useState, useMemo, useEffect, useCallback, useRef, Component, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useRealtimeData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import {
    Loader2, Monitor, Smartphone, Tablet, Eye, X as XIcon,
    Share2, Music, History, Maximize2, Link2, ExternalLink, AlertTriangle, RotateCcw, Navigation
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { COUNTRY_COORDS, CITY_COORDS, type GlobeVisitor } from '@/components/analytics/RealtimeGlobe';
import type { RealtimeMapboxHandle } from '@/components/analytics/RealtimeMapbox';

// ─── DiceBear avatar URL (matching globe markers) ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

// ─── Page-level error boundary to prevent dashboard-wide crash ───
class RealtimeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
    state = { hasError: false, error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    componentDidCatch(error: Error) { console.error('Realtime page error:', error); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Realtime view failed to load</h2>
                    <p className="text-zinc-400 max-w-md mb-4">This may be caused by a WebGL or map rendering issue.</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 font-medium text-sm"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const RealtimeMapbox = dynamic(() => import('@/components/analytics/RealtimeMapbox'), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoiZGl2eWdveWFsIiwiYSI6ImNtbWc3OXY3OTBkeG8yb3NjZXhtdnphMzUifQ.hKvgr-e2sYAMbMq1PvgrAA';

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

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

// Purchase prediction based on metadata (simulated from GA4 data)
function predictWarmth(country: string, device: string, pageIdx: number): number {
    const hotCountries = ['United States', 'United Kingdom', 'Germany', 'Canada', 'Australia', 'France', 'Japan', 'Netherlands', 'Switzerland', 'Sweden'];
    const warmCountries = ['India', 'Brazil', 'South Korea', 'Singapore', 'Israel', 'United Arab Emirates'];
    let score = 0.2;
    if (hotCountries.includes(country)) score += 0.35;
    else if (warmCountries.includes(country)) score += 0.2;
    if (device === 'desktop') score += 0.15;
    if (pageIdx > 2) score += 0.1;
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
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAutoPanning, setIsAutoPanning] = useState(true);
    const mapRef = useRef<RealtimeMapboxHandle>(null);

    const toggleAutoPan = useCallback(() => {
        if (mapRef.current) {
            const newVal = mapRef.current.toggleAutoPan();
            setIsAutoPanning(newVal);
        }
    }, []);

    useEffect(() => { setMounted(true); }, []);

    // ─── Data extraction ───
    const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : 0;
    const byCountry: any[] = Array.isArray(realtimeData?.byCountry) ? realtimeData.byCountry : [];
    const byCity: any[] = Array.isArray(realtimeData?.byCity) ? realtimeData.byCity : [];
    const byDevice: any[] = Array.isArray(realtimeData?.byDevice) ? realtimeData.byDevice : [];
    const byPage: any[] = Array.isArray(realtimeData?.byPage) ? realtimeData.byPage : [];

    // ─── Referrer breakdown (real GA4 data) ───
    const referrerBreakdown = useMemo(() => {
        const byRef: any[] = Array.isArray(realtimeData?.byReferrer) ? realtimeData.byReferrer : [];
        if (byRef.length === 0 && activeUsers > 0) {
            return [{ icon: 'link', label: 'Direct', count: activeUsers }];
        }
        return byRef.map((r: any) => {
            const source = String(r.source ?? 'Direct');
            let icon = 'link';
            const sl = source.toLowerCase();
            if (sl.includes('social')) icon = 'x';
            else if (sl.includes('organic')) icon = 'google';
            else if (sl.includes('referral')) icon = 'referral';
            else if (sl.includes('direct')) icon = 'link';
            return { icon, label: source, count: Number(r.users) || 0 };
        });
    }, [realtimeData?.byReferrer, activeUsers]);

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
    // Use byCountry as primary source (reliable country names), spread multiple users per country
    const globeVisitors = useMemo<GlobeVisitor[]>(() => {
        const visitors: GlobeVisitor[] = [];
        const usedCoords = new Set<string>();

        // Helper: check if city coords are geographically close to country coords (within ~15°)
        const isCityInCountry = (cityCoord: [number, number], countryCoord: [number, number]) => {
            const dLat = Math.abs(cityCoord[0] - countryCoord[0]);
            const dLng = Math.abs(cityCoord[1] - countryCoord[1]);
            return dLat < 20 && dLng < 30; // generous bounds for large countries
        };

        // First: try city-level pins from byCity (most precise)
        byCity.slice(0, 15).forEach((c: any, i: number) => {
            if (visitors.length >= 12) return;
            const cityStr = String(c.city ?? '');
            const countryStr = String(c.country ?? '');

            // Country coord is required — skip unknown countries
            const countryCoord = COUNTRY_COORDS[countryStr];
            if (!countryCoord) return;

            // Only use city coord if city is valid AND geographically within the country
            let coord = countryCoord;
            if (cityStr && !cityStr.startsWith('(')) {
                const cityCoord = CITY_COORDS[cityStr];
                if (cityCoord && isCityInCountry(cityCoord, countryCoord)) {
                    coord = cityCoord;
                }
            }

            const key = `${coord[0].toFixed(1)},${coord[1].toFixed(1)}`;
            let lat = coord[0];
            let lng = coord[1];
            if (usedCoords.has(key)) {
                // Fixed offset based on city/country hash (stable across re-renders)
                lat += (hashStr(cityStr + countryStr) % 100 - 50) / 100 * 3;
                lng += (hashStr(countryStr + cityStr) % 100 - 50) / 100 * 3;
            }
            usedCoords.add(key);

            const hash = hashStr(`${cityStr}-${countryStr}-${i}`);
            const name = `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash >> 4) % ANIMALS.length]}`;
            const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
            const warmth = predictWarmth(countryStr, device, i);

            visitors.push({
                lat, lng, name,
                country: countryStr,
                avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                avatarInitial: name.charAt(0).toUpperCase(),
                warmth,
                users: Number(c.users) || 1,
            });
        });

        // Second: fill remaining slots from byCountry (if cities didn't provide enough)
        if (visitors.length < 8) {
            byCountry.forEach((c: any, i: number) => {
                if (visitors.length >= 12) return;
                const countryStr = String(c.country ?? '');
                const coord = COUNTRY_COORDS[countryStr];
                if (!coord) return;

                // Skip if we already have a visitor from this country via city data
                const alreadyHas = visitors.some(v => v.country === countryStr);
                if (alreadyHas) return;

                const hash = hashStr(`${countryStr}-country-${i}`);
                const name = `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash >> 4) % ANIMALS.length]}`;
                const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
                const warmth = predictWarmth(countryStr, device, i);

                visitors.push({
                    lat: coord[0], lng: coord[1], name,
                    country: countryStr,
                    avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                    avatarInitial: name.charAt(0).toUpperCase(),
                    warmth,
                    users: Number(c.users) || 1,
                });
            });
        }

        return visitors;
    }, [byCity, byCountry, byDevice]);

    // ─── Estimated total value ───
    const estTotalValue = useMemo(() => {
        return Math.max(1, Math.round(activeUsers * 0.08));
    }, [activeUsers]);

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

    return (
        <RealtimeErrorBoundary>
        <div className="relative -mx-6 -mt-6 overflow-hidden select-none" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* ─── Mapbox GL Globe (replaces cobe globe + SVG map) ─── */}
            <div className="absolute inset-0">
                <RealtimeMapbox
                    ref={mapRef}
                    visitors={globeVisitors}
                    mapboxToken={MAPBOX_TOKEN}
                    byCountry={byCountry}
                    byCity={byCity}
                    autoPan={isAutoPanning}
                />
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
                <div className="bg-[rgba(20,20,30,0.95)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" style={{ minWidth: '320px', maxWidth: '400px' }}>

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

                        {/* Toolbar icons (matching DataFast: share, music, history, fullscreen) */}
                        <div className="flex items-center gap-0 ml-auto">
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Share">
                                <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Music">
                                <Music className="w-3.5 h-3.5" />
                            </button>
                            <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="History">
                                <History className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={toggleAutoPan}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition relative group ${isAutoPanning ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.08] text-zinc-500 hover:text-white'}`}
                                title={isAutoPanning ? 'Stop auto-panning' : 'Start auto-panning'}
                            >
                                <Navigation className="w-3.5 h-3.5" />
                                {/* Tooltip */}
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-zinc-800 text-[10px] text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                                    {isAutoPanning ? 'Stop auto-panning' : 'Auto-pan'}
                                </span>
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
                                        {ref.icon === 'referral' && <ExternalLink className="w-3 h-3 text-zinc-400" />}
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
                    className="w-10 h-10 rounded-xl bg-[rgba(20,20,30,0.7)] backdrop-blur-xl border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.1] transition"
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
                <div className="bg-[rgba(20,20,30,0.95)] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
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
                                    {/* DiceBear avatar with warmth indicator */}
                                    <div className="relative flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800" style={{ boxShadow: `0 0 0 2px ${item.warmth > 0.6 ? '#ef4444' : item.warmth > 0.4 ? '#f97316' : item.warmth > 0.25 ? '#eab308' : '#3b82f6'}` }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={getAvatarUrl(item.name)} alt="" className="w-full h-full" />
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#14141e] ${getWarmthDot(item.warmth)}`} />
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

            {/* ═══════════════════════════════════════════ */}
            {/* ─── BOTTOM-RIGHT: Powered By ─── */}
            {/* ═══════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="absolute bottom-4 right-4 z-20"
            >
                <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(20,20,30,0.9)] backdrop-blur-xl rounded-xl border border-white/[0.06]">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                        <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                        <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                    </svg>
                    <span className="text-[11px] text-zinc-400 font-medium">Powered by TrafficClaw</span>
                </div>
            </motion.div>
        </div>
        </RealtimeErrorBoundary>
    );
}
