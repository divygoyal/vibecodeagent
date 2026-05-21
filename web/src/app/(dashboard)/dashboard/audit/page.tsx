'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Search, Loader2 } from 'lucide-react';
import { useCredits } from '@/lib/useDashboardData';
import TieredActionPlanView from '@/components/audit/TieredActionPlanView';
import type { AuditReport } from '@/lib/siteAudit';
import type { DomainOverviewData } from '@/components/domain-overview/types';

export default function AuditPage() {
    return (
        <Suspense fallback={<AuditPageSkeleton />}>
            <AuditPageInner />
        </Suspense>
    );
}

function AuditPageInner() {
    const searchParams = useSearchParams();
    const initialUrl = searchParams.get('url') || '';
    const { plan } = useCredits();
    const [inputUrl, setInputUrl] = useState(initialUrl);
    const [auditState, setAuditState] = useState<
        | { kind: 'idle' }
        | { kind: 'loading' }
        | { kind: 'done'; report: AuditReport; data: DomainOverviewData; domain: string }
        | { kind: 'error'; message: string }
    >({ kind: 'idle' });

    const runAudit = useCallback(async (rawUrl: string) => {
        const url = rawUrl.trim();
        if (!url) return;
        setAuditState({ kind: 'loading' });
        try {
            const res = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                setAuditState({ kind: 'error', message: errBody?.error || `Audit failed (HTTP ${res.status})` });
                return;
            }
            const report = (await res.json()) as AuditReport;
            const domain = extractDomain(report.url);
            const data = wrapAsDomainOverviewData(report, domain);
            setAuditState({ kind: 'done', report, data, domain });
        } catch (err) {
            setAuditState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' });
        }
    }, []);

    useEffect(() => {
        if (!initialUrl) return;
        // Kick off the audit when the user lands with ?url=... — legitimate
        // "synchronize with external API on mount" pattern.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        runAudit(initialUrl);
    }, [initialUrl, runAudit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        runAudit(inputUrl);
    };

    const planResolved = (plan as 'free' | 'starter' | 'growth' | 'pro') || 'free';

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
            <div>
                <h1 className="text-xl font-semibold text-[var(--text-primary)]">Site audit</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Run a full SEO + CRO audit and get tiered, paste-ready recommendations.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="premium-card rounded-2xl p-4 flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={e => setInputUrl(e.target.value)}
                        placeholder="https://your-site.com"
                        className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                </div>
                <button
                    type="submit"
                    disabled={auditState.kind === 'loading' || !inputUrl.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-xs font-semibold shadow-lg shadow-emerald-500/10 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {auditState.kind === 'loading' ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Auditing…
                        </>
                    ) : (
                        'Audit site'
                    )}
                </button>
            </form>

            {auditState.kind === 'loading' && <AuditPageSkeleton />}

            {auditState.kind === 'error' && (
                <div className="premium-card rounded-2xl p-6 flex items-center gap-3 border border-red-500/20">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Audit failed</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{auditState.message}</p>
                    </div>
                </div>
            )}

            {auditState.kind === 'done' && (
                <TieredActionPlanView
                    url={auditState.report.url}
                    domain={auditState.domain}
                    auditReport={auditState.report}
                    domainOverviewData={auditState.data}
                    userPlan={planResolved}
                />
            )}
        </div>
    );
}

function AuditPageSkeleton() {
    return (
        <div className="premium-card rounded-2xl p-6 space-y-4">
            <div className="h-4 w-40 bg-[var(--card-bg)] rounded animate-pulse" />
            <div className="h-24 bg-[var(--card-bg)] rounded animate-pulse" />
            <div className="h-24 bg-[var(--card-bg)] rounded animate-pulse" />
        </div>
    );
}

function extractDomain(url: string): string {
    try { return new URL(url).hostname; }
    catch { return url; }
}

/**
 * Wrap an AuditReport in a DomainOverviewData-shaped object so the existing
 * IssuesPanel (used as the free-tier fallback inside TieredActionPlanView) can
 * consume it without code changes. The non-audit fields are nulled out — they
 * aren't read by IssuesPanel.
 */
function wrapAsDomainOverviewData(report: AuditReport, domain: string): DomainOverviewData {
    return {
        domain,
        url: report.url,
        analyzedAt: report.fetchedAt,
        audit: {
            score: report.score,
            summary: report.summary,
            issues: report.issues,
            meta: report.meta,
            responseTime: report.responseTime,
            statusCode: report.statusCode,
        },
        pagespeed: null,
        keywords: [],
        technologies: [],
        robots: null,
        sitemap: null,
        readability: null,
        geoReadiness: null,
    };
}
