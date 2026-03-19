'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Search, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2,
    Globe, Clock, FileText, Image, Link2, Code2, Shield, Share2,
    ChevronDown, ChevronRight, Download, RotateCcw, ExternalLink, Zap, Copy, Check, ScanSearch
} from 'lucide-react';
import type { AuditReport, AuditIssue, Severity } from '@/lib/siteAudit';
import { useContainerStatus, useSiteList, useAnalyticsData, usePropertyList } from '@/lib/useDashboardData';
import FixWithBotButton from '@/components/FixWithBotButton';

// ─── Severity config ───
const severityConfig: Record<Severity, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
    critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle },
    warning: { label: 'Warning', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertCircle },
    info: { label: 'Info', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Info },
    passed: { label: 'Passed', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
};

const categoryIcons: Record<string, React.ElementType> = {
    'HTTP': Globe, 'Security': Shield, 'Performance': Clock, 'Title': FileText,
    'Meta': FileText, 'Head': Code2, 'Headings': FileText, 'Content': FileText,
    'Images': Image, 'Links': Link2, 'Social': Share2, 'Structured Data': Code2,
    'Mobile': Globe, 'SEO': Search,
};

// ─── Score ring ───
function ScoreRing({ score }: { score: number }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

    return (
        <div className="relative w-36 h-36 score-ring-glow">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
                <circle
                    cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{score}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Score</span>
            </div>
        </div>
    );
}

