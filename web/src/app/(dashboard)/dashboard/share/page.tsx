'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus, Share2, Copy, ExternalLink, Loader2, Sparkles, Check, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DashboardListItem, DashboardTemplate } from '@/types/dashboard';
import { DASHBOARD_TEMPLATES } from '@/lib/dashboardBuilder';
import { getPublicShareUrl } from '@/lib/shareUrls';
import { useRegistration } from '../layout';

export default function ShareLandingPage() {
  const router = useRouter();
  const { selectedProperty, selectedSite } = useRegistration();
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchDashboards = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboards');
      const data = await res.json();
      setDashboards(data.dashboards ?? []);
    } catch (err) {
      console.error('Failed to fetch dashboards:', err);
      toast.error('Failed to load your dashboards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  const createFromTemplate = useCallback(
    async (template: DashboardTemplate) => {
      if (!selectedProperty) {
        toast.error('Pick a property in the sidebar first.');
        return;
      }
      setCreating(true);
      try {
        const res = await fetch('/api/dashboards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: template.id === 'blank-canvas' ? 'Untitled Shared Dashboard' : template.name,
            description: template.description,
            propertyId: selectedProperty,
            siteUrl: selectedSite ?? '',
            widgets: template.widgets,
            gridLayouts: template.gridLayouts,
            theme: template.theme,
          }),
        });
        const data = await res.json();
        if (data.dashboard?.id) {
          router.push(`/dashboard/share/${data.dashboard.id}`);
        }
      } catch (err) {
        console.error('Failed to create dashboard:', err);
        toast.error('Failed to create dashboard');
      } finally {
        setCreating(false);
        setShowTemplates(false);
      }
    },
    [selectedProperty, selectedSite, router],
  );

  const handleCopyLink = useCallback((token: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const url = getPublicShareUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      toast.success('Public link copied');
      window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    });
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Share &amp; Preview</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Customize your sharable dashboards — drag widgets, pick a theme, brand it, and copy the public link.
          </p>
        </div>
        <button
          onClick={() => setShowTemplates(true)}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          New shared dashboard
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/[0.08] flex items-center justify-center">
            <Share2 className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-sm font-medium text-white mb-1">No dashboards yet</h2>
          <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
            Create your first shared dashboard to customize how it looks for clients, stakeholders, or
            embed in your website.
          </p>
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Start from a template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dashboards.map((d) => {
            const isPublic = !!d.shareToken;
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white truncate">{d.name}</h3>
                    {d.description && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{d.description}</p>
                    )}
                  </div>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      isPublic
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-500 border border-white/[0.06]'
                    }`}
                  >
                    {isPublic ? 'Public' : 'Private'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  <span>{d.widgetCount} widgets</span>
                  {isPublic && d.views > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" />
                      {d.views.toLocaleString()} views
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-white/[0.04]">
                  <button
                    onClick={() => router.push(`/dashboard/share/${d.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-500/[0.08] hover:bg-emerald-500/15 text-emerald-300 border border-emerald-500/[0.18] transition-colors"
                  >
                    <Share2 className="w-3 h-3" />
                    Customize
                  </button>
                  {isPublic && d.shareToken && (
                    <>
                      <button
                        onClick={() => handleCopyLink(d.shareToken!)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        title="Copy public link"
                      >
                        {copied === d.shareToken ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-white/60" />
                        )}
                      </button>
                      <a
                        href={getPublicShareUrl(d.shareToken)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3 h-3 text-white/60" />
                      </a>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {showTemplates && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !creating && setShowTemplates(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-zinc-950 border border-white/[0.08] rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Pick a starting template</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Templates pre-fill widgets and a theme. You&apos;ll customize everything in the next step.
                </p>
              </div>
              <button
                onClick={() => !creating && setShowTemplates(false)}
                className="text-zinc-500 hover:text-white text-sm px-2"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DASHBOARD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => createFromTemplate(tpl)}
                  disabled={creating}
                  className="text-left rounded-xl border border-white/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] p-4 transition-all disabled:opacity-50"
                >
                  <h3 className="text-sm font-medium text-white mb-1">{tpl.name}</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mb-2">{tpl.description}</p>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                    {tpl.widgets.length} widgets · {tpl.category}
                  </span>
                </button>
              ))}
            </div>
            {creating && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Creating dashboard…
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
