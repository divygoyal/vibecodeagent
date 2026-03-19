'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2,
    Globe, Clock, FileText, Image, Link2, Code2, Shield, Share2,
    ChevronDown, ChevronRight, Download, RotateCcw, ExternalLink, Zap, Copy, Check, ScanSearch,
    Target, BarChart3, Hash
} from 'lucide-react';
import type { AuditReport, AuditIssue, Severity } from '@/lib/siteAudit';
import { useContainerStatus, useSiteList, useAnalyticsData, usePropertyList } from '@/lib/useDashboardData';
import FixWithBotButton from '@/components/FixWithBotButton';

// ─── Severity config ───
const severityConfig: Record<Severity, { label: string; color: string; textColor: string; bg: string; border: string; borderLeft: string; glowBg: string; icon: React.ElementType }> = {
    critical: { label: 'Critical', color: 'text-red-400', textColor: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/20', borderLeft: 'border-l-red-500', glowBg: 'bg-red-500/[0.03]', icon: AlertTriangle },
    warning: { label: 'Warning', color: 'text-amber-400', textColor: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/20', borderLeft: 'border-l-amber-500', glowBg: 'bg-amber-500/[0.03]', icon: AlertCircle },
    info: { label: 'Info', color: 'text-blue-400', textColor: 'text-blue-300', bg: 'bg-blue-500/10', border: 'border-blue-500/20', borderLeft: 'border-l-blue-500', glowBg: 'bg-blue-500/[0.03]', icon: Info },
    passed: { label: 'Passed', color: 'text-emerald-400', textColor: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', borderLeft: 'border-l-emerald-500', glowBg: 'bg-emerald-500/[0.03]', icon: CheckCircle2 },
};

const categoryIcons: Record<string, React.ElementType> = {
    'HTTP': Globe, 'Security': Shield, 'Performance': Clock, 'Title': FileText,
    'Meta': FileText, 'Head': Code2, 'Headings': FileText, 'Content': FileText,
    'Images': Image, 'Links': Link2, 'Social': Share2, 'Structured Data': Code2,
    'Mobile': Globe, 'SEO': Search,
};

// ─── Score ring ───
function ScoreRing({ score, size = 'lg' }: { score: number; size?: 'lg' | 'xl' }) {
    const dims = size === 'xl' ? 'w-44 h-44' : 'w-36 h-36';
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const label = score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Work' : 'Critical';

    return (
        <div className={`relative ${dims} score-ring-glow`}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--card-border, #27272a)" strokeWidth="7" />
                <motion.circle
                    cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="7"
                    strokeLinecap="round" strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                    className="text-4xl font-bold"
                    style={{ color }}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                >
                    {score}
                </motion.span>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">{label}</span>
            </div>
        </div>
    );
}

// ─── Issue row ───
function IssueRow({ issue, auditUrl, index }: { issue: AuditIssue; auditUrl?: string; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const sev = severityConfig[issue.severity];
    const SevIcon = sev.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.25 }}
            className={`border-l-2 ${sev.borderLeft} rounded-xl overflow-hidden transition-all ${sev.glowBg} border border-[var(--card-border)] hover:border-[var(--card-border-hover,rgba(255,255,255,0.12))]`}
        >
            <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
            >
                <div className={`w-7 h-7 rounded-lg ${sev.bg} flex items-center justify-center flex-shrink-0`}>
                    <SevIcon className={`w-3.5 h-3.5 ${sev.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{issue.title}</span>
                    {issue.description && !expanded && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{issue.description}</p>
                    )}
                </div>
                {issue.value && (
                    <span className="text-xs text-[var(--text-muted)] font-mono px-2.5 py-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg flex-shrink-0">
                        {issue.value}
                    </span>
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${sev.bg} ${sev.color} flex-shrink-0`}>
                    {sev.label}
                </span>
                {issue.severity !== 'passed' && (
                    <FixWithBotButton
                        label="Fix"
                        context={`Fix this SEO issue on ${auditUrl || 'the audited page'}: ${issue.title} - ${issue.description || ''}`}
                        size="sm"
                        variant={issue.severity === 'critical' ? 'solid' : 'ghost'}
                    />
                )}
                {(issue.description || issue.recommendation) ? (
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                    </motion.div>
                ) : null}
            </button>
            <AnimatePresence>
                {expanded && (issue.description || issue.recommendation) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-4 pt-0 space-y-3 border-t border-[var(--card-border)]">
                            {issue.description && (
                                <p className="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">{issue.description}</p>
                            )}
                            {issue.recommendation && (
                                <div className="glass-card rounded-xl p-4 space-y-3">
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Recommendation</p>
                                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{issue.recommendation}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pl-8">
                                        <FixWithBotButton
                                            label="Fix with AI"
                                            context={`Fix this SEO issue on ${auditUrl || 'the audited page'}: ${issue.title} - ${issue.description}`}
                                            size="sm"
                                            variant="solid"
                                        />
                                        <FixWithBotButton
                                            label="Analyze"
                                            size="sm"
                                            variant="ghost"
                                            context={`Get detailed analysis: ${issue.title}`}
                                        />
                                        {auditUrl && (
                                            <a
                                                href={auditUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                View on Page
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Category group ───
function CategoryGroup({ category, issues, auditUrl, index }: { category: string; issues: AuditIssue[]; auditUrl?: string; index: number }) {
    const [collapsed, setCollapsed] = useState(false);
    const CatIcon = categoryIcons[category] || FileText;
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const passed = issues.filter(i => i.severity === 'passed').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className="premium-card rounded-2xl overflow-hidden"
        >
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left group hover:bg-white/[0.01] transition-colors"
            >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <CatIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{category}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{issues.length} check{issues.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {criticals > 0 && (
                        <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-full">
                            {criticals} critical
                        </span>
                    )}
                    {warnings > 0 && (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                            {warnings} warning
                        </span>
                    )}
                    {infos > 0 && (
                        <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-full">
                            {infos} info
                        </span>
                    )}
                    {passed > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                            {passed} passed
                        </span>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: collapsed ? -90 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                >
                    <ChevronDown className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" />
                </motion.div>
            </button>
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-5 space-y-2.5 border-t border-[var(--card-border)]">
                            <div className="pt-4 space-y-2.5">
                                {issues.map((issue, i) => (
                                    <IssueRow key={issue.id} issue={issue} auditUrl={auditUrl} index={i} />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Export helper ───
function csvEscape(val: string): string {
    if (!val) return '';
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

// ─── Title length badge ───
function CharCountBadge({ count, min, max }: { count: number; min: number; max: number }) {
    const color = count >= min && count <= max ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                  count > 0 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                  'text-red-400 bg-red-500/10 border-red-500/20';
    return (
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${color}`}>
            {count} chars
        </span>
    );
}

// ═══════════════════════════════════════
// ─── MAIN PAGE COMPONENT ───
// ═══════════════════════════════════════

export default function AuditPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    <p className="text-sm text-[var(--text-muted)]">Loading audit tool...</p>
                </div>
            </div>
        }>
            <AuditPageInner />
        </Suspense>
    );
}

function AuditPageInner() {
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
            const timer = setTimeout(() => {
                setUrl(decoded);
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

    const sampleUrls = ['google.com', 'github.com', 'wikipedia.org', 'reddit.com'];

    return (
        <div className="space-y-6">
            {/* ─── Hero Header ─── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <h2 className="text-2xl md:text-3xl font-bold gradient-text mb-1">Site Audit</h2>
                <p className="text-sm text-[var(--text-muted)] max-w-xl">
                    Analyze any page for 50+ SEO and technical issues. Get actionable recommendations powered by AI.
                </p>
            </motion.div>

            {/* ─── URL Input ─── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="glass-card rounded-2xl p-6"
            >
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !loading && runAudit()}
                            placeholder="Enter URL to audit (e.g. example.com)"
                            aria-label="URL to audit"
                            className="w-full pl-12 pr-4 py-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>
                    <button
                        data-audit-btn
                        onClick={runAudit}
                        disabled={loading || !url.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:hover:from-emerald-500 disabled:hover:to-cyan-500 text-black font-semibold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Auditing...
                            </>
                        ) : (
                            <>
                                <Search className="w-4 h-4" />
                                Run Audit
                            </>
                        )}
                    </button>
                </div>
            </motion.div>

            {/* ─── Quick Audit: User's Own Pages ─── */}
            {userSiteUrl && userPages.length > 0 && !report && !loading && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="premium-card rounded-2xl p-6"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Quick Audit Your Pages</h3>
                            <p className="text-[10px] text-[var(--text-muted)]">Click to fill URL, double-click to audit immediately</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {userPages.map((page, i) => {
                            const fullUrl = page.startsWith('http') ? page : `${userSiteUrl}${page}`;
                            return (
                                <button
                                    key={i}
                                    onClick={() => { setUrl(fullUrl); }}
                                    onDoubleClick={() => { setUrl(fullUrl); setTimeout(() => { document.querySelector<HTMLButtonElement>('[data-audit-btn]')?.click(); }, 50); }}
                                    className="premium-card rounded-xl px-4 py-3 text-left hover:border-emerald-500/20 transition-all group"
                                >
                                    <div className="text-xs text-[var(--text-secondary)] group-hover:text-emerald-400 truncate font-medium transition-colors">
                                        {page}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{fullUrl}</div>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* ─── Error ─── */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-3 px-5 py-4 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400 font-medium">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Loading skeleton ─── */}
            {loading && (
                <div className="space-y-4">
                    {/* Score skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="shimmer-loading rounded-2xl h-56" />
                        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="shimmer-loading rounded-xl h-24" />
                            ))}
                        </div>
                    </div>
                    {/* Meta skeleton */}
                    <div className="shimmer-loading rounded-2xl h-32" />
                    {/* Action bar skeleton */}
                    <div className="shimmer-loading rounded-xl h-14" />
                    {/* Category skeletons */}
                    {[1, 2, 3].map(i => (
                        <div key={i} className="shimmer-loading rounded-2xl h-28" />
                    ))}
                </div>
            )}

            {/* ─── Report ─── */}
            {report && !loading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6"
                >
                    {/* Audit timestamp */}
                    <div className="flex justify-end text-[10px] text-[var(--text-muted)]">
                        Audited {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {/* ─── Score + Summary Dashboard ─── */}
                    <div className="premium-card rounded-2xl p-8">
                        <div className="flex flex-col lg:flex-row items-center gap-8">
                            {/* Score ring */}
                            <div className="flex flex-col items-center">
                                <ScoreRing score={report.score} size="xl" />
                                <a
                                    href={report.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 text-xs text-[var(--text-muted)] hover:text-emerald-400 transition-colors flex items-center gap-1 truncate max-w-[220px]"
                                >
                                    {new URL(report.url).hostname}
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                            </div>

                            {/* Score details */}
                            <div className="flex-1 w-full space-y-5">
                                <div>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">SEO Health Score: {report.score}/100</h3>
                                    <div className="mt-2 w-full h-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                                background: `linear-gradient(to right, ${report.score >= 80 ? '#22c55e' : report.score >= 50 ? '#f59e0b' : '#ef4444'}, ${report.score >= 80 ? '#06b6d4' : report.score >= 50 ? '#f59e0b' : '#ef4444'})`,
                                            }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${report.score}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                        />
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-1.5">
                                        {report.score >= 80 ? 'Great SEO health! Minor optimizations available.' :
                                         report.score >= 50 ? 'Room for improvement. Address warnings and critical issues.' :
                                         'Needs attention. Multiple critical issues detected.'}
                                    </p>
                                </div>

                                {/* Summary stat cards */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {([
                                        { key: 'critical' as Severity, accentColor: 'bg-red-500' },
                                        { key: 'warning' as Severity, accentColor: 'bg-amber-500' },
                                        { key: 'info' as Severity, accentColor: 'bg-blue-500' },
                                        { key: 'passed' as Severity, accentColor: 'bg-emerald-500' },
                                    ]).map(({ key, accentColor }) => {
                                        const config = severityConfig[key];
                                        const Icon = config.icon;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setFilter(filter === key ? 'all' : key)}
                                                className={`stat-card-hover rounded-xl p-4 text-left transition-all border border-[var(--card-border)] relative overflow-hidden ${filter === key ? 'ring-2 ring-emerald-500/30' : ''}`}
                                            >
                                                <div className={`absolute top-0 left-0 right-0 h-1 ${accentColor} rounded-t-xl`} />
                                                <Icon className={`w-5 h-5 ${config.color} mb-2`} />
                                                <div className={`text-2xl font-bold ${config.color}`}>
                                                    {report.summary[key]}
                                                </div>
                                                <div className="text-xs text-[var(--text-muted)] capitalize">{config.label}</div>
                                            </button>
                                        );
                                    })}
                                    <div className="stat-card-hover rounded-xl p-4 text-left border border-[var(--card-border)] relative overflow-hidden">
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-t-xl" />
                                        <Hash className="w-5 h-5 text-[var(--text-muted)] mb-2" />
                                        <div className="text-2xl font-bold text-[var(--text-primary)]">
                                            {report.summary.total}
                                        </div>
                                        <div className="text-xs text-[var(--text-muted)]">Total Checks</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Page Meta Section ─── */}
                    <div className="premium-card rounded-2xl p-6">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-400" />
                            Page Metadata
                        </h3>

                        {/* Title & Description */}
                        <div className="space-y-3 mb-5">
                            <div className="glass-card rounded-xl p-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title Tag</span>
                                    <CharCountBadge count={report.meta.title?.length || 0} min={30} max={60} />
                                </div>
                                <p className="text-sm text-[var(--text-primary)] font-medium">
                                    {report.meta.title || <span className="text-red-400 italic">Missing title tag</span>}
                                </p>
                            </div>
                            <div className="glass-card rounded-xl p-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Meta Description</span>
                                    <CharCountBadge count={report.meta.description?.length || 0} min={120} max={160} />
                                </div>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    {report.meta.description || <span className="text-amber-400 italic">Missing meta description</span>}
                                </p>
                            </div>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { label: 'Response Time', value: `${report.responseTime}ms`, icon: Clock, warn: report.responseTime > 2000 },
                                { label: 'Page Size', value: `${Math.round(report.meta.pageSize / 1024)}KB`, icon: FileText, warn: report.meta.pageSize > 500000 },
                                { label: 'Word Count', value: `${report.meta.wordCount}`, icon: Target, warn: report.meta.wordCount < 300 },
                                { label: 'Images', value: `${report.meta.images.total}`, icon: Image, warn: false },
                                { label: 'Links', value: `${report.meta.links.total}`, icon: Link2, warn: false },
                                { label: 'Scripts', value: `${report.meta.scripts}`, icon: Code2, warn: report.meta.scripts > 15 },
                            ].map(stat => (
                                <div key={stat.label} className="stat-card-hover rounded-xl p-3.5 flex items-center gap-3 border border-[var(--card-border)]">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${stat.warn ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                                        <stat.icon className={`w-4 h-4 ${stat.warn ? 'text-amber-400' : 'text-emerald-400'}`} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-[var(--text-primary)]">{stat.value}</div>
                                        <div className="text-[10px] text-[var(--text-muted)]">{stat.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ─── Action Bar ─── */}
                    <div className="glass-card rounded-xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        {/* Filter pills */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                            {(['all', 'critical', 'warning', 'info', 'passed'] as FilterMode[]).map(f => {
                                const isActive = filter === f;
                                const count = f === 'all' ? report.summary.total : report.summary[f as Severity];
                                return (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                                            isActive
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : 'bg-[var(--card-bg)] text-[var(--text-muted)] border-[var(--card-border)] hover:text-[var(--text-secondary)] hover:border-[var(--card-border-hover,rgba(255,255,255,0.12))]'
                                        }`}
                                    >
                                        {f === 'all' ? 'All' : severityConfig[f as Severity].label}
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-500/20' : 'bg-white/[0.05]'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {(report.summary.critical > 0 || report.summary.warning > 0) && (
                                <FixWithBotButton label="Analyze All Issues" size="md" variant="solid" context="Get deep analysis and fix recommendations from your bot" site={url} />
                            )}
                            <button
                                onClick={() => exportAuditCSV(report)}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </button>
                            <button
                                onClick={shareReport}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Share'}
                            </button>
                            <button
                                onClick={runAudit}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Re-audit
                            </button>
                        </div>
                    </div>

                    {/* ─── Issues by category ─── */}
                    <div className="space-y-4">
                        {sortedCategories.length === 0 && (
                            <div className="premium-card rounded-2xl p-8 text-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                                <p className="text-sm text-[var(--text-secondary)]">No issues found for this filter.</p>
                                <button onClick={() => setFilter('all')} className="text-xs text-emerald-400 hover:underline mt-2">
                                    Show all checks
                                </button>
                            </div>
                        )}
                        {sortedCategories.map((cat, i) => (
                            <CategoryGroup key={cat} category={cat} issues={groupedIssues[cat]} auditUrl={url} index={i} />
                        ))}
                    </div>

                    {/* ─── Footer timestamp ─── */}
                    <div className="text-center text-[10px] text-[var(--text-muted)] pt-4">
                        Audited at {new Date(report.fetchedAt).toLocaleString()} &middot; HTTP {report.statusCode}
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
                            className="flex items-center gap-2 px-6 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-secondary)] font-medium text-sm rounded-xl hover:bg-white/[0.08] transition"
                        >
                            <Search className="w-4 h-4" />
                            Audit Another Page
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ─── Empty state ─── */}
            {!report && !loading && !error && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="flex flex-col items-center justify-center py-20 text-center"
                >
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-6 glow-emerald">
                        <ScanSearch className="w-11 h-11 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Enter a URL to Analyze</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-md mb-8">
                        Get a comprehensive SEO audit with actionable recommendations.
                        Checks 50+ technical and on-page SEO factors.
                    </p>

                    {/* Sample URL chips */}
                    <div className="flex flex-wrap justify-center gap-2 mb-8">
                        {sampleUrls.map(sampleUrl => (
                            <button
                                key={sampleUrl}
                                onClick={() => setUrl(sampleUrl)}
                                className="px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-emerald-400 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full hover:border-emerald-500/20 hover:bg-emerald-500/[0.05] transition-all"
                            >
                                {sampleUrl}
                            </button>
                        ))}
                    </div>

                    {/* Category badges */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[var(--text-muted)]">
                        {['Meta Tags', 'Headings', 'Images', 'Performance', 'Security', 'Social Tags', 'Structured Data', 'Links'].map(cat => (
                            <div key={cat} className="stat-card-hover px-4 py-2.5 border border-[var(--card-border)] rounded-lg flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {cat}
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
