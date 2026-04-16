'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  ExternalLink,
  FileDown,
  Radio,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { computeAlerts, computeOpportunities } from '@/lib/alertEngine';
import { getDashboardBriefing } from '@/lib/dashboardBriefing';
import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';
import {
  RedditMentionsPickerRail,
  RedditMentionsProvider,
  RedditMentionsTopPanel,
} from '@/components/dashboard/RedditMentionsWidget';
import {
  XMentionsPickerRail,
  XMentionsProvider,
  XMentionsTopPanel,
} from '@/components/dashboard/XMentionsWidget';

type AnalyticsKpis = {
  totalUsers?: number;
  totalSessions?: number;
  totalPageViews?: number;
  avgBounceRate?: number;
  changeUsers?: number;
  changeSessions?: number;
  changePageViews?: number;
};

type AnalyticsPoint = {
  date?: string;
  activeUsers?: number;
  sessions?: number;
  pageViews?: number;
  bounceRate?: number;
};

type SeoKpis = {
  totalClicks?: number;
  totalImpressions?: number;
  avgCTR?: number | string;
  avgPosition?: number | string;
  indexedPages?: number;
  crawlErrors?: number;
  changeClicks?: number;
  changeImpressions?: number;
  changePosition?: number;
};

type SearchTrendPoint = {
  date?: string;
  clicks?: number;
  impressions?: number;
  position?: number;
  ctr?: number;
};

type SeoQuery = {
  query?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  changeClicks?: number;
  changePosition?: number;
};

type SeoPage = {
  page?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  status?: string;
  changeClicks?: number;
  changePosition?: number;
};

type GoalTrendPoint = {
  date: string;
  value: number;
};

type GoalSummary = {
  id: string | number;
  name: string;
  target: string;
  description?: string;
  conversions: number;
  rate: number;
  change?: number;
  color?: string;
  trend: GoalTrendPoint[];
};

type GoalsResponse = {
  goals?: GoalSummary[];
  totalConversions?: number;
  totalSessions?: number;
};

type DashboardAnalyticsData = {
  traffic?: AnalyticsPoint[];
  pages?: Array<{
    page?: string;
    title?: string;
    views?: number;
    uniqueViews?: number;
    avgTime?: string;
    bounceRate?: number;
  }>;
};

type DashboardSeoData = {
  queries?: SeoQuery[];
  pages?: SeoPage[];
  trend?: SearchTrendPoint[];
};

interface OverviewCommandCenterProps {
  selectedSiteLabel: string;
  range: string;
  activeUsers: number | null;
  isLive: boolean;
  hasData: boolean;
  isLoading: boolean;
  lastUpdated: Date | null;
  analyticsData: DashboardAnalyticsData | undefined;
  seoData: DashboardSeoData | undefined;
  analyticsKPIs: AnalyticsKpis | undefined;
  seoKPIs: SeoKpis | undefined;
  trafficData: AnalyticsPoint[];
  searchTrend: SearchTrendPoint[];
  goalsData?: GoalsResponse;
  onOpenLiveDrawer: () => void;
  onExportReport: () => void;
}

type MetricTone = 'emerald' | 'cyan' | 'amber' | 'red';

type ActionItem = {
  priority: 'Now' | 'Next' | 'Later';
  title: string;
  why: string;
  impact: string;
  href: string;
  cta: string;
  tone: MetricTone;
};

type TimelineItem = {
  key: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: MetricTone;
};

type ChartPoint = {
  date: string;
  label: string;
  sessions: number;
  clicks: number;
  position: number;
  impressions: number;
  ctr: number;
  conversions: number;
  projectedPosition?: number;
};

type ChartAnnotation = {
  date: string;
  label: string;
  tone: 'emerald' | 'cyan' | 'amber' | 'red';
  detail?: string;
  suggestion?: string;
};

type SmartAnnotation = {
  date: string;
  title: string;
  detail: string;
  suggestion: string;
  tone: 'emerald' | 'red' | 'amber' | 'cyan';
};

