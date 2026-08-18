'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, LayoutDashboard, Trash2, Copy, ExternalLink, Share2, MoreHorizontal,
  Search, BarChart3, Briefcase, FileText, Loader2,
} from 'lucide-react';
import type { DashboardListItem, DashboardTemplate } from '@/types/dashboard';
import { DASHBOARD_TEMPLATES } from '@/lib/dashboardBuilder';
import { useRegistration } from '../layout';

// ── Template icon map ──

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3,
  Search,
  LayoutDashboard,
  Briefcase,
  Plus,
};

export default function DashboardsListPage() {
  const router = useRouter();
  const { selectedProperty, selectedSite } = useRegistration();
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Fetch dashboards
  const fetchDashboards = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboards');
      const data = await res.json();
      setDashboards(data.dashboards || []);
    } catch (err) {
      console.error('Failed to fetch dashboards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboards(); }, [fetchDashboards]);

  // Create from template
  const createFromTemplate = useCallback(async (template: DashboardTemplate) => {
    if (!selectedProperty) return;
    setCreating(true);
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.id === 'blank-canvas' ? 'Untitled Dashboard' : template.name,
          description: template.description,
          propertyId: selectedProperty,
          siteUrl: selectedSite || '',
          widgets: template.widgets,
          gridLayouts: template.gridLayouts,
          theme: template.theme,
        }),
      });
      const data = await res.json();
      if (data.dashboard?.id) {
        router.push(`/dashboard/dashboards/${data.dashboard.id}`);
      }
    } catch (err) {
      console.error('Failed to create dashboard:', err);
    } finally {
      setCreating(false);
      setShowTemplates(false);
    }
  }, [selectedProperty, selectedSite, router]);

  // Delete dashboard
  const deleteDashboard = useCallback(async (id: string) => {
    try {
      await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Failed to delete dashboard:', err);
    }
    setActionMenuId(null);
  }, []);

  // Duplicate dashboard
  const duplicateDashboard = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/dashboards/${id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (data.dashboard) {
        fetchDashboards();
      }
    } catch (err) {
      console.error('Failed to duplicate dashboard:', err);
    }
    setActionMenuId(null);
  }, [fetchDashboards]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Custom Dashboards</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Build and share custom analytics reports
          </p>
        </div>
        <button
          onClick={() => setShowTemplates(true)}
          disabled={!selectedProperty}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Dashboard
        </button>
      </div>

      {/* No property selected warning */}
      {!selectedProperty && !loading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-6">
          <p className="text-sm text-amber-400">
            Select a Google Analytics property from the sidebar to create dashboards.
          </p>
        </div>
      )}

      {/* Dashboard grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-5 animate-pulse">
              <div className="h-4 w-32 bg-white/5 rounded mb-3" />
              <div className="h-3 w-48 bg-white/5 rounded mb-4" />
              <div className="h-24 bg-white/5 rounded-lg mb-3" />
              <div className="h-3 w-20 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <LayoutDashboard className="w-7 h-7 text-white/20" />
          </div>
          <h2 className="text-sm font-medium text-white/50 mb-1">No dashboards yet</h2>
          <p className="text-xs text-white/30 mb-4">
            Create your first custom dashboard from a template
          </p>
          <button
            onClick={() => setShowTemplates(true)}
            disabled={!selectedProperty}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
          >
            Choose a template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((db) => (
            <motion.div
              key={db.id}
              whileHover={{ y: -2 }}
              className="relative group rounded-xl border border-white/[0.06] bg-zinc-900/50 hover:border-white/[0.1] transition-all cursor-pointer overflow-hidden"
              onClick={() => router.push(`/dashboard/dashboards/${db.id}`)}
            >
              {/* Preview placeholder */}
              <div className="h-28 bg-gradient-to-br from-white/[0.02] to-transparent flex items-center justify-center">
                <LayoutDashboard className="w-8 h-8 text-white/10" />
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-sm font-medium text-white/80 truncate flex-1">
                    {db.name}
                  </h3>
                  {/* Action menu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenuId(actionMenuId === db.id ? null : db.id);
                    }}
                    className="p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </div>
                {db.description && (
                  <p className="text-[11px] text-white/30 truncate mb-2">{db.description}</p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-white/25">
                  <span>{db.widgetCount} widgets</span>
                  {db.isPublic && (
                    <span className="flex items-center gap-0.5 text-emerald-400/50">
                      <Share2 className="w-2.5 h-2.5" /> Shared
                    </span>
                  )}
                  <span>{db.views} views</span>
                </div>
              </div>

              {/* Action dropdown */}
              <AnimatePresence>
                {actionMenuId === db.id && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute top-2 right-2 w-40 bg-zinc-800 border border-white/10 rounded-lg shadow-2xl overflow-hidden z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => { router.push(`/dashboard/dashboards/${db.id}`); setActionMenuId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:bg-white/5 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </button>
                    <button
                      onClick={() => duplicateDashboard(db.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:bg-white/5 transition-colors"
                    >
                      <Copy className="w-3 h-3" /> Duplicate
                    </button>
                    <button
                      onClick={() => deleteDashboard(db.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Template picker modal */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTemplates(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <h2 className="text-base font-semibold text-white">Choose a Template</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Start with a pre-built layout or blank canvas
                </p>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                {DASHBOARD_TEMPLATES.map((tpl) => {
                  const Icon = TEMPLATE_ICONS[tpl.icon] || FileText;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => createFromTemplate(tpl)}
                      disabled={creating}
                      className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-white/30" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/80">{tpl.name}</p>
                        <p className="text-[11px] text-white/30 mt-0.5 line-clamp-2">{tpl.description}</p>
                        {tpl.widgets.length > 0 && (
                          <p className="text-[10px] text-white/20 mt-1">{tpl.widgets.length} widgets</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {creating && (
                <div className="px-6 py-3 border-t border-white/[0.06] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span className="text-xs text-white/50">Creating dashboard...</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
