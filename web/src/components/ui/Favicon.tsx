'use client';

import { useCallback, useState } from 'react';

import { cn } from '@/lib/cn';

export type FaviconSize = 16 | 20 | 24 | 32 | 64;

export interface FaviconProps {
    /** Hostname or URL ('acme.com', 'sc-domain:acme.com', 'https://www.acme.com/'). */
    host: string;
    size?: FaviconSize;
    className?: string;
}

/** 'sc-domain:www.Acme.com' -> 'acme.com' (same rule as lib/sites/pairing normalizeHost). */
function cleanHost(input: string): string {
    let raw = input.trim().toLowerCase();
    if (raw.startsWith('sc-domain:')) raw = raw.slice(10);
    raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split('/')[0].replace(/:\d+$/, '');
    return raw.startsWith('www.') ? raw.slice(4) : raw;
}

const RADIUS: Record<FaviconSize, string> = {
    16: 'rounded-[4px]',
    20: 'rounded-badge',
    24: 'rounded-badge',
    32: 'rounded-md ring-1 ring-border-subtle',
    64: 'rounded-xl ring-1 ring-border-subtle',
};

/**
 * Site icon through our proxy (/api/favicon, cached 7 days). Falls back to a
 * grey letter tile, never a colourful one (DESIGN 2.8, 3.19).
 */
export function Favicon({ host, size = 20, className }: FaviconProps) {
    const h = cleanHost(host);
    // Reserved names (demo data) and GA4-only route keys never have icons: skip the request.
    const noIcon = !h.includes('.') || /\.(example|test|invalid|localhost|local)$/.test(h);
    // Failure is remembered per source, so a new source gets a fresh try.
    const [failedFor, setFailedFor] = useState<string | null>(null);
    const failed = failedFor !== null && failedFor === (h ?? '');
    // An image that failed before hydration never fires onError: check when it mounts.
    const imgRef = useCallback((img: HTMLImageElement | null) => {
        if (img && img.complete && img.naturalWidth === 0) {
            const key = h ?? '';
            window.requestAnimationFrame(() => setFailedFor(key));
        }
    }, [h]);
    const box = cn('inline-flex shrink-0 items-center justify-center overflow-hidden', RADIUS[size], className);
    if (!h || failed || noIcon) {
        return (
            <span
                aria-hidden
                className={cn(box, 'bg-subtle font-semibold text-fg-secondary')}
                // Never under the 11px floor (critique #10): 11px in 16/20px tiles, half the tile above.
                style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.5)), lineHeight: 1 }}
            >
                {(h[0] ?? '?').toUpperCase()}
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            ref={imgRef}
            src={`/api/favicon?host=${encodeURIComponent(h)}&size=${size >= 32 ? 64 : 32}`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            onError={() => setFailedFor(h ?? '')}
            className={cn(box, 'bg-surface object-contain')}
            style={{ width: size, height: size }}
        />
    );
}
