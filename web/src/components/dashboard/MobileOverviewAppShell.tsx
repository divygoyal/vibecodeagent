'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  ChevronRight,
  Eye,
  ExternalLink,
  Radio,
  RefreshCw,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
import { computeAlerts, computeOpportunities } from '@/lib/alertEngine';
import { getDashboardBriefing } from '@/lib/dashboardBriefing';

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
};

type DashboardSeoData = {
  queries?: Array<{
    query?: string;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    changeClicks?: number;
    changePosition?: number;
  }>;
  pages?: Array<{
    page?: string;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    status?: string;
    changeClicks?: number;
    changePosition?: number;
  }>;
  trend?: SearchTrendPoint[];
};

type MetricTone = 'emerald' | 'cyan' | 'amber' | 'red';

type MetricCardModel = {
  label: string;
  value: string;
  delta?: number;
  explanation: string;
  values: number[];
  tone: MetricTone;
  invert?: boolean;
};

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
  pageViews: number;
  clicks: number;
  impressions: number;
  conversions: number;
};

interface MobileOverviewAppShellProps {
  selectedSiteLabel: string;
  range: string;
  activeUsers: number | null;
  isLive: boolean;
  botRunning: boolean;
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
  onExportReport: () => void;
  onAskAI: () => void;
}

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
  all: 'Last 365 days',
};

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
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function formatAbsoluteDate(value?: string | Date | null) {
  if (!value) return 'Awaiting sync';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
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
  if (Number.isNaN(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function toneClasses(tone: MetricTone) {
  if (tone === 'red') {
    return {
      accent: 'text-red-300',
      border: 'border-red-500/16',
      glow: 'bg-red-500/[0.08]',
      fill: '#f87171',
      chip: 'border-red-500/18 bg-red-500/[0.08] text-red-200',
      iconBg: 'border-red-500/16 bg-red-500/[0.08]',
      barGradient: 'linear-gradient(180deg,#fda4af 0%,#f87171 42%,#7f1d1d 100%)',
      barShadow: '0 0 18px rgba(248,113,113,0.18)',
    };
  }
  if (tone === 'amber') {
    return {
      accent: 'text-amber-300',
      border: 'border-amber-500/16',
      glow: 'bg-amber-500/[0.08]',
      fill: '#fbbf24',
      chip: 'border-amber-500/18 bg-amber-500/[0.08] text-amber-200',
      iconBg: 'border-amber-500/16 bg-amber-500/[0.08]',
      barGradient: 'linear-gradient(180deg,#fde68a 0%,#fbbf24 42%,#854d0e 100%)',
      barShadow: '0 0 18px rgba(251,191,36,0.18)',
    };
  }
  if (tone === 'cyan') {
    return {
      accent: 'text-cyan-300',
      border: 'border-cyan-500/16',
      glow: 'bg-cyan-500/[0.08]',
      fill: '#22d3ee',
      chip: 'border-cyan-500/18 bg-cyan-500/[0.08] text-cyan-200',
      iconBg: 'border-cyan-500/16 bg-cyan-500/[0.08]',
      barGradient: 'linear-gradient(180deg,#67e8f9 0%,#22d3ee 42%,#155e75 100%)',
      barShadow: '0 0 18px rgba(34,211,238,0.18)',
    };
  }
  return {
    accent: 'text-emerald-300',
    border: 'border-emerald-500/16',
    glow: 'bg-emerald-500/[0.08]',
    fill: '#34d399',
    chip: 'border-emerald-500/18 bg-emerald-500/[0.08] text-emerald-200',
    iconBg: 'border-emerald-500/16 bg-emerald-500/[0.08]',
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

function getTimelineIcon(key: string, tone: MetricTone) {
  if (key.startsWith('search')) return Search;
  if (key.startsWith('traffic')) return tone === 'red' || tone === 'amber' ? TrendingDown : TrendingUp;
  if (key.startsWith('goal')) return Target;
  if (key === 'live-users') return Radio;
  if (key === 'sync') return RefreshCw;
  return Activity;
}

function MiniSparkline({ values, tone }: { values: number[]; tone: MetricTone }) {
  const style = toneClasses(tone);
  const bars = buildMetricBars(values);

  return (
    <div className="flex h-12 items-end gap-1.5">
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

function MobileMetricCard({ card }: { card: MetricCardModel }) {
  const tone = toneClasses(card.tone);
  const positive = card.invert ? (card.delta ?? 0) <= 0 : (card.delta ?? 0) >= 0;

  return (
    <article className="relative w-[calc(100vw-64px)] shrink-0 snap-start overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(9,14,20,0.98),rgba(4,8,12,0.98))] p-4 shadow-[0_20px_44px_rgba(0,0,0,0.34)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.08),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.06),transparent_30%)]" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tone.iconBg}`}>
            {renderMetricCardIcon(card.label, `h-4 w-4 ${tone.accent}`)}
          </div>
          <span className="truncate">{card.label}</span>
        </div>
        <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${card.delta !== undefined ? tone.chip : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>
          {card.delta !== undefined ? formatSigned(card.delta, card.invert) : 'Stable'}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="font-mono text-[28px] font-semibold leading-none text-white">{card.value}</div>
        {card.delta !== undefined && (
          <div className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span>{formatSigned(card.delta, card.invert)}</span>
          </div>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-3 py-2">
        <MiniSparkline values={card.values} tone={card.tone} />
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-400">{card.explanation}</p>
    </article>
  );
}

export default function MobileOverviewAppShell({
  selectedSiteLabel,
  range,
  activeUsers,
  isLive,
  botRunning,
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
  onExportReport,
  onAskAI,
}: MobileOverviewAppShellProps) {
  const [chartMode, setChartMode] = useState<'traffic' | 'seo' | 'conversions'>('seo');
  const [activeMetricCard, setActiveMetricCard] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / 4;
    if (cardWidth > 0) {
      setActiveMetricCard(Math.round(el.scrollLeft / cardWidth));
    }
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
    const topGoal = [...goals].sort((a, b) => b.conversions - a.conversions)[0];
    const topOpp = opportunities[0];
    const topPage = [...pages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0];
    const goalsOnTrack = goals.filter((goal) => toNumber(goal.change) >= 0).length;

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
      goalCount: goals.length,
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

    const metricCards: MetricCardModel[] = [
      {
        label: 'Users',
        value: formatCompact(analyticsKPIs?.totalUsers),
        delta: analyticsKPIs?.changeUsers,
        explanation:
          (analyticsKPIs?.changeUsers ?? 0) < 0
            ? 'Reach is trailing the previous period and needs fresh demand.'
            : 'Audience reach is holding or expanding versus the last window.',
        values: traffic.map((point) => point.activeUsers || point.sessions || 0).slice(-14),
        tone: ((analyticsKPIs?.changeUsers ?? 0) < 0 ? 'amber' : 'emerald') as MetricTone,
      },
      {
        label: 'Page Views',
        value: formatCompact(analyticsKPIs?.totalPageViews),
        delta: analyticsKPIs?.changePageViews,
        explanation:
          (analyticsKPIs?.changePageViews ?? 0) < 0
            ? 'Visitors are going less deep after landing on the site.'
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
            ? 'Organic click volume is slipping versus the comparison period.'
            : 'Organic search is holding steady or gaining momentum.',
        values: search.map((point) => point.clicks || 0).slice(-14),
        tone: ((seoKPIs?.changeClicks ?? 0) < 0 ? 'red' : 'emerald') as MetricTone,
      },
      {
        label: 'Avg Position',
        value: formatCompact(seoKPIs?.avgPosition),
        delta: seoKPIs?.changePosition,
        explanation:
          (seoKPIs?.changePosition ?? 0) > 0
            ? 'Average rankings slipped enough to warrant a closer look.'
            : 'Average rankings are holding or improving this period.',
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
        impact: 'Protect demand before the losses compound further.',
        href: '/dashboard/seo',
        cta: 'Open SEO',
        tone: 'red',
      });
    }
    if (topOpp) {
      actionPool.push({
        priority: actionPool.length === 0 ? 'Now' : 'Next',
        title: topOpp.type === 'ctr_fix' ? `Rewrite titles for "${topOpp.query}"` : `Push "${topOpp.query}" higher`,
        why: `This query sits near position ${toNumber(topOpp.position).toFixed(1)} with ${formatCompact(topOpp.impressions)} impressions.`,
        impact: `Potential +${formatCompact(topOpp.potentialClicks)} clicks if expected demand is captured.`,
        href: '/dashboard/seo',
        cta: 'Review opportunity',
        tone: topOpp.type === 'ctr_fix' ? 'amber' : 'emerald',
      });
    }
    if ((seoKPIs?.crawlErrors ?? 0) > 0) {
      actionPool.push({
        priority: actionPool.length < 2 ? 'Next' : 'Later',
        title: 'Resolve crawl and indexing blockers',
        why: `${seoKPIs?.crawlErrors} technical issue${seoKPIs?.crawlErrors === 1 ? '' : 's'} can slow discoverability.`,
        impact: 'Clear blockers so important pages keep getting crawled and indexed.',
        href: '/dashboard/seo',
        cta: 'Check technical',
        tone: 'amber',
      });
    } else if (topGoal) {
      actionPool.push({
        priority: actionPool.length < 2 ? 'Next' : 'Later',
        title: `Double down on ${topGoal.name}`,
        why: `${formatCompact(topGoal.conversions)} conversions already came through ${topGoal.target}.`,
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
        why: `${topPage.page} is carrying a strong share of current clicks.`,
        impact: 'A sharper headline or internal-link pass can compound the current momentum.',
        href: '/dashboard/seo',
        cta: 'Inspect page',
        tone: 'emerald',
      });
    }
    if (actionPool.length === 0) {
      actionPool.push({
        priority: 'Now',
        title: 'Review the strongest traffic and search signals',
        why: 'This keeps the current overview grounded before you drill into a deeper workflow.',
        impact: 'Use the summary cards to decide whether SEO, analytics, or goals deserves attention first.',
        href: '/dashboard/analytics',
        cta: 'Open analytics',
        tone: 'cyan',
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
        pageViews: point.pageViews || 0,
        clicks: chartMap.get(point.date)?.clicks || 0,
        impressions: chartMap.get(point.date)?.impressions || 0,
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
        pageViews: existing?.pageViews || 0,
        clicks: point.clicks || 0,
        impressions: point.impressions || 0,
        conversions: existing?.conversions || 0,
      });
    });

    const goalConversionsByDate = new Map<string, number>();
    goals.forEach((goal) => {
      const trend = Array.isArray(goal.trend) ? goal.trend : [];
      trend.forEach((point) => {
        if (!point?.date) return;
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
          pageViews: 0,
          clicks: 0,
          impressions: 0,
          conversions,
        });
      }
    });

    const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));

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
        detail: `${formatCompact(currentValue)} clicks landed on ${formatShortDate(latestSearch.date)}.`,
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
        detail: `${formatCompact(currentValue)} sessions were recorded on ${formatShortDate(latestTraffic.date)}.`,
        timestamp: latestTraffic.date,
        tone: delta < -5 ? 'amber' : delta > 5 ? 'emerald' : 'cyan',
      });
    }

    goals.slice(0, 2).forEach((goal) => {
      const trend = Array.isArray(goal.trend) ? goal.trend : [];
      const latestPoint = trend.length > 0 ? trend[trend.length - 1] : undefined;
      if (!latestPoint?.date) return;
      timeline.push({
        key: `goal-${goal.id}`,
        title: `${goal.name} recorded ${formatCompact(latestPoint.value)} conversions`,
        detail: `Current conversion rate is ${toNumber(goal.rate).toFixed(1)}% on ${goal.target}.`,
        timestamp: latestPoint.date,
        tone: toNumber(goal.change) >= 0 ? 'emerald' : 'amber',
      });
    });

    if (activeUsers !== null) {
      timeline.push({
        key: 'live-users',
        title: `${formatCompact(activeUsers)} active users are on site now`,
        detail: isLive ? 'Realtime view is connected and ready to inspect.' : 'Live traffic is available from the latest sync.',
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
      const left = new Date(b.timestamp).getTime();
      const right = new Date(a.timestamp).getTime();
      if (Number.isNaN(left)) return -1;
      if (Number.isNaN(right)) return 1;
      return left - right;
    });

    const topPages = [...pages]
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 3)
      .map((page) => ({
        page: page.page || '/',
        clicks: page.clicks || 0,
        delta: page.changeClicks || 0,
      }));

    const searchMovers = [...queries]
      .filter((query) => query.query)
      .sort((a, b) => Math.abs(b.changePosition || 0) - Math.abs(a.changePosition || 0))
      .slice(0, 3)
      .map((query) => ({
        query: query.query || '',
        position: query.position || 0,
        delta: query.changePosition || 0,
      }));

    const topPageCard = topPages[0];
    const topQueryCard = searchMovers[0];

    const proofCards = [
      {
        key: 'pages',
        label: 'Top pages',
        title: topPageCard?.page || 'No page data yet',
        detail: topPageCard ? `${formatCompact(topPageCard.clicks)} clicks in the selected range` : 'Once page data lands, this card will show the strongest page.',
        href: '/dashboard/seo',
        tone: 'cyan' as MetricTone,
      },
      {
        key: 'keywords',
        label: 'Search movers',
        title: topQueryCard?.query || 'No keyword movers yet',
        detail: topQueryCard ? `Position ${formatCompact(topQueryCard.position)} · ${formatSigned(topQueryCard.delta, true, '')}` : 'This card will highlight the fastest-moving search term.',
        href: '/dashboard/seo',
        tone: 'emerald' as MetricTone,
      },
      {
        key: 'goals',
        label: 'Goals',
        title: topGoal ? topGoal.name : 'Goal data pending',
        detail: topGoal ? `${formatCompact(topGoal.conversions)} conversions at ${toNumber(topGoal.rate).toFixed(1)}% rate` : 'Open goals to connect conversion tracking and view progress.',
        href: '/dashboard/analytics/goals',
        tone: 'amber' as MetricTone,
      },
      {
        key: 'indexing',
        label: 'Indexing',
        title: `${formatCompact(seoKPIs?.indexedPages)} indexed`,
        detail:
          (seoKPIs?.crawlErrors ?? 0) > 0
            ? `${formatCompact(seoKPIs?.crawlErrors)} crawl issue${seoKPIs?.crawlErrors === 1 ? '' : 's'} need review`
            : 'No crawl blockers are currently surfaced in the overview',
        href: '/dashboard/seo',
        tone: ((seoKPIs?.crawlErrors ?? 0) > 0 ? 'amber' : 'cyan') as MetricTone,
      },
    ];

    return {
      riskCount,
      opportunitiesCount: opportunities.length,
      goalsOnTrack,
      headline: briefing.headline,
      subcopy: briefing.subcopy,
      metricCards,
      actions,
      timeline: timeline.slice(0, 4),
      chartData,
      proofCards,
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

  if (isLoading && !hasData) {
    return (
      <div className="md:hidden space-y-4 pb-28">
        {/* Brief skeleton */}
        <div className="h-[200px] animate-pulse rounded-[28px] border border-white/[0.08] bg-[#05090d]" />
        {/* Quick-nav skeleton */}
        <div className="-mx-3 flex gap-2 overflow-hidden px-3 sm:-mx-4 sm:px-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
          ))}
        </div>
        {/* Metric cards skeleton */}
        <div className="-mx-3 flex gap-3 overflow-hidden px-3 sm:-mx-4 sm:px-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-[230px] w-[calc(100vw-64px)] shrink-0 animate-pulse rounded-[24px] border border-white/[0.08] bg-[#05090d]" />
          ))}
        </div>
        {/* Dot indicator skeleton */}
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-2 w-2 animate-pulse rounded-full bg-white/[0.16]" />
          ))}
        </div>
        {/* Actions skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[120px] animate-pulse rounded-[24px] border border-white/[0.08] bg-[#05090d]" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) {
    return null;
  }

  const topAction = model.actions[0];
  const chartDetailMap = {
    traffic: {
      label: 'Sessions',
      value: formatCompact(analyticsKPIs?.totalSessions ?? analyticsKPIs?.totalUsers),
      href: '/dashboard/analytics',
      summary:
        (analyticsKPIs?.changeUsers ?? 0) < -5
          ? 'Traffic softened enough to justify a closer look at when demand changed.'
          : 'Traffic is holding steady. Use this pulse to spot demand changes quickly.',
    },
    seo: {
      label: 'Avg position',
      value: formatCompact(seoKPIs?.avgPosition),
      href: '/dashboard/seo',
      summary:
        (seoKPIs?.changeClicks ?? 0) < -5
          ? 'Search softened, so this view keeps the organic trend readable on one screen.'
          : 'Search demand is steady. Check this pulse for click momentum and search movement.',
    },
    conversions: {
      label: 'Conversions',
      value: formatCompact(goalsData?.totalConversions),
      href: '/dashboard/analytics/goals',
      summary:
        (goalsData?.totalConversions ?? 0) > 0
          ? 'Conversion flow is available here without forcing the full goals screen open.'
          : 'Conversion data is lighter right now, so this view stays focused on the essentials.',
    },
  } as const;

  return (
    <div className="md:hidden space-y-4 pb-28">
      <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.16),transparent_46%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_42%),#05090d] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-full border border-white/[0.08] bg-[#030609] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Today&apos;s brief
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{formatRangeLabel(range)}</div>
        </div>

        <h2 className="mt-4 text-[28px] font-semibold leading-[1.05] tracking-tight text-white">{model.headline}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{model.subcopy}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <div className={`rounded-full border px-3 py-2 text-[11px] font-medium ${model.riskCount > 0 ? 'border-amber-500/20 bg-amber-500/[0.08] text-amber-200' : 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-200'}`}>
            {model.riskCount} active risk{model.riskCount === 1 ? '' : 's'}
          </div>
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-2 text-[11px] font-medium text-cyan-200">
            {model.opportunitiesCount} ranked opportunities
          </div>
          <div className="rounded-full border border-white/[0.08] bg-[#030609] px-3 py-2 text-[11px] font-medium text-zinc-300">
            {model.goalsOnTrack} goals on track
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={topAction?.href || '/dashboard/seo'}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-3 text-sm font-semibold text-[#031014] shadow-[0_10px_24px_rgba(34,211,238,0.18)] transition-all duration-100 active:scale-[0.97] active:opacity-90"
          >
            Review top action
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onAskAI}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#030609] px-4 py-3 text-sm font-medium text-zinc-200 transition-all duration-100 active:scale-[0.97] active:opacity-90"
          >
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Ask AI
          </button>
        </div>

        <div className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-600">
          {isLive ? 'Realtime connected' : 'Synced'} · {timeAgo(lastUpdated)}
        </div>
      </section>

      {!botRunning && (
        <Link
          href="/dashboard/bot"
          className="flex items-center justify-between gap-3 rounded-[24px] border border-emerald-500/16 bg-emerald-500/[0.06] px-4 py-4 shadow-[0_14px_32px_rgba(0,0,0,0.2)] transition-all duration-100 active:scale-[0.98] active:opacity-90"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl border border-emerald-500/18 bg-emerald-500/[0.08] p-2.5">
              <Bot className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Telegram bot is not live yet</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">
                Turn it on to get a more app-like daily briefing outside the dashboard.
              </div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300" />
        </Link>
      )}

      {/* Section quick-jump navigation strip */}
      <nav aria-label="Jump to section" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { label: 'Metrics', id: 'mobile-metrics' },
          { label: 'Actions', id: 'mobile-actions' },
          { label: 'Events', id: 'mobile-timeline' },
          { label: 'Pulse', id: 'mobile-pulse' },
          { label: 'Social', id: 'mobile-social' },
        ].map(({ label, id }) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="whitespace-nowrap rounded-full border border-white/[0.08] bg-[#05090d] px-3 py-2 text-xs font-medium text-zinc-300 transition-all duration-100 active:bg-white/[0.06] active:scale-[0.96]"
          >
            {label}
          </button>
        ))}
      </nav>

      <section id="mobile-metrics" className="scroll-mt-16">
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">What changed</div>
          <div className="mt-1 text-sm text-zinc-400">Swipe through the strongest changes this period.</div>
        </div>
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {model.metricCards.map((card) => (
            <MobileMetricCard key={card.label} card={card} />
          ))}
        </div>
        {/* Dot pagination indicator */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {model.metricCards.map((card, index) => (
            <button
              key={card.label}
              type="button"
              aria-label={`Go to ${card.label}`}
              onClick={() => {
                const el = carouselRef.current;
                if (!el) return;
                const cardWidth = el.scrollWidth / model.metricCards.length;
                el.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
              }}
              style={{ padding: 0, border: 'none', background: 'none' }}
              className={`block h-2 rounded-full transition-all duration-200 ${
                activeMetricCard === index ? 'w-5 bg-white' : 'w-2 bg-white/30'
              }`}
            />
          ))}
        </div>
      </section>

      <section id="mobile-actions" className="rounded-[28px] border border-white/[0.08] bg-[#05090d] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)] scroll-mt-16">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Next actions</div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">What to do next</h3>
          </div>
          <button
            type="button"
            onClick={onExportReport}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-white/[0.08] bg-[#030609] text-zinc-300"
            aria-label="Export report"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {model.actions.map((action) => {
            const tone = toneClasses(action.tone);
            return (
              <Link
                key={`${action.priority}-${action.title}`}
                href={action.href}
                className="block rounded-[24px] border border-white/[0.08] bg-[#030609] p-4 transition-all duration-100 active:scale-[0.98] active:opacity-90"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.chip}`}>
                      {action.priority}
                    </div>
                    <div className="mt-3 text-base font-semibold leading-6 text-white">{action.title}</div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">{action.why}</p>
                <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs leading-5 text-zinc-400">
                  <span className="font-medium text-zinc-200">Why it matters:</span> {action.impact}
                </div>
                <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-cyan-300">
                  {action.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="mobile-timeline" data-mobile-section="timeline" className="rounded-[28px] border border-white/[0.08] bg-[#05090d] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)] scroll-mt-16">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">What happened</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Main events from this period</h3>
        <div className="mt-4 space-y-3">
          {model.timeline.map((item) => {
            const tone = toneClasses(item.tone);
            const Icon = getTimelineIcon(item.key, item.tone);
            return (
              <div key={item.key} className="rounded-[22px] border border-white/[0.06] bg-[#030609] p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 rounded-2xl border p-2 ${tone.border} ${tone.glow}`}>
                    <Icon className={`h-4 w-4 ${tone.accent}`} />
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
      </section>

      <section id="mobile-pulse" className="rounded-[28px] border border-white/[0.08] bg-[#05090d] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)] scroll-mt-16">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Performance pulse</div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">One clear trend at a time</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{chartDetailMap[chartMode].summary}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#030609] px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{chartDetailMap[chartMode].label}</div>
            <div className="mt-1 font-mono text-sm font-semibold text-white">{chartDetailMap[chartMode].value}</div>
          </div>
        </div>

        {/* Full-width segment control */}
        <div className="mt-4 flex w-full rounded-2xl border border-white/[0.08] bg-[#030609] p-1">
          {(['traffic', 'seo', 'conversions'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setChartMode(mode)}
              className={`flex-1 min-h-[40px] rounded-[14px] text-xs font-medium capitalize transition-all duration-150 ${
                chartMode === mode ? 'bg-white text-[#061015]' : 'text-zinc-400 active:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="mt-4 h-[220px] rounded-[24px] border border-white/[0.06] bg-[#030609] px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={model.chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#060b0f',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  boxShadow: '0 16px 36px rgba(0,0,0,0.35)',
                }}
                labelStyle={{ color: '#e4e4e7', fontWeight: 600, marginBottom: 4 }}
                formatter={(value: number | string | undefined) => [formatCompact(value), chartDetailMap[chartMode].label]}
              />

              {chartMode === 'traffic' && (
                <Line type="monotone" dataKey="sessions" stroke="#34d399" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#34d399' }} isAnimationActive={false} />
              )}
              {chartMode === 'seo' && (
                <Line type="monotone" dataKey="clicks" stroke="#22d3ee" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#22d3ee' }} isAnimationActive={false} />
              )}
              {chartMode === 'conversions' && (
                <Line type="monotone" dataKey="conversions" stroke="#a78bfa" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <Link href={chartDetailMap[chartMode].href} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-cyan-300 transition-all duration-100 active:opacity-70">
          Open detailed view
          <ExternalLink className="h-4 w-4" />
        </Link>
      </section>

      <section className="rounded-[28px] border border-white/[0.08] bg-[#05090d] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Proof cards</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Where to drill in faster</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {model.proofCards.map((card) => {
            const tone = toneClasses(card.tone);
            return (
              <Link
                key={card.key}
                href={card.href}
                className="flex flex-col rounded-[22px] border border-white/[0.06] bg-[#030609] p-4 transition-all duration-100 active:scale-[0.97] active:opacity-90"
              >
                <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.chip}`}>
                  {card.label}
                </div>
                <div className="mt-3 line-clamp-1 text-sm font-semibold leading-6 text-white">{card.title}</div>
                <div className="mt-2 line-clamp-2 flex-1 text-xs leading-5 text-zinc-400">{card.detail}</div>
                <div className="mt-2 flex justify-end">
                  <ChevronRight className="h-3 w-3 text-zinc-600" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="mobile-social" className="space-y-4 scroll-mt-16">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest mentions</div>
            <div className="mt-1 text-sm text-zinc-400">Social mentions stay lower in the mobile flow, ready when you want them.</div>
          </div>
          <Link href="/dashboard/ai-chat" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-cyan-300 transition-all duration-100 active:opacity-70">
            AI Chat
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <XMentionsProvider domain={selectedSiteLabel}>
          <div className="space-y-4">
            <XMentionsTopPanel />
            <XMentionsPickerRail />
          </div>
        </XMentionsProvider>
        <RedditMentionsProvider domain={selectedSiteLabel}>
          <div className="space-y-4">
            <RedditMentionsTopPanel />
            <RedditMentionsPickerRail />
          </div>
        </RedditMentionsProvider>
      </section>
    </div>
  );
}
