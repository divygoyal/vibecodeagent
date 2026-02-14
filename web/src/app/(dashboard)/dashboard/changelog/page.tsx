'use client';

import { Rocket, Bug, Sparkles, Wrench, ArrowUpRight } from 'lucide-react';

interface ChangelogEntry {
    version: string;
    date: string;
    title: string;
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    items: string[];
}

const CHANGELOG: ChangelogEntry[] = [
    {
        version: '1.4.0',
        date: '2026-02-14',
        title: 'Interactive World Map & Dashboard Polish',
        type: 'feature',
        items: [
            'Added interactive visitor world map with real-time pulsing dots',
            'Dashboard overview now shows live KPIs with sparkline charts',
            'AI recommendations preview on overview page',
            'Settings page: connected services, notification toggles, API key management',
        ],
    },
    {
        version: '1.3.0',
        date: '2026-02-13',
        title: 'Analytics & SEO Dashboards',
        type: 'feature',
        items: [
            'Full Google Analytics 4 integration — traffic trends, sources, devices, countries',
            'SEO Intelligence dashboard with AI recommendations',
            'Search trend charts and keyword/page performance tables',
            'API layer for analytics and SEO data proxying',
        ],
    },
    {
        version: '1.2.0',
        date: '2026-02-12',
        title: 'Dashboard Restructure',
        type: 'improvement',
        items: [
            'New collapsible sidebar with premium dark theme',
            'Reorganized dashboard into Overview, Bot, Analytics, SEO, Settings',
            'Mobile-responsive layout with hamburger menu',
            'Bot status pipeline with live connection tracking',
        ],
    },
    {
        version: '1.1.0',
        date: '2026-02-11',
        title: 'Landing Page Launch',
        type: 'feature',
        items: [
            'Premium marketing landing page with glassmorphism design',
            'Interactive demo section, stats bar, testimonials',
            'Comparison section, pricing cards, integration marquee',
            'Animated counters and scroll-based animations',
        ],
    },
    {
        version: '1.0.0',
        date: '2026-02-10',
        title: 'Initial Release',
        type: 'feature',
        items: [
            'Telegram bot provisioning and management',
            'GitHub OAuth authentication',
            'Google OAuth with Analytics and Search Console scopes',
            'Container-based bot deployment architecture',
        ],
    },
    {
        version: '0.9.0',
        date: '2026-02-08',
        title: 'Bug Fixes & Stability',
        type: 'fix',
        items: [
            'Fixed bot hallucination of data when plugins are not configured',
            'Resolved GSC token scope issue — added proper OAuth scopes',
            'Fixed user lookup in sync endpoint for multi-provider auth',
            'Container health checks now handle startup latency gracefully',
        ],
    },
];

const typeConfig: Record<string, { icon: typeof Rocket; color: string; bg: string; label: string }> = {
    feature: { icon: Rocket, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'New Feature' },
    fix: { icon: Bug, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Bug Fix' },
    improvement: { icon: Sparkles, color: 'text-cyan-400', bg: 'bg-cyan-400/10', label: 'Improvement' },
    breaking: { icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Breaking Change' },
};

export default function ChangelogPage() {
    return (
        <div className="max-w-3xl mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Changelog</h1>
                <p className="text-sm text-zinc-500">What&apos;s new in GrowClaw — updates, features, and fixes.</p>
            </div>

            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[17px] top-5 bottom-5 w-px bg-white/[0.06]" />

                <div className="space-y-8">
                    {CHANGELOG.map(entry => {
                        const config = typeConfig[entry.type];
                        const Icon = config.icon;
                        return (
                            <div key={entry.version} className="relative pl-12">
                                {/* Timeline dot */}
                                <div className={`absolute left-0 top-0 w-[34px] h-[34px] rounded-xl ${config.bg} flex items-center justify-center z-10`}>
                                    <Icon className={`w-4 h-4 ${config.color}`} />
                                </div>

                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-white font-semibold text-sm">{entry.title}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${config.bg} ${config.color} font-medium`}>
                                                {config.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-zinc-600 font-mono">{entry.version}</span>
                                            <span className="text-[10px] text-zinc-600">{entry.date}</span>
                                        </div>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {entry.items.map((item, j) => (
                                            <li key={j} className="flex items-start gap-2 text-sm text-zinc-400">
                                                <span className={`w-1 h-1 rounded-full ${config.color.replace('text-', 'bg-')} mt-2 flex-shrink-0`} />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
