'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import {
    Bot, BarChart3, Search, Zap, TrendingUp, Globe, Shield,
    ArrowRight, CheckCircle2, Star, Sparkles, Code, GitBranch,
    MousePointerClick, Eye, ArrowUpRight, ChevronRight, MessageSquare
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
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
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
        <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
            {/* Background gradient mesh */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/[0.07] rounded-full blur-[128px]" />
                <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/[0.05] rounded-full blur-[128px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/[0.04] rounded-full blur-[128px]" />
            </div>

            {/* Grid pattern overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                    backgroundSize: '64px 64px'
                }}
            />

            <div className="relative max-w-7xl mx-auto px-6 text-center">
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] mb-8"
                >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-medium text-zinc-300">AI-Powered Growth Intelligence</span>
                </motion.div>

                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
                >
                    <span className="text-white">Your website&apos;s growth</span>
                    <br />
                    <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                        on autopilot
                    </span>
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.25 }}
                    className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
                >
                    GrowClaw gives you an AI agent that monitors your analytics, detects SEO issues,
                    and fixes your code — all through a simple Telegram chat.
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.35 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
                >
                    <button
                        onClick={() => signIn('google')}
                        className="group px-8 py-3.5 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_32px_rgba(52,211,153,0.3)] transition-all duration-300"
                    >
                        Start Free — No Credit Card
                        <ArrowRight className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <a
                        href="#demo"
                        className="px-8 py-3.5 text-sm font-medium text-zinc-300 border border-white/[0.1] rounded-xl hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-200"
                    >
                        See Live Demo
                    </a>
                </motion.div>

                {/* Terminal-style bot demo */}
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="relative max-w-3xl mx-auto"
                >
                    {/* Glow behind card */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-violet-500/20 rounded-2xl blur-xl opacity-50" />

                    <div className="relative bg-[#0c0c10] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                        {/* Terminal header */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
                            </div>
                            <span className="text-xs text-zinc-500 ml-2 font-mono">GrowClaw Agent · Telegram</span>
                        </div>

                        {/* Chat messages */}
                        <div className="p-6 space-y-4 font-mono text-sm">
                            <ChatMessage sender="You" avatar="👤" delay={0.6}>
                                Show me my top search queries this week
                            </ChatMessage>
                            <ChatMessage sender="GrowClaw" avatar="🤖" delay={1.2} isBot>
                                <span className="text-zinc-400">Running:</span>{' '}
                                <span className="text-cyan-400">gsc query --dimensions query --limit 5</span>
                            </ChatMessage>
                            <ChatMessage sender="GrowClaw" avatar="🤖" delay={1.8} isBot>
                                <div className="mt-2 text-emerald-400">
                                    📊 Top 5 Queries (Last 7 Days)
                                </div>
                                <div className="mt-2 text-xs text-zinc-400 overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-zinc-500">
                                                <td className="pr-4">Query</td>
                                                <td className="pr-4 text-right">Clicks</td>
                                                <td className="pr-4 text-right">Impressions</td>
                                                <td className="text-right">CTR</td>
                                            </tr>
                                        </thead>
                                        <tbody className="text-zinc-300">
                                            <tr><td className="pr-4">best crm software</td><td className="pr-4 text-right text-emerald-400">892</td><td className="pr-4 text-right">12.4K</td><td className="text-right">7.2%</td></tr>
                                            <tr><td className="pr-4">saas analytics tool</td><td className="pr-4 text-right text-emerald-400">654</td><td className="pr-4 text-right">8.9K</td><td className="text-right">7.3%</td></tr>
                                            <tr><td className="pr-4">website performance</td><td className="pr-4 text-right text-emerald-400">521</td><td className="pr-4 text-right">15.2K</td><td className="text-right">3.4%</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </ChatMessage>
                            <ChatMessage sender="You" avatar="👤" delay={2.4}>
                                The CTR on &quot;website performance&quot; is low. Fix the meta title.
                            </ChatMessage>
                            <ChatMessage sender="GrowClaw" avatar="🤖" delay={3.0} isBot>
                                <span className="text-emerald-400">✓ Updated meta title</span> on /blog/website-performance
                                <br />
                                <span className="text-zinc-400">Committed to</span>{' '}
                                <span className="text-cyan-400">main</span> ·{' '}
                                <span className="text-zinc-500">a3f8d2c</span>
                            </ChatMessage>
                        </div>
                    </div>
                </motion.div>

                {/* Trust bar */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1 }}
                    className="mt-16 flex flex-wrap items-center justify-center gap-8 text-zinc-600 text-sm"
                >
                    <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> SOC 2 Ready</span>
                    <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> Works with any website</span>
                    <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> Setup in 2 minutes</span>
                </motion.div>
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
            icon: Bot,
            title: 'AI Agent on Telegram',
            description: 'Ask anything in natural language. Your agent fetches analytics, inspects URLs, commits code fixes, and manages your repos.',
            gradient: 'from-emerald-400 to-emerald-600',
            tag: 'Core',
        },
        {
            icon: BarChart3,
            title: 'Analytics Intelligence',
            description: 'Not just dashboards — smart insights. See traffic trends, bounce rates by device, conversion funnels, and realtime visitors.',
            gradient: 'from-cyan-400 to-blue-500',
            tag: 'Insights',
        },
        {
            icon: Search,
            title: 'SEO Intelligence',
            description: 'Keyword gap analysis, content decay detection, cannibalization alerts. See opportunities Google Search Console hides from you.',
            gradient: 'from-violet-400 to-purple-600',
            tag: 'Growth',
        },
        {
            icon: Code,
            title: 'Auto-Fix Issues',
            description: 'Low CTR? The bot rewrites your meta tags. Broken link? It fixes the code and pushes to GitHub. Hands-free optimization.',
            gradient: 'from-amber-400 to-orange-500',
            tag: 'Automation',
        },
        {
            icon: GitBranch,
            title: 'Full GitHub Integration',
            description: 'Clone repos, create branches, commit changes, open PRs — all through chat. Your AI pair programmer that never sleeps.',
            gradient: 'from-pink-400 to-rose-500',
            tag: 'DevOps',
        },
        {
            icon: Globe,
            title: 'Multi-Site Support',
            description: 'Manage all your websites from one dashboard. Compare performance, spot trends across properties, share reports with your team.',
            gradient: 'from-teal-400 to-emerald-500',
            tag: 'Scale',
        },
    ];

    return (
        <Section id="features" className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-emerald-400 mb-4">
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
                        GrowClaw brings everything into one intelligent interface.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.title}
                            variants={fadeUp}
                            className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300"
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
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-cyan-400 mb-4">
                        LIVE PREVIEW
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        See your data like{' '}
                        <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                            never before
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

                    <div className="relative bg-[#0c0c10] border border-white/[0.08] rounded-2xl overflow-hidden">
                        {/* Dashboard header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
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
                            <KPICard label="Active Users" value="3,420" change="+18.2%" positive />
                            <KPICard label="Sessions" value="5,200" change="+12.4%" positive />
                            <KPICard label="Bounce Rate" value="34.2%" change="-3.1%" positive />
                            <KPICard label="Avg Duration" value="2m 48s" change="+0.4%" positive />
                        </div>

                        {/* Charts row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 pb-6">
                            {/* Traffic chart - spans 2 cols */}
                            <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
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
                                                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px' }}
                                                labelStyle={{ color: '#a1a1aa' }}
                                            />
                                            <Area type="monotone" dataKey="sessions" stroke="#22d3ee" strokeWidth={2} fill="url(#gradientSessions)" />
                                            <Area type="monotone" dataKey="users" stroke="#34d399" strokeWidth={2} fill="url(#gradientUsers)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Traffic sources */}
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
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
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
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
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
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
   COMPARISON SECTION
   ═══════════════════════════════════════ */

