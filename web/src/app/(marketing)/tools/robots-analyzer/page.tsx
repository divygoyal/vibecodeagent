'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, ArrowLeft, Search, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Info } from 'lucide-react';

interface CrawlerStatus {
    bot: string;
    status: 'allowed' | 'blocked' | 'not_specified';
}

interface Directive {
    userAgent: string;
    rules: { type: string; value: string }[];
}

interface Issue {
    severity: 'error' | 'warning' | 'info';
    message: string;
}

interface RobotsResult {
    raw: string;
    directives: Directive[];
    crawlers: CrawlerStatus[];
    sitemaps: string[];
    issues: Issue[];
}

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function Shimmer() {
    return (
        <div className="space-y-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-white/[0.04]" />
            ))}
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const styles = {
        error: 'bg-red-500/20 text-red-400',
        warning: 'bg-amber-500/20 text-amber-400',
        info: 'bg-blue-500/20 text-blue-400',
    };
    const icons = {
        error: <XCircle className="w-3.5 h-3.5" />,
        warning: <AlertTriangle className="w-3.5 h-3.5" />,
        info: <Info className="w-3.5 h-3.5" />,
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[severity as keyof typeof styles] || styles.info}`}>
            {icons[severity as keyof typeof icons] || icons.info}
            {severity}
        </span>
    );
}

function CrawlerStatusIcon({ status }: { status: string }) {
    if (status === 'allowed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'blocked') return <XCircle className="w-4 h-4 text-red-400" />;
    return <MinusCircle className="w-4 h-4 text-zinc-500" />;
}

export default function RobotsAnalyzerPage() {
    const [domain, setDomain] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RobotsResult | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!domain.trim()) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            const res = await fetch(`/api/tools?tool=robots&domain=${encodeURIComponent(cleanDomain)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to analyze robots.txt');
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen pt-24 pb-20 px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                            <FileText className="w-5 h-5" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold">Robots.txt Analyzer</h1>
                    </div>
                    <p className="text-sm sm:text-base text-zinc-400 mb-8">
                        Check your robots.txt for issues and see which AI crawlers can access your site.
                    </p>
                </motion.div>

                {/* Input */}
                <motion.form
                    onSubmit={handleSubmit}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6 mb-8"
                >
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Domain</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="example.com"
                            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !domain.trim()}
                            className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Search className="w-4 h-4" />
                            Analyze
                        </button>
                    </div>
                </motion.form>

                {/* Loading */}
                {loading && <Shimmer />}

                {/* Error */}
                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Results */}
                {result && (
                    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="space-y-6">
                        {/* AI Crawler Access */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">AI Crawler Access</h2>
                            <div className="space-y-2">
                                {result.crawlers.map((c) => (
                                    <div key={c.bot} className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-white/[0.02]">
                                        <span className="text-sm font-medium text-zinc-300">{c.bot}</span>
                                        <div className="flex items-center gap-2">
                                            <CrawlerStatusIcon status={c.status} />
                                            <span className={`text-sm capitalize ${c.status === 'allowed' ? 'text-emerald-400' : c.status === 'blocked' ? 'text-red-400' : 'text-zinc-500'}`}>
                                                {c.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Parsed Directives */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">Parsed Directives</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-zinc-500 border-b border-white/[0.06]">
                                            <th className="py-2 pr-4 font-medium">User-Agent</th>
                                            <th className="py-2 pr-4 font-medium">Type</th>
                                            <th className="py-2 font-medium">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.directives.map((d, di) =>
                                            d.rules.map((r, ri) => (
                                                <tr key={`${di}-${ri}`} className="border-b border-white/[0.04]">
                                                    <td className="py-2 pr-4 text-zinc-300 font-mono text-xs">{ri === 0 ? d.userAgent : ''}</td>
                                                    <td className="py-2 pr-4">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'Disallow' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                                            {r.type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 font-mono text-xs text-zinc-400">{r.value || '(empty)'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>

                        {/* Sitemaps */}
                        {result.sitemaps.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
                                <h2 className="text-lg font-semibold mb-3">Sitemaps</h2>
                                <ul className="space-y-1.5">
                                    {result.sitemaps.map((s, i) => (
                                        <li key={i} className="text-sm font-mono text-cyan-400 break-all">{s}</li>
                                    ))}
                                </ul>
                            </motion.div>
                        )}

                        {/* Issues */}
                        {result.issues.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
                                <h2 className="text-lg font-semibold mb-4">Issues Found</h2>
                                <div className="space-y-2">
                                    {result.issues.map((issue, i) => (
                                        <div key={i} className="flex items-start gap-3 py-2.5 px-4 rounded-lg bg-white/[0.02]">
                                            <SeverityBadge severity={issue.severity} />
                                            <span className="text-sm text-zinc-300">{issue.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Raw Content */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-3">Raw robots.txt</h2>
                            <pre className="text-xs font-mono text-zinc-400 bg-black/40 rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                                {result.raw}
                            </pre>
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
