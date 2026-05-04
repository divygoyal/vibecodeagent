'use client';

import { forwardRef, useState } from 'react';
import { ExternalLink, RefreshCw, Eye } from 'lucide-react';
import { getEmbedUrl, getPublicShareUrl } from '@/lib/shareUrls';

interface Props {
  token: string;
  /** When this changes (e.g. timestamp after save) the iframe reloads. */
  reloadKey: string | number;
}

/**
 * SharePreviewIframe — exposes the underlying <iframe> via forwardRef so the Studio
 * can postMessage live-preview overrides (accent color, branding, section order/visibility)
 * into it without reloading the page.
 */
const SharePreviewIframe = forwardRef<HTMLIFrameElement, Props>(function SharePreviewIframe(
  { token, reloadKey },
  ref,
) {
  const [manualNonce, setManualNonce] = useState(0);
  const cacheBust = `${reloadKey}-${manualNonce}`;
  const src = `${getEmbedUrl(token)}&cb=${encodeURIComponent(cacheBust)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-zinc-950/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
          <span className="text-[11px] font-medium text-white/70">Live preview</span>
          <span className="text-[9px] text-white/30">— theme &amp; layout update instantly</span>
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
        ref={ref}
        key={cacheBust}
        src={src}
        className="w-full flex-1 bg-zinc-900"
        title="Public share preview"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
});

export default SharePreviewIframe;
