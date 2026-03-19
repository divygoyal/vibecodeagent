'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef, useMemo, useCallback, RefObject } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip
} from 'recharts';
import {
  Bot, BarChart3, Search, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Zap, Activity, MousePointer, Eye, Users, Hash,
  AlertTriangle, Globe, ChevronDown, ScanSearch,
  DollarSign, Target, FileWarning, ArrowRight, Flame, CheckCircle2,
  Rocket, Tag, Shield,
  Crown, XCircle, Sparkles, ChevronRight, Filter, Brain,
  MessageSquare, ExternalLink, RefreshCw
} from 'lucide-react';
import { useContainerStatus, useAnalyticsData, useSeoData, useSiteList, usePropertyList, useInsights, useRealtimeData } from '@/lib/useDashboardData';
import { useRegistration } from './layout';
import { ConnectGoogleState } from '@/components/EmptyState';
import { type AlertItem, type OpportunityItem, computeAlerts, computeOpportunities } from '@/lib/alertEngine';
import FixWithBotButton from '@/components/FixWithBotButton';
import KPICard, { type KPIAction } from '@/components/dashboard/KPICard';
import ActionCard from '@/components/dashboard/ActionCard';
import LastUpdated from '@/components/dashboard/LastUpdated';
import useKeyboardShortcuts from '@/lib/useKeyboardShortcuts';

import type { DrawerContent } from '@/components/OverviewDetailDrawer';

// Dynamic imports for heavy components (code splitting)
const OverviewInsights = dynamic(() => import('@/components/OverviewInsights'), { ssr: false });
const OverviewDetailDrawer = dynamic(() => import('@/components/OverviewDetailDrawer'), { ssr: false });
const DomainOverview = dynamic(() => import('@/components/DomainOverview'), { ssr: false });

/* ─── Animation variants ─── */
const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};
const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