// ─── Issue row ───
function IssueRow({ issue }: { issue: AuditIssue }) {
    const [expanded, setExpanded] = useState(false);
    const sev = severityConfig[issue.severity];
    const SevIcon = sev.icon;

    return (
        <div className={`border ${sev.border} rounded-xl overflow-hidden transition-colors`}>
            <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
                <SevIcon className={`w-4 h-4 flex-shrink-0 ${sev.color}`} />
                <span className="flex-1 text-sm text-zinc-300">{issue.title}</span>
                {issue.value && (
                    <span className="text-xs text-zinc-500 font-mono px-2 py-0.5 bg-white/[0.03] rounded">
                        {issue.value}
                    </span>
                )}
                {(issue.description || issue.recommendation) ? (
                    expanded ? <ChevronDown className="w-4 h-4 text-zinc-600" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />
                ) : null}
            </button>
            {expanded && (issue.description || issue.recommendation) && (
                <div className="px-4 pb-3 pt-0 space-y-2 border-t border-white/[0.04]">
                    {issue.description && (
                        <p className="text-xs text-zinc-500 mt-2">{issue.description}</p>
                    )}
                    {issue.recommendation && (
                        <div className="flex items-start gap-2 text-xs text-emerald-400/80 bg-emerald-500/[0.05] rounded-lg px-3 py-2">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span className="flex-1">{issue.recommendation}</span>
                            {(issue.severity === 'critical' || issue.severity === 'warning') && (
                                <FixWithBotButton label="Analyze" size="sm" variant="ghost" context={`Get detailed analysis: ${issue.title}`} />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Category group ───
function CategoryGroup({ category, issues }: { category: string; issues: AuditIssue[] }) {
    const [collapsed, setCollapsed] = useState(false);
    const CatIcon = categoryIcons[category] || FileText;
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const passed = issues.filter(i => i.severity === 'passed').length;

    return (
        <div className="space-y-2">
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center gap-3 px-1 py-2 text-left group"
            >
                {collapsed ? <ChevronRight className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
                <CatIcon className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-200 flex-1">{category}</span>
                <div className="flex items-center gap-2">
                    {criticals > 0 && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{criticals} critical</span>}
                    {warnings > 0 && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{warnings} warning</span>}
                    {passed > 0 && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{passed} passed</span>}
                </div>
            </button>
            {!collapsed && (
                <div className="space-y-1.5 pl-7">
                    {issues.map(issue => <IssueRow key={issue.id} issue={issue} />)}
                </div>
            )}
        </div>
    );
}

// ─── Export helper ───
function csvEscape(val: string): string {
    if (!val) return '';
    // Quote any field containing commas, quotes, or newlines
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

function exportAuditCSV(report: AuditReport) {
    const rows = [
        ['Severity', 'Category', 'Issue', 'Description', 'Value', 'Recommendation'],
        ...report.issues.map(i => [
            csvEscape(i.severity), csvEscape(i.category), csvEscape(i.title),
            csvEscape(i.description || ''),
            csvEscape(i.value || ''),
            csvEscape(i.recommendation || '')
        ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `site-audit-${new URL(report.url).hostname}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ─── Filter bar ───
type FilterMode = 'all' | 'critical' | 'warning' | 'info' | 'passed';

// ═══════════════════════════════════════
// ─── MAIN PAGE COMPONENT ───
// ═══════════════════════════════════════

export default function AuditPage() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<AuditReport | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<FilterMode>('all');
    const [copied, setCopied] = useState(false);
    const searchParams = useSearchParams();

    const shareReport = () => {
        if (!report) return;
        const shareData = {
            url: report.url,
            score: report.score,
            summary: report.summary,
            date: new Date().toISOString(),
        };
        const encoded = btoa(JSON.stringify(shareData));
        const shareUrl = `${window.location.origin}/dashboard/audit?report=${encoded}`;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Auto-fill URL from query params (e.g., from SEO page "Audit this page" action)
    useEffect(() => {
        const urlParam = searchParams.get('url');
        if (urlParam && !report && !loading) {
            const decoded = decodeURIComponent(urlParam);
            setUrl(decoded);
            // Auto-run audit after a short delay
            const timer = setTimeout(() => {
                setUrl(decoded);
                // Trigger audit via button click
                document.querySelector<HTMLButtonElement>('[data-audit-btn]')?.click();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch user's own sites and pages for quick-audit suggestions
    const { hasGoogleConnection } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const { properties } = usePropertyList(hasGoogleConnection);
    const [selectedProp, setSelectedProp] = useState('');
    useEffect(() => {
        if (properties.length > 0 && !selectedProp) setSelectedProp(properties[0].property);
    }, [properties, selectedProp]);
    const { data: analyticsData } = useAnalyticsData('all', selectedProp, hasGoogleConnection);
    const userPages: string[] = (analyticsData?.pages || []).slice(0, 8).map((p: any) => p.page);
    const userSiteUrl = sites.length > 0 ? sites[0].siteUrl.replace('sc-domain:', 'https://') : '';

    const runAudit = async () => {
        if (!url.trim()) return;
        setLoading(true);
        setError('');
        setReport(null);

        try {
            const res = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Audit failed');
            setReport(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Group issues by category
    const groupedIssues: Record<string, AuditIssue[]> = {};
    if (report) {
        const filtered = filter === 'all' ? report.issues : report.issues.filter(i => i.severity === filter);
        for (const issue of filtered) {
            if (!groupedIssues[issue.category]) groupedIssues[issue.category] = [];
            groupedIssues[issue.category].push(issue);
        }
    }

    // Sort categories: those with criticals first
    const sortedCategories = Object.keys(groupedIssues).sort((a, b) => {
        const aCrit = groupedIssues[a].filter(i => i.severity === 'critical').length;
        const bCrit = groupedIssues[b].filter(i => i.severity === 'critical').length;
        if (aCrit !== bCrit) return bCrit - aCrit;
        const aWarn = groupedIssues[a].filter(i => i.severity === 'warning').length;
        const bWarn = groupedIssues[b].filter(i => i.severity === 'warning').length;
        return bWarn - aWarn;
    });

    return (
        <div className="space-y-6">
            {/* ─── Header ─── */}
            <div>
                <h2 className="text-xl font-bold text-white">Site Audit</h2>
                <p className="text-sm text-zinc-500 mt-1">
                    Analyze any page for 50+ SEO and technical issues with actionable recommendations.
                </p>
            </div>

            {/* ─── URL Input ─── */}
            <div className="flex gap-3">
                <div className="flex-1 relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !loading && runAudit()}
                        placeholder="Enter URL to audit (e.g. example.com)"
                        aria-label="URL to audit"
                        className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                </div>
                <button
                    data-audit-btn
                    onClick={runAudit}
                    disabled={loading || !url.trim()}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Auditing...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4" />
                            Audit
                        </>
                    )}
                </button>
            </div>

            {/* ─── Quick Audit: User's Own Pages ─── */}
            {userSiteUrl && userPages.length > 0 && !report && !loading && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-white">Quick Audit Your Pages</h3>
                        <span className="text-[10px] text-zinc-500 ml-1">Click any page to audit it instantly</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {userPages.map((page, i) => {
                            const fullUrl = page.startsWith('http') ? page : `${userSiteUrl}${page}`;
                            return (
                                <button
                                    key={i}
                                    onClick={() => { setUrl(fullUrl); }}
                                    onDoubleClick={() => { setUrl(fullUrl); setTimeout(() => { document.querySelector<HTMLButtonElement>('[data-audit-btn]')?.click(); }, 50); }}
                                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-emerald-400 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:border-emerald-500/20 hover:bg-emerald-500/[0.05] transition-all truncate max-w-[220px]"
                                    title={`Audit ${fullUrl}`}
                                >
                                    {page}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-2">Click to fill URL, then press Audit. Double-click to audit immediately.</p>
                </div>
            )}

            {/* ─── Error ─── */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* ─── Loading skeleton ─── */}
            {loading && (
                <div className="space-y-4 animate-pulse">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <div className="lg:col-span-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 h-52" />
                        <div className="lg:col-span-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 h-52" />
                    </div>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 h-24" />
                    ))}
                </div>
            )}

            {/* ─── Report ─── */}
            {report && !loading && (
                <div className="space-y-6">
                    {/* Audit timestamp */}
                    <div className="flex justify-end text-[10px] text-zinc-600">
                        Audited {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {/* Score + Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        {/* Score ring */}
                        <div className="premium-card p-6 flex flex-col items-center justify-center">
                            <ScoreRing score={report.score} />
                            <div className="mt-3 flex items-center gap-2">
                                <a
                                    href={report.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1 truncate max-w-[180px]"
                                >
                                    {new URL(report.url).hostname}
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                            </div>
                        </div>

                        {/* Summary cards */}
                        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {(['critical', 'warning', 'info', 'passed'] as Severity[]).map(sev => {
                                const config = severityConfig[sev];
                                const Icon = config.icon;
                                return (
                                    <button
                                        key={sev}
                                        onClick={() => setFilter(filter === sev ? 'all' : sev)}
                                        className={`${config.bg} border ${config.border} rounded-xl p-4 text-left transition-all hover:scale-[1.02] ${filter === sev ? 'ring-1 ring-white/20' : ''}`}
                                    >
                                        <Icon className={`w-5 h-5 ${config.color} mb-2`} />
                                        <div className={`text-2xl font-bold ${config.color}`}>
                                            {report.summary[sev]}
                                        </div>
                                        <div className="text-xs text-zinc-500 capitalize">{config.label}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Page meta overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {[
                            { label: 'Response', value: `${report.responseTime}ms`, icon: Clock },
                            { label: 'Page Size', value: `${Math.round(report.meta.pageSize / 1024)}KB`, icon: FileText },
                            { label: 'Words', value: `${report.meta.wordCount}`, icon: FileText },
                            { label: 'Images', value: `${report.meta.images.total}`, icon: Image },
                            { label: 'Links', value: `${report.meta.links.total}`, icon: Link2 },
                            { label: 'Scripts', value: `${report.meta.scripts}`, icon: Code2 },
                        ].map(stat => (
                            <div key={stat.label} className="stat-card-hover bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center gap-3">
                                <stat.icon className="w-4 h-4 text-zinc-500" />
                                <div>
                                    <div className="text-sm font-semibold text-white">{stat.value}</div>
                                    <div className="text-[10px] text-zinc-600">{stat.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action bar */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">
                                {filter === 'all' ? `${report.summary.total} total checks` : `Showing ${severityConfig[filter as Severity].label.toLowerCase()} issues`}
                            </span>
                            {filter !== 'all' && (
                                <button onClick={() => setFilter('all')} className="text-xs text-emerald-400 hover:underline">Show all</button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {(report.summary.critical > 0 || report.summary.warning > 0) && (
                                <FixWithBotButton label="Analyze All Issues" size="md" variant="solid" context="Get deep analysis and fix recommendations from your bot" site={url} />
                            )}
                            <button
                                onClick={() => exportAuditCSV(report)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </button>
                            <button
                                onClick={shareReport}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Share'}
                            </button>
                            <button
                                onClick={runAudit}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Re-audit
                            </button>
                        </div>
                    </div>

                    {/* Issues by category */}
                    <div className="space-y-4">
                        {sortedCategories.map(cat => (
                            <CategoryGroup key={cat} category={cat} issues={groupedIssues[cat]} />
                        ))}
                    </div>

                    {/* Audit timestamp */}
                    <div className="text-center text-[10px] text-zinc-700 pt-4">
                        Audited at {new Date(report.fetchedAt).toLocaleString()} · HTTP {report.statusCode}
                    </div>

                    {/* ─── Quick Re-Audit Actions ─── */}
                    <div className="section-divider my-6" />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={runAudit}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold text-sm rounded-xl hover:opacity-90 transition shadow-lg shadow-emerald-500/20"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Re-Audit This Page
                        </button>
                        <button
                            onClick={() => {
                                setReport(null);
                                setUrl('');
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-white/[0.04] border border-white/[0.08] text-zinc-300 font-medium text-sm rounded-xl hover:bg-white/[0.08] transition"
                        >
                            <Search className="w-4 h-4" />
                            Audit Another Page
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Empty state ─── */}
            {!report && !loading && !error && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-4 glow-emerald">
                        <ScanSearch className="w-9 h-9 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">Run Your First Audit</h3>
                    <p className="text-sm text-zinc-500 max-w-md">
                        Enter any URL above to analyze it for 50+ SEO and technical issues.
                        Get actionable recommendations to improve your search rankings.
                    </p>
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-zinc-600">
                        {['Meta Tags', 'Headings', 'Images', 'Performance', 'Security', 'Social Tags', 'Structured Data', 'Links'].map(cat => (
                            <div key={cat} className="px-3 py-2 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                                {cat}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
