'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import {
    Share2, Music, History, Maximize2, Navigation, Monitor, Smartphone, Tablet,
    Link2, ExternalLink, Copy, Check, Code2, Zap, Globe,
    ChevronRight, ChevronUp, ChevronDown, BookOpen, Server, Palette, DollarSign, Shield, AlertTriangle
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { GlobeVisitor, RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import { useRealtimeData, useContainerStatus, usePropertyList } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import { COUNTRY_COORDS, CITY_COORDS } from '@/components/analytics/RealtimeGlobe';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

// ─── DiceBear avatar URL (matching globe markers) ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

// ─── Demo visitors spread across the world ───
const DEMO_VISITORS: GlobeVisitor[] = [
    { id: '1', name: 'slate crane', country: 'Dominican Republic', lat: 18.73, lng: -70.16, warmth: 0.3, avatarColor: '#d97706', avatarInitial: 'S' },
    { id: '2', name: 'moss tiger', country: 'United States', lat: 37.09, lng: -95.71, warmth: 0.7, avatarColor: '#059669', avatarInitial: 'M' },
    { id: '3', name: 'sage egret', country: 'Kazakhstan', lat: 48.02, lng: 66.92, warmth: 0.25, avatarColor: '#7c3aed', avatarInitial: 'S' },
    { id: '4', name: 'bronze owl', country: 'India', lat: 20.59, lng: 78.96, warmth: 0.5, avatarColor: '#0891b2', avatarInitial: 'B' },
    { id: '5', name: 'coral falcon', country: 'Netherlands', lat: 52.13, lng: 5.29, warmth: 0.65, avatarColor: '#e11d48', avatarInitial: 'C' },
    { id: '6', name: 'golden koala', country: 'Australia', lat: -25.27, lng: 133.77, warmth: 0.4, avatarColor: '#ca8a04', avatarInitial: 'G' },
    { id: '7', name: 'indigo finch', country: 'Brazil', lat: -14.23, lng: -51.92, warmth: 0.35, avatarColor: '#4f46e5', avatarInitial: 'I' },
    { id: '8', name: 'ruby wolf', country: 'Japan', lat: 36.20, lng: 138.25, warmth: 0.8, avatarColor: '#dc2626', avatarInitial: 'R' },
    { id: '9', name: 'amber fox', country: 'United Kingdom', lat: 55.37, lng: -3.43, warmth: 0.6, avatarColor: '#d97706', avatarInitial: 'A' },
    { id: '10', name: 'jade panda', country: 'Canada', lat: 56.13, lng: -106.34, warmth: 0.55, avatarColor: '#059669', avatarInitial: 'J' },
    { id: '11', name: 'silver hawk', country: 'Germany', lat: 51.16, lng: 10.45, warmth: 0.7, avatarColor: '#6b7280', avatarInitial: 'S' },
    { id: '12', name: 'violet crane', country: 'South Korea', lat: 35.90, lng: 127.76, warmth: 0.45, avatarColor: '#9333ea', avatarInitial: 'V' },
];

// ─── Demo activity feed items ───
interface DemoActivityItem {
    id: string;
    name: string;
    country: string;
    page: string;
    event: 'visited' | 'exited to';
    exitUrl?: string;
    timestamp: number;
    warmth: number;
    estValue: string;
    confidence: number;
}

const DEMO_ACTIVITY: DemoActivityItem[] = [
    { id: 'a1', name: 'moss tiger', country: 'United States', page: '/dashboard/analytics', event: 'visited', timestamp: Date.now() - 8000, warmth: 0.7, estValue: '$2.45', confidence: 82 },
    { id: 'a2', name: 'ruby wolf', country: 'Japan', page: '/pricing', event: 'visited', timestamp: Date.now() - 24000, warmth: 0.8, estValue: '$3.10', confidence: 88 },
    { id: 'a3', name: 'coral falcon', country: 'Netherlands', page: '', event: 'exited to', exitUrl: 'github.com/trafficclaw', timestamp: Date.now() - 41000, warmth: 0.65, estValue: '$1.80', confidence: 75 },
    { id: 'a4', name: 'silver hawk', country: 'Germany', page: '/docs/api', event: 'visited', timestamp: Date.now() - 63000, warmth: 0.7, estValue: '$2.60', confidence: 80 },
];

// ─── Demo country breakdown ───
const DEMO_COUNTRIES = [
    { country: 'United States', users: 2 },
    { country: 'Brazil', users: 1 },
    { country: 'Canada', users: 1 },
    { country: 'India', users: 1 },
    { country: 'Japan', users: 1 },
    { country: 'United Kingdom', users: 1 },
    { country: 'Germany', users: 1 },
    { country: 'Netherlands', users: 1 },
    { country: 'Australia', users: 1 },
    { country: 'South Korea', users: 1 },
    { country: 'Kazakhstan', users: 1 },
    { country: 'Dominican Republic', users: 1 },
];

// ─── Anonymous names (adjective + animal, matching realtime page) ───
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

// ─── Warmth color helpers ───
function getWarmthDot(warmth: number): string {
    if (warmth > 0.6) return 'bg-red-500';
    if (warmth > 0.4) return 'bg-orange-400';
    if (warmth > 0.25) return 'bg-yellow-400';
    return 'bg-blue-400';
}

function getWarmthRing(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

// ─── Code block with copy button ───
function CodeBlock({ code, language = 'html' }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [code]);

    return (
        <div className="relative group">
            <pre className="bg-zinc-950 border border-white/[0.06] rounded-xl p-3 sm:p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-300">
                <code>{code}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/[0.08] text-[11px] text-zinc-400 hover:text-white transition sm:opacity-0 sm:group-hover:opacity-100"
            >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}

export default function GlobeApiPage() {
    const [mounted, setMounted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAutoPanning, setIsAutoPanning] = useState(false);
    const [showMobileFeed, setShowMobileFeed] = useState(false);
    const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
    const mapRef = useRef<RealtimeMapboxHandle>(null);

    // ─── Real GA4 data hooks ───
    const { selectedProperty } = useRegistration();
    const { hasGoogleConnection } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const propertyToUse = selectedProperty || (properties.length > 0 ? properties[0].property : '');
    const showNoPropertiesBanner = hasGoogleConnection && !propsLoading && properties.length === 0;
    const { data: realtimeData } = useRealtimeData(propertyToUse, hasGoogleConnection);

    // ─── Data extraction (real GA4 or empty) ───
    const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : 0;
    const byCountry: any[] = Array.isArray(realtimeData?.byCountry) ? realtimeData.byCountry : [];
    const byCity: any[] = Array.isArray(realtimeData?.byCity) ? realtimeData.byCity : [];
    const byDevice: any[] = Array.isArray(realtimeData?.byDevice) ? realtimeData.byDevice : [];
    const byPage: any[] = Array.isArray(realtimeData?.byPage) ? realtimeData.byPage : [];
    const hasRealData = hasGoogleConnection && !!realtimeData && activeUsers > 0;

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

    // ─── Globe visitors from real data ───
    const realGlobeVisitors = useMemo<GlobeVisitor[]>(() => {
        if (!hasRealData) return [];
        const visitors: GlobeVisitor[] = [];
        const usedKeys = new Set<string>();

        const isCityInCountry = (cityCoord: [number, number], countryCoord: [number, number]) => {
            const dLat = Math.abs(cityCoord[0] - countryCoord[0]);
            const dLng = Math.abs(cityCoord[1] - countryCoord[1]);
            return dLat < 20 && dLng < 30;
        };

        const makeName = (seed: string) => {
            const h = hashStr(seed);
            return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >> 4) % ANIMALS.length]}`;
        };

        const sortedCities = [...byCity].sort((a: any, b: any) => {
            const ka = `${a.country}-${a.city}`;
            const kb = `${b.country}-${b.city}`;
            return ka.localeCompare(kb);
        });

        sortedCities.slice(0, 15).forEach((c: any) => {
            if (visitors.length >= 12) return;
            const cityStr = String(c.city ?? '');
            const countryStr = String(c.country ?? '');
            const countryCoord = COUNTRY_COORDS[countryStr];
            if (!countryCoord) return;

            let coord = countryCoord;
            if (cityStr && !cityStr.startsWith('(')) {
                const cityCoord = CITY_COORDS[cityStr];
                if (cityCoord && isCityInCountry(cityCoord, countryCoord)) {
                    coord = cityCoord;
                }
            }

            const key = `${coord[0].toFixed(1)},${coord[1].toFixed(1)}`;
            const cityHash = hashStr(`${cityStr}-${countryStr}`);
            let lat = coord[0];
            let lng = coord[1];
            if (usedKeys.has(key)) {
                const angle = (cityHash % 360) * (Math.PI / 180);
                const radius = 1.2 + (cityHash % 5) * 0.6;
                lat += Math.cos(angle) * radius;
                lng += Math.sin(angle) * radius;
            }
            usedKeys.add(key);

            const seed = `${cityStr}-${countryStr}`;
            const name = makeName(seed);
            const hash = hashStr(seed);
            const warmth = predictWarmth(countryStr, 'desktop', 0);

            visitors.push({
                id: seed, lat, lng, name, country: countryStr,
                avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                avatarInitial: name.charAt(0).toUpperCase(),
                warmth,
            });
        });

        if (visitors.length < 8) {
            const sortedCountries = [...byCountry].sort((a: any, b: any) =>
                String(a.country ?? '').localeCompare(String(b.country ?? ''))
            );
            sortedCountries.forEach((c: any) => {
                if (visitors.length >= 12) return;
                const countryStr = String(c.country ?? '');
                const coord = COUNTRY_COORDS[countryStr];
                if (!coord) return;
                if (visitors.some(v => v.country === countryStr)) return;

                const seed = `${countryStr}-country`;
                const name = makeName(seed);
                const hash = hashStr(seed);
                const warmth = predictWarmth(countryStr, 'desktop', 0);

                visitors.push({
                    id: seed, lat: coord[0], lng: coord[1], name, country: countryStr,
                    avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                    avatarInitial: name.charAt(0).toUpperCase(),
                    warmth,
                });
            });
        }

        return visitors;
    }, [hasRealData, byCity, byCountry]);

    // ─── Activity feed from real data ───
    const realActivityFeed = useMemo<DemoActivityItem[]>(() => {
        if (!hasRealData) return [];
        const feedCounts = new Map<string, number>();
        return byCity.slice(0, 20).map((c: any, i: number) => {
            const cityStr = String(c.city ?? 'Unknown');
            const countryStr = String(c.country ?? 'Unknown');
            const feedKey = `${cityStr}-${countryStr}`;
            const count = feedCounts.get(feedKey) || 0;
            feedCounts.set(feedKey, count + 1);
            const hash = hashStr(`${feedKey}-${count}`);
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
                page: isExit ? '' : page,
                event: isExit ? 'exited to' as const : 'visited' as const,
                exitUrl: isExit ? 'apps.apple.com/app/...' : undefined,
                timestamp: Date.now() - i * 12000,
                warmth,
                estValue: `$${estVal}`,
                confidence,
            };
        });
    }, [hasRealData, byCity, byPage, byDevice]);

    // ─── Country breakdown from real data ───
    const realCountries = useMemo(() => {
        if (!hasRealData) return [];
        return byCountry.map((c: any) => ({
            country: String(c.country ?? ''),
            users: Number(c.users) || 0,
        }));
    }, [hasRealData, byCountry]);

    // ─── Estimated total value ───
    const estTotalValue = useMemo(() => {
        return Math.max(1, Math.round(activeUsers * 0.08));
    }, [activeUsers]);

    // ─── Select real or demo data ───
    const displayVisitors = hasRealData ? realGlobeVisitors : DEMO_VISITORS;
    const displayActivity = hasRealData ? realActivityFeed : DEMO_ACTIVITY;
    const displayCountries = hasRealData ? realCountries : DEMO_COUNTRIES;
    const displayActiveUsers = hasRealData ? activeUsers : DEMO_VISITORS.length;
    const displayEstValue = hasRealData ? estTotalValue : 1;

    useEffect(() => { setMounted(true); }, []);

    const toggleAutoPan = useCallback(() => {
        if (mapRef.current) {
            const newVal = mapRef.current.toggleAutoPan();
            setIsAutoPanning(newVal);
        }
    }, []);

    const handleAutoPanChange = useCallback((enabled: boolean) => {
        setIsAutoPanning(enabled);
    }, []);

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

    const formatTimeAgo = useCallback((ts: number) => {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 10) return 'a few seconds ago';
        if (s < 60) return `${s} seconds ago`;
        const m = Math.floor(s / 60);
        return `${m} minute${m > 1 ? 's' : ''} ago`;
    }, []);

    if (!mounted) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-zinc-500 text-sm">Loading Globe API demo...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-8 pb-6 sm:pb-12">
            {/* ─── Page Header ─── */}
            <div>
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
                    <Globe className="w-4 h-4" />
                    <span>Globe API</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-zinc-300">Live Demo</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Globe API</h1>
                <p className="text-zinc-400 mt-1 text-sm sm:text-base">Embed a live visitor globe on your website. Real-time analytics visualization powered by TrafficClaw.</p>
            </div>

            {/* ─── No-Properties Banner ─── */}
            {showNoPropertiesBanner && (
                <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-white mb-1">Showing Demo Data</h3>
                            <p className="text-[13px] text-zinc-400 mb-3">
                                Your Google account doesn&apos;t have any GA4 properties. Connect a different account to see live visitor data.
                            </p>
                            <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                    onClick={() => signIn('google', { callbackUrl: '/dashboard/globe' }, { prompt: 'select_account consent' })}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium hover:bg-amber-500/15 transition"
                                >
                                    Connect Different Account
                                </button>
                                <a
                                    href="https://analytics.google.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-zinc-400 hover:text-zinc-300 transition"
                                >
                                    Set up GA4 &rarr;
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* ─── SECTION 1: LIVE DEMO ─── */}
            {/* ══════════════════════════════════════════════════════ */}
            <div className="relative w-full h-[60vh] min-h-[320px] max-h-[500px] sm:h-[500px] sm:min-h-0 sm:max-h-none lg:h-[600px] rounded-2xl border border-[var(--card-border)]" style={{ background: '#080c18' }}>
                {/* Globe Component */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                    <RealtimeGlobeMaplibre
                        ref={mapRef}
                        visitors={displayVisitors}
                        autoPan={isAutoPanning}
                        onAutoPanChange={handleAutoPanChange}
                    />
                </div>

                {/* ═══════════════════════════════════════════════ */}
                {/* ─── TOP-LEFT: Stats Panel ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20"
                >
                    <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/10 max-w-[280px] sm:max-w-xs">
                        {/* Mobile: Compact toggle bar */}
                        <button
                            className="flex sm:hidden items-center gap-2 w-full text-left"
                            onClick={() => setMobileStatsOpen(!mobileStatsOpen)}
                        >
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                                <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                                <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                            </svg>
                            <span className="text-[13px] font-bold text-white tracking-tight">TrafficClaw</span>
                            <div className="w-px h-3.5 bg-zinc-600/50" />
                            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                            </span>
                            <span className="text-[12px] text-zinc-300">{displayActiveUsers} visitors</span>
                            <span className="ml-auto">
                                {mobileStatsOpen ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
                            </span>
                        </button>

                        {/* Desktop: Full header */}
                        <div className="hidden sm:flex items-center gap-2 mb-2">
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
                        </div>

                        {/* Expandable content (desktop: always visible, mobile: toggle) */}
                        <div className={`${mobileStatsOpen ? '' : 'hidden'} sm:block`}>
                        {/* Visitor count line */}
                        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                            <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                            <span className="text-[13px] text-zinc-300">
                                <span className="font-bold text-white">{displayActiveUsers}</span> visitors on
                            </span>
                            <span className="text-[13px] font-bold text-white">{hasRealData ? 'your site' : 'your site'}</span>
                            <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">${displayEstValue}</span>)</span>
                        </div>

                        <div className="h-px bg-white/[0.05] mb-2" />

                        {/* Stats rows */}
                        <div className="space-y-2">
                            {/* Referrers */}
                            <div className="flex items-start gap-3">
                                <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Referrers</span>
                                <div className="flex flex-wrap gap-1">
                                    {hasRealData ? referrerBreakdown.map((ref) => (
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
                                    )) : (
                                        <div className="flex items-center gap-1 text-[12px]">
                                            <Link2 className="w-3 h-3 text-zinc-400" />
                                            <span className="text-zinc-300">Direct</span>
                                            <span className="text-zinc-500">({displayActiveUsers})</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Countries */}
                            <div className="flex items-start gap-3">
                                <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Countries</span>
                                <div className="flex flex-wrap gap-1">
                                    {displayCountries.slice(0, 4).map((c, i) => (
                                        <div key={i} className="flex items-center gap-1 text-[12px]">
                                            <CountryFlag country={c.country} />
                                            <span className="text-zinc-300">{c.country}</span>
                                            <span className="text-zinc-500">({c.users})</span>
                                        </div>
                                    ))}
                                    {displayCountries.length > 4 && (
                                        <button className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-zinc-400 hover:bg-white/[0.1] transition">
                                            +{displayCountries.length - 4}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Devices — hidden on mobile for compact view */}
                            <div className="hidden sm:flex items-start gap-3">
                                <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {hasRealData ? byDevice.map((d: any, i: number) => {
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
                                    }) : (
                                        <div className="flex items-center gap-1 text-[12px]">
                                            <Monitor className="w-3 h-3 text-zinc-400" />
                                            <span className="text-zinc-300">Desktop</span>
                                            <span className="text-zinc-500">({displayActiveUsers})</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </motion.div>

                {/* ═══════════════════════════════════════════════ */}
                {/* ─── TOP-RIGHT: Controls ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20"
                >
                    <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl p-1 border border-white/10">
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" title="Share">
                            <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" title="Sound">
                            <Music className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" title="Timer">
                            <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={toggleAutoPan}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isAutoPanning ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.08] text-zinc-500 hover:text-white'}`}
                            title={isAutoPanning ? 'Stop auto-panning' : 'Auto-pan'}
                        >
                            <Navigation className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="w-8 h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition"
                            title="Fullscreen"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </motion.div>

                {/* ═══════════════════════════════════════════════ */}
                {/* ─── BOTTOM-LEFT: Activity Feed ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 max-w-[300px] sm:max-w-sm hidden sm:block"
                >
                    <div className="bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
                        <div className="max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                            {displayActivity.map((item, i) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.4 + i * 0.06 }}
                                    className="px-3 sm:px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group"
                                >
                                    <div className="flex items-start gap-2.5">
                                        {/* DiceBear avatar with warmth indicator */}
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

                                            {/* Timestamp + prediction */}
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

                {/* ═══════════════════════════════════════════════ */}
                {/* ─── MOBILE: Activity Feed Bottom Sheet ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <div className="sm:hidden">
                    {showMobileFeed ? (
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="absolute bottom-0 left-0 right-0 z-30 bg-black/85 backdrop-blur-xl rounded-t-2xl border-t border-x border-white/10"
                        >
                            <button
                                onClick={() => setShowMobileFeed(false)}
                                className="w-full flex flex-col items-center pt-2.5 pb-1 active:opacity-70"
                            >
                                <div className="w-8 h-1 rounded-full bg-zinc-600" />
                            </button>
                            <div className="flex items-center justify-between px-4 pb-2">
                                <span className="text-xs font-semibold text-zinc-300">Activity Feed</span>
                                <span className="text-[10px] text-zinc-500">{displayActivity.length} events</span>
                            </div>
                            <div className="max-h-[35vh] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {displayActivity.map((item) => (
                                    <div key={item.id} className="px-4 py-2.5 border-t border-white/[0.04]">
                                        <div className="flex items-start gap-2.5">
                                            <div className="relative flex-shrink-0 mt-0.5">
                                                <div
                                                    className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800"
                                                    style={{ boxShadow: `0 0 0 1.5px ${getWarmthRing(item.warmth)}` }}
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={getAvatarUrl(item.name)} alt="" className="w-full h-full" />
                                                </div>
                                                <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-black ${getWarmthDot(item.warmth)}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center flex-wrap gap-x-1 leading-snug">
                                                    <span className="text-[11px] font-bold text-white">{item.name}</span>
                                                    <CountryFlag country={item.country} />
                                                    <span className="text-[11px] text-zinc-500">{item.event}</span>
                                                    {item.event === 'visited' ? (
                                                        <span className="text-[11px] text-zinc-300 font-mono truncate">{item.page}</span>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-500 truncate">{item.exitUrl}</span>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-zinc-600">{formatTimeAgo(item.timestamp)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-white/[0.04]">
                                <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                                    <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                                    <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                                    <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                                </svg>
                                <a href="https://trafficclaw.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition">Powered by TrafficClaw</a>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            onClick={() => setShowMobileFeed(true)}
                            className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between px-3 py-2.5 bg-black/70 backdrop-blur-sm rounded-xl border border-white/10 active:bg-black/90 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                </span>
                                <span className="text-[11px] text-zinc-300 font-medium">{displayActivity.length} recent events</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                                    <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                                    <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                                    <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                                </svg>
                                <ChevronUp className="w-3 h-3 text-zinc-500" />
                            </div>
                        </motion.button>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════ */}
                {/* ─── BOTTOM-RIGHT: Powered By Badge ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 hidden sm:block"
                >
                    <div className="flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                            <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                            <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                            <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                        </svg>
                        <a href="https://trafficclaw.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 font-medium hover:text-zinc-300 transition">Powered by TrafficClaw</a>
                    </div>
                </motion.div>
            </div>

            {/* ══════════════════════════════════════════════════════ */}
            {/* ─── SECTION 2: DOCUMENTATION ─── */}
            {/* ══════════════════════════════════════════════════════ */}
            <div className="grid gap-6 lg:grid-cols-2">

                {/* ─── How to Use ─── */}
                <div className="lg:col-span-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">How to Use</h2>
                            <p className="text-sm text-zinc-500">Get the globe running on your site in two steps</p>
                        </div>
                    </div>

                    {!propertyToUse && (
                        <p className="text-xs text-zinc-500 italic">Select a GA4 property to auto-fill your site ID.</p>
                    )}

                    <div className="space-y-8">
                        {/* Step 1 */}
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">1</div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Add Tracking Script</h3>
                                    <p className="text-xs text-zinc-500">Place this snippet before the closing <code className="text-zinc-400 bg-zinc-800 px-1 rounded">&lt;/head&gt;</code> tag</p>
                                </div>
                            </div>
                            <CodeBlock
                                language="html"
                                code={`<!-- TrafficClaw Analytics -->
<script
  src="https://cdn.trafficclaw.com/tracker.js"
  data-site-id="${propertyToUse || 'YOUR_SITE_ID'}"
  data-api="https://api.trafficclaw.com"
  defer
></script>`}
                            />
                        </div>

                        {/* Step 2 */}
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">2</div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Embed Globe</h3>
                                    <p className="text-xs text-zinc-500">Add the iframe wherever you want the globe to appear</p>
                                </div>
                            </div>
                            <CodeBlock
                                language="html"
                                code={`<!-- TrafficClaw Realtime Globe -->
<iframe
  src="https://app.trafficclaw.com/embed/globe?site=${propertyToUse || 'YOUR_SITE_ID'}&theme=dark"
  width="100%"
  height="600"
  frameborder="0"
  style="border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);"
  allow="fullscreen"
></iframe>`}
                            />
                        </div>

                        {/* Status indicator */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                            </span>
                            <span className="text-sm text-emerald-300">API Status: <span className="font-semibold">Operational</span></span>
                            <span className="text-xs text-zinc-500 ml-auto">99.9% uptime</span>
                        </div>
                    </div>
                </div>

                {/* ─── API Documentation ─── */}
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                            <Server className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">API Documentation</h2>
                            <p className="text-sm text-zinc-500">Endpoints and parameters</p>
                        </div>
                    </div>

                    {/* Endpoint */}
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">GET</span>
                            <code className="text-sm text-zinc-300 font-mono">/api/globe/realtime</code>
                        </div>
                        <p className="text-sm text-zinc-500">Returns real-time visitor data for globe rendering. Streams via Server-Sent Events for live updates.</p>
                    </div>

                    {/* Parameters table */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Parameters</h3>
                        <div className="border border-white/[0.06] rounded-xl overflow-x-auto">
                            <table className="w-full text-sm min-w-[420px]">
                                <thead>
                                    <tr className="border-b border-white/[0.06] bg-zinc-900/50">
                                        <th className="text-left px-4 py-2.5 text-zinc-400 font-medium text-xs">Parameter</th>
                                        <th className="text-left px-4 py-2.5 text-zinc-400 font-medium text-xs">Type</th>
                                        <th className="text-left px-4 py-2.5 text-zinc-400 font-medium text-xs">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">site</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">string</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs">Your site ID (required)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">theme</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">string</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs"><code className="text-zinc-400 bg-zinc-800 px-1 rounded">dark</code> or <code className="text-zinc-400 bg-zinc-800 px-1 rounded">light</code> (default: dark)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">height</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">number</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs">Globe height in pixels (default: 600)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">showStats</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">boolean</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs">Show stats overlay (default: true)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">showFeed</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">boolean</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs">Show activity feed (default: true)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5"><code className="text-emerald-400 text-xs font-mono">token</code></td>
                                        <td className="px-4 py-2.5 text-zinc-500 text-xs">string</td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs">API key for authenticated access</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Customization options */}
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Customization</h3>
                        <div className="space-y-2.5">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/[0.04]">
                                <Palette className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <span className="text-sm font-medium text-zinc-300">Theme</span>
                                    <p className="text-xs text-zinc-500 mt-0.5">Supports <code className="text-zinc-400 bg-zinc-800 px-1 rounded">dark</code> and <code className="text-zinc-400 bg-zinc-800 px-1 rounded">light</code> themes. Automatically adapts to your site's color scheme.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/[0.04]">
                                <Maximize2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <span className="text-sm font-medium text-zinc-300">Size</span>
                                    <p className="text-xs text-zinc-500 mt-0.5">Fully responsive. Set <code className="text-zinc-400 bg-zinc-800 px-1 rounded">width=&quot;100%&quot;</code> for fluid layouts or use fixed pixel values. Minimum recommended: 400x300.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── Pricing ─── */}
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Pricing</h2>
                            <p className="text-sm text-zinc-500">Choose the plan that fits your needs</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Free tier */}
                        <div className="relative p-5 rounded-xl border border-white/[0.06] bg-zinc-900/30 hover:border-white/[0.1] transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-zinc-400" />
                                    <span className="text-base font-bold text-white">Free</span>
                                </div>
                                <span className="text-lg font-bold text-white">$0<span className="text-xs text-zinc-500 font-normal">/mo</span></span>
                            </div>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2 text-zinc-400">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>10,000 views/month</span>
                                </li>
                                <li className="flex items-center gap-2 text-zinc-400">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>Dark theme only</span>
                                </li>
                                <li className="flex items-center gap-2 text-zinc-400">
                                    <Shield className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                    <span>&quot;Powered by TrafficClaw&quot; branding required</span>
                                </li>
                            </ul>
                        </div>

                        {/* Pro tier */}
                        <div className="relative p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/30 transition-colors">
                            <div className="absolute -top-2.5 right-4">
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Popular</span>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-emerald-400" />
                                    <span className="text-base font-bold text-white">Pro</span>
                                </div>
                                <span className="text-lg font-bold text-white">$29<span className="text-xs text-zinc-500 font-normal">/mo</span></span>
                            </div>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2 text-zinc-300">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>100,000 views/month</span>
                                </li>
                                <li className="flex items-center gap-2 text-zinc-300">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>Custom theme &amp; colors</span>
                                </li>
                                <li className="flex items-center gap-2 text-zinc-300">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>No branding watermark</span>
                                </li>
                                <li className="flex items-center gap-2 text-zinc-300">
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span>Priority API access</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
