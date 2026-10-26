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
                <div key={i} className="h-20 rounded-control bg-surface-sunken" />
            ))}
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const styles: Record<string, string> = {
        error: 'bg-down-soft text-down',
        warning: 'bg-warn-soft text-warn',
        info: 'bg-info-soft text-info',
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
        <div className="px-4 pt-10 pb-16 md:px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-control bg-brand-soft text-brand-soft-fg">
                            <Globe className="w-5 h-5" />
                        </div>
                        <h1 className="text-heading sm:text-heading-lg text-fg">Hreflang Validator</h1>
                    </div>
                    <p className="text-sm sm:text-base text-fg-secondary mb-8">
                        Validate international targeting with hreflang tag checks.
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
                    <label className="block text-sm font-medium text-fg mb-2">Page URL</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/page"
                            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-surface border border-border shadow-xs text-fg placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !url.trim()}
                            className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-lg bg-brand text-brand-fg font-medium text-sm hover:bg-brand-hover transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Search className="w-4 h-4" /> Validate
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
                        {/* Source info */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">Hreflang Tags Found</h2>
                                <span className="text-xs px-2.5 py-1 rounded-full bg-subtle text-fg-secondary capitalize">
                                    Source: {result.source}
                                </span>
                            </div>
                            {result.tags.length === 0 ? (
                                <p className="text-sm text-fg-muted">No hreflang tags found on this page.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-fg-muted border-b border-border-subtle">
                                                <th className="py-2 pr-4 font-medium">Language</th>
                                                <th className="py-2 pr-4 font-medium">URL</th>
                                                <th className="py-2 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.tags.map((tag, i) => (
                                                <tr key={i} className="border-b border-border-subtle">
                                                    <td className="py-2.5 pr-4 font-mono text-xs text-fg">{tag.lang}</td>
                                                    <td className="py-2.5 pr-4 text-xs text-info break-all max-w-[300px]">{tag.url}</td>
                                                    <td className="py-2.5">
                                                        {tag.status === 'valid' ? (
                                                            <CheckCircle2 className="w-4 h-4 text-up" />
                                                        ) : tag.status === 'invalid' ? (
                                                            <XCircle className="w-4 h-4 text-down" />
                                                        ) : (
                                                            <AlertTriangle className="w-4 h-4 text-warn" />
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
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">Validation Checks</h2>
                            <div className="space-y-2">
                                {result.checks.map((check, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5 px-4 rounded-lg bg-surface">
                                        {check.passed ? (
                                            <CheckCircle2 className="w-4 h-4 text-up flex-shrink-0" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-down flex-shrink-0" />
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-fg">{check.name}</p>
                                            <p className="text-xs text-fg-muted">{check.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Issues */}
                        {result.issues.length > 0 && (
                            <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                                <h2 className="text-lg font-semibold mb-4">Issues</h2>
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
                    </motion.div>
                )}
            </div>
        </div>
    );
}
