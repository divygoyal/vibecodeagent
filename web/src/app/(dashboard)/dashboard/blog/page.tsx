'use client';

import { useState } from 'react';
import { Calendar, Clock, ArrowUpRight, Tag, TrendingUp, Search, Bot, BarChart3, Lightbulb } from 'lucide-react';

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
        slug: 'ai-seo-automation',
        title: 'How AI is Revolutionizing SEO Automation in 2026',
        excerpt: 'Discover how GrowClaw uses AI to detect content decay, find keyword gaps, and generate optimization strategies — all from your Telegram bot.',
        date: 'Feb 14, 2026',
        readTime: '6 min read',
        category: 'AI & SEO',
        categoryColor: 'emerald',
        icon: Search,
    },
    {
        slug: 'telegram-bot-devops',
        title: 'Managing Your Website from Telegram: A DevOps Guide',
        excerpt: 'Learn how to deploy changes, monitor analytics, and get real-time alerts — all from a single Telegram conversation with your GrowClaw bot.',
        date: 'Feb 12, 2026',
        readTime: '8 min read',
        category: 'Engineering',
        categoryColor: 'cyan',
        icon: Bot,
    },
    {
        slug: 'analytics-dashboard-deep-dive',
        title: 'Building a Real-Time Analytics Dashboard with GA4',
        excerpt: 'How we built GrowClaw\'s analytics dashboard using the GA4 Data API, including traffic trends, source attribution, and the interactive world map.',
        date: 'Feb 10, 2026',
        readTime: '10 min read',
        category: 'Product',
        categoryColor: 'violet',
        icon: BarChart3,
    },
    {
        slug: 'content-decay-detection',
        title: 'Content Decay: Catching Declining Pages Before It\'s Too Late',
        excerpt: 'GrowClaw\'s AI monitors your pages for traffic decline and position drops, alerting you via Telegram before you lose significant organic traffic.',
        date: 'Feb 8, 2026',
        readTime: '5 min read',
        category: 'SEO Strategy',
        categoryColor: 'amber',
        icon: TrendingUp,
    },
    {
        slug: 'growth-hacking-with-bots',
        title: '5 Growth Hacks Using AI-Powered Telegram Bots',
        excerpt: 'From automated keyword tracking to real-time competitor analysis — five actionable strategies to accelerate your website growth with GrowClaw.',
        date: 'Feb 6, 2026',
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
                <p className="text-sm text-zinc-500">Insights on SEO, AI automation, growth strategies, and product updates.</p>
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
