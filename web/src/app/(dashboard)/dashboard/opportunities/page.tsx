'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Target, Zap, AlertTriangle, Loader2, Search } from 'lucide-react';
import DemoModeBanner from '@/components/DemoModeBanner';
import { DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import EmptyState, { ConnectGoogleState } from '@/components/EmptyState';
import StrikingDistanceWidget from '@/components/dashboard/StrikingDistanceWidget';
import CtrOptimizationLab from '@/components/dashboard/CtrOptimizationLab';
import SilentDecayMonitor from '@/components/dashboard/SilentDecayMonitor';
import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error: any = new Error(body.error || `HTTP error! status: ${res.status}`);
    error.info = body;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

const TABS = [
  { key: 'striking', label: 'Striking Distance', icon: Target, color: 'emerald' },
  { key: 'ctr', label: 'CTR Lab', icon: Zap, color: 'violet' },
  { key: 'decay', label: 'Silent Decay', icon: AlertTriangle, color: 'amber' },
] as const;

type TabKey = typeof TABS[number]['key'];

const TIMEFRAMES = [
  { value: '7d', label: '7d' },
  { value: '28d', label: '28d' },
  { value: '3m', label: '3m' },
  { value: '6m', label: '6m' },
];

function SkeletonCard() {
  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/[0.06]" />
        <div className="space-y-2">
          <div className="h-4 w-40 bg-white/[0.06] rounded" />
          <div className="h-3 w-56 bg-white/[0.04] rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 h-16" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 bg-white/[0.03] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>}>
      <OpportunitiesPageInner />
    </Suspense>
  );
}

function OpportunitiesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (searchParams.get('tab') as TabKey) || 'striking';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [timeframe, setTimeframe] = useState('28d');

  const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
  const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
  const { selectedSite, setSelectedSite, isDemoWorkspace, demoDomainLabel } = useRegistration();

  // Auto-select first site
  useEffect(() => {
    if (!isDemoWorkspace && sites.length > 0 && !selectedSite) {
      setSelectedSite(sites[0].siteUrl);
    }
  }, [isDemoWorkspace, sites, selectedSite, setSelectedSite]);

  const activeSite = isDemoWorkspace ? DEMO_SITE_URL : selectedSite;

  // Update URL params when tab changes
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Fetch opportunities data
  const swrKey = activeSite && hasGoogleConnection
    ? `/api/seo/opportunities?siteUrl=${encodeURIComponent(activeSite)}&timeframe=${timeframe}${isDemoWorkspace ? '&demo=1' : ''}`
    : null;

  const { data, error, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    keepPreviousData: true,
    errorRetryCount: 3,
  });

  // Connect prompt
  if (!containerLoading && !hasGoogleConnection) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <ConnectGoogleState feature="growth opportunities analysis and keyword tracking" />
      </div>
    );
  }

  // Loading while checking container
  if (containerLoading || sitesLoading) {
    return (
      <div className="min-h-[60vh]">
        <EmptyState variant="loading" title="Loading..." description="Checking your connections" />
      </div>
    );
  }

  // No site selected
  if (!activeSite) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={Search}
          title="No site selected"
          description="Select a site from the dropdown above to view growth opportunities."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isDemoWorkspace ? (
        <DemoModeBanner
          description="You’re viewing demo data because this account does not have any Google Analytics or Search Console properties yet."
          secondaryDescription={`TrafficClaw is using ${demoDomainLabel} as a safe demo workspace until you connect your own Google data.`}
        />
      ) : null}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Growth Opportunities</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Discover untapped potential in your search performance
          </p>
        </div>

        {/* Timeframe selector */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all min-h-[44px] ${
                timeframe === tf.value
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all min-h-[44px] ${
                isActive
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? `text-${tab.color}-400` : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading && !data ? (
        <SkeletonCard />
      ) : error && !data ? (
        <div className="premium-card rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-white mb-1">Failed to load data</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                {error.message || 'Could not fetch opportunities data. Please try again.'}
              </p>
            </div>
          </div>
        </div>
      ) : data ? (
        <>
          {activeTab === 'striking' && (
            <StrikingDistanceWidget
              queries={data.queries || []}
              siteUrl={activeSite}
            />
          )}
          {activeTab === 'ctr' && (
            <CtrOptimizationLab
              queryPages={data.queryPages || []}
              siteUrl={activeSite}
            />
          )}
          {activeTab === 'decay' && (
            <SilentDecayMonitor
              queries={data.queries || []}
              comparisonQueries={data.comparisonQueries || []}
              siteUrl={activeSite}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
