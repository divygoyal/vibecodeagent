'use client';
import React, { useState, useCallback, useRef } from 'react';
import { Bug, Globe, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ExternalLink, RotateCcw } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

// ─── Types ───

type Severity = 'critical' | 'warning' | 'info' | 'passed';

interface AuditIssue {
    id?: string;
    category?: string;
    title: string;
    description: string;
    severity: Severity | string;
    recommendation?: string;
    value?: string;
}

interface PageResult {
    url: string;
    status: 'pending' | 'crawling' | 'done' | 'error';
    score?: number;
    issues?: AuditIssue[];
    meta?: { title?: string; description?: string };
    summary?: { critical: number; warning: number; info: number; passed: number; total: number };
    error?: string;
}

type SortMode = 'score' | 'issues' | 'alpha';

// ─── Helpers ───

function scoreBadgeClass(score: number): string {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (score >= 60) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border border-red-500/20';
}

function severityDot(severity: string): string {
    switch (severity) {
        case 'critical': return 'bg-red-500';
        case 'warning': return 'bg-amber-500';
        case 'info': return 'bg-blue-500';
        case 'passed': return 'bg-emerald-500';
        default: return 'bg-zinc-500';
    }
}

function truncateUrl(url: string, maxLen = 60): string {
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen - 3) + '...';
}

// ─── Page Card ───

