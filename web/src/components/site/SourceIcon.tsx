'use client';

import type { ReactNode } from 'react';
import { CircleHelp, Link2, Mail, Tag } from 'lucide-react';

import { Favicon } from '@/components/ui/Favicon';
import { flagEmoji } from './lib/geo';
import { sourceInfo, sourceMediumInfo, type SourceInfo } from './lib/sources';

/** 16px icon for a traffic source: its favicon, or a plain glyph for Direct / Not set / campaign words. */
export function SourceIcon({ info }: { info: SourceInfo }) {
    if (info.domain) return <Favicon host={info.domain} size={16} />;
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
