'use client';

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, Calendar, RefreshCw, AlertCircle, Clock, Eye,
  FileDown, Loader2,
} from 'lucide-react';
import type { DashboardLayout, DashboardFilter, DateRange } from '@/types/dashboard';
import { getThemeCSS } from '@/lib/dashboardBuilder';
import { usePublicWidgetData } from '@/lib/useWidgetData';
import { exportDashboardToPDF } from '@/lib/dashboardPdfExport';
import { createFilterId, isFilterableDimension } from '@/lib/dashboardFilterEngine';
import DashboardGrid from '@/components/dashboard-builder/DashboardGrid';
import ActiveFiltersBar from '@/components/dashboard-builder/ActiveFiltersBar';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';

// ── Constants ──

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

// ── Page ──

export default function PublicDashboardView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const searchParams = useSearchParams();

  const isEmbed = searchParams.get('embed') === 'true';

  const [dashboard, setDashboard] = useState<DashboardLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [activeFilters, setActiveFilters] = useState<DashboardFilter[]>([]);
  const dashboardContainerRef = useRef<HTMLDivElement>(null);

  // Fetch dashboard config
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboards/public/${token}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Dashboard not found or no longer shared' : 'Failed to load dashboard');
          return;
        }
        const data = await res.json();
        if (data.dashboard) {
          setDashboard(data.dashboard as DashboardLayout);
        }
      } catch {
        setError('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // Fetch widget data with auto-refresh
  const {
    widgetData,
    fetchedAt,
    isLoading: dataLoading,
    error: dataError,
    refresh: refreshData,
  } = usePublicWidgetData({
    shareToken: token,
    range: dateRange,
    enabled: !!dashboard && dashboard.widgets.length > 0,
    refreshInterval: AUTO_REFRESH_MS,
  });

  // Format last updated time
  const lastUpdated = useMemo(() => {
    if (!fetchedAt) return null;
    try {
      return new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [fetchedAt]);

  // PDF export handler
  const handleExportPDF = useCallback(async () => {
    const el = dashboardContainerRef.current;
    if (!el || !dashboard || pdfExporting) return;
    setPdfExporting(true);
    const rangeLabels: Record<DateRange, string> = {
      '7d': 'Last 7 days',
      '14d': 'Last 14 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
    };
    try {
      await exportDashboardToPDF(el, {
        dashboardName: dashboard.name,
        dateRangeLabel: rangeLabels[dateRange],
        companyName: dashboard.theme.companyName,
        backgroundColor: dashboard.theme.backgroundColor,
      });
    } finally {
      setPdfExporting(false);
    }
  }, [dashboard, dateRange, pdfExporting]);

  // Cross-widget filter handlers
  const handleWidgetInteraction = useCallback(
    (widgetId: string, dimension: string, value: string) => {
      if (!isFilterableDimension(dimension)) return;

      const filterId = createFilterId(dimension, value);

      setActiveFilters((prev) => {
        // Toggle: if this exact filter exists, remove it
        if (prev.find((f) => f.id === filterId)) {
          return prev.filter((f) => f.id !== filterId);
        }
        // Replace any filter on the same dimension
        const sourceWidget = dashboard?.widgets.find((w) => w.id === widgetId);
        const newFilter: DashboardFilter = {
          id: filterId,
          dimension,
          value,
          sourceWidgetId: widgetId,
          sourceWidgetTitle: sourceWidget?.title ?? 'Widget',
        };
        return [...prev.filter((f) => f.dimension !== dimension), newFilter];
      });
    },
    [dashboard?.widgets],
  );

  const removeFilter = useCallback((filterId: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== filterId));
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
  }, []);

  // SEO meta tags via document.title
  useEffect(() => {
    if (dashboard) {
      document.title = `${dashboard.name} | ${BRAND_NAME} Dashboard`;
    }
    return () => { document.title = `${BRAND_NAME}`; };
  }, [dashboard]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error state ──
  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <LayoutDashboard className="w-10 h-10 text-white/10" />
        <p className="text-sm text-white/40">{error || 'Dashboard not found'}</p>
        {!isEmbed && (
          <a
            href="/"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Go to {BRAND_NAME}
          </a>
        )}
      </div>
    );
  }

  const themeCSS = getThemeCSS(dashboard.theme);

  // ── Embed mode: minimal chrome ──
  if (isEmbed) {
    return (
      <div
        className="min-h-screen"
        style={{
          ...themeCSS,
          backgroundColor: 'transparent',
          fontFamily: 'var(--db-font)',
        } as React.CSSProperties}
      >
        <div className="p-4">
          <ActiveFiltersBar
            filters={activeFilters}
            onRemove={removeFilter}
            onClearAll={clearAllFilters}
          />
          <DashboardGrid
            widgets={dashboard.widgets}
            gridLayouts={dashboard.gridLayouts}
            widgetData={widgetData ?? undefined}
            isLoading={dataLoading && !widgetData}
            isEditing={false}
            activeFilters={activeFilters}
            onInteraction={handleWidgetInteraction}
          />
        </div>

        {/* Minimal branding in embed */}
        {dashboard.theme.showTrafficClawBranding && (
          <div className="text-center pb-4">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-[var(--db-text)]/15 hover:text-[var(--db-text)]/30 transition-colors"
            >
              {BRAND_NAME}
            </a>
          </div>
        )}
      </div>
    );
  }

  // ── Full public view ──
  return (
    <div
      ref={dashboardContainerRef}
      className="min-h-screen"
      style={{ ...themeCSS, backgroundColor: 'var(--db-bg)', fontFamily: 'var(--db-font)' } as React.CSSProperties}
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-4">
        <div className={`flex items-center gap-3 mb-2 ${
          dashboard.theme.logoPosition === 'top-center' ? 'justify-center' :
          dashboard.theme.logoPosition === 'top-right' ? 'justify-end' : 'justify-start'
        }`}>
          {dashboard.theme.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dashboard.theme.logoUrl}
              alt="Logo"
              className="h-8 w-auto object-contain"
            />
          )}
          {dashboard.theme.companyName && (
            <span className="text-sm font-semibold text-[var(--db-text)]">
              {dashboard.theme.companyName}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-[var(--db-text)]">{dashboard.name}</h1>
        {dashboard.description && (
          <p className="text-sm text-[var(--db-text)]/50 mt-1">{dashboard.description}</p>
        )}

        {/* Controls bar (hidden in PDF export) */}
        <div className="flex items-center justify-between mt-4 mb-2" data-pdf-ignore="true">
          <div className="flex items-center gap-3">
            {/* Date range picker */}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--db-text)]/40" />
              <div className="flex items-center bg-[var(--db-text)]/5 rounded-lg p-0.5">
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateRange(opt.value)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                      dateRange === opt.value
                        ? 'bg-[var(--db-primary)]/15 text-[var(--db-primary)]'
                        : 'text-[var(--db-text)]/40 hover:text-[var(--db-text)]/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* View count */}
            {dashboard.views > 0 && (
              <div className="flex items-center gap-1 text-[var(--db-text)]/30">
                <Eye className="w-3 h-3" />
                <span className="text-[10px]">{dashboard.views.toLocaleString()} views</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Data error indicator */}
            {dataError && (
              <div className="flex items-center gap-1 text-amber-400/70">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[10px]">Data unavailable</span>
              </div>
            )}

            {/* Last updated */}
            {lastUpdated && (
              <div className="flex items-center gap-1 text-[var(--db-text)]/30">
                <Clock className="w-3 h-3" />
                <span className="text-[10px]">Updated {lastUpdated}</span>
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={() => refreshData()}
              disabled={dataLoading}
              className="p-1.5 rounded-lg hover:bg-[var(--db-text)]/5 transition-colors disabled:opacity-30"
              title="Refresh data"
              data-pdf-ignore="true"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--db-text)]/40 ${dataLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* PDF download */}
            <button
              onClick={handleExportPDF}
              disabled={pdfExporting}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--db-text)]/5 text-[var(--db-text)]/40 hover:text-[var(--db-text)]/60 transition-colors disabled:opacity-40"
              title="Download PDF"
              data-pdf-ignore="true"
            >
              {pdfExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] font-medium">{pdfExporting ? 'Exporting...' : 'PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <ActiveFiltersBar
          filters={activeFilters}
          onRemove={removeFilter}
          onClearAll={clearAllFilters}
        />
        <DashboardGrid
          widgets={dashboard.widgets}
          gridLayouts={dashboard.gridLayouts}
          widgetData={widgetData ?? undefined}
          isLoading={dataLoading && !widgetData}
          isEditing={false}
          activeFilters={activeFilters}
          onInteraction={handleWidgetInteraction}
        />
      </div>

      {/* Footer branding */}
      {dashboard.theme.showTrafficClawBranding && (
        <div className="text-center pb-8">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--db-text)]/20 hover:text-[var(--db-text)]/40 transition-colors"
          >
            Built with {BRAND_NAME}
          </a>
        </div>
      )}
    </div>
  );
}
