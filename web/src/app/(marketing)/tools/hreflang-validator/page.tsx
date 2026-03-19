'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Globe, ArrowLeft, Search, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

interface HreflangTag {
    lang: string;
    url: string;
    status: 'valid' | 'invalid' | 'warning';
}

interface ValidationCheck {
    name: string;
    passed: boolean;
    detail: string;
}

interface HreflangIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
}

interface HreflangResult {
    tags: HreflangTag[];
    checks: ValidationCheck[];
    issues: HreflangIssue[];
    source: 'html' | 'header' | 'none';
}

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function Shimmer() {
    return (
        <div className="space-y-4 animate-pulse">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-white/[0.04]" />
            ))}
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const styles: Record<string, string> = {
        error: 'bg-red-500/20 text-red-400',
        warning: 'bg-amber-500/20 text-amber-400',
        info: 'bg-blue-500/20 text-blue-400',
    };
    const icons: Record<string, React.ReactNode> = {
        error: <XCircle className="w-3.5 h-3.5" />,
        warning: <AlertTriangle className="w-3.5 h-3.5" />,
        info: <Info className="w-3.5 h-3.5" />,
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[severity] || styles.info}`}>
            {icons[severity] || icons.info}
            {severity}
        </span>
    );
}

export default function HreflangValidatorPage() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<HreflangResult | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch(`/api/tools?tool=hreflang&url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to validate hreflang tags');
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
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400">
                            <Globe className="w-5 h-5" />
                        </div>
                        <h1 className="text-3xl font-bold">Hreflang Validator</h1>
                    </div>
                    <p className="text-zinc-400 mb-8">
                        Validate international targeting with hreflang tag checks.
                    </p>
                </motion.div>

                {/* Input */}
                <motion.form
                    onSubmit={handleSubmit}
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-8"
                >
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Page URL</label>
                    <div className="flex gap-3">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/page"
                            className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !url.trim()}
                            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Search className="w-4 h-4" /> Validate
                        </button>
                    </div>
                </motion.form>

                {loading && <Shimmer />}

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {result && (
                    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="space-y-6">
                        {/* Source info */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">Hreflang Tags Found</h2>
                                <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] text-zinc-400 capitalize">
                                    Source: {result.source}
                                </span>
                            </div>
                            {result.tags.length === 0 ? (
                                <p className="text-sm text-zinc-500">No hreflang tags found on this page.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-zinc-500 border-b border-white/[0.06]">
                                                <th className="py-2 pr-4 font-medium">Language</th>
                                                <th className="py-2 pr-4 font-medium">URL</th>
                                                <th className="py-2 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.tags.map((tag, i) => (
                                                <tr key={i} className="border-b border-white/[0.04]">
                                                    <td className="py-2.5 pr-4 font-mono text-xs text-zinc-300">{tag.lang}</td>
                                                    <td className="py-2.5 pr-4 text-xs text-cyan-400 break-all max-w-[300px]">{tag.url}</td>
                                                    <td className="py-2.5">
                                                        {tag.status === 'valid' ? (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                        ) : tag.status === 'invalid' ? (
                                                            <XCircle className="w-4 h-4 text-red-400" />
                                                        ) : (
                                                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </motion.div>

                        {/* Validation Checks */}
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                            <h2 className="text-lg font-semibold mb-4">Validation Checks</h2>
                            <div className="space-y-2">
                                {result.checks.map((check, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5 px-4 rounded-lg bg-white/[0.02]">
                                        {check.passed ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-zinc-300">{check.name}</p>
                                            <p className="text-xs text-zinc-500">{check.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Issues */}
                        {result.issues.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                                <h2 className="text-lg font-semibold mb-4">Issues</h2>
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
                    </motion.div>
                )}
            </div>
        </div>
    );
}
