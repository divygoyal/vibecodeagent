'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Palette, Layers } from 'lucide-react';
import type { DashboardLayout, GridLayouts, LayoutItem } from '@/types/dashboard';
import { getThemeCSS } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import DashboardGrid from '@/components/dashboard-builder/DashboardGrid';
import DashboardToolbar from '@/components/dashboard-builder/DashboardToolbar';
import WidgetPalette from '@/components/dashboard-builder/WidgetPalette';
import WidgetConfigPanel from '@/components/dashboard-builder/WidgetConfigPanel';
import ThemeCustomizer from '@/components/dashboard-builder/ThemeCustomizer';

// ── Types ──

type SidePanel = 'widgets' | 'theme' | 'config';

// ── Page ──

export default function DashboardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const {
    loadDashboard, resetEditor,
    widgets, gridLayouts, theme, selectedWidgetId,
    onLayoutChange,
  } = useDashboardBuilderStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('widgets');

  // Fetch dashboard
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
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" style={themeCSS as React.CSSProperties}>
      {/* Toolbar */}
      <DashboardToolbar
        isPreview={isPreview}
        onPreviewToggle={() => setIsPreview(!isPreview)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar (edit mode only) */}
        {!isPreview && (
          <div className="w-60 border-r border-white/[0.06] bg-zinc-950/50 flex flex-col flex-shrink-0">
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

          <DashboardGrid
            widgets={widgets}
            gridLayouts={gridLayouts}
            isLoading={false}
            isEditing={!isPreview}
            onLayoutChange={handleLayoutChange}
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
