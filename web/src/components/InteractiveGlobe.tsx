'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import createGlobe from 'cobe';

// ─── Coordinate lookups ───
const COUNTRY_COORDS: Record<string, [number, number]> = {
    'United States': [39.8, -98.5], 'United Kingdom': [54.0, -2.0], 'India': [22.0, 78.0],
    'Germany': [51.2, 10.4], 'Japan': [36.2, 138.3], 'Australia': [-25.3, 133.8],
    'France': [46.6, 2.2], 'Canada': [56.1, -106.3], 'Brazil': [-14.2, -51.9],
    'Russia': [61.5, 105.3], 'Singapore': [1.35, 103.8], 'UAE': [23.4, 53.8],
    'Turkey': [39.0, 35.2], 'Indonesia': [-0.8, 113.9], 'South Korea': [35.9, 127.8],
    'China': [35.9, 104.2], 'Netherlands': [52.1, 5.3], 'Spain': [40.5, -3.7],
    'Italy': [41.9, 12.6], 'Mexico': [23.6, -102.6], 'Poland': [51.9, 19.1],
    'Sweden': [60.1, 18.6], 'Switzerland': [46.8, 8.2], 'Argentina': [-38.4, -63.6],
    'South Africa': [-30.6, 22.9], 'Thailand': [15.9, 100.9], 'Vietnam': [14.1, 108.3],
    'Philippines': [12.9, 121.8], 'Pakistan': [30.4, 69.3], 'Bangladesh': [23.7, 90.4],
    'Nigeria': [9.1, 8.7], 'Egypt': [26.8, 30.8], 'Kenya': [-0.02, 37.9],
    'Colombia': [4.6, -74.3], 'Chile': [-35.7, -71.5], 'Peru': [-9.2, -75.0],
    'Israel': [31.0, 34.9], 'Malaysia': [4.2, 101.9], 'Taiwan': [23.7, 121.0],
    'Ireland': [53.1, -7.7], 'New Zealand': [-40.9, 174.9], 'Portugal': [39.4, -8.2],
    'Norway': [60.5, 8.5], 'Denmark': [56.3, 9.5], 'Finland': [61.9, 25.7],
    'Belgium': [50.5, 4.5], 'Austria': [47.5, 14.6], 'Czech Republic': [49.8, 15.5],
    'Romania': [45.9, 24.97], 'Greece': [39.1, 21.8], 'Ukraine': [48.4, 31.2],
    'Saudi Arabia': [23.9, 45.1], 'Hong Kong': [22.3, 114.2],
};

const CITY_COORDS: Record<string, [number, number]> = {
    'New York': [40.71, -74.01], 'London': [51.51, -0.13], 'Mumbai': [19.08, 72.88],
    'San Francisco': [37.77, -122.42], 'Berlin': [52.52, 13.41], 'Toronto': [43.65, -79.38],
    'Paris': [48.86, 2.35], 'Sydney': [-33.87, 151.21], 'Tokyo': [35.68, 139.69],
    'Singapore': [1.35, 103.82], 'Amsterdam': [52.37, 4.90], 'Bangalore': [12.97, 77.59],
    'Dubai': [25.20, 55.27], 'Chicago': [41.88, -87.63], 'Los Angeles': [34.05, -118.24],
    'Moscow': [55.75, 37.62], 'Seoul': [37.57, 126.98], 'Beijing': [39.90, 116.40],
    'Jakarta': [-6.21, 106.85], 'Istanbul': [41.01, 28.98], 'New Delhi': [28.61, 77.23],
    'Melbourne': [-37.81, 144.96], 'Bangkok': [13.76, 100.50], 'Lagos': [6.52, 3.38],
    'Mexico City': [19.43, -99.13], 'Buenos Aires': [-34.60, -58.38],
};

