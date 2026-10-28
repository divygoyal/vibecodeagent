'use client';

import { useState } from 'react';
import { Globe, Monitor, Smartphone, Tablet, Tv, type LucideIcon } from 'lucide-react';

import { browserIconHost, deviceKind, osIconHost, type DeviceKind } from './lib/techIcons';

export { browserIconHost, osIconHost };

/** 16px icons for GA4 browser, OS and device values; unknown values and failed icons get a plain glyph. */
const GLYPH: Record<DeviceKind, LucideIcon> = { mobile: Smartphone, tablet: Tablet, tv: Tv, desktop: Monitor };

export function deviceGlyph(device: string): LucideIcon {
    return GLYPH[deviceKind(device)];
}

function Fav({ host, fallback: Fallback, title }: { host: string | null; fallback: LucideIcon; title?: string }) {
    const [failed, setFailed] = useState<string | null>(null);
    if (!host || failed === host) return <Fallback aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`/api/favicon?host=${encodeURIComponent(host)}&size=32`}
            alt=""
            title={title}
            width={16}
            height={16}
            decoding="async"
            onError={() => setFailed(host)}
            ref={(img) => {
                // A request that failed before hydration never fires onError.
                if (img && img.complete && img.naturalWidth === 0) window.requestAnimationFrame(() => setFailed(host));
            }}
            className="size-4 shrink-0 rounded-[3px] object-contain"
        />
    );
}

export function BrowserIcon({ name }: { name: string }) {
    return <Fav host={browserIconHost(name)} fallback={Globe} />;
}

export function OsIcon({ name }: { name: string }) {
    return <Fav host={osIconHost(name)} fallback={Monitor} />;
}

export function DeviceIcon({ device, className }: { device: string; className?: string }) {
    const props = { 'aria-hidden': true, size: 14, strokeWidth: 1.75, className: className ?? 'shrink-0 text-fg-muted' } as const;
    const k = deviceKind(device);
    return k === 'mobile' ? <Smartphone {...props} /> : k === 'tablet' ? <Tablet {...props} /> : k === 'tv' ? <Tv {...props} /> : <Monitor {...props} />;
}
