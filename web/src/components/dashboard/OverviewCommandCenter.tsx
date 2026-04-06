'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  Eye,
  Hash,
  MousePointer,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

import { computeAlerts, computeOpportunities } from '@/lib/alertEngine';

type AnalyticsKpis = {
  totalUsers?: number;
  totalPageViews?: number;
  changeUsers?: number;
  changePageViews?: number;
};

type AnalyticsPoint = {
  activeUsers?: number;
  pageViews?: number;
};

type SeoKpis = {
  totalClicks?: number;
  avgPosition?: number | string;
  totalImpressions?: number;
  changeClicks?: number;
  changePosition?: number;
};

type SearchTrendPoint = {
  clicks?: number;
  impressions?: number;
  position?: number;
};

type SeoQuery = {
  query?: string;
  position?: number | string;
  ctr?: number | string;
  impressions?: number | string;
  clicks?: number | string;
};

type SeoPage = {
  page?: string;
  clicks?: number | string;
  impressions?: number | string;
  position?: number | string;
};

type DashboardAnalyticsData = {
  traffic?: AnalyticsPoint[];
};

type DashboardSeoData = {
  queries?: SeoQuery[];
  pages?: SeoPage[];
};

interface OverviewCommandCenterProps {
  selectedSiteLabel: string;
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
  onOpenLiveDrawer: () => void;
  onExportReport: () => void;
}

interface PriorityQueueItem {
  priority: string;
  title: string;
  detail: string;
  impact: string;
  href: string;
  actionLabel: string;
  tone: 'emerald' | 'cyan' | 'amber' | 'red';
}

interface TopPageItem {
  page: string;
  clicks: number;
  impressions: number;
  position: string;
}

interface MoverItem {
  label: string;
  detail: string;
  delta: string;
  tone: 'positive' | 'watch';
}

// ─── Recharts tooltip types ───

interface ChartTooltipEntry {
  value: number;
  dataKey: string;
  color: string;
  name: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string | number;
}

// ─── Utility functions ───

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fmtCompact(value?: number | string) {
  if (value === undefined || value === null) return '0';
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(numeric)) return '0';
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return numeric.toLocaleString();
}

