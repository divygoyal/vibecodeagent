'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, ResponsiveContainer
} from 'recharts';
import {
  Bot, BarChart3, Search, GitBranch, TrendingUp, TrendingDown,
  ArrowUpRight, Zap, Activity, MousePointer, Eye, Users, Hash,
  Loader2, AlertTriangle, CheckCircle2, Lightbulb
} from 'lucide-react';

/* ─── types ─── */
type BotStatus = {
  status: string;
  health: string;
  telegramStatus?: string;
  botUsername?: string;
  connectedProviders?: Array<{ provider: string; connected: boolean }>;
};

type AnalyticsKPIs = {
  totalUsers: number;
  totalSessions: number;
  totalPageViews: number;
  changeUsers: number;
  changeSessions: number;
  changePageViews: number;
};

type SEOKPIs = {
  totalClicks: number;
  totalImpressions: number;
  avgCTR: number;
  avgPosition: number;
  changeClicks: number;
  changePosition: number;
};

type Recommendation = {
  id: string;
  type: string;
  severity: string;
  title: string;
  impact: string;
};

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

export default function DashboardOverview() {
  const { data: session } = useSession();
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [recentCommits, setRecentCommits] = useState<Array<{
    repo: string; message: string; sha: string; date: string; branch: string;
  }>>([]);
  const [analyticsKPIs, setAnalyticsKPIs] = useState<AnalyticsKPIs | null>(null);
  const [seoKPIs, setSeoKPIs] = useState<SEOKPIs | null>(null);
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [searchTrend, setSearchTrend] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, ghRes, analyticsRes, seoRes] = await Promise.all([
        fetch('/api/container').catch(() => null),
        fetch('/api/github').catch(() => null),
        fetch('/api/analytics?section=all').catch(() => null),
        fetch('/api/seo?section=all').catch(() => null),
      ]);

      if (statusRes?.ok) setBotStatus(await statusRes.json());
      if (ghRes?.ok) {
        const data = await ghRes.json();
        setRecentCommits(data.commits?.slice(0, 5) || []);
      }
      if (analyticsRes?.ok) {
        const data = await analyticsRes.json();
        setAnalyticsKPIs(data.kpis);
        setTrafficData(data.traffic || []);
      }
      if (seoRes?.ok) {
        const data = await seoRes.json();
        setSeoKPIs(data.kpis);
        setSearchTrend(data.trend || []);
        setRecommendations((data.recommendations || []).slice(0, 3));
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isLive = botStatus?.status === 'running' && botStatus?.telegramStatus === 'connected';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-zinc-500">
            Here&apos;s your growth snapshot.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${isLive ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            {isLive ? 'Bot Live' : 'Bot Offline'}
          </span>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Users}
          label="Total Users"
          value={analyticsKPIs?.totalUsers.toLocaleString() || '—'}
          change={analyticsKPIs?.changeUsers}
          sparkData={trafficData.map(d => ({ v: d.activeUsers }))}
          sparkColor="#34d399"
          href="/dashboard/analytics"
        />
        <KPICard
          icon={Eye}
          label="Page Views"
          value={analyticsKPIs?.totalPageViews.toLocaleString() || '—'}
          change={analyticsKPIs?.changePageViews}
          sparkData={trafficData.map(d => ({ v: d.pageViews }))}
          sparkColor="#22d3ee"
          href="/dashboard/analytics"
        />
        <KPICard
          icon={MousePointer}
          label="Search Clicks"
          value={seoKPIs?.totalClicks.toLocaleString() || '—'}
          change={seoKPIs?.changeClicks}
          sparkData={searchTrend.map(d => ({ v: d.clicks }))}
          sparkColor="#a78bfa"
          href="/dashboard/seo"
        />
        <KPICard
          icon={Hash}
          label="Avg. Position"
          value={seoKPIs?.avgPosition?.toString() || '—'}
          change={seoKPIs?.changePosition}
          invertChange
          sparkData={searchTrend.map(d => ({ v: d.position }))}
          sparkColor="#fbbf24"
          href="/dashboard/seo"
        />
      </div>

      {/* Two-column: Activity + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Commits */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Recent Commits
            </h2>
            <Activity className="w-4 h-4 text-zinc-600" />
          </div>

          {recentCommits.length > 0 ? (
            <div className="space-y-2">
              {recentCommits.map((commit, i) => (
                <div
                  key={`${commit.sha}-${i}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  <code className="text-[10px] text-emerald-400 font-mono bg-emerald-400/[0.08] px-2 py-0.5 rounded flex-shrink-0">
                    {commit.sha}
                  </code>
                  <span className="text-sm text-zinc-300 flex-1 truncate">{commit.message}</span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0">{timeAgo(commit.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <GitBranch className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No commits yet</p>
              <p className="text-xs text-zinc-600 mt-1">Connect GitHub to see activity</p>
            </div>
          )}
        </div>

        {/* AI Recommendations Preview */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                <Zap className="w-3 h-3 text-black" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                AI Insights
              </h2>
            </div>
            <Link href="/dashboard/seo" className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors">
              View all →
            </Link>
          </div>

          {recommendations.length > 0 ? (
            <div className="space-y-2.5">
              {recommendations.map(rec => {
                const severityIcon = rec.severity === 'high' ? AlertTriangle :
                  rec.severity === 'medium' ? Lightbulb : CheckCircle2;
                const SevIcon = severityIcon;
                const severityColor = rec.severity === 'high' ? 'text-red-400' :
                  rec.severity === 'medium' ? 'text-amber-400' : 'text-blue-400';

                return (
                  <Link key={rec.id} href="/dashboard/seo" className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <SevIcon className={`w-4 h-4 ${severityColor} mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 group-hover:text-white transition-colors truncate">{rec.title}</p>
                      <span className="text-[10px] text-emerald-400 font-medium">{rec.impact}</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-0.5" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Zap className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No insights yet</p>
              <p className="text-xs text-zinc-600 mt-1">Connect Google to get AI recommendations</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ActionCard
          href="/dashboard/bot"
          icon={Bot}
          title="Bot Setup"
          description="Configure your Telegram bot"
          color="emerald"
        />
        <ActionCard
          href="/dashboard/analytics"
          icon={BarChart3}
          title="Full Analytics"
          description="Deep dive into traffic data"
          color="cyan"
        />
        <ActionCard
          href="/dashboard/seo"
          icon={Search}
          title="SEO Intelligence"
          description="Keywords, rankings, optimization"
          color="violet"
        />
      </div>
    </div>
  );
}

/* ─── KPI Card with mini sparkline ─── */
function KPICard({
  icon: Icon, label, value, change, invertChange, sparkData, sparkColor, href
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  change?: number;
  invertChange?: boolean;
  sparkData: { v: number }[];
  sparkColor: string;
  href: string;
}) {
  const positive = change !== undefined ? (invertChange ? change <= 0 : change >= 0) : true;

  return (
    <Link href={href} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all group">
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
          <Icon className="w-4 h-4 text-zinc-400" />
        </div>
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {change >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <div className="text-xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-[10px] text-zinc-500 mb-2">{label}</div>
      {sparkData.length > 0 && (
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

/* ─── Action Card ─── */
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
      className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconColor[color]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>
      <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
    </Link>
  );
}
