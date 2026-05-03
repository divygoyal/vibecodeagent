'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus, Share2, Copy, ExternalLink, Loader2, Sparkles, Check, Eye, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareData } from '@/lib/shareTypes';
import { getPublicShareUrl } from '@/lib/shareUrls';
import ShareDashboardModal from '@/components/ShareDashboardModal';
import { useRegistration } from '../layout';

function formatSiteLabel(url: string): string {
  if (!url) return 'Untitled site';
  return url.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export default function ShareLandingPage() {
  const router = useRouter();
  const { resolvedPropertyId, resolvedSiteUrl } = useRegistration();
  const [shares, setShares] = useState<ShareData[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [recentlyCreated, setRecentlyCreated] = useState<Set<string>>(new Set());

  const fetchShares = useCallback(async () => {
    try {
      const res = await fetch('/api/share');
      const data = await res.json();
      const list: ShareData[] = data.shares ?? [];
      setShares(list);
      // Auto-route into the Studio for any newly-created share that we haven't yet seen.
      const fresh = list.find((s) => recentlyCreated.has(s.token));
      if (fresh) {
        router.push(`/dashboard/share/${fresh.token}`);
      }
    } catch (err) {
      console.error('Failed to fetch shares:', err);
      toast.error('Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [recentlyCreated, router]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Share &amp; Preview</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Customize the shared analytics view your clients see — drag sections, pick a theme, brand it, set defaults, and copy the public link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Pick a property in the sidebar first'}
          className="flex items-center gap-1.5 self-start rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          New shared dashboard
        </button>
      </div>

      {shares.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/[0.08]">
            <Share2 className="h-5 w-5 text-emerald-400" />
          </div>
          <h2 className="mb-1 text-sm font-medium text-white">No shared dashboards yet</h2>
          <p className="mx-auto mb-4 max-w-md text-xs text-zinc-500">
            Generate a public-share link for your analytics, then customize how it looks for clients, stakeholders, or website embeds.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={canCreate ? undefined : 'Pick a property in the sidebar first'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create your first share
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shares.map((s) => (
            <motion.div
              key={s.token}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="group flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-white">
                    {s.config.branding?.companyName || formatSiteLabel(s.siteUrl)}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {formatSiteLabel(s.siteUrl)}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                  Public
                </span>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <Eye className="h-2.5 w-2.5" />
                  {s.views.toLocaleString()} {s.views === 1 ? 'view' : 'views'}
                </span>
                <span>{new Date(s.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.04] pt-2">
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/share/${s.token}`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/[0.18] bg-emerald-500/[0.08] px-2.5 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/15"
                >
                  <Share2 className="h-3 w-3" />
                  Customize
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
            </motion.div>
          ))}
        </div>
      )}

      <ShareDashboardModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          // Refresh the list — also picks up any newly-created token to auto-navigate.
          const previousTokens = new Set(shares.map((s) => s.token));
          fetch('/api/share')
            .then((res) => res.json())
            .then((data) => {
              const list: ShareData[] = data.shares ?? [];
              const fresh = list.find((s) => !previousTokens.has(s.token));
              if (fresh) {
                setRecentlyCreated((prev) => new Set(prev).add(fresh.token));
                router.push(`/dashboard/share/${fresh.token}`);
              } else {
                setShares(list);
              }
            })
            .catch(() => fetchShares());
        }}
        propertyId={resolvedPropertyId}
        siteUrl={resolvedSiteUrl}
      />
    </div>
  );
}
