'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  ExternalLink,
  FileDown,
  FileText,
  Globe,
  Loader2,
  Rocket,
  Shield,
  X,
  Zap,
} from 'lucide-react';

import { formatSiteLabel } from '@/lib/dashboardSelection';
import { DEMO_DOMAIN_LABEL, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useAnalyticsData, useSeoData, useSiteList, usePropertyList, useRealtimeData, useGoalsData } from '@/lib/useDashboardData';
import { computeAlerts, computeOpportunities } from '@/lib/alertEngine';
import { getDashboardBriefing } from '@/lib/dashboardBriefing';
import { useRegistration } from './layout';
import DemoModeBanner from '@/components/DemoModeBanner';
import { ConnectGoogleState } from '@/components/EmptyState';
import OverviewCommandCenter from '@/components/dashboard/OverviewCommandCenterV2';
import MobileOverviewAppShell from '@/components/dashboard/MobileOverviewAppShell';
import MobileBottomBar from '@/components/dashboard/MobileBottomBar';
import RecentActivity from '@/components/dashboard/RecentActivity';
import GoalProgress from '@/components/dashboard/GoalProgress';
import IndexingStatus from '@/components/dashboard/IndexingStatus';
import useKeyboardShortcuts from '@/lib/useKeyboardShortcuts';
import { OnboardingFunnel } from '@/components/OnboardingFunnel';
import { WorkspaceTabs, type WorkspaceTab } from '@/components/workspace/WorkspaceTabs';
import ContentEditor from '@/components/workspace/ContentEditor';
import KeywordResearch from '@/components/workspace/KeywordResearch';
import CompetitorSpy from '@/components/workspace/CompetitorSpy';
import SiteCrawler from '@/components/workspace/SiteCrawler';

import type { DomainOverviewData } from '@/components/domain-overview/types';
import type { GlobeVisitor } from '@/components/globe/RealtimeGlobeMaplibre';

const DomainOverview = dynamic(() => import('@/components/DomainOverview'), { ssr: false });
const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });
const LiveVisitorDrawer = dynamic(() => import('@/components/analytics/LiveVisitorDrawer'), { ssr: false });

const PREVIEW_VISITORS: GlobeVisitor[] = [
  { id: 'p1', name: 'moss tiger', country: 'United States', lat: 37.09, lng: -95.71, warmth: 0.7, avatarColor: '#059669', avatarInitial: 'M' },
  { id: 'p2', name: 'amber fox', country: 'United Kingdom', lat: 55.37, lng: -3.43, warmth: 0.6, avatarColor: '#d97706', avatarInitial: 'A' },
  { id: 'p3', name: 'bronze owl', country: 'India', lat: 20.59, lng: 78.96, warmth: 0.5, avatarColor: '#0891b2', avatarInitial: 'B' },
  { id: 'p4', name: 'coral falcon', country: 'Germany', lat: 51.16, lng: 10.45, warmth: 0.65, avatarColor: '#e11d48', avatarInitial: 'C' },
  { id: 'p5', name: 'indigo finch', country: 'Brazil', lat: -14.23, lng: -51.92, warmth: 0.35, avatarColor: '#4f46e5', avatarInitial: 'I' },
  { id: 'p6', name: 'ruby wolf', country: 'Japan', lat: 36.2, lng: 138.25, warmth: 0.8, avatarColor: '#dc2626', avatarInitial: 'R' },
];

type AnalyticsPoint = {
  date?: string;
  activeUsers?: number;
  sessions?: number;
  pageViews?: number;
  bounceRate?: number;
};

type SearchTrendPoint = {
  date?: string;
  clicks?: number;
  impressions?: number;
  position?: number;
  ctr?: number;
};

