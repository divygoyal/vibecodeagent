'use client';

import { useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });
const SparkLine = dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), { ssr: false });
const SparkLineSeries = dynamic(() => import('recharts').then(m => ({ default: m.Line })), { ssr: false });
import ReactMarkdown, { type Components as MarkdownComponents } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    TrendingUp, TrendingDown, Search, MousePointer, Eye, Hash,
    AlertTriangle, CheckCircle2, Lightbulb, FileWarning, Shuffle,
    ArrowUpRight, Zap, Target, BookOpen, ChevronDown, Loader2, Download,
    Bot, PenTool, Link2, Sparkles, Brain, Globe, BarChart3,
    FileText, ScanSearch, FileCheck, XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DemoModeBanner from '@/components/DemoModeBanner';
import { DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { exportSeoData } from '@/lib/exportUtils';
import { useSeoData, useSiteList, useContainerStatus, useOpportunitiesData } from '@/lib/useDashboardData';
import LastUpdated from '@/components/dashboard/LastUpdated';
import { signIn } from 'next-auth/react';
import FixWithBotButton from '@/components/FixWithBotButton';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';
import EmptyState, { ConnectGoogleState } from '@/components/EmptyState';
import { useRegistration } from '../layout';
import KeywordDetailDrawer from '@/components/KeywordDetailDrawer';
import PageDetailDrawer from '@/components/PageDetailDrawer';
import { AnnotationBadge, getAnnotations } from '@/components/AnnotationBadge';
import { IntentBadge } from '@/components/IntentBadge';
import ZombiePageMonitor from '@/components/dashboard/ZombiePageMonitor';
import MobileGapWidget from '@/components/dashboard/MobileGapWidget';
import StrikingDistanceWidget from '@/components/dashboard/StrikingDistanceWidget';
import CtrOptimizationLab from '@/components/dashboard/CtrOptimizationLab';
import SilentDecayMonitor from '@/components/dashboard/SilentDecayMonitor';
import IndexingStatus from '@/components/dashboard/IndexingStatus';
import CannibalizationWidget from '@/components/dashboard/CannibalizationWidget';
import WinnersLosersWidget from '@/components/dashboard/WinnersLosersWidget';
import AeoScoreWidget from '@/components/dashboard/AeoScoreWidget';
import AioSimulator from '@/components/dashboard/AioSimulator';
import AiVisibilityWidget from '@/components/dashboard/AiVisibilityWidget';
import CoreWebVitalsLive from '@/components/dashboard/CoreWebVitalsLive';
import SchemaAuditWidget from '@/components/dashboard/SchemaAuditWidget';

interface SEOKPIs {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    indexedPages: number;
    crawlErrors: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
}

interface Query {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface SEOPage {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    status: string;
}

interface Recommendation {
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    action: string;
    impact: string;
    page: string | null;
}

interface TrendPoint {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface QueryPagePoint {
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface OpportunitiesResponse {
    queries?: Query[];
    comparisonQueries?: Query[];
    queryPages?: QueryPagePoint[];
}

const severityConfig: Record<string, { bg: string; border: string; icon: any; badge: string }> = {
    high: { bg: 'bg-red-500/5', border: 'border-red-500/20', icon: AlertTriangle, badge: 'bg-red-500/10 text-red-400' },
    medium: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', icon: FileWarning, badge: 'bg-amber-500/10 text-amber-400' },
    low: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', icon: Lightbulb, badge: 'bg-blue-500/10 text-blue-400' },
};

const typeIcons: Record<string, any> = {
    content_decay: BookOpen,
    keyword_gap: Target,
    technical: Zap,
    cannibalization: Shuffle,
    opportunity: CheckCircle2,
};

function ChangeIndicator({ value, suffix = '%', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
    const positive = invert ? value <= 0 : value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {value >= 0 ? '+' : ''}{value}{suffix}
        </span>
    );
}

const ICON_BG: Record<string, string> = {
    emerald: 'bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.08)]',
    cyan: 'bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/20 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.08)]',
    violet: 'bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20 text-violet-300 shadow-[0_0_20px_rgba(167,139,250,0.08)]',
    amber: 'bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/20 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.08)]',
    blue: 'bg-gradient-to-br from-blue-500/25 to-blue-500/5 border border-blue-500/20 text-blue-300 shadow-[0_0_20px_rgba(96,165,250,0.08)]',
    red: 'bg-gradient-to-br from-red-500/25 to-red-500/5 border border-red-500/20 text-red-300 shadow-[0_0_20px_rgba(248,113,113,0.08)]',
};

function KpiTile({
    icon: Icon,
    iconColor,
    label,
    value,
    change,
    invertChange = false,
    sparkline,
    sparkKey,
    sparkColor,
}: {
    icon: ComponentType<{ className?: string }>;
    iconColor: keyof typeof ICON_BG;
    label: string;
    value: string | number;
    change?: number;
    invertChange?: boolean;
    sparkline?: TrendPoint[];
    sparkKey?: keyof TrendPoint;
    sparkColor?: string;
}) {
    const sparkData = sparkline && sparkKey ? sparkline.slice(-14) : null;
    const iconClasses = ICON_BG[iconColor] || ICON_BG.emerald;
    return (
        <div className="premium-card p-3 sm:p-5 stat-card-hover">
            <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${iconClasses}`}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                {typeof change === 'number' && <ChangeIndicator value={change} invert={invertChange} />}
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-white">{value}</div>
            <div className="text-[10px] sm:text-xs text-zinc-500 mt-1">{label}</div>
            {sparkData && sparkData.length > 1 && sparkColor && (
                <div className="mt-2 h-7 -mx-1 opacity-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <SparkLine data={sparkData}>
                            <SparkLineSeries
                                type="monotone"
                                dataKey={sparkKey as string}
                                stroke={sparkColor}
                                strokeWidth={1.5}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </SparkLine>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

const blogMarkdownComponents: MarkdownComponents = {
    h1: ({ children }) => <h1 className="text-lg font-bold text-white mt-4 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold text-white mt-4 mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold text-white mt-3 mb-1.5">{children}</h3>,
    p: ({ children }) => <p className="text-xs text-zinc-300 leading-relaxed my-2">{children}</p>,
    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
    em: ({ children }) => <em className="text-zinc-400">{children}</em>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">{children}</a>,
    ul: ({ children }) => <ul className="space-y-1 my-2 list-disc list-inside text-xs text-zinc-300">{children}</ul>,
    ol: ({ children }) => <ol className="space-y-1 my-2 list-decimal list-inside text-xs text-zinc-300">{children}</ol>,
    li: ({ children }) => <li className="text-xs text-zinc-300 leading-relaxed">{children}</li>,
    code: ({ children, className }) => {
        const isBlock = className?.startsWith('language-');
        if (isBlock) {
            return <pre className="my-2 p-3 bg-black/40 border border-white/[0.06] rounded text-[11px] text-emerald-300 font-mono overflow-x-auto">{children}</pre>;
        }
        return <code className="bg-white/[0.04] text-emerald-300 px-1 rounded text-[11px] font-mono">{children}</code>;
    },
    blockquote: ({ children }) => <blockquote className="pl-3 border-l-2 border-emerald-500/30 my-2 text-xs text-zinc-400 italic">{children}</blockquote>,
    hr: () => <hr className="border-white/[0.06] my-3" />,
    table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="w-full text-[11px] border-collapse">{children}</table></div>,
    th: ({ children }) => <th className="px-2 py-1.5 text-left text-[10px] text-zinc-500 font-medium border-b border-white/[0.06]">{children}</th>,
    td: ({ children }) => <td className="px-2 py-1.5 text-zinc-300 border-b border-white/[0.04]">{children}</td>,
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900 border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl">
            <p className="text-xs text-zinc-400 mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
                    {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                </p>
            ))}
        </div>
    );
};

export default function SEOPage() {
    // 0. Check Google connection (SEO plugins run locally, no container needed)
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();

    // 1. Fetch Sites (only when Google connected)
    const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
    const { selectedSite, range, isDemoWorkspace, demoDomainLabel } = useRegistration();
    const [activeTab, setActiveTab] = useState<'queries' | 'pages'>('queries');
    const [activeOppTab, setActiveOppTab] = useState<'striking' | 'ctr' | 'decay'>('striking');
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);
    const [serpPreviewIndex, setSerpPreviewIndex] = useState(0);
    const [activePillar, setActivePillar] = useState<'seo' | 'aeo' | 'geo'>('seo');

    // SEO Tools state
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [toolLoading, setToolLoading] = useState(false);
    const [toolResult, setToolResult] = useState<any>(null);
    // Schema tool
    const [schemaUrl, setSchemaUrl] = useState('');
    const [schemaType, setSchemaType] = useState('Article');
    // Blog tool
    const [blogTopic, setBlogTopic] = useState('');
    const [blogKeywords, setBlogKeywords] = useState('');
    // Keyword tool
    const [kwSiteUrl, setKwSiteUrl] = useState('');
    // Linking tool uses existing pages data

    const router = useRouter();
    const { auditPage, analyzeWithAI, trackKeyword, optimizePage, viewTrend, copyToClipboard, openExternal, generateContent } = useTableActions();

    const runTool = async (tool: string, input: any) => {
        setToolLoading(true);
        setToolResult(null);
        try {
            const res = await fetch('/api/seo-tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, input }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setToolResult(data);
        } catch (err: any) {
            setToolResult({ error: err.message });
        } finally {
            setToolLoading(false);
        }
    };

    // Workspace selection is owned by /dashboard/setup; SEO page just reads it.
    const activeSite = isDemoWorkspace ? DEMO_SITE_URL : selectedSite;

    // 2. Fetch SEO Data (only when Google connected)
    const { data: seoData, isLoading, isError } = useSeoData('all', activeSite, hasGoogleConnection && (isDemoWorkspace || !!activeSite), range, isDemoWorkspace);

    // 3. Fetch Opportunities Data (queries + comparison + queryPages — powers the 3 widgets)
    const { data: oppData, isLoading: oppLoading, error: oppError } = useOpportunitiesData(
        hasGoogleConnection && activeSite ? activeSite : null,
        '28d'
    );
    const oppDataTyped = (oppData as OpportunitiesResponse | undefined) || {};

    // Show connect prompt if Google not connected
    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="Search Console data and keyword rankings" /></div>;
    }

    if ((isLoading || containerLoading) && !seoData) {
        return <div className="min-h-[60vh]"><EmptyState variant="loading" title="Loading SEO Data..." description="Fetching your Search Console data" /></div>;
    }

    if (isError && !seoData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold text-white mb-2">Couldn&apos;t load SEO data</h2>
                    <p className="text-sm text-zinc-400 mb-1">
                        The selected property may not be accessible or doesn&apos;t exist in your Search Console.
                    </p>
                    <p className="text-xs text-zinc-600">
                        Error: {isError?.message || isError?.info?.error || 'Server returned 502 Bad Gateway'}
                    </p>
                </div>

                {/* Switch workspace to pick a different property */}
                <Link
                    href="/dashboard/setup"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#7AD9DA] bg-[#14C4E1]/14 hover:bg-[#14C4E1]/22 border border-[#14C4E1]/22 rounded-xl transition-colors"
                >
                    Switch workspace →
                </Link>

                <button
                    onClick={() => signIn('google')}
                    className="text-xs text-emerald-400 hover:underline"
                >
                    Or re-connect your Google account →
                </button>
            </div>
        );
    }

    // Extract Data
    const kpis: SEOKPIs | null = seoData?.kpis || null;
    const queries: Query[] = Array.isArray(seoData?.queries) ? seoData.queries : [];
    const pages: SEOPage[] = Array.isArray(seoData?.pages) ? seoData.pages : [];
    const recommendations: Recommendation[] = Array.isArray(seoData?.recommendations) ? seoData.recommendations : [];
    const trend: TrendPoint[] = Array.isArray(seoData?.trend) ? seoData.trend : [];

    return (
        <div className="space-y-6 p-4 sm:p-6">
            {isDemoWorkspace ? (
                <DemoModeBanner
                    description="You’re viewing demo data because this account does not have any Google Analytics or Search Console properties yet."
                    secondaryDescription={`TrafficClaw is using ${demoDomainLabel} as a safe demo workspace until you connect your own Google data.`}
                />
            ) : null}

            {/* Missing-source banner — SEO needs a Search Console site. */}
            {!isDemoWorkspace && hasGoogleConnection && !selectedSite && sites.length > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 text-[12.5px] text-amber-100/90 leading-relaxed">
                        <span className="font-semibold text-amber-200">SEO features need a Search Console site.</span>{' '}
                        Pick one to see queries, pages, and rankings.{' '}
                        <Link href="/dashboard/setup" className="underline font-semibold hover:text-amber-50">
                            Pick one now →
                        </Link>
                    </div>
                </div>
            ) : null}

            {/* Header — neutral palette, single subtle cyan accent stripe.
                Replaced the rainbow gradient + glow blobs + hyperbole copy
                ("engineered for the 2026 search landscape") with a clean
                title row. Keeps the live status pill, site selector, and
                export button. */}
            <div className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-5 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                </span>
                                Live · Search Console
                            </span>
                            {seoData && <LastUpdated timestamp={new Date()} />}
                        </div>
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                            SEO Intelligence
                        </h1>
                        <p className="mt-1 max-w-2xl text-[12.5px] text-zinc-500 leading-relaxed">
                            Rankings, AI Overviews, and LLM citations — diagnose what's leaking and where to ship next.
                        </p>
                    </div>

                    <div className="flex items-stretch gap-2 flex-wrap lg:justify-end">
                        <Link
                            href="/dashboard/setup"
                            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#05080b] px-3 py-2 text-[12.5px] font-medium text-zinc-200 hover:border-[#14C4E1]/30 hover:text-white transition w-full sm:w-auto justify-center sm:justify-start"
                            title="Switch workspace"
                        >
                            <span className="text-zinc-500">Workspace:</span>
                            <span className="truncate max-w-[180px]">
                                {selectedSite ? selectedSite.replace('sc-domain:', '') : isDemoWorkspace ? demoDomainLabel : 'Pick one'}
                            </span>
                            <span className="text-[#7AD9DA]">→</span>
                        </Link>
                        <button
                            onClick={() => exportSeoData(seoData)}
                            disabled={!seoData}
                            className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-zinc-200 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] hover:border-white/[0.16] transition disabled:opacity-30"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
                    <KpiTile
                        icon={MousePointer}
                        iconColor="emerald"
                        label="Total Clicks"
                        value={kpis.totalClicks.toLocaleString()}
                        change={kpis.changeClicks}
                        sparkline={trend}
                        sparkKey="clicks"
                        sparkColor="#34d399"
                    />
                    <KpiTile
                        icon={Eye}
                        iconColor="cyan"
                        label="Impressions"
                        value={kpis.totalImpressions.toLocaleString()}
                        change={kpis.changeImpressions}
                        sparkline={trend}
                        sparkKey="impressions"
                        sparkColor="#22d3ee"
                    />
                    <KpiTile
                        icon={Hash}
                        iconColor="violet"
                        label="Avg. CTR"
                        value={`${kpis.avgCTR}%`}
                        change={kpis.changeCTR}
                        sparkline={trend}
                        sparkKey="ctr"
                        sparkColor="#a78bfa"
                    />
                    <KpiTile
                        icon={Search}
                        iconColor="amber"
                        label="Avg. Position"
                        value={kpis.avgPosition}
                        change={kpis.changePosition}
                        invertChange
                        sparkline={trend}
                        sparkKey="position"
                        sparkColor="#fbbf24"
                    />
                    <KpiTile
                        icon={FileCheck}
                        iconColor="blue"
                        label="Indexed Pages"
                        value={(kpis.indexedPages || 0).toLocaleString()}
                    />
                    <KpiTile
                        icon={XCircle}
                        iconColor="red"
                        label="Crawl Errors"
                        value={(kpis.crawlErrors || 0).toLocaleString()}
                    />
                </div>
            )}

            {/* AI Recommendations */}
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_24px_rgba(52,211,153,0.1)]">
                        <Zap className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div className="flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Insights</div>
                        <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">AI Recommendations</h3>
                    </div>
                    <span className="gradient-badge text-[10px] px-2.5 py-1 rounded-full font-semibold">
                        {recommendations.length} items
                    </span>
                </div>
                <div className="space-y-2.5">
                    {recommendations.map(rec => {
                        const config = severityConfig[rec.severity] || severityConfig.low;
                        const TypeIcon = typeIcons[rec.type] || Lightbulb;
                        const severityIconBg: Record<string, string> = {
                            high: 'bg-gradient-to-br from-red-500/25 to-red-500/5 border-red-500/25 text-red-300 shadow-[0_0_20px_rgba(248,113,113,0.1)]',
                            medium: 'bg-gradient-to-br from-amber-500/25 to-amber-500/5 border-amber-500/25 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.1)]',
                            low: 'bg-gradient-to-br from-blue-500/25 to-blue-500/5 border-blue-500/25 text-blue-300 shadow-[0_0_20px_rgba(96,165,250,0.1)]',
                        };
                        const accentLeft: Record<string, string> = {
                            high: 'before:bg-gradient-to-b before:from-red-400 before:to-red-600',
                            medium: 'before:bg-gradient-to-b before:from-amber-400 before:to-amber-600',
                            low: 'before:bg-gradient-to-b before:from-blue-400 before:to-blue-600',
                        };
                        return (
                            <div
                                key={rec.id}
                                className={`group relative overflow-hidden rounded-xl border ${config.border} ${config.bg} p-4 transition-all hover:bg-white/[0.04] hover:border-white/[0.16] hover:shadow-[0_8px_28px_rgba(0,0,0,0.25)] before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full ${accentLeft[rec.severity] || accentLeft.low}`}
                            >
                                <div className="flex items-start gap-3 pl-2">
                                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${severityIconBg[rec.severity] || severityIconBg.low}`}>
                                        <TypeIcon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <h4 className="text-sm font-semibold tracking-tight text-white">{rec.title}</h4>
                                            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${config.badge}`}>
                                                {rec.severity}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-zinc-300 font-medium tabular-nums">
                                                {rec.impact}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400 mb-2.5 leading-relaxed">{rec.description}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-md px-2 py-1 font-medium">
                                                <ArrowUpRight className="w-3 h-3" />
                                                {rec.action}
                                            </div>
                                            <FixWithBotButton label="Analyze" size="sm" variant="ghost" context={`Get deep analysis: ${rec.action}`} site={selectedSite} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Three Pillars: SEO • AEO • GEO ─── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 via-blue-500/20 to-violet-500/20 border border-white/[0.1] flex items-center justify-center shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                            <Sparkles className="w-5 h-5 text-cyan-300" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Coverage</div>
                            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">Three Pillars of Modern Search</h3>
                        </div>
                    </div>
                    <div className="flex bg-[#0a0d12] rounded-xl p-1 border border-white/[0.08] gap-1 flex-wrap">
                        {[
                            { key: 'seo', label: 'Traditional SEO', sub: 'Google rankings', activeClasses: 'bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.18)]', dotColor: 'bg-emerald-400' },
                            { key: 'aeo', label: 'Answer Engine', sub: 'AI Overviews', activeClasses: 'bg-blue-500/[0.08] border border-blue-500/30 text-blue-300 shadow-[0_0_20px_rgba(96,165,250,0.18)]', dotColor: 'bg-blue-400' },
                            { key: 'geo', label: 'Generative Engine', sub: 'LLM citations', activeClasses: 'bg-violet-500/[0.08] border border-violet-500/30 text-violet-300 shadow-[0_0_20px_rgba(167,139,250,0.18)]', dotColor: 'bg-violet-400' },
                        ].map(p => {
                            const isActive = activePillar === p.key;
                            return (
                                <button
                                    key={p.key}
                                    onClick={() => setActivePillar(p.key as 'seo' | 'aeo' | 'geo')}
                                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                                        isActive ? p.activeClasses : 'border border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <span className={`relative flex h-1.5 w-1.5 rounded-full ${isActive ? p.dotColor : 'bg-zinc-600'}`}>
                                        {isActive && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${p.dotColor} opacity-75`} />}
                                    </span>
                                    <span className="flex flex-col items-start">
                                        <span>{p.label}</span>
                                        <span className={`text-[9px] font-normal hidden sm:inline ${isActive ? 'opacity-70' : 'text-zinc-600'}`}>{p.sub}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activePillar === 'seo' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {activeSite && <CannibalizationWidget siteUrl={activeSite} />}
                        {activeSite && <WinnersLosersWidget siteUrl={activeSite} />}
                        <div className="lg:col-span-2">
                            <CoreWebVitalsLive
                                siteUrl={activeSite || ''}
                                suggestedPages={pages.slice(0, 4).map(p => p.page)}
                            />
                        </div>
                    </div>
                )}

                {activePillar === 'aeo' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <AeoScoreWidget
                            siteUrl={activeSite || ''}
                            suggestedPages={pages.slice(0, 4).map(p => p.page)}
                        />
                        <SchemaAuditWidget
                            siteUrl={activeSite || ''}
                            suggestedPages={pages.slice(0, 4).map(p => p.page)}
                        />
                        <div className="lg:col-span-2">
                            <AioSimulator
                                siteUrl={activeSite || ''}
                                suggestedQueries={queries.slice(0, 4).map(q => q.query)}
                            />
                        </div>
                    </div>
                )}

                {activePillar === 'geo' && activeSite && (
                    <AiVisibilityWidget siteUrl={activeSite} />
                )}
                {activePillar === 'geo' && !activeSite && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 text-center text-xs text-zinc-500">
                        Select a site to track AI Visibility.
                    </div>
                )}
            </div>

            {/* ─── SEO Robot / AI SEO Bot ─── */}
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/[0.14] bg-[linear-gradient(135deg,rgba(167,139,250,0.06),rgba(52,211,153,0.04)_60%,transparent_95%)] p-5 sm:p-7">
                <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-violet-500/[0.08] blur-3xl" />
                <div className="relative">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center shadow-[0_8px_32px_rgba(167,139,250,0.3)]">
                            <Bot className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Automation</div>
                            <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">SEO Robot</h3>
                            <p className="text-[11px] text-zinc-500 mt-0.5">AI-powered SEO automation engine</p>
                        </div>
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 font-semibold border border-violet-500/30 tracking-wider">BETA</span>
                    </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        {
                            key: 'blog',
                            icon: PenTool,
                            title: 'AI Blog Writer',
                            desc: 'Generate SEO-optimized blog posts with headings, meta tags, internal links, and schema markup.',
                            activeBorder: 'border-emerald-500/40 bg-emerald-500/[0.06]',
                            inactiveHover: 'hover:border-emerald-500/25 hover:bg-white/[0.04]',
                            iconBg: 'bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/20 group-hover:border-emerald-500/30',
                            iconText: 'text-emerald-300',
                            labelText: 'text-emerald-300',
                            glow: 'rgba(52,211,153,0.18)',
                        },
                        {
                            key: 'keywords',
                            icon: Brain,
                            title: 'Auto Keyword Research',
                            desc: 'AI finds untapped keyword opportunities by analyzing competitors, search trends, and content gaps.',
                            activeBorder: 'border-amber-500/40 bg-amber-500/[0.06]',
                            inactiveHover: 'hover:border-amber-500/25 hover:bg-white/[0.04]',
                            iconBg: 'bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/20 group-hover:border-amber-500/30',
                            iconText: 'text-amber-300',
                            labelText: 'text-amber-300',
                            glow: 'rgba(251,191,36,0.18)',
                        },
                        {
                            key: 'linking',
                            icon: Link2,
                            title: 'AI Smart Linking',
                            desc: 'Discover and suggest internal links between your pages to build topical authority.',
                            activeBorder: 'border-cyan-500/40 bg-cyan-500/[0.06]',
                            inactiveHover: 'hover:border-cyan-500/25 hover:bg-white/[0.04]',
                            iconBg: 'bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/20 group-hover:border-cyan-500/30',
                            iconText: 'text-cyan-300',
                            labelText: 'text-cyan-300',
                            glow: 'rgba(34,211,238,0.18)',
                        },
                        {
                            key: 'schema',
                            icon: FileText,
                            title: 'Schema Generator',
                            desc: 'Auto-generate JSON-LD structured data for FAQ, Article, Product, HowTo pages.',
                            activeBorder: 'border-violet-500/40 bg-violet-500/[0.06]',
                            inactiveHover: 'hover:border-violet-500/25 hover:bg-white/[0.04]',
                            iconBg: 'bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20 group-hover:border-violet-500/30',
                            iconText: 'text-violet-300',
                            labelText: 'text-violet-300',
                            glow: 'rgba(167,139,250,0.18)',
                        },
                    ].map(({ key, icon: ToolIcon, title, desc, activeBorder, inactiveHover, iconBg, iconText, labelText, glow }) => {
                        const isActive = activeTool === key;
                        return (
                            <button
                                key={key}
                                onClick={() => { setActiveTool(isActive ? null : key); setToolResult(null); }}
                                className={`relative overflow-hidden bg-white/[0.02] border rounded-xl p-4 text-left transition-all group cursor-pointer ${
                                    isActive ? activeBorder : `border-white/[0.06] ${inactiveHover}`
                                }`}
                                style={isActive ? { boxShadow: `0 0 32px ${glow}` } : undefined}
                            >
                                {isActive && (
                                    <div
                                        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl"
                                        style={{ background: glow }}
                                    />
                                )}
                                <div className="relative">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition ${iconBg}`}>
                                        <ToolIcon className={`w-5 h-5 ${iconText}`} />
                                    </div>
                                    <h4 className="text-sm font-semibold text-white mb-1 tracking-tight">{title}</h4>
                                    <p className="text-[11px] text-zinc-500 leading-relaxed">{desc}</p>
                                    <div className={`mt-3 flex items-center gap-1.5 text-[10px] font-medium ${labelText}`}>
                                        <Sparkles className="w-3 h-3" /> {isActive ? 'Active' : 'Click to use'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* ─── Active Tool Panel ─── */}
                {activeTool && (
                    <div className="mt-4 bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 sm:p-5">
                        {/* Blog Writer Panel */}
                        {activeTool === 'blog' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><PenTool className="w-4 h-4 text-emerald-400" /> AI Blog Writer</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input value={blogTopic} onChange={e => setBlogTopic(e.target.value)} placeholder="Blog topic (e.g. How to improve Core Web Vitals)" className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30" />
                                    <input value={blogKeywords} onChange={e => setBlogKeywords(e.target.value)} placeholder="Target keywords (comma separated)" className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30" />
                                </div>
                                <button onClick={() => runTool('blog', { topic: blogTopic, keywords: blogKeywords })} disabled={toolLoading || !blogTopic.trim()} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Generate Blog Post
                                </button>
                                {toolResult?.content && (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <FixWithBotButton label="Publish via Bot" size="md" variant="solid" context="Your bot can publish this directly to your CMS" site={selectedSite} />
                                            <button onClick={() => navigator.clipboard.writeText(toolResult.content)} className="px-3 py-1.5 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition">Copy</button>
                                        </div>
                                        <div className="bg-black/30 border border-white/[0.06] rounded-lg p-5 max-h-[480px] overflow-y-auto">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={blogMarkdownComponents}>
                                                {toolResult.content}
                                            </ReactMarkdown>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Keyword Research Panel */}
                        {activeTool === 'keywords' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Brain className="w-4 h-4 text-amber-400" /> Auto Keyword Research</h4>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input value={kwSiteUrl} onChange={e => setKwSiteUrl(e.target.value)} placeholder="Your site URL (e.g. example.com)" className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/30" />
                                    <button onClick={() => runTool('keywords', { siteUrl: kwSiteUrl || activeSite, currentKeywords: queries.slice(0, 5).map((q: any) => q.query).join(', ') })} disabled={toolLoading} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2 whitespace-nowrap">
                                        {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Find Keywords
                                    </button>
                                </div>
                                {toolResult?.keywords?.length > 0 && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-zinc-500 border-b border-white/[0.06]">
                                                    <th className="text-left pb-2 font-medium">Keyword</th>
                                                    <th className="text-right pb-2 font-medium">Volume</th>
                                                    <th className="text-right pb-2 font-medium">Difficulty</th>
                                                    <th className="text-right pb-2 font-medium hidden sm:table-cell">Intent</th>
                                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Content Type</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {toolResult.keywords.map((kw: any, i: number) => (
                                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                                        <td className="py-2 text-zinc-300 font-medium">{kw.keyword}</td>
                                                        <td className="py-2 text-right text-zinc-400">{kw.volume?.toLocaleString()}</td>
                                                        <td className="py-2 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${kw.difficulty === 'Low' ? 'bg-emerald-500/10 text-emerald-400' : kw.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>{kw.difficulty}</span></td>
                                                        <td className="py-2 text-right text-zinc-500 hidden sm:table-cell">{kw.intent}</td>
                                                        <td className="py-2 text-right text-zinc-500 hidden md:table-cell">{kw.contentType}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Smart Linking Panel */}
                        {activeTool === 'linking' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Link2 className="w-4 h-4 text-cyan-400" /> AI Smart Linking</h4>
                                <p className="text-xs text-zinc-500">Analyzes your {pages.length} pages and suggests internal linking opportunities.</p>
                                <button onClick={() => runTool('linking', { pages: pages.map((p: any) => ({ page: p.page, title: p.page })) })} disabled={toolLoading || pages.length === 0} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Analyze Links
                                </button>
                                {toolResult?.links?.length > 0 && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-zinc-500">{toolResult.links.length} link suggestions found</span>
                                            <FixWithBotButton label="Apply via Bot" size="sm" variant="solid" context="Your bot can add these internal links to your site" site={selectedSite} />
                                        </div>
                                        <div className="space-y-2">
                                            {toolResult.links.map((link: any, i: number) => (
                                                <div key={i} className="bg-black/20 border border-white/[0.04] rounded-lg p-3">
                                                    <div className="flex items-center gap-2 text-xs mb-1">
                                                        <span className="text-zinc-400 truncate">{link.source}</span>
                                                        <ArrowUpRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                                        <span className="text-cyan-400 truncate">{link.target}</span>
                                                        <span className="ml-auto flex-shrink-0"><FixWithBotButton label="Details" size="sm" variant="ghost" context={`Get analysis for link: ${link.source} → ${link.target}`} site={selectedSite} /></span>
                                                    </div>
                                                    <div className="text-[11px] text-zinc-500">Anchor: <span className="text-emerald-400 font-medium">&quot;{link.anchor}&quot;</span></div>
                                                    <div className="text-[10px] text-zinc-600 mt-1">{link.reason}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Schema Generator Panel */}
                        {activeTool === 'schema' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-violet-400" /> Schema Markup Generator</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <input value={schemaUrl} onChange={e => setSchemaUrl(e.target.value)} placeholder="Page URL" className="sm:col-span-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/30" />
                                    <select value={schemaType} onChange={e => setSchemaType(e.target.value)} className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
                                        {['Article', 'FAQ', 'Product', 'HowTo', 'WebPage', 'Organization', 'LocalBusiness', 'BreadcrumbList'].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <button onClick={() => runTool('schema', { pageUrl: schemaUrl, pageType: schemaType })} disabled={toolLoading} className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Generate Schema
                                </button>
                                {toolResult?.schema && (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <FixWithBotButton label="Add via Bot" size="sm" variant="solid" context="Your bot can inject this schema markup into your page" site={selectedSite} />
                                            <button onClick={() => navigator.clipboard.writeText(toolResult.schema)} className="px-3 py-1.5 text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition">Copy</button>
                                        </div>
                                        <pre className="bg-black/30 border border-white/[0.06] rounded-lg p-4 max-h-[300px] overflow-y-auto text-xs text-violet-300 font-mono whitespace-pre-wrap">{toolResult.schema}</pre>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Error display */}
                        {toolResult?.error && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg mt-3">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-xs text-red-400">{toolResult.error}</span>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>

            {/* ─── Indexing Status ─── */}
            {kpis && (kpis.indexedPages > 0 || kpis.crawlErrors > 0) && (
                <IndexingStatus
                    indexed={kpis.indexedPages || 0}
                    errors={kpis.crawlErrors || 0}
                    excluded={0}
                />
            )}

            {/* ─── Growth Opportunities (real widgets, tabbed) ─── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-violet-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_24px_rgba(52,211,153,0.1)]">
                            <Target className="w-5 h-5 text-emerald-300" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 flex items-center gap-1.5">
                                <span>Quick Wins</span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-1.5 py-0 text-[9px] font-medium text-emerald-300 normal-case tracking-normal">Live</span>
                            </div>
                            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">Growth Opportunities</h3>
                        </div>
                    </div>
                    <div className="flex bg-[#0a0d12] rounded-xl p-1 border border-white/[0.08] gap-1">
                        {[
                            { key: 'striking', label: 'Striking Distance', icon: Target },
                            { key: 'ctr', label: 'CTR Lab', icon: Zap },
                            { key: 'decay', label: 'Winners & Losers', icon: TrendingUp },
                        ].map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => setActiveOppTab(key as 'striking' | 'ctr' | 'decay')}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                                    activeOppTab === key
                                        ? 'bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.15)]'
                                        : 'border border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                                }`}
                            >
                                <Icon className="w-3 h-3" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {oppLoading && !oppData ? (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                    </div>
                ) : oppError && !oppData ? (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 flex items-center justify-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-zinc-400">Couldn&apos;t load opportunities data. Try refreshing.</span>
                    </div>
                ) : (
                    <>
                        {activeOppTab === 'striking' && (
                            <StrikingDistanceWidget
                                queries={oppDataTyped.queries || queries}
                                siteUrl={activeSite || ''}
                            />
                        )}
                        {activeOppTab === 'ctr' && (
                            <CtrOptimizationLab
                                queryPages={oppDataTyped.queryPages || []}
                                siteUrl={activeSite || ''}
                            />
                        )}
                        {activeOppTab === 'decay' && (
                            <SilentDecayMonitor
                                queries={oppDataTyped.queries || queries}
                                comparisonQueries={oppDataTyped.comparisonQueries || []}
                                siteUrl={activeSite || ''}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Search Trend Chart */}
            <div className="premium-card p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-violet-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.1)]">
                        <BarChart3 className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Trend</div>
                        <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">Search Performance</h3>
                    </div>
                </div>
                <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradImp" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#71717a' }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#34d399" fill="url(#gradClicks)" strokeWidth={2} />
                            <Area yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#a78bfa" fill="url(#gradImp)" strokeWidth={1.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Queries / Pages Tab */}
            <div className="premium-card p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                            <Search className="w-5 h-5 text-cyan-300" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Drill-down</div>
                            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">Top Search Performance</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 bg-[#0a0d12] border border-white/[0.08] rounded-xl p-1 w-fit">
                    <button
                        onClick={() => setActiveTab('queries')}
                        className={`px-4 py-2 min-h-[40px] text-xs font-medium rounded-lg transition-all border ${activeTab === 'queries' ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.15)]' : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'}`}
                    >
                        Top Queries
                    </button>
                    <button
                        onClick={() => setActiveTab('pages')}
                        className={`px-4 py-2 min-h-[40px] text-xs font-medium rounded-lg transition-all border ${activeTab === 'pages' ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.15)]' : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'}`}
                    >
                        Top Pages
                    </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {activeTab === 'queries' && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                    <th className="text-left pb-3 font-medium">Query</th>
                                    <th className="text-right pb-3 font-medium">Clicks</th>
                                    <th className="text-right pb-3 font-medium">Impressions</th>
                                    <th className="text-right pb-3 font-medium hidden sm:table-cell">CTR</th>
                                    <th className="text-right pb-3 font-medium hidden md:table-cell">Position</th>
                                    <th className="text-right pb-3 font-medium w-[60px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queries.map((q, i) => (
                                    <tr key={i} className="table-row-premium border-b border-white/[0.03] relative">
                                        <td className="py-3">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <button onClick={() => setSelectedKeyword(q.query)} className="text-left hover:text-emerald-400 transition-colors cursor-pointer">
                                                    <span className="text-zinc-300 font-medium">{q.query}</span>
                                                </button>
                                                <IntentBadge keyword={q.query} />
                                                {getAnnotations({ position: q.position, ctr: q.ctr, clicks: q.clicks, impressions: q.impressions }).map(type => (
                                                    <AnnotationBadge key={type} type={type} />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="text-right text-emerald-400 font-semibold">{q.clicks.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400">{q.impressions.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400 hidden sm:table-cell">{q.ctr}%</td>
                                        <td className="text-right hidden md:table-cell">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${q.position <= 5 ? 'bg-emerald-400/10 text-emerald-400' : q.position <= 10 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                                {q.position.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <TableActionMenu actions={[
                                                trackKeyword(q.query),
                                                viewTrend(q.query),
                                                generateContent(q.query),
                                                analyzeWithAI(`Deep analysis for keyword "${q.query}": position ${q.position}, CTR ${q.ctr}%, clicks ${q.clicks}, impressions ${q.impressions}. What improvements can be made?`, selectedSite),
                                                copyToClipboard(q.query),
                                            ]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'pages' && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                    <th className="text-left pb-3 font-medium">Page</th>
                                    <th className="text-right pb-3 font-medium">Clicks</th>
                                    <th className="text-right pb-3 font-medium hidden sm:table-cell">CTR</th>
                                    <th className="text-right pb-3 font-medium hidden md:table-cell">Position</th>
                                    <th className="text-right pb-3 font-medium">Status</th>
                                    <th className="text-right pb-3 font-medium w-[60px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pages.map((p, i) => (
                                    <tr key={i} className="table-row-premium border-b border-white/[0.03] relative">
                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSelectedPageUrl(p.page)}
                                                    className="text-left hover:text-emerald-400 transition-colors cursor-pointer truncate max-w-[160px] sm:max-w-[240px]"
                                                >
                                                    <span className="text-zinc-300 font-medium">{p.page}</span>
                                                </button>
                                                {getAnnotations({ clicks: p.clicks, impressions: p.impressions }).map(type => (
                                                    <AnnotationBadge key={type} type={type} />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="text-right text-emerald-400 font-semibold">{p.clicks.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400 hidden sm:table-cell">{p.ctr}%</td>
                                        <td className="text-right hidden md:table-cell">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.position <= 5 ? 'bg-emerald-400/10 text-emerald-400' : p.position <= 10 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                                {p.position.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'healthy' ? 'bg-emerald-400/10 text-emerald-400' :
                                                p.status === 'warning' ? 'bg-amber-400/10 text-amber-400' :
                                                    'bg-red-400/10 text-red-400'
                                                }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <TableActionMenu actions={[
                                                auditPage(p.page),
                                                optimizePage(p.page),
                                                analyzeWithAI(`Analyze SEO performance for page ${p.page}: position ${p.position}, CTR ${p.ctr}%, clicks ${p.clicks}, status: ${p.status}`, selectedSite),
                                                openExternal(p.page),
                                                copyToClipboard(p.page),
                                            ]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Zombie Pages Section */}
            {seoData?.pages && (
                <div className="mt-8">
                    <ZombiePageMonitor data={seoData.pages.map((p: any) => ({
                        page: p.page || '',
                        clicks: p.clicks || 0,
                        impressions: p.impressions || 0,
                        ctr: p.ctr || 0,
                        position: p.position || 0,
                    }))} />
                </div>
            )}

            {/* Mobile Gap Analysis */}
            {activeSite && (
                <div className="mt-8">
                    <MobileGapWidget siteUrl={activeSite} />
                </div>
            )}

            {/* ─── SERP Preview & Quick Actions ─── */}
            {queries.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* SERP Preview */}
                    <div className="premium-card p-5 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/25 to-cyan-500/15 border border-blue-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(96,165,250,0.1)]">
                                <Globe className="w-5 h-5 text-blue-300" />
                            </div>
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Preview</div>
                                <h3 className="text-sm sm:text-base font-semibold tracking-tight text-white">SERP Preview</h3>
                                <p className="text-[11px] text-zinc-500">How your page renders in Google search</p>
                            </div>
                        </div>
                        {pages.length > 0 && (() => {
                            const safeIndex = Math.min(serpPreviewIndex, pages.length - 1);
                            const previewPage = pages[safeIndex];
                            const titleText = previewPage.page.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Page Title';
                            const descText = `This page has ${previewPage.clicks.toLocaleString()} clicks and ${previewPage.impressions?.toLocaleString()} impressions with a CTR of ${previewPage.ctr}% at position ${previewPage.position.toFixed(1)}.`;
                            const titleOver = titleText.length > 60;
                            const descOver = descText.length > 160;
                            return (
                                <>
                                    <div className="relative mb-3">
                                        <select
                                            value={safeIndex}
                                            onChange={(e) => setSerpPreviewIndex(Number(e.target.value))}
                                            className="w-full appearance-none bg-[#0a0d12] border border-white/[0.08] rounded-xl pl-3 pr-9 py-2 text-xs text-zinc-200 hover:border-white/[0.16] focus:outline-none focus:border-blue-500/40 transition"
                                        >
                                            {pages.slice(0, 25).map((p, i) => (
                                                <option key={i} value={i}>{p.page}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                                    </div>
                                    <div className="serp-preview">
                                        <div className="serp-url">{previewPage.page}</div>
                                        <div className="serp-title">{titleText}</div>
                                        <div className="serp-desc">{descText}</div>
                                    </div>
                                    {(titleOver || descOver) && (
                                        <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
                                            {titleOver && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Title is {titleText.length} chars — Google truncates around 60.
                                                </div>
                                            )}
                                            {descOver && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Description is {descText.length} chars — Google truncates around 160.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            onClick={() => router.push(`/dashboard/audit?url=${encodeURIComponent(previewPage.page)}`)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 rounded-lg hover:bg-blue-500/15 hover:border-blue-500/40 transition"
                                        >
                                            <ScanSearch className="w-3 h-3" /> Audit This Page
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Quick Domain Actions */}
                    <div className="premium-card p-5 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-violet-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.1)]">
                                <Zap className="w-5 h-5 text-emerald-300" />
                            </div>
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Shortcuts</div>
                                <h3 className="text-sm sm:text-base font-semibold tracking-tight text-white">Quick Actions</h3>
                                <p className="text-[11px] text-zinc-500">Jump straight into the right tool</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {[
                                {
                                    onClick: () => router.push(`/dashboard/audit?url=${encodeURIComponent(activeSite.replace('sc-domain:', 'https://'))}`),
                                    icon: ScanSearch,
                                    title: 'Full Site Audit',
                                    desc: '50+ SEO & technical checks',
                                    iconBg: 'bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/20',
                                    iconText: 'text-emerald-300',
                                    hoverBorder: 'hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] hover:shadow-[0_0_24px_rgba(52,211,153,0.1)]',
                                    accent: 'group-hover:text-emerald-300',
                                },
                                {
                                    onClick: () => { setActiveTool('blog'); window.scrollTo({ top: 0, behavior: 'smooth' }); },
                                    icon: PenTool,
                                    title: 'AI Content Writer',
                                    desc: 'Generate SEO blog posts',
                                    iconBg: 'bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/20',
                                    iconText: 'text-violet-300',
                                    hoverBorder: 'hover:border-violet-500/30 hover:bg-violet-500/[0.04] hover:shadow-[0_0_24px_rgba(167,139,250,0.1)]',
                                    accent: 'group-hover:text-violet-300',
                                },
                                {
                                    onClick: () => { setActiveTool('keywords'); window.scrollTo({ top: 0, behavior: 'smooth' }); },
                                    icon: Brain,
                                    title: 'Find Keywords',
                                    desc: 'AI keyword research',
                                    iconBg: 'bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/20',
                                    iconText: 'text-amber-300',
                                    hoverBorder: 'hover:border-amber-500/30 hover:bg-amber-500/[0.04] hover:shadow-[0_0_24px_rgba(251,191,36,0.1)]',
                                    accent: 'group-hover:text-amber-300',
                                },
                            ].map((action, i) => {
                                const ActionIcon = action.icon;
                                return (
                                    <button
                                        key={i}
                                        onClick={action.onClick}
                                        className={`w-full flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl transition-all text-left group ${action.hoverBorder}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${action.iconBg}`}>
                                            <ActionIcon className={`w-5 h-5 ${action.iconText}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold tracking-tight text-white">{action.title}</div>
                                            <div className="text-[10px] text-zinc-500">{action.desc}</div>
                                        </div>
                                        <ArrowUpRight className={`w-4 h-4 text-zinc-600 transition ${action.accent}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <KeywordDetailDrawer
                isOpen={!!selectedKeyword}
                onClose={() => setSelectedKeyword(null)}
                keyword={selectedKeyword}
                siteUrl={activeSite || null}
            />
            <PageDetailDrawer
                isOpen={!!selectedPageUrl}
                onClose={() => setSelectedPageUrl(null)}
                pageUrl={selectedPageUrl}
                siteUrl={activeSite || null}
            />
        </div>
    );
}

