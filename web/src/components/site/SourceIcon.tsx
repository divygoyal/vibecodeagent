'use client';

import { useState, type ReactNode } from 'react';
import { CircleHelp, Globe, Link2, Mail, Tag } from 'lucide-react';

import { flagEmoji } from './lib/geo';
import { sourceInfo, sourceMediumInfo, type SourceInfo } from './lib/sources';

/**
 * Source favicon through /api/favicon. Loaded eagerly (lists show at most a
 * few dozen 16px icons) so rows never sit next to an empty box; a failed icon
 * becomes a globe.
 */
function SourceFavicon({ domain }: { domain: string }) {
    const [failed, setFailed] = useState<string | null>(null);
    if (failed === domain) return <Globe aria-hidden size={14} strokeWidth={1.75} className="text-fg-muted" />;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`/api/favicon?host=${encodeURIComponent(domain)}&size=32`}
            alt=""
            width={16}
            height={16}
            decoding="async"
            onError={() => setFailed(domain)}
            ref={(img) => {
                // A request that failed before hydration never fires onError.
                if (img && img.complete && img.naturalWidth === 0) window.requestAnimationFrame(() => setFailed(domain));
            }}
            className="size-4 shrink-0 rounded-[4px] object-contain"
        />
    );
}

/** 16px icon for a traffic source: its favicon, or a plain glyph for Direct / Not set / campaign words. */
export function SourceIcon({ info }: { info: SourceInfo }) {
    if (info.domain) return <SourceFavicon domain={info.domain} />;
    const Icon = info.kind === 'direct' ? Link2 : info.kind === 'notset' ? CircleHelp : info.kind === 'email' ? Mail : Tag;
    return <Icon aria-hidden size={14} strokeWidth={1.75} className="text-fg-muted" />;
}

/** BarList / table pieces for a GA4 sessionSource value. */
export function sourceParts(raw: string): { label: string; text: string; icon: ReactNode } {
    const info = sourceInfo(raw);
    return { label: info.label, text: info.label, icon: <SourceIcon info={info} /> };
}

/** The same for "source / medium". */
export function sourceMediumParts(raw: string): { label: ReactNode; text: string; icon: ReactNode } {
    const info = sourceMediumInfo(raw);
    return {
        label: info.medium ? <>{info.label} <span className="text-fg-muted">· {info.medium}</span></> : info.label,
        text: info.text,
        icon: <SourceIcon info={info} />,
    };
}

/** Flag for an ISO alpha-2 code, 16px box. */
export function FlagIcon({ code }: { code: string | null | undefined }) {
    const f = flagEmoji(code ?? '');
    return f ? <span aria-hidden className="text-[14px] leading-none">{f}</span> : <span aria-hidden className="size-3 rounded-full bg-subtle" />;
}
