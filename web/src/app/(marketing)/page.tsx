'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { VideoPhoneFrame } from "@/components/VideoPhoneFrame";

import {
    Bot, BarChart3, Search, Zap, TrendingUp, Globe, Shield,
    ArrowRight, CheckCircle2, Star, Sparkles, GitBranch,
    MousePointerClick, Eye, ArrowUpRight, ChevronRight, MessageSquare,
    ScanSearch
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

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

const pagePerformance = [
    { page: '/blog/seo-guide', views: 4521, bounce: 32 },
    { page: '/pricing', views: 3892, bounce: 45 },
    { page: '/features', views: 2845, bounce: 38 },
    { page: '/blog/analytics', views: 2234, bounce: 29 },
    { page: '/docs/getting-started', views: 1956, bounce: 22 },
];

/* ═══════════════════════════════════════
   ANIMATION VARIANTS
   ═══════════════════════════════════════ */

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-80px' });
    return (
        <motion.section
            ref={ref}
            id={id}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={stagger}
            className={`relative ${className}`}
        >
            {children}
        </motion.section>
    );
}

/* ═══════════════════════════════════════
   HERO SECTION
   ═══════════════════════════════════════ */

function Hero() {
    return (
        <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden bg-black"> {/* True black background for maximum contrast */}
            {/* Background gradient meshes */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/[0.04] rounded-full blur-[128px]" />
                <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/[0.03] rounded-full blur-[128px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[128px]" />
            </div>

            <div className="relative w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center z-10">
                {/* Left Side: Marketing Copy */}
                <motion.div
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-8 order-2 lg:order-1 text-center lg:text-left"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium w-fit mx-auto lg:mx-0 border border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Meet TrafficClaw Agent
                    </div>

                    <h1 className="text-5xl sm:text-6xl lg:text-[5rem] font-bold tracking-tight leading-[1.05]">
                        <span className="block pb-2 text-white drop-shadow-md font-extrabold" style={{ textShadow: "0px 4px 40px rgba(52,211,153,0.2)" }}>
                            SEO & Analytics,
                        </span>
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent block pb-2">
                            all from your phone.
                        </span>
                    </h1>

                    <p className="text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto lg:mx-0 font-light">
                        Get real-time insights, traffic drop alerts, and quick SEO wins without ever logging into a clunky dashboard. Just open Telegram and ask your personalized AI.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-4">
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                            className="group px-8 h-14 text-[15px] font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_32px_rgba(52,211,153,0.3)] transition-all duration-300 w-full sm:w-auto flex items-center justify-center flex-shrink-0"
                        >
                            Start Free — No Credit Card
                            <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <a
                            href="#features"
                            className="px-8 h-14 text-[15px] font-medium text-zinc-300 border border-white/10 rounded-xl hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300 w-full sm:w-auto flex items-center justify-center backdrop-blur-sm whitespace-nowrap"
                        >
                            Explore Features
                        </a>
                    </div>
                </motion.div>

                {/* Right Side: The Simulation Component with Floating UI */}
                <div className="order-1 lg:order-2 flex justify-center lg:justify-center relative lg:pl-12 w-full h-[600px] items-center">

                    {/* Floating Element 1 (Traffic Spike) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, x: -20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        whileHover={{ scale: 1.05, y: -5, boxShadow: "0 20px 40px -10px rgba(52,211,153,0.3)" }}
                        transition={{ duration: 0.5, delay: 0.8 }}
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
                                <motion.div
                                    key={i}
                                    style={{ originY: 1 }}
                                    initial={{ scaleY: 0 }}
                                    animate={{ scaleY: height / 100 }}
                                    transition={{ duration: 1, delay: 1 + (i * 0.1), ease: "easeOut" }}
                                    className="w-full h-full bg-emerald-500 rounded-sm origin-bottom"
                                />
                            ))}
                        </div>

                        {/* Connecting Sweep Right */}
                        <motion.svg
                            className="absolute pointer-events-none w-[70px] h-[80px] top-1/2 -right-[75px] -translate-y-1/2"
                            viewBox="0 0 70 80"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.5, duration: 1 }}
                        >
                            <defs>
                                <linearGradient id="grad-tl" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d="M 0 10 C 35 10, 35 70, 70 70"
                                fill="none"
                                stroke="url(#grad-tl)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 1 }}
                            />
                        </motion.svg>
                    </motion.div>

                    {/* Floating Element 2 (Keyword Rank) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, x: -20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        whileHover={{ scale: 1.05, y: -5, boxShadow: "0 20px 40px -10px rgba(56,189,248,0.3)" }}
                        transition={{ duration: 0.5, delay: 1.0 }}
                        className="absolute hidden lg:flex flex-col gap-3 z-30 lg:-left-28 bottom-[30%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl cursor-pointer hover:border-sky-500/30 transition-colors w-[200px]"
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
                        <motion.svg
                            className="absolute pointer-events-none w-[90px] h-[60px] top-1/2 -right-[95px] -translate-y-1/2"
                            viewBox="0 0 90 60"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.7, duration: 1 }}
                        >
                            <defs>
                                <linearGradient id="grad-bl" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d="M 0 50 C 45 50, 45 10, 90 10"
                                fill="none"
                                stroke="url(#grad-bl)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 1.2 }}
                            />
                        </motion.svg>
                    </motion.div>

                    {/* Main Phone Frame */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-20 flex justify-center"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-emerald-500/[0.05] rounded-[5rem] blur-3xl pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-cyan-500/[0.06] rounded-[5rem] blur-2xl pointer-events-none" />
                        <VideoPhoneFrame />
                    </motion.div>

                    {/* Floating Element 3 (Site Health) */}
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: 20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        whileHover={{ scale: 1.05, y: -5, boxShadow: "0 20px 40px -10px rgba(168,85,247,0.3)" }}
                        transition={{ duration: 0.5, delay: 1.2 }}
                        className="absolute hidden lg:flex items-center gap-4 z-30 lg:-right-24 top-[25%] bg-[#121214]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl cursor-pointer hover:border-purple-500/30 transition-colors"
                    >
                        <div className="relative w-12 h-12 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <motion.path
                                    className="text-purple-500"
                                    strokeDasharray="100, 100"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="currentColor" strokeWidth="3"
                                    initial={{ strokeDasharray: "0, 100" }}
                                    animate={{ strokeDasharray: "98, 100" }}
                                    transition={{ duration: 1.5, delay: 1.5, ease: "easeOut" }}
                                />
                            </svg>
                            <span className="absolute text-xs font-bold text-white">98</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-white">Site Health</span>
                            <span className="text-xs text-purple-400">Looking great</span>
                        </div>

                        {/* Connecting Sweep Left */}
                        <motion.svg
                            className="absolute pointer-events-none w-[50px] h-[60px] top-1/2 -left-[55px] -translate-y-1/2"
                            viewBox="0 0 50 60"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.9, duration: 1 }}
                        >
                            <defs>
                                <linearGradient id="grad-rt" x1="100%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d="M 50 10 C 25 10, 25 50, 0 50"
                                fill="none"
                                stroke="url(#grad-rt)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 1.4 }}
                            />
                        </motion.svg>
                    </motion.div>

                    {/* Floating Element 4 (Alert) */}
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: 20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        whileHover={{ scale: 1.05, y: -5, boxShadow: "0 20px 40px -10px rgba(244,63,94,0.3)" }}
                        transition={{ duration: 0.5, delay: 1.4 }}
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
                        <motion.svg
                            className="absolute pointer-events-none w-[30px] h-[40px] top-1/2 -left-[35px] -translate-y-1/2"
                            viewBox="0 0 30 40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2.1, duration: 1 }}
                        >
                            <defs>
                                <linearGradient id="grad-rb" x1="100%" y1="100%" x2="0%" y2="0%">
                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d="M 30 30 C 15 30, 15 10, 0 10"
                                fill="none"
                                stroke="url(#grad-rb)"
                                strokeWidth="1.5"
                                strokeDasharray="4 4"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 1.6 }}
                            />
                        </motion.svg>
                    </motion.div>
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
        <motion.div
            initial={{ opacity: 0, x: isBot ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay }}
            className="flex gap-3"
        >
            <div className="text-lg flex-shrink-0 mt-0.5">{avatar}</div>
            <div>
                <div className={`text-xs mb-1 ${isBot ? 'text-emerald-400' : 'text-zinc-500'}`}>{sender}</div>
                <div className="text-zinc-300 leading-relaxed">{children}</div>
            </div>
        </motion.div>
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
            icon: Eye,
            title: 'AI Visibility',
            description: 'Track how AI models like ChatGPT and Gemini reference your brand. Coming soon.',
            gradient: 'from-amber-400 to-orange-400',
            tag: 'New',
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
        <Section id="features" className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        FEATURES
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Everything you need to{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            grow faster
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Stop switching between Google Analytics, Search Console, and your IDE.
                        TrafficClaw brings everything into one intelligent interface.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.title}
                            variants={fadeUp}
                            className="group relative p-6 rounded-2xl bg-white/[0.02] backdrop-blur border border-white/[0.04] hover:border-emerald-500/15 transition-all duration-300"
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
                        </motion.div>
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
    return (
        <Section id="demo" className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-cyan-400 mb-4">
                        LIVE PREVIEW
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Your AI-powered{' '}
                        <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                            command center
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        This is what your dashboard looks like. Interactive charts, real insights, zero confusion.
                    </p>
                </motion.div>

                {/* Dashboard preview card */}
                <motion.div
                    variants={fadeUp}
                    className="relative"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-violet-500/10 rounded-3xl blur-2xl" />

                    <div className="relative bg-[#050508] border border-white/[0.08] rounded-2xl overflow-hidden">
                        {/* Dashboard header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-sm font-medium text-white">Analytics Overview</span>
                                <span className="text-xs text-zinc-500">acme-store.com</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <span className="px-2.5 py-1 rounded-md bg-white/[0.05] text-zinc-300">Last 30 days</span>
                            </div>
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6">
                            <KPICard label="Active Users" value="24,582" change="+22.4%" positive />
                            <KPICard label="Search Clicks" value="8,965" change="+18.7%" positive />
                            <KPICard label="Avg Position" value="7.1" change="-0.4%" positive />
                            <KPICard label="AI Queries" value="1,247" change="+156%" positive />
                        </div>

                        {/* Charts row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-6">
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
                        <div className="px-6 pb-6">
                            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
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
                    </div>
                </motion.div>
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
    const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
    const [phase, setPhase] = useState(0);
    const [typedQuestion, setTypedQuestion] = useState('');
    const [showThinking, setShowThinking] = useState(false);
    const [visibleSections, setVisibleSections] = useState(0);

    const question = 'why is my traffic dropping';

    useEffect(() => {
        if (!isInView) return;
        // Phase 1: Type the user question
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
        // Phase 2: Show "thinking" after question sent
        const t1 = setTimeout(() => { setShowThinking(true); setPhase(2); }, 600);
        return () => clearTimeout(t1);
    }, [phase]);

    useEffect(() => {
        if (phase !== 2) return;
        // Phase 3: Start revealing bot response sections one by one
        const t2 = setTimeout(() => { setShowThinking(false); setPhase(3); }, 1200);
        return () => clearTimeout(t2);
    }, [phase]);

    useEffect(() => {
        if (phase !== 3) return;
        // Reveal sections one by one
        let s = 0;
        const revealInterval = setInterval(() => {
            s++;
            if (s <= 7) {
                setVisibleSections(s);
            } else {
                clearInterval(revealInterval);
            }
        }, 400);
        return () => clearInterval(revealInterval);
    }, [phase]);

    return (
        <Section className="py-32 px-6">
            <div ref={sectionRef} className="max-w-5xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-emerald-400 mb-4">
                        <MessageSquare className="w-3 h-3" /> LIVE DEMO
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Ask anything.{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Get verdicts.
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Our AI analyst doesn&apos;t give generic advice — it analyzes your real data and delivers actionable verdicts with evidence.
                    </p>
                </motion.div>

                {/* Chat window mock */}
                <motion.div variants={fadeUp} className="relative rounded-2xl border border-white/[0.06] bg-[#050508] overflow-hidden shadow-2xl shadow-black/50">
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

                    {/* Chat messages area */}
                    <div className="p-5 space-y-4 relative">
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

                        {/* Bot response - reveals section by section */}
                        {visibleSections > 0 && (
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <div className="flex-1 space-y-3 max-w-[90%]">
                                    {/* KPI Cards */}
                                    {visibleSections >= 1 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="grid grid-cols-4 gap-2">
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
                                        </motion.div>
                                    )}

                                    {/* Critical verdict */}
                                    {visibleSections >= 2 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="bg-red-500/[0.06] border border-red-500/[0.12] rounded-xl p-4">
                                            <div className="text-sm font-bold text-red-400 mb-2">🚨 CRITICAL: YOUR ORGANIC SEARCH IS COLLAPSING</div>
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                Your organic traffic is in a death spiral, down <span className="text-red-400 font-semibold">64.9%</span> in 28 days. You are bleeding search visibility on high-intent troubleshooting queries that are your primary acquisition engine.
                                            </p>
                                        </motion.div>
                                    )}

                                    {/* Evidence table */}
                                    {visibleSections >= 3 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden">
                                            <div className="px-4 py-2 border-b border-white/[0.04]">
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">📋 Evidence</span>
                                            </div>
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
                                                    <tr>
                                                        <td className="px-4 py-2 text-zinc-400">Mar 03</td>
                                                        <td className="px-4 py-2 text-zinc-500 font-mono">1,569</td>
                                                        <td className="px-4 py-2 text-zinc-500 font-mono">103</td>
                                                        <td className="px-4 py-2 text-zinc-500">6.06%</td>
                                                        <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-500/10 text-zinc-500">Flatlined</span></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </motion.div>
                                    )}

                                    {/* Verdict */}
                                    {visibleSections >= 4 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                                            <div className="text-sm font-bold text-amber-400 mb-2">⚖️ VERDICT: CATASTROPHIC TECHNICAL EVENT ON FEB 14</div>
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                Your traffic didn&apos;t just &quot;drop&quot; — it was decapitated. On February 14th, your site lost <span className="text-white font-semibold">90%+</span> of its search visibility overnight, shifting from ~24,000 daily impressions to fewer than 1,000. This is not a slow decline; it is a critical technical failure or a manual penalty.
                                            </p>
                                        </motion.div>
                                    )}

                                    {/* Revenue Impact */}
                                    {visibleSections >= 5 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl p-4">
                                            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">💰 Revenue Impact</div>
                                            <div className="space-y-1.5 text-xs text-zinc-400">
                                                <div>Daily Loss: <span className="text-red-400 font-semibold">~650 clicks</span></div>
                                                <div>Monthly Loss: <span className="text-red-400 font-semibold">19,500 clicks</span></div>
                                                <div>Estimated Revenue Bleed: <span className="text-red-400 font-semibold">$1,900 per month</span> in potential value</div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Action items */}
                                    {visibleSections >= 6 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="bg-emerald-500/[0.04] border border-emerald-500/[0.1] rounded-xl p-4">
                                            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">🎯 ACTION: EMERGENCY RECOVERY STEPS</div>
                                            <div className="space-y-2 text-xs text-zinc-400">
                                                <div className="flex items-start gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                    <span><strong className="text-zinc-200">Check Search Console &quot;Manual Actions&quot;</strong> — Look for a manual penalty in GSC &gt; Security &amp; Manual Actions</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                    <span><strong className="text-zinc-200">Audit Indexing Status</strong> — Check &quot;Excluded&quot; pages starting Feb 14 for &quot;Blocked by robots.txt&quot;</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                    <span><strong className="text-zinc-200">Inspect robots.txt</strong> — Ensure you haven&apos;t accidentally added <code className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px] text-emerald-300">Disallow: /</code></span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                    <span><strong className="text-zinc-200">Sitemap Verification</strong> — Re-submit your XML sitemap in GSC to force Google to recrawl</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Follow-up suggestions */}
                                    {visibleSections >= 7 && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                                            className="flex flex-wrap gap-2">
                                            {[
                                                'Check my GSC indexing report for errors starting Feb 14',
                                                'Which of my top pages are currently cannibalizing each other?',
                                                'How do I optimize my site for mobile to stop the ranking decline?',
                                            ].map(q => (
                                                <button key={q} className="px-3 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.12] text-[10px] text-emerald-400 hover:bg-emerald-500/[0.15] transition-colors">
                                                    {q}
                                                </button>
                                            ))}
                                        </motion.div>
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
                </motion.div>

                {/* Bottom tagline */}
                <motion.p variants={fadeUp} className="text-center mt-8 text-sm text-zinc-600">
                    Real response from TrafficClaw AI · Powered by your live Google Search Console data
                </motion.p>
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
            role: 'Founder @TechStack.io',
            text: 'The AI chat is incredible. I asked \'why did my traffic drop?\' and it found a cannibalization issue between two blog posts. Fixed it in minutes.',
            avatar: '👩‍💻',
            stars: 5,
        },
        {
            name: 'Marcus Rodriguez',
            role: 'CTO @ShipFast',
            text: 'We replaced three SEO tools with TrafficClaw. The overview dashboard gives me everything I need in one glance.',
            avatar: '👨‍💼',
            stars: 5,
        },
        {
            name: 'Priya Patel',
            role: 'Marketing Lead @CloudBase',
            text: 'Content decay detection saved us. We caught 12 pages losing rank before it became a problem. The AI insights are spot-on.',
            avatar: '👩‍🎨',
            stars: 5,
        },
    ];

    return (
        <Section className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-amber-400 mb-4">
                        TESTIMONIALS
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Loved by{' '}
                        <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                            builders
                        </span>
                    </h2>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {reviews.map((review, i) => (
                        <motion.div
                            key={i}
                            variants={fadeUp}
                            className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] transition-all duration-300"
                        >
                            <div className="flex gap-0.5 mb-4">
                                {Array.from({ length: review.stars }).map((_, j) => (
                                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                                ))}
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed mb-6">&ldquo;{review.text}&rdquo;</p>
                            <div className="flex items-center gap-3">
                                <div className="text-2xl">{review.avatar}</div>
                                <div>
                                    <div className="text-sm font-medium text-white">{review.name}</div>
                                    <div className="text-xs text-zinc-500">{review.role}</div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   PRICING SECTION — Monthly subscription plans
   ═══════════════════════════════════════ */

function Pricing() {
    return (
        <Section id="pricing" className="py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-violet-400 mb-4">
                        PRICING
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Simple{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            monthly plans
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                        All website features are free. Pick a plan for AI-powered insights.<br />
                        <span className="text-emerald-400 font-medium">Credits reset each month — no rollover.</span>
                    </p>
                </motion.div>

                {/* Free tier callout */}
                <motion.div variants={fadeUp} className="text-center mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-sm">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 font-medium">Every new account gets <strong className="text-emerald-400">50 free messages</strong> to start</span>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

                    {/* ── STARTER ── */}
                    <motion.div variants={fadeUp} className="relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/[0.2] transition-all duration-300 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Zap className="w-5 h-5 text-cyan-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Starter</h3>
                        <p className="text-xs text-zinc-500 mb-5">Perfect for personal sites & side projects</p>

                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-4xl font-bold text-white">$9</span>
                            <span className="text-sm text-zinc-500">/mo</span>
                        </div>
                        <div className="text-sm text-cyan-400 font-medium mb-6">50 AI credits/month</div>

                        <a href="https://checkout.dodopayments.com/buy/pdt_0NZoVGbK4CoQKguLeiFbO" target="_blank" rel="noopener noreferrer"
                            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] text-white hover:bg-white/[0.12] transition-all duration-200 mb-6 block text-center border border-white/[0.06] hover:border-cyan-500/[0.2]">
                            Get Starter
                        </a>

                        <ul className="space-y-3">
                            {['50 AI messages per month', 'Full SEO & analytics dashboard', 'Site audit reports', 'AI content tools'].map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-400">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-zinc-600" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* ── GROWTH (highlighted) ── */}
                    <motion.div variants={fadeUp} className="relative p-6 rounded-2xl border-2 border-emerald-500/[0.3] bg-gradient-to-b from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent transition-all duration-300 group md:-mt-2 md:mb-[-8px]">
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[10px] font-bold text-black uppercase tracking-wider shadow-lg shadow-emerald-500/20">
                            Most Popular
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Growth</h3>
                        <p className="text-xs text-zinc-500 mb-5">For growing businesses & content teams</p>

                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">$19</span>
                            <span className="text-sm text-zinc-500">/mo</span>
                        </div>
                        <div className="flex items-center gap-2 mb-6">
                            <span className="text-sm text-emerald-400 font-medium">150 AI credits/month</span>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15] font-semibold">3x Starter</span>
                        </div>

                        <a href="https://checkout.dodopayments.com/buy/pdt_0NZoVI3aamuRliw0Ffnuh" target="_blank" rel="noopener noreferrer"
                            className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all duration-200 mb-6 block text-center">
                            Get Growth
                        </a>

                        <ul className="space-y-3">
                            {['150 AI messages per month', 'Everything in Starter', 'Priority AI responses', 'Advanced SEO intelligence', 'AI visibility tracking', 'AEO optimization tools'].map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-300">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    {/* ── PRO (best value) ── */}
                    <motion.div variants={fadeUp} className="relative p-6 rounded-2xl border border-violet-500/[0.15] bg-gradient-to-b from-violet-500/[0.06] via-purple-500/[0.03] to-transparent hover:border-violet-500/[0.3] transition-all duration-300 group overflow-hidden">
                        <div className="absolute -top-3.5 right-4 px-3 py-1 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg shadow-violet-500/20">
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
                                <span className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">$29</span>
                                <span className="text-sm text-zinc-500">/mo</span>
                            </div>
                            <div className="flex items-center gap-2 mb-6">
                                <span className="text-sm text-violet-400 font-medium">300 AI credits/month</span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/[0.1] text-violet-400 border border-violet-500/[0.15] font-semibold">6x Starter</span>
                            </div>

                            <a href="https://checkout.dodopayments.com/buy/pdt_0NZoVIVgk7pdElblScoop" target="_blank" rel="noopener noreferrer"
                                className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-400 to-purple-500 text-white hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-200 mb-6 block text-center">
                                Get Pro
                            </a>

                            <ul className="space-y-3">
                                {['300 AI messages per month', 'Everything in Growth'].map((f, i) => (
                                    <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-300">
                                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-violet-400" />
                                        {f}
                                    </li>
                                ))}
                                <li className="flex items-center gap-2.5 text-sm text-violet-300 font-medium">
                                    <Bot className="w-4 h-4 flex-shrink-0 text-violet-400" />
                                    Telegram bot included
                                </li>
                                {['Priority support', 'Custom content strategies', 'Early access to new features'].map((f, i) => (
                                    <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-300">
                                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-violet-400" />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>

                </div>

                {/* Bottom trust line */}
                <motion.div variants={fadeUp} className="text-center mt-10">
                    <p className="text-xs text-zinc-600">
                        Secure payments by Dodo Payments • Cancel anytime • Credits reset monthly
                    </p>
                </motion.div>
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
        <section className="py-16 px-6 border-y border-white/[0.04]">
            <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
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
            description: 'Sign in with Google. We auto-detect your GA4 properties, Search Console sites, and GitHub repos.',
            icon: Globe,
            gradient: 'from-emerald-400 to-emerald-600',
            details: ['Google Analytics 4', 'Search Console', 'GitHub'],
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
        <Section className="py-32 px-6">
            <div className="max-w-5xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.04] text-xs font-medium text-cyan-400 mb-4">
                        HOW IT WORKS
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Three steps to{' '}
                        <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                            effortless growth
                        </span>
                    </h2>
                </motion.div>

                <div className="relative">
                    {/* Connecting line */}
                    <div className="hidden lg:block absolute top-[60px] left-[calc(16.67%+20px)] right-[calc(16.67%+20px)] h-[2px] bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-violet-500/30" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {steps.map((step, i) => (
                            <motion.div
                                key={step.step}
                                variants={fadeUp}
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
                            </motion.div>
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
        { name: 'GitHub', icon: '🐙' },
        { name: 'Telegram', icon: '💬' },
        { name: 'WordPress', icon: '📝' },
        { name: 'Gemini AI', icon: '✨' },
        { name: 'Next.js', icon: '▲' },
        { name: 'Vercel', icon: '▼' },
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
   FINAL CTA
   ═══════════════════════════════════════ */

function FinalCTA() {
    return (
        <Section className="py-32 px-6">
            <div className="max-w-4xl mx-auto text-center">
                <motion.div
                    variants={fadeUp}
                    className="relative p-12 sm:p-16 rounded-3xl overflow-hidden"
                >
                    {/* Background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.1] via-cyan-500/[0.05] to-violet-500/[0.1]" />
                    <div className="absolute inset-0 border border-white/[0.08] rounded-3xl" />

                    <div className="relative">
                        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                            Your AI Growth Engine Awaits
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">
                            Join thousands of builders who use AI to understand their data and ship faster.
                            Start with 50 free messages — no credit card needed.
                        </p>
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                            className="group px-10 py-4 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] transition-all duration-300"
                        >
                            Get 50 Free Messages
                            <ArrowRight className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </motion.div>
            </div>
        </Section>
    );
}

/* ═══════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════ */

function Footer() {
    return (
        <footer className="border-t border-white/[0.04] py-12 px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                    <img src="/icon.svg" alt="TrafficClaw" className="w-6 h-6 rounded-md" />
                    <span className="text-sm font-bold text-white">
                        Traffic<span className="text-emerald-400">Claw</span>
                    </span>
                </div>

                <div className="flex items-center gap-6 text-sm text-zinc-500">
                    <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
                    <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
                    <Link href="/about" className="hover:text-zinc-300 transition-colors">About</Link>
                    <a href="mailto:support@trafficclaw.com" className="hover:text-zinc-300 transition-colors">Contact</a>
                </div>

                <div className="text-xs text-zinc-600">
                    © 2026 TrafficClaw. All rights reserved.
                </div>
            </div>
        </footer>
    );
}

/* ═══════════════════════════════════════
   LANDING PAGE — MAIN EXPORT
   ═══════════════════════════════════════ */

export default function LandingPage() {
    return (
        <>
            <Hero />
            <StatsBar />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Features />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <HowItWorks />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <InteractiveDemo />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <IntegrationMarquee />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <AIChatDemo />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Testimonials />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <Pricing />
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            <FinalCTA />
            <Footer />
        </>
    );
}
