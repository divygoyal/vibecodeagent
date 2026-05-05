'use client';

import { useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    FileText,
    Gauge,
    Loader2,
    Smartphone,
    Monitor,
} from 'lucide-react';
import {
    AnalyticsSubpagePanel,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';

interface SeoPageHealthPanelProps {
    suggestedPages?: string[];
}

type Tab = 'psi' | 'schema';
type Strategy = 'mobile' | 'desktop';

interface PsiMetric {
    label: string;
    value: number;
    displayValue: string;
    score: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface PsiResponse {
    url: string;
    strategy: Strategy;
    performanceScore: number;
    seoScore: number;
    accessibilityScore: number;
    bestPracticesScore: number;
    metrics: {
        lcp: PsiMetric | null;
        cls: PsiMetric | null;
        inp: PsiMetric | null;
        fcp: PsiMetric | null;
        ttfb: PsiMetric | null;
    };
    fieldData: { hasFieldData: boolean; lcpRating?: string; clsRating?: string; inpRating?: string };
    opportunities: Array<{ id: string; title: string; savingsMs?: number }>;
    fetchedAt: string;
    supported?: boolean;
    reason?: string;
    error?: string;
}

interface SchemaIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
}

interface SchemaResponse {
    url: string;
    schemas: Array<{ type: string; issues: SchemaIssue[] }>;
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
    summary: { totalSchemas: number; validSchemas: number; errorCount: number; warningCount: number };
    recommendations: string[];
    error?: string;
}

function scoreTone(score: number): { ring: string; text: string; label: string } {
    if (score >= 90) return { ring: 'border-emerald-500/30 bg-emerald-500/[0.06]', text: 'text-emerald-400', label: 'Good' };
    if (score >= 50) return { ring: 'border-amber-500/30 bg-amber-500/[0.06]', text: 'text-amber-400', label: 'Needs work' };
    return { ring: 'border-red-500/30 bg-red-500/[0.06]', text: 'text-red-400', label: 'Poor' };
}

function ratingTone(rating?: string): string {
    if (rating === 'good' || rating === 'fast') return 'text-emerald-400';
    if (rating === 'needs-improvement' || rating === 'average') return 'text-amber-400';
    if (rating === 'poor' || rating === 'slow') return 'text-red-400';
    return 'text-zinc-400';
}

function ScoreCard({ label, score }: { label: string; score: number }) {
    const tone = scoreTone(score);
    return (
        <div className={`rounded-[16px] border ${tone.ring} px-4 py-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
            <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-[1.6rem] font-semibold tabular-nums ${tone.text}`}>{score}</span>
                <span className="text-[11px] text-zinc-500">/ 100</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-500">{tone.label}</p>
        </div>
    );
}

function MetricCard({ label, metric }: { label: string; metric: PsiMetric | null }) {
    if (!metric) {
        return (
            <div className="rounded-[16px] border border-white/[0.06] bg-[#0d0e12] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
                <p className="mt-2 text-[1.05rem] font-medium text-zinc-600">—</p>
            </div>
        );
    }
    return (
        <div className="rounded-[16px] border border-white/[0.06] bg-[#0d0e12] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
            <p className={`mt-2 text-[1.05rem] font-semibold tabular-nums ${ratingTone(metric.rating)}`}>{metric.displayValue}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">{metric.rating.replace('-', ' ')}</p>
        </div>
    );
}

export default function SeoPageHealthPanel({ suggestedPages = [] }: SeoPageHealthPanelProps) {
    const [tab, setTab] = useState<Tab>('psi');
    const [url, setUrl] = useState('');
    const [strategy, setStrategy] = useState<Strategy>('mobile');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [psiResult, setPsiResult] = useState<PsiResponse | null>(null);
    const [schemaResult, setSchemaResult] = useState<SchemaResponse | null>(null);

    async function run() {
        const target = url.trim();
        if (!target) {
            setError('Enter a URL to analyse.');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const path = tab === 'psi' ? '/api/seo/psi' : '/api/seo/schema-audit';
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tab === 'psi' ? { url: target, strategy } : { url: target }),
            });
            const data = await res.json();
            if (!res.ok && !data?.supported) {
                throw new Error(data?.error || `Request failed (${res.status})`);
            }
            if (tab === 'psi') {
                setPsiResult(data as PsiResponse);
            } else {
                setSchemaResult(data as SchemaResponse);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to analyse');
        } finally {
            setLoading(false);
        }
    }

    const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
        { key: 'psi', label: 'PageSpeed', icon: Gauge },
        { key: 'schema', label: 'Schema', icon: FileText },
    ];

    return (
        <AnalyticsSubpagePanel
            title="Page health"
            description="Lighthouse performance scores and structured-data coverage for any page on your site."
            tone="cyan"
            action={
                <div className="inline-flex flex-wrap rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                    {tabs.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => { setTab(t.key); setError(null); }}
                                className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 transition ${tab === t.key ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                <Icon className="h-3 w-3" />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            }
        >
            <div className="space-y-5">
                {/* URL form */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') run(); }}
                        placeholder="https://your-page.com/article"
                        className="flex-1 rounded-[14px] border border-white/[0.07] bg-[#090909] px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 transition focus:border-emerald-500/30 focus:outline-none"
                    />
                    {tab === 'psi' ? (
                        <div className="inline-flex rounded-[14px] border border-white/[0.07] bg-[#090909] p-1 text-[12px] font-medium">
                            <button
                                type="button"
                                onClick={() => setStrategy('mobile')}
                                className={`inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 transition ${strategy === 'mobile' ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                <Smartphone className="h-3 w-3" />
                                Mobile
                            </button>
                            <button
                                type="button"
                                onClick={() => setStrategy('desktop')}
                                className={`inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 transition ${strategy === 'desktop' ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                <Monitor className="h-3 w-3" />
                                Desktop
                            </button>
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={run}
                        disabled={loading || !url.trim()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[14px] bg-emerald-500/15 px-4 text-[13px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Run
                    </button>
                </div>

                {suggestedPages.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className="text-zinc-600">Try:</span>
                        {suggestedPages.slice(0, 4).map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setUrl(p)}
                                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
                            >
                                {p.length > 40 ? `${p.slice(0, 40)}…` : p}
                            </button>
                        ))}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-[14px] border border-red-500/15 bg-red-500/[0.04] px-4 py-3 text-[12px] text-red-300">
                        <AlertCircle className="mr-2 inline-block h-3.5 w-3.5 -mt-0.5" />
                        {error}
                    </div>
                ) : null}

                {/* PSI results */}
                {tab === 'psi' && psiResult && !psiResult.supported ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            <ScoreCard label="Performance" score={psiResult.performanceScore} />
                            <ScoreCard label="SEO" score={psiResult.seoScore} />
                            <ScoreCard label="Accessibility" score={psiResult.accessibilityScore} />
                            <ScoreCard label="Best practices" score={psiResult.bestPracticesScore} />
                        </div>
                        <div>
                            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Core Web Vitals {psiResult.fieldData.hasFieldData ? '· Field data' : '· Lab only'}
                            </p>
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                                <MetricCard label="LCP" metric={psiResult.metrics.lcp} />
                                <MetricCard label="CLS" metric={psiResult.metrics.cls} />
                                <MetricCard label="INP" metric={psiResult.metrics.inp} />
                                <MetricCard label="FCP" metric={psiResult.metrics.fcp} />
                                <MetricCard label="TTFB" metric={psiResult.metrics.ttfb} />
                            </div>
                        </div>
                        {psiResult.opportunities.length > 0 ? (
                            <div>
                                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    Top opportunities
                                </p>
                                <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0a0b0e]">
                                    {psiResult.opportunities.map(opp => (
                                        <div key={opp.id} className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-b-0">
                                            <span className="truncate text-[13px] text-zinc-200">{opp.title}</span>
                                            {typeof opp.savingsMs === 'number' ? (
                                                <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                                                    Save {(opp.savingsMs / 1000).toFixed(1)}s
                                                </span>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* PSI unsupported */}
                {tab === 'psi' && psiResult?.supported === false ? (
                    <div className="rounded-[16px] border border-amber-500/20 bg-amber-500/[0.04] px-4 py-5 text-[12px] text-amber-300">
                        <p className="font-medium">PageSpeed Insights is currently rate-limited.</p>
                        <p className="mt-1 text-amber-300/80">{psiResult.error}</p>
                    </div>
                ) : null}

                {/* Schema results */}
                {tab === 'schema' && schemaResult ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            {[
                                { key: 'Total', value: schemaResult.summary.totalSchemas, tone: 'text-zinc-200' },
                                { key: 'Valid', value: schemaResult.summary.validSchemas, tone: 'text-emerald-400' },
                                { key: 'Errors', value: schemaResult.summary.errorCount, tone: 'text-red-400' },
                                { key: 'Warnings', value: schemaResult.summary.warningCount, tone: 'text-amber-400' },
                            ].map(s => (
                                <div key={s.key} className="rounded-[16px] border border-white/[0.06] bg-[#0d0e12] px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{s.key}</p>
                                    <p className={`mt-2 text-[1.6rem] font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        <div>
                            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Coverage</p>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries({
                                    Organization: schemaResult.coverage.hasOrganization,
                                    WebSite: schemaResult.coverage.hasWebsite,
                                    Article: schemaResult.coverage.hasArticleLike,
                                    FAQPage: schemaResult.coverage.hasFAQ,
                                    HowTo: schemaResult.coverage.hasHowTo,
                                    Product: schemaResult.coverage.hasProduct,
                                    Breadcrumb: schemaResult.coverage.hasBreadcrumb,
                                    Person: schemaResult.coverage.hasPerson,
                                }).map(([name, present]) => (
                                    <span
                                        key={name}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                            present
                                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-500'
                                        }`}
                                    >
                                        {present ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-3 w-3" />}
                                        {name}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {schemaResult.schemas.length > 0 ? (
                            <div>
                                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Detected schemas</p>
                                <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0a0b0e]">
                                    {schemaResult.schemas.map((s, i) => {
                                        const errors = s.issues.filter(x => x.severity === 'error');
                                        const warnings = s.issues.filter(x => x.severity === 'warning');
                                        return (
                                            <div key={i} className="border-b border-white/[0.04] px-4 py-3 last:border-b-0">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="truncate text-[13px] font-medium text-zinc-200">{s.type}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        {errors.length > 0 ? (
                                                            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                                                                {errors.length} error{errors.length === 1 ? '' : 's'}
                                                            </span>
                                                        ) : null}
                                                        {warnings.length > 0 ? (
                                                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                                                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                                                            </span>
                                                        ) : null}
                                                        {s.issues.length === 0 ? (
                                                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                                                Valid
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {errors.length > 0 || warnings.length > 0 ? (
                                                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-zinc-500">
                                                        {[...errors, ...warnings].map((iss, j) => (
                                                            <li key={j} className={iss.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>
                                                                — {iss.message}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {schemaResult.recommendations.length > 0 ? (
                            <div className="rounded-[16px] border border-white/[0.06] bg-[#0d0e12] px-4 py-4">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Recommendations</p>
                                <ul className="space-y-1.5 text-[12px] text-zinc-300">
                                    {schemaResult.recommendations.map((r, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="text-emerald-400">→</span>
                                            <span>{r}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* Empty initial state */}
                {!loading && !error && (
                    (tab === 'psi' && !psiResult) || (tab === 'schema' && !schemaResult)
                ) ? (
                    <div className="rounded-[16px] border border-white/[0.06] bg-[#0a0b0e] px-4 py-10 text-center text-[12px] text-zinc-500">
                        Paste a URL above and click Run to {tab === 'psi' ? 'measure PageSpeed' : 'audit structured data'}.
                    </div>
                ) : null}
            </div>
        </AnalyticsSubpagePanel>
    );
}
