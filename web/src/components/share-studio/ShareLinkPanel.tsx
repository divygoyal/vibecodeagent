'use client';

import { useCallback, useState } from 'react';
import { Link2, Copy, Check, Code2, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPublicShareUrl,
  getEmbedUrl,
  getEmbedIframeSnippet,
  getEmbedScriptSnippet,
} from '@/lib/shareUrls';

interface Props {
  token: string;
  views?: number;
  onRevoked?: () => void;
}

type SnippetTab = 'iframe' | 'script';

export default function ShareLinkPanel({ token, views, onRevoked }: Props) {
  const [snippetTab, setSnippetTab] = useState<SnippetTab>('iframe');
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const publicUrl = getPublicShareUrl(token);
  const embedUrl = getEmbedUrl(token);
  const snippet = snippetTab === 'iframe' ? getEmbedIframeSnippet(token) : getEmbedScriptSnippet(token);

  const handleCopy = useCallback((id: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    });
  }, []);

  const handleRevoke = useCallback(async () => {
    if (!confirm('Revoke this share link? Visitors will see a 404.')) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to revoke share link');
      }
      toast.success('Share link revoked');
      onRevoked?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke share link');
    } finally {
      setRevoking(false);
    }
  }, [token, onRevoked]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Share link</h3>
        <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Active
        </span>
      </div>

      {typeof views === 'number' && (
        <div className="px-1 text-[10px] text-white/40">
          {views.toLocaleString()} {views === 1 ? 'view' : 'views'} so far
        </div>
      )}

      <div className="px-1">
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-white/40">Public URL</label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            readOnly
            value={publicUrl}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[10px] text-white/70 outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => handleCopy('public', publicUrl)}
            className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/10"
            title="Copy URL"
            aria-label="Copy public URL"
          >
            {copied === 'public' ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/60" />
            )}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/10"
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3 text-white/60" />
          </a>
        </div>
      </div>

      <div className="px-1">
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-white/40">Embed URL</label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            readOnly
            value={embedUrl}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[10px] text-white/70 outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => handleCopy('embed', embedUrl)}
            className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/10"
            title="Copy embed URL"
            aria-label="Copy embed URL"
          >
            {copied === 'embed' ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/60" />
            )}
          </button>
        </div>
      </div>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-white/40">Embed snippet</label>
          <div className="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setSnippetTab('iframe')}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                snippetTab === 'iframe' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Code2 className="mr-0.5 inline h-2.5 w-2.5" />
              iframe
            </button>
            <button
              type="button"
              onClick={() => setSnippetTab('script')}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                snippetTab === 'script' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Code2 className="mr-0.5 inline h-2.5 w-2.5" />
              script
            </button>
          </div>
        </div>
        <div className="relative">
          <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/40 p-2 text-[9px] leading-relaxed text-cyan-300/80">
            {snippet}
          </pre>
          <button
            type="button"
            onClick={() => handleCopy('snippet', snippet)}
            className="absolute right-1 top-1 rounded bg-zinc-900/80 p-1 transition-colors hover:bg-zinc-900"
            title="Copy snippet"
            aria-label="Copy embed snippet"
          >
            {copied === 'snippet' ? (
              <Check className="h-2.5 w-2.5 text-emerald-400" />
            ) : (
              <Copy className="h-2.5 w-2.5 text-white/60" />
            )}
          </button>
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-1 pt-2">
        <button
          type="button"
          onClick={handleRevoke}
          disabled={revoking}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/[0.18] bg-red-500/[0.08] px-2.5 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/[0.15] disabled:opacity-40"
        >
          {revoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Revoke share link
          <Link2 className="h-2.5 w-2.5 opacity-40" />
        </button>
      </div>
    </div>
  );
}
