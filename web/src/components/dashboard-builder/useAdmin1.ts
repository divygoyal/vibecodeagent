'use client';

import { useEffect, useState } from 'react';

import { admin1Url, decodeAdmin1, type Admin1File, type RegionShape } from '@/lib/builder/geo';

const cache = new Map<string, Promise<RegionShape[] | null>>();

/** One country's region shapes, fetched once. null = this country has none (or the file could not load). */
export function loadAdmin1(country: string): Promise<RegionShape[] | null> {
    const url = admin1Url(country);
    if (!url) return Promise.resolve(null);
    let p = cache.get(country);
    if (!p) {
        p = fetch(url)
            .then((r) => {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error(`admin1 ${r.status}`);
                return r.json() as Promise<Admin1File>;
            })
            .then((f) => {
                const shapes = decodeAdmin1(f);
                return shapes.length ? shapes : null;
            })
            .catch(() => {
                // A network failure is not "no shapes": the next render may try again.
                cache.delete(country);
                return null;
            });
        cache.set(country, p);
    }
    return p;
}

/** undefined while loading, null when the country has no shapes, else the shapes. */
export function useAdmin1(country: string | null): RegionShape[] | null | undefined {
    const [state, setState] = useState<{ country: string | null; shapes: RegionShape[] | null | undefined }>({ country, shapes: undefined });
    useEffect(() => {
        let live = true;
        if (!country) return;
        loadAdmin1(country).then((s) => live && setState({ country, shapes: s }));
        return () => { live = false; };
    }, [country]);
    if (!country) return null;
    return state.country === country ? state.shapes : undefined;
}
