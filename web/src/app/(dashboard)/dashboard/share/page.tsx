'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus, Share2, Copy, ExternalLink, Loader2, Sparkles, Check, Eye, Trash2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareData } from '@/lib/shareTypes';
import { DEFAULT_SHARE_ACCENT, OVERVIEW_SHARE_CONFIG } from '@/lib/shareTypes';
import { getPublicShareUrl } from '@/lib/shareUrls';
import { useRegistration } from '../layout';

function formatSiteLabel(url: string): string {
  if (!url) return 'Untitled site';
  return url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return new Date(iso).toLocaleDateString();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ShareLandingPage() {
  const router = useRouter();
  const { resolvedPropertyId, resolvedSiteUrl } = useRegistration();
  const [shares, setShares] = useState<ShareData[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  // "+ New shared dashboard" — POSTs /api/share with the default config and
  // routes straight to the customization studio. No intermediate modal: the
  // studio IS the creation surface, and Save there opens the share-links
  // popup. `creating` powers the inline button spinner so a slow POST
  // doesn't look like the click did nothing.
  const [creating, setCreating] = useState(false);

  const fetchShares = useCallback(async () => {
    try {
      const res = await fetch('/api/share');
      const data = await res.json();
      const list: ShareData[] = data.shares ?? [];
      setShares(list);
    } catch (err) {
      console.error('Failed to fetch shares:', err);
      toast.error('Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    if (!resolvedPropertyId) {
      toast.error('Pick a property in the sidebar first');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: resolvedPropertyId,
          siteUrl: resolvedSiteUrl || '',
          config: OVERVIEW_SHARE_CONFIG,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create shared dashboard');
      }
      const token = data?.share?.token;
      if (!token) throw new Error('Share created but no token returned');
      router.push(`/dashboard/share/${token}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create shared dashboard');
      setCreating(false);
    }
    // No `finally` — on success we're navigating away, leaving the spinner
    // visible covers the gap between the POST resolving and the route change.
  }, [creating, resolvedPropertyId, resolvedSiteUrl, router]);

  const handleCopyLink = useCallback((token: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const url = getPublicShareUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      toast.success('Public link copied');
      window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    });
  }, []);

  const handleRevoke = useCallback(async (token: string) => {
    if (!confirm('Revoke this share link? Visitors will see a 404.')) return;
    try {
      const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Revoke failed');
      }
      setShares((prev) => prev.filter((s) => s.token !== token));
      toast.success('Share revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const canCreate = !!resolvedPropertyId;
  const totalViews = shares.reduce((acc, s) => acc + (s.views ?? 0), 0);

  return (
    <div className="space-y-7">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(20,196,225,0.08),rgba(122,217,218,0.04)_45%,transparent_75%)] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(20,196,225,0.18),transparent_70%)] blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#14C4E1]/20 bg-[#14C4E1]/[0.08] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#7AD9DA]">
              <Share2 className="h-3 w-3" />
              Share dashboard
            </div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Share your analytics view</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Hand a polished, branded analytics page to clients or stakeholders. Drag the layout, swap the accent color,
              upload a logo, and copy a public link or iframe snippet — all in seconds.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {shares.length} {shares.length === 1 ? 'share' : 'shares'} live
              </span>
              {totalViews > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {totalViews.toLocaleString()} total views
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || creating}
            title={canCreate ? undefined : 'Pick a property in the sidebar first'}
            className="group flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-[#14C4E1]/30 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 py-2.5 text-sm font-semibold text-[#031017] shadow-[0_18px_44px_rgba(20,196,225,0.18)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                New shared dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Share grid */}
      {shares.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(20,196,225,0.16),rgba(122,217,218,0.08))] ring-1 ring-[#14C4E1]/20">
            <Share2 className="h-6 w-6 text-[#7AD9DA]" />
          </div>
          <h2 className="mb-1 text-base font-semibold text-white">No shared dashboards yet</h2>
          <p className="mx-auto mb-5 max-w-md text-sm text-zinc-500">
            Create a public-share link from your analytics, then customize how it looks for clients,
            stakeholders, or website embeds.
          </p>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || creating}
            title={canCreate ? undefined : 'Pick a property in the sidebar first'}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#14C4E1]/30 bg-[#14C4E1]/15 px-4 py-2 text-xs font-medium text-[#7AD9DA] transition-colors hover:bg-[#14C4E1]/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Create your first share
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shares.map((s) => {
            const accent = s.config.theme.accentColor || DEFAULT_SHARE_ACCENT;
            const displayName = s.config.branding.companyName || formatSiteLabel(s.siteUrl);
            return (
              <motion.div
                key={s.token}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] transition-all hover:border-white/[0.14]"
              >
                {/* Accent stripe at top */}
                <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}88 50%, transparent 100%)` }} />

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {s.config.branding.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.config.branding.logoUrl}
                            alt=""
                            className="h-6 w-6 rounded object-contain ring-1 ring-white/[0.08]"
                          />
                        ) : (
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold uppercase ring-1 ring-white/[0.08]"
                            style={{ backgroundColor: `${accent}22`, color: accent }}
                          >
                            {displayName.slice(0, 2)}
                          </span>
                        )}
                        <h3 className="truncate text-sm font-semibold text-white">{displayName}</h3>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-zinc-500">{formatSiteLabel(s.siteUrl)}</p>
                    </div>
                    <span className="flex-shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                      Public
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-2.5 w-2.5" />
                      {s.views.toLocaleString()} {s.views === 1 ? 'view' : 'views'}
                    </span>
                    <span>· {timeAgo(s.createdAt)}</span>
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.04] pt-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/share/${s.token}`)}
                      className="group/cta flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#14C4E1]/[0.22] bg-[#14C4E1]/[0.10] px-2.5 py-1.5 text-xs font-medium text-[#7AD9DA] transition-colors hover:bg-[#14C4E1]/[0.18]"
                    >
                      <Sparkles className="h-3 w-3" />
                      Customize
                      <ArrowRight className="h-3 w-3 transition-transform group-hover/cta:translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(s.token)}
                      className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/10"
                      title="Copy public link"
                      aria-label="Copy public link"
                    >
                      {copied === s.token ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-white/60" />
                      )}
                    </button>
                    <a
                      href={getPublicShareUrl(s.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/10"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3 text-white/60" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRevoke(s.token)}
                      className="rounded-lg bg-white/5 p-1.5 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      title="Revoke share link"
                      aria-label="Revoke share link"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
}
