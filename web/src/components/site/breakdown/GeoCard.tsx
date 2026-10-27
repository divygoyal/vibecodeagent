'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

import { fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { gscToAlpha2 } from '@/lib/builder/countries';
import { BarList, type BarListItem } from '@/components/charts/BarList';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { useFilterClick } from '../filters/SiteFilters';
import { FindingLine } from '../Finding';
import { geoFinding } from '../lib/findings';
import { countryFromIso3, flagForName } from '../lib/geo';
import { geoLabel } from '../lib/sources';
import type { Ga4BreakdownResponse, GscRowsResponse } from '../lib/types';
import { LoadError } from '../SiteStates';
import { FlagIcon } from '../SourceIcon';
import { useActiveFilters, useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';

// d3-geo + topojson load only on pages with a map.
const GeoChoropleth = dynamic(() => import('@/components/charts/GeoChoropleth'), {
    ssr: false,
    loading: () => <div className="skeleton aspect-[1.9] w-full rounded-md" />,
});

type GeoTab = 'countries' | 'cities';

/**
 * Map card (Overview, Traffic, Audience): choropleth of users by country next
 * to the top countries (or cities). Click a country on the map or in the list
 * to filter. GA4 users; Search Console clicks for sites without GA4.
 */
export function GeoCard({ className, mapFirst = true }: { className?: string; mapFirst?: boolean }) {
    const site = useSite();
    const { compareOn } = useSiteRange();
    const [tab, setTab] = useState<GeoTab>('countries');
    const ga = useGa4<Ga4BreakdownResponse>(site.hasGa4 ? 'countries' : null);
    const cities = useGa4<Ga4BreakdownResponse>(site.hasGa4 && tab === 'cities' ? 'cities' : null);
    const sc = useGsc<GscRowsResponse>(!site.hasGa4 && site.hasGsc ? 'countries' : null);
    const click = useFilterClick();
    const filters = useActiveFilters();
    const metric = site.hasGa4 ? 'users' : 'clicks';
    const unit = site.hasGa4 ? 'users' : 'search clicks';

    const data = useMemo(() => {
        const values = new Map<string, number>();
        const items: (BarListItem & { raw: string })[] = [];
        const finding: { label: string; cur: number; prev?: number | null }[] = [];
        if (site.hasGa4) {
            for (const r of ga.data?.rows ?? []) {
                const code = r.dims.countryId && r.dims.countryId !== '(not set)' ? r.dims.countryId : null;
                const users = r.cur.activeUsers ?? 0;
                if (code) values.set(code, (values.get(code) ?? 0) + users);
                const name = geoLabel(r.dims.country);
                items.push({ key: r.key, raw: r.dims.country, label: name, text: name, value: users, icon: code ? <FlagIcon code={code} /> : <FlagIcon code={null} /> });
                finding.push({ label: name, cur: users, prev: r.prev === undefined ? undefined : r.prev?.activeUsers ?? null });
            }
        } else {
            for (const r of sc.data?.rows ?? []) {
                const code = gscToAlpha2(r.key);
                const c = countryFromIso3(r.key);
                if (code) values.set(code, (values.get(code) ?? 0) + r.clicks);
                items.push({ key: r.key, raw: c.name, label: c.name, text: c.name, value: r.clicks, icon: <FlagIcon code={code} /> });
                finding.push({ label: c.name, cur: r.clicks, prev: r.prev === undefined ? undefined : r.prev?.clicks ?? null });
            }
        }
        return { values, items, finding: geoFinding(finding, unit) };
    }, [ga.data, sc.data, site.hasGa4, unit]);

    const cityItems = useMemo(() => (cities.data?.rows ?? []).map((r) => {
        const city = geoLabel(r.dims.city);
        return {
            key: r.key, raw: r.dims.city, label: <>{city} <span className="text-fg-muted">{r.dims.country}</span></>, text: `${city}, ${r.dims.country}`,
            value: r.cur.activeUsers ?? 0, icon: <span aria-hidden className="text-[14px] leading-none">{flagForName(r.dims.country)}</span>,
        };
    }), [cities.data]);

    const q = site.hasGa4 ? ga : sc;
    const raws = new Map(data.items.map((i) => [i.key, i.raw]));
    const cityRaws = new Map(cityItems.map((i) => [i.key, i.raw]));
    const nameByCode = new Map<string, string>();
    const codeByName = new Map<string, string>();
    for (const r of ga.data?.rows ?? []) {
        if (!r.dims.countryId || r.dims.countryId === '(not set)') continue;
        nameByCode.set(r.dims.countryId, r.dims.country);
        codeByName.set(r.dims.country, r.dims.countryId);
    }
    const selectedCode = filters.country ? codeByName.get(filters.country) ?? null : null;

    const list = tab === 'countries' ? (
        <BarList
            items={data.items}
            metric={metric === 'users' ? 'users' : 'clicks'}
            limit={8}
            showShare
            loading={q.state === 'loading'}
            labelHeader="Country"
            viewAllTitle="Countries"
            onItemClick={site.hasGa4 && !filters.country ? (it) => click('country', raws.get(it.key) ?? '') : undefined}
            empty={<EmptyState variant="inline" title="No country data in this period" />}
        />
    ) : (
        cities.state === 'error' ? <LoadError error={cities.error} onRetry={cities.mutate} /> : (
            <BarList
                items={cityItems}
                metric="users"
                limit={8}
                showShare
                loading={cities.state === 'loading'}
                labelHeader="City"
                viewAllTitle="Cities"
                onItemClick={!filters.city ? (it) => click('city', cityRaws.get(it.key) ?? '') : undefined}
                empty={<EmptyState variant="inline" title="No city data in this period" />}
            />
        )
    );

    return (
        <Card as="section" aria-label="Locations" className={className}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 className="text-title-sm text-fg">Locations</h3>
                {site.hasGa4 ? (
                    <Tabs<GeoTab> variant="pills" ariaLabel="Locations view" value={tab} onValueChange={setTab}
                        items={[{ value: 'countries', label: 'Countries' }, { value: 'cities', label: 'Cities' }]} />
                ) : <span className="text-meta text-fg-muted">Search clicks by country</span>}
            </div>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <>
                    <FindingLine finding={compareOn || data.finding ? data.finding : null} loading={q.state === 'loading'} />
                    <div className={`grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] ${mapFirst ? '' : 'lg:[&>*:first-child]:order-2'}`}>
                        <div className="min-w-0">
                            {q.state === 'loading' ? <div className="skeleton aspect-[1.9] w-full rounded-md" /> : data.values.size === 0 && q.state === 'ready' ? (
                                <EmptyState variant="inline" title={`No ${unit} with a known country`} />
                            ) : (
                                <GeoChoropleth
                                    values={data.values}
                                    color={METRICS[metric].color}
                                    format={fmtFull}
                                    label={site.hasGa4 ? 'Users' : 'Clicks'}
                                    selected={selectedCode}
                                    onSelect={site.hasGa4 && !filters.country ? (code) => click('country', nameByCode.get(code) ?? '') : undefined}
                                />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="mb-1 flex justify-between text-meta text-fg-muted" aria-hidden>
                                <span>{tab === 'countries' ? 'Country' : 'City'}</span>
                                <span className="flex gap-3"><span>{site.hasGa4 ? 'Users' : 'Clicks'}</span><span className="w-12 text-right">Share</span></span>
                            </div>
                            {list}
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}

