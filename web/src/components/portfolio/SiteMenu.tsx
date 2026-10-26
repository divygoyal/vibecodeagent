'use client';

import { BarChart3, Eye, EyeOff, Link2, MoreHorizontal, Search } from 'lucide-react';

import {
    Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui';
import type { PortfolioSite } from '@/lib/portfolio/types';

export interface SiteMenuActions {
    onToggleHidden: (site: PortfolioSite) => void;
    onEditPairing: (site: PortfolioSite) => void;
}

export function searchConsoleUrl(siteUrl: string): string {
    return `https://search.google.com/search-console?resource_id=${encodeURIComponent(siteUrl)}`;
}

export function analyticsUrl(propertyId: string): string {
    return `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome`;
}

function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

/** Per-site overflow menu: hide, change the GA4 link, open in Google. */
export function SiteMenu({ site, actions, className }: { site: PortfolioSite; actions: SiteMenuActions; className?: string }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" iconOnly icon={MoreHorizontal} aria-label={`More for ${site.label}`} className={className ?? 'size-7'} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem icon={Link2} onSelect={() => actions.onEditPairing(site)}>
                    {site.gsc ? (site.ga4 ? 'Change GA4 link…' : 'Link a GA4 property…') : 'Link a Search Console site…'}
                </DropdownMenuItem>
                <DropdownMenuItem icon={site.hidden ? Eye : EyeOff} onSelect={() => actions.onToggleHidden(site)}>
                    {site.hidden ? 'Show in portfolio' : 'Hide from portfolio'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {site.gsc ? (
                    <DropdownMenuItem icon={Search} onSelect={() => openExternal(searchConsoleUrl(site.gsc!.siteUrl))}>
                        Open in Search Console
                    </DropdownMenuItem>
                ) : null}
                {site.ga4 ? (
                    <DropdownMenuItem icon={BarChart3} onSelect={() => openExternal(analyticsUrl(site.ga4!.propertyId))}>
                        Open in Google Analytics
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
