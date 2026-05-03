'use client';

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Layers, Palette, Sparkles, Link2, Eye, EyeOff,
  Loader2, Calendar, RefreshCw, AlertCircle,
} from 'lucide-react';
import type { DashboardLayout, GridLayouts, LayoutItem, DateRange, LayoutDensity } from '@/types/dashboard';
import { getThemeCSS } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { useWidgetData } from '@/lib/useWidgetData';
import { useCredits } from '@/lib/useDashboardData';
import { getWidgetSection } from '@/lib/widgetSections';
import DashboardGrid from '@/components/dashboard-builder/DashboardGrid';
import DashboardToolbar from '@/components/dashboard-builder/DashboardToolbar';
import WidgetPalette from '@/components/dashboard-builder/WidgetPalette';
import WidgetConfigPanel from '@/components/dashboard-builder/WidgetConfigPanel';
import ThemeCustomizer from '@/components/dashboard-builder/ThemeCustomizer';
import ActiveFiltersBar from '@/components/dashboard-builder/ActiveFiltersBar';
import LayoutDensityControl from '@/components/share-studio/LayoutDensityControl';
import SectionVisibilityToggles from '@/components/share-studio/SectionVisibilityToggles';
import BrandingPanel from '@/components/share-studio/BrandingPanel';
import ShareLinkPanel from '@/components/share-studio/ShareLinkPanel';
import SharePreviewIframe from '@/components/share-studio/SharePreviewIframe';

type StudioTab = 'layout' | 'theme' | 'branding' | 'links';

const TABS: { id: StudioTab; label: string; icon: typeof Layers }[] = [
  { id: 'layout', label: 'Layout', icon: Layers },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'branding', label: 'Branding', icon: Sparkles },
  { id: 'links', label: 'Links', icon: Link2 },
];

const DENSITY_PADDING: Record<LayoutDensity, string> = {
  compact: 'p-3',
  normal: 'p-6',
  spacious: 'p-10',
};

function getDensity(density: string | undefined): LayoutDensity {
  if (density === 'compact' || density === 'spacious') return density;
  return 'normal';
}

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

export default function ShareStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { plan: userPlan } = useCredits();

  const {
    loadDashboard, resetEditor,
    name, widgets, gridLayouts, theme, selectedWidgetId,
    onLayoutChange, dashboardId, shareToken, lastSaved,
    activeFilters, handleInteraction, removeFilter, clearAllFilters,
  } = useDashboardBuilderStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('layout');
  const [showPreview, setShowPreview] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const gridContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/dashboards/${id}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? 'Dashboard not found' : 'Failed to load dashboard');
          return;
        }
        const data = await res.json();
        if (!cancelled && data.dashboard) {
          loadDashboard(data.dashboard as DashboardLayout);
        }
      } catch {
        if (!cancelled) setError('Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      resetEditor();
    };
  }, [id, loadDashboard, resetEditor]);

  const {
    widgetData,
    isLoading: dataLoading,
    error: dataError,
    refresh: refreshData,
  } = useWidgetData({
    dashboardId: dashboardId ?? id,
    range: dateRange,
    enabled: !loading && !error && widgets.length > 0,
  });

  useEffect(() => {
    if (selectedWidgetId) setActiveTab('layout');
  }, [selectedWidgetId]);

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

  const visibleWidgets = useMemo(() => {
    const visibility = theme.sectionVisibility;
    if (!visibility) return widgets;
    return widgets.filter((w) => {
      const section = getWidgetSection(w);
      return visibility[section] !== false;
    });
  }, [widgets, theme.sectionVisibility]);

  const themeCSS = getThemeCSS(theme);
  const density = getDensity(theme.layoutDensity);

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">{error}</p>
        <button
          onClick={() => router.push('/dashboard/share')}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Back to shared dashboards
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" style={themeCSS as React.CSSProperties}>
      <DashboardToolbar />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r border-white/[0.06] bg-zinc-950/60 flex flex-col flex-shrink-0">
          <div className="flex border-b border-white/[0.06] flex-shrink-0">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                    active
                      ? 'text-[var(--db-primary)] border-b-2 border-[var(--db-primary)]'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                  title={t.label}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden xl:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {activeTab === 'layout' && (
              <>
                {selectedWidgetId ? <WidgetConfigPanel /> : <WidgetPalette />}
                <LayoutDensityControl />
                <SectionVisibilityToggles />
              </>
            )}
            {activeTab === 'theme' && <ThemeCustomizer />}
            {activeTab === 'branding' && <BrandingPanel userPlan={userPlan} />}
            {activeTab === 'links' && <ShareLinkPanel />}
          </div>

          <div className="px-3 py-2 border-t border-white/[0.06] flex-shrink-0 flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard/share')}
              className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              All shared
            </button>
            <button
              onClick={() => setShowPreview((p) => !p)}
              className={`flex items-center gap-1 text-[10px] transition-colors ${
                showPreview ? 'text-emerald-400' : 'text-white/30 hover:text-white/60'
              }`}
              title="Toggle live preview"
            >
              {showPreview ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Preview
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-w-0">
          <div
            ref={gridContainerRef}
            className={`flex-1 min-w-0 overflow-auto ${DENSITY_PADDING[density]}`}
            style={{ backgroundColor: 'var(--db-bg)', fontFamily: 'var(--db-font)' }}
            onClick={() => useDashboardBuilderStore.getState().selectWidget(null)}
          >
            {(theme.logoUrl ?? theme.companyName) && (
              <div
                className={`flex items-center gap-3 mb-6 ${
                  theme.logoPosition === 'top-center'
                    ? 'justify-center'
                    : theme.logoPosition === 'top-right'
                      ? 'justify-end'
                      : 'justify-start'
                }`}
              >
                {theme.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={theme.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
                )}
                {theme.companyName && (
                  <span className="text-sm font-semibold text-[var(--db-text)]">{theme.companyName}</span>
                )}
              </div>
            )}

            <h2 className="text-lg font-semibold text-[var(--db-text)] mb-1">{name}</h2>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[var(--db-text)]/40" />
                <div className="flex items-center bg-white/5 rounded-lg p-0.5">
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

            <ActiveFiltersBar
              filters={activeFilters}
              onRemove={removeFilter}
              onClearAll={clearAllFilters}
            />

            <DashboardGrid
              widgets={visibleWidgets}
              gridLayouts={gridLayouts}
              widgetData={widgetData ?? undefined}
              isLoading={dataLoading && !widgetData}
              isEditing
              activeFilters={activeFilters}
              onLayoutChange={handleLayoutChange}
              onInteraction={handleWidgetInteraction}
            />

            {theme.showTrafficClawBranding && (
              <div className="mt-8 text-center">
                <p className="text-[10px] text-[var(--db-text)]/20">Built with TrafficClaw</p>
              </div>
            )}
          </div>

          {showPreview && (
            <div className="hidden lg:flex w-[420px] xl:w-[480px] border-l border-white/[0.06] bg-zinc-950/40 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <SharePreviewIframe shareToken={shareToken} reloadKey={lastSaved} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
