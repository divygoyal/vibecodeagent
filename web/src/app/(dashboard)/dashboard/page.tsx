'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, ResponsiveContainer
} from 'recharts';
import {
  Bot, BarChart3, Search, TrendingUp, TrendingDown,
  ArrowUpRight, Zap, Activity, MousePointer, Eye, Users, Hash,
  AlertTriangle, Lightbulb, Globe, ChevronDown, Loader2, ScanSearch
} from 'lucide-react';
import { useContainerStatus, useAnalyticsData, useSeoData, useSiteList, usePropertyList, useInsights } from '@/lib/useDashboardData';
import { useRegistration } from './layout';

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
  const { isRegistering, isRegistered, registrationError } = useRegistration();

  // 1. Container status + Google connection check
  const { botStatus, hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
  const botRunning = botStatus?.status === 'running';

  // 2. Fetch lists when Google is connected (plugins run locally, no container needed)
  const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
  const { properties } = usePropertyList(hasGoogleConnection);

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

  // 3. Fetch Data — analytics/SEO need Google connection (not container)
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData('all', matchedProp?.property, hasGoogleConnection);
  const { data: seoData, isLoading: seoLoading } = useSeoData('all', selectedSiteUrl, hasGoogleConnection);
  const { insights, isLoading: insightsLoading } = useInsights(hasGoogleConnection);

  // Extract Data
  const analyticsKPIs = analyticsData?.kpis;
  const trafficData = Array.isArray(analyticsData?.traffic) ? analyticsData.traffic : [];

  const seoKPIs = seoData?.kpis;
  const searchTrend = Array.isArray(seoData?.trend) ? seoData.trend : [];
  const recommendations = (Array.isArray(seoData?.recommendations) ? seoData.recommendations : []).slice(0, 3);

  const isLive = botRunning && botStatus?.telegramStatus === 'connected';

  // Loading States - include registration state
  const isInit = isRegistering || containerLoading || (hasGoogleConnection && sitesLoading && !selectedSiteUrl);
  const isRef = analyticsLoading || seoLoading;

  // Show registration error if any
  if (registrationError) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Registration Failed</h2>
        <p className="text-zinc-400 max-w-md">{registrationError}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Show loading while registering
  if (isRegistering && !isRegistered) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Setting up your dashboard...</h2>
        <p className="text-zinc-400">This may take a few seconds</p>
      </div>
    );
  }

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

      {/* Setup Prompt - shown when Google not connected */}
      {!containerLoading && !hasGoogleConnection && (
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f1a2e] via-[#0d1424] to-[#111827] border border-blue-500/15 rounded-2xl p-8">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/[0.06] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/[0.04] rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
          
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">Connect your Google account</h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-lg">
                Link Google Analytics & Search Console to unlock real-time traffic insights, SEO performance tracking, keyword rankings, and AI-powered recommendations.
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <BarChart3 className="w-3 h-3 text-blue-400" />
                  <span>Analytics</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Search className="w-3 h-3 text-emerald-400" />
                  <span>Search Console</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>AI Insights</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => signIn('google')}
              className="px-6 py-3 bg-white text-[#1a1a2e] font-semibold rounded-xl hover:bg-zinc-100 transition-all text-sm flex-shrink-0 shadow-lg shadow-white/10 flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google
            </button>
          </div>
        </div>
      )}

      {/* Bot setup prompt - shown when Google connected but bot not running */}
      {!containerLoading && hasGoogleConnection && !botRunning && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-zinc-500" />
            <p className="text-sm text-zinc-400 flex-1">Want AI-powered insights via Telegram? <Link href="/dashboard/bot" className="text-emerald-400 hover:text-emerald-300">Set up your bot →</Link></p>
          </div>
        </div>
      )}

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

        {/* Quick Actions */}
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              Quick Actions
            </h2>
          </div>

          <div className="space-y-2 flex-1">
            {[
              { label: 'Run Site Audit', desc: 'Check your site for SEO issues', href: '/dashboard/audit', icon: ScanSearch, color: 'text-cyan-400' },
              { label: 'View Analytics', desc: 'Dive into your traffic data', href: '/dashboard/analytics', icon: BarChart3, color: 'text-emerald-400' },
              { label: 'SEO Performance', desc: 'Search Console insights', href: '/dashboard/seo', icon: Search, color: 'text-amber-400' },
              { label: 'Connect Your Bot', desc: 'Get deep analysis via Telegram', href: '/dashboard/bot', icon: Bot, color: 'text-violet-400' },
            ].map((action, i) => (
              <Link key={i} href={action.href} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group">
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center ${action.color}`}>
                  <action.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">{action.label}</p>
                  <p className="text-[10px] text-zinc-600">{action.desc}</p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* SEO & Analytics Insights */}
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Insights
            </h2>
            <Link href="/dashboard/audit" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Run Audit →
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {insightsLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : insights.length > 0 ? (
              insights.slice(0, 4).map((insight: any) => (
                <div key={insight.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {insight.type === 'opportunity' && <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      {insight.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      {insight.type === 'achievement' && <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                      {insight.type === 'trend' && <Activity className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                      <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white">{insight.title}</h3>
                    </div>
                    {insight.metric && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                        insight.priority === 'high' ? 'bg-red-500/10 text-red-400' :
                        insight.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2 pl-5.5">{insight.description}</p>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-8 text-zinc-500">
                <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-sm">No insights yet</p>
                <p className="text-xs mt-1">{hasGoogleConnection ? 'Check back as data accumulates' : 'Connect Google to get insights'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          title="SEO"
          description="Keywords & Rankings"
          color="violet"
        />
        <ActionCard
          href="/dashboard/audit"
          icon={ScanSearch}
          title="Site Audit"
          description="50+ SEO Checks"
          color="amber"
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

  // Show skeleton OR content — never both overlapping
  if (loading && !showValue) {
    return (
      <Link href={href} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-4">
        <div className="flex justify-between mb-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-12 h-4 rounded-full" />
        </div>
        <Skeleton className="w-24 h-7 rounded-md mb-1" />
        <Skeleton className="w-16 h-3 rounded-md mb-2" />
        <Skeleton className="w-full h-8 rounded-md opacity-30" />
      </Link>
    );
  }

  return (
    <Link href={href} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all group">
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-white/[0.08] transition-colors">
          <Icon className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
        </div>
        {change !== undefined && (
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
    amber: 'from-amber-400 to-orange-500',
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
