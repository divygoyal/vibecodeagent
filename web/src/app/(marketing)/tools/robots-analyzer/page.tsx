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
                <div key={i} className="h-20 rounded-control bg-surface-sunken" />
            ))}
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const styles = {
        error: 'bg-down-soft text-down',
        warning: 'bg-warn-soft text-warn',
        info: 'bg-info-soft text-info',
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
    if (status === 'allowed') return <CheckCircle2 className="w-4 h-4 text-up" />;
    if (status === 'blocked') return <XCircle className="w-4 h-4 text-down" />;
    return <MinusCircle className="w-4 h-4 text-fg-muted" />;
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
        <div className="px-4 pt-10 pb-16 md:px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-control bg-brand-soft text-brand-soft-fg">
                            <FileText className="w-5 h-5" />
                        </div>
                        <h1 className="text-heading sm:text-heading-lg text-fg">Robots.txt Analyzer</h1>
                    </div>
                    <p className="text-sm sm:text-base text-fg-secondary mb-8">
                        Check your robots.txt for issues and see which AI crawlers can access your site.
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
                    <label htmlFor="tool-domain" className="block text-sm font-medium text-fg mb-2">Domain</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            id="tool-domain"
                            placeholder="example.com"
                            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-surface border border-border shadow-xs text-fg placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !domain.trim()}
                            className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-lg bg-brand text-brand-fg font-medium text-sm hover:bg-brand-hover transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                    <div className="rounded-control border border-down/20 bg-down-soft p-4 text-down text-sm">
                        {error}
                    </div>
                )}

                {/* Results */}
                {result && (
                    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="space-y-6">
                        {/* AI Crawler Access */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">AI Crawler Access</h2>
                            <div className="space-y-2">
                                {result.crawlers.map((c) => (
                                    <div key={c.bot} className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-surface">
                                        <span className="text-sm font-medium text-fg">{c.bot}</span>
                                        <div className="flex items-center gap-2">
                                            <CrawlerStatusIcon status={c.status} />
                                            <span className={`text-sm capitalize ${c.status === 'allowed' ? 'text-up' : c.status === 'blocked' ? 'text-down' : 'text-fg-muted'}`}>
                                                {c.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Parsed Directives */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">Parsed Directives</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-fg-muted border-b border-border-subtle">
                                            <th className="py-2 pr-4 font-medium">User-Agent</th>
                                            <th className="py-2 pr-4 font-medium">Type</th>
                                            <th className="py-2 font-medium">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.directives.map((d, di) =>
                                            d.rules.map((r, ri) => (
                                                <tr key={`${di}-${ri}`} className="border-b border-border-subtle">
                                                    <td className="py-2 pr-4 text-fg font-mono text-xs">{ri === 0 ? d.userAgent : ''}</td>
                                                    <td className="py-2 pr-4">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'Disallow' ? 'bg-down-soft text-down' : 'bg-up-soft text-up'}`}>
                                                            {r.type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 font-mono text-xs text-fg-secondary">{r.value || '(empty)'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>

                        {/* Sitemaps */}
                        {result.sitemaps.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                                <h2 className="text-lg font-semibold mb-3">Sitemaps</h2>
                                <ul className="space-y-1.5">
                                    {result.sitemaps.map((s, i) => (
                                        <li key={i} className="text-sm font-mono text-info break-all">{s}</li>
                                    ))}
                                </ul>
                            </motion.div>
                        )}

                        {/* Issues */}
                        {result.issues.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                                <h2 className="text-lg font-semibold mb-4">Issues Found</h2>
                                <div className="space-y-2">
                                    {result.issues.map((issue, i) => (
                                        <div key={i} className="flex items-start gap-3 py-2.5 px-4 rounded-lg bg-surface">
                                            <SeverityBadge severity={issue.severity} />
                                            <span className="text-sm text-fg">{issue.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Raw Content */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-3">Raw robots.txt</h2>
                            <pre className="text-xs font-mono text-fg-secondary bg-surface-sunken rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                                {result.raw}
                            </pre>
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