function Comparison() {
    const items = [
        {
            traditional: 'Google Analytics → raw data tables, confusing navigation',
            growclaw: 'Visual KPI cards, trend charts, AI summaries — in plain English',
            icon: BarChart3
        },
        {
            traditional: 'Search Console → limited filtering, no actionable insights',
            growclaw: 'Keyword gaps, content decay alerts, auto-fix suggestions',
            icon: Search
        },
        {
            traditional: 'Manual SEO → check tools, write fixes, commit, deploy, pray',
            growclaw: 'Tell the bot what to fix → it commits the code → done',
            icon: Code
        },
    ];

    return (
        <Section className="py-32 px-6">
            <div className="max-w-5xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Stop drowning in{' '}
                        <span className="line-through text-zinc-600">data</span>.{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Start growing.
                        </span>
                    </h2>
                </motion.div>

                <div className="space-y-4">
                    {items.map((item, i) => (
                        <motion.div
                            key={i}
                            variants={fadeUp}
                            className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-center"
                        >
                            {/* Old way */}
                            <div className="p-5 rounded-xl bg-red-500/[0.04] border border-red-500/[0.1] text-sm text-zinc-400">
                                <span className="text-red-400 text-xs font-semibold uppercase tracking-wider block mb-2">Before</span>
                                {item.traditional}
                            </div>

                            {/* Arrow */}
                            <div className="hidden md:flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center justify-center">
                                    <ArrowRight className="w-5 h-5 text-black" />
                                </div>
                            </div>

                            {/* New way */}
                            <div className="p-5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1] text-sm text-zinc-300">
                                <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider block mb-2">With GrowClaw</span>
                                {item.growclaw}
                            </div>
                        </motion.div>
                    ))}
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
            role: 'Founder, TechStack.io',
            text: 'GrowClaw found keyword cannibalization issues we missed for months. Our organic traffic jumped 34% after the bot fixed our meta tags.',
            avatar: '👩‍💻',
            stars: 5,
        },
        {
            name: 'Marcus Rodriguez',
            role: 'CTO, ShipFast',
            text: 'I just tell it "fix the bounce rate on /pricing" and it actually commits the changes. No more context-switching between analytics and code.',
            avatar: '👨‍💼',
            stars: 5,
        },
        {
            name: 'Priya Patel',
            role: 'Marketing Lead, CloudBase',
            text: 'The content decay detection saved us. We caught 12 pages losing rank before they dropped off the first page entirely.',
            avatar: '👩‍🎨',
            stars: 5,
        },
    ];

    return (
        <Section className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-amber-400 mb-4">
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
                            className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
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
   PRICING SECTION
   ═══════════════════════════════════════ */

function Pricing() {
    const plans = [
        {
            name: 'Free',
            price: '$0',
            period: 'forever',
            description: 'Get started with the basics',
            features: [
                '1 AI bot instance',
                'Basic analytics dashboard',
                '7-day data retention',
                'Google Analytics integration',
                'Community support',
            ],
            cta: 'Start Free',
            highlighted: false,
        },
        {
            name: 'Pro',
            price: '$29',
            period: '/month',
            description: 'For serious growth',
            features: [
                '3 AI bot instances',
                'Full analytics + SEO dashboard',
                '90-day data retention',
                'Keyword gap analysis',
                'Content decay alerts',
                'Auto-fix (bot commits code)',
                'Priority support',
            ],
            cta: 'Start Pro Trial',
            highlighted: true,
        },
        {
            name: 'Enterprise',
            price: '$99',
            period: '/month',
            description: 'Unlimited everything',
            features: [
                'Unlimited AI bots',
                'Full dashboard + API access',
                '1-year data retention',
                'All SEO intelligence features',
                'Custom AI recommendations',
                'White-label reports',
                'Dedicated support',
            ],
            cta: 'Contact Sales',
            highlighted: false,
        },
    ];

    return (
        <Section id="pricing" className="py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-violet-400 mb-4">
                        PRICING
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                        Simple, transparent{' '}
                        <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                            pricing
                        </span>
                    </h2>
                    <p className="text-zinc-400 text-lg">No hidden fees. Cancel anytime.</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {plans.map((plan, i) => (
                        <motion.div
                            key={plan.name}
                            variants={fadeUp}
                            className={`relative p-6 rounded-2xl border transition-all duration-300 ${plan.highlighted
                                ? 'bg-gradient-to-b from-emerald-500/[0.08] to-transparent border-emerald-500/[0.2] hover:border-emerald-500/[0.3]'
                                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                                }`}
                        >
                            {plan.highlighted && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[10px] font-bold text-black uppercase tracking-wider">
                                    Most Popular
                                </div>
                            )}

                            <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                            <p className="text-xs text-zinc-500 mb-4">{plan.description}</p>

                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-bold text-white">{plan.price}</span>
                                <span className="text-sm text-zinc-500">{plan.period}</span>
                            </div>

                            <button
                                onClick={() => signIn('google')}
                                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 mb-6 ${plan.highlighted
                                    ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:shadow-[0_0_24px_rgba(52,211,153,0.3)]'
                                    : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                                    }`}
                            >
                                {plan.cta}
                            </button>

                            <ul className="space-y-3">
                                {plan.features.map((feature, j) => (
                                    <li key={j} className="flex items-center gap-2 text-sm text-zinc-400">
                                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? 'text-emerald-400' : 'text-zinc-600'}`} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
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
    const s1 = useCountUp(3420);
    const s2 = useCountUp(12, 1500);
    const s3 = useCountUp(99, 1800);
    const s4 = useCountUp(2, 800);

    const stats = [
        { ref: s1.ref, value: `${s1.count.toLocaleString()}+`, label: 'Bots Deployed', suffix: '' },
        { ref: s2.ref, value: `${s2.count}M+`, label: 'Queries Analyzed', suffix: '' },
        { ref: s3.ref, value: `${s3.count}.9%`, label: 'Uptime', suffix: '' },
        { ref: s4.ref, value: `${s4.count} min`, label: 'Setup Time', suffix: '' },
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
            description: 'Sign in with Google or GitHub. We auto-detect your analytics properties, search console sites, and repos.',
            icon: Globe,
            gradient: 'from-emerald-400 to-emerald-600',
            details: ['Google Analytics 4', 'Search Console', 'GitHub Repos'],
        },
        {
            step: '02',
            title: 'Deploy Your AI Bot',
            description: 'Paste your Telegram bot token and GrowClaw spins up a personal AI agent in under 2 minutes.',
            icon: Bot,
            gradient: 'from-cyan-400 to-blue-500',
            details: ['Telegram integration', 'Natural language', 'Always online'],
        },
        {
            step: '03',
            title: 'Grow on Autopilot',
            description: 'Ask questions, get insights, and let the bot fix issues. Content decay alerts, keyword gaps, code commits — all automatic.',
            icon: TrendingUp,
            gradient: 'from-violet-400 to-purple-600',
            details: ['Auto-fix code', 'SEO alerts', 'Growth insights'],
        },
    ];

    return (
        <Section className="py-32 px-6">
            <div className="max-w-5xl mx-auto">
                <motion.div variants={fadeUp} className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-cyan-400 mb-4">
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
                                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#09090b] border-2 border-white/[0.1] flex items-center justify-center">
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
                                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-400"
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
        { name: 'Next.js', icon: '▲' },
        { name: 'Vercel', icon: '▼' },
        { name: 'React', icon: '⚛️' },
        { name: 'Node.js', icon: '🟢' },
        { name: 'Python', icon: '🐍' },
        { name: 'WordPress', icon: '📝' },
        { name: 'Shopify', icon: '🛍️' },
        { name: 'Stripe', icon: '💳' },
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
                <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#09090b] to-transparent z-10" />
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#09090b] to-transparent z-10" />

                <div className="marquee-track">
                    {doubled.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 px-6 py-3 mx-2 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300 flex-shrink-0"
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
                            Ready to grow?
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">
                            Join builders who use AI to understand their data and ship faster.
                            Start free — no credit card required.
                        </p>
                        <button
                            onClick={() => signIn('google')}
                            className="group px-10 py-4 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] transition-all duration-300"
                        >
                            Start Growing — It&apos;s Free
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
        <footer className="border-t border-white/[0.06] py-12 px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-black" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-bold text-white">
                        Grow<span className="text-emerald-400">Claw</span>
                    </span>
                </div>

                <div className="flex items-center gap-6 text-sm text-zinc-500">
                    <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
                    <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
                    <a href="#" className="hover:text-zinc-300 transition-colors">Docs</a>
                    <a href="mailto:support@growclaw.com" className="hover:text-zinc-300 transition-colors">Contact</a>
                </div>

                <div className="text-xs text-zinc-600">
                    © 2025 GrowClaw. All rights reserved.
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
            <Features />
            <HowItWorks />
            <InteractiveDemo />
            <IntegrationMarquee />
            <Comparison />
            <Testimonials />
            <Pricing />
            <FinalCTA />
            <Footer />
        </>
    );
}
