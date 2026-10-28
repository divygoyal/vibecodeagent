'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Search, Quote, List, Image as ImageIcon, Shield } from 'lucide-react';

interface CategoryResult {
    name: string;
    score: number;
    findings: string[];
    recommendations: string[];
}

interface GeoResult {
    overallScore: number;
    categories: CategoryResult[];
}

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (Math.min(score, 100) / 100) * circumference;

    let color: string;
    if (score >= 70) color = 'var(--tc-up)';
    else if (score >= 50) color = 'var(--tc-warn)';
    else color = 'var(--tc-down)';

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tc-subtle)" strokeWidth="8" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold" style={{ color }}>{Math.round(score)}</span>
                <span className="text-xs text-fg-muted">/ 100</span>
            </div>
        </div>
    );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
    let color: string;
    if (score >= 70) color = 'bg-up';
    else if (score >= 50) color = 'bg-warn';
    else color = 'bg-down';

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-fg">{label}</span>
                <span className="text-sm font-semibold text-fg">{Math.round(score)}/100</span>
            </div>
            <div className="h-2 rounded-full bg-subtle overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${Math.min(score, 100)}%` }} />
            </div>
        </div>
    );
}

const categoryIcons: Record<string, React.ReactNode> = {
    'Citability': <Quote className="w-4 h-4" />,
    'Structural Readability': <List className="w-4 h-4" />,
    'Multi-modal Content': <ImageIcon aria-hidden className="w-4 h-4" />,
    'Authority Signals': <Shield className="w-4 h-4" />,
};

function Shimmer() {
    return (
        <div className="space-y-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-control bg-surface-sunken" />
            ))}
        </div>
    );
}

export default function AiSearchReadinessPage() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GeoResult | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch(`/api/tools?tool=geo&url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to analyze');
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="px-4 pt-10 pb-16 md:px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-control bg-brand-soft text-brand-soft-fg">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <h1 className="text-heading sm:text-heading-lg text-fg">AI Search Readiness</h1>
                    </div>
                    <p className="text-sm sm:text-base text-fg-secondary mb-8">
                        Check if your content is optimized for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.
                    </p>
                </motion.div>

                {/* Input */}
                <motion.form
                    onSubmit={handleSubmit}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6 mb-8"
                >
                    <label htmlFor="tool-url" className="block text-sm font-medium text-fg mb-2">Page URL</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            id="tool-url"
                            placeholder="https://example.com/page"
                            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-surface border border-border shadow-xs text-fg placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !url.trim()}
                            className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-lg bg-brand text-brand-fg font-medium text-sm hover:bg-brand-hover transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Search className="w-4 h-4" /> Analyze
                        </button>
                    </div>
                </motion.form>

                {loading && <Shimmer />}

                {error && (
                    <div className="rounded-control border border-down/20 bg-down-soft p-4 text-down text-sm">
                        {error}
                    </div>
                )}

                {result && (
                    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="space-y-6">
                        {/* Overall Score */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <ScoreRing score={result.overallScore} />
                                <div className="text-center sm:text-left">
                                    <h2 className="text-xl font-semibold">GEO Score</h2>
                                    <p className="text-sm text-fg-secondary mt-1">
                                        {result.overallScore >= 70
                                            ? 'Good - Your content is well-optimized for AI search engines.'
                                            : result.overallScore >= 50
                                                ? 'Fair - There are opportunities to improve AI search readiness.'
                                                : 'Needs Work - Significant improvements needed for AI search optimization.'}
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* Category Breakdown */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-5">Category Breakdown</h2>
                            <div className="space-y-4">
                                {result.categories.map((cat) => (
                                    <ScoreBar key={cat.name} score={cat.score} label={cat.name} />
                                ))}
                            </div>
                        </motion.div>

                        {/* Detailed Category Cards */}
                        {result.categories.map((cat) => (
                            <motion.div key={cat.name} variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                                <div className="flex items-center gap-2.5 mb-4">
                                    <span className="text-up">{categoryIcons[cat.name]}</span>
                                    <h3 className="text-base font-semibold">{cat.name}</h3>
                                    <span className={`ml-auto text-sm font-semibold ${cat.score >= 70 ? 'text-up' : cat.score >= 50 ? 'text-warn' : 'text-down'}`}>
                                        {Math.round(cat.score)}/100
                                    </span>
                                </div>

                                {cat.findings.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs text-fg-muted uppercase tracking-wider mb-2">Findings</p>
                                        <ul className="space-y-1.5">
                                            {cat.findings.map((f, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-fg">
                                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-fg-faint flex-shrink-0" />
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {cat.recommendations.length > 0 && (
                                    <div>
                                        <p className="text-xs text-fg-muted uppercase tracking-wider mb-2">Recommendations</p>
                                        <ul className="space-y-1.5">
                                            {cat.recommendations.map((r, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-up">
                                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-up flex-shrink-0" />
                                                    {r}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
