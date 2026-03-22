'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
    Globe, ArrowRight, Code2, Copy, Check, Navigation,
    Share2, Music, History, Maximize2, Monitor, Link2, ExternalLink,
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import {
    hashStr, predictWarmth, ADJECTIVES, ANIMALS, AVATAR_COLORS,
    convertCitiesToGlobeVisitors, convertToActivityFeed,
    getWarmthDot, type GlobeVisitor, type ActivityFeedItem,
} from '@/lib/globeUtils';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

// ─── Demo data ───
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

const DEMO_COUNTRIES = DEMO_VISITORS.map(v => ({ country: v.country, users: 1 }));

const DEMO_ACTIVITY: ActivityFeedItem[] = [
    { id: 'a1', name: 'moss tiger', country: 'United States', page: '/dashboard/analytics', event: 'visited', timestamp: Date.now() - 8000, warmth: 0.7, estValue: '$2.45', confidence: 82 },
    { id: 'a2', name: 'ruby wolf', country: 'Japan', page: '/pricing', event: 'visited', timestamp: Date.now() - 24000, warmth: 0.8, estValue: '$3.10', confidence: 88 },
    { id: 'a3', name: 'coral falcon', country: 'Netherlands', page: '', event: 'exited to', exitUrl: 'github.com/trafficclaw', timestamp: Date.now() - 41000, warmth: 0.65, estValue: '$1.80', confidence: 75 },
    { id: 'a4', name: 'silver hawk', country: 'Germany', page: '/docs/api', event: 'visited', timestamp: Date.now() - 63000, warmth: 0.7, estValue: '$2.60', confidence: 80 },
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

export default function GlobePublicPage() {
    const [isAutoPanning, setIsAutoPanning] = useState(false);
    const [copied, setCopied] = useState(false);
    const mapRef = useRef<RealtimeMapboxHandle>(null);

    const toggleAutoPan = useCallback(() => {
        if (mapRef.current) {
            const newVal = mapRef.current.toggleAutoPan();
            setIsAutoPanning(newVal);
        }
    }, []);

    const handleAutoPanChange = useCallback((enabled: boolean) => {
        setIsAutoPanning(enabled);
    }, []);

    const embedCode = `<iframe
  src="https://trafficclaw.com/embed/YOUR_SITE_ID?token=YOUR_TOKEN"
  width="100%" height="600" frameborder="0"
  style="border-radius: 16px;" allow="fullscreen"
></iframe>`;

    return (
        <div className="py-12 sm:py-20 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                {/* ─── Header ─── */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        <Globe className="w-3.5 h-3.5" />
                        GLOBE API
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                        Real-time visitor globe for{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">your website</span>
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-8">
                        Embed an interactive 3D globe showing live visitors from Google Analytics. Free to use, one iframe, no tracking scripts.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard/globe' })}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-emerald-500/25"
                        >
                            Get your embed code
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ─── Globe Demo (same as dashboard) ─── */}
                <div className="flex flex-col relative w-full h-[calc(100vh-200px)] sm:block sm:h-[500px] lg:h-[600px] rounded-2xl border border-white/[0.06] overflow-hidden mb-16" style={{ background: '#080c18' }}>
                    {/* Globe */}
                    <div className="relative flex-1 min-h-0 sm:absolute sm:inset-0 rounded-2xl overflow-hidden order-0">
                        <div className="absolute inset-0">
                            <RealtimeGlobeMaplibre
                                ref={mapRef}
                                visitors={DEMO_VISITORS}
                                autoPan={isAutoPanning}
                                onAutoPanChange={handleAutoPanChange}
                            />
                        </div>
                    </div>

                    {/* Stats panel (top-left) */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                        className="relative z-10 flex-shrink-0 -order-1 sm:absolute sm:top-4 sm:left-4 sm:z-20"
                    >
                        <div className="p-3 sm:bg-black/60 sm:backdrop-blur-sm sm:rounded-xl sm:p-4 sm:border sm:border-white/10 sm:max-w-xs">
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
                                        {DEMO_COUNTRIES.slice(0, 4).map((c, i) => (
                                            <div key={i} className="flex items-center gap-1 text-[12px]">
                                                <CountryFlag country={c.country} />
                                                <span className="text-zinc-300">{c.country}</span>
                                                <span className="text-zinc-500">({c.users})</span>
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

                    {/* Controls (top-right) */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 hidden sm:block">
                        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-xl p-1 border border-white/10">
                            <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition"><Share2 className="w-3.5 h-3.5" /></button>
                            <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition"><Music className="w-3.5 h-3.5" /></button>
                            <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] hidden sm:flex items-center justify-center text-zinc-500 hover:text-white transition"><History className="w-3.5 h-3.5" /></button>
                            <button onClick={toggleAutoPan} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isAutoPanning ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.08] text-zinc-500 hover:text-white'}`}><Navigation className="w-3.5 h-3.5" /></button>
                            <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition"><Maximize2 className="w-3.5 h-3.5" /></button>
                        </div>
                    </motion.div>

                    {/* Activity feed (bottom-left) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="relative z-10 flex-shrink-0 order-1 sm:absolute sm:bottom-4 sm:left-4 sm:z-20 max-w-full sm:max-w-sm"
                    >
                        <div className="sm:bg-black/60 sm:backdrop-blur-sm sm:rounded-xl sm:border sm:border-white/10 overflow-hidden">
                            <div className="max-h-[180px] sm:max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {DEMO_ACTIVITY.map((item, i) => (
                                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.06 }} className="px-3 sm:px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group">
                                        <div className="flex items-start gap-2.5">
                                            <div className="relative flex-shrink-0 mt-0.5">
                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800" style={{ boxShadow: `0 0 0 2px ${getWarmthRing(item.warmth)}` }}>
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
                                                <span className="text-[10px] text-zinc-600">{formatTimeAgo(item.timestamp)}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Powered by (bottom-right) */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 hidden sm:block">
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

                {/* ─── Embed Instructions ─── */}
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Get started in 2 minutes</h2>
                        <p className="text-zinc-400">Sign up, connect Google Analytics, and paste the iframe on your site.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Step 1 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">1</div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-white mb-1">Sign up and connect Google Analytics</h3>
                                <p className="text-sm text-zinc-500 mb-3">Sign in with GitHub, then connect your Google account to authorize GA4 access.</p>
                                <button onClick={() => signIn('google', { callbackUrl: '/dashboard/globe' })} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition">
                                    Sign up free <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">2</div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-white mb-1">Generate your embed token</h3>
                                <p className="text-sm text-zinc-500">Go to Globe API in the dashboard and click &quot;Generate Embed Token&quot;.</p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">3</div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-white mb-1">Paste the iframe on your website</h3>
                                <p className="text-sm text-zinc-500 mb-3">Copy the embed code and add it anywhere on your site.</p>
                                <div className="bg-[#0d1117] border border-white/[0.08] rounded-xl overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-2">
                                            <Code2 className="w-4 h-4 text-emerald-400" />
                                            <span className="text-xs text-zinc-500">embed.html</span>
                                        </div>
                                        <button onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-zinc-400 hover:text-white transition">
                                            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="p-4 text-[13px] leading-relaxed font-mono text-zinc-400 overflow-x-auto"><code>{embedCode}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
