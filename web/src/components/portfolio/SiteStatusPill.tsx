'use client';

import { StatusPill } from '@/components/ui';
import type { PortfolioSite } from '@/lib/portfolio/types';
import { timeAgo } from './timeAgo';

/** The card's sync pill (DESIGN 3.12 status pills) for a portfolio site. */
export function SiteStatusPill({ site, syncing, className }: { site: PortfolioSite; syncing: boolean; className?: string }) {
    const synced = site.lastSyncedAt ? `Synced ${timeAgo(site.lastSyncedAt)}` : undefined;
    const errors = [site.gsc?.lastError, site.ga4?.lastError].filter(Boolean).join(' · ');
    switch (site.status) {
        case 'synced':
            return <StatusPill status="synced" tooltip={synced} className={className} />;
        case 'syncing':
            return <StatusPill status="syncing" className={className} />;
        case 'pending':
            return syncing
                ? <StatusPill status="syncing" label="Queued" className={className} />
                : <StatusPill status="stale" label="Not synced" className={className} />;
        case 'stale':
            return <StatusPill status="stale" tooltip={synced ?? 'Not synced recently'} className={className} />;
        case 'no_access':
            return <StatusPill status="not_connected" label="No access" tooltip={errors || 'Your Google account cannot read this property'} className={className} />;
        case 'error':
        default: {
            const reconnect = /reconnect|expired/i.test(errors);
            return <StatusPill status="error" label={reconnect ? 'Reconnect' : 'Error'} tooltip={errors || 'Sync failed'} className={className} />;
        }
    }
}
