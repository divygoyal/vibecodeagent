'use client';

import { useState } from 'react';
import { FileText, Loader2, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

interface SchemaIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
}

interface DetectedSchema {
    type: string;
    raw: unknown;
    issues: SchemaIssue[];
}

interface SchemaAuditResult {
    url: string;
    schemas: DetectedSchema[];
    coverage: {
        hasOrganization: boolean;
        hasWebsite: boolean;
        hasArticleLike: boolean;
        hasFAQ: boolean;
        hasHowTo: boolean;
        hasProduct: boolean;
        hasBreadcrumb: boolean;
        hasPerson: boolean;
    };
    summary: {
        totalSchemas: number;
        validSchemas: number;
        errorCount: number;
        warningCount: number;
    };
    recommendations: string[];
    error?: string;
}

interface SchemaAuditWidgetProps {
    siteUrl: string;
    suggestedPages?: string[];
}

const COVERAGE_LABELS: Array<{ key: keyof SchemaAuditResult['coverage']; label: string }> = [
    { key: 'hasOrganization', label: 'Organization' },
    { key: 'hasWebsite', label: 'WebSite' },
    { key: 'hasArticleLike', label: 'Article' },
    { key: 'hasFAQ', label: 'FAQPage' },
    { key: 'hasHowTo', label: 'HowTo' },
    { key: 'hasBreadcrumb', label: 'Breadcrumb' },
    { key: 'hasPerson', label: 'Person' },
    { key: 'hasProduct', label: 'Product' },
];

export default function SchemaAuditWidget({ siteUrl, suggestedPages = [] }: SchemaAuditWidgetProps) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SchemaAuditResult | null>(null);

    const run = async (target: string) => {
        if (!target.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/seo/schema-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: target }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult({ ...data, error: data.error });
            } else {
                setResult(data);
            }
        } catch (err) {
            setResult({
                url: target,
                schemas: [],
                coverage: { hasOrganization: false, hasWebsite: false, hasArticleLike: false, hasFAQ: false, hasHowTo: false, hasProduct: false, hasBreadcrumb: false, hasPerson: false },
                summary: { totalSchemas: 0, validSchemas: 0, errorCount: 0, warningCount: 0 },
                recommendations: [],
                error: err instanceof Error ? err.message : 'Failed',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="premium-card p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(167,139,250,0.1)]">
                    <FileText className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Structured Data</div>
                    <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">Schema Audit &amp; Validator</h4>
                    <p className="text-[11px] text-zinc-500">JSON-LD detection + required-field validation</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://example.com/page"
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/30"
                />
                <button
                    onClick={() => run(url)}
                    disabled={loading || !url.trim()}
                    className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2 justify-center"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Audit
                </button>
            </div>

            {suggestedPages.length > 0 && !result && !loading && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] text-zinc-500 mr-1">Try:</span>
                    {suggestedPages.slice(0, 4).map(p => (
                        <button
                            key={p}
                            onClick={() => { setUrl(p); run(p); }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white transition truncate max-w-[200px]"
                        >
                            {p.replace(/^https?:\/\//, '')}
                        </button>
                    ))}
                </div>
            )}

            {result?.error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.error}
                </div>
            )}

            {result && !result.error && (
                <div className="space-y-3">
                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-2">
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2 text-center">
                            <div className="text-2xl font-bold text-violet-400 tabular-nums">{result.summary.totalSchemas}</div>
                            <div className="text-[10px] text-zinc-500">Schemas</div>
                        </div>
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2 text-center">
                            <div className="text-2xl font-bold text-emerald-400 tabular-nums">{result.summary.validSchemas}</div>
                            <div className="text-[10px] text-zinc-500">Valid</div>
                        </div>
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2 text-center">
                            <div className="text-2xl font-bold text-red-400 tabular-nums">{result.summary.errorCount}</div>
                            <div className="text-[10px] text-zinc-500">Errors</div>
                        </div>
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2 text-center">
                            <div className="text-2xl font-bold text-amber-400 tabular-nums">{result.summary.warningCount}</div>
                            <div className="text-[10px] text-zinc-500">Warnings</div>
                        </div>
                    </div>

                    {/* Coverage badges */}
                    <div className="flex flex-wrap gap-1.5">
                        {COVERAGE_LABELS.map(({ key, label }) => {
                            const present = result.coverage[key];
                            return (
                                <span
                                    key={key}
                                    className={`text-[10px] px-2 py-1 rounded font-medium flex items-center gap-1 ${
                                        present
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-white/[0.03] text-zinc-500 border border-white/[0.06]'
                                    }`}
                                >
                                    {present ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                    {label}
                                </span>
                            );
                        })}
                    </div>

                    {/* Detected schemas */}
                    {result.schemas.length > 0 && (
                        <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                            {result.schemas.map((s, i) => {
                                const errors = s.issues.filter(iss => iss.severity === 'error');
                                const warnings = s.issues.filter(iss => iss.severity === 'warning');
                                return (
                                    <div key={i} className="bg-black/20 border border-white/[0.06] rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2 text-xs">
                                            {errors.length === 0 ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                            )}
                                            <span className="text-zinc-300 font-medium">{s.type}</span>
                                            {errors.length > 0 && <span className="text-[10px] text-red-400">{errors.length} error{errors.length === 1 ? '' : 's'}</span>}
                                            {warnings.length > 0 && <span className="text-[10px] text-amber-400">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>}
                                        </div>
                                        {s.issues.length > 0 && (
                                            <ul className="mt-1 ml-5 space-y-0.5">
                                                {s.issues.map((iss, j) => (
                                                    <li
                                                        key={j}
                                                        className={`text-[10px] ${iss.severity === 'error' ? 'text-red-400' : iss.severity === 'warning' ? 'text-amber-400' : 'text-zinc-500'}`}
                                                    >
                                                        • {iss.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Recommendations */}
                    {result.recommendations.length > 0 && (
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                            <div className="text-[10px] font-semibold text-white uppercase tracking-wide mb-2">Recommendations</div>
                            <ul className="space-y-1.5">
                                {result.recommendations.map((r, i) => (
                                    <li key={i} className="text-[11px] text-zinc-400 flex gap-1.5">
                                        <span className="text-violet-400 flex-shrink-0">→</span>
                                        <span>{r}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-2 flex items-center gap-2">
                                <FixWithBotButton
                                    label="Generate &amp; Add Schema"
                                    size="sm"
                                    variant="solid"
                                    context={`Improve schema markup for ${result.url}. Found ${result.summary.totalSchemas} schemas (${result.summary.errorCount} errors, ${result.summary.warningCount} warnings). Recommendations: ${result.recommendations.join(' / ')}. Generate and inject the missing schemas.`}
                                    site={siteUrl}
                                />
                                <a
                                    href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(result.url)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-zinc-500 hover:text-violet-400 inline-flex items-center gap-1"
                                >
                                    Google Rich Results test <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
