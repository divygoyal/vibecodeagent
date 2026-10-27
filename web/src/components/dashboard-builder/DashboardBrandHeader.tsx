'use client';

import { cn } from '@/lib/cn';
import type { ThemeV2 } from '@/lib/builder/types';

/** Logo and company name from the dashboard's Appearance settings (no colours: those are fixed). */
export function DashboardBrandHeader({ doc, dark }: { doc: { theme: ThemeV2 }; dark?: boolean }) {
    const h = doc.theme.header;
    if (!h.show || (!h.logoUrl && !h.companyName)) return null;
    // Round 2 brand kit: a separate logo for dark backgrounds, when set.
    const src = (dark && doc.theme.brand?.logoDarkUrl) || h.logoUrl;
    const logo = src && /^https:\/\//i.test(src) ? src : null;
    return (
        <div className={cn('flex items-center gap-3', h.logoPosition === 'center' && 'justify-center', h.logoPosition === 'right' && 'justify-end')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={h.companyName ? `${h.companyName} logo` : 'Logo'} referrerPolicy="no-referrer" className="h-8 max-w-[160px] object-contain" /> : null}
            {h.companyName ? <span className="text-title-sm text-fg">{h.companyName}</span> : null}
        </div>
    );
}

/** "Made with TrafficClaw" (default on, can be turned off; free either way). */
export function MadeWithBadge() {
    return (
        <a href="https://trafficclaw.com/?ref=dashboard" target="_blank" rel="noopener" className="tap-area inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-meta text-fg-muted shadow-xs hover:text-fg">
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            Made with TrafficClaw
        </a>
    );
}
