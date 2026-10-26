'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button, Modal, Select } from '@/components/ui';
import type { PortfolioSite, SitePatch } from '@/lib/portfolio/types';

const AUTO = '__auto__';
const NONE = '__none__';

/** Change which GA4 property a Search Console site is paired with (or the reverse for GA4-only sites). */
export function PairingDialog({ site, sites, open, onOpenChange, onSave }: {
    site: PortfolioSite | null;
    sites: PortfolioSite[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (site: PortfolioSite, patch: SitePatch) => Promise<void>;
}) {
    const [value, setValue] = useState<string>(AUTO);
    const [saving, setSaving] = useState(false);
    const forGsc = Boolean(site?.gsc);

    useEffect(() => {
        if (!site) return;
        if (site.gsc) setValue(site.ga4 ? (site.pairing === 'manual' ? site.ga4.property : AUTO) : AUTO);
        else setValue(AUTO);
    }, [site]);

    const options = useMemo(() => {
        if (!site) return [];
        const auto = { value: AUTO, label: 'Automatic (match by hostname)' };
        const none = { value: NONE, label: forGsc ? 'No GA4 property' : 'No Search Console site' };
        const seen = new Set<string>();
        const items = forGsc
            ? sites.filter((s) => s.ga4 && !s.ga4.missing).map((s) => s.ga4!).filter((g) => (seen.has(g.property) ? false : (seen.add(g.property), true)))
                .map((g) => ({ value: g.property, label: `${g.displayName} (${g.propertyId})`, textValue: g.displayName }))
            : sites.filter((s) => s.gsc && !s.gsc.missing).map((s) => s.gsc!).filter((g) => (seen.has(g.siteUrl) ? false : (seen.add(g.siteUrl), true)))
                .map((g) => ({ value: g.siteUrl, label: g.siteUrl, textValue: g.siteUrl }));
        return [auto, none, ...items];
    }, [site, sites, forGsc]);

    if (!site) return null;
    const save = async () => {
        setSaving(true);
        try {
            const patch: SitePatch = value === AUTO
                ? { resetPairing: true }
                : forGsc
                    ? { ga4Property: value === NONE ? null : value }
                    : { gscSite: value === NONE ? null : value };
            await onSave(site, patch);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            size="md"
            title={forGsc ? `GA4 property for ${site.label}` : `Search Console site for ${site.label}`}
            description={forGsc
                ? 'We pair sites with GA4 by hostname. Pick a different property if the match is wrong.'
                : 'Pick the Search Console site that belongs to this GA4 property.'}
            footer={(
                <>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="primary" loading={saving} onClick={save}>Save</Button>
                </>
            )}
        >
            <Select
                value={value}
                onValueChange={setValue}
                options={options}
                ariaLabel={forGsc ? 'GA4 property' : 'Search Console site'}
                className="w-full"
            />
        </Modal>
    );
}