const RANGE_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  '60d': 'Last 60 days',
  '90d': 'Last 90 days',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  last_year: 'Last year',
  all: 'All time',
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatCompact(value?: number | string) {
  if (value === undefined || value === null) return '0';
  const numeric = toNumber(value);
  if (Math.abs(numeric) >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return Number.isInteger(numeric) ? numeric.toLocaleString() : numeric.toFixed(1);
}

function formatSigned(value?: number, invert = false, unit = '%') {
  if (value === undefined || value === null || Number.isNaN(value)) return `0${unit}`;
  const normalized = invert ? toNumber(value) * -1 : toNumber(value);
  const prefix = normalized > 0 ? '+' : '';
  return `${prefix}${normalized.toFixed(1).replace(/\.0$/, '')}${unit}`;
}

function formatRangeLabel(range: string) {
  return RANGE_LABELS[range] || 'Selected period';
}

function formatShortDate(value?: string) {
  if (!value) return 'No date';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function formatAbsoluteDate(value?: string | Date | null) {
  if (!value) return 'Awaiting sync';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function timeAgo(value?: string | Date | null) {
  if (!value) return 'Awaiting sync';
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (isNaN(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function toneStyles(tone: MetricTone) {
  if (tone === 'red') {
    return {
      accent: 'text-red-300',
      border: 'border-red-500/16',
      glow: 'bg-red-500/10',
      line: '#f87171',
      chip: 'border-red-500/18 bg-red-500/10 text-red-200',
      iconBg: 'border-red-500/16 bg-red-500/10',
      barGradient: 'linear-gradient(180deg,#fda4af 0%,#f87171 42%,#7f1d1d 100%)',
      barShadow: '0 0 18px rgba(248,113,113,0.18)',
    };
  }
  if (tone === 'amber') {
    return {
      accent: 'text-amber-300',
      border: 'border-amber-500/16',
      glow: 'bg-amber-500/10',
      line: '#fbbf24',
      chip: 'border-amber-500/18 bg-amber-500/10 text-amber-200',
      iconBg: 'border-amber-500/16 bg-amber-500/10',
      barGradient: 'linear-gradient(180deg,#fde68a 0%,#fbbf24 42%,#854d0e 100%)',
      barShadow: '0 0 18px rgba(251,191,36,0.18)',
    };
  }
  if (tone === 'cyan') {
    return {
      accent: 'text-cyan-300',
      border: 'border-cyan-500/16',
      glow: 'bg-cyan-500/10',
      line: '#22d3ee',
      chip: 'border-cyan-500/18 bg-cyan-500/10 text-cyan-200',
      iconBg: 'border-cyan-500/16 bg-cyan-500/10',
      barGradient: 'linear-gradient(180deg,#67e8f9 0%,#22d3ee 42%,#155e75 100%)',
      barShadow: '0 0 18px rgba(34,211,238,0.18)',
    };
  }
  return {
    accent: 'text-emerald-300',
    border: 'border-emerald-500/16',
    glow: 'bg-emerald-500/10',
    line: '#34d399',
    chip: 'border-emerald-500/18 bg-emerald-500/10 text-emerald-200',
    iconBg: 'border-emerald-500/16 bg-emerald-500/10',
    barGradient: 'linear-gradient(180deg,#86efac 0%,#34d399 42%,#065f46 100%)',
    barShadow: '0 0 18px rgba(52,211,153,0.18)',
  };
}

function buildMetricBars(values: number[]) {
  const fallback = [24, 18, 30, 28, 36, 32, 44, 40, 52, 48, 58, 62];
  const source = values.length > 1 ? values : fallback;
  const min = Math.min(...source);
  const max = Math.max(...source);
  const range = max - min || 1;

  return source.map((value, index) => {
    const normalized = 22 + ((value - min) / range) * 54;
    return {
      height: `${Math.round(normalized)}%`,
      opacity: index < Math.max(source.length - 4, 1) ? 0.58 : 1,
    };
  });
}

function renderMetricCardIcon(label: string, className: string) {
  if (label === 'Users') return <Users className={className} />;
  if (label === 'Page Views') return <Eye className={className} />;
  if (label === 'Search Clicks') return <Search className={className} />;
  if (label === 'Avg Position') return <BarChart3 className={className} />;
  return <Activity className={className} />;
}

/** Boost tips shown on MetricCard hover tooltip */
const METRIC_BOOST_TIPS: Record<string, string> = {
  Users: 'Boost organic traffic through striking-distance keywords.',
  'Page Views': 'Improve engagement by optimizing top landing pages.',
  'Search Clicks': 'Title tag optimization can lift CTR by 20-35%.',
  'Avg Position': 'Target page-2 keywords for fastest ranking gains.',
};

function Sparkline({ values, tone }: { values: number[]; tone: MetricTone }) {
  const style = toneStyles(tone);
  const bars = buildMetricBars(values);

  return (
    <div className="flex h-14 items-end gap-1.5">
      {bars.map((bar, index) => (
        <span
          key={`${tone}-${index}`}
          className="block h-full flex-1 rounded-[5px]"
          style={{
            height: bar.height,
            opacity: bar.opacity,
            background: style.barGradient,
            boxShadow: style.barShadow,
          }}
        />
      ))}
    </div>
  );
}

function SectionHeader({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      <p className="mt-2 hidden max-w-xl text-sm leading-6 text-zinc-400 sm:block">{detail}</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="h-[320px] animate-pulse border border-white/[0.08] bg-[#020508]" />
        <div className="h-[320px] animate-pulse border border-white/[0.08] bg-[#020508]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[180px] animate-pulse border border-white/[0.08] bg-[#020508]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="h-[360px] animate-pulse border border-white/[0.08] bg-[#020508]" />
        <div className="h-[360px] animate-pulse border border-white/[0.08] bg-[#020508]" />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  explanation,
  values,
  tone,
  invert = false,
}: {
  label: string;
  value: string;
  delta: number | undefined;
  explanation: string;
  values: number[];
  tone: MetricTone;
  invert?: boolean;
}) {
  const style = toneStyles(tone);
  const positive = invert ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0;
  const [flipped, setFlipped] = useState(false);

  // Compute derived detail data for hover back-face
  const valuesMin = values.length > 0 ? Math.min(...values) : 0;
  const valuesMax = values.length > 0 ? Math.max(...values) : 0;
  const prevPeriod = values.length >= 2
    ? Math.round(values.slice(0, Math.floor(values.length / 2)).reduce((s, v) => s + v, 0) / Math.floor(values.length / 2))
    : null;
  const boostTip = METRIC_BOOST_TIPS[label];

  return (
    <div
      className="dashboard-hover-item group relative h-full cursor-pointer overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(9,14,20,0.98),rgba(4,8,12,0.98))] shadow-[0_22px_54px_rgba(0,0,0,0.38)]"
      onClick={() => setFlipped((f) => !f)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.06),transparent_30%)]" />

      {/* ─── Static header: always visible ─── */}
      <div className="relative z-10 flex items-start justify-between gap-4 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${style.iconBg}`}>
            {renderMetricCardIcon(label, `h-4 w-4 ${style.accent}`)}
          </div>
          <span className="truncate">{label}</span>
        </div>
        <div className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${delta !== undefined ? style.chip : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>
          {delta !== undefined ? (
            <>
              {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span>{formatSigned(delta, invert)}</span>
            </>
          ) : (
            <span>No comparison</span>
          )}
        </div>
      </div>

      {/* ─── Front face: normal card content (fades out on hover/tap) ─── */}
      <div className={`relative z-10 px-5 pb-5 pt-3 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-0 ${flipped ? 'opacity-0' : 'opacity-100'}`}>
        <div className="font-mono text-[32px] font-semibold leading-none tracking-tight text-white">{value}</div>
        <div className="mt-4">
          <Sparkline values={values} tone={tone} />
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{explanation}</p>
      </div>

      {/* ─── Back face: detail stats (crossfades in on hover/tap) ─── */}
      <div className={`absolute inset-x-0 bottom-0 top-[60px] z-10 flex flex-col justify-between px-5 pb-5 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100 ${flipped ? 'opacity-100' : 'opacity-0'}`}>
        <div>
          <div className="flex items-end gap-3">
            <div className="font-mono text-[26px] font-semibold tracking-tight text-white">{value}</div>
            {delta !== undefined && (
              <div className={`mb-1 flex items-center gap-1 text-[12px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {formatSigned(delta, invert)}
              </div>
            )}
          </div>

          {/* Detail stats */}
          <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
            {prevPeriod !== null && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Prev. period avg</span>
                <span className="font-mono text-[11px] font-medium text-zinc-300">{prevPeriod.toLocaleString()}</span>
              </div>
            )}
            {values.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Range</span>
                <span className="font-mono text-[11px] font-medium text-zinc-300">{formatCompact(valuesMin)} – {formatCompact(valuesMax)}</span>
              </div>
            )}
            {delta !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Trend</span>
                <span className={`flex items-center gap-1 text-[11px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {positive ? '+' : ''}{delta}%
                </span>
              </div>
            )}
          </div>

          {/* AI Boost Tip */}
          {boostTip && (
            <div className="mt-3 border border-emerald-500/[0.1] bg-gradient-to-r from-emerald-500/[0.06] to-cyan-500/[0.04] px-3 py-2">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                <span className="text-[11px] leading-relaxed text-emerald-300/90">{boostTip}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 pt-2">
          <ArrowRight className="h-3 w-3 text-zinc-500" />
          <span className="text-[10px] font-medium text-zinc-500">View details</span>
        </div>
      </div>
    </div>
  );
}

export default function OverviewCommandCenter({
  selectedSiteLabel,
  range,
  activeUsers,
  isLive,
  hasData,
  isLoading,
  lastUpdated,
  analyticsData,
  seoData,
  analyticsKPIs,
  seoKPIs,
  trafficData,
  searchTrend,
  goalsData,
  onOpenLiveDrawer,
  onExportReport,
}: OverviewCommandCenterProps) {
  const [chartMode, setChartMode] = useState<'traffic' | 'seo' | 'conversions'>('seo');

  // Responsive breakpoint — true on screens < 640px (mobile)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 639px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const model = useMemo(() => {
    const alerts = hasData ? computeAlerts(seoData, analyticsData) : [];
    const opportunities = computeOpportunities(seoData);
    const queries = Array.isArray(seoData?.queries) ? seoData.queries : [];
    const pages = Array.isArray(seoData?.pages) ? seoData.pages : [];
    const goals = Array.isArray(goalsData?.goals) ? goalsData.goals : [];
    const traffic = Array.isArray(trafficData) ? trafficData : [];
    const search = Array.isArray(searchTrend) ? searchTrend : [];

    const riskCount = alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning').length;
    const goalCount = goals.length;
    const goalsOnTrack = goals.filter((goal) => toNumber(goal.change) >= 0).length;
    const topGoal = [...goals].sort((a, b) => b.conversions - a.conversions)[0];
    const topOpp = opportunities[0];
    const topPage = [...pages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0];
    const lastVisibleDate =
      search[search.length - 1]?.date ||
      traffic[traffic.length - 1]?.date ||
      lastUpdated?.toISOString() ||
      null;
    const briefing = getDashboardBriefing({
      hasData,
      selectedSiteLabel,
      range,
      rangeLabel: formatRangeLabel(range),
      lastVisibleDate,
      lastUpdated,
      searchClickChange: seoKPIs?.changeClicks,
      usersChange: analyticsKPIs?.changeUsers,
      pageViewsChange: analyticsKPIs?.changePageViews,
      avgPositionChange: seoKPIs?.changePosition,
      crawlErrors: seoKPIs?.crawlErrors,
      riskCount,
      opportunityCount: opportunities.length,
      goalCount,
      goalsOnTrack,
      topGoalName: topGoal?.name,
      topGoalConversions: topGoal?.conversions,
      topPagePath: topPage?.page,
      topOpportunityQuery: topOpp?.query,
      topOpportunityPosition: topOpp?.position,
      topOpportunityPotentialClicks: topOpp?.potentialClicks,
      activeUsers,
      isLive,
    });

    const metricCards = [
      {
        label: 'Users',
        value: formatCompact(analyticsKPIs?.totalUsers),
        delta: analyticsKPIs?.changeUsers,
        explanation:
          (analyticsKPIs?.changeUsers ?? 0) < 0
            ? 'User demand is trailing the previous comparison window.'
            : 'Audience reach is holding or growing versus the previous window.',
        values: traffic.map((point) => point.activeUsers || point.sessions || 0).slice(-14),
        tone: ((analyticsKPIs?.changeUsers ?? 0) < 0 ? 'amber' : 'emerald') as MetricTone,
      },
      {
        label: 'Page Views',
        value: formatCompact(analyticsKPIs?.totalPageViews),
        delta: analyticsKPIs?.changePageViews,
        explanation:
          (analyticsKPIs?.changePageViews ?? 0) < 0
            ? 'Engagement depth is down, so landing-page quality needs review.'
            : 'Visitors are exploring more pages once they arrive.',
        values: traffic.map((point) => point.pageViews || 0).slice(-14),
        tone: ((analyticsKPIs?.changePageViews ?? 0) < 0 ? 'amber' : 'cyan') as MetricTone,
      },
      {
        label: 'Search Clicks',
        value: formatCompact(seoKPIs?.totalClicks),
        delta: seoKPIs?.changeClicks,
        explanation:
          (seoKPIs?.changeClicks ?? 0) < 0
            ? 'Organic click volume is slipping versus the previous period.'
            : 'Organic search is either stable or gaining momentum.',
        values: search.map((point) => point.clicks || 0).slice(-14),
        tone: ((seoKPIs?.changeClicks ?? 0) < 0 ? 'red' : 'emerald') as MetricTone,
      },
      {
        label: 'Avg Position',
        value: formatCompact(seoKPIs?.avgPosition),
        delta: seoKPIs?.changePosition,
        explanation:
          (seoKPIs?.changePosition ?? 0) > 0
            ? 'Average rankings slipped, especially where impression volume is high.'
            : 'Average rankings are holding or improving.',
        values: search.map((point) => point.position || 0).slice(-14),
        tone: ((seoKPIs?.changePosition ?? 0) > 0 ? 'amber' : 'cyan') as MetricTone,
        invert: true,
      },
    ];

    const actionPool: ActionItem[] = [];
    if ((seoKPIs?.changeClicks ?? 0) <= -10) {
      actionPool.push({
        priority: 'Now',
        title: 'Audit the pages behind the traffic drop',
        why: `Search clicks are down ${Math.abs(seoKPIs?.changeClicks ?? 0)}% versus the comparison window.`,
        impact: 'Protect recent organic demand before losses compound.',
        href: '/dashboard/seo',
        cta: 'Open SEO',
        tone: 'red',
      });
    }
    if (topOpp) {
      const topOppPosition = toNumber(topOpp.position);
      actionPool.push({
        priority: actionPool.length === 0 ? 'Now' : 'Next',
        title: topOpp.type === 'ctr_fix' ? `Rewrite titles for "${topOpp.query}"` : `Push "${topOpp.query}" into stronger positions`,
        why: `This query sits around position ${topOppPosition.toFixed(1)} with ${formatCompact(topOpp.impressions)} impressions.`,
        impact: `Potential +${formatCompact(topOpp.potentialClicks)} clicks if the page captures expected demand.`,
        href: '/dashboard/opportunities',
        cta: 'Review opportunity',
        tone: topOpp.type === 'ctr_fix' ? 'amber' : 'emerald',
      });
    }
    if ((seoKPIs?.crawlErrors ?? 0) > 0) {
      actionPool.push({
        priority: actionPool.length < 2 ? 'Next' : 'Later',
        title: 'Resolve crawl or indexing issues',
        why: `${seoKPIs?.crawlErrors} technical issue${seoKPIs?.crawlErrors === 1 ? '' : 's'} can limit discoverability.`,
        impact: 'Clear blockers so important pages keep getting crawled.',
        href: '/dashboard/seo',
        cta: 'Check technical',
        tone: 'amber',
      });
    } else if (topGoal) {
      actionPool.push({
        priority: actionPool.length < 2 ? 'Next' : 'Later',
        title: `Double down on ${topGoal.name}`,
        why: `${topGoal.conversions} conversions already came through ${topGoal.target}.`,
        impact: 'Scale what is already converting instead of spreading effort thin.',
        href: '/dashboard/analytics/goals',
        cta: 'Open goals',
        tone: 'cyan',
      });
    }
    if (actionPool.length < 3 && topPage?.page) {
      actionPool.push({
        priority: actionPool.length < 2 ? 'Next' : 'Later',
        title: 'Refresh the top-performing landing page',
        why: `${topPage.page} is carrying strong click share and deserves protection.`,
        impact: 'A stronger headline or internal-link pass can compound existing traffic.',
        href: '/dashboard/seo',
        cta: 'Inspect page',
        tone: 'emerald',
      });
    }
    const actions = actionPool.slice(0, 3).map((item, index) => ({
      ...item,
      priority: (['Now', 'Next', 'Later'][index] || 'Later') as ActionItem['priority'],
    }));

    const chartMap = new Map<string, ChartPoint>();
    traffic.forEach((point) => {
      if (!point.date) return;
      chartMap.set(point.date, {
        date: point.date,
        label: formatShortDate(point.date),
        sessions: point.sessions || point.activeUsers || 0,
        clicks: chartMap.get(point.date)?.clicks || 0,
        position: chartMap.get(point.date)?.position || 0,
        impressions: chartMap.get(point.date)?.impressions || 0,
        ctr: chartMap.get(point.date)?.ctr || 0,
        conversions: chartMap.get(point.date)?.conversions || 0,
      });
    });
    search.forEach((point) => {
      if (!point.date) return;
      const existing = chartMap.get(point.date);
      chartMap.set(point.date, {
        date: point.date,
        label: formatShortDate(point.date),
        sessions: existing?.sessions || 0,
        clicks: point.clicks || 0,
        position: point.position || 0,
        impressions: point.impressions || 0,
        ctr: point.ctr || 0,
        conversions: existing?.conversions || 0,
      });
    });

    // Merge goal conversions by date
    const goalConversionsByDate = new Map<string, number>();
    goals.forEach((goal) => {
      const trend = Array.isArray(goal.trend) ? goal.trend : [];
      trend.forEach((point: { date?: string; value?: number }) => {
        if (!point.date) return;
        goalConversionsByDate.set(point.date, (goalConversionsByDate.get(point.date) || 0) + (point.value || 0));
      });
    });
    goalConversionsByDate.forEach((conversions, date) => {
      const existing = chartMap.get(date);
      if (existing) {
        existing.conversions = conversions;
      } else {
        chartMap.set(date, {
          date,
          label: formatShortDate(date),
          sessions: 0,
          clicks: 0,
          position: 0,
          impressions: 0,
          ctr: 0,
          conversions,
        });
      }
    });

    const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Compute projected position using simple linear regression on last 10 position data points
    const positionPoints = chartData.filter((p) => p.position > 0);
    if (positionPoints.length >= 4) {
      const recentN = positionPoints.slice(-10);
      const n = recentN.length;
      const xMean = (n - 1) / 2;
      const yMean = recentN.reduce((s, p) => s + p.position, 0) / n;
      let num = 0;
      let den = 0;
      recentN.forEach((p, i) => {
        num += (i - xMean) * (p.position - yMean);
        den += (i - xMean) * (i - xMean);
      });
      const slope = den !== 0 ? num / den : 0;
      // Apply projected positions to last 30% of chart data
      const projStart = Math.max(0, chartData.length - Math.ceil(chartData.length * 0.3));
      const baseIndex = chartData.length - n;
      chartData.forEach((point, i) => {
        if (i >= projStart && point.position > 0) {
          const relativeIdx = i - baseIndex;
          point.projectedPosition = Math.max(1, yMean + slope * relativeIdx);
        }
      });
    }

    // Compute chart annotations from alerts (top 3 most relevant with dates)
    const chartAnnotations: ChartAnnotation[] = [];
    const chartDateSet = new Set(chartData.map((p) => p.date));
    const annotationAlerts = alerts
      .filter((alert) => alert.timestamp && chartDateSet.has(alert.timestamp.split('T')[0]))
      .sort((a, b) => {
        const sevOrder = { critical: 0, warning: 1, success: 2, info: 3 };
        return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
      })
      .slice(0, 3);
    annotationAlerts.forEach((alert) => {
      const dateKey = alert.timestamp.split('T')[0];
      const toneMap: Record<string, ChartAnnotation['tone']> = {
        critical: 'red',
        warning: 'amber',
        success: 'emerald',
        info: 'cyan',
      };
      chartAnnotations.push({
        date: dateKey,
        label: alert.title.length > 35 ? alert.title.slice(0, 32) + '...' : alert.title,
        tone: toneMap[alert.severity] || 'cyan',
      });
    });

    // If no alert-based annotations, auto-detect notable patterns in sessions AND clicks
    if (chartAnnotations.length === 0 && chartData.length > 2) {
      const annotatedDates = new Set<string>();

      // Helper: find biggest % change in a metric
      const findBiggestChange = (metric: 'sessions' | 'clicks') => {
        let maxChange = 0;
        let maxIdx = -1;
        for (let i = 1; i < chartData.length; i++) {
          const prev = chartData[i - 1][metric];
          const curr = chartData[i][metric];
          if (prev > 0) {
            const pctChange = ((curr - prev) / prev) * 100;
            if (Math.abs(pctChange) > Math.abs(maxChange)) {
              maxChange = pctChange;
              maxIdx = i;
            }
          }
        }
        return { maxChange, maxIdx };
      };

      // Check sessions spike/drop (10% threshold)
      const sess = findBiggestChange('sessions');
      if (sess.maxIdx > 0 && Math.abs(sess.maxChange) > 10 && !annotatedDates.has(chartData[sess.maxIdx].date)) {
        annotatedDates.add(chartData[sess.maxIdx].date);
        chartAnnotations.push({
          date: chartData[sess.maxIdx].date,
          label: sess.maxChange > 0 ? `+${sess.maxChange.toFixed(0)}% session spike` : `${sess.maxChange.toFixed(0)}% session drop`,
          tone: sess.maxChange > 0 ? 'emerald' : 'red',
        });
      }

      // Check clicks spike/drop (10% threshold)
      const clk = findBiggestChange('clicks');
      if (clk.maxIdx > 0 && Math.abs(clk.maxChange) > 10 && !annotatedDates.has(chartData[clk.maxIdx].date)) {
        annotatedDates.add(chartData[clk.maxIdx].date);
        chartAnnotations.push({
          date: chartData[clk.maxIdx].date,
          label: clk.maxChange > 0 ? `+${clk.maxChange.toFixed(0)}% click spike` : `${clk.maxChange.toFixed(0)}% click drop`,
          tone: clk.maxChange > 0 ? 'emerald' : 'red',
        });
      }

      // Peak day: annotate the day with highest sessions or clicks
      if (chartAnnotations.length < 3) {
        let peakVal = 0;
        let peakIdx = -1;
        let peakMetric: 'sessions' | 'clicks' = 'sessions';
        chartData.forEach((p, i) => {
          if (p.sessions > peakVal) { peakVal = p.sessions; peakIdx = i; peakMetric = 'sessions'; }
          if (p.clicks > peakVal) { peakVal = p.clicks; peakIdx = i; peakMetric = 'clicks'; }
        });
        if (peakIdx >= 0 && peakVal > 0 && !annotatedDates.has(chartData[peakIdx].date)) {
          annotatedDates.add(chartData[peakIdx].date);
          chartAnnotations.push({
            date: chartData[peakIdx].date,
            label: `Peak ${peakMetric}: ${peakVal.toLocaleString()}`,
            tone: 'cyan',
          });
        }
      }

      // Trend inflection: find where a 3-day moving direction reverses
      if (chartAnnotations.length < 4 && chartData.length >= 5) {
        const sessionVals = chartData.map((p) => p.sessions);
        for (let i = 3; i < sessionVals.length - 1; i++) {
          const prevTrend = sessionVals[i - 1] - sessionVals[i - 3]; // direction over prior 3 days
          const nextTrend = sessionVals[i + 1] - sessionVals[i - 1]; // direction over next 2 days
          if (prevTrend < 0 && nextTrend > 0 && !annotatedDates.has(chartData[i].date)) {
            annotatedDates.add(chartData[i].date);
            chartAnnotations.push({
              date: chartData[i].date,
              label: 'Recovery inflection',
              tone: 'amber',
            });
            break;
          }
          if (prevTrend > 0 && nextTrend < 0 && !annotatedDates.has(chartData[i].date)) {
            annotatedDates.add(chartData[i].date);
            chartAnnotations.push({
              date: chartData[i].date,
              label: 'Decline inflection',
              tone: 'amber',
            });
            break;
          }
        }
      }
    }

    // Per-tab chart summaries
    const chartSummaries = {
      traffic:
        (analyticsKPIs?.changeUsers ?? 0) < -5
          ? 'Sessions have softened — use this view to spot when user volume shifted.'
          : 'Traffic is holding steady. Look for patterns between sessions and search clicks.',
      seo:
        (seoKPIs?.changeClicks ?? 0) < 0
          ? 'Search demand is softer than the last comparison period. The dual-axis view helps isolate whether positions or CTR drove the change.'
          : 'Clicks and positions are stable. The projected line shows where current momentum leads.',
      conversions:
        goals.length === 0
          ? 'No goals configured yet. Set up conversion tracking to see goal completions over time.'
          : 'Conversions overlaid against sessions — look for correlation between traffic and goal completions.',
    };

    const topPages = [...pages]
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5)
      .map((page) => ({
        page: page.page || '/',
        clicks: page.clicks || 0,
        delta: page.changeClicks || 0,
      }));

    const searchMovers = [...queries]
      .filter((query) => query.query)
      .sort((a, b) => Math.abs(b.changePosition || 0) - Math.abs(a.changePosition || 0))
      .slice(0, 5)
      .map((query) => ({
        query: query.query || '',
        position: query.position || 0,
        delta: query.changePosition || 0,
      }));

    const maxPageClicks = Math.max(...topPages.map((page) => page.clicks), 1);

    const goalCards = goals.slice(0, 3).map((goal) => {
      const series = (Array.isArray(goal.trend) ? goal.trend : []).map((point) => toNumber(point?.value));
      const last = series.length > 0 ? series[series.length - 1] : toNumber(goal.conversions);
      const prev = series.length > 1 ? series[series.length - 2] : last;
      const latestChange = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      return {
        ...goal,
        latestChange,
        width: clamp((toNumber(goal.conversions) / Math.max(toNumber(topGoal?.conversions, 1), 1)) * 100, 8, 100),
      };
    });

    const timeline: TimelineItem[] = [];
    const latestSearch = search.length > 0 ? search[search.length - 1] : undefined;
    const previousSearch = search.length > 1 ? search[search.length - 2] : undefined;
    if (latestSearch?.date && previousSearch) {
      const previousValue = toNumber(previousSearch.clicks);
      const currentValue = toNumber(latestSearch.clicks);
      const delta = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
      timeline.push({
        key: `search-${latestSearch.date}`,
        title: delta < 0 ? `Search clicks fell ${Math.abs(Math.round(delta))}%` : `Search clicks rose ${Math.round(delta)}%`,
        detail: `${formatCompact(currentValue)} clicks recorded on ${formatShortDate(latestSearch.date)}.`,
        timestamp: latestSearch.date,
        tone: delta < -5 ? 'red' : delta > 5 ? 'emerald' : 'cyan',
      });
    }

    const latestTraffic = traffic.length > 0 ? traffic[traffic.length - 1] : undefined;
    const previousTraffic = traffic.length > 1 ? traffic[traffic.length - 2] : undefined;
    if (latestTraffic?.date && previousTraffic) {
      const previousValue = toNumber(previousTraffic.sessions ?? previousTraffic.activeUsers);
      const currentValue = toNumber(latestTraffic.sessions ?? latestTraffic.activeUsers);
      const delta = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
      timeline.push({
        key: `traffic-${latestTraffic.date}`,
        title: delta < 0 ? `Sessions softened ${Math.abs(Math.round(delta))}%` : `Sessions improved ${Math.round(delta)}%`,
        detail: `${formatCompact(currentValue)} sessions landed on ${formatShortDate(latestTraffic.date)}.`,
        timestamp: latestTraffic.date,
        tone: delta < -5 ? 'amber' : delta > 5 ? 'emerald' : 'cyan',
      });
    }

    goalCards.forEach((goal) => {
      const trend = Array.isArray(goal.trend) ? goal.trend : [];
      const latestPoint = trend.length > 0 ? trend[trend.length - 1] : undefined;
      if (!latestPoint?.date) return;
      timeline.push({
        key: `goal-${goal.id}`,
        title: `${goal.name} reported ${formatCompact(latestPoint.value)} conversions`,
        detail: `Current conversion rate is ${toNumber(goal.rate).toFixed(1)}% on ${goal.target}.`,
        timestamp: latestPoint.date,
        tone: goal.latestChange >= 0 ? 'emerald' : 'amber',
      });
    });

    if (activeUsers !== null) {
      timeline.push({
        key: 'live-users',
        title: `${formatCompact(activeUsers)} active users are on site now`,
        detail: isLive ? 'Realtime view is connected and ready to inspect.' : 'Realtime data is available from the current dashboard sync.',
        timestamp: new Date().toISOString(),
        tone: isLive ? 'emerald' : 'cyan',
      });
    }

    if (lastUpdated) {
      timeline.push({
        key: 'sync',
        title: 'Data sync completed',
        detail: `The latest dashboard pull finished ${timeAgo(lastUpdated).toLowerCase()}.`,
        timestamp: lastUpdated.toISOString(),
        tone: 'cyan',
      });
    }

    timeline.sort((a, b) => {
      const ta = new Date(b.timestamp).getTime();
      const tb = new Date(a.timestamp).getTime();
      if (isNaN(ta)) return -1;
      if (isNaN(tb)) return 1;
      return ta - tb;
    });

    return {
      alerts,
      opportunities,
      riskCount,
      goalCount,
      headline: briefing.headline,
      subcopy: briefing.subcopy,
      metricCards,
      actions,
      chartData,
      chartSummaries,
      chartAnnotations,
      topPages,
      maxPageClicks,
      searchMovers,
      goalCards,
      timeline: timeline.slice(0, 5),
    };
  }, [
    activeUsers,
    analyticsData,
    analyticsKPIs,
    goalsData,
    hasData,
    isLive,
    lastUpdated,
    range,
    searchTrend,
    selectedSiteLabel,
    seoData,
    seoKPIs,
    trafficData,
  ]);

  // AI-powered annotations — fetched from Gemini via /api/chart-annotations
  const [aiAnnotations, setAiAnnotations] = useState<SmartAnnotation[]>([]);

  useEffect(() => {
    const cd = model.chartData;
    if (!cd || cd.length < 3) return;

    const firstDate = cd[0].date;
    const lastDate = cd[cd.length - 1].date;
    const cacheKey = `tc-ann-${selectedSiteLabel}-${range}-${firstDate}-${lastDate}`;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      // Check localStorage first
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as SmartAnnotation[];
          if (Array.isArray(parsed) && parsed.length > 0 && !cancelled) {
            setAiAnnotations(parsed);
            return;
          }
        }
      } catch { /* ignore parse errors */ }

      // Fetch from API
      try {
        const payload = cd.map((p) => ({
          date: p.date,
          sessions: p.sessions,
          clicks: p.clicks,
          position: p.position,
          impressions: p.impressions,
        }));

        const res = await fetch('/api/chart-annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: selectedSiteLabel, range, chartData: payload }),
          signal: controller.signal,
        });

        if (res.ok && !cancelled) {
          const data = await res.json();
          const anns: SmartAnnotation[] = Array.isArray(data.annotations) ? data.annotations : [];
          if (anns.length > 0) {
            setAiAnnotations(anns);
            try { localStorage.setItem(cacheKey, JSON.stringify(anns)); } catch { /* quota */ }
          }
        }
      } catch { /* network error or abort — static fallback remains */ }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [model.chartData, selectedSiteLabel, range]);

  // Merge: AI annotations override static when available
  const displayAnnotations: ChartAnnotation[] = useMemo(() => {
    if (aiAnnotations.length > 0) {
      return aiAnnotations.map((a) => ({
        date: a.date,
        label: a.title,
        tone: a.tone,
        detail: a.detail,
        suggestion: a.suggestion,
      }));
    }
    return model.chartAnnotations;
  }, [aiAnnotations, model.chartAnnotations]);

  // Build a lookup map for annotation detail by date (for tooltip)
  const annotationByDate = useMemo(() => {
    const map = new Map<string, ChartAnnotation>();
    displayAnnotations.forEach((a) => map.set(a.date, a));
    return map;
  }, [displayAnnotations]);

  if (isLoading && !hasData) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_360px]">
        <DashboardHoverSurface
          as="section"
          tone="mixed"
          className="group/mc border border-white/[0.08] bg-[#020508] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.35)] sm:p-6 lg:p-7"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.12),transparent_48%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_42%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <div className="dashboard-hover-chip inline-flex items-center border border-white/[0.08] bg-[#070c10] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                Overview
              </div>
              <div className="dashboard-hover-chip inline-flex items-center gap-1.5 border border-white/[0.08] bg-[#070c10] px-3 py-1 text-[11px] text-zinc-400">
                <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
                Synced {timeAgo(lastUpdated).toLowerCase()}
              </div>
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-[2.7rem] sm:leading-[1.05]">
              {model.headline}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-[15px]">
              {model.subcopy}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <div className="dashboard-hover-chip inline-flex items-center gap-2 border border-white/[0.08] bg-[#0a0f14] px-3 py-2 text-[12px] text-zinc-300" data-tone="amber">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                {model.riskCount} active risk{model.riskCount === 1 ? '' : 's'}
              </div>
              <div className="dashboard-hover-chip inline-flex items-center gap-2 border border-white/[0.08] bg-[#0a0f14] px-3 py-2 text-[12px] text-zinc-300" data-tone="emerald">
                <Target className="h-4 w-4 text-emerald-300" />
                {model.opportunities.length} ranked opportunit{model.opportunities.length === 1 ? 'y' : 'ies'}
              </div>
              <div className="dashboard-hover-chip inline-flex items-center gap-2 border border-white/[0.08] bg-[#0a0f14] px-3 py-2 text-[12px] text-zinc-300" data-tone="cyan">
                <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                {model.goalCount} goal{model.goalCount === 1 ? '' : 's'} reporting
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => document.querySelector('[data-panel="priority-queue"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="dashboard-hover-action inline-flex min-h-[44px] items-center gap-2 bg-[linear-gradient(135deg,#34e1a3_0%,#1eb8f6_100%)] px-5 py-3 text-sm font-semibold text-[#041015]"
                data-variant="primary"
              >
                Review top action
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onExportReport}
                className="dashboard-hover-action inline-flex min-h-[44px] items-center gap-2 border border-white/[0.1] bg-[#070c10] px-5 py-3 text-sm font-medium text-zinc-200"
                data-variant="ghost"
              >
                <FileDown className="h-4 w-4" />
                Export report
              </button>
            </div>
          </div>
        </DashboardHoverSurface>

        <DashboardHoverSurface as="section" tone="emerald" className="border border-white/[0.08] bg-[#020508] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Status Watchlist</div>
          <div className="mt-5 space-y-3">
            <Link
              href="/dashboard/seo"
              className="dashboard-hover-item flex min-h-[56px] items-center justify-between border border-white/[0.06] bg-[#060b0f] px-4"
            >
              <div className="flex items-center gap-3">
                <div className="border border-emerald-500/16 bg-emerald-500/10 p-2">
                  <Search className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Search clicks</div>
                  <div className="text-xs text-zinc-500">{formatCompact(seoKPIs?.totalClicks)} total</div>
                </div>
              </div>
              <div className={`text-sm font-medium ${(seoKPIs?.changeClicks ?? 0) < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {formatSigned(seoKPIs?.changeClicks)}
              </div>
            </Link>

            <button
              type="button"
              onClick={onOpenLiveDrawer}
              className="dashboard-hover-item flex min-h-[56px] w-full items-center justify-between border border-white/[0.06] bg-[#060b0f] px-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="border border-cyan-500/16 bg-cyan-500/10 p-2">
                  <Radio className="h-4 w-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Active users now</div>
                  <div className="text-xs text-zinc-500">Realtime site activity</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
                <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-cyan-300'} ${isLive ? 'animate-pulse' : ''}`} />
                {activeUsers === null ? '—' : `${formatCompact(activeUsers)} live`}
              </div>
            </button>

            <Link
              href="/dashboard/seo"
              className="dashboard-hover-item flex min-h-[56px] items-center justify-between border border-white/[0.06] bg-[#060b0f] px-4"
            >
              <div className="flex items-center gap-3">
                <div className="border border-amber-500/16 bg-amber-500/10 p-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Indexing status</div>
                  <div className="text-xs text-zinc-500">{formatCompact(seoKPIs?.indexedPages)} indexed pages</div>
                </div>
              </div>
              <div className={`text-sm font-medium ${(seoKPIs?.crawlErrors ?? 0) > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {(seoKPIs?.crawlErrors ?? 0) > 0 ? `${seoKPIs?.crawlErrors} issues` : 'Healthy'}
              </div>
            </Link>

            <div className="dashboard-hover-item flex min-h-[56px] items-center justify-between border border-white/[0.06] bg-[#060b0f] px-4">
              <div className="flex items-center gap-3">
                <div className="border border-emerald-500/16 bg-emerald-500/10 p-2">
                  <Bot className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Bot and sync</div>
                  <div className="text-xs text-zinc-500">{isLive ? 'Bot live and connected' : 'Dashboard sync active'}</div>
                </div>
              </div>
              <div className="text-right text-sm font-medium text-zinc-300">
                <div>{isLive ? 'Connected' : 'Standby'}</div>
                <div className="text-xs text-zinc-500">Last pull {timeAgo(lastUpdated).toLowerCase()}</div>
              </div>
            </div>
          </div>
        </DashboardHoverSurface>
      </div>

      <section>
        <SectionHeader
          label="What Changed"
          title="The four signals that explain this period fastest"
          detail="These cards keep the summary visible without forcing hover or drill-in to understand the story."
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {model.metricCards.map((card) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              delta={card.delta}
              explanation={card.explanation}
              values={card.values}
              tone={card.tone}
              invert={card.invert}
            />
          ))}
        </div>
      </section>

      <XMentionsProvider domain={selectedSiteLabel}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_320px] xl:grid-cols-[minmax(0,1.55fr)_360px]">
        {/* Left column: Priority Queue + Chart */}
        <div className="space-y-4">
        <DashboardHoverSurface as="section" tone="emerald" data-panel="priority-queue" className="group/pq border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6">
          <SectionHeader
            label="Priority Queue"
            title="What to do next"
            detail="Three ranked actions, each tied to visible evidence instead of a generic health score."
          />
          <div className="space-y-3">
            {model.actions.map((action) => {
              const style = toneStyles(action.tone);
              return (
                <div key={action.title} className="dashboard-hover-item border border-white/[0.06] bg-[#060b0f] p-4">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 h-14 w-1 shrink-0 ${action.tone === 'red' ? 'bg-red-400' : action.tone === 'amber' ? 'bg-amber-400' : action.tone === 'cyan' ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${style.border} ${style.glow} ${style.accent}`}>
                          {action.priority}
                        </div>
                        <h3 className="text-base font-semibold text-white">{action.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{action.why}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-medium text-zinc-200">{action.impact}</div>
                        <button
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('trafficclaw:ask-ai', {
                                detail: {
                                  question: `${action.title}. ${action.why} ${action.impact} Please analyze this for my site and give specific, actionable recommendations.`,
                                  site: selectedSiteLabel,
                                },
                              })
                            )
                          }
                          className="dashboard-hover-link inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-emerald-300"
                        >
                          {action.cta}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardHoverSurface>

        <DashboardHoverSurface as="section" tone="mixed" className="group/ch border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6">
          {/* Header: title + tab switcher */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Performance Proof</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">Performance trend</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{model.chartSummaries[chartMode]}</p>
            </div>
            <div className="inline-flex border border-white/[0.08] bg-[#060b0f] p-1">
              {(['traffic', 'seo', 'conversions'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`min-h-[44px] px-3 text-xs font-medium capitalize transition-colors ${
                    chartMode === mode ? 'bg-white text-[#06080b]' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode === 'seo' ? 'SEO' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary tab bar with legend indicator */}
          <div className="mb-3 hidden items-center justify-between border-b border-white/[0.06] pb-2 sm:flex">
            <div className="flex gap-4">
              {(['traffic', 'seo', 'conversions'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`pb-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
                    chartMode === mode
                      ? 'border-b-2 border-white text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {mode === 'seo' ? 'SEO' : mode}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {chartMode === 'traffic' && (
                <>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-emerald-400" /> Sessions
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-cyan-400" /> Clicks
                  </span>
                </>
              )}
              {chartMode === 'seo' && (
                <>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-cyan-400" /> Search clicks
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-amber-400" /> Avg position
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 border-b border-dashed border-zinc-400" /> Projected
                  </span>
                </>
              )}
              {chartMode === 'conversions' && (
                <>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-violet-400" /> Conversions
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className="inline-block h-[2px] w-3 bg-emerald-400/40" /> Sessions
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chart area */}
          <div className="dashboard-hover-item h-[340px] border border-white/[0.06] bg-[#060b0f] px-2 py-4">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={model.chartData} margin={{ top: 8, right: chartMode === 'seo' && !isMobile ? 48 : 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />

                {/* Left Y-axis: clicks/sessions/conversions */}
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => formatCompact(v)}
                />

                {/* Right Y-axis: position (only for SEO tab, hidden on mobile) */}
                {chartMode === 'seo' && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    reversed
                    hide={isMobile}
                    tick={{ fill: '#fbbf24', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 0 : 40}
                    domain={[1, 'auto']}
                    tickFormatter={(v: number) => v.toFixed(0)}
                    label={isMobile ? undefined : { value: 'Pos', angle: 0, position: 'insideTopRight', fill: '#fbbf24', fontSize: 9, dy: -10 }}
                  />
                )}

                {/* Annotation reference lines */}
                {displayAnnotations.map((ann, annIdx) => {
                  const toneColors: Record<string, string> = {
                    emerald: 'rgba(52,211,153,0.5)',
                    cyan: 'rgba(34,211,238,0.5)',
                    amber: 'rgba(251,191,36,0.5)',
                    red: 'rgba(248,113,113,0.5)',
                  };
                  const labelColors: Record<string, string> = {
                    emerald: '#34d399',
                    cyan: '#22d3ee',
                    amber: '#fbbf24',
                    red: '#f87171',
                  };
                  return (
                    <ReferenceLine
                      key={`ann-${annIdx}-${ann.date}`}
                      x={formatShortDate(ann.date)}
                      yAxisId="left"
                      stroke={toneColors[ann.tone] || toneColors.cyan}
                      strokeDasharray="4 4"
                      label={isMobile ? undefined : {
                        value: ann.label,
                        position: 'insideTopLeft',
                        fill: labelColors[ann.tone] || labelColors.cyan,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                  );
                })}

                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                  content={({ active, payload, label: tooltipLabel }) => {
                    if (!active || !payload?.length) return null;
                    const pointDate = (payload[0]?.payload as ChartPoint | undefined)?.date;
                    const ann = pointDate ? annotationByDate.get(pointDate) : undefined;
                    const toneTextColor: Record<string, string> = {
                      emerald: 'text-emerald-400',
                      cyan: 'text-cyan-400',
                      amber: 'text-amber-400',
                      red: 'text-red-400',
                    };
                    const toneBorderColor: Record<string, string> = {
                      emerald: 'border-emerald-500/40',
                      cyan: 'border-cyan-500/40',
                      amber: 'border-amber-500/40',
                      red: 'border-red-500/40',
                    };
                    return (
                      <div className="max-w-[280px] border border-white/[0.08] bg-[#070c10]/95 px-3 py-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                        <div className="text-[11px] font-semibold text-white">{tooltipLabel}</div>
                        {payload.map((entry) => {
                          const isPosition = entry.dataKey === 'position' || entry.dataKey === 'projectedPosition';
                          const displayValue = isPosition
                            ? Number(entry.value || 0).toFixed(1)
                            : formatCompact(Number(entry.value || 0));
                          return (
                            <div key={entry.dataKey} className="mt-1 flex items-center gap-2 text-xs text-zinc-300">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span>{entry.name}:</span>
                              <span className="font-mono text-white">{displayValue}</span>
                            </div>
                          );
                        })}
                        {ann && (ann.detail || ann.suggestion) && (
                          <div className={`mt-2 border-l-2 ${toneBorderColor[ann.tone] || toneBorderColor.cyan} pl-2`}>
                            <div className={`text-[11px] font-semibold ${toneTextColor[ann.tone] || toneTextColor.cyan}`}>
                              {ann.label}
                            </div>
                            {ann.detail && (
                              <div className="mt-0.5 text-[11px] leading-[1.4] text-zinc-300">{ann.detail}</div>
                            )}
                            {ann.suggestion && (
                              <div className="mt-1 text-[11px] leading-[1.4] text-zinc-500">{ann.suggestion}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {/* Traffic tab lines */}
                {chartMode === 'traffic' && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="sessions"
                      name="Sessions"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#34d399' }}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="clicks"
                      name="Search clicks"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#22d3ee' }}
                      isAnimationActive={false}
                    />
                  </>
                )}

                {/* SEO tab lines: clicks (left axis), position + projected (right axis) */}
                {chartMode === 'seo' && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="clicks"
                      name="Search clicks"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#22d3ee' }}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="position"
                      name="Avg position"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#fbbf24' }}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="projectedPosition"
                      name="Projected position"
                      stroke="rgba(251,191,36,0.4)"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </>
                )}

                {/* Conversions tab lines */}
                {chartMode === 'conversions' && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="conversions"
                      name="Conversions"
                      stroke="#a78bfa"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#a78bfa' }}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="sessions"
                      name="Sessions"
                      stroke="rgba(52,211,153,0.35)"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: '#34d399' }}
                      isAnimationActive={false}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom legend bar */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3">
            {chartMode === 'traffic' && (
              <>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-emerald-400" /> Sessions
                </span>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-cyan-400" /> Search clicks
                </span>
              </>
            )}
            {chartMode === 'seo' && (
              <>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-cyan-400" /> Search clicks
                </span>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-amber-400" /> Average position
                </span>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 border-b border-dashed border-amber-400/60" /> Projected positions
                </span>
              </>
            )}
            {chartMode === 'conversions' && (
              <>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-violet-400" /> Conversions
                </span>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="h-[3px] w-4 bg-emerald-400/40" /> Sessions (reference)
                </span>
              </>
            )}
          </div>

          {/* Footer insight */}
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">{model.chartSummaries[chartMode]}</p>
        </DashboardHoverSurface>

        <XMentionsTopPanel premiumHover />

        </div>

        {/* Right column: Timeline + Top Pages + Keywords */}
        <div className="space-y-4">
          <DashboardHoverSurface as="section" tone="cyan" className="border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6">
            <SectionHeader
              label="Recent Timeline"
              title="What happened mainly"
              detail="These events use real dates from traffic, search, goals, and sync activity."
            />
            <div className="space-y-3">
              {model.timeline.map((item) => {
                const style = toneStyles(item.tone);
                return (
                  <div key={item.key} className="dashboard-hover-item border border-white/[0.06] bg-[#060b0f] p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 border ${style.border} ${style.glow} p-2`}>
                        <Activity className={`h-4 w-4 ${style.accent}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{item.title}</div>
                        <div className="mt-1 text-sm leading-6 text-zinc-400">{item.detail}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          {timeAgo(item.timestamp)} · {formatAbsoluteDate(item.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashboardHoverSurface>

          <DashboardHoverSurface as="section" tone="cyan" className="group/tp border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Top Pages</div>
                <h3 className="mt-2 text-lg font-semibold text-white">Where clicks are concentrating</h3>
              </div>
              <Link href="/dashboard/seo" className="dashboard-hover-link min-h-[44px] inline-flex items-center text-sm font-medium text-emerald-300">
                Open SEO
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {model.topPages.map((page) => (
                <div key={page.page} className="dashboard-hover-item group/pg border border-white/[0.06] bg-[#060b0f] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white transition-colors duration-200 group-hover/pg:text-zinc-100">{page.page}</div>
                      <div className="mt-1 text-xs text-zinc-500">{formatCompact(page.clicks)} clicks · {formatSigned(page.delta)}</div>
                    </div>
                    <div className="text-sm font-medium text-zinc-300">{formatCompact(page.clicks)}</div>
                  </div>
                  <div className="mt-3 h-2 bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500 group-hover/pg:brightness-110"
                      style={{ width: `${clamp((page.clicks / model.maxPageClicks) * 100, 8, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </DashboardHoverSurface>

          <DashboardHoverSurface as="section" tone="cyan" className="group/sm border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Top Search Movers</div>
                <h3 className="mt-2 text-lg font-semibold text-white">Keywords moving the fastest</h3>
              </div>
              <Link href="/dashboard/opportunities" className="dashboard-hover-link min-h-[44px] inline-flex items-center text-sm font-medium text-cyan-300">
                Explore
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {model.searchMovers.map((query) => (
                <div key={query.query} className="dashboard-hover-item group/mv border border-white/[0.06] bg-[#060b0f] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{query.query}</div>
                      <div className="mt-1 text-xs text-zinc-500">Position {formatCompact(query.position)}</div>
                    </div>
                    <div className={`inline-flex items-center gap-1 text-xs font-medium ${(query.delta || 0) <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      <span className="transition-transform duration-200 group-hover/mv:scale-110">
                        {(query.delta || 0) <= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      </span>
                      {formatSigned(query.delta, true, '')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardHoverSurface>
        </div>
      </div>

      <XMentionsPickerRail className="mt-4" premiumHover />
      </XMentionsProvider>

      <RedditMentionsProvider domain={selectedSiteLabel}>
        <div className="mt-4 space-y-4">
          <RedditMentionsTopPanel premiumHover />
          <RedditMentionsPickerRail premiumHover />
        </div>
      </RedditMentionsProvider>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardHoverSurface as="section" tone="emerald" className="border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Goals Progress</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">What is converting right now</h2>
            </div>
            <Link href="/dashboard/analytics/goals" className="dashboard-hover-link min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-emerald-300">
              Open goals
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

          {model.goalCards.length > 0 ? (
            <div className="mt-5 space-y-4">
              {model.goalCards.map((goal) => (
                <div key={goal.id} className="dashboard-hover-item border border-white/[0.06] bg-[#060b0f] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{goal.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">Target: {goal.target}</div>
                    </div>
                    <div className={`inline-flex items-center gap-1 text-xs font-medium ${goal.latestChange >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {goal.latestChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {formatSigned(goal.latestChange)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="font-mono text-2xl font-semibold text-white">{formatCompact(goal.conversions)}</div>
                    <div className="text-sm text-zinc-400">{toNumber(goal.rate).toFixed(1)}% rate</div>
                  </div>
                  <div className="mt-3 h-2 bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${goal.width}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-white/[0.1] bg-[#060b0f] p-5">
              <div className="text-sm font-medium text-white">Goals will appear here once goal data is available.</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                The overview is ready to show real conversion signals, but this workspace does not have goal data for the selected property yet.
              </p>
            </div>
          )}
        </DashboardHoverSurface>

        <DashboardHoverSurface as="section" tone="mixed" className="border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Indexing and Technical</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">How discoverable the site looks</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This panel keeps indexing and technical status grounded in real SEO data instead of a synthetic site health grade.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="dashboard-hover-item border border-white/[0.06] bg-[#060b0f] p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Indexed pages</div>
              <div className="mt-3 font-mono text-[30px] font-semibold text-white">{formatCompact(seoKPIs?.indexedPages)}</div>
              <div className="mt-2 text-sm text-zinc-400">Pages currently surfaced in the search snapshot.</div>
            </div>
            <div className="dashboard-hover-item border border-white/[0.06] bg-[#060b0f] p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Technical issues</div>
              <div className="mt-3 font-mono text-[30px] font-semibold text-white">{formatCompact(seoKPIs?.crawlErrors)}</div>
              <div className="mt-2 text-sm text-zinc-400">
                {(seoKPIs?.crawlErrors ?? 0) > 0 ? 'These need review before they slow crawling or indexing.' : 'No crawl issues are currently flagged in this summary.'}
              </div>
            </div>
          </div>

          <div className="dashboard-hover-item mt-5 border border-white/[0.06] bg-[#060b0f] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">Technical interpretation</div>
              <Link href="/dashboard/seo" className="dashboard-hover-link min-h-[44px] inline-flex items-center text-sm font-medium text-amber-300">
                Review details
              </Link>
            </div>
            <div className="mt-4 h-3 bg-white/[0.05] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                style={{
                  width: `${clamp(
                    ((seoKPIs?.indexedPages ?? 0) / Math.max((seoKPIs?.indexedPages ?? 0) + (seoKPIs?.crawlErrors ?? 0), 1)) * 100,
                    10,
                    100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {(seoKPIs?.crawlErrors ?? 0) > 0
                ? `${seoKPIs?.crawlErrors} crawl issue${seoKPIs?.crawlErrors === 1 ? '' : 's'} need review, even though ${formatCompact(seoKPIs?.indexedPages)} pages are being indexed.`
                : `${formatCompact(seoKPIs?.indexedPages)} pages are indexed and no crawl errors are currently being surfaced in the overview data.`}
            </p>
          </div>
        </DashboardHoverSurface>
      </div>
    </div>
  );
}
