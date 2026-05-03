'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { getEmbedUrl, getPublicShareUrl } from '@/lib/shareUrls';

interface Props {
  token: string;
  /** When this changes (e.g. timestamp after save) the iframe reloads. */
  reloadKey: string | number;
  /** Visual cue: dirty draft. Shown as a "Save to refresh" hint. */
  isDirty?: boolean;
}

export default function SharePreviewIframe({ token, reloadKey, isDirty }: Props) {
  const [manualNonce, setManualNonce] = useState(0);
  const cacheBust = `${reloadKey}-${manualNonce}`;
  const src = `${getEmbedUrl(token)}&cb=${encodeURIComponent(cacheBust)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-zinc-950/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
          <span className="text-[11px] font-medium text-white/70">Live preview</span>
          {isDirty && (
            <span className="flex items-center gap-1 text-[9px] text-amber-400/70">
              <AlertCircle className="h-2.5 w-2.5" />
              Save to refresh
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setManualNonce((n) => n + 1)}
            className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            title="Refresh preview"
            aria-label="Refresh preview"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <a
            href={getPublicShareUrl(token)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            title="Open public URL in new tab"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <iframe
        key={cacheBust}
        src={src}
        className="w-full flex-1 bg-zinc-900"
        title="Public share preview"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
