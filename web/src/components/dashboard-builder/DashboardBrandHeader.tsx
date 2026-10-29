'use client';

import { cn } from '@/lib/cn';
import { brandCompanyName } from '@/lib/builder/placeholders';
import type { ThemeV2 } from '@/lib/builder/types';

/** Logo and company name from the dashboard's Appearance settings (no colours: those are fixed). */
export function DashboardBrandHeader({ doc, dark }: { doc: { theme: ThemeV2 }; dark?: boolean }) {
    const h = doc.theme.header;
    // The template's "Your company" is a prompt for the author, never printed (round 4).
    const company = brandCompanyName(doc.theme);
    if (!h.show || (!h.logoUrl && !company)) return null;
    // Round 2 brand kit: a separate logo for dark backgrounds, when set.
    const src = (dark && doc.theme.brand?.logoDarkUrl) || h.logoUrl;
    const logo = src && /^https:\/\//i.test(src) ? src : null;
    if (!logo && !company) return null;
    return (
        <div className={cn('flex items-center gap-3', h.logoPosition === 'center' && 'justify-center', h.logoPosition === 'right' && 'justify-end')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={company ? `${company} logo` : 'Logo'} referrerPolicy="no-referrer" className="h-8 max-w-[160px] object-contain" /> : null}
            {company ? <span className="text-title-sm text-fg">{company}</span> : null}
        </div>
    );
}
