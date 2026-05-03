'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { getEmbedUrl, getPublicShareUrl } from '@/lib/shareUrls';

interface Props {
  shareToken: string | null;
  /** Last save timestamp from the store — when this changes the iframe reloads. */
  reloadKey: string | number | null;
}

export default function SharePreviewIframe({ shareToken, reloadKey }: Props) {
  const isDirty = useDashboardBuilderStore((s) => s.isDirty);
  // Manual refresh nonce — combined with reloadKey to compute the iframe key/src.
  const [manualNonce, setManualNonce] = useState(0);
  const cacheBust = `${reloadKey ?? 'init'}-${manualNonce}`;

  if (!shareToken) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
            <Eye className="w-5 h-5 text-white/30" />
          </div>
          <p className="text-sm font-medium text-white/70 mb-1">No public link yet</p>
          <p className="text-xs text-white/40 leading-relaxed">
            Open the <span className="text-white/60">Links</span> tab and generate a share link to
            preview what viewers will see.
          </p>
        </div>
      </div>
    );
  }

  const src = `${getEmbedUrl(shareToken)}&cb=${cacheBust}`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.06] bg-zinc-950/60">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] font-medium text-white/70">Live preview</span>
          {isDirty && (
            <span className="flex items-center gap-1 text-[9px] text-amber-400/70">
              <AlertCircle className="w-2.5 h-2.5" />
              Save to refresh
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setManualNonce((n) => n + 1)}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white/80 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <a
            href={getPublicShareUrl(shareToken)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white/80 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <iframe
        key={cacheBust}
        src={src}
        className="flex-1 w-full bg-zinc-900"
        title="Public dashboard preview"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
