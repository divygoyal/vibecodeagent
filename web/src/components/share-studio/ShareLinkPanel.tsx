'use client';

import { useCallback, useState } from 'react';
import { Link2, Copy, Check, Code2, Loader2, Trash2, Share2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import {
  getPublicShareUrl,
  getEmbedUrl,
  getEmbedIframeSnippet,
  getEmbedScriptSnippet,
} from '@/lib/shareUrls';

type SnippetTab = 'iframe' | 'script';

export default function ShareLinkPanel() {
  const dashboardId = useDashboardBuilderStore((s) => s.dashboardId);
  const shareToken = useDashboardBuilderStore((s) => s.shareToken);
  const setShareToken = useDashboardBuilderStore((s) => s.setShareToken);
  const setPublic = useDashboardBuilderStore((s) => s.setPublic);

  const [busy, setBusy] = useState(false);
  const [snippetTab, setSnippetTab] = useState<SnippetTab>('iframe');
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!dashboardId) {
      toast.error('Save the dashboard before generating a share link.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/share`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate share link');
      if (data.shareToken) {
        setShareToken(data.shareToken);
        setPublic(true);
        toast.success('Share link generated');
      } else {
        throw new Error('No share token returned');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate share link';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [dashboardId, setPublic, setShareToken]);

  const handleRevoke = useCallback(async () => {
    if (!dashboardId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/share`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to revoke share link');
      }
      setShareToken(null);
      setPublic(false);
      toast.success('Share link revoked');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke share link';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [dashboardId, setPublic, setShareToken]);

  const handleCopy = useCallback((id: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    });
  }, []);

  if (!shareToken) {
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-1">
          Share Link
        </h3>
        <div className="px-1">
          <p className="text-xs text-white/50 mb-3 leading-relaxed">
            Generate a public link viewers can open without logging in — and embed your dashboard
            in any website.
          </p>
          <button
            onClick={handleGenerate}
            disabled={busy || !dashboardId}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-[var(--db-primary)] text-white hover:bg-[var(--db-primary)]/90 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
            {busy ? 'Generating…' : 'Generate share link'}
          </button>
          {!dashboardId && (
            <p className="text-[9px] text-amber-400/70 mt-1.5 leading-relaxed">
              Save your dashboard at least once before sharing.
            </p>
          )}
        </div>
      </div>
    );
  }

  const publicUrl = getPublicShareUrl(shareToken);
  const embedUrl = getEmbedUrl(shareToken);
  const snippet = snippetTab === 'iframe'
    ? getEmbedIframeSnippet(shareToken)
    : getEmbedScriptSnippet(shareToken);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Share Link
        </h3>
        <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Active
        </span>
      </div>

      {/* Public URL */}
      <div className="px-1">
        <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          Public URL
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            readOnly
            value={publicUrl}
            className="flex-1 min-w-0 text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 outline-none font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={() => handleCopy('public', publicUrl)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Copy URL"
          >
            {copied === 'public' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-white/60" />
            )}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3 h-3 text-white/60" />
          </a>
        </div>
      </div>

      {/* Embed URL */}
      <div className="px-1">
        <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          Embed URL
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            readOnly
            value={embedUrl}
            className="flex-1 min-w-0 text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 outline-none font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={() => handleCopy('embed', embedUrl)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Copy embed URL"
          >
            {copied === 'embed' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-white/60" />
            )}
          </button>
        </div>
      </div>

      {/* Snippet selector */}
      <div className="px-1">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
            Embed Snippet
          </label>
          <div className="flex items-center gap-0.5 bg-white/5 rounded-md p-0.5">
            <button
              onClick={() => setSnippetTab('iframe')}
              className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
                snippetTab === 'iframe' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Code2 className="inline w-2.5 h-2.5 mr-0.5" />
              iframe
            </button>
            <button
              onClick={() => setSnippetTab('script')}
              className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
                snippetTab === 'script' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Code2 className="inline w-2.5 h-2.5 mr-0.5" />
              script
            </button>
          </div>
        </div>
        <div className="relative">
          <pre className="text-[9px] leading-relaxed bg-black/40 border border-white/[0.06] rounded-lg p-2 text-cyan-300/80 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
            {snippet}
          </pre>
          <button
            onClick={() => handleCopy('snippet', snippet)}
            className="absolute top-1 right-1 p-1 rounded bg-zinc-900/80 hover:bg-zinc-900 transition-colors"
            title="Copy snippet"
          >
            {copied === 'snippet' ? (
              <Check className="w-2.5 h-2.5 text-emerald-400" />
            ) : (
              <Copy className="w-2.5 h-2.5 text-white/60" />
            )}
          </button>
        </div>
      </div>

      {/* Revoke */}
      <div className="px-1 pt-2 border-t border-white/[0.06]">
        <button
          onClick={handleRevoke}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-red-500/[0.08] hover:bg-red-500/[0.15] text-red-300 border border-red-500/[0.18] transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Revoke share link
          <Link2 className="w-2.5 h-2.5 opacity-40" />
        </button>
      </div>
    </div>
  );
}