const COUNTRY_FLAGS: Record<string, string> = {
    'United States': '\u{1F1FA}\u{1F1F8}', 'United Kingdom': '\u{1F1EC}\u{1F1E7}', 'India': '\u{1F1EE}\u{1F1F3}', 'Germany': '\u{1F1E9}\u{1F1EA}',
    'Japan': '\u{1F1EF}\u{1F1F5}', 'Australia': '\u{1F1E6}\u{1F1FA}', 'France': '\u{1F1EB}\u{1F1F7}', 'Canada': '\u{1F1E8}\u{1F1E6}', 'Brazil': '\u{1F1E7}\u{1F1F7}',
    'Russia': '\u{1F1F7}\u{1F1FA}', 'Singapore': '\u{1F1F8}\u{1F1EC}', 'UAE': '\u{1F1E6}\u{1F1EA}', 'Turkey': '\u{1F1F9}\u{1F1F7}', 'Indonesia': '\u{1F1EE}\u{1F1E9}',
    'South Korea': '\u{1F1F0}\u{1F1F7}', 'China': '\u{1F1E8}\u{1F1F3}', 'Netherlands': '\u{1F1F3}\u{1F1F1}', 'Spain': '\u{1F1EA}\u{1F1F8}',
    'Italy': '\u{1F1EE}\u{1F1F9}', 'Mexico': '\u{1F1F2}\u{1F1FD}', 'Poland': '\u{1F1F5}\u{1F1F1}', 'Sweden': '\u{1F1F8}\u{1F1EA}', 'Switzerland': '\u{1F1E8}\u{1F1ED}',
    'Argentina': '\u{1F1E6}\u{1F1F7}', 'South Africa': '\u{1F1FF}\u{1F1E6}', 'Thailand': '\u{1F1F9}\u{1F1ED}', 'Vietnam': '\u{1F1FB}\u{1F1F3}',
    'Philippines': '\u{1F1F5}\u{1F1ED}', 'Pakistan': '\u{1F1F5}\u{1F1F0}', 'Bangladesh': '\u{1F1E7}\u{1F1E9}', 'Nigeria': '\u{1F1F3}\u{1F1EC}',
    'Egypt': '\u{1F1EA}\u{1F1EC}', 'Kenya': '\u{1F1F0}\u{1F1EA}', 'Colombia': '\u{1F1E8}\u{1F1F4}', 'Chile': '\u{1F1E8}\u{1F1F1}', 'Peru': '\u{1F1F5}\u{1F1EA}',
    'Israel': '\u{1F1EE}\u{1F1F1}', 'Malaysia': '\u{1F1F2}\u{1F1FE}', 'Taiwan': '\u{1F1F9}\u{1F1FC}', 'Ireland': '\u{1F1EE}\u{1F1EA}',
    'New Zealand': '\u{1F1F3}\u{1F1FF}', 'Portugal': '\u{1F1F5}\u{1F1F9}', 'Norway': '\u{1F1F3}\u{1F1F4}', 'Denmark': '\u{1F1E9}\u{1F1F0}',
    'Finland': '\u{1F1EB}\u{1F1EE}', 'Belgium': '\u{1F1E7}\u{1F1EA}', 'Austria': '\u{1F1E6}\u{1F1F9}', 'Saudi Arabia': '\u{1F1F8}\u{1F1E6}',
    'Hong Kong': '\u{1F1ED}\u{1F1F0}',
};

const ANIMALS = ['gayal', 'butterfly', 'cardinal', 'falcon', 'dolphin', 'panther', 'sparrow', 'penguin', 'firefly', 'orca', 'mantis', 'robin', 'phoenix', 'griffin', 'osprey'];
const ADJ = ['bronze', 'salmon', 'blush', 'cobalt', 'crimson', 'golden', 'silver', 'scarlet', 'indigo', 'copper', 'emerald', 'violet', 'obsidian', 'ivory', 'russet'];

const DEVICE_ICONS: Record<string, string> = { desktop: '\u{1F5A5}\uFE0F', mobile: '\u{1F4F1}', tablet: '\u{1F4DF}' };
const REFERRER_ICONS: Record<string, string> = {
    'Organic Search': '\u{1F50D}', 'Direct': '\u{1F517}', 'Referral': '\u{1F310}', 'Social': '\u{1F4AC}',
    'Email': '\u2709\uFE0F', 'Paid Search': '\u{1F4B0}', '(direct)': '\u{1F517}', 'google': '\u{1F50D}',
    'github.com': '\u{1F419}', 't.co': 'X', 'linkedin.com': '\u{1F4BC}',
};

interface GlobeProps {
    realtimeData?: any;
    countries?: any[];
    cities?: any[];
    referrers?: any[];
    devices?: any[];
}

