'use client';

import { useState, useEffect, use } from 'react';
import { LayoutDashboard } from 'lucide-react';
import type { DashboardLayout } from '@/types/dashboard';
import { getThemeCSS } from '@/lib/dashboardBuilder';
import DashboardGrid from '@/components/dashboard-builder/DashboardGrid';

export default function PublicDashboardView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dashboard, setDashboard] = useState<DashboardLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <LayoutDashboard className="w-10 h-10 text-white/10" />
        <p className="text-sm text-white/40">{error || 'Dashboard not found'}</p>
        <a
          href="/"
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Go to TrafficClaw
        </a>
      </div>
    );
  }

  const themeCSS = getThemeCSS(dashboard.theme);

  return (
    <div
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
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <DashboardGrid
          widgets={dashboard.widgets}
          gridLayouts={dashboard.gridLayouts}
          isLoading={false}
          isEditing={false}
        />
      </div>

      {/* Footer branding */}
      {dashboard.theme.showTrafficClawBranding && (
        <div className="text-center pb-8">
          <a
            href="https://trafficclaw.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--db-text)]/20 hover:text-[var(--db-text)]/40 transition-colors"
          >
            Built with TrafficClaw
          </a>
        </div>
      )}
    </div>
  );
}
