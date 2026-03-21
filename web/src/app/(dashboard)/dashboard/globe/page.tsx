'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
    Share2, Music, History, Maximize2, Navigation, Monitor,
    Link2, ExternalLink, Copy, Check, Code2, Zap, Globe,
    ChevronRight, BookOpen, Server, Palette, DollarSign, Shield
} from 'lucide-react';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { GlobeVisitor, RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';

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
            <pre className="bg-zinc-950 border border-white/[0.06] rounded-xl p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-300">
                <code>{code}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/[0.08] text-[11px] text-zinc-400 hover:text-white transition opacity-0 group-hover:opacity-100"
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
    const mapRef = useRef<RealtimeMapboxHandle>(null);

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
        <div className="space-y-8 pb-12">
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

            {/* ══════════════════════════════════════════════════════ */}
            {/* ─── SECTION 1: LIVE DEMO ─── */}
            {/* ══════════════════════════════════════════════════════ */}
            <div className="relative w-full h-[400px] sm:h-[500px] lg:h-[600px] rounded-2xl overflow-hidden border border-[var(--card-border)]" style={{ background: '#080c18' }}>
                {/* Globe Component */}
                <div className="absolute inset-0">
                    <RealtimeGlobeMaplibre
                        ref={mapRef}
                        visitors={DEMO_VISITORS}
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
                        {/* Header: Logo + REAL-TIME */}
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

                        {/* Visitor count line */}
                        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                            <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                            <span className="text-[13px] text-zinc-300">
                                <span className="font-bold text-white">12</span> visitors on
                            </span>
                            <span className="text-[13px] font-bold text-white">your site</span>
                            <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">$1</span>)</span>
                        </div>

                        <div className="h-px bg-white/[0.05] mb-2" />

                        {/* Stats rows */}
                        <div className="space-y-2">
                            {/* Referrers */}
                            <div className="flex items-start gap-3">
                                <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Referrers</span>
                                <div className="flex flex-wrap gap-1">
                                    <div className="flex items-center gap-1 text-[12px]">
                                        <Link2 className="w-3 h-3 text-zinc-400" />
                                        <span className="text-zinc-300">Direct</span>
                                        <span className="text-zinc-500">(12)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Countries */}
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
                                    <button className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-zinc-400 hover:bg-white/[0.1] transition">
                                        +{DEMO_COUNTRIES.length - 4}
                                    </button>
                                </div>
                            </div>

                            {/* Devices */}
                            <div className="flex items-start gap-3">
                                <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                                <div className="flex flex-wrap gap-1.5">
                                    <div className="flex items-center gap-1 text-[12px]">
                                        <Monitor className="w-3 h-3 text-zinc-400" />
                                        <span className="text-zinc-300">Desktop</span>
                                        <span className="text-zinc-500">(12)</span>
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
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Share">
                            <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Sound">
                            <Music className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-8 h-8 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Timer">
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
                            {DEMO_ACTIVITY.map((item, i) => (
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
                {/* ─── BOTTOM-RIGHT: Powered By Badge ─── */}
                {/* ═══════════════════════════════════════════════ */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20"
                >
                    <div className="flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                            <rect x="2" y="10" width="4" height="8" rx="1" fill="#10b981" />
                            <rect x="8" y="6" width="4" height="12" rx="1" fill="#10b981" />
                            <rect x="14" y="2" width="4" height="16" rx="1" fill="#10b981" />
                        </svg>
                        <span className="text-[11px] text-zinc-400 font-medium">Powered by TrafficClaw</span>
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
  data-site-id="YOUR_SITE_ID"
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
  src="https://app.trafficclaw.com/embed/globe?site=YOUR_SITE_ID&theme=dark"
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
                        <div className="border border-white/[0.06] rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
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
