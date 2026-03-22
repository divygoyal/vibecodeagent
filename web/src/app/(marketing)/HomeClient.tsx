'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { signIn, useSession } from 'next-auth/react';
import { getSafeRedirectUrl } from '@/lib/checkout';
import Link from 'next/link';
import { VideoPhoneFrame } from "@/components/VideoPhoneFrame";

import {
    Bot, BarChart3, Search, Zap, TrendingUp, Globe, Shield,
    ArrowRight, CheckCircle2, Star, Sparkles, Tag, Copy, Check,
    MousePointerClick, ArrowUpRight, ChevronRight, MessageSquare, Send, Loader2, AlertCircle, Mail,
    ScanSearch, Clock, Monitor, ExternalLink, Link2, Share2, Music, History, Navigation, Maximize2,
    Code2, Eye, Gauge, Users
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

import type { GlobeVisitor } from '@/components/analytics/RealtimeGlobe';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';

const RealtimeMapbox = dynamic(() => import('@/components/analytics/RealtimeMapbox'), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoiZGl2eWdveWFsIiwiYSI6ImNtbWc3OXY3OTBkeG8yb3NjZXhtdnphMzUifQ.hKvgr-e2sYAMbMq1PvgrAA';

/* ═══════════════════════════════════════
   FAKE DATA — realistic-looking sample data
   ═══════════════════════════════════════ */

const trafficData = [
    { date: 'Jan 1', users: 1240, sessions: 1890 },
    { date: 'Jan 8', users: 1580, sessions: 2340 },
    { date: 'Jan 15', users: 1390, sessions: 2100 },
    { date: 'Jan 22', users: 1820, sessions: 2780 },
    { date: 'Jan 29', users: 2100, sessions: 3200 },
    { date: 'Feb 5', users: 1950, sessions: 2950 },
    { date: 'Feb 12', users: 2340, sessions: 3580 },
    { date: 'Feb 19', users: 2680, sessions: 4100 },
    { date: 'Feb 26', users: 2450, sessions: 3800 },
    { date: 'Mar 5', users: 2890, sessions: 4420 },
    { date: 'Mar 12', users: 3150, sessions: 4810 },
    { date: 'Mar 19', users: 3420, sessions: 5200 },
];

const queryData = [
    { query: 'best crm software 2025', clicks: 892, impressions: 12400, ctr: 7.2, position: 3.2 },
    { query: 'saas analytics tool', clicks: 654, impressions: 8900, ctr: 7.3, position: 4.1 },
    { query: 'website performance monitor', clicks: 521, impressions: 15200, ctr: 3.4, position: 8.7 },
    { query: 'how to improve seo', clicks: 489, impressions: 22100, ctr: 2.2, position: 12.3 },
    { query: 'google analytics alternative', clicks: 445, impressions: 6700, ctr: 6.6, position: 5.4 },
];

const sourceData = [
    { name: 'Organic', value: 42, color: '#34d399' },
    { name: 'Direct', value: 28, color: '#22d3ee' },
    { name: 'Social', value: 18, color: '#a78bfa' },
    { name: 'Referral', value: 12, color: '#f472b6' },
];

/* Globe demo data — hardcoded, zero API calls */
const DEMO_VISITORS: GlobeVisitor[] = [
    { id: '1', lat: 37.77, lng: -122.42, name: 'coral falcon', country: 'United States', avatarColor: '#f87171', avatarInitial: 'CF', warmth: 0.8, users: 3 },
    { id: '2', lat: 51.51, lng: -0.13, name: 'jade owl', country: 'United Kingdom', avatarColor: '#34d399', avatarInitial: 'JO', warmth: 0.7, users: 2 },
    { id: '3', lat: 20.59, lng: 78.96, name: 'amber wolf', country: 'India', avatarColor: '#fbbf24', avatarInitial: 'AW', warmth: 0.5, users: 2 },
    { id: '4', lat: 35.69, lng: 139.69, name: 'silver crane', country: 'Japan', avatarColor: '#a78bfa', avatarInitial: 'SC', warmth: 0.65, users: 1 },
    { id: '5', lat: -33.87, lng: 151.21, name: 'rose finch', country: 'Australia', avatarColor: '#fb923c', avatarInitial: 'RF', warmth: 0.6, users: 1 },
    { id: '6', lat: 52.52, lng: 13.41, name: 'teal hawk', country: 'Germany', avatarColor: '#22d3ee', avatarInitial: 'TH', warmth: 0.55, users: 1 },
    { id: '7', lat: 1.35, lng: 103.82, name: 'bronze panda', country: 'Singapore', avatarColor: '#e879f9', avatarInitial: 'BP', warmth: 0.45, users: 1 },
    { id: '8', lat: 56.26, lng: 9.50, name: 'topaz crow', country: 'Denmark', avatarColor: '#4ade80', avatarInitial: 'TC', warmth: 0.4, users: 1 },
];

const DEMO_BY_COUNTRY = DEMO_VISITORS.map(v => ({ country: v.country, users: v.users }));

const DEMO_ACTIVITY = [
    { id: 'a1', name: 'coral falcon', country: 'United States', page: '500+ Agent Skills for Claude Code, Cursor & AI Assistants', event: 'visited' as const, warmth: 0.8, time: 'a few seconds ago', confidence: 82, estValue: '$2.40' },
    { id: 'a2', name: 'jade owl', country: 'United Kingdom', page: 'Your Site | 1,500+ MCP Servers, AI Rules', event: 'visited' as const, warmth: 0.7, time: '8 seconds ago', confidence: 74, estValue: '$1.80' },
    { id: 'a3', name: 'amber wolf', country: 'India', page: 'Best MCP Servers for Cursor IDE', event: 'visited' as const, warmth: 0.5, time: '15 seconds ago', confidence: 58, estValue: '$0.90' },
    { id: 'a4', name: 'silver crane', country: 'Japan', event: 'exited to' as const, exitUrl: 'apps.apple.com/app/...', warmth: 0.65, time: '24 seconds ago', confidence: 68, estValue: '$1.50' },
    { id: 'a5', name: 'rose finch', country: 'Australia', page: 'AI Coding Assistant Comparison 2026', event: 'visited' as const, warmth: 0.6, time: '31 seconds ago', confidence: 64, estValue: '$1.20' },
    { id: 'a6', name: 'teal hawk', country: 'Germany', page: 'How to Build Custom MCP Servers', event: 'visited' as const, warmth: 0.55, time: '45 seconds ago', confidence: 60, estValue: '$1.10' },
];

const pagePerformance = [
    { page: '/blog/seo-guide', views: 4521, bounce: 32 },
    { page: '/pricing', views: 3892, bounce: 45 },
    { page: '/features', views: 2845, bounce: 38 },
    { page: '/blog/analytics', views: 2234, bounce: 29 },
    { page: '/docs/getting-started', views: 1956, bounce: 22 },
];

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
    return (
        <section
            id={id}
            className={`relative ${className}`}
        >
            {children}
        </section>
    );
}

/* ═══════════════════════════════════════
   HERO SECTION
   ═══════════════════════════════════════ */

function Hero() {
    return (
        <section className="relative flex items-center justify-center pt-16 sm:pt-24 pb-8 sm:pb-16 overflow-hidden bg-black sm:min-h-screen"> {/* min-h-screen only on desktop */}
            {/* Background gradient meshes */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/[0.04] rounded-full blur-[128px]" />
                <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/[0.03] rounded-full blur-[128px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[128px]" />
            </div>

            <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center z-10">
                {/* Left Side: Marketing Copy */}
                <motion.div
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-3 sm:gap-6 lg:gap-8 order-1 text-center lg:text-left"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium w-fit mx-auto lg:mx-0 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        Early Access — Limited Spots
                    </div>

                    <h1 className="text-3xl sm:text-5xl lg:text-[5rem] font-bold tracking-tight leading-[1.05]">
                        <span className="block pb-2 text-white drop-shadow-md font-extrabold" style={{ textShadow: "0px 4px 40px rgba(52,211,153,0.2)" }}>
                            Talk to your traffic.
                        </span>
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent block pb-2">
                            Grow it together.
                        </span>
                    </h1>

                    <p className="text-sm sm:text-base lg:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto lg:mx-0 font-light">
                        Ask. Fix. Grow. <span className="text-white font-medium">Your traffic</span>, one conversation at a time.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center lg:justify-start pt-2 sm:pt-4">
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                            className="group px-5 sm:px-8 min-h-[44px] h-14 text-[15px] font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_32px_rgba(52,211,153,0.3)] transition-all duration-300 w-full sm:w-auto flex items-center justify-center flex-shrink-0"
                        >
                            Try Free — 10 AI Messages Included
                            <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <a
                            href="#ai-demo"
                            className="px-5 sm:px-8 min-h-[44px] h-14 text-[15px] font-medium text-zinc-300 border border-white/10 rounded-xl hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300 w-full sm:w-auto flex items-center justify-center backdrop-blur-sm whitespace-nowrap"
                        >
                            See AI in Action
                        </a>
                    </div>

                    {/* Social proof */}
                    <div className="flex flex-col gap-3 justify-center lg:justify-start pt-2">
                        <div className="flex items-center gap-3 justify-center lg:justify-start">
                            <div className="flex items-center gap-1">
                                {[1,2,3,4,5].map(i => (
                                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                                ))}
                            </div>
                            <span className="text-sm text-zinc-400">from early users</span>
                        </div>
                        <div className="flex items-center gap-2 justify-center lg:justify-start text-xs text-zinc-500">
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Read-only Google OAuth · Your data stays yours · Cancel anytime</span>
                        </div>
                    </div>
                </motion.div>

                {/* Right Side: The Simulation Component with Floating UI */}
                <div className="order-2 hidden lg:flex justify-center lg:justify-center relative lg:pl-12 w-full lg:h-[600px] items-center">

                    {/* Floating Element 1 (Traffic Spike) */}
                    <div
                        className="absolute hidden lg:flex flex-col gap-2 z-30 lg:-left-20 top-[10%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl cursor-pointer hover:border-emerald-500/30 transition-colors w-[180px]"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Traffic
                            </div>
                            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">+12%</span>
                        </div>
                        <div className="text-2xl font-bold text-white tracking-tight">24.5k</div>
                        {/* Mini Bar Chart */}
                        <div className="flex items-end gap-1.5 h-8 mt-1">
                            {[40, 30, 50, 40, 60, 80, 100].map((height, i) => (
                                <div
                                    key={i}
                                    className="w-full h-full bg-emerald-500 rounded-sm origin-bottom"
                                />
                            ))}
                        </div>

                        {/* Connecting Sweep Right */}
                        <svg
                            className="absolute pointer-events-none w-[70px] h-[80px] top-1/2 -right-[75px] -translate-y-1/2"
                            viewBox="0 0 70 80"
                        >
                            <defs>
                                <linearGradient id="grad-tl" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 0 10 C 35 10, 35 70, 70 70"
                                fill="none"
                                stroke="url(#grad-tl)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                            />
                        </svg>
                    </div>

                    {/* Floating Element 2 (Keyword Rank) */}
                    <div
                        className="absolute hidden lg:flex flex-col gap-3 z-30 lg:-left-8 bottom-[18%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl cursor-pointer hover:border-sky-500/30 transition-colors w-[200px]"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-zinc-400">Top Keyword</span>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Rank</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-white font-medium">"AI SEO Tool"</span>
                            <div className="flex items-center gap-1.5 bg-sky-500/10 px-2 py-1 rounded-md border border-sky-500/20">
                                <span className="text-sm font-bold text-sky-400">#1</span>
                                <TrendingUp className="w-3 h-3 text-sky-400" />
                            </div>
                        </div>

                        {/* Connecting Sweep Right-Up */}
                        <svg
                            className="absolute pointer-events-none w-[90px] h-[60px] top-1/2 -right-[95px] -translate-y-1/2"
                            viewBox="0 0 90 60"
                        >
                            <defs>
                                <linearGradient id="grad-bl" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 0 50 C 45 50, 45 10, 90 10"
                                fill="none"
                                stroke="url(#grad-bl)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                            />
                        </svg>
                    </div>

                    {/* Main Phone Frame */}
                    <div
                        className="relative z-20 flex justify-center"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-emerald-500/[0.05] rounded-[5rem] blur-3xl pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-cyan-500/[0.06] rounded-[5rem] blur-2xl pointer-events-none" />
                        <VideoPhoneFrame />
                    </div>

                    {/* Floating Element 3 (Site Health) */}
                    <div
                        className="absolute hidden lg:flex items-center gap-4 z-30 lg:-right-24 top-[25%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl cursor-pointer hover:border-purple-500/30 transition-colors"
                    >
                        <div className="relative w-12 h-12 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <path
                                    className="text-purple-500"
                                    strokeDasharray="100, 100"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="currentColor" strokeWidth="3"
                                />
                            </svg>
                            <span className="absolute text-xs font-bold text-white">98</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-white">Site Health</span>
                            <span className="text-xs text-purple-400">Looking great</span>
                        </div>

                        {/* Connecting Sweep Left */}
                        <svg
                            className="absolute pointer-events-none w-[50px] h-[60px] top-1/2 -left-[55px] -translate-y-1/2"
                            viewBox="0 0 50 60"
                        >
                            <defs>
                                <linearGradient id="grad-rt" x1="100%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 50 10 C 25 10, 25 50, 0 50"
                                fill="none"
                                stroke="url(#grad-rt)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                            />
                        </svg>
                    </div>

                    {/* Floating Element 4 (Alert) */}
                    <div
                        className="absolute hidden lg:flex flex-col gap-2 z-30 lg:-right-24 bottom-[30%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl max-w-[210px] cursor-pointer hover:border-rose-500/30 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <div className="relative flex h-6 w-6 items-center justify-center">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-20"></span>
                                <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
                                    <Zap className="w-3 h-3 text-rose-400" />
                                </div>
                            </div>
                            <span className="text-sm font-semibold text-white">Google Update</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-snug">
                            Core update detected. Your ranks are stable. See report.
                        </p>

                        {/* Connecting Sweep Left-Up */}
                        <svg
                            className="absolute pointer-events-none w-[30px] h-[40px] top-1/2 -left-[35px] -translate-y-1/2"
                            viewBox="0 0 30 40"
                        >
                            <defs>
                                <linearGradient id="grad-rb" x1="100%" y1="100%" x2="0%" y2="0%">
                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 30 30 C 15 30, 15 10, 0 10"
                                fill="none"
                                stroke="url(#grad-rb)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                            />
                        </svg>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ChatMessage({
    sender, avatar, children, delay = 0, isBot = false
}: {
    sender: string; avatar: string; children: React.ReactNode; delay?: number; isBot?: boolean;
}) {
    return (
        <div
            className="flex gap-3"
        >
            <div className="text-lg flex-shrink-0 mt-0.5">{avatar}</div>
            <div>
                <div className={`text-xs mb-1 ${isBot ? 'text-emerald-400' : 'text-zinc-500'}`}>{sender}</div>
                <div className="text-zinc-300 leading-relaxed">{children}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   FEATURES SECTION
   ═══════════════════════════════════════ */

function Features() {
    const features = [
        {
            icon: MessageSquare,
            title: 'AI Chat',
            description: 'Ask questions about your analytics in natural language. Get instant answers, charts, and actionable insights.',
            gradient: 'from-emerald-400 to-cyan-400',
            tag: 'Core',
        },
        {
            icon: Search,
            title: 'SEO Intelligence',
            description: 'Keyword gaps, content decay alerts, cannibalization detection, and AEO engine for AI search optimization.',
            gradient: 'from-cyan-400 to-blue-400',
            tag: 'Growth',
        },
        {
            icon: BarChart3,
            title: 'Analytics Dashboard',
            description: 'Real-time visitors, traffic trends, bounce rates, and conversion funnels — all in one overview.',
            gradient: 'from-violet-400 to-purple-400',
            tag: 'Insights',
        },
        {
            icon: ScanSearch,
            title: 'Site Audit',
            description: 'Deep page-level audits with performance scores, Core Web Vitals, and auto-fix suggestions.',
            gradient: 'from-rose-400 to-pink-400',
            tag: 'Quality',
        },
        {
            icon: Sparkles,
            title: 'Content Tools',
            description: 'AI-powered schema generator, blog writer, keyword researcher, and internal linking optimizer.',
            gradient: 'from-emerald-400 to-teal-400',
            tag: 'Create',
        },
    ];

    return (
        <Section id="features" className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        FEATURES
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Everything you need to{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            grow faster
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Stop switching between Google Analytics, Search Console, and your IDE.
                        TrafficClaw brings everything into one intelligent interface.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((feature, i) => (
                        <div
                            key={feature.title}
                            className="group relative p-4 sm:p-6 rounded-2xl bg-white/[0.02] backdrop-blur border border-white/[0.04] hover:border-emerald-500/15 transition-all duration-300"
                        >
                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                <feature.icon className="w-5 h-5 text-white" />
                            </div>

                            {/* Tag */}
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                                {feature.tag}
                            </div>

                            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                            <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   INTERACTIVE DEMO SECTION
   ═══════════════════════════════════════ */

function InteractiveDemo() {
    const [activeTab, setActiveTab] = useState<'analytics' | 'globe'>('globe');
    const [hasClickedGlobe, setHasClickedGlobe] = useState(true);

    return (
        <Section id="demo" className="py-12 sm:py-24 lg:py-32 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-cyan-400 mb-4">
                        LIVE PREVIEW
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Your AI-powered{' '}
                        <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                            command center
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        This is what your dashboard looks like. Interactive charts, real insights, zero confusion.
                    </p>

                    {/* View toggle — centered between heading and card */}
                    <div className="relative flex flex-col items-center mt-10">
                        <div className="relative">
                            {/* Glow behind toggle */}
                            <div className="absolute -inset-3 bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-violet-500/20 rounded-2xl blur-xl opacity-60" />

                            <div className="relative flex items-center bg-zinc-950/80 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-1.5 shadow-2xl shadow-black/50">
                                <button
                                    onClick={() => setActiveTab('analytics')}
                                    className="relative flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 overflow-hidden"
                                >
                                    {activeTab === 'analytics' && (
                                        <motion.div
                                            layoutId="demoTabIndicator"
                                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 border border-emerald-400/30 shadow-[0_0_24px_rgba(52,211,153,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
                                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <BarChart3 className={`w-4 h-4 relative z-10 transition-colors duration-200 ${activeTab === 'analytics' ? 'text-emerald-400' : 'text-zinc-600'}`} />
                                    <span className={`relative z-10 transition-colors duration-200 ${activeTab === 'analytics' ? 'text-white' : 'text-zinc-500'}`}>Analytics</span>
                                </button>
                                <button
                                    onClick={() => { setActiveTab('globe'); setHasClickedGlobe(true); }}
                                    className="relative flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 overflow-hidden"
                                >
                                    {activeTab === 'globe' && (
                                        <motion.div
                                            layoutId="demoTabIndicator"
                                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 border border-emerald-400/30 shadow-[0_0_24px_rgba(52,211,153,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
                                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <Globe className={`w-4 h-4 relative z-10 transition-colors duration-200 ${activeTab === 'globe' ? 'text-emerald-400' : 'text-zinc-600'}`} />
                                    <span className={`relative z-10 transition-colors duration-200 ${activeTab === 'globe' ? 'text-white' : 'text-zinc-500'}`}>Globe</span>
                                    {/* Pulsing dot to draw attention */}
                                    {!hasClickedGlobe && (
                                        <span className="relative z-10 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* "Try this" callout — hidden after first click */}
                        {!hasClickedGlobe && (
                            <div
                                className="mt-4 pointer-events-none"
                            >
                                <div
                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20"
                                >
                                    <span className="text-xs font-medium text-zinc-300">
                                        Try this <span className="text-amber-400">&#10024;</span>
                                    </span>
                                    <span className="text-xs text-emerald-400/80 font-medium">(people are addicted)</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Dashboard preview card */}
                <div
                    className="relative mt-8"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-violet-500/10 rounded-3xl blur-2xl" />

                    <div className="relative bg-[#050508] border border-white/[0.08] rounded-2xl overflow-hidden">
                        {/* Dashboard header */}
                        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.04]">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-sm font-medium text-white">
                                    {activeTab === 'analytics' ? 'Analytics Overview' : 'Real-Time Globe'}
                                </span>
                                <span className="text-xs text-zinc-500">acme-store.com</span>
                            </div>
                            <span className="px-2.5 py-1 rounded-md bg-white/[0.05] text-xs text-zinc-300">
                                {activeTab === 'analytics' ? 'Last 30 days' : 'REAL-TIME'}
                            </span>
                        </div>

                        {/* Content area */}
                        <AnimatePresence mode="wait">
                            {activeTab === 'analytics' ? (
                                <motion.div
                                    key="analytics"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {/* KPI Cards */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6">
                                        <KPICard label="Active Users" value="24,582" change="+22.4%" positive />
                                        <KPICard label="Search Clicks" value="8,965" change="+18.7%" positive />
                                        <KPICard label="Avg Position" value="7.1" change="-0.4%" positive />
                                        <KPICard label="AI Queries" value="1,247" change="+156%" positive />
                                    </div>

                                    {/* Charts row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 sm:px-6 pb-4 sm:pb-6">
                                        {/* Traffic chart - spans 2 cols */}
                                        <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-sm font-medium text-white">Traffic Trend</h3>
                                                <div className="flex gap-3 text-xs">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                        <span className="text-zinc-400">Users</span>
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                                        <span className="text-zinc-400">Sessions</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-[200px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={trafficData}>
                                                        <defs>
                                                            <linearGradient id="gradientUsers" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                                                                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                                            </linearGradient>
                                                            <linearGradient id="gradientSessions" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                                                                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                        <YAxis tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                                                        <Tooltip
                                                            contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px' }}
                                                            labelStyle={{ color: '#a1a1aa' }}
                                                        />
                                                        <Area type="monotone" dataKey="sessions" stroke="#22d3ee" strokeWidth={2} fill="url(#gradientSessions)" />
                                                        <Area type="monotone" dataKey="users" stroke="#34d399" strokeWidth={2} fill="url(#gradientUsers)" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* Traffic sources */}
                                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
                                            <h3 className="text-sm font-medium text-white mb-4">Traffic Sources</h3>
                                            <div className="h-[140px] flex items-center justify-center">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={sourceData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={40}
                                                            outerRadius={65}
                                                            paddingAngle={3}
                                                            dataKey="value"
                                                            strokeWidth={0}
                                                        >
                                                            {sourceData.map((entry, i) => (
                                                                <Cell key={i} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                {sourceData.map((s) => (
                                                    <div key={s.name} className="flex items-center gap-2 text-xs">
                                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                                        <span className="text-zinc-400">{s.name}</span>
                                                        <span className="text-zinc-300 ml-auto">{s.value}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top Queries table */}
                                    <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 sm:p-5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-sm font-medium text-white">Top Search Queries</h3>
                                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                    <Search className="w-3 h-3" /> From Google Search Console
                                                </span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-xs text-zinc-500 uppercase tracking-wider">
                                                            <th className="text-left pb-3 font-medium">Query</th>
                                                            <th className="text-right pb-3 font-medium">Clicks</th>
                                                            <th className="text-right pb-3 font-medium">Impressions</th>
                                                            <th className="text-right pb-3 font-medium">CTR</th>
                                                            <th className="text-right pb-3 font-medium">Position</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {queryData.map((row, i) => (
                                                            <tr key={i} className="border-t border-white/[0.04]">
                                                                <td className="py-2.5 text-zinc-300">{row.query}</td>
                                                                <td className="py-2.5 text-right text-emerald-400 font-medium">{row.clicks.toLocaleString()}</td>
                                                                <td className="py-2.5 text-right text-zinc-400">{row.impressions.toLocaleString()}</td>
                                                                <td className="py-2.5 text-right">
                                                                    <span className={row.ctr >= 5 ? 'text-emerald-400' : 'text-amber-400'}>{row.ctr}%</span>
                                                                </td>
                                                                <td className="py-2.5 text-right text-zinc-400">{row.position}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="globe"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="relative"
                                >
                                    {/* Globe view — stacked layout: stats above, globe middle, feed below */}
                                    <div className="flex flex-col relative h-[calc(100vh-200px)] sm:block sm:h-[400px] lg:h-[600px] overflow-hidden">
                                        {/* Mapbox GL Globe */}
                                        <div className="relative flex-1 min-h-0 order-0 sm:absolute sm:inset-0 overflow-hidden">
                                        <div className="absolute inset-0">
                                            <RealtimeMapbox
                                                visitors={DEMO_VISITORS}
                                                mapboxToken={MAPBOX_TOKEN}
                                                byCountry={DEMO_BY_COUNTRY}
                                                autoPan={false}
                                            />
                                        </div>
                                        </div>

                                        {/* ─── TOP-LEFT: Stats Panel ─── */}
                                        <div
                                            className="relative z-10 flex-shrink-0 -order-1 sm:absolute sm:top-4 sm:left-4 sm:z-20"
                                        >
                                            <div className="bg-[rgba(20,20,30,0.95)] sm:backdrop-blur-2xl sm:rounded-2xl sm:shadow-2xl sm:shadow-black/50 overflow-hidden sm:w-auto" style={{ minWidth: 0, maxWidth: '400px' }}>
                                                {/* Header: Logo | REAL-TIME | toolbar */}
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
                                                    <div className="hidden sm:flex items-center gap-0 ml-auto">
                                                        <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Share">
                                                            <Share2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Music">
                                                            <Music className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="History">
                                                            <History className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center transition" title="Auto-panning">
                                                            <Navigation className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button className="w-7 h-7 rounded-lg hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white transition" title="Fullscreen">
                                                            <Maximize2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Visitor count */}
                                                <div className="flex items-center gap-1.5 px-4 pb-2.5 flex-wrap">
                                                    <span className="relative flex h-2 w-2 flex-shrink-0">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                                    </span>
                                                    <span className="text-[13px] text-zinc-300">
                                                        <span className="font-bold text-white">8</span> visitors on
                                                    </span>
                                                    <span className="text-[13px] font-bold text-white">your site</span>
                                                    <span className="text-[13px] text-zinc-500">(est. value: <span className="text-emerald-400 font-semibold">$1</span>)</span>
                                                </div>

                                                <div className="h-px bg-white/[0.05] hidden sm:block" />

                                                {/* Stats: Referrers / Countries / Devices */}
                                                <div className="px-4 py-2.5 space-y-2 hidden sm:block">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Referrers</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            <div className="flex items-center gap-1 text-[12px]">
                                                                <Link2 className="w-3 h-3 text-zinc-400" />
                                                                <span className="text-zinc-300">Direct</span>
                                                                <span className="text-zinc-500">(8)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Countries</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {[
                                                                { country: 'United States', users: 3 },
                                                                { country: 'United Kingdom', users: 2 },
                                                                { country: 'India', users: 2 },
                                                            ].map((c, i) => (
                                                                <div key={i} className="flex items-center gap-1 text-[12px]">
                                                                    <CountryFlag country={c.country} />
                                                                    <span className="text-zinc-300">{c.country}</span>
                                                                    <span className="text-zinc-500">({c.users})</span>
                                                                </div>
                                                            ))}
                                                            <button className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-zinc-400 hover:bg-white/[0.1] transition">
                                                                +5
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[12px] text-zinc-500 w-[68px] flex-shrink-0 pt-0.5">Devices</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <div className="flex items-center gap-1 text-[12px]">
                                                                <Monitor className="w-3 h-3 text-zinc-400" />
                                                                <span className="text-zinc-300">Desktop</span>
                                                                <span className="text-zinc-500">(8)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ─── Activity Feed ─── */}
                                        <div
                                            className="relative z-10 flex-shrink-0 order-1 sm:absolute sm:bottom-4 sm:left-4 sm:z-20 sm:w-[360px] md:w-[440px]"
                                        >
                                            <div className="sm:bg-[rgba(20,20,30,0.95)] sm:backdrop-blur-2xl sm:rounded-2xl sm:shadow-2xl sm:shadow-black/50 overflow-hidden">
                                                <div className="max-h-[160px] sm:max-h-[280px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                                    {DEMO_ACTIVITY.map((item, i) => (
                                                        <div
                                                            key={item.id}
                                                            className="px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 group"
                                                        >
                                                            <div className="flex items-start gap-2.5">
                                                                <div className="relative flex-shrink-0 mt-0.5">
                                                                    <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800" style={{ boxShadow: `0 0 0 2px ${item.warmth > 0.6 ? '#ef4444' : item.warmth > 0.4 ? '#f97316' : item.warmth > 0.25 ? '#eab308' : '#3b82f6'}` }}>
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(item.name)}&backgroundColor=transparent&radius=50`} alt="" className="w-full h-full" />
                                                                    </div>
                                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#14141e] ${item.warmth > 0.6 ? 'bg-red-500' : item.warmth > 0.4 ? 'bg-orange-400' : item.warmth > 0.25 ? 'bg-yellow-400' : 'bg-blue-400'}`} />
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
                                                                        <span className="text-[10px] text-zinc-600">{item.time}</span>
                                                                        <span className="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            {item.confidence}% conf. &middot; {item.estValue}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ─── BOTTOM-RIGHT: Powered By ─── */}
                                        <div
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
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </Section>
    );
}

function KPICard({ label, value, change, positive }: { label: string; value: string; change: string; positive: boolean }) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            <div className="text-2xl font-bold text-white mb-1">{value}</div>
            <div className={`text-xs font-medium flex items-center gap-1 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                <TrendingUp className="w-3 h-3" />
                {change} vs last period
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   AI CHAT LIVE DEMO SECTION
   ═══════════════════════════════════════ */

function AIChatDemo() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const chatAreaRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(sectionRef, { once: false, amount: 0.3 });
    const [phase, setPhase] = useState(0);
    const [typedQuestion, setTypedQuestion] = useState('');
    const [showThinking, setShowThinking] = useState(false);
    const [toolCallPhase, setToolCallPhase] = useState(0);
    const [visibleSections, setVisibleSections] = useState(0);

    // Auto-scroll chat area to bottom as new content appears
    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [typedQuestion, showThinking, toolCallPhase, visibleSections]);

    const question = 'why is my traffic dropping';

    // Reset animation state when section leaves view so it replays on re-entry
    useEffect(() => {
        if (!isInView) {
            setPhase(0);
            setTypedQuestion('');
            setShowThinking(false);
            setToolCallPhase(0);
            setVisibleSections(0);
        }
    }, [isInView]);

    useEffect(() => {
        if (!isInView) return;
        // Phase 0: Type the user question
        let i = 0;
        const typeInterval = setInterval(() => {
            if (i <= question.length) {
                setTypedQuestion(question.slice(0, i));
                i++;
            } else {
                clearInterval(typeInterval);
                setPhase(1);
            }
        }, 45);
        return () => clearInterval(typeInterval);
    }, [isInView]);

    useEffect(() => {
        if (phase !== 1) return;
        // Phase 1: Pause after question sent
        const t1 = setTimeout(() => { setShowThinking(true); setPhase(2); }, 600);
        return () => clearTimeout(t1);
    }, [phase]);

    useEffect(() => {
        if (phase !== 2) return;
        // Phase 2: Thinking dots (800ms)
        const t2 = setTimeout(() => { setShowThinking(false); setPhase(3); }, 800);
        return () => clearTimeout(t2);
    }, [phase]);

    useEffect(() => {
        if (phase !== 3) return;
        // Phase 3: Tool call animation
        setToolCallPhase(1);
        const t1 = setTimeout(() => setToolCallPhase(2), 700);
        const t2 = setTimeout(() => setToolCallPhase(3), 1400);
        const t3 = setTimeout(() => setPhase(4), 1800);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [phase]);

    useEffect(() => {
        if (phase !== 4) return;
        // Phase 4: Reveal response sections one by one
        let s = 0;
        const revealInterval = setInterval(() => {
            s++;
            if (s <= 9) {
                setVisibleSections(s);
            } else {
                clearInterval(revealInterval);
            }
        }, 400);
        return () => clearInterval(revealInterval);
    }, [phase]);

    return (
        <Section id="ai-demo" className="py-12 sm:py-24 lg:py-32 px-4 sm:px-6">
            <div ref={sectionRef} className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        <MessageSquare className="w-3 h-3" /> LIVE DEMO
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Ask anything.{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Get verdicts.
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Our AI analyst doesn&apos;t give generic advice — it analyzes your real data and delivers actionable verdicts with evidence.
                    </p>
                </div>

                {/* Chat window mock */}
                <div className="relative rounded-2xl border border-white/[0.06] bg-[#050508] overflow-hidden shadow-2xl shadow-black/50">
                    {/* Chat header */}
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04] bg-[#0a0a0f]">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-black" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white">AI Analyst</div>
                            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online · antigravity.codes
                            </div>
                        </div>
                    </div>

                    {/* Chat messages area — fixed height to prevent layout shift */}
                    <div ref={chatAreaRef} className="p-5 space-y-4 relative h-[560px] sm:h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {/* Bot greeting */}
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                            <div className="bg-white/[0.03] border border-white/[0.04] rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%]">
                                <p className="text-sm text-zinc-300">
                                    <span className="text-amber-400">👋</span> Hey! I&apos;m your AI Analyst. I have your live analytics &amp; SEO data loaded.
                                    Ask me anything — I give <strong className="text-white">verdicts</strong>, not advice.
                                </p>
                            </div>
                        </div>

                        {/* User question - types in */}
                        {typedQuestion.length > 0 && (
                            <div className="flex justify-end">
                                <div className="bg-emerald-500/[0.12] border border-emerald-500/[0.15] rounded-2xl rounded-tr-md px-4 py-3 max-w-[70%]">
                                    <p className="text-sm text-white">{typedQuestion}{phase === 0 && <span className="inline-block w-0.5 h-4 bg-emerald-400 animate-pulse ml-0.5 align-middle" />}</p>
                                </div>
                            </div>
                        )}

                        {/* Thinking indicator */}
                        {showThinking && (
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.04] rounded-2xl rounded-tl-md px-4 py-3">
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        Analyzing search performance data...
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tool call animation */}
                        {toolCallPhase > 0 && visibleSections === 0 && (
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <div className="bg-white/[0.03] border border-white/[0.04] rounded-2xl rounded-tl-md px-4 py-3 space-y-2">
                                    <div className="text-xs text-zinc-500 font-medium">Using tools...</div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {toolCallPhase >= 2 ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                            <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                                        )}
                                        <span className={toolCallPhase >= 2 ? 'text-zinc-300' : 'text-zinc-500'}>Search Performance</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {toolCallPhase >= 3 ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                            <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                                        )}
                                        <span className={toolCallPhase >= 3 ? 'text-zinc-300' : 'text-zinc-500'}>Analytics Breakdown</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bot response - reveals section by section */}
                        {visibleSections > 0 && (
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <div className="flex-1 space-y-3 max-w-[90%]">
                                    {/* KPI Cards */}
                                    {visibleSections >= 1 && (
                                        <div
                                            className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {[
                                                { label: 'CLICKS', value: '8,965', icon: '📈', color: 'text-emerald-400' },
                                                { label: 'IMPRESSIONS', value: '228,974', icon: '👁', color: 'text-blue-400' },
                                                { label: 'AVG CTR', value: '3.9%', icon: '📊', color: 'text-violet-400' },
                                                { label: 'AVG POS', value: '7.1', icon: '🎯', color: 'text-amber-400' },
                                            ].map(kpi => (
                                                <div key={kpi.label} className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3 text-center">
                                                    <div className="text-xs mb-1">{kpi.icon}</div>
                                                    <div className={`text-base font-bold ${kpi.color}`}>{kpi.value}</div>
                                                    <div className="text-[8px] text-zinc-600 uppercase tracking-wider mt-0.5">{kpi.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Critical verdict */}
                                    {visibleSections >= 2 && (
                                        <div className="bg-red-500/[0.06] border border-red-500/[0.12] rounded-xl p-4">
                                            <div className="text-sm font-bold text-red-400 mb-2">🚨 CRITICAL: YOUR ORGANIC SEARCH IS COLLAPSING</div>
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                Your organic traffic is in a death spiral, down <span className="text-red-400 font-semibold">64.9%</span> in 28 days. I found a catastrophic event on <span className="text-white font-semibold">Feb 14</span> — a bad <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-red-300">robots.txt</code> deploy wiped out 23,000+ daily impressions overnight. Your top 5 MCP &amp; AI IDE queries have been pushed off page 1. <strong className="text-white">I know exactly what happened and how to fix it.</strong>
                                            </p>
                                        </div>
                                    )}

                                    {/* Evidence table */}
                                    {visibleSections >= 3 && (
                                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden">
                                            <div className="px-4 py-2 border-b border-white/[0.04]">
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">📋 Evidence — Daily Performance</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                    <thead>
                                                        <tr className="border-b border-white/[0.03]">
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Date</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Impressions</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Clicks</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">CTR</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr className="border-b border-white/[0.02]">
                                                            <td className="px-4 py-2 text-zinc-400">Feb 13</td>
                                                            <td className="px-4 py-2 text-zinc-300 font-mono">24,692</td>
                                                            <td className="px-4 py-2 text-zinc-300 font-mono">745</td>
                                                            <td className="px-4 py-2 text-zinc-300">3.82%</td>
                                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400">Normal</span></td>
                                                        </tr>
                                                        <tr className="border-b border-white/[0.02]">
                                                            <td className="px-4 py-2 text-zinc-400">Feb 14</td>
                                                            <td className="px-4 py-2 text-red-400 font-mono font-bold">638</td>
                                                            <td className="px-4 py-2 text-red-400 font-mono font-bold">59</td>
                                                            <td className="px-4 py-2 text-zinc-300">9.25%</td>
                                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-400">🔴 CRASH</span></td>
                                                        </tr>
                                                        <tr className="border-b border-white/[0.02]">
                                                            <td className="px-4 py-2 text-zinc-400">Feb 21</td>
                                                            <td className="px-4 py-2 text-amber-400 font-mono">892</td>
                                                            <td className="px-4 py-2 text-amber-400 font-mono">71</td>
                                                            <td className="px-4 py-2 text-zinc-300">7.96%</td>
                                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400">No Recovery</span></td>
                                                        </tr>
                                                        <tr className="border-b border-white/[0.02]">
                                                            <td className="px-4 py-2 text-zinc-400">Mar 03</td>
                                                            <td className="px-4 py-2 text-zinc-500 font-mono">1,569</td>
                                                            <td className="px-4 py-2 text-zinc-500 font-mono">103</td>
                                                            <td className="px-4 py-2 text-zinc-500">6.06%</td>
                                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-500/10 text-zinc-500">Flatlined</span></td>
                                                        </tr>
                                                        <tr>
                                                            <td className="px-4 py-2 text-zinc-400">Mar 14</td>
                                                            <td className="px-4 py-2 text-red-400 font-mono">1,241</td>
                                                            <td className="px-4 py-2 text-red-400 font-mono">87</td>
                                                            <td className="px-4 py-2 text-zinc-300">7.01%</td>
                                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-400">Declining</span></td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Affected queries */}
                                    {visibleSections >= 4 && (
                                        <div className="bg-violet-500/[0.04] border border-violet-500/[0.1] rounded-xl overflow-hidden">
                                            <div className="px-4 py-2 border-b border-white/[0.04]">
                                                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">🔍 Hardest Hit Queries</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                    <thead>
                                                        <tr className="border-b border-white/[0.03]">
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Query</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Before</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">After</th>
                                                            <th className="text-left px-4 py-2 text-zinc-600 font-medium">Change</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[
                                                            { query: 'best mcp servers 2025', before: '134/day', after: '3/day', change: '-97.8%' },
                                                            { query: 'cursor vs antigravity', before: '87/day', after: '2/day', change: '-97.7%' },
                                                            { query: 'next.js hydration error fix', before: '96/day', after: '5/day', change: '-94.8%' },
                                                            { query: 'how to setup mcp server', before: '71/day', after: '1/day', change: '-98.6%' },
                                                            { query: 'typescript strict mode rules', before: '58/day', after: '4/day', change: '-93.1%' },
                                                        ].map(row => (
                                                            <tr key={row.query} className="border-b border-white/[0.02]">
                                                                <td className="px-4 py-2 text-zinc-300 font-medium">{row.query}</td>
                                                                <td className="px-4 py-2 text-emerald-400 font-mono font-semibold">{row.before}</td>
                                                                <td className="px-4 py-2 text-red-400 font-mono font-bold">{row.after}</td>
                                                                <td className="px-4 py-2 text-red-400 font-semibold">{row.change}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Root cause */}
                                    {visibleSections >= 5 && (
                                        <div className="bg-emerald-500/[0.04] border border-emerald-500/[0.1] rounded-xl p-4">
                                            <div className="text-sm font-bold text-emerald-400 mb-2">✅ ROOT CAUSE FOUND: robots.txt BLOCKING GOOGLEBOT</div>
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                I checked your crawl stats — <span className="text-white font-semibold">Googlebot requests dropped to zero on Feb 14</span>. Your <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">robots.txt</code> was updated in a deploy that day and added <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-red-300">Disallow: /</code>, blocking all crawling. This is <strong className="text-white">confirmed</strong> — not a penalty, not an algorithm update. Your pages are still in Google&apos;s index but haven&apos;t been re-crawled since the block. <strong className="text-emerald-300">This is fully reversible.</strong>
                                            </p>
                                        </div>
                                    )}

                                    {/* Revenue Impact */}
                                    {visibleSections >= 6 && (
                                        <div className="bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl p-4">
                                            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">💰 Revenue Impact</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                                                <div>Daily Clicks Lost: <span className="text-red-400 font-semibold">~650/day</span></div>
                                                <div>Monthly Traffic Lost: <span className="text-red-400 font-semibold">~19,500 visits</span></div>
                                                <div>Conversion Value Lost: <span className="text-red-400 font-semibold">$3,120/mo</span> <span className="text-zinc-600">@ 2.4% CVR</span></div>
                                                <div>Each Week Delayed: <span className="text-red-400 font-semibold">$780 lost</span></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action steps */}
                                    {visibleSections >= 7 && (
                                        <div className="bg-emerald-500/[0.04] border border-emerald-500/[0.1] rounded-xl p-4">
                                            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">🔧 FIX: STEP-BY-STEP RECOVERY</div>
                                            <div className="space-y-2 text-xs text-zinc-400">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">1.</span>
                                                    <span><strong className="text-zinc-200">Revert robots.txt NOW</strong> — Remove <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-red-300">Disallow: /</code> and replace with <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">User-agent: * Allow: /</code></span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">2.</span>
                                                    <span><strong className="text-zinc-200">Verify the fix is live</strong> — Run <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">curl -I antigravity.codes/robots.txt</code> — clear CDN cache if using Cloudflare/Vercel</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">3.</span>
                                                    <span><strong className="text-zinc-200">Force Google to re-crawl</strong> — GSC &gt; URL Inspection &gt; paste homepage &gt; &quot;Request Indexing&quot;. Do this for your top 10 pages</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">4.</span>
                                                    <span><strong className="text-zinc-200">Re-submit sitemap</strong> — GSC &gt; Sitemaps &gt; submit <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">antigravity.codes/sitemap.xml</code></span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">5.</span>
                                                    <span><strong className="text-zinc-200">Audit the Feb 14 deploy</strong> — Run <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">git log --after=&quot;2025-02-13&quot; --before=&quot;2025-02-15&quot;</code> to find the commit</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-emerald-400 font-bold text-[10px] mt-0.5 flex-shrink-0">6.</span>
                                                    <span><strong className="text-zinc-200">Monitor re-crawl</strong> — GSC &gt; Crawl Stats. Googlebot requests should spike within 48-72 hours</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Recovery timeline */}
                                    {visibleSections >= 8 && (
                                        <div className="bg-cyan-500/[0.04] border border-cyan-500/[0.1] rounded-xl p-4">
                                            <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3">📅 Recovery Timeline</div>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                                    <span className="text-zinc-500 font-mono w-16 flex-shrink-0">Days 1-3</span>
                                                    <span className="text-zinc-300">Revert robots.txt &amp; re-submit sitemap</span>
                                                    <span className="text-emerald-400 text-[9px] font-semibold ml-auto flex-shrink-0">YOU ARE HERE</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full border border-zinc-600 flex-shrink-0" />
                                                    <span className="text-zinc-500 font-mono w-16 flex-shrink-0">Week 1-2</span>
                                                    <span className="text-zinc-400">Googlebot re-crawls all pages</span>
                                                    <span className="text-zinc-600 text-[9px] ml-auto flex-shrink-0">~30% restored</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full border border-zinc-600 flex-shrink-0" />
                                                    <span className="text-zinc-500 font-mono w-16 flex-shrink-0">Week 3-4</span>
                                                    <span className="text-zinc-400">Rankings return for top queries</span>
                                                    <span className="text-zinc-600 text-[9px] ml-auto flex-shrink-0">~60% restored</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full border border-zinc-600 flex-shrink-0" />
                                                    <span className="text-zinc-500 font-mono w-16 flex-shrink-0">Week 5-8</span>
                                                    <span className="text-zinc-400">Full recovery to pre-Feb 14 levels</span>
                                                    <span className="text-zinc-600 text-[9px] ml-auto flex-shrink-0">90-100%</span>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-zinc-600 mt-3">Since this is a crawl block (not a penalty), recovery is predictable once the fix is deployed.</p>
                                        </div>
                                    )}

                                    {/* Follow-up suggestions */}
                                    {visibleSections >= 9 && (
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                'Verify my robots.txt is fixed and Googlebot can crawl',
                                                'Show me which pages need re-indexing first',
                                                'Set up alerts so this never happens again',
                                            ].map(q => (
                                                <button key={q} className="px-3 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.12] text-[10px] text-emerald-400 hover:bg-emerald-500/[0.15] transition-colors">
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Chat input bar */}
                    <div className="px-5 py-3 border-t border-white/[0.04] bg-[#0a0a0f]">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-zinc-600">
                                Ask anything...
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                                <ArrowUpRight className="w-4 h-4 text-black" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom tagline + CTA */}
                <div className="text-center mt-8 space-y-4">
                    <p className="text-sm text-zinc-600">
                        Real response from TrafficClaw AI · Powered by your live Google Search Console data
                    </p>
                    <button
                        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                        className="group inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_32px_rgba(52,211,153,0.3)] transition-all duration-300"
                    >
                        Try This With Your Own Data
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   TESTIMONIALS
   ═══════════════════════════════════════ */

function Testimonials() {
    const reviews = [
        {
            name: 'Sarah Chen',
            role: 'Founder, SaaS startup',
            text: 'I asked "why did my traffic drop?" and the AI found a cannibalization issue between two blog posts in seconds. Would have taken me hours in GA4 + Search Console separately.',
            avatar: 'SC',
            stars: 5,
        },
        {
            name: 'Marcus R.',
            role: 'Solo founder',
            text: 'Paying $9/mo instead of $200+ for Semrush. I don\'t need 25 billion keywords — I need to know what\'s happening with MY site. TrafficClaw does exactly that.',
            avatar: 'MR',
            stars: 5,
        },
        {
            name: 'Priya Patel',
            role: 'Content marketer',
            text: 'The AI told me 4 of my top pages were losing position before I even noticed. It calculated I was losing ~$800/mo in organic value. Fixed it in a day.',
            avatar: 'PP',
            stars: 5,
        },
    ];

    return (
        <Section className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-amber-400 mb-4">
                        TESTIMONIALS
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Loved by{' '}
                        <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                            builders
                        </span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {reviews.map((review, i) => (
                        <div
                            key={i}
                            className="p-4 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] transition-all duration-300"
                        >
                            <div className="flex gap-0.5 mb-4">
                                {Array.from({ length: review.stars }).map((_, j) => (
                                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                                ))}
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed mb-6">&ldquo;{review.text}&rdquo;</p>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 border border-white/[0.06] flex items-center justify-center text-xs font-bold text-emerald-400">{review.avatar}</div>
                                <div>
                                    <div className="text-sm font-medium text-white">{review.name}</div>
                                    <div className="text-xs text-zinc-500">{review.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   PRICING DISCOUNT BANNER
   ═══════════════════════════════════════ */

function PricingDiscountBanner() {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText('NEWBEE20');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="max-w-2xl mx-auto mb-14 p-4 sm:p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.08] via-cyan-500/[0.06] to-emerald-500/[0.08]"
        >
            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-white mb-0.5">New User Discount</h3>
                    <p className="text-sm text-zinc-400">
                        Use code <strong className="text-emerald-400">NEWBEE20</strong> at checkout for <strong className="text-white">20% off</strong> your first month.
                    </p>
                </div>
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors font-mono font-bold text-emerald-400 text-sm tracking-wider cursor-pointer flex-shrink-0"
                >
                    NEWBEE20
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   PRICING SECTION — Monthly subscription plans
   ═══════════════════════════════════════ */

function Pricing() {
    const { data: session } = useSession();

    const handleCheckout = (productId: string) => {
        if (!session?.user?.email) {
            signIn('github', { callbackUrl: `/dashboard/plan` });
            return;
        }
        const checkoutUrl = `https://checkout.dodopayments.com/buy/${productId}?email=${encodeURIComponent(session.user.email)}&redirect_url=${encodeURIComponent(getSafeRedirectUrl('/dashboard/plan?upgraded=true'))}`;
        window.open(checkoutUrl, '_blank');
    };

    return (
        <Section id="pricing" className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-violet-400 mb-4">
                        PRICING
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Simple{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            monthly plans
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                        All website features are free. Pick a plan for AI-powered insights.<br />
                        <span className="text-emerald-400 font-medium">Credits reset each month — no rollover.</span>
                    </p>
                </div>

                {/* Free tier callout */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-sm">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 font-medium">Every new account gets <strong className="text-emerald-400">10 free messages</strong> to start</span>
                    </div>
                </div>

                {/* Discount promo */}
                <PricingDiscountBanner />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

                    {/* ── STARTER ── */}
                    <div className="relative p-4 sm:p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/[0.2] transition-all duration-300 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Zap className="w-5 h-5 text-cyan-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Starter</h3>
                        <p className="text-xs text-zinc-500 mb-5">Perfect for personal sites & side projects</p>

                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">$9</span>
                            <span className="text-sm text-zinc-500">/mo</span>
                        </div>
                        <div className="text-sm text-cyan-400 font-medium mb-6">50 AI credits/month</div>

                        <button onClick={() => handleCheckout('pdt_0NaLMLyWwiO355QaGlQwq')}
                            className="w-full py-2.5 sm:py-3 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold bg-white/[0.06] text-white hover:bg-white/[0.12] transition-all duration-200 mb-6 block text-center border border-white/[0.06] hover:border-cyan-500/[0.2] cursor-pointer">
                            Get Starter
                        </button>

                        <ul className="space-y-3">
                            {['50 AI messages per month', 'Full SEO & analytics dashboard', 'Site audit reports', 'AI content tools'].map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-xs sm:text-sm text-zinc-400">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-zinc-600" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ── GROWTH (highlighted) ── */}
                    <div className="relative p-4 sm:p-6 rounded-2xl border-2 border-emerald-500/[0.3] bg-gradient-to-b from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent transition-all duration-300 group md:-mt-2 md:mb-[-8px]">
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[10px] font-bold text-black uppercase tracking-wider shadow-lg shadow-emerald-500/20">
                            Most Popular
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Growth</h3>
                        <p className="text-xs text-zinc-500 mb-5">For growing businesses & content teams</p>

                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">$19</span>
                            <span className="text-sm text-zinc-500">/mo</span>
                        </div>
                        <div className="flex items-center gap-2 mb-6">
                            <span className="text-sm text-emerald-400 font-medium">150 AI credits/month</span>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15] font-semibold">3x Starter</span>
                        </div>

                        <button onClick={() => handleCheckout('pdt_0NaLMM1bLW9wAbmxcsebm')}
                            className="w-full py-2.5 sm:py-3 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all duration-200 mb-6 block text-center cursor-pointer">
                            Get Growth
                        </button>

                        <ul className="space-y-3">
                            {['150 AI messages per month', 'Everything in Starter', 'Priority AI responses', 'Advanced SEO intelligence', 'AI visibility tracking', 'AEO optimization tools'].map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-xs sm:text-sm text-zinc-300">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ── PRO (best value) ── */}
                    <div className="relative p-4 sm:p-6 pt-8 rounded-2xl border border-violet-500/[0.15] bg-gradient-to-b from-violet-500/[0.06] via-purple-500/[0.03] to-transparent hover:border-violet-500/[0.3] transition-all duration-300 group">
                        <div className="absolute -top-3.5 right-4 px-3 py-1 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg shadow-violet-500/20 z-10">
                            Best Value
                        </div>
                        {/* Subtle glow */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/[0.06] rounded-full blur-3xl pointer-events-none" />
                        <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400/20 to-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Shield className="w-5 h-5 text-violet-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">Pro</h3>
                            <p className="text-xs text-zinc-500 mb-5">For agencies & power users — everything unlocked</p>

                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">$29</span>
                                <span className="text-sm text-zinc-500">/mo</span>
                            </div>
                            <div className="flex items-center gap-2 mb-6">
                                <span className="text-sm text-violet-400 font-medium">300 AI credits/month</span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/[0.1] text-violet-400 border border-violet-500/[0.15] font-semibold">6x Starter</span>
                            </div>

                            <button onClick={() => handleCheckout('pdt_0NaLMM4r23kncRahthuyj')}
                                className="w-full py-2.5 sm:py-3 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-violet-400 to-purple-500 text-white hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-200 mb-6 block text-center cursor-pointer">
                                Get Pro
                            </button>

                            {/* Telegram Bot MVP Highlight */}
                            <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-sky-500/[0.08] to-violet-500/[0.08] border border-sky-500/[0.15]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                                        <Bot className="w-4 h-4 text-sky-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">Telegram Bot Included</div>
                                        <div className="text-[11px] text-zinc-400">Your AI SEO assistant, right in Telegram. Get alerts, ask questions, monitor traffic — all from your phone.</div>
                                    </div>
                                </div>
                            </div>

                            <ul className="space-y-3">
                                {['300 AI messages per month', 'Everything in Growth', 'Priority support', 'Custom content strategies', 'Early access to new features'].map((f, i) => (
                                    <li key={i} className="flex items-center gap-2.5 text-xs sm:text-sm text-zinc-300">
                                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-violet-400" />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                </div>

                {/* Bottom trust line */}
                <div className="text-center mt-10">
                    <p className="text-xs text-zinc-600">
                        Secure payments by Dodo Payments • Cancel anytime • Credits reset monthly
                    </p>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   ANIMATED STATS BAR
   ═══════════════════════════════════════ */

function useCountUp(end: number, duration = 2000) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: '-50px' });

    useEffect(() => {
        if (!isInView) return;
        let start = 0;
        const startTime = Date.now();
        const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [isInView, end, duration]);

    return { count, ref };
}

function StatsBar() {
    const s1 = useCountUp(50000);
    const s2 = useCountUp(15, 1500);
    const s3 = useCountUp(99, 1800);
    const s4 = useCountUp(2, 800);

    const stats = [
        { ref: s1.ref, value: `${s1.count.toLocaleString()}+`, label: 'Insights Generated', suffix: '' },
        { ref: s2.ref, value: `${s2.count}M+`, label: 'Queries Analyzed', suffix: '' },
        { ref: s3.ref, value: `${s3.count}.9%`, label: 'Uptime', suffix: '' },
        { ref: s4.ref, value: `<${s4.count} min`, label: 'Setup Time', suffix: '' },
    ];

    return (
        <section className="hidden sm:block py-16 px-4 sm:px-6 border-y border-white/[0.04]">
            <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-8">
                {stats.map((stat, i) => (
                    <div key={i} ref={stat.ref} className="text-center">
                        <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            {stat.value}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 uppercase tracking-wider font-medium">
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ═══════════════════════════════════════
   HOW IT WORKS
   ═══════════════════════════════════════ */

function HowItWorks() {
    const steps = [
        {
            step: '01',
            title: 'Connect Your Stack',
            description: 'Sign in with Google. We auto-detect your GA4 properties and Search Console sites instantly.',
            icon: Globe,
            gradient: 'from-emerald-400 to-emerald-600',
            details: ['Google Analytics 4', 'Search Console', '30-second setup'],
        },
        {
            step: '02',
            title: 'Explore Your Dashboard',
            description: 'See your analytics, SEO data, and AI-powered insights instantly. No configuration needed.',
            icon: BarChart3,
            gradient: 'from-cyan-400 to-blue-500',
            details: ['Real-time data', 'AI insights', 'Zero config'],
        },
        {
            step: '03',
            title: 'Grow with AI',
            description: 'Ask questions in natural language. Get keyword opportunities, fix SEO issues, and generate content — all through AI chat.',
            icon: TrendingUp,
            gradient: 'from-violet-400 to-purple-600',
            details: ['Natural language', 'Auto-fix', 'Content generation'],
        },
    ];

    return (
        <Section className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-cyan-400 mb-4">
                        HOW IT WORKS
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Three steps to{' '}
                        <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                            effortless growth
                        </span>
                    </h2>
                </div>

                <div className="relative">
                    {/* Connecting line */}
                    <div className="hidden lg:block absolute top-[60px] left-[calc(16.67%+20px)] right-[calc(16.67%+20px)] h-[2px] bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-violet-500/30" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                        {steps.map((step, i) => (
                            <div
                                key={step.step}
                                className="relative text-center"
                            >
                                {/* Step number circle */}
                                <div className="relative inline-flex mb-6">
                                    <div className={`w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg`}>
                                        <step.icon className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-black border-2 border-white/[0.1] flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-zinc-300">{step.step}</span>
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-4 max-w-xs mx-auto">
                                    {step.description}
                                </p>

                                {/* Detail tags */}
                                <div className="flex flex-wrap justify-center gap-2">
                                    {step.details.map((detail, j) => (
                                        <span
                                            key={j}
                                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.04] text-zinc-400"
                                        >
                                            {detail}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   INTEGRATION MARQUEE
   ═══════════════════════════════════════ */

function IntegrationMarquee() {
    const integrations = [
        { name: 'Google Analytics', icon: '📊' },
        { name: 'Search Console', icon: '🔍' },
        { name: 'Telegram', icon: '💬' },
        { name: 'WordPress', icon: '📝' },
        { name: 'Gemini AI', icon: '✨' },
        { name: 'Google OAuth', icon: '🔐' },
    ];

    const doubled = [...integrations, ...integrations];

    return (
        <section className="py-16 overflow-hidden">
            <div className="text-center mb-8">
                <span className="text-xs uppercase tracking-widest text-zinc-600 font-medium">
                    Works with your stack
                </span>
            </div>
            <div className="relative">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-10" />
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-10" />

                <div className="marquee-track">
                    {doubled.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 px-6 py-3 mx-2 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300 flex-shrink-0"
                        >
                            <span className="text-xl">{item.icon}</span>
                            <span className="text-sm font-medium text-zinc-300 whitespace-nowrap">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ═══════════════════════════════════════
   WHO IT'S FOR
   ═══════════════════════════════════════ */

const PERSONAS = [
    {
        title: 'Solo Founders',
        desc: 'Track your startup\'s growth without hiring a marketing team. Get AI insights that would cost thousands from an agency.',
        icon: Zap,
        color: 'text-cyan-400',
        bg: 'from-cyan-500/10 to-blue-500/10',
    },
    {
        title: 'Content Creators',
        desc: 'See which content drives traffic, find keyword gaps, and get AI-written meta tags — all from one place.',
        icon: Sparkles,
        color: 'text-violet-400',
        bg: 'from-violet-500/10 to-purple-500/10',
    },
    {
        title: 'Marketing Teams',
        desc: 'Unified analytics + SEO in one dashboard. Export reports, set up Telegram alerts, and stay ahead of ranking drops.',
        icon: TrendingUp,
        color: 'text-emerald-400',
        bg: 'from-emerald-500/10 to-cyan-500/10',
    },
    {
        title: 'E-commerce Brands',
        desc: 'Monitor product page performance, track revenue-driving keywords, and audit your site for SEO issues automatically.',
        icon: Globe,
        color: 'text-amber-400',
        bg: 'from-amber-500/10 to-orange-500/10',
    },
];

function WhoItsFor() {
    return (
        <Section className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        WHO IT&apos;S FOR
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
                        Built for people who{' '}
                        <span className="gradient-text">care about growth</span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Whether you&apos;re a solo founder or a marketing team, TrafficClaw gives you the tools to grow smarter.
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {PERSONAS.map((p, i) => {
                        const Icon = p.icon;
                        return (
                            <div
                                key={i}
                                className={`p-4 sm:p-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br ${p.bg} hover:border-white/[0.12] transition-all group`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-white/[0.06]`}>
                                    <Icon className={`w-5 h-5 ${p.color}`} />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">{p.title}</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   COMPARISON TABLE
   ═══════════════════════════════════════ */

const COMPARISON_ROWS = [
    { feature: 'GA4 + SEO in one dashboard', tc: true, ga4: false, semrush: false, ahrefs: false },
    { feature: 'AI Chat about YOUR data', tc: true, ga4: false, semrush: false, ahrefs: false },
    { feature: 'Telegram bot alerts', tc: true, ga4: false, semrush: false, ahrefs: false },
    { feature: 'AI schema generation', tc: true, ga4: false, semrush: false, ahrefs: false },
    { feature: 'Real-time analytics', tc: true, ga4: true, semrush: false, ahrefs: false },
    { feature: 'Keyword tracking', tc: true, ga4: false, semrush: true, ahrefs: true },
    { feature: 'Site audit', tc: true, ga4: false, semrush: true, ahrefs: true },
    { feature: 'Free tier available', tc: true, ga4: true, semrush: false, ahrefs: false },
    { feature: 'Starting price', tc: '$9/mo', ga4: 'Free', semrush: '$199/mo', ahrefs: '$129/mo' },
];

function ComparisonTable() {
    return (
        <Section className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-cyan-400 mb-4">
                        COMPARE
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
                        How we stack up
                    </h2>
                    <p className="text-zinc-400 max-w-xl mx-auto">
                        TrafficClaw combines analytics + SEO + AI in one tool — at a fraction of the cost.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/[0.06]">
                                <th className="text-left py-4 pr-4 text-zinc-500 font-medium">Feature</th>
                                <th className="text-center py-4 px-3 text-emerald-400 font-semibold">TrafficClaw</th>
                                <th className="text-center py-4 px-3 text-zinc-500 font-medium">GA4</th>
                                <th className="text-center py-4 px-3 text-zinc-500 font-medium">SEMrush</th>
                                <th className="text-center py-4 px-3 text-zinc-500 font-medium">Ahrefs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPARISON_ROWS.map((row, i) => (
                                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                    <td className="py-3 pr-4 text-zinc-300">{row.feature}</td>
                                    {(['tc', 'ga4', 'semrush', 'ahrefs'] as const).map(col => {
                                        const val = row[col];
                                        return (
                                            <td key={col} className="text-center py-3 px-3">
                                                {typeof val === 'boolean' ? (
                                                    val ? (
                                                        <CheckCircle2 className={`w-4 h-4 mx-auto ${col === 'tc' ? 'text-emerald-400' : 'text-zinc-500'}`} />
                                                    ) : (
                                                        <span className="text-zinc-700">—</span>
                                                    )
                                                ) : (
                                                    <span className={`font-medium ${col === 'tc' ? 'text-emerald-400' : 'text-zinc-400'}`}>{val}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   FAQ
   ═══════════════════════════════════════ */

function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs = [
        {
            q: 'How does TrafficClaw access my analytics data?',
            a: 'We use read-only Google OAuth to connect to your GA4 and Search Console. We never modify your data or settings. You can revoke access at any time from your Google account.',
        },
        {
            q: 'Do I need a Telegram account?',
            a: 'Only if you want to use the Telegram bot feature (Pro plan). The web dashboard works independently — you can access all analytics, SEO tools, and AI chat directly from your browser.',
        },
        {
            q: 'What happens when I run out of credits?',
            a: 'You can still access your dashboard, view analytics, and run audits. Credits are only consumed when you send messages to the AI chat or Telegram bot. Upgrade your plan anytime for more credits.',
        },
        {
            q: 'Is my data secure?',
            a: 'Yes. We use OAuth tokens (never passwords), encrypt data in transit with TLS, and each user\'s bot runs in an isolated container. We don\'t sell or share your data with third parties.',
        },
        {
            q: 'Can I connect multiple websites?',
            a: 'Yes! TrafficClaw automatically detects all GA4 properties and Search Console sites linked to your Google account. Switch between them from the dashboard.',
        },
        {
            q: 'How accurate is the AI analysis?',
            a: 'The AI analyzes your real Google Analytics and Search Console data using Gemini. It provides data-driven insights, not guesses. Every recommendation is backed by your actual traffic and ranking metrics.',
        },
        {
            q: 'Can I cancel anytime?',
            a: 'Absolutely. No contracts, no commitments. Cancel your subscription anytime and you\'ll keep access until the end of your billing period.',
        },
        {
            q: 'What makes TrafficClaw different from GA4 or Ahrefs?',
            a: 'TrafficClaw combines analytics and SEO into one AI-powered interface. Instead of clicking through dashboards, just ask "which keywords are dropping?" and get instant answers. Plus, get proactive alerts via Telegram without checking any dashboard.',
        },
    ];

    return (
        <Section id="faq" className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        FAQ
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Common{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            questions
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg">Everything you need to know about TrafficClaw.</p>
                </div>

                <div className="space-y-3">
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            className="border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.1] transition-colors"
                        >
                            <button
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                                className="w-full flex items-center justify-between px-4 py-3 sm:px-6 sm:py-5 text-left"
                            >
                                <span className="text-sm font-medium text-white pr-4">{faq.q}</span>
                                <ChevronRight className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${openIndex === i ? 'rotate-90' : ''}`} />
                            </button>
                            {openIndex === i && (
                                <div className="px-4 pb-4 sm:px-6 sm:pb-5 -mt-1">
                                    <p className="text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════ */

function FinalCTA() {
    return (
        <Section className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto text-center">
                <div
                    className="relative p-6 sm:p-12 lg:p-16 rounded-3xl overflow-hidden"
                >
                    {/* Background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.1] via-cyan-500/[0.05] to-violet-500/[0.1]" />
                    <div className="absolute inset-0 border border-white/[0.08] rounded-3xl" />

                    <div className="relative">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium mb-6 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            Limited early access — spots filling up
                        </div>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                            Stop guessing.{' '}
                            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                Start asking.
                            </span>
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-4">
                            Connect Google Analytics + Search Console in 30 seconds.
                            Then ask AI anything about your traffic.
                        </p>
                        <p className="text-sm text-zinc-500 mb-8">
                            No credit card required · 10 free AI messages · Cancel anytime
                        </p>
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                            className="group px-6 sm:px-10 py-3 sm:py-4 min-h-[44px] text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] transition-all duration-300"
                        >
                            Start Free — Connect with Google
                            <ArrowRight className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   STICKY MOBILE CTA
   ═══════════════════════════════════════ */

function StickyMobileCTA() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = () => {
            // Show after scrolling past hero (600px)
            setVisible(window.scrollY > 600);
        };
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-black/90 backdrop-blur-xl border-t border-white/[0.06] px-4 py-3 safe-area-bottom">
            <button
                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                className="w-full py-3 min-h-[44px] text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl flex items-center justify-center gap-2"
            >
                Start Free — No Credit Card
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════
   CONTACT / HELP SECTION
   ═══════════════════════════════════════ */

function ContactSection() {
    const [form, setForm] = useState({ name: '', email: '', message: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('sending');
        setErrorMsg('');

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();

            if (!res.ok) {
                setStatus('error');
                setErrorMsg(data.error || 'Something went wrong.');
                return;
            }

            setStatus('success');
            setForm({ name: '', email: '', message: '' });
        } catch {
            setStatus('error');
            setErrorMsg('Network error. Please try again.');
        }
    };

    return (
        <Section id="contact" className="py-24 sm:py-32 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        <MessageSquare className="w-3 h-3" />
                        HELP & SUPPORT
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Got a{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            question?
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                        Drop us a message and we&apos;ll get back to you. Whether it&apos;s about features, pricing, or feedback — we&apos;re here to help.
                    </p>
                </div>

                {status === 'success' ? (
                    <div
                        className="p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] text-center"
                    >
                        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Message sent!</h3>
                        <p className="text-sm text-zinc-400 mb-6">
                            Thanks for reaching out. We&apos;ll get back to you soon.
                        </p>
                        <button
                            onClick={() => setStatus('idle')}
                            className="px-6 py-2.5 min-h-[44px] text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            Send another message
                        </button>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="p-4 sm:p-6 lg:p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] space-y-5"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label htmlFor="contact-name" className="block text-sm font-medium text-zinc-300 mb-2">
                                    Name
                                </label>
                                <input
                                    id="contact-name"
                                    type="text"
                                    required
                                    maxLength={100}
                                    placeholder="Your name"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-email" className="block text-sm font-medium text-zinc-300 mb-2">
                                    Email
                                </label>
                                <input
                                    id="contact-email"
                                    type="email"
                                    required
                                    maxLength={254}
                                    placeholder="you@example.com"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="contact-message" className="block text-sm font-medium text-zinc-300 mb-2">
                                Your question or message
                            </label>
                            <textarea
                                id="contact-message"
                                required
                                rows={4}
                                maxLength={2000}
                                placeholder="How can we help you?"
                                value={form.message}
                                onChange={(e) => setForm({ ...form, message: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors resize-none"
                            />
                            <div className="text-right mt-1">
                                <span className="text-xs text-zinc-600">{form.message.length}/2000</span>
                            </div>
                        </div>

                        {status === 'error' && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {errorMsg}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <button
                                type="submit"
                                disabled={status === 'sending'}
                                className="w-full sm:w-auto px-5 sm:px-8 py-3 min-h-[44px] text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                            >
                                {status === 'sending' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Send Message
                                    </>
                                )}
                            </button>
                            <span className="text-sm text-zinc-600">
                                or email us at{' '}
                                <a href="mailto:trafficclaw@gmail.com" className="text-emerald-400/80 hover:text-emerald-400 transition-colors inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    trafficclaw@gmail.com
                                </a>
                            </span>
                        </div>
                    </form>
                )}
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════ */

function Footer() {
    return (
        <footer className="border-t border-white/[0.04] py-12 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* Featured On */}
                <div className="flex flex-col items-center gap-4">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Featured on</span>
                    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                        <a href="https://www.producthunt.com/products/trafficclaw?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-trafficclaw" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <img alt="TrafficClaw - Talk to your SEO & Analytics data | Product Hunt" width="250" height="54" className="max-w-[200px] sm:max-w-none h-auto" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1103214&theme=dark&t=1774016804657" />
                        </a>
                        {/* Add more directory badges here as you submit:
                        <a href="https://betalist.com/..." target="_blank" rel="noopener noreferrer">
                            <img src="..." alt="Featured on BetaList" />
                        </a>
                        */}
                    </div>
                </div>

                {/* Footer Links */}
                <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between md:gap-6">
                    <div className="flex items-center gap-2">
                        <img src="/icon.svg" alt="TrafficClaw" className="w-6 h-6 rounded-md" />
                        <span className="text-sm font-bold text-white">
                            Traffic<span className="text-emerald-400">Claw</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6 text-sm text-zinc-500">
                        <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
                        <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
                        <Link href="/about" className="hover:text-zinc-300 transition-colors">About</Link>
                        <Link href="/contact" className="hover:text-zinc-300 transition-colors">Contact</Link>
                    </div>

                    <div className="text-xs text-zinc-600">
                        © 2026 TrafficClaw. All rights reserved.
                    </div>
                </div>
            </div>
        </footer>
    );
}

/* ═══════════════════════════════════════
   LANDING PAGE — MAIN EXPORT
   ═══════════════════════════════════════ */

/* ═══════════════════════════════════════
   GLOBE EMBED PROMO — below the interactive demo
   ═══════════════════════════════════════ */

function GlobeEmbedPromo() {
    const [copied, setCopied] = useState(false);
    const sectionRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
    const embedCode = `<iframe
  src="https://trafficclaw.com/embed/YOUR_SITE_ID?token=YOUR_TOKEN"
  width="100%" height="600" frameborder="0"
  style="border-radius: 16px;"
  allow="fullscreen"
></iframe>`;

    const handleGetEmbed = () => {
        signIn('google', { callbackUrl: '/dashboard/globe' });
    };

    return (
        <Section className="py-16 sm:py-24 px-4 sm:px-6">
            <div ref={sectionRef} className="max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6 }}
                    className="relative overflow-hidden rounded-3xl border border-emerald-500/20"
                    style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, #080c18 40%, rgba(6,182,212,0.08) 100%)' }}
                >
                    {/* Glow effects */}
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[100px] pointer-events-none" />

                    <div className="relative z-10 p-8 sm:p-12 lg:p-16">
                        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                            {/* Left */}
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-6">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Free for everyone
                                </div>
                                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
                                    Embed a live visitor globe on{' '}
                                    <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">your website</span>
                                </h2>
                                <p className="text-zinc-400 text-base sm:text-lg mb-8 leading-relaxed">
                                    Show your visitors where your audience is — in real time. One iframe, real GA4 data,
                                    beautiful 3D globe with live activity feed. No tracking scripts needed.
                                </p>
                                <div className="grid grid-cols-2 gap-3 mb-8">
                                    {[
                                        { icon: Globe, text: 'Interactive 3D globe' },
                                        { icon: Zap, text: 'Real-time GA4 data' },
                                        { icon: Shield, text: 'No tracking script' },
                                        { icon: Eye, text: 'Click visitor profiles' },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-2.5 text-sm text-zinc-300">
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                                                <item.icon className="w-3.5 h-3.5 text-emerald-400" />
                                            </div>
                                            {item.text}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={handleGetEmbed}
                                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-emerald-500/25"
                                    >
                                        Get your embed code
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <a
                                        href="#demo"
                                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/[0.04] transition"
                                    >
                                        See live demo
                                    </a>
                                </div>
                            </div>

                            {/* Right — premium code card */}
                            <div>
                                <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
                                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-3">
                                            <div className="flex gap-1.5">
                                                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                                                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                                                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                                            </div>
                                            <span className="text-xs font-medium text-zinc-500">embed.html</span>
                                        </div>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-zinc-400 hover:text-white transition border border-white/[0.04]"
                                        >
                                            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="p-5">
                                        <pre className="text-[13px] leading-relaxed font-mono text-zinc-400 overflow-x-auto">
                                            <code>
                                                <span className="text-zinc-600">{'<!-- One line. That\'s it. -->'}</span>{'\n'}
                                                <span className="text-cyan-400">{'<iframe'}</span>{'\n'}
                                                {'  '}src=<span className="text-emerald-400">{'"https://trafficclaw.com/embed/...'}</span>{'\n'}
                                                {'  '}width=<span className="text-emerald-400">{'"100%"'}</span> height=<span className="text-emerald-400">{'"600"'}</span>{'\n'}
                                                {'  '}frameborder=<span className="text-emerald-400">{'"0"'}</span>{'\n'}
                                                {'  '}allow=<span className="text-emerald-400">{'"fullscreen"'}</span>{'\n'}
                                                <span className="text-cyan-400">{'></iframe>'}</span>
                                            </code>
                                        </pre>
                                    </div>
                                </div>
                                <p className="text-center text-zinc-600 text-xs mt-4">Works with any website, CMS, or framework</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </Section>
    );
}


/* ═══════════════════════════════════════
   GLOBE API SECTION — near pricing
   ═══════════════════════════════════════ */

function GlobeAPISection() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

    const features = [
        { icon: Globe, title: 'Real-Time Globe', desc: 'Interactive 3D globe showing live visitors from Google Analytics. Click markers to see visitor details.' },
        { icon: Gauge, title: 'Adaptive Polling', desc: 'Smart polling that adapts to activity: 60s when active, 120s when idle, pauses when tab is hidden.' },
        { icon: Shield, title: 'Token-Based Auth', desc: 'Secure embed tokens scoped to one property. Read-only, rate-limited, revocable from your dashboard.' },
        { icon: Eye, title: 'Visitor Profiles', desc: 'Click any visitor marker to see their country, engagement warmth, coordinates, and session details.' },
        { icon: Users, title: 'Activity Feed', desc: 'Live feed showing visitor actions: pages visited, exit events, country flags, and timestamps.' },
        { icon: Code2, title: 'One-Line Embed', desc: 'Just paste an iframe. No tracking scripts, no SDK, no build steps. Works with any website or CMS.' },
    ];

    return (
        <Section id="globe-api" className="py-24 sm:py-32 px-4 sm:px-6">
            <div ref={sectionRef} className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        GLOBE API
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                        Embed a live analytics globe{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            on any website
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Show your visitors where your audience is — real-time, interactive, and free.
                        Powered by your Google Analytics data.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((f, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all duration-300 group"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/15 to-cyan-500/15 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <f.icon className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                            <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>

                {/* CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="text-center mt-12"
                >
                    <Link
                        href="/dashboard/globe"
                        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-emerald-500/25"
                    >
                        Get your free embed code
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                    <p className="text-zinc-600 text-xs mt-3">No credit card required. Works with any GA4 property.</p>
                </motion.div>
            </div>
        </Section>
    );
}


export default function LandingPage() {
    return (
        <>
            <Hero />
            <StatsBar />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <AIChatDemo />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Features />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <HowItWorks />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <InteractiveDemo />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <GlobeEmbedPromo />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <IntegrationMarquee />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Testimonials />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Pricing />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <GlobeAPISection />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <ComparisonTable />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <WhoItsFor />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <FAQ />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <FinalCTA />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <ContactSection />
            <StickyMobileCTA />
            <Footer />
        </>
    );
}
