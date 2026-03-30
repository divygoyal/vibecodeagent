'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
    BarChart3, Search, Bot, MessageSquare, ScanSearch, Globe,
    TrendingUp, Zap, Shield, ArrowRight, CheckCircle2,
    Bell, Download, Brain, Eye, Target, Sparkles, Code2, Users
} from 'lucide-react';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.08 } }
};

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-80px' });
    return (
        <motion.section
            ref={ref}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={stagger}
            className={`relative ${className}`}
        >
            {children}
        </motion.section>
    );
}

const FEATURES = [
    {
        icon: BarChart3,
        title: 'Analytics Dashboard',
        desc: 'Real-time traffic from Google Analytics 4. Users, sessions, pages, bounce rate, sources — all in one view.',
        color: 'text-blue-400',
        gradient: 'from-blue-500/10 to-cyan-500/10',
        highlights: ['Real-time active users', 'Traffic source breakdown', 'Page-level analytics', 'Session duration tracking'],
    },
    {
        icon: Search,
        title: 'SEO Intelligence',
        desc: 'Google Search Console with AI insights. Rankings, clicks, impressions, CTR — with striking distance opportunities.',
        color: 'text-emerald-400',
        gradient: 'from-emerald-500/10 to-green-500/10',
        highlights: ['Keyword ranking tracker', 'CTR optimization alerts', 'Striking distance finder', 'Position change monitoring'],
    },
    {
        icon: MessageSquare,
        title: 'AI Chat Assistant',
        desc: 'Ask about your data in plain English. Powered by Gemini with function calling — it reads your actual analytics.',
        color: 'text-violet-400',
        gradient: 'from-violet-500/10 to-purple-500/10',
        highlights: ['Natural language queries', 'Data-backed responses', 'Content strategy generation', 'Revenue impact calculator'],
    },
    {
        icon: ScanSearch,
        title: 'Site Audit',
        desc: '100+ checks on any URL. Meta tags, headings, images, links, speed, accessibility, structured data — all scored.',
        color: 'text-amber-400',
        gradient: 'from-amber-500/10 to-orange-500/10',
        highlights: ['100+ audit checks', 'Priority-ranked issues', 'Fix suggestions', 'Exportable reports'],
    },
    {
        icon: Bell,
        title: 'Smart Alerts',
        desc: 'Anomaly detection for traffic drops, ranking changes, and SEO issues. Get notified before problems escalate.',
        color: 'text-red-400',
        gradient: 'from-red-500/10 to-pink-500/10',
        highlights: ['Traffic anomaly detection', 'Ranking drop alerts', 'Severity classification', 'Actionable recommendations'],
    },
    {
        icon: Brain,
        title: 'AI Content Tools',
        desc: 'Generate schema markup, blog outlines, keyword clusters, and internal linking maps — all AI-powered.',
        color: 'text-pink-400',
        gradient: 'from-pink-500/10 to-rose-500/10',
        highlights: ['Schema generator', 'Blog outline creator', 'Keyword clustering', 'Internal link finder'],
    },
    {
        icon: Download,
        title: 'Export & Reports',
        desc: 'Download analytics and SEO data as CSV or JSON. Perfect for client reports and team reviews.',
        color: 'text-teal-400',
        gradient: 'from-teal-500/10 to-emerald-500/10',
        highlights: ['CSV & JSON export', 'Traffic reports', 'SEO performance data', 'Custom date ranges'],
    },
];

