'use client';

import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2,
    Globe, Clock, FileText, Image, Link2, Code2, Shield, Share2,
    ChevronDown, ChevronUp, Download, RotateCcw, ExternalLink, Zap, Copy, Check, ScanSearch,
    Target, Hash, Layers, ArrowUpDown, Type, ScrollText
} from 'lucide-react';
import type { AuditReport, AuditIssue, Severity } from '@/lib/siteAudit';
import DemoModeBanner from '@/components/DemoModeBanner';
import { DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList, useAnalyticsData, usePropertyList } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import FixWithBotButton from '@/components/FixWithBotButton';

// ════════════════════════════════════════════════════════════════
// ─── CONSTANTS & CONFIGS ───
// ════════════════════════════════════════════════════════════════

const severityConfig: Record<Severity, { label: string; color: string; textColor: string; bg: string; border: string; borderLeft: string; glowBg: string; icon: React.ElementType }> = {
    critical: { label: 'Critical', color: 'text-red-400', textColor: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/20', borderLeft: 'border-l-red-500', glowBg: 'bg-red-500/[0.03]', icon: AlertTriangle },
    warning: { label: 'Warning', color: 'text-amber-400', textColor: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/20', borderLeft: 'border-l-amber-500', glowBg: 'bg-amber-500/[0.03]', icon: AlertCircle },
    info: { label: 'Info', color: 'text-blue-400', textColor: 'text-blue-300', bg: 'bg-blue-500/10', border: 'border-blue-500/20', borderLeft: 'border-l-blue-500', glowBg: 'bg-blue-500/[0.03]', icon: Info },
    passed: { label: 'Passed', color: 'text-emerald-400', textColor: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', borderLeft: 'border-l-emerald-500', glowBg: 'bg-emerald-500/[0.03]', icon: CheckCircle2 },
};

const categoryIcons: Record<string, React.ElementType> = {
    'HTTP': Globe, 'Security': Shield, 'Performance': Clock, 'Title': FileText,
    'Meta': FileText, 'Head': Code2, 'Headings': Type, 'Content': ScrollText,
    'Images': Image, 'Links': Link2, 'Social': Share2, 'Structured Data': Code2,
    'Mobile': Globe, 'SEO': Search,
};

type FilterMode = 'all' | 'critical' | 'warning' | 'info' | 'passed';
type SortDir = 'asc' | 'desc';

const sampleUrls = ['google.com', 'github.com', 'wikipedia.org', 'reddit.com'];

// ════════════════════════════════════════════════════════════════
// ─── SCORE RING ───
// ════════════════════════════════════════════════════════════════

function ScoreRing({ score }: { score: number }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const label = score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Work' : 'Critical';

    return (
        <div className="relative w-32 h-32 sm:w-44 sm:h-44 score-ring-glow">
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
                    className="text-3xl sm:text-4xl font-bold"
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

// ════════════════════════════════════════════════════════════════
// ─── SORTABLE DETAIL TABLE ───
// ════════════════════════════════════════════════════════════════

interface Column<T> {
    key: string;
    label: string;
    render: (row: T) => React.ReactNode;
    sortValue?: (row: T) => string | number | boolean;
    width?: string;
}

function DetailTable<T>({ data, columns, maxHeight = '320px' }: { data: T[]; columns: Column<T>[]; maxHeight?: string }) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sorted = useMemo(() => {
        if (!sortKey) return data;
        const col = columns.find(c => c.key === sortKey);
        if (!col?.sortValue) return data;
        return [...data].sort((a, b) => {
            const av = col.sortValue!(a);
            const bv = col.sortValue!(b);
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            if (typeof av === 'boolean' && typeof bv === 'boolean') {
                return sortDir === 'asc' ? (av === bv ? 0 : av ? -1 : 1) : (av === bv ? 0 : av ? 1 : -1);
            }
            return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
        });
    }, [data, sortKey, sortDir, columns]);

    if (data.length === 0) {
        return <p className="text-xs text-[var(--text-muted)] italic py-4 text-center">No items found.</p>;
    }

    return (
        <div className="glass-card rounded-xl overflow-hidden border border-[var(--card-border)]">
            <div className="overflow-auto" style={{ maxHeight }}>
                <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    onClick={() => col.sortValue && handleSort(col.key)}
                                    className={`text-left px-2 py-2 sm:px-4 sm:py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] ${col.sortValue ? 'cursor-pointer hover:text-[var(--text-secondary)] select-none' : ''}`}
                                    style={col.width ? { width: col.width } : undefined}
                                >
                                    <span className="flex items-center gap-1">
                                        {col.label}
                                        {col.sortValue && sortKey === col.key && (
                                            sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                        )}
                                        {col.sortValue && sortKey !== col.key && (
                                            <ArrowUpDown className="w-3 h-3 opacity-30" />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((row, i) => (
                            <tr key={i} className="table-row-premium border-b border-[var(--card-border)] last:border-0 hover:bg-white/[0.02] transition-colors">
                                {columns.map(col => (
                                    <td key={col.key} className="px-2 py-2 sm:px-4 sm:py-2.5 text-[var(--text-secondary)]">
                                        {col.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-2 border-t border-[var(--card-border)] text-[10px] text-[var(--text-muted)] bg-[var(--card-bg)]">
                {data.length} item{data.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// ─── PAGE OVERVIEW STAT CARD (clickable with detail expansion) ───
// ════════════════════════════════════════════════════════════════

function OverviewCard({ icon: Icon, label, value, subtext, warn, expandedContent }: {
    icon: React.ElementType;
    label: string;
    value: string;
    subtext?: string;
    warn?: boolean;
    expandedContent?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const hasContent = !!expandedContent;

    return (
        <div className="flex flex-col">
            <button
                onClick={() => hasContent && setOpen(!open)}
                className={`stat-card-hover rounded-xl p-4 text-left border border-[var(--card-border)] transition-all relative overflow-hidden ${hasContent ? 'cursor-pointer' : 'cursor-default'} ${open ? 'ring-2 ring-emerald-500/20 border-emerald-500/20' : ''}`}
            >
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${warn ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'}`} />
                <div className="flex items-start justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${warn ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                        <Icon className={`w-4 h-4 ${warn ? 'text-amber-400' : 'text-emerald-400'}`} />
                    </div>
                    {hasContent && (
                        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
                    )}
                </div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
                {subtext && <div className="text-[10px] text-[var(--text-muted)] mt-0.5 opacity-70">{subtext}</div>}
            </button>
            <AnimatePresence>
                {open && expandedContent && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-3">{expandedContent}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// ─── CHAR COUNT BADGE ───
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// ─── ISSUE ROW (professional, with inline detail expansion) ───
// ════════════════════════════════════════════════════════════════

function IssueRow({ issue, auditUrl, report, index, isEven }: { issue: AuditIssue; auditUrl?: string; report: AuditReport; index: number; isEven?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const sev = severityConfig[issue.severity];
    const SevIcon = sev.icon;
    const canExpand = !!(issue.description || issue.recommendation);

    // Determine if this issue has detail data we can show
    const detailType = getDetailTypeForIssue(issue);

    return (
        <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            className={`group ${index > 0 ? 'border-t border-[var(--card-border)]/50' : ''}`}
        >
            <div
                onClick={() => canExpand && setExpanded(!expanded)}
                role={canExpand ? 'button' : undefined}
                tabIndex={canExpand ? 0 : undefined}
                onKeyDown={canExpand ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } } : undefined}
                className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 py-3 sm:px-5 sm:py-4 rounded-xl border-l-2 ${sev.borderLeft} border border-[var(--card-border)] transition-all duration-150 ${canExpand ? 'cursor-pointer' : ''} ${expanded ? 'bg-white/[0.02] border-[var(--card-border-hover,rgba(255,255,255,0.15))]' : `${isEven ? 'bg-white/[0.01]' : sev.glowBg}`} ${canExpand ? 'hover:bg-white/[0.03] hover:border-l-emerald-500 active:bg-white/[0.05]' : ''}`}
            >
                {/* Severity icon */}
                <div className={`w-7 h-7 rounded-lg ${sev.bg} flex items-center justify-center flex-shrink-0 transition-shadow duration-150 group-hover:shadow-[0_0_8px_rgba(16,185,129,0.15)]`}>
                    <SevIcon className={`w-3.5 h-3.5 ${sev.color}`} />
                </div>

                {/* Title + description */}
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{issue.title}</span>
                    {issue.description && !expanded && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{issue.description}</p>
                    )}
                </div>

                {/* Value badge */}
                {issue.value && (
                    <span className="text-xs text-[var(--text-muted)] font-mono px-2.5 py-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg flex-shrink-0">
                        {issue.value}
                    </span>
                )}

                {/* Severity pill */}
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${sev.bg} ${sev.color} flex-shrink-0`}>
                    {sev.label}
                </span>

                {/* Fix button */}
                {issue.severity !== 'passed' && (
                    <span onClick={(e) => e.stopPropagation()} className="flex-shrink-0 transition-transform duration-150 group-hover:scale-105">
                        <FixWithBotButton
                            label="Fix"
                            context={`Fix this SEO issue on ${auditUrl || 'the audited page'}: ${issue.title} - ${issue.description || ''}`}
                            size="sm"
                            variant={issue.severity === 'critical' ? 'solid' : 'ghost'}
                        />
                    </span>
                )}

                {/* Expand indicator */}
                {canExpand && (
                    <div className="p-1 rounded-lg flex-shrink-0">
                        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                        </motion.div>
                    </div>
                )}
            </div>

            {/* Expanded recommendation + detail drilldown */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="ml-6 pl-6 border-l border-[var(--card-border)] py-3 space-y-3">
                            {issue.description && (
                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{issue.description}</p>
                            )}
                            {issue.recommendation && (
                                <div className="glass-card rounded-xl p-4 space-y-3">
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Recommendation</p>
                                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{issue.recommendation}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pl-8">
                                        <FixWithBotButton label="Fix with AI" context={`Fix this SEO issue on ${auditUrl || 'the audited page'}: ${issue.title} - ${issue.description}`} size="sm" variant="solid" />
                                        <FixWithBotButton label="Analyze" size="sm" variant="ghost" context={`Get detailed analysis: ${issue.title}`} />
                                        {auditUrl && (
                                            <a href={auditUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors">
                                                <ExternalLink className="w-3 h-3" /> View Page
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Detail drilldown button */}
                            {detailType && (
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-emerald-400 bg-emerald-500/[0.06] border border-emerald-500/15 rounded-lg hover:bg-emerald-500/[0.12] transition-colors"
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    {showDetails ? 'Hide' : 'View'} {getDetailLabel(detailType, report)}
                                </button>
                            )}
                            {showDetails && detailType && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                    {renderDetailForType(detailType, report)}
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ════════════════════════════════════════════════════════════════
// ─── DETAIL TYPE HELPERS ───
// ════════════════════════════════════════════════════════════════

type DetailType = 'links' | 'images' | 'headings' | 'scripts' | 'stylesheets' | 'structuredData';

function getDetailTypeForIssue(issue: AuditIssue): DetailType | null {
    const cat = issue.category.toLowerCase();
    const title = issue.title.toLowerCase();
    if (cat === 'links' || title.includes('link')) return 'links';
    if (cat === 'images' || title.includes('image') || title.includes('alt')) return 'images';
    if (cat === 'headings' || title.includes('heading') || title.includes('h1') || title.includes('h2')) return 'headings';
    if (title.includes('script')) return 'scripts';
    if (title.includes('stylesheet') || title.includes('css')) return 'stylesheets';
    if (title.includes('structured data') || title.includes('schema')) return 'structuredData';
    return null;
}

function getDetailLabel(type: DetailType, report: AuditReport): string {
    const d = report.details;
    switch (type) {
        case 'links': return `all ${d.links.length} links`;
        case 'images': return `all ${d.images.length} images`;
        case 'headings': return `all ${d.headings.length} headings`;
        case 'scripts': return `all ${d.scripts.length} scripts`;
        case 'stylesheets': return `all ${d.stylesheets.length} stylesheets`;
        case 'structuredData': return `all ${d.structuredData.length} items`;
    }
}

function renderDetailForType(type: DetailType, report: AuditReport): React.ReactNode {
    const d = report.details;
    switch (type) {
        case 'links':
            return (
                <DetailTable
                    data={d.links}
                    columns={[
                        { key: 'url', label: 'URL', render: r => <span className="font-mono text-[11px] break-all max-w-[300px] block">{r.url}</span>, sortValue: r => r.url },
                        { key: 'text', label: 'Anchor Text', render: r => <span className="truncate block max-w-[200px]">{r.text || <span className="italic opacity-50">empty</span>}</span>, sortValue: r => r.text },
                        { key: 'type', label: 'Type', render: r => <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${r.type === 'internal' ? 'text-cyan-400 bg-cyan-500/10' : 'text-purple-400 bg-purple-500/10'}`}>{r.type}</span>, sortValue: r => r.type, width: '100px' },
                        { key: 'nofollow', label: 'Nofollow', render: r => r.nofollow ? <span className="text-amber-400">Yes</span> : <span className="text-[var(--text-muted)]">No</span>, sortValue: r => r.nofollow, width: '80px' },
                    ]}
                />
            );
        case 'images':
            return (
                <DetailTable
                    data={d.images}
                    columns={[
                        { key: 'src', label: 'Source', render: r => (
                            <div className="flex items-center gap-2">
                                {r.src && <img src={r.src} alt="" className="w-8 h-8 rounded object-cover bg-white/5 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                                <span className="font-mono text-[11px] break-all max-w-[250px] block">{r.src}</span>
                            </div>
                        ), sortValue: r => r.src },
                        { key: 'alt', label: 'Alt Text', render: r => r.alt ? <span className="truncate block max-w-[200px]">{r.alt}</span> : <span className="text-red-400 italic">Missing</span>, sortValue: r => r.alt },
                        { key: 'hasAlt', label: 'Has Alt', render: r => r.hasAlt ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />, sortValue: r => r.hasAlt, width: '70px' },
                        { key: 'lazy', label: 'Lazy', render: r => r.lazy ? <span className="text-emerald-400">Yes</span> : <span className="text-[var(--text-muted)]">No</span>, sortValue: r => r.lazy, width: '60px' },
                    ]}
                />
            );
        case 'headings':
            return (
                <DetailTable
                    data={d.headings}
                    columns={[
                        { key: 'level', label: 'Level', render: r => <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.level === 1 ? 'text-emerald-400 bg-emerald-500/10' : r.level === 2 ? 'text-cyan-400 bg-cyan-500/10' : 'text-blue-400 bg-blue-500/10'}`}>H{r.level}</span>, sortValue: r => r.level, width: '70px' },
                        { key: 'text', label: 'Text', render: r => <span style={{ paddingLeft: `${(r.level - 1) * 16}px` }} className="block">{r.text || <span className="italic opacity-50">empty</span>}</span>, sortValue: r => r.text },
                    ]}
                />
            );
        case 'scripts':
            return (
                <DetailTable
                    data={d.scripts}
                    columns={[
                        { key: 'src', label: 'Script URL', render: r => <span className="font-mono text-[11px] break-all">{r.src || <span className="italic opacity-50">inline script</span>}</span>, sortValue: r => r.src },
                    ]}
                />
            );
        case 'stylesheets':
            return (
                <DetailTable
                    data={d.stylesheets}
                    columns={[
                        { key: 'href', label: 'Stylesheet URL', render: r => <span className="font-mono text-[11px] break-all">{r.href}</span>, sortValue: r => r.href },
                    ]}
                />
            );
        case 'structuredData':
            return (
                <DetailTable
                    data={d.structuredData}
                    columns={[
                        { key: 'type', label: 'Type', render: r => <span className="font-semibold text-cyan-400">{r.type}</span>, sortValue: r => r.type, width: '150px' },
                        { key: 'data', label: 'Data', render: r => <pre className="text-[10px] font-mono max-w-[400px] truncate opacity-70">{r.data}</pre> },
                    ]}
                />
            );
    }
}

// ════════════════════════════════════════════════════════════════
// ─── CATEGORY GROUP (premium card) ───
// ════════════════════════════════════════════════════════════════

function CategoryGroup({ category, issues, auditUrl, report, index }: { category: string; issues: AuditIssue[]; auditUrl?: string; report: AuditReport; index: number }) {
    const hasProblems = issues.some(i => i.severity !== 'passed');
    const [collapsed, setCollapsed] = useState(!hasProblems);
    const CatIcon = categoryIcons[category] || FileText;
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const passed = issues.filter(i => i.severity === 'passed').length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            className={`premium-card rounded-2xl overflow-hidden transition-all duration-200 ${!collapsed ? 'border-[var(--card-border-hover,rgba(255,255,255,0.15))] ring-1 ring-white/[0.03]' : ''}`}
        >
            {/* Category header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center gap-4 px-4 py-3 sm:px-6 sm:py-5 text-left group cursor-pointer hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
            >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <CatIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{category}</h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {issues.length} check{issues.length !== 1 ? 's' : ''} &middot; {issues.length - passed} issue{issues.length - passed !== 1 ? 's' : ''} &middot; {passed} passed
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {criticals > 0 && (
                        <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {criticals}
                        </span>
                    )}
                    {warnings > 0 && (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {warnings}
                        </span>
                    )}
                    {!hasProblems && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> All passed
                        </span>
                    )}
                </div>
                <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
                    <ChevronDown className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                </motion.div>
            </button>

            {/* Issues list */}
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 sm:px-6 sm:pb-5 space-y-2 border-t border-[var(--card-border)] pt-4">
                            {issues.map((issue, i) => (
                                <IssueRow key={issue.id} issue={issue} auditUrl={auditUrl} report={report} index={i} isEven={i % 2 === 0} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ════════════════════════════════════════════════════════════════
// ─── CSV EXPORT ───
// ════════════════════════════════════════════════════════════════

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
            csvEscape(i.description || ''), csvEscape(i.value || ''), csvEscape(i.recommendation || '')
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

// ════════════════════════════════════════════════════════════════
// ─── MAIN PAGE COMPONENT ───
// ════════════════════════════════════════════════════════════════

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
    const demoAuditTriggeredRef = useRef(false);
    const { isDemoWorkspace, demoDomainLabel } = useRegistration();

    // ─── Share report ───
    const shareReport = useCallback(() => {
        if (!report) return;
        const shareData = { url: report.url, score: report.score, summary: report.summary, date: new Date().toISOString() };
        const encoded = btoa(JSON.stringify(shareData));
        const shareUrl = `${window.location.origin}/dashboard/audit?report=${encoded}`;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [report]);

    // ─── Auto-fill URL from query params ───
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

    // ─── User sites for quick audit ───
    const { hasGoogleConnection } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const { properties } = usePropertyList(hasGoogleConnection);
    const [selectedProp, setSelectedProp] = useState('');
    useEffect(() => {
        if (properties.length > 0 && !selectedProp) setSelectedProp(properties[0].property);
    }, [properties, selectedProp]);
    const { data: analyticsData } = useAnalyticsData('all', selectedProp || undefined, hasGoogleConnection && (isDemoWorkspace || !!selectedProp), '30d', isDemoWorkspace);
    const userPages: string[] = (analyticsData?.pages || []).slice(0, 8).map((p: any) => p.page);
    const userSiteUrl = isDemoWorkspace
        ? DEMO_SITE_URL
        : sites.length > 0 ? sites[0].siteUrl.replace('sc-domain:', 'https://') : '';

    // ─── Run audit ───
    const runAudit = useCallback(async (overrideUrl?: string) => {
        const auditTarget = (overrideUrl ?? url).trim();
        if (!auditTarget) return;
        setLoading(true);
        setError('');
        setReport(null);
        try {
            const res = await fetch(`/api/audit${isDemoWorkspace ? '?demo=1' : ''}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: auditTarget }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Audit failed');
            setReport(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isDemoWorkspace, url]);

    const handleRunAudit = useCallback(() => {
        void runAudit();
    }, [runAudit]);

    useEffect(() => {
        if (!isDemoWorkspace || demoAuditTriggeredRef.current || loading || report) return;
        demoAuditTriggeredRef.current = true;
        setUrl(DEMO_SITE_URL);
        void runAudit(DEMO_SITE_URL);
    }, [isDemoWorkspace, loading, report, runAudit]);

    // ─── Group & sort issues ───
    const { groupedIssues, sortedCategories } = useMemo(() => {
        const grouped: Record<string, AuditIssue[]> = {};
        if (report) {
            const filtered = filter === 'all' ? report.issues : report.issues.filter(i => i.severity === filter);
            for (const issue of filtered) {
                if (!grouped[issue.category]) grouped[issue.category] = [];
                grouped[issue.category].push(issue);
            }
        }
        const sorted = Object.keys(grouped).sort((a, b) => {
            const aCrit = grouped[a].filter(i => i.severity === 'critical').length;
            const bCrit = grouped[b].filter(i => i.severity === 'critical').length;
            if (aCrit !== bCrit) return bCrit - aCrit;
            const aWarn = grouped[a].filter(i => i.severity === 'warning').length;
            const bWarn = grouped[b].filter(i => i.severity === 'warning').length;
            return bWarn - aWarn;
        });
        return { groupedIssues: grouped, sortedCategories: sorted };
    }, [report, filter]);

    return (
        <div className="space-y-6">
            {/* ════════════════════════════════════════ */}
            {/* ─── HERO HEADER ─── */}
            {/* ════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <h2 className="text-2xl md:text-3xl font-bold gradient-text mb-1">Site Audit</h2>
                <p className="text-sm text-[var(--text-muted)] max-w-xl">
                    Analyze any page for 50+ SEO and technical issues. Get actionable recommendations powered by AI.
                </p>
            </motion.div>

            {isDemoWorkspace ? (
                <DemoModeBanner
                    description="You’re viewing demo data because this account does not have any Google Analytics or Search Console properties yet."
                    secondaryDescription={`TrafficClaw is using ${demoDomainLabel} as a safe demo workspace until you connect your own Google data.`}
                />
            ) : null}

            {/* ════════════════════════════════════════ */}
            {/* ─── URL INPUT ─── */}
            {/* ════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }} className="glass-card rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !loading && void runAudit()}
                            placeholder="Enter URL to audit (e.g. example.com)"
                            aria-label="URL to audit"
                            className="w-full pl-12 pr-4 py-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>
                    <button
                        data-audit-btn
                        onClick={handleRunAudit}
                        disabled={loading || !url.trim()}
                        className="px-6 py-3 min-h-[44px] bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:hover:from-emerald-500 disabled:hover:to-cyan-500 text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 w-full sm:w-auto"
                    >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Auditing...</> : <><Search className="w-4 h-4" /> Run Audit</>}
                    </button>
                </div>
            </motion.div>

            {/* ════════════════════════════════════════ */}
            {/* ─── QUICK AUDIT: USER'S OWN PAGES ─── */}
            {/* ════════════════════════════════════════ */}
            {userSiteUrl && userPages.length > 0 && !report && !loading && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }} className="premium-card rounded-2xl p-4 sm:p-6">
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
                                    onClick={() => setUrl(fullUrl)}
                                    onDoubleClick={() => { setUrl(fullUrl); setTimeout(() => { document.querySelector<HTMLButtonElement>('[data-audit-btn]')?.click(); }, 50); }}
                                    className="premium-card rounded-xl px-4 py-3 text-left hover:border-emerald-500/20 transition-all group"
                                >
                                    <div className="text-xs text-[var(--text-secondary)] group-hover:text-emerald-400 truncate font-medium transition-colors">{page}</div>
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
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-3 px-5 py-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400 font-medium">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Loading skeleton ─── */}
            {loading && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="shimmer-loading rounded-2xl h-56" />
                        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="shimmer-loading rounded-xl h-28" />)}
                        </div>
                    </div>
                    <div className="shimmer-loading rounded-xl h-14" />
                    {[1, 2, 3].map(i => <div key={i} className="shimmer-loading rounded-2xl h-28" />)}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* ─── AUDIT REPORT ─── */}
            {/* ════════════════════════════════════════ */}
            {report && !loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="space-y-6">
                    {/* Timestamp */}
                    <div className="flex justify-end text-[10px] text-[var(--text-muted)]">
                        Audited {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {/* ─── SCORE + SEVERITY SUMMARY ─── */}
                    <div className="premium-card rounded-2xl p-4 sm:p-6 lg:p-8">
                        <div className="flex flex-col lg:flex-row items-center gap-8">
                            <div className="flex flex-col items-center">
                                <ScoreRing score={report.score} />
                                <a href={report.url} target="_blank" rel="noopener noreferrer" className="mt-3 text-xs text-[var(--text-muted)] hover:text-emerald-400 transition-colors flex items-center gap-1 truncate max-w-[220px]">
                                    {new URL(report.url).hostname}
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                            </div>
                            <div className="flex-1 w-full space-y-5">
                                <div>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">SEO Health Score: {report.score}/100</h3>
                                    <div className="mt-2 w-full h-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ background: `linear-gradient(to right, ${report.score >= 80 ? '#22c55e' : report.score >= 50 ? '#f59e0b' : '#ef4444'}, ${report.score >= 80 ? '#06b6d4' : report.score >= 50 ? '#f59e0b' : '#ef4444'})` }}
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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
                                                <div className={`text-2xl font-bold ${config.color}`}>{report.summary[key]}</div>
                                                <div className="text-xs text-[var(--text-muted)] capitalize">{config.label}</div>
                                            </button>
                                        );
                                    })}
                                    <div className="stat-card-hover rounded-xl p-4 text-left border border-[var(--card-border)] relative overflow-hidden">
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-t-xl" />
                                        <Hash className="w-5 h-5 text-[var(--text-muted)] mb-2" />
                                        <div className="text-2xl font-bold text-[var(--text-primary)]">{report.summary.total}</div>
                                        <div className="text-xs text-[var(--text-muted)]">Total Checks</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── PAGE OVERVIEW (interactive stat cards with detail expansion) ─── */}
                    <div className="premium-card rounded-2xl p-4 sm:p-6">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-5 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            Page Overview
                            <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">Click any card to drill down</span>
                        </h3>

                        {/* Title & Description cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            <div className="glass-card rounded-xl p-3 sm:p-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title Tag</span>
                                    <CharCountBadge count={report.meta.title?.length || 0} min={30} max={60} />
                                </div>
                                <p className="text-sm text-[var(--text-primary)] font-medium leading-relaxed">
                                    {report.meta.title || <span className="text-red-400 italic">Missing title tag</span>}
                                </p>
                            </div>
                            <div className="glass-card rounded-xl p-3 sm:p-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Meta Description</span>
                                    <CharCountBadge count={report.meta.description?.length || 0} min={120} max={160} />
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                                    {report.meta.description || <span className="text-amber-400 italic">Missing meta description</span>}
                                </p>
                            </div>
                        </div>

                        {/* Interactive stat cards grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <OverviewCard
                                icon={Link2}
                                label="Links"
                                value={String(report.meta.links.total)}
                                subtext={`${report.meta.links.internal} int / ${report.meta.links.external} ext`}
                                expandedContent={renderDetailForType('links', report)}
                            />
                            <OverviewCard
                                icon={Image}
                                label="Images"
                                value={String(report.meta.images.total)}
                                subtext={`${report.meta.images.withAlt} with alt / ${report.meta.images.withoutAlt} without`}
                                warn={report.meta.images.withoutAlt > 0}
                                expandedContent={renderDetailForType('images', report)}
                            />
                            <OverviewCard
                                icon={Type}
                                label="Headings"
                                value={String(Object.values(report.meta.headings).reduce((a, b) => a + b, 0))}
                                subtext={`H1:${report.meta.headings.h1} H2:${report.meta.headings.h2} H3:${report.meta.headings.h3}`}
                                warn={report.meta.headings.h1 !== 1}
                                expandedContent={renderDetailForType('headings', report)}
                            />
                            <OverviewCard
                                icon={Clock}
                                label="Response Time"
                                value={`${report.responseTime}ms`}
                                warn={report.responseTime > 2000}
                            />
                            <OverviewCard
                                icon={Code2}
                                label="Scripts"
                                value={String(report.meta.scripts)}
                                warn={report.meta.scripts > 15}
                                expandedContent={renderDetailForType('scripts', report)}
                            />
                            <OverviewCard
                                icon={Target}
                                label="Word Count"
                                value={String(report.meta.wordCount)}
                                subtext={`${Math.round(report.meta.pageSize / 1024)}KB page`}
                                warn={report.meta.wordCount < 300}
                            />
                        </div>
                    </div>

                    {/* ─── ACTION BAR (filters + actions) ─── */}
                    <div className="glass-card rounded-xl px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2 pb-1 sm:pb-0">
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
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-500/20' : 'bg-white/[0.05]'}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                            {(report.summary.critical > 0 || report.summary.warning > 0) && (
                                <FixWithBotButton label="Analyze All Issues" size="md" variant="solid" context="Get deep analysis and fix recommendations from your bot" site={url} />
                            )}
                            <button onClick={() => exportAuditCSV(report)} className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors">
                                <Download className="w-3.5 h-3.5" /> Export CSV
                            </button>
                            <button onClick={shareReport} className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors">
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Share'}
                            </button>
                            <button onClick={handleRunAudit} className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-white/[0.06] transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" /> Re-audit
                            </button>
                        </div>
                    </div>

                    {/* ─── ISSUES BY CATEGORY ─── */}
                    <div className="space-y-4">
                        {sortedCategories.length === 0 && (
                            <div className="premium-card rounded-2xl p-8 text-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                                <p className="text-sm text-[var(--text-secondary)]">No issues found for this filter.</p>
                                <button onClick={() => setFilter('all')} className="text-xs text-emerald-400 hover:underline mt-2">Show all checks</button>
                            </div>
                        )}
                        {sortedCategories.map((cat, i) => (
                            <CategoryGroup key={cat} category={cat} issues={groupedIssues[cat]} auditUrl={url} report={report} index={i} />
                        ))}
                    </div>

                    {/* ─── FOOTER ─── */}
                    <div className="text-center text-[10px] text-[var(--text-muted)] pt-4">
                        Audited at {new Date(report.fetchedAt).toLocaleString()} &middot; HTTP {report.statusCode}
                    </div>

                    {/* ─── QUICK RE-AUDIT ─── */}
                    <div className="section-divider my-6" />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
                        <button onClick={handleRunAudit} className="flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold text-sm rounded-xl hover:opacity-90 transition shadow-lg shadow-emerald-500/20">
                            <RotateCcw className="w-4 h-4" /> Re-Audit This Page
                        </button>
                        <button onClick={() => { setReport(null); setUrl(''); }} className="flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] w-full sm:w-auto bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-secondary)] font-medium text-sm rounded-xl hover:bg-white/[0.08] transition">
                            <Search className="w-4 h-4" /> Audit Another Page
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* ─── EMPTY STATE ─── */}
            {/* ════════════════════════════════════════ */}
            {!report && !loading && !error && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-6 glow-emerald">
                        <ScanSearch className="w-11 h-11 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Enter a URL to Analyze</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-md mb-8">
                        Get a comprehensive SEO audit with actionable recommendations. Checks 50+ technical and on-page SEO factors.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mb-8">
                        {sampleUrls.map(sampleUrl => (
                            <button key={sampleUrl} onClick={() => setUrl(sampleUrl)} className="px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-emerald-400 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full hover:border-emerald-500/20 hover:bg-emerald-500/[0.05] transition-all">
                                {sampleUrl}
                            </button>
                        ))}
                    </div>
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
