'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Palette, Layers, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import type { DashboardLayout, GridLayouts, LayoutItem, DateRange } from '@/types/dashboard';
import { getThemeCSS } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { useWidgetData } from '@/lib/useWidgetData';
import { exportDashboardToPDF } from '@/lib/dashboardPdfExport';
import DashboardGrid from '@/components/dashboard-builder/DashboardGrid';
import DashboardToolbar from '@/components/dashboard-builder/DashboardToolbar';
import WidgetPalette from '@/components/dashboard-builder/WidgetPalette';
import WidgetConfigPanel from '@/components/dashboard-builder/WidgetConfigPanel';
import ThemeCustomizer from '@/components/dashboard-builder/ThemeCustomizer';
import ActiveFiltersBar from '@/components/dashboard-builder/ActiveFiltersBar';

// ── Types ──

type SidePanel = 'widgets' | 'theme' | 'config';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

// ── Page ──

export default function DashboardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const {
    loadDashboard, resetEditor,
    name, widgets, gridLayouts, theme, selectedWidgetId,
    onLayoutChange, dashboardId,
    activeFilters, handleInteraction, removeFilter, clearAllFilters,
  } = useDashboardBuilderStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('widgets');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Fetch dashboard config
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboards/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Dashboard not found' : 'Failed to load dashboard');
          return;
        }
        const data = await res.json();
        if (data.dashboard) {
          loadDashboard(data.dashboard as DashboardLayout);
        }
      } catch {
        setError('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { resetEditor(); };
  }, [id, loadDashboard, resetEditor]);

  // Fetch widget data (only when dashboard is loaded and has widgets)
  const {
    widgetData,
    isLoading: dataLoading,
    error: dataError,
    refresh: refreshData,
  } = useWidgetData({
    dashboardId: dashboardId || id,
    range: dateRange,
    enabled: !loading && !error && widgets.length > 0,
  });

  // Auto-switch to config panel when widget is selected
  useEffect(() => {
    if (selectedWidgetId) setSidePanel('config');
  }, [selectedWidgetId]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 's') {
          e.preventDefault();
          useDashboardBuilderStore.getState().save();
        } else if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          useDashboardBuilderStore.getState().undo();
        } else if (e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          useDashboardBuilderStore.getState().redo();
        }
      }
      if (e.key === 'Escape') {
        useDashboardBuilderStore.getState().selectWidget(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleLayoutChange = useCallback(
    (layout: LayoutItem[], allLayouts: GridLayouts) => {
      onLayoutChange(layout, allLayouts);
    },
    [onLayoutChange],
  );

  const handleWidgetInteraction = useCallback(
    (widgetId: string, dimension: string, value: string) => {
      handleInteraction({ sourceWidgetId: widgetId, dimension, value });
    },
    [handleInteraction],
  );

  const handleExportPDF = useCallback(async () => {
    const el = gridContainerRef.current;
    if (!el) return;
    const rangeLabels: Record<DateRange, string> = {
      '7d': 'Last 7 days',
      '14d': 'Last 14 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
    };
    await exportDashboardToPDF(el, {
      dashboardName: name,
      dateRangeLabel: rangeLabels[dateRange],
      companyName: theme.companyName,
      backgroundColor: theme.backgroundColor,
    });
  }, [name, dateRange, theme.companyName, theme.backgroundColor]);

  const themeCSS = getThemeCSS(theme);

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-white/40">{error}</p>
        <button
          onClick={() => router.push('/dashboard/dashboards')}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Back to dashboards
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]" style={themeCSS as React.CSSProperties}>
      {/* Toolbar */}
      <DashboardToolbar
        isPreview={isPreview}
        onPreviewToggle={() => setIsPreview(!isPreview)}
        onExportPDF={handleExportPDF}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar (edit mode only) — hidden on mobile because the
            240 px palette swallows the grid and HTML5 drag is awkward on
            touch. Mobile users see the grid in single-column stack mode
            (react-grid-layout's `sm: 0 → 1 col` breakpoint). */}
        {!isPreview && (
          <div className="hidden md:flex w-60 border-r border-white/[0.06] bg-zinc-950/50 flex-col flex-shrink-0">
            {/* Panel tabs */}
            <div className="flex border-b border-white/[0.06]">
              <button
                onClick={() => setSidePanel('widgets')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                  sidePanel === 'widgets' ? 'text-[var(--db-primary)] border-b-2 border-[var(--db-primary)]' : 'text-white/30 hover:text-white/50'
                }`}
              >
                <Layers className="w-3 h-3" /> Widgets
              </button>
              <button
                onClick={() => setSidePanel('theme')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                  sidePanel === 'theme' ? 'text-[var(--db-primary)] border-b-2 border-[var(--db-primary)]' : 'text-white/30 hover:text-white/50'
                }`}
              >
                <Palette className="w-3 h-3" /> Theme
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-3">
              {sidePanel === 'widgets' && <WidgetPalette />}
              {sidePanel === 'theme' && <ThemeCustomizer />}
              {sidePanel === 'config' && <WidgetConfigPanel />}
            </div>

            {/* Back link */}
            <div className="px-3 py-2 border-t border-white/[0.06]">
              <button
                onClick={() => router.push('/dashboard/dashboards')}
                className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                All Dashboards
              </button>
            </div>
          </div>
        )}

        {/* Main grid area */}
        <div
          ref={gridContainerRef}
          className="flex-1 overflow-auto p-6"
          style={{ backgroundColor: 'var(--db-bg)', fontFamily: 'var(--db-font)' }}
          onClick={() => {
            if (!isPreview) useDashboardBuilderStore.getState().selectWidget(null);
          }}
        >
          {/* Logo / branding header */}
          {(theme.logoUrl || theme.companyName) && (
            <div className={`flex items-center gap-3 mb-6 ${
              theme.logoPosition === 'top-center' ? 'justify-center' :
              theme.logoPosition === 'top-right' ? 'justify-end' : 'justify-start'
            }`}>
              {theme.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={theme.logoUrl}
                  alt="Logo"
                  className="h-8 w-auto object-contain"
                />
              )}
              {theme.companyName && (
                <span className="text-sm font-semibold text-[var(--db-text)]">
                  {theme.companyName}
                </span>
              )}
            </div>
          )}

          {/* Date range selector + data status bar (hidden in PDF) */}
          <div className="flex items-center justify-between mb-4" data-pdf-ignore="true">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[var(--db-text)]/40" />
              <div className="flex items-center bg-white/5 rounded-lg p-0.5">
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateRange(opt.value)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
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

            <div className="flex items-center gap-2">
              {dataError && (
                <div className="flex items-center gap-1 text-amber-400/70">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-[10px]">Data unavailable</span>
                </div>
              )}
              <button
                onClick={() => refreshData()}
                disabled={dataLoading}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30"
                title="Refresh data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[var(--db-text)]/40 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Active filters bar (hidden in PDF) */}
          <div data-pdf-ignore="true">
            <ActiveFiltersBar
              filters={activeFilters}
              onRemove={removeFilter}
              onClearAll={clearAllFilters}
            />
          </div>

          <DashboardGrid
            widgets={widgets}
            gridLayouts={gridLayouts}
            widgetData={widgetData ?? undefined}
            isLoading={dataLoading && !widgetData}
            isEditing={!isPreview}
            activeFilters={activeFilters}
            onLayoutChange={handleLayoutChange}
            onInteraction={handleWidgetInteraction}
          />

          {/* TrafficClaw branding footer */}
          {theme.showTrafficClawBranding && (
            <div className="mt-8 text-center">
              <p className="text-[10px] text-[var(--db-text)]/20">
                Built with TrafficClaw
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