export default function FeaturesClient() {
    return (
        <div className="min-h-screen bg-black text-white">
            {/* Hero */}
            <Section className="pt-32 pb-16 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div variants={fadeUp}>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs font-medium mb-6 border border-violet-500/20">
                            FEATURES
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                            Everything you need to{' '}
                            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                grow your traffic
                            </span>
                        </h1>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            Analytics, SEO, AI insights, embeddable globe, Telegram bot — unified in one dashboard.
                            Most features are free. No credit card required.
                        </p>
                    </motion.div>
                </div>
            </Section>

            {/* ═══ HERO FEATURES: Globe + Telegram Bot ═══ */}
            <Section className="pb-16 px-6">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Globe Embed — standout feature */}
                    <motion.div
                        variants={fadeUp}
                        className="relative p-6 sm:p-8 rounded-2xl border border-emerald-500/20 overflow-hidden group"
                        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(8,12,24,0.95) 50%, rgba(6,182,212,0.06) 100%)' }}
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/[0.06] rounded-full blur-[80px] pointer-events-none" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                                    <Globe className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold text-white">Real-Time Globe</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Free</span>
                                    </div>
                                    <p className="text-xs text-zinc-500">Embeddable on any website</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                                A 3D interactive globe showing your live visitors in real time. Click any visitor marker to see their details.
                                Embed it on your website with one iframe — powered by your Google Analytics data.
                            </p>
                            <div className="grid grid-cols-2 gap-2 mb-5">
                                {['Live visitor markers', 'Click-to-view profiles', 'Activity feed', 'Country flags & stats', 'Adaptive polling', 'Works on any site'].map((h, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                        {h}
                                    </div>
                                ))}
                            </div>
                            <Link
                                href="/globe"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition"
                            >
                                See it live <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </motion.div>

                    {/* OpenClaw Telegram Bot — standout feature */}
                    <motion.div
                        variants={fadeUp}
                        className="relative p-6 sm:p-8 rounded-2xl border border-sky-500/20 overflow-hidden group"
                        style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(8,12,24,0.95) 50%, rgba(139,92,246,0.06) 100%)' }}
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/[0.06] rounded-full blur-[80px] pointer-events-none" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                                    <Bot className="w-6 h-6 text-sky-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold text-white">Telegram AI Agent</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/20 text-[9px] font-bold text-violet-400 uppercase tracking-wider">Pro</span>
                                    </div>
                                    <p className="text-xs text-zinc-500">Powered by OpenClaw</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                                Your own OpenClaw agent running inside Telegram — with Google Analytics and Search Console pre-connected.
                                Each user gets an isolated container. Ask questions, get alerts, run audits — all from your phone.
                            </p>
                            <div className="grid grid-cols-2 gap-2 mb-5">
                                {['OpenClaw powered agent', 'GA4 & GSC pre-connected', 'Isolated per-user container', 'Daily digest reports', 'On-demand queries', 'Runs 24/7 for you'].map((h, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                                        {h}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/pricing"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/20 transition"
                                >
                                    Get Pro <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                                <span className="text-[11px] text-zinc-500">Available on Pro plan</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </Section>

            {/* ═══ All Features Grid ═══ */}
            <Section className="pb-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <motion.div variants={fadeUp} className="text-center mb-12">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">And everything else you&apos;d expect</h2>
                        <p className="text-sm text-zinc-500">Every feature is included on every plan. No hidden gates.</p>
                    </motion.div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {FEATURES.map((feature, i) => {
                            const Icon = feature.icon;
                            return (
                                <motion.div
                                    key={i}
                                    variants={fadeUp}
                                    className={`p-5 sm:p-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br ${feature.gradient} hover:border-white/[0.12] transition-all group`}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/[0.06] flex-shrink-0 group-hover:scale-110 transition-transform">
                                            <Icon className={`w-5 h-5 ${feature.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-white mb-1.5">{feature.title}</h3>
                                            <p className="text-sm text-zinc-400 leading-relaxed mb-3">{feature.desc}</p>
                                            <ul className="grid grid-cols-2 gap-1.5">
                                                {feature.highlights.map((h, j) => (
                                                    <li key={j} className="flex items-center gap-2 text-xs text-zinc-300">
                                                        <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${feature.color}`} />
                                                        {h}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </Section>

            {/* Stats */}
            <Section className="pb-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        {[
                            { label: 'Audit Checks', value: '100+', color: 'text-amber-400' },
                            { label: 'AI Tools', value: '10+', color: 'text-violet-400' },
                            { label: 'Globe Embed', value: 'Free', color: 'text-emerald-400' },
                            { label: 'Uptime', value: '99.9%', color: 'text-cyan-400' },
                        ].map((stat, i) => (
                            <div key={i} className="text-center p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                                <div className={`text-3xl font-bold mb-1 ${stat.color}`}>{stat.value}</div>
                                <div className="text-xs text-zinc-500">{stat.label}</div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </Section>

            {/* FAQ */}
            <Section className="pb-24 px-6">
                <div className="max-w-3xl mx-auto">
                    <motion.div variants={fadeUp} className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-white mb-3">Feature FAQ</h2>
                        <p className="text-sm text-zinc-400">Common questions about TrafficClaw capabilities.</p>
                    </motion.div>
                    <motion.div variants={fadeUp} className="space-y-4">
                        {[
                            { q: 'What data sources does TrafficClaw support?', a: 'TrafficClaw connects to Google Analytics 4 and Google Search Console. We also integrate with GitHub for code-level SEO fixes and Telegram for mobile notifications and queries.' },
                            { q: 'How does the AI Chat work?', a: 'The AI Chat uses Google Gemini with function calling to analyze your real analytics and SEO data. It can run page audits, calculate revenue impact, and generate content strategies — all based on your actual data, not generic advice.' },
                            { q: 'Is the Globe Embed really free?', a: 'Yes. The embeddable real-time visitor globe is completely free for all users. The only paid perk is removing the small "Powered by TrafficClaw" watermark — available on any paid plan.' },
                            { q: 'What is the Telegram Bot powered by?', a: 'The Telegram bot is your own OpenClaw agent with Google Analytics and Search Console pre-connected. Each Pro user gets an isolated container that runs 24/7. Ask questions, get alerts, and run audits — all from Telegram.' },
                            { q: 'Can I use TrafficClaw for multiple websites?', a: 'Yes. Growth and Pro plans support multiple Google Analytics properties and Search Console sites. Switch between sites instantly from the dashboard.' },
                        ].map((faq, i) => (
                            <details key={i} className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-white list-none">
                                    {faq.q}
                                    <span className="text-zinc-500 group-open:rotate-45 transition-transform text-lg">+</span>
                                </summary>
                                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
                            </details>
                        ))}
                    </motion.div>
                </div>
            </Section>

            {/* CTA */}
            <Section className="pb-24 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <motion.div variants={fadeUp}>
                        <h2 className="text-3xl font-bold text-white mb-4">Ready to see your data come alive?</h2>
                        <p className="text-zinc-400 mb-8">Start free with 10 AI messages. No credit card required.</p>
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-xl hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all text-sm btn-press"
                            >
                                Get Started Free <ArrowRight className="w-4 h-4" />
                            </button>
                            <Link
                                href="/pricing"
                                className="text-sm text-zinc-400 hover:text-white font-medium transition-colors"
                            >
                                View pricing →
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </Section>
        </div>
    );
}
