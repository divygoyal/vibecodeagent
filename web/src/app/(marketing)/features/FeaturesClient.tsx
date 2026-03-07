'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
    BarChart3, Search, Bot, MessageSquare, ScanSearch, Globe,
    TrendingUp, Zap, Shield, ArrowRight, CheckCircle2,
    Bell, Download, Brain, Eye, Target
} from 'lucide-react';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
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
        desc: 'Real-time traffic data from Google Analytics 4. See users, sessions, page views, bounce rate, and traffic sources at a glance.',
        color: 'text-blue-400',
        gradient: 'from-blue-500/10 to-cyan-500/10',
        highlights: ['Real-time active users', 'Traffic source breakdown', 'Page-level analytics', 'Session duration tracking'],
    },
    {
        icon: Search,
        title: 'SEO Intelligence',
        desc: 'Google Search Console data with AI-powered insights. Track rankings, clicks, impressions, and CTR across all your keywords.',
        color: 'text-emerald-400',
        gradient: 'from-emerald-500/10 to-green-500/10',
        highlights: ['Keyword ranking tracker', 'CTR optimization alerts', 'Striking distance finder', 'Position change monitoring'],
    },
    {
        icon: MessageSquare,
        title: 'AI Chat Assistant',
        desc: 'Ask questions about your data in plain English. The AI analyzes your real analytics and SEO data to give actionable answers.',
        color: 'text-violet-400',
        gradient: 'from-violet-500/10 to-purple-500/10',
        highlights: ['Natural language queries', 'Data-backed responses', 'Content strategy generation', 'Revenue impact calculator'],
    },
    {
        icon: ScanSearch,
        title: 'Site Audit',
        desc: 'Comprehensive technical SEO audit of any page. Check meta tags, headings, images, links, performance, and accessibility.',
        color: 'text-amber-400',
        gradient: 'from-amber-500/10 to-orange-500/10',
        highlights: ['100+ audit checks', 'Priority-ranked issues', 'Fix suggestions', 'Exportable reports'],
    },
    {
        icon: Bot,
        title: 'Telegram Bot',
        desc: 'Get analytics and SEO updates right in Telegram. Ask your bot about traffic, rankings, and get daily digest reports.',
        color: 'text-cyan-400',
        gradient: 'from-cyan-500/10 to-blue-500/10',
        highlights: ['Daily traffic digests', 'Ranking drop alerts', 'On-demand queries', 'Isolated per-user container'],
    },
    {
        icon: Bell,
        title: 'Smart Alerts',
        desc: 'Proactive anomaly detection for traffic drops, ranking changes, and SEO issues. Get notified before problems escalate.',
        color: 'text-red-400',
        gradient: 'from-red-500/10 to-pink-500/10',
        highlights: ['Traffic anomaly detection', 'Ranking drop alerts', 'Severity classification', 'Actionable recommendations'],
    },
    {
        icon: Brain,
        title: 'AI SEO Tools',
        desc: 'Generate schema markup, blog outlines, keyword clusters, and internal linking suggestions powered by AI.',
        color: 'text-pink-400',
        gradient: 'from-pink-500/10 to-rose-500/10',
        highlights: ['Schema generator', 'Blog outline creator', 'Keyword clustering', 'Internal link finder'],
    },
    {
        icon: Download,
        title: 'Export & Reports',
        desc: 'Export your analytics and SEO data as CSV or JSON. Perfect for client reports, team reviews, or further analysis.',
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
                        <p className="text-lg text-zinc-400 max-w-xl mx-auto">
                            Analytics, SEO, AI insights, and automation — unified in one beautiful dashboard.
                        </p>
                    </motion.div>
                </div>
            </Section>

            {/* Feature Grid */}
            <Section className="pb-24 px-6">
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                    {FEATURES.map((feature, i) => {
                        const Icon = feature.icon;
                        return (
                            <motion.div
                                key={i}
                                variants={fadeUp}
                                className={`p-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br ${feature.gradient} hover:border-white/[0.12] transition-all group`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.06] flex-shrink-0">
                                        <Icon className={`w-6 h-6 ${feature.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">{feature.desc}</p>
                                        <ul className="grid grid-cols-2 gap-2">
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
            </Section>

            {/* Stats */}
            <Section className="pb-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { label: 'Audit Checks', value: '100+' },
                            { label: 'AI Tools', value: '10+' },
                            { label: 'Export Formats', value: '2' },
                            { label: 'Uptime', value: '99.9%' },
                        ].map((stat, i) => (
                            <div key={i} className="text-center p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
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
                            { q: 'How does the AI Chat work?', a: 'The AI Chat uses Google Gemini to analyze your real analytics and SEO data. Ask questions in plain English like "why is my traffic dropping?" and get data-backed answers with specific evidence and actionable recommendations.' },
                            { q: 'What does the Site Audit check?', a: 'Our audit runs 100+ checks covering meta tags, heading structure, image optimization, internal links, page speed indicators, mobile-friendliness, accessibility, and structured data validation.' },
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