export default function InteractiveGlobe({ realtimeData, countries = [], cities = [], referrers = [], devices = [] }: GlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const widthRef = useRef(0);

    // Prefer real-time data when available, fallback to historical
    const rtCountries = realtimeData?.byCountry || [];
    const rtCities = realtimeData?.byCity || [];
    const rtDevices = realtimeData?.byDevice || [];
    const rtPages = realtimeData?.byPage || [];
    const activeUsers = realtimeData?.activeUsers ?? 0;
    const hasRealtime = !!realtimeData && activeUsers > 0;

    // Use real-time countries for stats, fallback to historical
    const liveCountries = hasRealtime ? rtCountries : countries;
    const liveCities = hasRealtime ? rtCities : cities;
    const liveDevices = hasRealtime ? rtDevices : devices;

    // Derive markers from live data
    const markers = useMemo(() => {
        const result: { location: [number, number]; size: number }[] = [];
        const citySource = hasRealtime ? rtCities : cities;
        citySource.forEach((c: any) => {
            const coords = CITY_COORDS[c.city] || COUNTRY_COORDS[c.country];
            if (coords) {
                result.push({ location: coords, size: Math.min(0.14, Math.max(0.04, (c.users || 1) / 20)) });
            }
        });
        if (result.length === 0) {
            const countrySource = hasRealtime ? rtCountries : countries;
            countrySource.forEach((c: any) => {
                const coords = COUNTRY_COORDS[c.country];
                if (coords) {
                    result.push({ location: coords, size: Math.min(0.14, Math.max(0.04, (c.users || 1) / 20)) });
                }
            });
        }
        return result;
    }, [hasRealtime, rtCities, rtCountries, cities, countries]);

    // Country stats (real-time first)
    const countryStats = useMemo(() => {
        return liveCountries.slice(0, 5).map((c: any) => ({
            country: c.country, users: c.users || 0, flag: COUNTRY_FLAGS[c.country] || '\u{1F30D}',
        }));
    }, [liveCountries]);

    // Device stats
    const deviceStats = useMemo(() => {
        return liveDevices.slice(0, 3).map((d: any) => ({
            device: d.device || d.name || '', count: d.users || d.sessions || d.value || 0,
        }));
    }, [liveDevices]);

    // Referrer stats (historical only — real-time API doesn't provide referrers)
    const referrerStats = useMemo(() => {
        return referrers.slice(0, 5).map((r: any) => ({
            name: r.name || r.source || '', count: r.value || r.sessions || 0,
        }));
    }, [referrers]);

    // Activity log built from REAL real-time data (pages + cities)
    const activityLog = useMemo(() => {
        if (!hasRealtime || (rtCities.length === 0 && rtPages.length === 0)) return [];
        const entries: any[] = [];
        // Combine city visitors with pages they're viewing
        const maxEntries = Math.min(rtCities.length, 10);
        for (let i = 0; i < maxEntries; i++) {
            const city = rtCities[i];
            const page = rtPages[i % Math.max(rtPages.length, 1)];
            const anonName = `${ADJ[i % ADJ.length]} ${ANIMALS[i % ANIMALS.length]}`;
            const flag = COUNTRY_FLAGS[city.country] || '\u{1F30D}';
            entries.push({
                anonName,
                flag,
                country: city.country,
                page: page?.page || '/',
                users: city.users,
                time: 'a few seconds ago',
            });
        }
        return entries;
    }, [hasRealtime, rtCities, rtPages]);

    const onResize = useCallback(() => {
        if (canvasRef.current) {
            widthRef.current = canvasRef.current.offsetWidth;
        }
    }, []);

    useEffect(() => {
        window.addEventListener('resize', onResize);
        onResize();
        return () => window.removeEventListener('resize', onResize);
    }, [onResize]);

    useEffect(() => {
        if (!canvasRef.current) return;
        let phi = 0;
        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: widthRef.current * 2,
            height: widthRef.current * 2,
            phi: 0,
            theta: 0.2,
            dark: 1,
            diffuse: 3,
            mapSamples: 40000,
            mapBrightness: 8,
            baseColor: [0.15, 0.18, 0.28],
            markerColor: [0.4, 0.9, 0.6],
            glowColor: [0.08, 0.12, 0.25],
            markers,
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    phi += 0.0006;
                }
                state.phi = phi + pointerInteractionMovement.current;
                state.width = widthRef.current * 2;
                state.height = widthRef.current * 2;
            },
        });
        return () => { globe.destroy(); };
    }, [markers]);

    return (
        <div className="bg-[#060612] border border-white/[0.06] rounded-2xl overflow-hidden relative">
            {/* Stars background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 60 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white"
                        style={{
                            width: `${Math.random() * 2 + 0.5}px`,
                            height: `${Math.random() * 2 + 0.5}px`,
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            opacity: Math.random() * 0.4 + 0.1,
                        }}
                    />
                ))}
            </div>

            {/* Header */}
            <div className="relative px-6 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                    </span>
                    <span className="text-sm font-bold text-emerald-400">{hasRealtime ? activeUsers : '\u2014'}</span>
                    <span className="text-xs text-zinc-400">visitors on your site</span>
                    {hasRealtime && (
                        <span className="text-[10px] text-zinc-600 ml-1">(live)</span>
                    )}
                </div>
            </div>

            {/* Stats Rows */}
            <div className="relative px-6 pb-2 space-y-1.5">
                {referrerStats.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] items-center">
                        <span className="text-zinc-600 w-[70px] flex-shrink-0">Referrers</span>
                        {referrerStats.map((r, i) => (
                            <span key={i} className="text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                                {REFERRER_ICONS[r.name] || '\u{1F517}'} {r.name} ({r.count.toLocaleString()})
                            </span>
                        ))}
                    </div>
                )}
                {countryStats.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] items-center">
                        <span className="text-zinc-600 w-[70px] flex-shrink-0">Countries</span>
                        {countryStats.map((c: any, i: number) => (
                            <span key={i} className="text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                                {c.flag} {c.country} ({c.users})
                            </span>
                        ))}
                    </div>
                )}
                {deviceStats.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] items-center">
                        <span className="text-zinc-600 w-[70px] flex-shrink-0">Devices</span>
                        {deviceStats.map((d: any, i: number) => (
                            <span key={i} className="text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                                {DEVICE_ICONS[d.device.toLowerCase()] || '\u{1F5A5}\uFE0F'} {d.device} ({d.count})
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* 3D Globe */}
            <div className="relative flex justify-center items-center"
                style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(15,22,50,1) 0%, rgba(6,6,18,1) 70%)' }}>
                <div className="w-full max-w-[560px] aspect-square relative">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                            pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
                            if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
                        }}
                        onPointerUp={() => {
                            pointerInteracting.current = null;
                            if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
                        }}
                        onPointerOut={() => {
                            pointerInteracting.current = null;
                            if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
                        }}
                        onMouseMove={(e) => {
                            if (pointerInteracting.current !== null) {
                                const delta = e.clientX - pointerInteracting.current;
                                pointerInteractionMovement.current = delta / 200;
                            }
                        }}
                        onTouchMove={(e) => {
                            if (pointerInteracting.current !== null && e.touches[0]) {
                                const delta = e.touches[0].clientX - pointerInteracting.current;
                                pointerInteractionMovement.current = delta / 200;
                            }
                        }}
                    />
                </div>
            </div>

            {/* Real-Time Activity Log */}
            <div className="relative px-6 py-4 border-t border-white/[0.06] space-y-3 max-h-[300px] overflow-y-auto">
                {activityLog.length === 0 && (
                    <div className="text-xs text-zinc-600 py-6 text-center">
                        {hasRealtime ? 'No active visitors right now' : 'Connect Google Analytics to see live visitors'}
                    </div>
                )}
                {activityLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                        <span className="relative flex h-2 w-2 mt-1.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" style={{ animationDelay: `${i * 150}ms` }} />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <div className="flex-1 min-w-0">
                            <span className="text-zinc-300">
                                <span className="font-semibold text-violet-300">{log.anonName}</span>
                                {' '}from {log.flag} <span className="font-medium text-white">{log.country}</span>
                                {' '}visited{' '}
                                <span className="text-emerald-400 font-mono">{log.page}</span>
                            </span>
                        </div>
                        <span className="text-zinc-600 whitespace-nowrap flex-shrink-0 text-[10px]">{log.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