function PageCard({ page }: { page: PageResult }) {
    const [expanded, setExpanded] = useState(false);

    if (page.status === 'crawling') {
        return (
            <div className="premium-card rounded-xl px-4 py-3 animate-pulse">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                    <span className="text-sm text-[var(--text-secondary)] truncate">{truncateUrl(page.url)}</span>
                </div>
            </div>
        );
    }

    if (page.status === 'error') {
        return (
            <div className="premium-card rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-[var(--text-secondary)] truncate flex-1">{truncateUrl(page.url)}</span>
                    <span className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0">Error</span>
                </div>
                {page.error && (
                    <p className="text-xs text-red-400/70 mt-1.5 ml-7">{page.error}</p>
                )}
            </div>
        );
    }

    if (page.status !== 'done' || page.score === undefined) return null;

    const issueCount = page.issues?.filter(i => i.severity !== 'passed').length ?? 0;

    return (
        <div className="premium-card rounded-xl overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
            >
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${page.score >= 80 ? 'text-emerald-400' : page.score >= 60 ? 'text-amber-400' : 'text-red-400'}`} />
                <span className="text-sm text-[var(--text-primary)] truncate flex-1" title={page.url}>
                    {truncateUrl(page.url)}
                </span>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${scoreBadgeClass(page.score)}`}>
                    {page.score}/100
                </span>
                {issueCount > 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded issues */}
            {expanded && page.issues && (
                <div className="border-t border-[var(--border-primary)] px-4 py-3 space-y-2">
                    {page.meta?.title && (
                        <div className="mb-3">
                            <p className="text-xs text-[var(--text-muted)] mb-0.5">Page Title</p>
                            <p className="text-sm text-[var(--text-primary)]">{page.meta.title}</p>
                        </div>
                    )}

                    {page.issues.filter(i => i.severity !== 'passed').length === 0 && (
                        <p className="text-sm text-emerald-400 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            No issues found. Great job!
                        </p>
                    )}

                    {page.issues.filter(i => i.severity !== 'passed').map((issue, idx) => (
                        <div key={idx} className="flex items-start gap-3 table-row-premium rounded-lg px-3 py-2.5">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDot(issue.severity)}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-[var(--text-primary)] font-medium">{issue.title}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{issue.description}</p>
                            </div>
                            <div className="shrink-0">
                                <FixWithBotButton
                                    label="Fix"
                                    size="sm"
                                    variant="ghost"
                                    context={`Fix this issue on ${page.url}: ${issue.title}. ${issue.description}${issue.recommendation ? ` Recommendation: ${issue.recommendation}` : ''}`}
                                />
                            </div>
                        </div>
                    ))}

                    <div className="pt-2 flex justify-end">
                        <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" />
                            Open page
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───

export default function SiteCrawler() {
    const [domain, setDomain] = useState('');
    const [pageLimit, setPageLimit] = useState(5);
    const [crawling, setCrawling] = useState(false);
    const [pages, setPages] = useState<PageResult[]>([]);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('score');
    const abortRef = useRef<AbortController | null>(null);

    const startCrawl = useCallback(async () => {
        const d = domain.trim();
        if (!d) return;

        setCrawling(true);
        setError(null);
        setPages([]);
        setCompleted(false);
        setProgress({ current: 0, total: 0 });

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            // Step 1: fetch domain overview to discover URLs
            const overviewRes = await fetch('/api/domain-overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: d }),
                signal: controller.signal,
            });

            if (!overviewRes.ok) {
                setError('Failed to analyze domain. Please check the URL and try again.');
                setCrawling(false);
                return;
            }

            const overview = await overviewRes.json();

            // Determine URLs to crawl
            let urls: string[] = [];
            const baseUrl = overview.url || (d.startsWith('http') ? d : `https://${d}`);

            // Check if sitemap has URLs — if robots has sitemap URLs, try to parse them
            if (overview.robots?.sitemapUrls?.length > 0) {
                // Try fetching the sitemap to extract URLs
                try {
                    const sitemapUrl = overview.robots.sitemapUrls[0];
                    const sitemapRes = await fetch(sitemapUrl, {
                        signal: AbortSignal.timeout(10000),
                    });
                    if (sitemapRes.ok) {
                        const sitemapText = await sitemapRes.text();
                        const locMatches = sitemapText.match(/<loc>(.*?)<\/loc>/gi);
                        if (locMatches) {
                            urls = locMatches
                                .map(m => m.replace(/<\/?loc>/gi, '').trim())
                                .filter(u => u.startsWith('http'))
                                .slice(0, pageLimit);
                        }
                    }
                } catch {
                    // Sitemap fetch failed, fall through
                }
            }

            // Fallback: just audit the main URL
            if (urls.length === 0) {
                urls = [baseUrl];
            }

            // Ensure we don't exceed page limit
            urls = urls.slice(0, pageLimit);

            // Initialize page states
            const initialPages: PageResult[] = urls.map(url => ({
                url,
                status: 'pending' as const,
            }));
            setPages(initialPages);
            setProgress({ current: 0, total: urls.length });

            // Step 2: crawl each URL sequentially
            for (let i = 0; i < urls.length; i++) {
                if (controller.signal.aborted) break;

                const url = urls[i];

                // Mark as crawling
                setPages(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, status: 'crawling' as const } : p
                ));

                try {
                    const auditRes = await fetch('/api/audit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                        signal: controller.signal,
                    });

                    if (!auditRes.ok) {
                        throw new Error(`Audit returned ${auditRes.status}`);
                    }

                    const auditData = await auditRes.json();

                    setPages(prev => prev.map((p, idx) =>
                        idx === i ? {
                            ...p,
                            status: 'done' as const,
                            score: auditData.score ?? 0,
                            issues: auditData.issues ?? [],
                            meta: auditData.meta ?? {},
                            summary: auditData.summary ?? { critical: 0, warning: 0, info: 0, passed: 0, total: 0 },
                        } : p
                    ));
                } catch (err) {
                    if (controller.signal.aborted) break;
                    setPages(prev => prev.map((p, idx) =>
                        idx === i ? {
                            ...p,
                            status: 'error' as const,
                            error: err instanceof Error ? err.message : 'Audit failed',
                        } : p
                    ));
                }

                setProgress(prev => ({ ...prev, current: i + 1 }));
            }

            if (!controller.signal.aborted) {
                setCompleted(true);
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                setError(err instanceof Error ? err.message : 'Crawl failed. Please try again.');
            }
        } finally {
            setCrawling(false);
            abortRef.current = null;
        }
    }, [domain, pageLimit]);

    const cancelCrawl = useCallback(() => {
        abortRef.current?.abort();
        setCrawling(false);
        setCompleted(true);
    }, []);

    const reCrawl = useCallback(() => {
        startCrawl();
    }, [startCrawl]);

    // Sort pages
    const sortedPages = [...pages].sort((a, b) => {
        if (a.status !== 'done' && b.status !== 'done') return 0;
        if (a.status !== 'done') return 1;
        if (b.status !== 'done') return -1;

        switch (sortMode) {
            case 'score':
                return (a.score ?? 100) - (b.score ?? 100); // worst first
            case 'issues': {
                const issuesA = a.issues?.filter(i => i.severity !== 'passed').length ?? 0;
                const issuesB = b.issues?.filter(i => i.severity !== 'passed').length ?? 0;
                return issuesB - issuesA; // most issues first
            }
            case 'alpha':
                return a.url.localeCompare(b.url);
            default:
                return 0;
        }
    });

    // Summary stats
    const donePages = pages.filter(p => p.status === 'done');
    const avgScore = donePages.length > 0
        ? Math.round(donePages.reduce((sum, p) => sum + (p.score ?? 0), 0) / donePages.length)
        : 0;
    const totalCritical = donePages.reduce((sum, p) => sum + (p.summary?.critical ?? 0), 0);
    const pagesNeedingWork = donePages.filter(p => (p.score ?? 100) < 80).length;

    return (
        <div className="premium-card rounded-2xl p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/10">
                    <Bug className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">Site Crawler</h3>
                    <p className="text-xs text-[var(--text-muted)]">Multi-page audit and issue detection</p>
                </div>
            </div>

            {/* Input Section */}
            <div className="glass-card rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Domain</label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                placeholder="example.com"
                                disabled={crawling}
                                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 transition-all disabled:opacity-50"
                                onKeyDown={(e) => e.key === 'Enter' && !crawling && startCrawl()}
                            />
                        </div>
                    </div>

                    <div className="w-full sm:w-32">
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Page Limit</label>
                        <select
                            value={pageLimit}
                            onChange={(e) => setPageLimit(Number(e.target.value))}
                            disabled={crawling}
                            className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 transition-all disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value={5}>5 pages</option>
                            <option value={10}>10 pages</option>
                            <option value={20}>20 pages</option>
                        </select>
                    </div>

                    {!crawling ? (
                        <button
                            onClick={completed ? reCrawl : startCrawl}
                            disabled={!domain.trim()}
                            className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/10"
                        >
                            {completed ? (
                                <>
                                    <RotateCcw className="w-4 h-4" />
                                    Re-crawl
                                </>
                            ) : (
                                <>
                                    <Bug className="w-4 h-4" />
                                    Start Crawl
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={cancelCrawl}
                            className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Progress Bar */}
            {(crawling || (completed && pages.length > 0)) && progress.total > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">
                            {crawling ? 'Crawling...' : 'Crawl complete'}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">
                            {progress.current} of {progress.total} pages crawled
                        </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500 ease-out"
                            style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            {donePages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="glass-card rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{donePages.length}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Total Pages</p>
                    </div>
                    <div className="glass-card rounded-xl p-3 text-center">
                        <p className={`text-xl font-bold tabular-nums ${avgScore >= 80 ? 'text-emerald-400' : avgScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                            {avgScore}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Avg Score</p>
                    </div>
                    <div className="glass-card rounded-xl p-3 text-center">
                        <p className={`text-xl font-bold tabular-nums ${totalCritical > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {totalCritical}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Critical Issues</p>
                    </div>
                    <div className="glass-card rounded-xl p-3 text-center">
                        <p className={`text-xl font-bold tabular-nums ${pagesNeedingWork > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {pagesNeedingWork}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Need Work</p>
                    </div>
                </div>
            )}

            {/* Sort Options */}
            {donePages.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Sort by:</span>
                    {([
                        { key: 'score' as SortMode, label: 'Worst Score' },
                        { key: 'issues' as SortMode, label: 'Most Issues' },
                        { key: 'alpha' as SortMode, label: 'A-Z' },
                    ]).map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setSortMode(opt.key)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                                sortMode === opt.key
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Page Cards */}
            {pages.length > 0 && (
                <div className="space-y-2">
                    {sortedPages.map((page, idx) => (
                        <PageCard key={`${page.url}-${idx}`} page={page} />
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!crawling && pages.length === 0 && !error && (
                <div className="text-center py-12">
                    <Bug className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-[var(--text-muted)]">Enter a domain to crawl and audit multiple pages</p>
                </div>
            )}
        </div>
    );
}
