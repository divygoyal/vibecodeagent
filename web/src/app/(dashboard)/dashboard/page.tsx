'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, ResponsiveContainer
} from 'recharts';
import {
  Bot, BarChart3, Search, GitBranch, TrendingUp, TrendingDown,
  ArrowUpRight, Zap, Activity, MousePointer, Eye, Users, Hash,
  AlertTriangle, Lightbulb, Globe, ChevronDown
} from 'lucide-react';
import { useContainerStatus, useGitHubData, useAnalyticsData, useSeoData, useSiteList, usePropertyList } from '@/lib/useDashboardData';

/* ─── helpers ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Simple Skeleton Component
function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function DashboardOverview() {
  const { data: session } = useSession();

  // 1. Fetch Lists
  const { sites, isLoading: sitesLoading } = useSiteList();
  const { properties } = usePropertyList();

  // State for selection
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string>('');

  // Auto-select first site when loaded
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteUrl) {
      setSelectedSiteUrl(sites[0].siteUrl);
    }
  }, [sites, selectedSiteUrl]);

  // Derived Property ID
  const domain = selectedSiteUrl.replace('sc-domain:', '').replace('https://', '').replace('/', '');
  const matchedProp = properties.find(p =>
    p.displayName.toLowerCase().includes(domain.split('.')[0])
  ) || properties[0]; // Fallback to first

  // 2. Fetch Data (Dependent on selection)
  const { botStatus } = useContainerStatus();
  const { commits, isLoading: ghLoading } = useGitHubData();

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData('all', matchedProp?.property);
  const { data: seoData, isLoading: seoLoading } = useSeoData('all', selectedSiteUrl);

  // Extract Data
  const analyticsKPIs = analyticsData?.kpis;
  const trafficData = Array.isArray(analyticsData?.traffic) ? analyticsData.traffic : [];

  const seoKPIs = seoData?.kpis;
  const searchTrend = Array.isArray(seoData?.trend) ? seoData.trend : [];
  const recommendations = (Array.isArray(seoData?.recommendations) ? seoData.recommendations : []).slice(0, 3);

  const isLive = botStatus?.status === 'running' && botStatus?.telegramStatus === 'connected';

  // Loading States
  const isInit = sitesLoading && !selectedSiteUrl;
  const isRef = analyticsLoading || seoLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header & Site Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-zinc-500">
            Growth overview for your projects.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Site Selector */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <Globe className="w-4 h-4" />
            </div>
            <select
              value={selectedSiteUrl}
              onChange={(e) => setSelectedSiteUrl(e.target.value)}
              disabled={isInit}
              className="appearance-none bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg pl-9 pr-10 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none min-w-[220px]"
            >
              {isInit ? (
                <option>Loading sites...</option>
              ) : sites.length > 0 ? (
                sites.map((site: any) => (
                  <option key={site.siteUrl} value={site.siteUrl}>{site.siteUrl.replace('sc-domain:', '')}</option>
                ))
              ) : (
                <option value="">No sites found</option>
              )}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isLive ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            {isLive ? 'Bot Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          loading={isRef}
          icon={Users}
          label="Total Users"
          value={analyticsKPIs?.totalUsers}
          change={analyticsKPIs?.changeUsers}
          sparkData={trafficData.map((d: any) => ({ v: d.activeUsers }))}
          sparkColor="#34d399"
          href="/dashboard/analytics"
        />
        <KPICard
          loading={isRef}
          icon={Eye}
          label="Page Views"
          value={analyticsKPIs?.totalPageViews}
          change={analyticsKPIs?.changePageViews}
          sparkData={trafficData.map((d: any) => ({ v: d.pageViews }))}
          sparkColor="#22d3ee"
          href="/dashboard/analytics"
        />
        <KPICard
          loading={isRef}
          icon={MousePointer}
          label="Search Clicks"
          value={seoKPIs?.totalClicks}
          change={seoKPIs?.changeClicks}
          sparkData={searchTrend.map((d: any) => ({ v: d.clicks }))}
          sparkColor="#a78bfa"
          href="/dashboard/seo"
        />
        <KPICard
          loading={isRef}
          icon={Hash}
          label="Avg. Position"
          value={seoKPIs?.avgPosition}
          change={seoKPIs?.changePosition}
          invertChange
          sparkData={searchTrend.map((d: any) => ({ v: d.position }))}
          sparkColor="#fbbf24"
          href="/dashboard/seo"
        />
      </div>

      {/* Two-column: Activity + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent Commits */}
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-500" />
              Recent Commits
            </h2>
            <Link href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">
              View All
            </Link>
          </div>

          <div className="space-y-2 flex-1">
            {ghLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : commits.length > 0 ? (
              commits.map((commit: any, i: number) => (
                <div key={`${commit.sha}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-mono text-[10px]">
                    {commit.sha}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">{commit.message}</p>
                    <p className="text-[10px] text-zinc-600">{timeAgo(commit.date)} • {commit.branch}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-8 text-zinc-500">
                <p className="text-sm">No activity found</p>
              </div>
            )}
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              AI Insights
            </h2>
            <Link href="/dashboard/seo" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Optimize →
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {isRef ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : recommendations.length > 0 ? (
              recommendations.map((rec: any) => (
                <div key={rec.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white">{rec.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rec.severity === 'high' ? 'bg-red-500/10 text-red-400' :
                      rec.severity === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>
                      {rec.impact}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2">{rec.description}</p>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-8 text-zinc-500">
                <p className="text-sm">No critical insights</p>
                <p className="text-xs mt-1">Check back after more data arrives</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ActionCard
          href="/dashboard/bot"
          icon={Bot}
          title="Bot Setup"
          description="Configure Telegram"
          color="emerald"
        />
        <ActionCard
          href="/dashboard/analytics"
          icon={BarChart3}
          title="Analytics"
          description="Traffic & Sources"
          color="cyan"
        />
        <ActionCard
          href="/dashboard/seo"
          icon={Search}
          title="SEO Assistant"
          description="Keywords & Rankings"
          color="violet"
        />
      </div>
    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({
  icon: Icon, label, value, change, invertChange, sparkData, sparkColor, href, loading
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
  change?: number;
  invertChange?: boolean;
  sparkData: { v: number }[];
  sparkColor: string;
  href: string;
  loading: boolean;
}) {
  const positive = change !== undefined ? (invertChange ? change <= 0 : change >= 0) : true;
  const showValue = value !== undefined && value !== null;

  return (
    <Link href={href} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all group relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 bg-zinc-900/50 backdrop-blur-[1px] flex flex-col justify-between p-4">
          <div className="flex justify-between">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-12 h-4 rounded-full" />
          </div>
          <Skeleton className="w-24 h-8 rounded-md my-2" />
          <Skeleton className="w-16 h-3 rounded-md" />
          <div className="h-8 w-full mt-auto opacity-20">
            <Skeleton className="w-full h-full" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-white/[0.08] transition-colors">
          <Icon className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
        </div>
        {!loading && change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>

      <div className="text-xl font-bold text-white mb-0.5 font-mono">
        {showValue ? value?.toLocaleString() : '—'}
      </div>
      <div className="text-[10px] text-zinc-500 mb-2 font-medium tracking-wide uppercase">{label}</div>

      {sparkData.length > 0 && !loading && (
        <div className="h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparkColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={sparkColor} fill={`url(#spark-${label})`} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Link>
  );
}

function ActionCard({
  href, icon: Icon, title, description, color
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}) {
  const iconColor: Record<string, string> = {
    emerald: 'from-emerald-400 to-emerald-600',
    cyan: 'from-cyan-400 to-blue-500',
    violet: 'from-violet-400 to-purple-600',
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconColor[color]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg shadow-${color}-500/10`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">{title}</div>
        <div className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">{description}</div>
      </div>
      <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0" />
    </Link>
  );
}
