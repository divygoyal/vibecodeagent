'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect, useRef, useMemo, useCallback, memo, RefObject } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, ResponsiveContainer
} from 'recharts';
import {
  Bot, BarChart3, Search, TrendingUp, TrendingDown,
  ArrowUpRight, Zap, Activity, MousePointer, Eye, Users, Hash,
  AlertTriangle, Lightbulb, Globe, ChevronDown, Loader2, ScanSearch,
  DollarSign, Target, FileWarning, ShieldAlert, ArrowRight, Flame, CheckCircle2,
  Gauge, Rocket, Tag, Shield
} from 'lucide-react';
import { useContainerStatus, useAnalyticsData, useSeoData, useSiteList, usePropertyList, useInsights, useRealtimeData } from '@/lib/useDashboardData';
import { useRegistration } from './layout';
import OverviewInsights from '@/components/OverviewInsights';
import OverviewDetailDrawer, { DrawerContent } from '@/components/OverviewDetailDrawer';
import { ConnectGoogleState } from '@/components/EmptyState';

/* ─── Animation variants ─── */
const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};
const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

/* ─── Lazy-load hook for below-fold sections ─── */
function useLazyVisible(ref: RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

/* ─── Computed Insight Types ─── */
interface StrikingKeyword {
  query: string;
  position: string;
  impressions: number;
  clicks: number;
  potentialClicks: number;
  estimatedRevenue: number;
}
interface CTRProblem {
  query: string;
  position: string;
  actualCTR: string;
  expectedCTR: string;
  impressions: number;
  gap: string;
}
interface TopPage {
  page: string;
  clicks: number;
  impressions: number;
  position: string;
}

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

function fmtNum(n?: number | string): string {
  if (n === undefined || n === null) return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Simple Skeleton Component
function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function DashboardOverview() {
  const { data: session } = useSession();
  const { isRegistering, isRegistered, registrationError, selectedSite, setSelectedSite, selectedProperty, setSelectedProperty, range } = useRegistration();

  // 1. Container status + Google connection check
  const { botStatus, hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
  const botRunning = botStatus?.status === 'running';

  // 2. Fetch lists when Google is connected (plugins run locally, no container needed)
  const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
  const { properties } = usePropertyList(hasGoogleConnection);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // Auto-select first site when loaded (synced via context → layout persists to localStorage)
  useEffect(() => {
    if (sites.length > 0 && !selectedSite) {
      setSelectedSite(sites[0].siteUrl);
    }
  }, [sites, selectedSite, setSelectedSite]);

  // Derived Property ID — improved matching priority
  const domain = selectedSite.replace('sc-domain:', '').replace('https://', '').replace('/', '');
  const domainRoot = domain.split('.')[0]; // e.g., "example" from "example.com"

  // Try matching in priority order:
  // 1. Exact domain match in displayName (e.g., "example.com" in "example.com - GA4")
  // 2. Domain root in property's data stream URL (if available)
  // 3. Partial match by domain root in displayName
  // 4. Fallback to first property
  const matchedProp =
    properties.find((p: any) => p.displayName?.toLowerCase().includes(domain.toLowerCase())) ||
    properties.find((p: any) => (p.propertyId || p.property || '').toLowerCase().includes(domainRoot.toLowerCase())) ||
    properties.find((p: any) => p.displayName?.toLowerCase().includes(domainRoot.toLowerCase())) ||
    properties[0]; // Fallback to first

  // Sync derived property to context so Analytics page picks it up
  useEffect(() => {
    if (matchedProp?.property && matchedProp.property !== selectedProperty) {
      setSelectedProperty(matchedProp.property);
    }
  }, [matchedProp, selectedProperty, setSelectedProperty]);

  // 3. Fetch Data — start fetching if Google is connected OR we have a cached site (optimistic)
  const hasCachedSite = !!selectedSite;
  const canFetchData = hasGoogleConnection || hasCachedSite;
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData('all', matchedProp?.property, canFetchData, range);
  const { data: seoData, isLoading: seoLoading } = useSeoData('all', selectedSite, canFetchData);

  // 4. Real-time active users (deferred until primary data loads)
  const hasData_early = !!(analyticsData?.kpis || seoData?.kpis);
  const { data: realtimeData } = useRealtimeData(matchedProp?.property, canFetchData && hasData_early);
  const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : null;

  // 5. AI Insights for smart alerts (deferred + per-property)
  const { insights } = useInsights(selectedSite, matchedProp?.property, canFetchData && hasData_early);

  // Extract Data
  const analyticsKPIs = analyticsData?.kpis;
  const trafficData = Array.isArray(analyticsData?.traffic) ? analyticsData.traffic : [];

  const seoKPIs = seoData?.kpis;
  const searchTrend = Array.isArray(seoData?.trend) ? seoData.trend : [];

  const isLive = botRunning && botStatus?.telegramStatus === 'connected';

  // Loading States - don't block on registration if we have a cached site (optimistic)
  const isInit = (!hasCachedSite && isRegistering) || containerLoading || (hasGoogleConnection && sitesLoading && !selectedSite);
  const isRef = analyticsLoading || seoLoading;
  // True when we have SOME data (even stale) — prevents re-showing skeletons
  const hasData = !!(analyticsKPIs || seoKPIs);

  // ═══ COMPUTED INSIGHTS (client-side, zero API calls) ═══
  const computedInsights = useMemo(() => {
    const queries = seoData?.queries || [];
    const pages = seoData?.pages || [];

    // 1. Striking distance keywords (pos 4-20, high impressions)
    const strikingDistance: StrikingKeyword[] = queries
      .filter((q: any) => {
        const pos = parseFloat(q.position);
        const impr = parseInt(q.impressions);
        return pos >= 4 && pos <= 20 && impr > 30;
      })
      .sort((a: any, b: any) => parseInt(b.impressions) - parseInt(a.impressions))
      .slice(0, 5)
      .map((q: any) => {
        const pos = parseFloat(q.position);
        const impr = parseInt(q.impressions);
        const clicks = parseInt(q.clicks);
        // Estimated additional clicks if pushed to pos 1-3
        const currentCTR = clicks / Math.max(impr, 1);
        const targetCTR = pos <= 5 ? 0.11 : 0.07; // Pos 3 CTR benchmark
        const addlClicks = Math.round(impr * (targetCTR - currentCTR));
        return {
          query: q.query,
          position: pos.toFixed(1),
          impressions: impr,
          clicks,
          potentialClicks: Math.max(addlClicks, 0),
          estimatedRevenue: Math.max(addlClicks, 0) * 0.5, // Conservative $0.50/click
        };
      });

    // 2. CTR problems (actual CTR << expected for position)
    const ctrProblems: CTRProblem[] = queries
      .filter((q: any) => {
        const pos = parseFloat(q.position);
        const ctr = parseFloat(q.ctr);
        const impr = parseInt(q.impressions);
        const expected = pos <= 1 ? 28 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
        return ctr < expected * 0.5 && impr > 50; // CTR less than half of expected
      })
      .sort((a: any, b: any) => parseInt(b.impressions) - parseInt(a.impressions))
      .slice(0, 4)
      .map((q: any) => {
        const pos = parseFloat(q.position);
        const expected = pos <= 1 ? 28 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
        return {
          query: q.query,
          position: pos.toFixed(1),
          actualCTR: parseFloat(q.ctr).toFixed(1),
          expectedCTR: expected.toFixed(1),
          impressions: parseInt(q.impressions),
          gap: (expected - parseFloat(q.ctr)).toFixed(1),
        };
      });

    // 3. Site health verdict
    const changeUsers = analyticsKPIs?.changeUsers || 0;
    const changeClicks = seoKPIs?.changeClicks || 0;
    let healthVerdict: 'growing' | 'stable' | 'declining' = 'stable';
    let healthColor = 'amber';
    let healthIcon = 'stable';
    if (changeUsers > 5 && changeClicks > 5) { healthVerdict = 'growing'; healthColor = 'emerald'; healthIcon = 'up'; }
    else if (changeUsers < -10 || changeClicks < -10) { healthVerdict = 'declining'; healthColor = 'red'; healthIcon = 'down'; }

    // 4. Top performing pages
    const topPages: TopPage[] = pages
      .sort((a: any, b: any) => parseInt(b.clicks || 0) - parseInt(a.clicks || 0))
      .slice(0, 3)
      .map((p: any) => ({
        page: (p.page || '').replace(/^https?:\/\/[^/]+/, '').substring(0, 40) || '/',
        clicks: parseInt(p.clicks || 0),
        impressions: parseInt(p.impressions || 0),
        position: parseFloat(p.position || 0).toFixed(1),
      }));

    return { strikingDistance, ctrProblems, healthVerdict, healthColor, healthIcon, topPages };
  }, [seoData, analyticsKPIs, seoKPIs]);

  // ═══ PERFORMANCE SCORE (0-100) — Composite metric with sub-scores ═══
  const scoreData = useMemo(() => {
    if (!analyticsKPIs && !seoKPIs) return null;
    const trafficChange = analyticsKPIs?.changeUsers || 0;
    const trafficScore = Math.min(15, Math.max(-15, trafficChange));
    const avgCTR = parseFloat(seoKPIs?.avgCTR) || 0;
    const ctrScore = avgCTR > 5 ? 10 : avgCTR > 3 ? 5 : avgCTR > 1 ? 0 : -10;
    const bounce = parseFloat(analyticsKPIs?.avgBounceRate) || 50;
    const bounceScore = bounce > 70 ? 15 : bounce > 55 ? 8 : bounce > 40 ? 3 : 0;
    const avgPos = parseFloat(seoKPIs?.avgPosition) || 30;
    const positionScore = avgPos < 10 ? 10 : avgPos < 20 ? 5 : avgPos < 30 ? 0 : -10;
    const imprChange = seoKPIs?.changeImpressions || 0;
    const impressionScore = Math.min(10, Math.max(-10, imprChange / 2));
    const score = Math.max(0, Math.min(100, Math.round(50 + trafficScore + ctrScore - bounceScore + positionScore + impressionScore)));
    return { score, trafficScore, ctrScore, bounceScore, positionScore, impressionScore };
  }, [analyticsKPIs, seoKPIs]);
  const performanceScore = scoreData?.score ?? null;

  // ═══ GROWTH VELOCITY — 7d vs previous 7d ═══
  const velocityData = useMemo(() => {
    if (searchTrend.length < 14) return null;
    const recent7 = searchTrend.slice(-7);
    const prev7 = searchTrend.slice(-14, -7);
    const recentClicks = recent7.reduce((s: number, d: any) => s + (d.clicks || 0), 0);
    const prevClicks = prev7.reduce((s: number, d: any) => s + (d.clicks || 0), 0);
    if (prevClicks === 0) return null;
    const velocity = ((recentClicks - prevClicks) / prevClicks * 100);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekData = recent7.map((d: any, i: number) => ({
      label: d.date ? days[new Date(d.date).getDay()] : `D${i + 1}`,
      current: d.clicks || 0,
      previous: prev7[i]?.clicks || 0,
    }));
    return { velocity, recentClicks, prevClicks, weekData };
  }, [searchTrend]);
  const growthVelocity = velocityData?.velocity ?? null;

  // ═══ BRANDED vs NON-BRANDED — from SEO queries ═══
  const brandedSplit = useMemo(() => {
    const queries = seoData?.queries || [];
    if (queries.length === 0) return null;
    const siteName = selectedSite.replace('sc-domain:', '').replace('https://', '').replace('http://', '').replace(/\.(com|net|org|io|co|dev|codes|xyz|app).*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!siteName || siteName.length < 2) return null;
    let brandedClicks = 0, nonBrandedClicks = 0;
    const brandedKeywords: { query: string; clicks: number }[] = [];
    queries.forEach((q: any) => {
      const qLower = (q.query || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const clicks = parseInt(q.clicks) || 0;
      if (qLower.includes(siteName)) {
        brandedClicks += clicks;
        brandedKeywords.push({ query: q.query, clicks });
      } else {
        nonBrandedClicks += clicks;
      }
    });
    const total = brandedClicks + nonBrandedClicks;
    if (total === 0) return null;
    return {
      branded: brandedClicks,
      nonBranded: nonBrandedClicks,
      brandedPct: Math.round((brandedClicks / total) * 100),
      nonBrandedPct: Math.round((nonBrandedClicks / total) * 100),
      topBranded: brandedKeywords.sort((a, b) => b.clicks - a.clicks).slice(0, 5),
    };
  }, [seoData, selectedSite]);

  // ═══ SMART ALERTS — from insights API ═══
  const smartAlerts = useMemo(() => {
    if (!insights || insights.length === 0) return [];
    return insights
      .filter((i: any) => i.priority === 'high' || i.severity === 'critical' || i.severity === 'high')
      .slice(0, 3);
  }, [insights]);

  // Friendly display for selected site
  const selectedSiteLabel = selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : '';

  // Lazy-load refs for below-fold sections
  const insightSectionRef = useRef<HTMLDivElement>(null);
  const insightVisible = useLazyVisible(insightSectionRef);

  // Detail drawer state
  const [drawerContent, setDrawerContent] = useState<DrawerContent | null>(null);

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

  // No longer block the page during registration — show skeleton UI instead
  // The useRegisteredSWR hook handles optimistic fetching for returning users

  return (
    <motion.div className="space-y-6 p-6" initial="initial" animate="animate" variants={stagger}>
      {/* Hero Header — Site Selector + Live Metrics */}
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-zinc-500">
            Growth overview for your projects.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time Active Users */}
          {activeUsers !== null && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/[0.06] border border-emerald-500/[0.12] rounded-lg">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <span className="text-sm font-bold text-emerald-400 font-mono">{activeUsers}</span>
              <span className="text-[10px] text-zinc-500">live</span>
            </div>
          )}

          {/* Custom Site Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => !isInit && setDropdownOpen(!dropdownOpen)}
              disabled={isInit}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg pl-3 pr-3 py-2 hover:border-zinc-600 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 outline-none min-w-[220px] transition-all disabled:opacity-50"
            >
              <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <span className="flex-1 text-left truncate">
                {isInit ? 'Loading sites...' : selectedSiteLabel || 'No sites found'}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && sites.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#111116] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 py-1 min-w-[250px] max-h-[260px] overflow-y-auto">
                {sites.map((site: any) => {
                  const label = site.siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                  const isSelected = site.siteUrl === selectedSite;
                  return (
                    <button
                      key={site.siteUrl}
                      onClick={() => { setSelectedSite(site.siteUrl); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-all ${isSelected
                        ? 'text-emerald-400 bg-emerald-500/[0.08]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                    >
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate flex-1">{label}</span>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isLive ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            {isLive ? 'Bot Live' : 'Offline'}
          </span>
        </div>
      </motion.div>

      {/* Setup Prompt - shown when Google not connected */}
      {!containerLoading && !hasGoogleConnection && (
        <ConnectGoogleState feature="real-time traffic insights, SEO performance tracking, keyword rankings, and AI-powered recommendations" />
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

      {/* ═══ 1. KPI GRID — Top of visual hierarchy ═══ */}
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          loading={isRef && !hasData}
          icon={Users}
          label="Total Users"
          value={analyticsKPIs?.totalUsers}
          change={analyticsKPIs?.changeUsers}
          sparkData={trafficData.map((d: any) => ({ v: d.activeUsers }))}
          sparkColor="#34d399"
          href="/dashboard/analytics"
        />
        <KPICard
          loading={isRef && !hasData}
          icon={Eye}
          label="Page Views"
          value={analyticsKPIs?.totalPageViews}
          change={analyticsKPIs?.changePageViews}
          sparkData={trafficData.map((d: any) => ({ v: d.pageViews }))}
          sparkColor="#22d3ee"
          href="/dashboard/analytics"
        />
        <KPICard
          loading={isRef && !hasData}
          icon={MousePointer}
          label="Search Clicks"
          value={seoKPIs?.totalClicks}
          change={seoKPIs?.changeClicks}
          sparkData={searchTrend.map((d: any) => ({ v: d.clicks }))}
          sparkColor="#a78bfa"
          href="/dashboard/seo"
        />
        <KPICard
          loading={isRef && !hasData}
          icon={Hash}
          label="Avg. Position"
          value={seoKPIs?.avgPosition}
          change={seoKPIs?.changePosition}
          invertChange
          sparkData={searchTrend.map((d: any) => ({ v: d.position }))}
          sparkColor="#fbbf24"
          href="/dashboard/seo"
        />
      </motion.div>

      {/* ═══ 2. SMART ALERTS — Critical insights banner ═══ */}
      {smartAlerts.length > 0 && (
        <motion.div variants={fadeInUp} transition={{ duration: 0.35 }}
          className="bg-red-500/[0.03] border border-red-500/[0.1] rounded-xl p-3.5 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Shield className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="text-[10px] text-red-400/80 uppercase tracking-wider font-semibold">Priority Alerts</div>
            {smartAlerts.map((alert: any, i: number) => (
              <p key={i} className="text-[12px] text-zinc-300 leading-relaxed">
                <span className="text-red-400 font-semibold">{alert.title || alert.type}:</span>{' '}
                {alert.description || alert.message || alert.text}
              </p>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ 3. COMMAND CENTER — Compact row: Score + Velocity + Branded Split ═══ */}
      {hasData && (
        <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Performance Score Gauge */}
          {performanceScore !== null && scoreData && (
            <div onClick={() => setDrawerContent({ type: 'score', title: 'SEO Score Breakdown', data: scoreData })} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all cursor-pointer">
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-white/[0.06]" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15" fill="none"
                    className={performanceScore >= 70 ? 'text-emerald-400' : performanceScore >= 40 ? 'text-amber-400' : 'text-red-400'}
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${performanceScore * 0.94} 100`}
                    style={{ transition: 'stroke-dasharray 1s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-white font-mono">{performanceScore}</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">SEO Score</div>
                <div className={`text-sm font-bold ${performanceScore >= 70 ? 'text-emerald-400' : performanceScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                  {performanceScore >= 80 ? 'Excellent' : performanceScore >= 60 ? 'Good' : performanceScore >= 40 ? 'Needs Work' : 'Critical'}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  Traffic {(analyticsKPIs?.changeUsers || 0) >= 0 ? '+' : ''}{analyticsKPIs?.changeUsers || 0}% | CTR {seoKPIs?.avgCTR || '—'}%
                </div>
              </div>
            </div>
          )}

          {/* Growth Velocity */}
          <div onClick={() => velocityData && setDrawerContent({ type: 'velocity', title: 'Growth Velocity', data: velocityData })} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all cursor-pointer">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              growthVelocity !== null && growthVelocity > 0
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : growthVelocity !== null && growthVelocity < -5
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-white/[0.04] border border-white/[0.06]'
            }`}>
              <Rocket className={`w-5 h-5 ${
                growthVelocity !== null && growthVelocity > 0 ? 'text-emerald-400' :
                growthVelocity !== null && growthVelocity < -5 ? 'text-red-400' : 'text-zinc-400'
              }`} />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Growth Velocity</div>
              {growthVelocity !== null ? (
                <>
                  <div className={`text-lg font-bold font-mono ${growthVelocity > 0 ? 'text-emerald-400' : growthVelocity < -5 ? 'text-red-400' : 'text-amber-400'}`}>
                    {growthVelocity > 0 ? '+' : ''}{growthVelocity.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    {growthVelocity > 10 ? 'Accelerating' : growthVelocity > 0 ? 'Growing' : growthVelocity > -5 ? 'Plateauing' : 'Decelerating'} (7d vs prev 7d)
                  </div>
                </>
              ) : (
                <div className="text-sm text-zinc-600">Needs 14+ days of data</div>
              )}
            </div>
          </div>

          {/* Branded vs Non-Branded Split */}
          <div onClick={() => brandedSplit && setDrawerContent({ type: 'brand', title: 'Brand vs Organic', data: brandedSplit })} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Brand vs Organic</span>
            </div>
            {brandedSplit ? (
              <>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-lg font-bold text-white font-mono">{brandedSplit.nonBrandedPct}%</span>
                  <span className="text-[10px] text-zinc-500 mb-0.5">non-branded</span>
                </div>
                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden flex">
                  <div className="bg-cyan-400/80 rounded-full transition-all duration-700" style={{ width: `${brandedSplit.nonBrandedPct}%` }} />
                  <div className="bg-amber-400/60 rounded-full transition-all duration-700" style={{ width: `${brandedSplit.brandedPct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-cyan-400/70">{fmtNum(brandedSplit.nonBranded)} organic</span>
                  <span className="text-[9px] text-amber-400/70">{fmtNum(brandedSplit.branded)} branded</span>
                </div>
                {brandedSplit.brandedPct > 60 && (
                  <div className="mt-2 text-[9px] text-amber-400/80 bg-amber-500/[0.06] border border-amber-500/10 rounded px-2 py-1">
                    High brand reliance — diversify organic keywords
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-zinc-600">Not enough query data</div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ INSIGHT SECTIONS — Lazy-loaded when scrolled into view ═══ */}
      {hasGoogleConnection && (
        <motion.div ref={insightSectionRef} variants={fadeInUp} transition={{ duration: 0.35 }} className="space-y-5">

          {/* ══ 6 INSIGHT SECTIONS — only rendered when visible ══ */}
          {insightVisible && <OverviewInsights
            trafficData={analyticsData?.traffic || []}
            searchTrend={seoData?.trend || []}
            seoQueries={seoData?.queries || []}
            seoPages={seoData?.pages || []}
            analyticsKPIs={analyticsKPIs}
            seoKPIs={seoKPIs}
            hasData={hasData}
            isLoading={!hasData && isRef}
          />}

          {/* Row 1: Site Health + Money Opportunities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Site Health Pulse */}
            <div onClick={() => setDrawerContent({ type: 'health', title: 'Site Health', data: { verdict: computedInsights.healthVerdict, changeUsers: analyticsKPIs?.changeUsers || 0, changeClicks: seoKPIs?.changeClicks || 0, avgCTR: seoKPIs?.avgCTR, avgPosition: seoKPIs?.avgPosition } })} className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/[0.04] to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Site Health
                  </h2>
                  {hasData && (
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${computedInsights.healthVerdict === 'growing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      computedInsights.healthVerdict === 'declining' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                      {computedInsights.healthVerdict === 'growing' ? '📈 Growing' :
                        computedInsights.healthVerdict === 'declining' ? '📉 Declining' : '➡️ Stable'}
                    </span>
                  )}
                </div>

                {(!hasData && isRef) ? (
                  <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                ) : hasData ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Users</div>
                        <div className="text-lg font-bold text-white font-mono">{fmtNum(analyticsKPIs?.totalUsers)}</div>
                        <ChangeTag value={analyticsKPIs?.changeUsers} />
                      </div>
                      <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Search Clicks</div>
                        <div className="text-lg font-bold text-white font-mono">{fmtNum(seoKPIs?.totalClicks)}</div>
                        <ChangeTag value={seoKPIs?.changeClicks} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Bounce" value={`${analyticsKPIs?.avgBounceRate || 0}%`} warn={(analyticsKPIs?.avgBounceRate || 0) > 60} />
                      <MiniStat label="CTR" value={`${seoKPIs?.avgCTR || 0}%`} warn={(seoKPIs?.avgCTR || 0) < 2} />
                      <MiniStat label="Impressions" value={fmtNum(seoKPIs?.totalImpressions)} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 py-4 text-center">Connect Google to see health data</p>
                )}
              </div>
            </div>

            {/* 💰 Money Opportunities — Striking Distance */}
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-amber-500/[0.06] to-transparent rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-emerald-500/[0.04] to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    Striking Distance
                  </h2>
                  <Link href="/dashboard/seo" className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1">
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {(!hasData && isRef) ? (
                  <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : computedInsights.strikingDistance.length > 0 ? (
                  <div className="space-y-2.5">
                    {computedInsights.strikingDistance.slice(0, 4).map((kw, i) => {
                      const pos = parseFloat(kw.position);
                      const progressToPage1 = Math.max(0, Math.min(100, ((20 - pos) / 17) * 100));
                      const opportunityScore = Math.min(100, Math.round((kw.impressions / 100) * (21 - pos)));
                      const scoreColor = opportunityScore > 70 ? 'text-emerald-400' : opportunityScore > 40 ? 'text-amber-400' : 'text-zinc-400';
                      const scoreBg = opportunityScore > 70 ? 'bg-emerald-500/10 border-emerald-500/20' : opportunityScore > 40 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-500/10 border-zinc-500/20';
                      return (
                        <div key={i} onClick={() => setDrawerContent({ type: 'keyword', title: kw.query, data: kw })} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-amber-500/15 transition-all group cursor-pointer">
                          <div className="flex items-start gap-3">
                            {/* Opportunity Score Circle */}
                            <div className={`w-10 h-10 rounded-xl ${scoreBg} border flex flex-col items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${scoreColor}`}>{opportunityScore}</span>
                              <span className="text-[7px] text-zinc-500 -mt-0.5">score</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              {/* Keyword name */}
                              <p className="text-[13px] text-zinc-200 font-medium truncate group-hover:text-white transition-colors">{kw.query}</p>

                              {/* Stats row */}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
                                <span className="flex items-center gap-1">
                                  <Hash className="w-2.5 h-2.5 text-amber-400/60" />
                                  Pos <span className="text-amber-400 font-semibold">{kw.position}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <Eye className="w-2.5 h-2.5" />
                                  {fmtNum(kw.impressions)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MousePointer className="w-2.5 h-2.5" />
                                  {kw.clicks} → <span className="text-emerald-400 font-semibold">{kw.clicks + kw.potentialClicks}</span>
                                </span>
                              </div>

                              {/* Progress bar: distance to page 1 */}
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400 transition-all duration-700"
                                    style={{ width: `${progressToPage1}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-zinc-500 flex-shrink-0">
                                  {pos <= 10 ? '🔥 Page 1 ready' : `${Math.ceil(pos - 3)} spots to go`}
                                </span>
                              </div>
                            </div>

                            {/* Revenue badge */}
                            {kw.potentialClicks > 0 && (
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-2 py-1 rounded-lg">
                                  +{kw.potentialClicks} clicks
                                </span>
                                <span className="text-[9px] text-zinc-500">
                                  ~${kw.estimatedRevenue.toFixed(0)}/mo
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Revenue Summary Banner */}
                    <div className="mt-1 p-3 rounded-xl bg-gradient-to-r from-emerald-500/[0.06] to-amber-500/[0.04] border border-emerald-500/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-[11px] text-zinc-400">Total estimated monthly value</p>
                            <p className="text-lg font-bold text-emerald-400 font-mono">
                              ${computedInsights.strikingDistance.reduce((s, k) => s + k.estimatedRevenue, 0).toFixed(0)}<span className="text-xs text-zinc-500 font-normal">/mo</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500">{computedInsights.strikingDistance.length} keywords</p>
                          <p className="text-[10px] text-amber-400">+{computedInsights.strikingDistance.reduce((s, k) => s + k.potentialClicks, 0)} potential clicks</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400/40 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No striking distance keywords found</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Your top keywords are already ranking well!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: CTR Problems + Top Pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* 🔧 Quick Wins — CTR Problems */}
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute bottom-0 right-0 w-24 h-24 bg-gradient-to-tl from-red-500/[0.04] to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <FileWarning className="w-4 h-4 text-red-400" />
                    Quick Wins
                  </h2>
                  <span className="text-[10px] text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded-full border border-white/[0.04]">CTR below expected</span>
                </div>

                {(!hasData && isRef) ? (
                  <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
                ) : computedInsights.ctrProblems.length > 0 ? (
                  <div className="space-y-2">
                    {computedInsights.ctrProblems.map((item, i) => {
                      const actual = parseFloat(item.actualCTR);
                      const expected = parseFloat(item.expectedCTR);
                      const fillPct = Math.min(100, (actual / Math.max(expected, 1)) * 100);
                      return (
                        <div key={i} onClick={() => setDrawerContent({ type: 'ctr', title: item.query, data: item })} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-red-500/10 transition-all cursor-pointer">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-[12px] text-zinc-300 flex-1 truncate font-medium">&quot;{item.query}&quot;</p>
                            <span className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-semibold flex-shrink-0 border border-red-500/15">
                              -{item.gap}% gap
                            </span>
                          </div>
                          {/* CTR visual bar */}
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-[9px] mb-1">
                              <span className="text-red-400">CTR: {item.actualCTR}%</span>
                              <span className="text-zinc-500">Expected: {item.expectedCTR}%</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden relative">
                              <div className="h-full rounded-full bg-red-400/60 transition-all" style={{ width: `${fillPct}%` }} />
                              <div className="absolute top-0 h-full w-px bg-emerald-400/40" style={{ left: '100%' }} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                              <span>Pos {item.position}</span>
                              <span>•</span>
                              <span>{fmtNum(item.impressions)} impressions</span>
                            </div>
                            <span className="text-[9px] text-amber-400/70">💡 Fix meta title</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <p className="text-sm text-zinc-400 font-medium">No CTR issues detected</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Your click-through rates look healthy!</p>
                    <Link href="/dashboard/seo" className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/8 px-3 py-1.5 rounded-lg border border-emerald-500/10">
                      View Opportunities <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* 📊 Top Performing Pages */}
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-24 h-24 bg-gradient-to-br from-violet-500/[0.04] to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    Top Pages
                  </h2>
                  <Link href="/dashboard/seo" className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
                    Details <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {(!hasData && isRef) ? (
                  <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : computedInsights.topPages.length > 0 ? (
                  <div className="space-y-2">
                    {(() => {
                      const maxClicks = Math.max(...computedInsights.topPages.map(p => p.clicks), 1);
                      return computedInsights.topPages.map((page, i) => {
                        const sharePct = Math.round((page.clicks / maxClicks) * 100);
                        return (
                          <div key={i} onClick={() => setDrawerContent({ type: 'page', title: page.page, data: page })} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] transition-all relative overflow-hidden cursor-pointer">
                            {/* Background click share bar */}
                            <div
                              className={`absolute inset-y-0 left-0 opacity-[0.03] ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-zinc-400' : 'bg-orange-400'
                                }`}
                              style={{ width: `${sharePct}%` }}
                            />
                            <div className="relative flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-gradient-to-br from-amber-400/20 to-amber-500/10 text-amber-400 border border-amber-500/20' :
                                i === 1 ? 'bg-gradient-to-br from-zinc-400/20 to-zinc-500/10 text-zinc-400 border border-zinc-500/20' :
                                  'bg-gradient-to-br from-orange-400/20 to-orange-500/10 text-orange-400 border border-orange-500/20'
                                }`}>
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] text-zinc-200 truncate font-medium">{page.page}</p>
                                <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1">
                                  <span className="flex items-center gap-1">
                                    <MousePointer className="w-2.5 h-2.5 text-cyan-400/50" />
                                    <span className="text-zinc-300 font-semibold">{fmtNum(page.clicks)}</span> clicks
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Eye className="w-2.5 h-2.5" /> {fmtNum(page.impressions)}
                                  </span>
                                  <span>Pos <span className="text-amber-400">{page.position}</span></span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-[11px] font-bold text-zinc-300">{sharePct}%</div>
                                <div className="text-[8px] text-zinc-600">of total</div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <Search className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No page data available yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Navigation */}
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </motion.div>

      {/* Detail Drawer */}
      <OverviewDetailDrawer
        open={!!drawerContent}
        onClose={() => setDrawerContent(null)}
        content={drawerContent}
      />
    </motion.div>
  );
}

/* ─── Small helpers ─── */
function ChangeTag({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold mt-0.5 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {value > 0 ? '+' : ''}{value}%
    </span>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`bg-white/[0.02] rounded-lg p-2 border ${warn ? 'border-red-500/10' : 'border-white/[0.04]'}`}>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-bold font-mono ${warn ? 'text-red-400' : 'text-white'}`}>{value}</div>
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
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-zinc-500 font-medium tracking-wide uppercase">{label}</span>
        {showValue && change !== undefined && change !== 0 && (() => {
          const numVal = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
          const prev = Math.round(numVal / (1 + change / 100));
          return <span className="text-[9px] text-zinc-600 font-mono">was {prev.toLocaleString()}</span>;
        })()}
      </div>

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