/* ─── Severity Configs (from Intelligence) ─── */
const severityStyles: Record<string, { bg: string; border: string; text: string; icon: any; pulse: string; badge: string }> = {
  critical: {
    bg: 'bg-red-500/[0.06]', border: 'border-red-500/20', text: 'text-red-400',
    icon: XCircle, pulse: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/20'
  },
  warning: {
    bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', text: 'text-amber-400',
    icon: AlertTriangle, pulse: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  },
  info: {
    bg: 'bg-blue-500/[0.06]', border: 'border-blue-500/20', text: 'text-blue-400',
    icon: Eye, pulse: 'bg-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  },
  success: {
    bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', text: 'text-emerald-400',
    icon: CheckCircle2, pulse: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  },
};

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  traffic: { label: 'Traffic', icon: BarChart3, color: 'text-blue-400' },
  rankings: { label: 'Rankings', icon: Target, color: 'text-violet-400' },
  content: { label: 'Content', icon: Activity, color: 'text-amber-400' },
  opportunities: { label: 'Opportunities', icon: Sparkles, color: 'text-emerald-400' },
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

  // Keyboard shortcuts (?, Cmd+K)
  useKeyboardShortcuts();

  // Track data freshness timestamp
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 1. Container status + Google connection check
  const { botStatus, hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
  const botRunning = botStatus?.status === 'running';

  // 2. Fetch lists when Google is connected (plugins run locally, no container needed)
  const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
  const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);

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

  // Track when data was last loaded
  useEffect(() => {
    if (analyticsKPIs || seoKPIs) {
      setLastUpdated(new Date());
    }
  }, [analyticsKPIs, seoKPIs]);

  // Loading States - don't block on registration if we have a cached site (optimistic)
  const isInit = (!hasCachedSite && isRegistering) || containerLoading || (hasGoogleConnection && sitesLoading && !selectedSite);
  const isRef = analyticsLoading || seoLoading;
  // True when we have SOME data (even stale) — prevents re-showing skeletons
  const hasData = !!(analyticsKPIs || seoKPIs);

  // Empty shell: Google connected but no GA4 properties and no GSC sites
  const isEmptyShell = hasGoogleConnection && !containerLoading && !sitesLoading && !propsLoading
    && sites.length === 0 && properties.length === 0;

  // ═══ INTELLIGENCE STATE ═══
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const intelAlerts = useMemo(() => computeAlerts(seoData, analyticsData), [seoData, analyticsData]);
  const intelOpportunities = useMemo(() => computeOpportunities(seoData), [seoData]);
  const filteredAlerts = useMemo(() => {
    return intelAlerts
      .filter(a => !dismissedAlerts.has(a.id))
      .filter(a => filterCategory === 'all' || a.category === filterCategory)
      .filter(a => !filterSeverity || a.severity === filterSeverity);
  }, [intelAlerts, dismissedAlerts, filterCategory, filterSeverity]);
  const intelHealthScore = useMemo(() => {
    let score = 100;
    intelAlerts.forEach(a => {
      if (a.severity === 'critical') score -= 20;
      else if (a.severity === 'warning') score -= 10;
      else if (a.severity === 'info') score -= 3;
    });
    return Math.max(0, Math.min(100, score));
  }, [intelAlerts]);
  const intelHealthColor = intelHealthScore >= 80 ? 'text-emerald-400' : intelHealthScore >= 50 ? 'text-amber-400' : 'text-red-400';
  const intelHealthBg = intelHealthScore >= 80 ? 'from-emerald-400 to-cyan-400' : intelHealthScore >= 50 ? 'from-amber-400 to-orange-400' : 'from-red-400 to-pink-400';
  const criticalCount = intelAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = intelAlerts.filter(a => a.severity === 'warning').length;
  const opportunityCount = intelAlerts.filter(a => a.category === 'opportunities').length;
  const successCount = intelAlerts.filter(a => a.severity === 'success').length;
  const trendData = (seoData?.trend || []).slice(-14).map((d: any) => ({ v: d.clicks }));

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
    <motion.div className="space-y-8 pb-6" initial="initial" animate="animate" variants={stagger}>
      {/* Hero Header — Site Selector + Live Metrics */}
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="relative">
        {/* Header gradient background */}
        <div className="absolute inset-0 -mx-6 -mt-6 h-[200px] bg-gradient-to-b from-emerald-500/[0.04] via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-cyan-500/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white mb-1.5 tracking-tight">
              Welcome back{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''} <span className="inline-block animate-[wave_2s_ease-in-out_infinite]">👋</span>
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-sm text-zinc-500">
                Growth overview for your projects.
              </p>
              <LastUpdated timestamp={lastUpdated} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Active Users */}
            {activeUsers !== null && (
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-emerald-500/[0.06] border border-emerald-500/[0.12] rounded-xl backdrop-blur-sm">
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
              className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-primary)] text-sm rounded-lg pl-3 pr-3 py-2 hover:border-[var(--card-hover)] focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 outline-none min-w-[220px] transition-all disabled:opacity-50"
              aria-label="Select website"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            >
              <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <span className="flex-1 text-left truncate">
                {isInit ? 'Loading sites...' : selectedSiteLabel || 'No sites found'}
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && sites.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl shadow-black/60 py-1 min-w-[250px] max-h-[260px] overflow-y-auto">
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

          <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border backdrop-blur-sm ${isLive ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            {isLive ? 'Bot Live' : 'Offline'}
          </span>
          </div>
        </div>
      </motion.div>

      {/* Setup Prompt - shown when Google not connected */}
      {!containerLoading && !hasGoogleConnection && (
        <ConnectGoogleState feature="real-time traffic insights, SEO performance tracking, keyword rankings, and AI-powered recommendations" />
      )}

      {/* Getting Started - shown when Google connected but no properties/sites */}
      {isEmptyShell && (
        <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="space-y-5">
          {/* Connect Your Data Banner */}
          <div className="bg-gradient-to-r from-blue-500/[0.04] to-cyan-500/[0.03] border border-blue-500/[0.12] rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Connect Google Analytics &amp; Search Console</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Set up{' '}
                    <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">GA4</a>
                    {' '}and{' '}
                    <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">Search Console</a>
                    {' '}to unlock the full dashboard with live traffic data, keyword rankings, and AI insights.
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-medium text-white hover:bg-white/[0.1] transition-all flex-shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Check for Properties
              </button>
            </div>
          </div>

          {/* Domain Overview — SEMrush-like analysis */}
          <DomainOverview session={session} />
        </motion.div>
      )}

      {/* Bot setup prompt - shown when Google connected but bot not running */}
      {!containerLoading && hasGoogleConnection && !botRunning && !isEmptyShell && (
        <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="bg-gradient-to-r from-emerald-500/[0.04] to-cyan-500/[0.03] border border-emerald-500/[0.1] rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <p className="text-sm text-zinc-400 flex-1">Want AI-powered insights via Telegram? <Link href="/dashboard/bot" className="text-emerald-400 hover:text-emerald-300 font-medium">Set up your bot →</Link></p>
          </div>
        </motion.div>
      )}

      {!isEmptyShell && (<>
      {/* ═══ 1. KPI GRID — Top of visual hierarchy ═══ */}
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Key metrics">
        <KPICard
          loading={isRef && !hasData}
          icon={Users}
          label="Total Users"
          value={analyticsKPIs?.totalUsers}
          change={analyticsKPIs?.changeUsers}
          sparkData={trafficData.map((d: any) => ({ v: d.activeUsers }))}
          sparkColor="#34d399"
          href="/dashboard/analytics"
          boostTip={analyticsKPIs?.changeUsers !== undefined && analyticsKPIs.changeUsers < 0
            ? 'Users are declining — try publishing fresh content or running a social campaign to bring them back.'
            : 'Users are growing! Double down on your top-performing pages to accelerate growth.'}
          statusLine={activeUsers !== null ? `${activeUsers} active right now` : undefined}
          statusSeverity={activeUsers !== null && activeUsers > 0 ? 'good' : undefined}
          actions={[
            { label: 'Analyze traffic sources', href: '/dashboard/analytics', icon: BarChart3 },
            { label: 'AI content strategy', href: '/dashboard/seo', icon: Sparkles },
            { label: 'Run site audit', href: '/dashboard/audit', icon: ScanSearch },
          ]}
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
          boostTip={analyticsKPIs?.changePageViews !== undefined && analyticsKPIs.changePageViews < 0
            ? 'Page views dropped — check for broken pages, improve internal linking, or refresh underperforming content.'
            : 'Views are up! Add internal links from high-traffic pages to boost engagement further.'}
          statusLine={analyticsKPIs?.changePageViews !== undefined
            ? `${Math.abs(analyticsKPIs.changePageViews)}% ${analyticsKPIs.changePageViews >= 0 ? 'increase' : 'decrease'} vs last period`
            : undefined}
          statusSeverity={analyticsKPIs?.changePageViews !== undefined
            ? (analyticsKPIs.changePageViews >= 0 ? 'good' : analyticsKPIs.changePageViews > -20 ? 'warning' : 'critical')
            : undefined}
          actions={[
            { label: 'Find top-performing pages', href: '/dashboard/analytics', icon: Flame },
            { label: 'Optimize slow pages', href: '/dashboard/audit', icon: Zap },
            { label: 'Generate blog content', href: '/dashboard/seo', icon: Sparkles },
          ]}
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
          boostTip={seoKPIs?.changeClicks !== undefined && seoKPIs.changeClicks < 0
            ? 'Clicks are falling — improve meta titles & descriptions on your top pages to boost CTR.'
            : 'Clicks trending up! Optimize striking-distance keywords (positions 4-15) for even more traffic.'}
          statusLine={seoKPIs?.totalImpressions
            ? `${((seoKPIs.totalClicks || 0) / seoKPIs.totalImpressions * 100).toFixed(1)}% avg CTR`
            : undefined}
          statusSeverity={seoKPIs?.totalImpressions
            ? (((seoKPIs.totalClicks || 0) / seoKPIs.totalImpressions * 100) >= 3 ? 'good' : ((seoKPIs.totalClicks || 0) / seoKPIs.totalImpressions * 100) >= 1.5 ? 'warning' : 'critical')
            : undefined}
          actions={[
            { label: 'Find low-CTR opportunities', href: '/dashboard/seo', icon: Target },
            { label: 'AI keyword research', href: '/dashboard/seo', icon: Search },
            { label: 'Ask AI for boost plan', href: '/dashboard/intelligence', icon: Brain },
          ]}
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
          boostTip={seoKPIs?.avgPosition !== undefined && parseFloat(String(seoKPIs.avgPosition)) > 20
            ? 'Position is high (far from #1) — focus on building backlinks and improving content depth.'
            : seoKPIs?.changePosition !== undefined && seoKPIs.changePosition > 0
              ? 'Rankings slipping — update content freshness and check for new competitors.'
              : 'Rankings are strong! Target featured snippets and People Also Ask to dominate the SERP.'}
          statusLine={seoKPIs?.avgPosition !== undefined
            ? (parseFloat(String(seoKPIs.avgPosition)) <= 10 ? 'Page 1 average' : parseFloat(String(seoKPIs.avgPosition)) <= 20 ? 'Page 2 average' : `Page ${Math.ceil(parseFloat(String(seoKPIs.avgPosition)) / 10)} average`)
            : undefined}
          statusSeverity={seoKPIs?.avgPosition !== undefined
            ? (parseFloat(String(seoKPIs.avgPosition)) <= 10 ? 'good' : parseFloat(String(seoKPIs.avgPosition)) <= 20 ? 'warning' : 'critical')
            : undefined}
          actions={[
            { label: 'Find striking-distance keywords', href: '/dashboard/seo', icon: Target },
            { label: 'Run full SEO audit', href: '/dashboard/audit', icon: ScanSearch },
            { label: 'AI ranking strategy', href: '/dashboard/intelligence', icon: Rocket },
          ]}
        />
      </motion.div>

      {/* ═══ 2. INTELLIGENCE — Top Stats + Filter Bar + Active Alerts ═══ */}
      {hasData && (seoData || analyticsData) && (
        <>
          {/* Filter Bar */}
          <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="flex items-center gap-2 flex-wrap bg-white/[0.02] border border-white/[0.04] rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1.5 mr-2">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500 font-medium">Filter:</span>
            </div>
            <button onClick={() => setFilterCategory('all')}
              aria-pressed={filterCategory === 'all'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterCategory === 'all' ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'}`}>
              All
            </button>
            {Object.entries(categoryConfig).map(([key, cfg]) => {
              const count = intelAlerts.filter(a => a.category === key).length;
              return (
                <button key={key} onClick={() => setFilterCategory(key)}
                  aria-pressed={filterCategory === key}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${filterCategory === key ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'}`}>
                  <cfg.icon className={`w-3 h-3 ${cfg.color}`} />
                  {cfg.label}
                  {count > 0 && <span className="text-[9px] bg-white/[0.06] px-1.5 py-0.5 rounded-full">{count}</span>}
                </button>
              );
            })}

            <div className="w-px h-5 bg-white/[0.06] mx-1" />

            {(['critical', 'warning', 'info', 'success'] as const).map(sev => {
              const count = intelAlerts.filter(a => a.severity === sev).length;
              if (count === 0) return null;
              const cfg = severityStyles[sev];
              return (
                <button key={sev} onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                  aria-pressed={filterSeverity === sev}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 border ${filterSeverity === sev ? cfg.badge + ' ' + cfg.border : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.pulse}`} aria-hidden="true" />
                  {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                </button>
              );
            })}
          </motion.div>

          {/* Active Alerts Feed */}
          <motion.div variants={fadeInUp} transition={{ duration: 0.35 }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 flex items-center justify-center border border-emerald-500/15">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Active Alerts</h2>
                <span className="text-[10px] text-zinc-500">
                  {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''} detected
                </span>
              </div>
            </div>

            {filteredAlerts.length === 0 ? (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">All clear!</h3>
                <p className="text-xs text-zinc-500">
                  {filterCategory !== 'all' || filterSeverity
                    ? 'No alerts match your current filters.'
                    : 'No issues detected. Your site is performing well.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {filteredAlerts.map((alert) => {
                    const cfg = severityStyles[alert.severity];
                    const Icon = cfg.icon;
                    const catCfg = categoryConfig[alert.category];
                    const isExpanded = expandedAlert === alert.id;

                    return (
                      <motion.div
                        key={alert.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`${cfg.bg} border ${cfg.border} rounded-xl overflow-hidden transition-all duration-200 hover:bg-opacity-10 cursor-pointer group`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedAlert(isExpanded ? null : alert.id); } }}
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
                              <Icon className={`w-4 h-4 ${cfg.text}`} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-sm font-semibold text-white">{alert.title}</h3>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${cfg.badge}`}>
                                  {alert.severity}
                                </span>
                                {catCfg && (
                                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 font-medium flex items-center gap-1">
                                    <catCfg.icon className="w-2.5 h-2.5" />
                                    {catCfg.label}
                                  </span>
                                )}
                              </div>

                              {alert.change !== undefined && (
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  {alert.metric && <span className="text-xs text-zinc-400">{alert.metric}</span>}
                                  <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${alert.change >= 0 ? (alert.type === 'ranking_loss' ? 'text-red-400' : 'text-emerald-400') : 'text-red-400'}`}>
                                    {alert.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {alert.change > 0 ? '+' : ''}{alert.change}%
                                  </span>
                                  {/* Estimated revenue impact for traffic/click drops */}
                                  {alert.change < -10 && (alert.category === 'traffic' || alert.type === 'traffic_drop') && (
                                    <span className="text-[9px] px-2 py-0.5 rounded bg-red-500/[0.08] text-red-400/80 border border-red-500/10 font-medium">
                                      ~${Math.abs(Math.round((alert.change / 100) * (parseInt(String(seoKPIs?.totalClicks || 0)) || 0) * 0.5))}/mo impact
                                    </span>
                                  )}
                                </div>
                              )}
                              {!alert.change && alert.metric && (
                                <span className="text-xs text-zinc-500">{alert.metric}</span>
                              )}
                            </div>

                            <ChevronRight className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                                  <p className="text-xs text-zinc-400 leading-relaxed mb-3">{alert.description}</p>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <FixWithBotButton
                                      label="Fix This"
                                      size="sm"
                                      variant="ghost"
                                      site={selectedSite}
                                      context={`Analyze and fix: ${alert.title}. ${alert.description}${alert.metric ? ` Metric: ${alert.metric}` : ''}${alert.change !== undefined ? ` Change: ${alert.change}%` : ''}`}
                                    />
                                    <button
                                      onClick={() => setDismissedAlerts(prev => new Set(prev).add(alert.id))}
                                      className="px-3 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-white/[0.04] transition"
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* ═══ 3. COMMAND CENTER — Compact row: Score + Velocity + Branded Split ═══ */}
      {hasData && (
        <motion.div variants={fadeInUp} transition={{ duration: 0.35 }}>
          {/* Section divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Performance</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Performance Score Gauge */}
          {performanceScore !== null && scoreData && (
            <div onClick={() => setDrawerContent({ type: 'score', title: 'SEO Score Breakdown', data: scoreData })} className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all duration-500 cursor-pointer group overflow-hidden">
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
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-bold ${performanceScore >= 70 ? 'text-emerald-400' : performanceScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                    {performanceScore >= 80 ? 'Excellent' : performanceScore >= 60 ? 'Good' : performanceScore >= 40 ? 'Needs Work' : 'Critical'}
                  </span>
                  <span className="text-[9px] text-zinc-600 font-mono">/100</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  Traffic {(analyticsKPIs?.changeUsers || 0) >= 0 ? '+' : ''}{analyticsKPIs?.changeUsers || 0}% · CTR {seoKPIs?.avgCTR || '—'}% · Pos {seoKPIs?.avgPosition || '—'}
                </div>
                <div className="text-[9px] text-zinc-700 mt-0.5">Industry avg: 55 · Your niche: {performanceScore >= 60 ? 'above' : 'below'} par</div>
              </div>
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
                <div className="text-[10px] text-zinc-400">Click for full breakdown</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
              </div>
            </div>
          )}

          {/* Growth Velocity */}
          <div onClick={() => velocityData && setDrawerContent({ type: 'velocity', title: 'Growth Velocity', data: velocityData })} className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all duration-500 cursor-pointer group overflow-hidden">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              growthVelocity !== null && growthVelocity > 0
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : growthVelocity !== null && growthVelocity < -5
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-white/[0.04] border border-white/[0.04]'
            }`}>
              <Rocket className={`w-5 h-5 ${
                growthVelocity !== null && growthVelocity > 0 ? 'text-emerald-400' :
                growthVelocity !== null && growthVelocity < -5 ? 'text-red-400' : 'text-zinc-400'
              }`} />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Growth Velocity</div>
              {growthVelocity !== null && velocityData ? (
                <>
                  <div className={`text-lg font-bold font-mono ${growthVelocity > 0 ? 'text-emerald-400' : growthVelocity < -5 ? 'text-red-400' : 'text-amber-400'}`}>
                    {growthVelocity > 0 ? '+' : ''}{growthVelocity.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    Search clicks: {fmtNum(velocityData.recentClicks)} vs {fmtNum(velocityData.prevClicks)} prev week
                  </div>
                  <div className="text-[9px] text-zinc-700 mt-0.5">
                    {growthVelocity > 10 ? 'Strong momentum — sustain with fresh content' :
                     growthVelocity > 0 ? 'Positive trend — optimize top keywords for faster growth' :
                     growthVelocity > -5 ? 'Plateauing — try new content angles or target new keywords' :
                     'Declining clicks — review top pages for ranking drops'}
                  </div>
                </>
              ) : (
                <div className="text-sm text-zinc-600">Needs 14+ days of data</div>
              )}
            </div>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
              <div className="text-[10px] text-zinc-400">Click for trend breakdown</div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
            </div>
          </div>

          {/* Branded vs Non-Branded Split */}
          <div onClick={() => brandedSplit && setDrawerContent({ type: 'brand', title: 'Brand vs Organic', data: brandedSplit })} className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all duration-500 cursor-pointer group overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Brand vs Organic Traffic</span>
            </div>
            {brandedSplit ? (
              <>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-lg font-bold text-white font-mono">{brandedSplit.nonBrandedPct}%</span>
                  <span className="text-[10px] text-zinc-500 mb-0.5">organic (non-branded) clicks</span>
                </div>
                <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden flex">
                  <div className="bg-cyan-400/80 rounded-l-full transition-all duration-700" style={{ width: `${brandedSplit.nonBrandedPct}%` }} />
                  <div className="bg-amber-400/60 rounded-r-full transition-all duration-700" style={{ width: `${brandedSplit.brandedPct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-cyan-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
                    {fmtNum(brandedSplit.nonBranded)} organic clicks ({brandedSplit.nonBrandedPct}%)
                  </span>
                  <span className="text-[9px] text-amber-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                    {fmtNum(brandedSplit.branded)} branded ({brandedSplit.brandedPct}%)
                  </span>
                </div>
                <div className="mt-2 text-[9px] text-zinc-600 bg-white/[0.02] border border-white/[0.04] rounded px-2 py-1.5">
                  {brandedSplit.brandedPct > 60
                    ? '⚠️ High brand reliance — diversify organic keywords to reduce dependency'
                    : brandedSplit.brandedPct < 10
                    ? '✅ Strong organic mix — most traffic comes from non-brand keywords'
                    : `Healthy mix. ${brandedSplit.nonBrandedPct}% of clicks come from organic discovery.`}
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-600">Not enough query data</div>
            )}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
              <div className="text-[10px] text-zinc-400">Click for brand analysis</div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
            </div>
          </div>
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

          {/* ═══ INTELLIGENCE: Top Opportunities Table ═══ */}
          {intelOpportunities.length > 0 && (
            <motion.div variants={fadeInUp} transition={{ duration: 0.35 }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/15">
                  <Target className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Top Opportunities</h2>
                  <span className="text-[10px] text-zinc-500">{intelOpportunities.length} keywords to optimize</span>
                </div>
              </div>

              <div className="bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-zinc-500 border-b border-white/[0.04]">
                        <th className="text-left py-3 px-4 font-medium">Keyword</th>
                        <th className="text-right py-3 px-4 font-medium">Position</th>
                        <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Impressions</th>
                        <th className="text-right py-3 px-4 font-medium hidden md:table-cell">Current CTR</th>
                        <th className="text-right py-3 px-4 font-medium">Potential Clicks</th>
                        <th className="text-right py-3 px-4 font-medium hidden lg:table-cell">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelOpportunities.map((opp, i) => {
                        const typeLabels: Record<string, { label: string; style: string }> = {
                          striking_distance: { label: 'Striking Distance', style: 'bg-violet-500/10 text-violet-400' },
                          ctr_fix: { label: 'CTR Fix', style: 'bg-amber-500/10 text-amber-400' },
                          quick_win: { label: 'Quick Win', style: 'bg-emerald-500/10 text-emerald-400' },
                          rising: { label: 'Rising', style: 'bg-blue-500/10 text-blue-400' },
                        };
                        const typeInfo = typeLabels[opp.type] || { label: opp.type, style: 'bg-zinc-500/10 text-zinc-400' };

                        return (
                          <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition group">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Search className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                                <span className="text-zinc-300 font-medium truncate max-w-[200px]">{opp.query}</span>
                              </div>
                            </td>
                            <td className="text-right py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${opp.position <= 5 ? 'bg-emerald-400/10 text-emerald-400'
                                : opp.position <= 10 ? 'bg-amber-400/10 text-amber-400'
                                  : 'bg-red-400/10 text-red-400'
                                }`}>
                                #{opp.position.toFixed(1)}
                              </span>
                            </td>
                            <td className="text-right py-3 px-4 text-zinc-400 hidden sm:table-cell">{opp.impressions.toLocaleString()}</td>
                            <td className="text-right py-3 px-4 text-zinc-400 hidden md:table-cell">{opp.ctr}%</td>
                            <td className="text-right py-3 px-4">
                              <span className="text-emerald-400 font-semibold">+{opp.potentialClicks.toLocaleString()}</span>
                            </td>
                            <td className="text-right py-3 px-4 hidden lg:table-cell">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeInfo.style}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ INTELLIGENCE: Insight Cards Grid ═══ */}
          <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* CTR Benchmark Card */}
            <div className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 hover:border-violet-500/20 hover:shadow-[0_0_30px_rgba(167,139,250,0.05)] transition-all duration-500 group overflow-hidden">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <MousePointer className="w-4 h-4 text-violet-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">CTR Benchmark</h3>
              </div>
              {(() => {
                const queries = seoData?.queries || [];
                const top5 = queries.filter((q: any) => q.position <= 5 && q.impressions > 50);
                const avgCtr = top5.length > 0 ? top5.reduce((s: number, q: any) => s + q.ctr, 0) / top5.length : 0;
                const benchmark = 18.0;
                const good = avgCtr >= benchmark;
                return (
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`text-2xl font-bold ${good ? 'text-emerald-400' : 'text-amber-400'}`}>{avgCtr.toFixed(1)}%</span>
                      <span className="text-xs text-zinc-500">vs {benchmark}% industry avg</span>
                    </div>
                    <div className="text-[9px] text-zinc-600 mb-2">
                      Avg CTR for your top-5 ranked keywords ({top5.length} keywords with 50+ impressions)
                    </div>
                    <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden mb-2 relative">
                      <div className={`h-full rounded-full transition-all ${good ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(100, (avgCtr / 30) * 100)}%` }} />
                      {/* Benchmark marker */}
                      <div className="absolute top-0 h-full w-px bg-zinc-400/40" style={{ left: `${(benchmark / 30) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-600">
                      {good ? '✅ Above industry average! Your meta titles & descriptions are compelling.' : '⚠️ Below average — rewrite meta titles with action words and numbers to improve CTR.'}
                    </p>
                  </div>
                );
              })()}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
                <div className="text-[10px] text-zinc-400">CTR for top-5 positions vs industry avg</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
              </div>
            </div>

            {/* Keyword Distribution */}
            <div className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 hover:border-blue-500/20 hover:shadow-[0_0_30px_rgba(59,130,246,0.05)] transition-all duration-500 group overflow-hidden">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Hash className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">Keyword Distribution</h3>
              </div>
              {(() => {
                const queries = seoData?.queries || [];
                const buckets = [
                  { label: 'Top 3', count: queries.filter((q: any) => q.position <= 3).length, color: 'bg-emerald-400' },
                  { label: 'Pos 4\u201310', count: queries.filter((q: any) => q.position > 3 && q.position <= 10).length, color: 'bg-cyan-400' },
                  { label: 'Pos 11\u201320', count: queries.filter((q: any) => q.position > 10 && q.position <= 20).length, color: 'bg-amber-400' },
                  { label: 'Pos 20+', count: queries.filter((q: any) => q.position > 20).length, color: 'bg-zinc-600' },
                ];
                const total = Math.max(1, queries.length);
                const page1Count = buckets[0].count + buckets[1].count;
                return (
                  <div>
                    <div className="text-[9px] text-zinc-600 mb-3">
                      {total} tracked keywords · {page1Count} on page 1 ({Math.round((page1Count / total) * 100)}%)
                    </div>
                    <div className="space-y-2.5">
                      {buckets.map(b => (
                        <div key={b.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-400">{b.label}</span>
                            <span className="text-xs font-semibold text-zinc-300">{b.count} of {total} <span className="text-zinc-600">({Math.round((b.count / total) * 100)}%)</span></span>
                          </div>
                          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${b.color} transition-all duration-500`}
                              style={{ width: `${(b.count / total) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-zinc-600 mt-2.5">
                      {page1Count >= total * 0.5 ? '✅ Over half your keywords are on page 1' : `⚠️ ${total - page1Count} keywords need optimization to reach page 1`}
                    </p>
                  </div>
                );
              })()}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
                <div className="text-[10px] text-zinc-400">Keywords grouped by search ranking position</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
              </div>
            </div>

            {/* Quick Trend */}
            <div className="relative bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 hover:border-emerald-500/20 hover:shadow-[0_0_30px_rgba(52,211,153,0.05)] transition-all duration-500 group overflow-hidden">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">14-Day Trend</h3>
              </div>
              {trendData.length > 2 ? (
                <div className="h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="trendGradOverview" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <div className="bg-zinc-900 border border-white/[0.1] rounded px-2 py-1 text-[10px] text-zinc-300">
                            {payload[0].value?.toLocaleString()} clicks
                          </div>
                        ) : null
                      } />
                      <Area type="monotone" dataKey="v" stroke="#34d399" fill="url(#trendGradOverview)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Not enough data to show trend</p>
              )}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#0a0a0f] border border-white/[0.08] shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
                <div className="text-[10px] text-zinc-400">Daily search clicks from Google Search Console (14 days)</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0a0a0f]" />
              </div>
            </div>
          </motion.div>

          {/* ═══ INTELLIGENCE: What's Working ═══ */}
          {(() => {
            const queries = seoData?.queries || [];
            const topPerformers = queries.filter((q: any) => q.position <= 3 && q.clicks > 5).slice(0, 5);
            if (topPerformers.length === 0) return null;
            return (
              <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="bg-gradient-to-r from-emerald-500/[0.04] via-cyan-500/[0.02] to-emerald-500/[0.04] border border-emerald-500/[0.12] rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-400/[0.05] to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="flex items-center gap-3 mb-5 relative">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20">
                    <Crown className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">What&apos;s Working</h2>
                    <span className="text-[10px] text-emerald-400/70">Top performing keywords</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {topPerformers.map((q: any, i: number) => (
                    <div key={i} className="bg-white/[0.03] border border-emerald-500/[0.1] rounded-xl p-3">
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-bold">#{q.position.toFixed(0)}</span>
                        <Flame className="w-3 h-3 text-amber-400" />
                      </div>
                      <p className="text-xs text-zinc-300 font-medium truncate mb-1">{q.query}</p>
                      <p className="text-[10px] text-zinc-500">{q.clicks} clicks &middot; {q.impressions.toLocaleString()} imp</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })()}

          {/* ═══ INTELLIGENCE: Ask AI Deeper ═══ */}
          <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="mt-2">
            {/* Section divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/10 to-transparent" />
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">AI Intelligence</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/10 to-transparent" />
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center border border-violet-500/15">
                <Brain className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Ask AI Deeper</h2>
                <p className="text-[10px] text-zinc-500">Click any question to get an AI-powered deep analysis</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Emergency */}
              <div className="bg-[#0a0a12]/80 border border-red-500/[0.12] rounded-2xl p-4 hover:border-red-500/25 transition-all duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Emergency</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'Why did my traffic drop?',
                    'Is my site penalized by Google?',
                    'Did a Google algorithm update hit me?',
                    'Which pages are throwing errors?',
                  ].map(q => (
                    <button key={q} onClick={() => {
                      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: q, site: selectedSite } }));
                    }}
                      className="w-full text-left text-xs text-zinc-400 hover:text-white py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition flex items-center gap-2 group">
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-red-400 transition flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Money */}
              <div className="bg-[#0a0a12]/80 border border-amber-500/[0.12] rounded-2xl p-4 hover:border-amber-500/25 transition-all duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Revenue & ROI</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'Which pages are money pits? (high impressions, low clicks)',
                    'Which keywords can I push from page 2 to page 1?',
                    'Show me pages that drive 80% of my traffic',
                    'What is my most underrated blog post?',
                  ].map(q => (
                    <button key={q} onClick={() => {
                      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: q, site: selectedSite } }));
                    }}
                      className="w-full text-left text-xs text-zinc-400 hover:text-white py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition flex items-center gap-2 group">
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-amber-400 transition flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Strategy */}
              <div className="bg-[#0a0a12]/80 border border-emerald-500/[0.12] rounded-2xl p-4 hover:border-emerald-500/25 transition-all duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Content Strategy</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'What keywords should I target that I don\'t have pages for?',
                    'Give me 5 blog post titles based on my search data',
                    'Which old blog posts need a content refresh?',
                    'Should I translate my site? Into which language?',
                  ].map(q => (
                    <button key={q} onClick={() => {
                      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: q, site: selectedSite } }));
                    }}
                      className="w-full text-left text-xs text-zinc-400 hover:text-white py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition flex items-center gap-2 group">
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 transition flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deep Dive */}
              <div className="bg-[#0a0a12]/80 border border-blue-500/[0.12] rounded-2xl p-4 hover:border-blue-500/25 transition-all duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Deep Dive</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'Compare my traffic this week vs last week',
                    'Who is linking to me? Show top referrals',
                    'How does my traffic change on weekends vs weekdays?',
                    'Is my viral traffic sticking around or bouncing?',
                  ].map(q => (
                    <button key={q} onClick={() => {
                      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: q, site: selectedSite } }));
                    }}
                      className="w-full text-left text-xs text-zinc-400 hover:text-white py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition flex items-center gap-2 group">
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-blue-400 transition flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technical SEO */}
              <div className="bg-[#0a0a12]/80 border border-violet-500/[0.12] rounded-2xl p-4 hover:border-violet-500/25 transition-all duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Technical SEO</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'Are my Core Web Vitals hurting my ranking?',
                    'How many of my pages are actually indexed?',
                    'Which pages are being crawled but not indexed?',
                    'Do I have any duplicate content issues?',
                  ].map(q => (
                    <button key={q} onClick={() => {
                      window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: q, site: selectedSite } }));
                    }}
                      className="w-full text-left text-xs text-zinc-400 hover:text-white py-1.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition flex items-center gap-2 group">
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Killer Feature */}
              <div className="bg-gradient-to-br from-violet-500/[0.06] to-emerald-500/[0.06] border border-violet-500/20 rounded-2xl p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-violet-400 to-emerald-400 flex items-center justify-center">
                    <Target className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400 uppercase tracking-wider">Killer Feature</span>
                </div>
                <button onClick={() => {
                  window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: 'Audit my site and tell me the ONE thing I should do today to grow', site: selectedSite } }));
                }}
                  className="flex-1 text-left rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] p-4 hover:border-violet-500/30 transition group cursor-pointer">
                  <p className="text-sm font-semibold text-white mb-1 group-hover:text-violet-300 transition">
                    &quot;What&apos;s the ONE thing I should do today to grow?&quot;
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    The AI runs all checks, finds the biggest opportunity, and presents just that one task.
                  </p>
                </button>
              </div>
            </div>
          </motion.div>

          {/* Section divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Insights</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          </div>

          {/* Row 1: Site Health + Money Opportunities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Site Health Pulse */}
            <div onClick={() => setDrawerContent({ type: 'health', title: 'Site Health', data: { verdict: computedInsights.healthVerdict, changeUsers: analyticsKPIs?.changeUsers || 0, changeClicks: seoKPIs?.changeClicks || 0, avgCTR: seoKPIs?.avgCTR, avgPosition: seoKPIs?.avgPosition } })} className="bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all duration-500 cursor-pointer">
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

            {/* Money Opportunities — Striking Distance */}
            <div className="bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
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

                            {/* Revenue badge + Actions */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {kw.potentialClicks > 0 && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-2 py-1 rounded-lg">
                                  +{kw.potentialClicks} clicks
                                </span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `How can I optimize my page to rank higher for "${kw.query}"? Current position: ${kw.position}`, site: selectedSite } }))}
                                  className="text-[8px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 border border-violet-500/15 hover:bg-violet-500/20 transition"
                                >
                                  Optimize
                                </button>
                                <button
                                  onClick={() => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Analyze the SERP competition for "${kw.query}" and suggest content improvements`, site: selectedSite } }))}
                                  className="text-[8px] px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 hover:bg-cyan-500/20 transition"
                                >
                                  Analyze
                                </button>
                              </div>
                            </div>
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

            {/* Quick Wins — CTR Problems */}
            <div className="bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Rewrite the meta title and description for my page ranking for "${item.query}" at position ${item.position}. Current CTR is ${item.actualCTR}% but expected is ${item.expectedCTR}%. Suggest 3 compelling alternatives.`, site: selectedSite } }));
                              }}
                              className="text-[9px] text-amber-400 bg-amber-500/[0.08] border border-amber-500/10 px-2 py-0.5 rounded hover:bg-amber-500/15 transition"
                            >
                              Fix meta title →
                            </button>
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

            {/* Top Performing Pages */}
            <div className="bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
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
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }}>
        {/* Section divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Quick Access</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>
      </motion.div>
      <motion.div variants={fadeInUp} transition={{ duration: 0.35 }} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      </>)}

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

/* KPICard and ActionCard extracted to @/components/dashboard/ */
