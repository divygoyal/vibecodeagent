'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
    ExternalLink,
    History,
    Link2,
    Maximize2,
    Monitor,
    Music,
    Navigation,
    Share2,
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import { AVATAR_COLORS, getWarmthDot, hashStr, type ActivityFeedItem, type GlobeVisitor } from '@/lib/globeUtils';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

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

const DEMO_COUNTRIES = DEMO_VISITORS.map((visitor) => ({ country: visitor.country, users: 1 }));

function withDemoAvatar(item: Omit<ActivityFeedItem, 'avatarSeed' | 'avatarColor' | 'avatarInitial'>): ActivityFeedItem {
    const avatarSeed = item.name;
    return {
        ...item,
        avatarSeed,
        avatarColor: AVATAR_COLORS[hashStr(avatarSeed) % AVATAR_COLORS.length],
        avatarInitial: item.name.charAt(0).toUpperCase(),
    };
}

const DEMO_ACTIVITY: ActivityFeedItem[] = [
    withDemoAvatar({ id: 'a1', name: 'moss tiger', country: 'United States', page: '/dashboard/analytics', event: 'visited', timestamp: Date.now() - 8000, warmth: 0.7, estValue: '$2.45', confidence: 82 }),
    withDemoAvatar({ id: 'a2', name: 'ruby wolf', country: 'Japan', page: '/pricing', event: 'visited', timestamp: Date.now() - 24000, warmth: 0.8, estValue: '$3.10', confidence: 88 }),
    withDemoAvatar({ id: 'a3', name: 'coral falcon', country: 'Netherlands', page: '', event: 'exited to', exitUrl: 'github.com/trafficclaw', timestamp: Date.now() - 41000, warmth: 0.65, estValue: '$1.80', confidence: 75 }),
    withDemoAvatar({ id: 'a4', name: 'silver hawk', country: 'Germany', page: '/docs/api', event: 'visited', timestamp: Date.now() - 63000, warmth: 0.7, estValue: '$2.60', confidence: 80 }),
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
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 10) return 'a few seconds ago';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
}

interface GlobeDemoSectionProps {
    className?: string;
}

export default function GlobeDemoSection({ className = '' }: GlobeDemoSectionProps) {
    const [isAutoPanning, setIsAutoPanning] = useState(false);
    const mapRef = useRef<RealtimeMapboxHandle>(null);

    const toggleAutoPan = useCallback(() => {
        if (!mapRef.current) return;
        const newVal = mapRef.current.toggleAutoPan();
        setIsAutoPanning(newVal);
    }, []);

    const handleAutoPanChange = useCallback((enabled: boolean) => {
        setIsAutoPanning(enabled);
    }, []);

    return (
        <div
            className={`flex flex-col relative w-full h-[60dvh] min-h-[420px] sm:block sm:h-[500px] lg:h-[600px] rounded-2xl border border-white/[0.06] overflow-hidden ${className}`.trim()}
            style={{ background: '#080c18' }}
        >
            <div className="relative flex-1 min-h-0 sm:absolute sm:inset-0 rounded-2xl overflow-hidden order-0">
                <div className="absolute inset-0">
                    <RealtimeGlobeMaplibre
                        ref={mapRef}
                        visitors={DEMO_VISITORS}
                        autoPan={isAutoPanning}
                        onAutoPanChange={handleAutoPanChange}
                        initialZoom={1.3}
                    />
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="relative z-10 flex-shrink-0 -order-1 sm:absolute sm:top-4 sm:left-4 sm:z-20"
            >
                <div className="p-3 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 sm:p-4 sm:max-w-xs">
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
                    </div>
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <span className="text-[13px] text-zinc-300">
                            <span className="font-bold text-white">{DEMO_VISITORS.length}</span> visitors on
                        </span>
                        <span className="text-[13px] font-bold text-white">your site</span>
                        <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">$1</span>)</span>
                    </div>
                    <div className="h-px bg-white/[0.05] mb-2" />
                    <div className="space-y-2">
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Referrers</span>
                            <div className="flex items-center gap-1 text-[12px]">
                                <Link2 className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-300">Direct</span>
                                <span className="text-zinc-500">({DEMO_VISITORS.length})</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Countries</span>
                            <div className="flex flex-wrap gap-1">
                                {DEMO_COUNTRIES.slice(0, 4).map((country, index) => (
                                    <div key={index} className="flex items-center gap-1 text-[12px]">
                                        <CountryFlag country={country.country} />
                                        <span className="text-zinc-300">{country.country}</span>
                                        <span className="text-zinc-500">({country.users})</span>
                                    </div>
                                ))}
                                <span className="w-5 h-5 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-[9px] text-zinc-400">+{DEMO_COUNTRIES.length - 4}</span>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-start gap-3">
                            <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                            <div className="flex items-center gap-1 text-[12px]">
                                <Monitor className="w-3 h-3 text-zinc-400" />
                                <span className="text-zinc-300">Desktop</span>
                                <span className="text-zinc-500">({DEMO_VISITORS.length})</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20"
            >
                <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl p-1 border border-white/10">
                    {/* Decorative buttons stay desktop-only — mobile keeps the bar tight to essentials. */}
                    <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" aria-label="Share"><Share2 className="w-3.5 h-3.5" /></button>
                    <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" aria-label="Sound"><Music className="w-3.5 h-3.5" /></button>
                    <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition" aria-label="History"><History className="w-3.5 h-3.5" /></button>
                    <button onClick={toggleAutoPan} aria-label={isAutoPanning ? 'Stop auto-panning' : 'Auto-pan'} className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition ${isAutoPanning ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.08] text-zinc-500 hover:text-white'}`}><Navigation className="w-4 h-4 sm:w-3.5 sm:h-3.5" /></button>
                    <button aria-label="Toggle fullscreen" className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition"><Maximize2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" /></button>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="relative z-10 flex-shrink-0 order-1 sm:absolute sm:bottom-4 sm:left-4 sm:z-20 max-w-full sm:max-w-sm"
            >
                <div className="bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
                    <div className="max-h-[40dvh] sm:max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                        {DEMO_ACTIVITY.map((item, index) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 + index * 0.06 }}
                                className="px-3 sm:px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group"
                            >
                                <div className="flex items-start gap-2.5">
                                    <div className="relative flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800" style={{ boxShadow: `0 0 0 2px ${getWarmthRing(item.warmth)}` }}>
                                            <Image src={getAvatarUrl(item.name)} alt="" width={24} height={24} className="w-full h-full" />
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
                                        <span className="text-[10px] text-zinc-600">{formatTimeAgo(item.timestamp)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

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
                    <span className="text-[11px] text-zinc-400 font-medium">Powered by <span className="text-emerald-400 font-semibold">TrafficClaw</span></span>
                </div>
            </motion.div>
        </div>
    );
}
