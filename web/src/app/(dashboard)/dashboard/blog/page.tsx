'use client';

import { useState } from 'react';
import { Calendar, Clock, ArrowUpRight, TrendingUp, Search, Bot, BarChart3, Lightbulb, Shield, Zap, Brain } from 'lucide-react';

interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    readTime: string;
    category: string;
    categoryColor: string;
    icon: typeof Bot;
}

const POSTS: BlogPost[] = [
    {
        slug: 'ai-analyst-verdicts-not-advice',
        title: 'Why TrafficClaw Gives Verdicts, Not Advice',
        excerpt: 'Most SEO tools give you generic advice. TrafficClaw\'s AI Analyst analyzes your actual data — GA4 traffic, Search Console rankings, CTR benchmarks — and delivers specific, actionable verdicts with evidence.',
        date: 'Mar 5, 2026',
        readTime: '5 min read',
        category: 'Product',
        categoryColor: 'emerald',
        icon: Brain,
    },
    {
        slug: 'subscription-plans-launch',
        title: 'Introducing Monthly Plans: Starter, Growth & Pro',
        excerpt: 'We\'ve launched three subscription tiers — Starter ($9/mo, 50 credits), Growth ($19/mo, 150 credits), and Pro ($29/mo, 300 credits + Telegram bot). Every new account gets 10 free AI messages to try it out.',
        date: 'Mar 4, 2026',
        readTime: '4 min read',
        category: 'Announcement',
        categoryColor: 'violet',
        icon: Zap,
    },
    {
        slug: 'ai-visibility-aeo-optimization',
        title: 'AI Visibility & AEO: How to Get Cited by AI Search',
        excerpt: 'AI search engines like ChatGPT and Perplexity are changing how people find information. TrafficClaw now tracks your AI visibility score and helps you optimize for Answer Engine Optimization (AEO).',
        date: 'Mar 2, 2026',
        readTime: '7 min read',
        category: 'AI & SEO',
        categoryColor: 'cyan',
        icon: Search,
    },
    {
        slug: 'telegram-bot-pro-plan',
        title: 'Your Personal SEO Bot on Telegram — Pro Plan Deep Dive',
        excerpt: 'With the Pro plan, connect your own Telegram bot and get deep analytics insights, search performance analysis, and content strategies — all from a natural chat conversation on your phone.',
        date: 'Feb 28, 2026',
        readTime: '6 min read',
        category: 'Product',
        categoryColor: 'emerald',
        icon: Bot,
    },
    {
        slug: 'striking-distance-keywords',
        title: 'Striking Distance Keywords: The Fastest Way to Page 1',
        excerpt: 'Keywords ranking on positions 4-20 with high impressions are your biggest opportunity. Learn how TrafficClaw\'s AI identifies these "striking distance" keywords and tells you exactly how to push them up.',
        date: 'Feb 25, 2026',
        readTime: '8 min read',
        category: 'SEO Strategy',
        categoryColor: 'amber',
        icon: TrendingUp,
    },
    {
        slug: 'daily-briefing-feature',
        title: 'Start Your Day with an AI Briefing',
        excerpt: 'TrafficClaw now auto-generates a daily briefing when you open AI Chat — overnight traffic changes, ranking shifts, anomaly alerts, and the #1 action you should take today. All powered by your live data.',
        date: 'Feb 22, 2026',
        readTime: '4 min read',
        category: 'Product',
        categoryColor: 'emerald',
        icon: BarChart3,
    },
    {
        slug: 'site-audit-security',
        title: 'Site Audits: Catch Broken Links, Missing Meta, and Security Issues',
        excerpt: 'TrafficClaw\'s site audit crawls your pages for broken links, missing meta tags, schema errors, SSL issues, and Core Web Vitals problems. Get a prioritized list of fixes with estimated impact.',
        date: 'Feb 18, 2026',
        readTime: '6 min read',
        category: 'Technical SEO',
        categoryColor: 'pink',
        icon: Shield,
    },
    {
        slug: 'growth-hacking-with-ai',
        title: '5 Growth Hacks Using AI-Powered SEO Analysis',
        excerpt: 'From automated content decay detection to CTR optimization for high-impression pages — five data-driven strategies to accelerate your organic growth using TrafficClaw\'s AI analyst.',
        date: 'Feb 14, 2026',
        readTime: '7 min read',
        category: 'Growth',
        categoryColor: 'pink',
        icon: Lightbulb,
    },
];

const categoryColors: Record<string, string> = {
    emerald: 'bg-emerald-400/10 text-emerald-400',
    cyan: 'bg-cyan-400/10 text-cyan-400',
    violet: 'bg-violet-400/10 text-violet-400',
    amber: 'bg-amber-400/10 text-amber-400',
    pink: 'bg-pink-400/10 text-pink-400',
};

export default function BlogPage() {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = [...new Set(POSTS.map(p => p.category))];
    const filtered = selectedCategory ? POSTS.filter(p => p.category === selectedCategory) : POSTS;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Blog</h1>
                <p className="text-sm text-zinc-500">Product updates, SEO strategies, and AI-powered growth insights.</p>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${!selectedCategory ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    All
                </button>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${selectedCategory === cat ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Featured post */}
            {!selectedCategory && POSTS[0] && (
                <div className="bg-gradient-to-br from-emerald-400/[0.05] to-cyan-400/[0.05] border border-emerald-400/[0.1] rounded-2xl p-6 group cursor-pointer hover:border-emerald-400/[0.2] transition-all">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] bg-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">FEATURED</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${categoryColors[POSTS[0].categoryColor]}`}>{POSTS[0].category}</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors">{POSTS[0].title}</h2>
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">{POSTS[0].excerpt}</p>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-zinc-600">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {POSTS[0].date}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {POSTS[0].readTime}</span>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-emerald-400 group-hover:gap-2 transition-all">
                            Read more <ArrowUpRight className="w-3 h-3" />
                        </span>
                    </div>
                </div>
            )}

            {/* Post grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(selectedCategory ? filtered : POSTS.slice(1)).map(post => {
                    const Icon = post.icon;
                    return (
                        <article
                            key={post.slug}
                            className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-all group cursor-pointer"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                                    <Icon className="w-3.5 h-3.5 text-zinc-400" />
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${categoryColors[post.categoryColor]}`}>{post.category}</span>
                            </div>
                            <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-emerald-300 transition-colors leading-snug">{post.title}</h3>
                            <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{post.excerpt}</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                                    <span>{post.date}</span>
                                    <span>{post.readTime}</span>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-emerald-400 transition-colors" />
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