function fmtSigned(value?: number, invert = false) {
  if (value === undefined || value === null || Number.isNaN(value)) return '0%';
  const normalized = invert ? value * -1 : value;
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1).replace(/\.0$/, '')}%`;
}

function timeAgo(timestamp: Date | null) {
  if (!timestamp) return 'just synced';
  const diff = Date.now() - timestamp.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just synced';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildLinePoints(values: number[], width: number, height: number, padding = 6) {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

/** Boost tips shown on MetricCard hover tooltip */
const METRIC_BOOST_TIPS: Record<string, string> = {
  'Total Users': 'Boost organic traffic through striking-distance keywords.',
  'Page Views': 'Improve engagement by optimizing top landing pages.',
  'Search Clicks': 'Title tag optimization can lift CTR by 20-35%.',
  'Avg. Position': 'Target page-2 keywords for fastest ranking gains.',
};

// ─── Components ───

function HardEdgeSparkline({
  values,
  stroke,
  width = 220,
  height = 58,
  showGrid = false,
  secondaryValues,
  secondaryStroke = '#22d3ee',
}: {
  values: number[];
  stroke: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
  secondaryValues?: number[];
  secondaryStroke?: string;
}) {
  if (values.length === 0) {
    return <div className="h-full w-full bg-[#070c10]" />;
  }

  const primaryPoints = buildLinePoints(values, width, height);
  const secondaryPoints = secondaryValues?.length ? buildLinePoints(secondaryValues, width, height) : '';

  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {showGrid && (
        <>
          <line x1="0" y1={height - 10} x2={width} y2={height - 10} stroke="#132027" strokeWidth="1" />
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#132027" strokeWidth="1" />
          <line x1="0" y1="10" x2={width} y2="10" stroke="#132027" strokeWidth="1" />
        </>
      )}
      {secondaryPoints && (
        <polyline
          fill="none"
          points={secondaryPoints}
          stroke={secondaryStroke}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeOpacity="0.78"
          strokeWidth="2"
        />
      )}
      <polyline fill="none" points={primaryPoints} stroke={stroke} strokeLinecap="square" strokeLinejoin="miter" strokeWidth="3" />
    </svg>
  );
}

/** Custom dark tooltip for Recharts interactive charts */
function ChartTooltipContent({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/[0.1] bg-[#0c0c14]/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="mb-1.5 text-[10px] font-medium text-zinc-500">Day {label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-400">{entry.name}:</span>
          <span className="font-mono font-medium text-white">{fmtCompact(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Interactive Recharts-based chart with tooltips, axes, and gradient fills */
function InteractiveChart({
  primaryData,
  secondaryData,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor = '#1FC2FF',
  height = 96,
  chartId,
}: {
  primaryData: number[];
  secondaryData?: number[];
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor: string;
  secondaryColor?: string;
  height?: number;
  chartId: string;
}) {
  const chartData = useMemo(() => {
    return primaryData.map((val, i) => ({
      day: i + 1,
      [primaryLabel]: val,
      ...(secondaryData?.[i] !== undefined ? { [secondaryLabel || 'secondary']: secondaryData[i] } : {}),
    }));
  }, [primaryData, secondaryData, primaryLabel, secondaryLabel]);

  if (primaryData.length === 0) {
    return <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">No data yet</div>;
  }

  const gradPrimaryId = `ichart-${chartId}-primary`;
  const gradSecondaryId = `ichart-${chartId}-secondary`;

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradPrimaryId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={primaryColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
            </linearGradient>
            {secondaryData && (
              <linearGradient id={gradSecondaryId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={secondaryColor} stopOpacity={0.12} />
                <stop offset="95%" stopColor={secondaryColor} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#52525b', fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#52525b', fontSize: 9 }}
            tickFormatter={(v: number) => fmtCompact(v)}
            width={36}
          />
          <RechartsTooltip
            content={<ChartTooltipContent />}
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={primaryLabel}
            stroke={primaryColor}
            fill={`url(#${gradPrimaryId})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: primaryColor, stroke: '#0c0c14', strokeWidth: 2 }}
            name={primaryLabel}
          />
          {secondaryData && secondaryLabel && (
            <Area
              type="monotone"
              dataKey={secondaryLabel}
              stroke={secondaryColor}
              fill={`url(#${gradSecondaryId})`}
              strokeWidth={1.5}
              strokeOpacity={0.7}
              dot={false}
              activeDot={{ r: 3, fill: secondaryColor, stroke: '#0c0c14', strokeWidth: 2 }}
              name={secondaryLabel}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {/* Chart legend */}
      <div className="mt-2 flex items-center gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
          {primaryLabel}
        </span>
        {secondaryData && secondaryLabel && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
            {secondaryLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function toneStyles(tone: PriorityQueueItem['tone']) {
  switch (tone) {
    case 'emerald':
      return {
        chip: 'bg-[#123327] text-[#86f4d2]',
        impact: 'text-emerald-300',
        button: 'border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/10',
        accent: 'border-l-emerald-500',
        dot: 'bg-emerald-400',
      };
    case 'cyan':
      return {
        chip: 'bg-[#102334] text-[#8fdeff]',
        impact: 'text-cyan-300',
        button: 'border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/10',
        accent: 'border-l-cyan-500',
        dot: 'bg-cyan-400',
      };
    case 'amber':
      return {
        chip: 'bg-[#30250f] text-[#ffd48a]',
        impact: 'text-amber-300',
        button: 'border-amber-500/25 text-amber-300 hover:bg-amber-500/10',
        accent: 'border-l-amber-500',
        dot: 'bg-amber-400',
      };
    default:
      return {
        chip: 'bg-[#341514] text-[#ffaea2]',
        impact: 'text-red-300',
        button: 'border-red-500/25 text-red-300 hover:bg-red-500/10',
        accent: 'border-l-red-500',
        dot: 'bg-red-400',
      };
  }
}

/** Dot indicators for the mobile carousel */
function CarouselDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5 lg:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-200 ${
            i === active ? 'w-4 bg-emerald-400' : 'w-1.5 bg-zinc-600'
          }`}
        />
      ))}
    </div>
  );
}

/** Hook to track active slide in a scroll-snap carousel */
function useCarouselIndex(ref: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const children = Array.from(el.children) as HTMLElement[];
        if (children.length === 0) { ticking = false; return; }
        const scrollLeft = el.scrollLeft;
        const containerWidth = el.offsetWidth;
        let closest = 0;
        let minDist = Infinity;
        children.forEach((child, i) => {
          const dist = Math.abs(child.offsetLeft - scrollLeft - (containerWidth - child.offsetWidth) / 2);
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        setActive(closest);
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  return active;
}

/** Labeled section divider between card groups */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="section-divider-wrap flex items-center gap-4 py-3">
      <div className="section-divider h-[2px] flex-1" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 transition-colors duration-300">{label}</span>
      <div className="section-divider h-[2px] flex-1" />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_420px]">
        <div className="border border-white/[0.08] bg-[#020508] p-6">
          <div className="h-4 w-32 animate-pulse bg-white/[0.08]" />
          <div className="mt-5 h-10 w-3/4 animate-pulse bg-white/[0.08]" />
          <div className="mt-3 h-4 w-full animate-pulse bg-white/[0.05]" />
          <div className="mt-2 h-4 w-4/5 animate-pulse bg-white/[0.05]" />
          <div className="mt-6 flex gap-3">
            <div className="h-10 w-44 animate-pulse bg-white/[0.08]" />
            <div className="h-10 w-36 animate-pulse bg-white/[0.05]" />
          </div>
        </div>
        <div className="border border-white/[0.08] bg-[#020508] p-6">
          <div className="h-4 w-28 animate-pulse bg-white/[0.08]" />
          <div className="mt-5 h-12 w-24 animate-pulse bg-white/[0.08]" />
          <div className="mt-4 h-24 w-full animate-pulse bg-white/[0.05]" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="border border-white/[0.08] bg-[#020508] p-5">
            <div className="h-4 w-20 animate-pulse bg-white/[0.08]" />
            <div className="mt-4 h-8 w-24 animate-pulse bg-white/[0.08]" />
            <div className="mt-4 h-12 w-full animate-pulse bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Enhanced MetricCard with hover tooltip (mirrors KPICard pattern) */
function MetricCard({
  href,
  icon: Icon,
  label,
  value,
  change,
  changeInvert = false,
  caption,
  statusLine,
  values,
  stroke,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: string;
  change?: number;
  changeInvert?: boolean;
  caption: string;
  statusLine?: string;
  values: number[];
  stroke: string;
}) {
  const positive = change === undefined ? true : changeInvert ? change <= 0 : change >= 0;

  // Compute derived detail data
  const valuesMin = values.length > 0 ? Math.min(...values) : 0;
  const valuesMax = values.length > 0 ? Math.max(...values) : 0;
  const prevPeriod = useMemo(() => {
    if (values.length < 2) return null;
    const half = Math.floor(values.length / 2);
    const prevSlice = values.slice(0, half);
    return Math.round(prevSlice.reduce((s, v) => s + v, 0) / prevSlice.length);
  }, [values]);
  const boostTip = METRIC_BOOST_TIPS[label];

  return (
    <div
      className="relative"
    >
      <Link
        href={href}
        className="group relative block h-full overflow-hidden border border-white/[0.08] bg-[#020508] transition-all duration-200 hover:border-white/[0.16] hover:translate-y-[-1px]"
      >
        {/* ─── Static header: always visible ─── */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
          <div className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-[#05090d] text-zinc-300">
            <Icon className="h-[16px] w-[16px]" />
          </div>
        </div>

        {/* ─── Front face: normal card content ─── */}
        <div className="px-5 pb-5 pt-2 transition-opacity duration-300 group-hover:opacity-0">
          <div className="flex items-end gap-3">
            <div className="font-mono text-[29px] font-semibold tracking-tight text-white">{value}</div>
            {change !== undefined && (
              <div className={`mb-1 text-[11px] font-semibold ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
                {fmtSigned(change, changeInvert)}
              </div>
            )}
          </div>
          <div className="mt-3 h-[52px] border-t border-white/[0.06] pt-3">
            <HardEdgeSparkline values={values} stroke={stroke} />
          </div>
          <div className="mt-3 space-y-1">
            <div className="text-sm text-zinc-300">{caption}</div>
            {statusLine && <div className="text-[11px] text-zinc-500">{statusLine}</div>}
          </div>
        </div>

        {/* ─── Back face: detail stats (crossfades in on hover) ─── */}
        <div className="absolute inset-x-0 bottom-0 top-[52px] flex flex-col justify-between px-5 pb-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {/* Value row with larger trend */}
          <div>
            <div className="flex items-end gap-3">
              <div className="font-mono text-[26px] font-semibold tracking-tight text-white">{value}</div>
              {change !== undefined && (
                <div className={`mb-1 flex items-center gap-1 text-[12px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {fmtSigned(change, changeInvert)}
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
                  <span className="font-mono text-[11px] font-medium text-zinc-300">{fmtCompact(valuesMin)} – {fmtCompact(valuesMax)}</span>
                </div>
              )}
              {change !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Trend</span>
                  <span className={`flex items-center gap-1 text-[11px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {positive ? '+' : ''}{change}%
                  </span>
                </div>
              )}
            </div>

            {/* AI Boost Tip */}
            {boostTip && (
              <div className="mt-3 border border-emerald-500/[0.1] bg-gradient-to-r from-emerald-500/[0.06] to-cyan-500/[0.04] px-3 py-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                  <span className="text-[10px] leading-relaxed text-emerald-300/90">{boostTip}</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom link */}
          <div className="flex items-center gap-1.5 pt-2">
            <ArrowRight className="h-3 w-3 text-zinc-500" />
            <span className="text-[10px] font-medium text-zinc-500">View details</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default function OverviewCommandCenter({
  selectedSiteLabel,
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
  onOpenLiveDrawer,
  onExportReport,
}: OverviewCommandCenterProps) {
  const overviewData = useMemo(() => {
    const alerts = computeAlerts(seoData, analyticsData);
    const opportunities = computeOpportunities(seoData);
    const queries: SeoQuery[] = seoData?.queries || [];
    const pages: SeoPage[] = seoData?.pages || [];
    const topPages: TopPageItem[] = [...pages]
      .sort((a, b) => (parseInt(String(b.clicks || 0), 10) || 0) - (parseInt(String(a.clicks || 0), 10) || 0))
      .slice(0, 10)
      .map((page) => ({
        page: (page.page || '').replace(/^https?:\/\/[^/]+/, '').substring(0, 42) || '/',
        clicks: parseInt(String(page.clicks || 0), 10) || 0,
        impressions: parseInt(String(page.impressions || 0), 10) || 0,
        position: (parseFloat(String(page.position || 0)) || 0).toFixed(1),
      }));

    const ctrProblems = queries
      .filter((query) => {
        const position = parseFloat(String(query.position || 0));
        const ctr = parseFloat(String(query.ctr || 0));
        const impressions = parseInt(String(query.impressions || 0), 10);
        const expected = position <= 1 ? 28 : position <= 2 ? 16 : position <= 3 ? 11 : position <= 5 ? 7.5 : position <= 7 ? 4.5 : position <= 10 ? 2.5 : 1;
        return position <= 10 && impressions > 100 && ctr < expected * 0.5;
      })
      .slice(0, 4)
      .map((query) => {
        const position = parseFloat(String(query.position || 0)) || 0;
        const ctr = parseFloat(String(query.ctr || 0)) || 0;
        const impressions = parseInt(String(query.impressions || 0), 10) || 0;
        const expected = position <= 1 ? 28 : position <= 2 ? 16 : position <= 3 ? 11 : position <= 5 ? 7.5 : position <= 7 ? 4.5 : position <= 10 ? 2.5 : 1;
        return {
          query: query.query,
          position: position.toFixed(1),
          impressions,
          actualCTR: ctr,
          expectedCTR: expected,
          gap: Math.max(0, expected - ctr),
        };
      });

    const strikingDistance = opportunities.filter((item) => item.type === 'striking_distance').slice(0, 5);
    const quickWins = opportunities.filter((item) => item.type === 'quick_win' || item.type === 'ctr_fix').slice(0, 5);
    const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;
    const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;
    const opportunityCount = opportunities.length;
    const userChange = analyticsKPIs?.changeUsers || 0;
    const clickChange = seoKPIs?.changeClicks || 0;
    const positionValue = parseFloat(String(seoKPIs?.avgPosition || 0)) || 0;
    const healthScore = clamp(
      84 + (clickChange > 0 ? Math.min(clickChange, 12) : Math.max(clickChange, -16)) +
      (userChange > 0 ? Math.min(userChange, 10) : Math.max(userChange, -12)) -
      criticalCount * 12 -
      warningCount * 5,
      24,
      98,
    );

    // ─── Priority Queue (Enhancement 3: smarter ordering) ───
    const queue: PriorityQueueItem[] = [];

    // P1 candidate: critical traffic alert takes precedence
    const criticalTrafficAlert = alerts.find((a) => a.severity === 'critical' && a.category === 'traffic');
    if (criticalTrafficAlert) {
      queue.push({
        priority: 'P1',
        title: criticalTrafficAlert.title,
        detail: criticalTrafficAlert.description,
        impact: criticalTrafficAlert.metric || 'Needs attention',
        href: '/dashboard/analytics',
        actionLabel: 'Open analytics',
        tone: 'red',
      });
    }

    // CTR optimization (renamed from "Fix titles")
    if (ctrProblems.length > 0) {
      const impact = quickWins.slice(0, 2).reduce((sum, item) => sum + item.potentialClicks, 0);
      queue.push({
        priority: `P${queue.length + 1}`,
        title: `Optimize CTR on ${Math.min(ctrProblems.length, 3)} high-impression quer${ctrProblems.length === 1 ? 'y' : 'ies'}`,
        detail: `${ctrProblems[0].query} is ${ctrProblems[0].gap.toFixed(1)} points below expected CTR at position ${ctrProblems[0].position}.`,
        impact: `+${fmtCompact(impact || ctrProblems[0].impressions)} clicks`,
        href: '/dashboard/seo',
        actionLabel: 'Optimize CTR',
        tone: 'emerald',
      });
    }

    if (strikingDistance.length > 0) {
      const totalPotential = strikingDistance.slice(0, 4).reduce((sum, item) => sum + item.potentialClicks, 0);
      queue.push({
        priority: `P${queue.length + 1}`,
        title: `Push ${strikingDistance.length} striking-distance keywords toward page 1`,
        detail: `${strikingDistance[0].query} is sitting at position ${strikingDistance[0].position.toFixed(1)} with room to gain.`,
        impact: `+${fmtCompact(totalPotential)} clicks`,
        href: '/dashboard/seo',
        actionLabel: 'Review keywords',
        tone: 'cyan',
      });
    }

    // Non-traffic risks (traffic critical already handled above)
    const remainingRisk = alerts.find((a) => (a.severity === 'critical' || a.severity === 'warning') && !(a.severity === 'critical' && a.category === 'traffic'));
    if (remainingRisk) {
      queue.push({
        priority: `P${queue.length + 1}`,
        title: remainingRisk.title,
        detail: remainingRisk.description,
        impact: remainingRisk.metric || 'Needs attention',
        href: remainingRisk.category === 'traffic' ? '/dashboard/analytics' : remainingRisk.category === 'content' ? '/dashboard/audit' : '/dashboard/seo',
        actionLabel: remainingRisk.category === 'traffic' ? 'Open analytics' : remainingRisk.category === 'content' ? 'Run audit' : 'Open report',
        tone: remainingRisk.severity === 'critical' ? 'red' : 'amber',
      });
    }

    if (topPages.length > 0) {
      queue.push({
        priority: `P${queue.length + 1}`,
        title: 'Route authority from your strongest pages into lagging opportunities',
        detail: `${topPages[0].page} is already pulling ${fmtCompact(topPages[0].clicks)} clicks and can pass internal-link equity.`,
        impact: `${fmtCompact(topPages[0].clicks)} clicks`,
        href: '/dashboard/analytics',
        actionLabel: 'Boost authority',
        tone: 'amber',
      });
    }

    const priorityQueue = queue.slice(0, 4).map((item, index) => ({
      ...item,
      priority: `P${index + 1}`,
    }));

    const movers: MoverItem[] = [];
    strikingDistance.slice(0, 2).forEach((item) => {
      movers.push({
        label: item.query || 'Untitled keyword',
        detail: `Position ${item.position.toFixed(1)} with ${fmtCompact(item.impressions)} impressions`,
        delta: `+${fmtCompact(item.potentialClicks)} clicks`,
        tone: 'positive',
      });
    });
    if (ctrProblems[0]) {
      movers.push({
        label: ctrProblems[0].query || 'CTR watch item',
        detail: `CTR ${ctrProblems[0].actualCTR.toFixed(1)}% vs ${ctrProblems[0].expectedCTR.toFixed(1)}% expected`,
        delta: `watch -${ctrProblems[0].gap.toFixed(1)} pts`,
        tone: 'watch',
      });
    }

    const headline = criticalCount > 0
      ? 'Growth is under pressure, and the next actions need to be obvious.'
      : clickChange > 10 || userChange > 8
        ? 'You have growth momentum, but the next actions still need to stay obvious.'
        : clickChange < -5 || userChange < -5
          ? 'Performance softened, but the next fixes are concentrated.'
          : 'Performance is stable, and the next opportunities are concentrated.';

    const summary = criticalCount > 0
      ? `For ${selectedSiteLabel || 'this site'}, a few issues are doing most of the damage. Put the top queue item in motion first, then clear the next ranking or content risk.`
      : `For ${selectedSiteLabel || 'this site'}, the main job of the overview is to surface the next best actions without making you scan ten equal-weight widgets.`;

    const brief = priorityQueue.length > 0
      ? `Traffic is ${clickChange >= 0 ? 'holding or improving' : 'softening'}, and the highest-leverage work is concentrated. Start with ${priorityQueue[0].actionLabel.toLowerCase()}, then move straight into the next queue item instead of digging through separate reports.`
      : 'Traffic is relatively stable. Keep the overview focused on one decisive next action, then use the lower proof panels to validate momentum.';

    const supportMetric = clickChange !== 0
      ? `${fmtSigned(clickChange)} search clicks`
      : `${fmtCompact(seoKPIs?.totalClicks || 0)} clicks`;

    return {
      healthScore,
      headline,
      summary,
      brief,
      priorityQueue,
      movers: movers.slice(0, 3),
      quickWinsCount: quickWins.length,
      opportunityCount,
      riskCount: criticalCount + warningCount,
      supportMetric,
      topPages,
      clickChange,
      positionValue,
    };
  }, [analyticsData, analyticsKPIs, selectedSiteLabel, seoData, seoKPIs]);

  const trafficSeries = useMemo(() => (trafficData || []).slice(-12).map((point) => point.activeUsers || point.pageViews || 0), [trafficData]);
  const clickSeries = useMemo(() => (searchTrend || []).slice(-12).map((point) => point.clicks || 0), [searchTrend]);
  const impressionSeries = useMemo(() => (searchTrend || []).slice(-12).map((point) => point.impressions || 0), [searchTrend]);

  // Mobile carousel refs
  const metricCarouselRef = useRef<HTMLDivElement>(null);
  const metricActiveIndex = useCarouselIndex(metricCarouselRef);

  // Enhancement 6: Top Pages expand state
  const [showAllPages, setShowAllPages] = useState(false);
  const togglePages = useCallback(() => setShowAllPages((v) => !v), []);

  if (!hasData || isLoading || !overviewData) {
    return <OverviewSkeleton />;
  }

  const primaryAction = overviewData.priorityQueue[0];
  const healthColor = overviewData.healthScore > 75 ? '#34d399' : overviewData.healthScore >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative space-y-8 overflow-hidden bg-[#010203]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.09),transparent_58%)]" />
      <div className="pointer-events-none absolute right-0 top-0 h-56 w-80 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_62%)]" />

      {/* ═══ Mission Control + Live Pulse ═══ */}
      <div
        className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_420px]"
      >
        <div className="group/mc border border-white/[0.08] bg-[#020508] shadow-[0_22px_60px_rgba(0,0,0,0.35)] transition-shadow duration-300 hover:shadow-[0_22px_60px_rgba(0,0,0,0.35),0_0_24px_rgba(52,211,153,0.05)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <div className="inline-flex border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 transition-colors duration-300 group-hover/mc:text-emerald-200">
                Mission Control
              </div>
              <div className="space-y-3">
                {/* Enhancement 8: Improved typography */}
                <h2 className="max-w-4xl text-[1.5rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-white sm:text-[2rem] lg:text-[2.35rem]">
                  {overviewData.headline}
                </h2>
                <p className="hidden max-w-4xl text-sm leading-6 text-zinc-300 sm:block sm:text-[15px]">
                  {overviewData.summary}
                </p>
                {/* Mobile: 1-sentence compact summary */}
                <p className="text-[13px] leading-5 text-zinc-400 sm:hidden">
                  {overviewData.summary.split('.')[0]}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={primaryAction?.href || '/dashboard/analytics'}
                   className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#34e1a3_0%,#1eb8f6_100%)] px-4 py-2.5 text-sm font-semibold text-[#041015] transition-all duration-200 hover:opacity-90 hover:translate-y-[-1px] hover:shadow-[0_4px_12px_rgba(52,211,153,0.2)]"
                >
                  {primaryAction?.actionLabel || 'Open analytics'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={onExportReport}
                  className="inline-flex items-center gap-2 border border-white/[0.1] bg-[#070c10] px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/[0.18] hover:bg-white/[0.04]"
                >
                  Export report
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Link href="/dashboard/seo" className="border border-white/[0.08] bg-[#070c10] px-3 py-1.5 text-zinc-300 transition-all duration-200 hover:border-emerald-500/20 hover:bg-emerald-500/[0.04] hover:text-zinc-200 hover:shadow-[0_0_12px_rgba(52,211,153,0.06)]">
                  {overviewData.quickWinsCount} quick wins ready
                </Link>
                <Link href="/dashboard/seo" className="border border-white/[0.08] bg-[#070c10] px-3 py-1.5 text-zinc-300 transition-all duration-200 hover:border-cyan-500/20 hover:bg-cyan-500/[0.04] hover:text-zinc-200 hover:shadow-[0_0_12px_rgba(34,211,238,0.06)]">
                  {overviewData.opportunityCount} opportunities ranked
                </Link>
                <Link href="/dashboard/seo" className="border border-white/[0.08] bg-[#070c10] px-3 py-1.5 text-zinc-300 transition-all duration-200 hover:border-amber-500/20 hover:bg-amber-500/[0.04] hover:text-zinc-200 hover:shadow-[0_0_12px_rgba(251,191,36,0.06)]">
                  {overviewData.riskCount} active risks
                </Link>
                <div className="border border-white/[0.08] bg-[#070c10] px-3 py-1.5 text-zinc-300 transition-colors duration-200 hover:text-zinc-200" title={lastUpdated ? new Date(lastUpdated).toLocaleString() : undefined}>
                  Synced {timeAgo(lastUpdated)}
                </div>
              </div>
            </div>

            {/* Enhancement 1: Interactive chart replacing static sparkline */}
             <div className="border border-white/[0.08] bg-[#05090d] p-4 transition-colors duration-200 hover:border-white/[0.14]">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Next 7 days</div>
                <div className="text-sm font-semibold text-emerald-300">{overviewData.supportMetric}</div>
              </div>
              <div className="mt-3">
                <InteractiveChart
                  primaryData={clickSeries.length > 0 ? clickSeries : trafficSeries}
                  secondaryData={impressionSeries.length > 0 ? impressionSeries : undefined}
                  primaryLabel="Search clicks"
                  secondaryLabel="Impressions"
                  primaryColor="#29E1A3"
                  secondaryColor="#1FC2FF"
                  height={110}
                  chartId="mission-control"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Live Pulse — Enhancement 4: polished ═══ */}
        <div className="group/lp border border-white/[0.08] bg-[#020508] shadow-[0_22px_60px_rgba(0,0,0,0.35)] transition-shadow duration-300 hover:shadow-[0_22px_60px_rgba(0,0,0,0.35),0_0_24px_rgba(52,211,153,0.05)]">
          <div className="p-6">
            <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition-colors duration-300 group-hover/lp:text-zinc-200">
              Live Pulse
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_108px] xl:grid-cols-[minmax(0,1fr)_108px]">
              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline gap-2">
                    <div className={`font-mono text-5xl font-semibold tracking-tight text-white transition-transform duration-200 group-hover/lp:scale-[1.02] ${activeUsers && activeUsers > 0 ? 'live-pulse-glow' : ''}`}>
                      {activeUsers ?? 0}
                    </div>
                    {activeUsers !== null && activeUsers > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium text-zinc-300">active users right now</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Last updated {timeAgo(lastUpdated)}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Link
                    href="/dashboard"
                    className={`flex items-center gap-2 border px-3 py-2.5 text-[12px] font-medium transition-all duration-200 ${isLive ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/[0.12] hover:shadow-[0_0_12px_rgba(52,211,153,0.06)]' : 'border-white/[0.08] bg-[#070c10] text-zinc-300 hover:border-white/[0.14] hover:bg-white/[0.03]'}`}
                  >
                    <Bot className="h-4 w-4 shrink-0" />
                    <span>{isLive ? 'Bot live' : 'Bot offline'}</span>
                  </Link>
                  <Link
                    href="/dashboard/seo"
                    className={`flex items-center gap-2 border px-3 py-2.5 text-[12px] font-medium transition-all duration-200 ${overviewData.riskCount > 0 ? 'border-amber-500/25 bg-amber-500/[0.08] text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/[0.12] hover:shadow-[0_0_12px_rgba(251,191,36,0.06)]' : 'border-white/[0.08] bg-[#070c10] text-zinc-300 hover:border-white/[0.14] hover:bg-white/[0.03]'}`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{overviewData.riskCount} risks</span>
                  </Link>
                  <button
                    type="button"
                    onClick={onOpenLiveDrawer}
                    className="flex items-center gap-2 border border-cyan-500/25 bg-cyan-500/[0.08] px-3 py-2.5 text-left text-[12px] font-medium text-cyan-300 transition-all duration-200 hover:border-cyan-500/40 hover:bg-cyan-500/[0.12] hover:shadow-[0_0_12px_rgba(34,211,238,0.06)]"
                  >
                    <Activity className="h-4 w-4 shrink-0" />
                    <span>Live view</span>
                  </button>
                </div>
              </div>

              {/* Health gauge with breathing glow */}
              <div className="group/hg flex items-center justify-center border border-white/[0.08] bg-[#05090d] p-2 transition-all duration-300 hover:border-white/[0.14]">
                  <div className="relative flex flex-col items-center justify-center">
                    <div className="relative flex h-[84px] w-[84px] items-center justify-center transition-transform duration-300 group-hover/hg:scale-105">
                    <svg
                      className="health-ring-breathe h-full w-full -rotate-90"
                      viewBox="0 0 84 84"
                      aria-label={`Health score: ${overviewData.healthScore}`}
                      style={{ '--health-glow': `${healthColor}50`, '--health-glow-dim': `${healthColor}20` } as React.CSSProperties}
                    >
                      <circle cx="42" cy="42" r="34" fill="none" stroke="#132028" strokeWidth="8" />
                      <circle
                        cx="42" cy="42" r="34" fill="none"
                        stroke={healthColor}
                        strokeWidth="8"
                        strokeLinecap="butt"
                        strokeDasharray={`${(overviewData.healthScore / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="font-mono text-2xl font-semibold text-white">{overviewData.healthScore}</div>
                      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                        <span className="text-zinc-600">/100</span> health
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 max-w-[108px] text-center text-[9px] leading-tight text-zinc-600 opacity-0 transition-opacity duration-300 group-hover/hg:opacity-100">
                    Crawl, indexing &amp; performance
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider label="Key Metrics" />

      {/* ═══ Metric Cards — Enhancement 2: hover tooltips + Enhancement 9: stagger animation ═══ */}
      <div
        className="relative"
      >
        {/* Gradient edge fades for mobile carousel */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-[#010203] to-transparent lg:hidden" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-[#010203] to-transparent lg:hidden" />
        <div
          ref={metricCarouselRef}
          className="flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:px-0"
        >
          <div className="w-[82vw] shrink-0 snap-center sm:w-[44vw] lg:w-auto">
            <MetricCard
              href="/dashboard/analytics"
              icon={Users}
              label="Total Users"
              value={fmtCompact(analyticsKPIs?.totalUsers)}
              change={analyticsKPIs?.changeUsers}
              caption={analyticsKPIs?.changeUsers !== undefined ? (analyticsKPIs.changeUsers >= 0 ? `Users up ${fmtSigned(analyticsKPIs.changeUsers)} — growth is on track.` : `Users down ${fmtSigned(analyticsKPIs.changeUsers)} — review traffic sources.`) : 'Awaiting enough data to show a trend.'}
              statusLine={activeUsers !== null ? `${activeUsers} active right now` : undefined}
              values={trafficSeries}
              stroke="#29E1A3"
            />
          </div>
          <div className="w-[82vw] shrink-0 snap-center sm:w-[44vw] lg:w-auto">
            <MetricCard
              href="/dashboard/analytics"
              icon={Eye}
              label="Page Views"
              value={fmtCompact(analyticsKPIs?.totalPageViews)}
              change={analyticsKPIs?.changePageViews}
              caption={analyticsKPIs?.changePageViews !== undefined ? (analyticsKPIs.changePageViews >= 0 ? `Page views up ${fmtSigned(analyticsKPIs.changePageViews)} — deeper engagement detected.` : `Page views dropped ${fmtSigned(analyticsKPIs.changePageViews)} — check top landing pages.`) : 'Awaiting enough data to show a trend.'}
              values={(trafficData || []).slice(-12).map((point) => point.pageViews || 0)}
              stroke="#1FC2FF"
            />
          </div>
          <div className="w-[82vw] shrink-0 snap-center sm:w-[44vw] lg:w-auto">
            <MetricCard
              href="/dashboard/seo"
              icon={MousePointer}
              label="Search Clicks"
              value={fmtCompact(seoKPIs?.totalClicks)}
              change={seoKPIs?.changeClicks}
              caption={seoKPIs?.changeClicks !== undefined ? (seoKPIs.changeClicks >= 0 ? `Clicks up ${fmtSigned(seoKPIs.changeClicks)} — title and meta improvements are working.` : `Clicks down ${fmtSigned(seoKPIs.changeClicks)} — review title tags next.`) : 'Awaiting enough data to show a trend.'}
              statusLine={seoKPIs?.totalImpressions ? `${(((seoKPIs.totalClicks || 0) / Math.max(seoKPIs.totalImpressions, 1)) * 100).toFixed(1)}% average CTR` : undefined}
              values={clickSeries}
              stroke="#938CFF"
            />
          </div>
          <div className="w-[82vw] shrink-0 snap-center sm:w-[44vw] lg:w-auto">
            <MetricCard
              href="/dashboard/seo"
              icon={Hash}
              label="Avg. Position"
              value={fmtCompact(seoKPIs?.avgPosition)}
              change={seoKPIs?.changePosition}
              changeInvert
              caption={seoKPIs?.changePosition !== undefined ? (seoKPIs.changePosition <= 0 ? `Position improved by ${Math.abs(seoKPIs.changePosition).toFixed(1)} spots.` : `Position slipped ${seoKPIs.changePosition.toFixed(1)} spots — check page-two keywords.`) : 'Awaiting enough data to show a trend.'}
              statusLine={overviewData.positionValue ? `Page ${Math.max(1, Math.ceil(overviewData.positionValue / 10))} average visibility` : undefined}
              values={(searchTrend || []).slice(-12).map((point) => point.position || 0)}
              stroke="#FFB94E"
            />
          </div>
        </div>
        <CarouselDots count={4} active={metricActiveIndex} />
      </div>

      <SectionDivider label="Actions & Intelligence" />

      {/* ═══ Priority Queue + Summary + Top Movers ═══ */}
      <div
        className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_420px]"
      >
        <div className="group/pq border border-white/[0.08] bg-[#020508] shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(52,211,153,0.05)]">
          <div className="p-6">
            <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition-colors duration-300 group-hover/pq:text-zinc-200">
              Priority Queue
            </div>
            <div className="mt-5 max-w-3xl">
              {/* Enhancement 8: Improved typography */}
              <h3 className="text-[1.65rem] font-extrabold tracking-[-0.02em] text-white">
                Your highest-impact actions, ranked by potential gain.
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Alerts and opportunities ordered by urgency. Start from the top.
              </p>
            </div>

            {/* Desktop: table layout */}
            <div className="mt-6 hidden overflow-hidden rounded-lg border border-white/[0.08] lg:block">
              <div className="grid grid-cols-[80px_minmax(0,1fr)_180px_110px] gap-4 bg-[#0a1018] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                <div>Priority</div>
                <div>Recommendation</div>
                <div>Impact</div>
                <div>Action</div>
              </div>
              {overviewData.priorityQueue.map((item, idx) => {
                const tone = toneStyles(item.tone);
                return (
                  <div
                    key={item.priority + item.title}
                    className={`grid grid-cols-[80px_minmax(0,1fr)_180px_110px] gap-4 border-l-[3px] border-t border-t-white/[0.06] px-4 py-4 transition-all duration-200 first:border-t-0 hover:bg-white/[0.03] hover:shadow-[inset_3px_0_8px_-4px_rgba(52,211,153,0.08)] ${tone.accent} ${idx % 2 === 0 ? 'bg-[#060b0f]' : 'bg-[#070c10]'}`}
                  >
                    <div className="pt-1">
                      <div className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}>
                        {item.priority}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-white">{item.title}</div>
                      <div className="text-[12px] leading-5 text-zinc-400">{item.detail}</div>
                    </div>
                    <div className={`flex items-start gap-2 pt-1.5 text-[12px] font-medium ${tone.impact}`}>
                      <span className={`mt-[5px] inline-block h-[7px] w-[7px] shrink-0 rounded-full ${tone.dot}`} />
                      {item.impact}
                    </div>
                    <div className="pt-1">
                      <Link
                        href={item.href}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${tone.button}`}
                      >
                        {item.actionLabel}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile: swipeable action cards */}
            <div className="mt-5 space-y-3 lg:hidden">
              {overviewData.priorityQueue.map((item) => {
                const tone = toneStyles(item.tone);
                return (
                  <Link
                    key={item.priority + item.title}
                    href={item.href}
                    className={`block rounded-lg border border-white/[0.08] border-l-[4px] ${tone.accent} bg-[#070c10] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-transform active:scale-[0.98]`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        {item.priority}
                      </div>
                      <div className={`flex items-center gap-1.5 text-[11px] font-medium ${tone.impact}`}>
                        <span className={`inline-block h-[6px] w-[6px] rounded-full ${tone.dot}`} />
                        {item.impact}
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">{item.title}</div>
                    <div className="mt-1 text-[12px] leading-5 text-zinc-400">{item.detail}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${tone.impact}`}>
                        {item.actionLabel}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="group/sum border border-white/[0.08] bg-[#020508] shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(139,92,246,0.05)]">
            <div className="p-6">
              <div className="inline-flex border border-violet-500/25 bg-violet-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200 transition-colors duration-300 group-hover/sum:text-violet-100">
                Summary
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="brain-pulse flex h-11 w-11 items-center justify-center border border-white/[0.08] bg-[#05090d] text-zinc-200 transition-transform duration-200 group-hover/sum:scale-110">
                  <Brain className="h-5 w-5" />
                </div>
                <div className="text-sm text-zinc-300">
                  {overviewData.priorityQueue.length > 0
                    ? `Focus on "${overviewData.priorityQueue[0].title.toLowerCase()}" first for the biggest impact.`
                    : 'All clear — no urgent actions right now.'}
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                {overviewData.brief}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {overviewData.priorityQueue.slice(0, 3).map((item) => (
                  <Link
                    key={item.priority + item.actionLabel}
                    href={item.href}
                    className="border border-white/[0.08] bg-[#070c10] px-3 py-2 text-[11px] text-zinc-200 transition-all duration-200 hover:border-violet-500/20 hover:bg-violet-500/[0.04] hover:shadow-[0_0_12px_rgba(139,92,246,0.05)]"
                  >
                    {item.actionLabel}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ═══ Top Movers — Enhancement 5: accent borders, trend icons ═══ */}
          <div className="group/tm border border-white/[0.08] bg-[#020508] shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(34,211,238,0.05)]">
            <div className="p-6">
              <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition-colors duration-300 group-hover/tm:text-zinc-200">
                Top Movers
              </div>
              <div className="mt-4 space-y-3">
                {overviewData.movers.length > 0 ? (
                  overviewData.movers.map((item) => {
                    const isPositive = item.tone === 'positive';
                    const borderAccent = isPositive ? 'border-l-emerald-500' : 'border-l-amber-500';
                    return (
                      <Link
                        key={item.label}
                        href="/dashboard/seo"
                        className={`group/mv block border border-white/[0.06] border-l-[3px] ${borderAccent} bg-[#060b0f] px-4 py-3 transition-all duration-200 hover:border-white/[0.12] hover:bg-[#0a0f14] hover:shadow-[0_0_14px_rgba(34,211,238,0.04)]`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-transform duration-200 group-hover/mv:scale-110 ${isPositive ? 'bg-emerald-500/[0.1]' : 'bg-amber-500/[0.1]'}`}>
                              {isPositive
                                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                                : <TrendingDown className="h-3.5 w-3.5 text-amber-400" />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{item.label}</div>
                              <div className="mt-0.5 text-[12px] text-zinc-400">{item.detail}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${isPositive ? 'bg-emerald-500/[0.1] text-emerald-300' : 'bg-amber-500/[0.1] text-amber-300'}`}>
                              {item.delta}
                            </div>
                            <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600 opacity-0 transition-all duration-200 group-hover/mv:translate-x-0.5 group-hover/mv:opacity-100" />
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="border border-white/[0.06] bg-[#060b0f] px-4 py-5 text-sm text-zinc-400">
                    Movers will populate once more ranking data settles in.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider label="Performance Proof" />

      {/* ═══ Traffic Trend + Top Pages ═══ */}
      <div
        className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
      >
        {/* Enhancement 1: Interactive Traffic Trend chart */}
        <div className="group/tt border border-white/[0.08] bg-[#020508] shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(52,211,153,0.05)]">
          <div className="p-6">
            <div className="inline-flex border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 transition-colors duration-300 group-hover/tt:text-emerald-200">
              Traffic Trend
            </div>
            <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm text-zinc-300">{overviewData.clickChange > 5 ? 'Traffic is climbing steadily — recent optimizations are paying off.' : overviewData.clickChange >= 0 ? 'Traffic is holding steady. Look for the next optimization lever.' : 'Traffic has softened recently. Prioritize the top queue actions to recover.'}</div>
                <div className="mt-3 flex items-end gap-3">
                  <div className="font-mono text-[30px] font-semibold text-white">{overviewData.supportMetric}</div>
                  <div className={`mb-1 flex items-center gap-1 text-[12px] ${overviewData.clickChange >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {overviewData.clickChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    momentum
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-[360px]">
                <div className="border border-white/[0.06] bg-[#04080b] p-3 transition-colors duration-200 hover:border-white/[0.12]">
                  <InteractiveChart
                    primaryData={clickSeries.length > 0 ? clickSeries : trafficSeries}
                    secondaryData={trafficSeries.length > 0 ? trafficSeries : undefined}
                    primaryLabel="Clicks"
                    secondaryLabel="Sessions"
                    primaryColor="#29E1A3"
                    secondaryColor="#1FC2FF"
                    height={84}
                    chartId="traffic-trend"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Top Pages — Enhancement 6: Load more ═══ */}
        <div className="group/tp border border-white/[0.08] bg-[#020508] shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(34,211,238,0.05)]">
          <div className="p-6">
            <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition-colors duration-300 group-hover/tp:text-zinc-200">
              Top Pages
            </div>
            <div className="mt-4 space-y-4">
              {overviewData.topPages.length > 0 ? (
                <>
                  {overviewData.topPages.slice(0, showAllPages ? 10 : 3).map((page) => {
                    const maxClicks = Math.max(...overviewData.topPages.map((item) => item.clicks), 1);
                    const barWidth = `${Math.max(12, Math.round((page.clicks / maxClicks) * 100))}%`;

                    return (
                      <div key={page.page} className="group/pg space-y-2 rounded-md px-3 py-2 -mx-3 transition-all duration-200 hover:bg-white/[0.02] hover:shadow-[0_0_12px_rgba(34,211,238,0.03)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-sm text-zinc-200 transition-colors duration-200 group-hover/pg:text-white">{page.page}</div>
                          <div className="shrink-0 text-[11px] text-zinc-500 transition-colors duration-200 group-hover/pg:text-zinc-400">
                            {fmtCompact(page.clicks)} clicks
                          </div>
                        </div>
                        <div className="h-2 bg-[#0a0f14] rounded-sm overflow-hidden">
                          <div className="h-full bg-[linear-gradient(135deg,#34e1a3_0%,#1eb8f6_100%)] transition-all duration-500 group-hover/pg:brightness-110" style={{ width: barWidth }} />
                        </div>
                        <div className="text-[11px] text-zinc-500">Position {page.position} with {fmtCompact(page.impressions)} impressions</div>
                      </div>
                    );
                  })}
                  {overviewData.topPages.length > 3 && (
                    <button
                      type="button"
                      onClick={togglePages}
                      className="flex w-full items-center justify-center gap-1.5 border border-white/[0.06] bg-[#060b0f] py-2.5 text-[11px] font-medium text-zinc-400 transition-all duration-200 hover:border-white/[0.12] hover:bg-[#0a0f14] hover:text-zinc-300 hover:shadow-[0_0_12px_rgba(34,211,238,0.04)]"
                    >
                      {showAllPages ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {showAllPages ? 'Show less' : `Show ${Math.min(overviewData.topPages.length - 3, 7)} more`}
                    </button>
                  )}
                </>
              ) : (
                <div className="border border-white/[0.06] bg-[#060b0f] px-4 py-5 text-sm text-zinc-400">
                  Page performance will appear after the next sync.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
