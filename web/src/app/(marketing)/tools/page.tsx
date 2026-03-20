'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    FileText, BookOpen, Globe, Sparkles, GitCompareArrows, ArrowRight
} from 'lucide-react';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
};

const tools = [
    {
        icon: FileText,
        title: 'Robots.txt Analyzer',
        description: 'Check your robots.txt for issues and AI crawler access',
        href: '/tools/robots-analyzer',
        gradient: 'from-blue-500/20 to-cyan-500/20',
        iconColor: 'text-blue-400',
    },
    {
        icon: BookOpen,
        title: 'Readability Checker',
        description: 'Analyze content readability with Flesch-Kincaid scoring',
        href: '/tools/readability-checker',
        gradient: 'from-emerald-500/20 to-green-500/20',
        iconColor: 'text-emerald-400',
    },
    {
        icon: Globe,
        title: 'Hreflang Validator',
        description: 'Validate international targeting with hreflang tag checks',
        href: '/tools/hreflang-validator',
        gradient: 'from-violet-500/20 to-purple-500/20',
        iconColor: 'text-violet-400',
    },
    {
        icon: Sparkles,
        title: 'AI Search Readiness',
        description: 'Check if your content is optimized for AI search engines',
        href: '/tools/ai-search-readiness',
        gradient: 'from-amber-500/20 to-orange-500/20',
        iconColor: 'text-amber-400',
    },
    {
        icon: GitCompareArrows,
        title: 'Comparison Builder',
        description: 'Generate professional comparison pages with schema markup',
        href: '/tools/comparison-builder',
        gradient: 'from-pink-500/20 to-rose-500/20',
        iconColor: 'text-pink-400',
    },
];

export default function ToolsIndexPage() {
    return (
        <div className="min-h-screen pt-24 pb-20">
            {/* Hero */}
            <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="max-w-4xl mx-auto text-center px-6 mb-16"
            >
                <motion.h1
                    variants={fadeUp}
                    className="text-4xl sm:text-5xl font-bold tracking-tight mb-4"
                >
                    Free{' '}
                    <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        SEO Tools
                    </span>
                </motion.h1>
                <motion.p
                    variants={fadeUp}
                    className="text-lg text-zinc-400 max-w-2xl mx-auto"
                >
                    No sign-up required. Analyze your site, check readability, validate
                    hreflang tags, and test AI search readiness — all for free.
                </motion.p>
            </motion.div>

            {/* Tools Grid */}
            <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5"
            >
                {tools.map((tool) => (
                    <motion.div key={tool.href} variants={fadeUp}>
                        <Link
                            href={tool.href}
                            className={`group block rounded-2xl border border-white/[0.06] bg-gradient-to-br ${tool.gradient} p-4 sm:p-6 hover:border-white/[0.12] transition-all duration-300 hover:scale-[1.02]`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`p-2.5 rounded-xl bg-white/[0.06] ${tool.iconColor}`}>
                                    <tool.icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-emerald-400 transition-colors">
                                        {tool.title}
                                    </h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        {tool.description}
                                    </p>
                                    <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-emerald-400 group-hover:gap-2 transition-all">
                                        Use Tool <ArrowRight className="w-4 h-4" />
                                    </span>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </motion.div>

            {/* Bottom CTA */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="max-w-4xl mx-auto text-center px-6 mt-16"
            >
                <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 p-4 sm:p-8">
                    <h2 className="text-xl sm:text-2xl font-bold mb-2">Want deeper insights?</h2>
                    <p className="text-zinc-400 mb-5">
                        Connect Google Analytics & Search Console for AI-powered recommendations.
                    </p>
                    <Link
                        href="/pricing"
                        className="inline-flex items-center gap-2 px-6 py-3 min-h-[44px] text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Sign up for free <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