type AnalyticsKpis = {
  totalUsers?: number;
  totalSessions?: number;
  totalPageViews?: number;
  avgBounceRate?: number;
  changeUsers?: number;
  changeSessions?: number;
  changePageViews?: number;
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

type DashboardAnalyticsData = {
  kpis?: AnalyticsKpis;
  traffic?: AnalyticsPoint[];
};

type DashboardSeoData = {
  kpis?: SeoKpis;
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

export default function DashboardOverview() {
  const { data: session } = useSession();
    const {
        registrationError,
        retryRegistration,
        selectedSite,
        resolvedSiteUrl,
        resolvedPropertyId,
        propertyInventoryError,
        siteInventoryError,
        isDemoWorkspace,
        demoDomainLabel,
        range,
    } = useRegistration();

  useKeyboardShortcuts();

  const [liveDrawerOpen, setLiveDrawerOpen] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('analysis');
  const [funnelCompleted, setFunnelCompleted] = useState(false);
  const [domainData, setDomainData] = useState<DomainOverviewData | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const { botStatus, hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
  const botRunning = botStatus?.status === 'running';
  const { sites, isLoading: sitesLoading, error: sitesRequestError, refresh: refreshSites } = useSiteList(hasGoogleConnection);
  const { properties, isLoading: propsLoading, error: propsRequestError, refresh: refreshProperties } = usePropertyList(hasGoogleConnection);
  const activeSiteUrl = isDemoWorkspace ? DEMO_SITE_URL : (resolvedSiteUrl || (siteInventoryError ? selectedSite : ''));
  const reportPropertyId = resolvedPropertyId;
  const isSeoOnlyReport = !reportPropertyId;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFunnelCompleted(localStorage.getItem('tc-funnel-completed') === 'true');
  }, []);
  const hasCachedSite = !!activeSiteUrl;
  const canFetchSeoData = hasGoogleConnection && (isDemoWorkspace || hasCachedSite);
  const canFetchAnalyticsData = canFetchSeoData && (isDemoWorkspace || !!resolvedPropertyId);

  const { data: analyticsData, isLoading: analyticsLoading, refresh: refreshAnalytics } = useAnalyticsData('all', resolvedPropertyId, canFetchAnalyticsData, range, isDemoWorkspace);
  const { data: seoData, isLoading: seoLoading, refresh: refreshSeo } = useSeoData('all', activeSiteUrl, canFetchSeoData, range, isDemoWorkspace);
  const { data: goalsData } = useGoalsData(resolvedPropertyId, canFetchAnalyticsData, range, isDemoWorkspace);

  const analyticsDashboardData = analyticsData as DashboardAnalyticsData | undefined;
  const seoDashboardData = seoData as DashboardSeoData | undefined;
  const typedGoalsData = goalsData as GoalsResponse | undefined;
  const analyticsKPIs = analyticsDashboardData?.kpis;
  const seoKPIs = seoDashboardData?.kpis;
  const trafficData = useMemo(
    () => (Array.isArray(analyticsDashboardData?.traffic) ? analyticsDashboardData.traffic : []),
    [analyticsDashboardData?.traffic],
  );
  const searchTrend = useMemo(
    () => (Array.isArray(seoDashboardData?.trend) ? seoDashboardData.trend : []),
    [seoDashboardData?.trend],
  );
  const hasData = !!(analyticsKPIs || seoKPIs);

  const { data: realtimeData } = useRealtimeData(resolvedPropertyId, canFetchAnalyticsData && hasData, isDemoWorkspace);
  const activeUsers = typeof realtimeData?.activeUsers === 'number' ? realtimeData.activeUsers : null;
  const isLive = botRunning && botStatus?.telegramStatus === 'connected';

  const sessionUser = session?.user as { googleAccessToken?: string } | undefined;
  const sessionHasGoogleToken = !!sessionUser?.googleAccessToken;

  const isRef = analyticsLoading || seoLoading;
  const showConnectGoogle = !containerLoading ? !hasGoogleConnection : !sessionHasGoogleToken;
  const inventoryError = propertyInventoryError || siteInventoryError || (propsRequestError instanceof Error ? propsRequestError.message : null) || (sitesRequestError instanceof Error ? sitesRequestError.message : null);
  const isCheckingData = hasGoogleConnection && !containerLoading && !inventoryError && (sitesLoading || propsLoading);
  const isEmptyShell = hasGoogleConnection && !containerLoading && !sitesLoading && !propsLoading && !inventoryError && sites.length === 0 && properties.length === 0 && !isDemoWorkspace;

  // Track how many times data has finished loading (loading transition true->false with data present)
  const loadCountRef = useRef(0);
  const prevIsRefRef = useRef(isRef);
  if (prevIsRefRef.current && !isRef && (analyticsKPIs || seoKPIs)) {
    loadCountRef.current += 1;
  }
  prevIsRefRef.current = isRef;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastUpdated = useMemo(() => (loadCountRef.current > 0 ? new Date() : null), [loadCountRef.current]);

  const selectedSiteLabel = isDemoWorkspace ? demoDomainLabel : (activeSiteUrl ? formatSiteLabel(activeSiteUrl) : '');

  // Personalized greeting
  const firstName = session?.user?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Welcome back, ${firstName}.` : 'Welcome back.';

  // Phase 3: Compute alerts for the activity feed
  const recentAlerts = useMemo(
    () => (hasData ? computeAlerts(seoData, analyticsData) : []),
    [hasData, seoData, analyticsData],
  );
  const pageBriefing = useMemo(() => {
    const opportunities = hasData ? computeOpportunities(seoData) : [];
    const goals = Array.isArray(typedGoalsData?.goals) ? typedGoalsData.goals : [];
    const pages = Array.isArray(seoData?.pages) ? seoData.pages : [];
    const search = Array.isArray(searchTrend) ? searchTrend : [];
    const traffic = Array.isArray(trafficData) ? trafficData : [];
    const topGoal = [...goals].sort((a, b) => b.conversions - a.conversions)[0];
    const topOpp = opportunities[0];
    const topPage = [...pages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0];
    const goalsOnTrack = goals.filter((goal) => (goal.change ?? 0) >= 0).length;
    const riskCount = recentAlerts.filter(
      (alert) => alert.severity === 'critical' || alert.severity === 'warning',
    ).length;
    const lastVisibleDate =
      search[search.length - 1]?.date ||
      traffic[traffic.length - 1]?.date ||
      lastUpdated?.toISOString() ||
      null;

    return getDashboardBriefing({
      hasData,
      selectedSiteLabel,
      range,
      rangeLabel:
        {
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
        }[range] || 'Selected period',
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
  }, [
    activeUsers,
    analyticsKPIs,
    hasData,
    isLive,
    lastUpdated,
    range,
    recentAlerts,
    searchTrend,
    selectedSiteLabel,
    seoData,
    seoKPIs,
    trafficData,
    typedGoalsData,
  ]);

  // Phase 3: Build implicit goal items from KPI data
  const goalItems = useMemo(() => {
    if (!hasData) return [];
    const goals = [];
    // User growth goal: aim for 10% growth
    if (analyticsKPIs?.totalUsers) {
      const prev = analyticsKPIs.changeUsers
        ? Math.round(analyticsKPIs.totalUsers / (1 + (analyticsKPIs.changeUsers ?? 0) / 100))
        : analyticsKPIs.totalUsers;
      const target = Math.round(prev * 1.1);
      goals.push({ label: 'User Growth (10% target)', current: analyticsKPIs.totalUsers, target, unit: '', color: '#34d399' });
    }
    // Click growth goal
    if (seoKPIs?.totalClicks) {
      const prev = seoKPIs.changeClicks
        ? Math.round(seoKPIs.totalClicks / (1 + (seoKPIs.changeClicks ?? 0) / 100))
        : seoKPIs.totalClicks;
      const target = Math.round(prev * 1.1);
      goals.push({ label: 'Click Growth (10% target)', current: seoKPIs.totalClicks, target, unit: '', color: '#22d3ee' });
    }
    return goals;
  }, [hasData, analyticsKPIs, seoKPIs]);

  const handleExportReport = useCallback(() => {
    setReportError(null);
    setReportModalOpen(true);
  }, []);

  const handleRetryInventory = useCallback(() => {
    void Promise.all([refreshSites(), refreshProperties()]);
  }, [refreshProperties, refreshSites]);

  const handleGeneratePdf = useCallback(async () => {
    if (!activeSiteUrl) return;
    setReportGenerating(true);
    setReportError(null);
    try {
      const res = await fetch('/api/report/user-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: reportPeriod,
          siteUrl: activeSiteUrl,
          ...(reportPropertyId ? { propertyId: reportPropertyId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || `TrafficClaw_${reportPeriod}_report.pdf`;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setReportModalOpen(false);
    } catch (err: unknown) {
      const error = err as Error;
      setReportError(error.message || 'Failed to generate report');
    } finally {
      setReportGenerating(false);
    }
  }, [activeSiteUrl, reportPeriod, reportPropertyId]);

  // Mobile bottom bar handlers
  const [isMobileRefreshing, setIsMobileRefreshing] = useState(false);
  const handleMobileRefresh = useCallback(() => {
    setIsMobileRefreshing(true);
    Promise.all([refreshAnalytics(), refreshSeo()]).finally(() => {
      setTimeout(() => setIsMobileRefreshing(false), 800);
    });
  }, [refreshAnalytics, refreshSeo]);

  const handleAskAI = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-ai-chat'));
  }, []);

  const handleNotifications = useCallback(() => {
    const target =
      document.querySelector('[data-mobile-section="timeline"]') ||
      document.querySelector('[data-section="activity"]');

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative">
    <div className="mobile-snap-y space-y-4 overflow-hidden bg-[#010203] pb-24 sm:space-y-6 md:pb-8">
      {/* Top-of-page progress bar during SWR revalidation */}
      {isRef && hasData && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5">
          <div className="h-full w-1/3 animate-[progress-bar_1.5s_ease-in-out_infinite] bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500" />
        </div>
      )}

      {registrationError && (
        <div className="border border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(34,211,238,0.05))] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-amber-500/20 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Background provider sync is delayed</h2>
                <p className="mt-1 max-w-2xl text-sm text-zinc-300">{registrationError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryRegistration}
              className="inline-flex items-center justify-center border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/15"
            >
              Retry sync
            </button>
          </div>
        </div>
      )}

      {inventoryError && (
        <div className="border border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(34,211,238,0.05))] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-amber-500/20 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Google inventory is temporarily unavailable</h2>
                <p className="mt-1 max-w-2xl text-sm text-zinc-300">{inventoryError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetryInventory}
              className="inline-flex items-center justify-center border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/15"
            >
              Retry inventory
            </button>
          </div>
        </div>
      )}

      {isDemoWorkspace && (
        <DemoModeBanner
          description="You’re viewing demo data because this account does not have any Google Analytics or Search Console properties yet."
          secondaryDescription={`${demoDomainLabel || DEMO_DOMAIN_LABEL} is being used as the demo workspace so you can explore overview, analytics, SEO, and audit screens.`}
        />
      )}

      {/* Connect Google empty state */}
      {showConnectGoogle && (
        <ConnectGoogleState feature="real-time traffic insights, SEO performance tracking, keyword rankings, and AI-powered recommendations" />
      )}

      {/* Loading skeleton while checking data */}
      {isCheckingData && !hasData && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="border border-white/[0.08] bg-[#020508] p-4">
              <div className="h-3 w-20 animate-pulse bg-white/[0.08]" />
              <div className="mt-3 h-7 w-16 animate-pulse bg-white/[0.08]" />
              <div className="mt-3 h-3 w-28 animate-pulse bg-white/[0.05]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty shell state: globe preview + workspace tabs + onboarding */}
      {isEmptyShell && (
        <div className="space-y-5">
          <div className="border border-emerald-500/18 bg-[linear-gradient(135deg,rgba(52,211,153,0.08),rgba(34,211,238,0.04))] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center border border-emerald-500/20 bg-emerald-500/10">
                  <BarChart3 className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Connect Google Analytics and Search Console</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Your account has no GA4 properties. Connect a different Google account to unlock the overview.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signIn('google', { callbackUrl: '/dashboard' }, { prompt: 'select_account consent' })}
                className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#34e1a3_0%,#1eb8f6_100%)] px-5 py-2.5 text-sm font-semibold text-[#041015]"
              >
                Connect account
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border border-cyan-500/15 bg-[#05080b]">
            <div className="relative h-[420px]" style={{ background: '#070b12' }}>
              <RealtimeGlobeMaplibre visitors={PREVIEW_VISITORS} initialZoom={1.2} />
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-cyan-500/20 bg-cyan-500/10">
                  <Globe className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Realtime Visitor Globe</h3>
                  <p className="text-sm text-zinc-400">A preview of the globe product stays here only for empty-state users.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div className="border border-white/[0.08] bg-[#0a1014] p-3 transition-all duration-200 hover:border-white/[0.14] hover:translate-y-[-1px]">
                  <Zap className="mb-2 h-4 w-4 text-emerald-300" />
                  <div className="text-sm font-medium text-white">Realtime</div>
                  <div className="text-[11px] text-zinc-500">Live visitor stream</div>
                </div>
                <div className="border border-white/[0.08] bg-[#0a1014] p-3 transition-all duration-200 hover:border-white/[0.14] hover:translate-y-[-1px]">
                  <ExternalLink className="mb-2 h-4 w-4 text-cyan-300" />
                  <div className="text-sm font-medium text-white">Embed Anywhere</div>
                  <div className="text-[11px] text-zinc-500">One-line iframe</div>
                </div>
                <div className="border border-white/[0.08] bg-[#0a1014] p-3 transition-all duration-200 hover:border-white/[0.14] hover:translate-y-[-1px]">
                  <Shield className="mb-2 h-4 w-4 text-zinc-200" />
                  <div className="text-sm font-medium text-white">Privacy First</div>
                  <div className="text-[11px] text-zinc-500">Anonymous visitors</div>
                </div>
                <div className="border border-white/[0.08] bg-[#0a1014] p-3 transition-all duration-200 hover:border-white/[0.14] hover:translate-y-[-1px]">
                  <Rocket className="mb-2 h-4 w-4 text-amber-300" />
                  <div className="text-sm font-medium text-white">Zero Setup</div>
                  <div className="text-[11px] text-zinc-500">Plug and play</div>
                </div>
              </div>
            </div>
          </div>

          <WorkspaceTabs activeTab={activeWorkspaceTab} onTabChange={setActiveWorkspaceTab} />
          {activeWorkspaceTab === 'analysis' && <DomainOverview session={session} onDataReady={(data: DomainOverviewData) => setDomainData(data)} />}
          {activeWorkspaceTab === 'content' && <ContentEditor />}
          {activeWorkspaceTab === 'keywords' && <KeywordResearch />}
          {activeWorkspaceTab === 'competitor' && <CompetitorSpy />}
          {activeWorkspaceTab === 'crawler' && <SiteCrawler />}

          {!funnelCompleted && (
            <OnboardingFunnel
              data={domainData}
              onComplete={() => {
                setFunnelCompleted(true);
                localStorage.setItem('tc-funnel-completed', 'true');
              }}
              onDismiss={() => {
                setFunnelCompleted(true);
                localStorage.setItem('tc-funnel-completed', 'true');
              }}
            />
          )}
        </div>
      )}

      {!isEmptyShell && (
        <>
          <div className="md:hidden">
            <MobileOverviewAppShell
              selectedSiteLabel={selectedSiteLabel}
              range={range}
              activeUsers={activeUsers}
              isLive={isLive}
              botRunning={botRunning}
              hasData={hasData}
              isLoading={isRef}
              lastUpdated={lastUpdated}
              analyticsData={analyticsDashboardData}
              seoData={seoDashboardData}
              analyticsKPIs={analyticsKPIs}
              seoKPIs={seoKPIs}
              trafficData={trafficData}
              searchTrend={searchTrend}
              goalsData={typedGoalsData}
              onExportReport={handleExportReport}
              onAskAI={handleAskAI}
            />
          </div>

          <div className="hidden md:block">
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 -mx-4 h-36 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.08),transparent_54%)]" />
              <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex border border-white/[0.08] bg-[#04080b] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      Overview
                    </div>
                    {hasData && (
                      <div className="inline-flex border border-white/[0.06] bg-[#04080b] px-2.5 py-1 text-[10px] text-zinc-500">
                        Last {range.replace('d', ' days')}
                      </div>
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{greeting}</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                      {hasData
                        ? pageBriefing.shortSummary
                        : 'Real-time analytics, SEO performance, and AI-powered actions in one view.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeUsers !== null && (
                    <button
                      type="button"
                      onClick={() => setLiveDrawerOpen(true)}
                      className="inline-flex items-center gap-2 border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/[0.12]"
                    >
                      <Activity className="h-4 w-4" />
                      {activeUsers} live
                    </button>
                  )}

                  {hasData && (
                    <button
                      type="button"
                      onClick={handleExportReport}
                      className="inline-flex items-center gap-2 border border-white/[0.08] bg-[#04080b] px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
                    >
                      <FileDown className="h-4 w-4" />
                      Export report
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!containerLoading && hasGoogleConnection && !botRunning && (
              <div className="border border-emerald-500/18 bg-[linear-gradient(135deg,rgba(52,211,153,0.08),rgba(34,211,238,0.04))] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center border border-emerald-500/20 bg-emerald-500/10">
                    <Bot className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="flex-1 text-sm text-zinc-300">
                    Want AI-powered insights via Telegram? <Link href="/dashboard/bot" className="font-medium text-emerald-300 hover:text-emerald-200">Set up your bot</Link>
                  </p>
                </div>
              </div>
            )}

            <div data-section="activity">
              <OverviewCommandCenter
                selectedSiteLabel={selectedSiteLabel}
                range={range}
                activeUsers={activeUsers}
                isLive={isLive}
                hasData={hasData}
                isLoading={isRef}
                lastUpdated={lastUpdated}
                analyticsData={analyticsDashboardData}
                seoData={seoDashboardData}
                analyticsKPIs={analyticsKPIs}
                seoKPIs={seoKPIs}
                trafficData={trafficData}
                searchTrend={searchTrend}
                goalsData={typedGoalsData}
                onOpenLiveDrawer={() => setLiveDrawerOpen(true)}
                onExportReport={handleExportReport}
              />
            </div>

            {hasData && (
              <div className="grid gap-4 xl:grid-cols-3">
                <RecentActivity alerts={recentAlerts} maxItems={6} />
                <GoalProgress goals={goalItems} />
                <IndexingStatus />
              </div>
            )}
          </div>
        </>
      )}

      <LiveVisitorDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
        data={realtimeData}
        isLoading={!realtimeData && activeUsers === null}
      />

      {/* Mobile bottom action bar */}
      {hasData && (
        <MobileBottomBar
          onRefresh={handleMobileRefresh}
          onAskAI={handleAskAI}
          onExport={handleExportReport}
          onNotifications={handleNotifications}
          isRefreshing={isMobileRefreshing}
          alertCount={recentAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length}
        />
      )}

      {/* PDF Report Generation Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md border border-white/[0.08] bg-[#0a0a12] p-6 shadow-2xl sm:mx-0" style={{ borderRadius: 16 }}>
            <button
              type="button"
              onClick={() => setReportModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 transition-colors hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-emerald-500/20 bg-emerald-500/10" style={{ borderRadius: 10 }}>
                <FileText className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Generate PDF Report</h3>
                <p className="text-xs text-zinc-500">{isSeoOnlyReport ? 'AI-powered Search Console report' : 'AI-powered analytics + SEO report'}</p>
              </div>
            </div>

            {/* Property info */}
            <div className="mb-4 border border-white/[0.06] bg-white/[0.02] p-3" style={{ borderRadius: 10 }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Site</div>
              <div className="mt-1 text-sm text-zinc-200">{selectedSiteLabel || 'No site selected'}</div>
              {reportPropertyId ? (
                <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{reportPropertyId}</div>
              ) : (
                <div className="mt-1 text-[11px] text-amber-300">Search Console-only report. GA4 metrics will be marked unavailable.</div>
              )}
            </div>

            {isSeoOnlyReport && (
              <div className="mb-4 border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200" style={{ borderRadius: 8 }}>
                No GA4 property is available for this site, so this export will focus on Search Console insights, keyword movement, and page-level SEO opportunities.
              </div>
            )}

            {/* Period selector */}
            <div className="mb-5">
              <div className="mb-2 text-xs font-medium text-zinc-400">Report Period</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReportPeriod('weekly')}
                  className={`flex-1 border px-3 py-2.5 text-sm font-medium transition-all ${
                    reportPeriod === 'weekly'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300'
                  }`}
                  style={{ borderRadius: 8 }}
                >
                  Weekly (7 days)
                </button>
                <button
                  type="button"
                  onClick={() => setReportPeriod('monthly')}
                  className={`flex-1 border px-3 py-2.5 text-sm font-medium transition-all ${
                    reportPeriod === 'monthly'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300'
                  }`}
                  style={{ borderRadius: 8 }}
                >
                  Monthly (30 days)
                </button>
              </div>
            </div>

            {/* Error message */}
            {reportError && (
              <div className="mb-4 border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300" style={{ borderRadius: 8 }}>
                {reportError}
              </div>
            )}

            {/* Generate button */}
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={reportGenerating || !activeSiteUrl}
              className="flex w-full items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-[#041015] transition-all hover:from-emerald-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderRadius: 10 }}
            >
              {reportGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating report...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Download PDF Report
                </>
              )}
            </button>

            {reportGenerating && (
              <p className="mt-3 text-center text-[11px] text-zinc-500">
                This may take 30-60 seconds. AI is analyzing your data.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
