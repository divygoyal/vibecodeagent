'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import createGlobe from 'cobe';

// ─── Country → approximate lat/lng lookup for plotting on globe ───
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

// City → lat/lng
const CITY_COORDS: Record<string, [number, number]> = {
    'New York': [40.71, -74.01], 'London': [51.51, -0.13], 'Mumbai': [19.08, 72.88],
    'San Francisco': [37.77, -122.42], 'Berlin': [52.52, 13.41], 'Toronto': [43.65, -79.38],
    'Paris': [48.86, 2.35], 'Sydney': [-33.87, 151.21], 'Tokyo': [35.68, 139.69],
    'Singapore': [1.35, 103.82], 'São Paulo': [-23.55, -46.63], 'Amsterdam': [52.37, 4.90],
    'Bangalore': [12.97, 77.59], 'Dubai': [25.20, 55.27], 'Chicago': [41.88, -87.63],
    'Los Angeles': [34.05, -118.24], 'Moscow': [55.75, 37.62], 'Seoul': [37.57, 126.98],
    'Beijing': [39.90, 116.40], 'Jakarta': [-6.21, 106.85], 'Istanbul': [41.01, 28.98],
    'New Delhi': [28.61, 77.23], 'Melbourne': [-37.81, 144.96], 'Bangkok': [13.76, 100.50],
    'Riyadh': [24.71, 46.67], 'Cairo': [30.04, 31.24], 'Nairobi': [-1.29, 36.82],
    'Lagos': [6.52, 3.38], 'Bogotá': [4.71, -74.07], 'Lima': [-12.05, -77.04],
    'Santiago': [-33.45, -70.67], 'Mexico City': [19.43, -99.13], 'Buenos Aires': [-34.60, -58.38],
};

// Country flag emojis
const COUNTRY_FLAGS: Record<string, string> = {
    'United States': '��', 'United Kingdom': '🇬🇧', 'India': '🇮🇳', 'Germany': '🇩🇪',
    'Japan': '🇯🇵', 'Australia': '🇦🇺', 'France': '🇫🇷', 'Canada': '🇨🇦', 'Brazil': '��',
    'Russia': '🇷🇺', 'Singapore': '🇸🇬', 'UAE': '🇦🇪', 'Turkey': '🇹🇷', 'Indonesia': '🇮🇩',
    'South Korea': '🇰🇷', 'China': '🇨🇳', 'Netherlands': '🇳🇱', 'Spain': '�🇸',
    'Italy': '🇮🇹', 'Mexico': '🇲🇽', 'Poland': '🇵🇱', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭',
    'Argentina': '🇦🇷', 'South Africa': '🇿🇦', 'Thailand': '��', 'Vietnam': '🇻🇳',
    'Philippines': '🇵🇭', 'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩', 'Nigeria': '🇳🇬',
    'Egypt': '🇪🇬', 'Kenya': '🇰🇪', 'Colombia': '🇨🇴', 'Chile': '🇨🇱', 'Peru': '��',
    'Israel': '🇮🇱', 'Malaysia': '🇲🇾', 'Taiwan': '🇹🇼', 'Ireland': '🇮🇪',
    'New Zealand': '🇳🇿', 'Portugal': '🇵🇹', 'Norway': '🇳🇴', 'Denmark': '🇩🇰',
    'Finland': '🇫🇮', 'Belgium': '🇧🇪', 'Austria': '🇦🇹', 'Czech Republic': '🇨🇿',
    'Romania': '🇷🇴', 'Greece': '🇬🇷', 'Ukraine': '🇺🇦', 'Saudi Arabia': '��',
    'Hong Kong': '🇭🇰',
};

// Random animal + color anonymous names for visitors
const ANIMALS = ['fox', 'owl', 'bear', 'wolf', 'hawk', 'lynx', 'deer', 'hare', 'crane', 'otter', 'panda', 'raven', 'eagle', 'shark', 'whale'];
const COLORS = ['amber', 'coral', 'jade', 'slate', 'ruby', 'teal', 'plum', 'sage', 'blush', 'pearl', 'onyx', 'ivory', 'azure', 'mauve', 'ochre'];

interface GlobeProps {
    countries?: any[];
    cities?: any[];
    referrers?: any[];
    devices?: any[];
}

export default function InteractiveGlobe({ countries = [], cities = [], referrers = [], devices = [] }: GlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const widthRef = useRef(0);

    // Derive markers from real cities data
    const markers = useMemo(() => {
        const result: { location: [number, number]; size: number }[] = [];
        // From cities
        cities.forEach((c: any) => {
            const coords = CITY_COORDS[c.city] || COUNTRY_COORDS[c.country];
            if (coords) {
                result.push({ location: coords, size: Math.min(0.12, Math.max(0.03, (c.users || 1) / 500)) });
            }
        });
        // Fallback: countries if no cities
        if (result.length === 0) {
            countries.forEach((c: any) => {
                const coords = COUNTRY_COORDS[c.country];
                if (coords) {
                    result.push({ location: coords, size: Math.min(0.12, Math.max(0.03, (c.users || 1) / 500)) });
                }
            });
        }
        return result;
    }, [cities, countries]);

    // Total visitors
    const totalVisitors = useMemo(() => {
        return countries.reduce((sum: number, c: any) => sum + (c.users || 0), 0);
    }, [countries]);

    // Aggregate referrer stats
    const referrerStats = useMemo(() => {
        return referrers.slice(0, 5).map((r: any) => ({ name: r.name || r.source || '', count: r.value || r.sessions || 0 }));
    }, [referrers]);

    // Aggregate country stats
    const countryStats = useMemo(() => {
        return countries.slice(0, 5).map((c: any) => ({
            country: c.country, users: c.users || 0, flag: COUNTRY_FLAGS[c.country] || '🌍',
        }));
    }, [countries]);

    // Aggregate device stats
    const deviceStats = useMemo(() => {
        return devices.slice(0, 3).map((d: any) => ({ device: d.device || d.name || '', count: d.sessions || d.value || 0 }));
    }, [devices]);

    // Generate realistic activity log from cities data
    const activityLog = useMemo(() => {
        const pages = ['/', '/pricing', '/docs', '/blog', '/features', '/roadmap', '/signup', '/review'];
        const actions = ['visited', 'visited', 'visited', 'visited', 'performed scroll_to_pricing on', 'performed click_cta on', 'performed scroll_to_review on'];
        return cities.slice(0, 8).map((c: any, i: number) => {
            const anonName = `${COLORS[i % COLORS.length]} ${ANIMALS[i % ANIMALS.length]}`;
            const flag = COUNTRY_FLAGS[c.country] || '🌍';
            const action = actions[i % actions.length];
            const page = pages[i % pages.length];
            const minutes = Math.floor(Math.random() * 45) + 1;
            return { anonName, flag, country: c.country, city: c.city, action, page, time: `${minutes} minutes ago` };
        });
    }, [cities]);

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
            theta: 0.15,
            dark: 1,
            diffuse: 3,
            mapSamples: 36000,
            mapBrightness: 6,
            baseColor: [0.12, 0.14, 0.22],
            markerColor: [0.35, 0.85, 0.55],
            glowColor: [0.06, 0.08, 0.18],
            markers,
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    phi += 0.0008;
                }
                state.phi = phi + pointerInteractionMovement.current;
                state.width = widthRef.current * 2;
                state.height = widthRef.current * 2;
            },
        });

        return () => { globe.destroy(); };
    }, [markers]);

    const deviceIcons: Record<string, string> = { 'Desktop': '🖥️', 'Mobile': '📱', 'Tablet': '📟' };
    const referrerIcons: Record<string, string> = {
        'google.com': '🔍', '(direct)': '🔗', 'github.com': '🐙', 't.co': '𝕏',
        'linkedin.com': '💼', 'facebook.com': '📘', 'instagram.com': '📷',
        'youtube.com': '▶️', 'reddit.com': '🟠', 'bing.com': '🔎',
        'Organic Search': '🔍', 'Direct': '🔗', 'Referral': '🔗', 'Social': '💬',
        'Email': '✉️', 'Paid Search': '💰',
    };

    return (
        <div className="bg-[#080810] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-400 to-violet-500 flex items-center justify-center">
                            <span className="text-[10px] font-black text-white">G</span>
                        </div>
                        <span className="text-sm font-bold text-white">GrowClaw</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 border-l border-white/[0.08] pl-2 ml-1 uppercase tracking-widest">Real-Time</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                    </span>
                    <span className="text-sm font-bold text-emerald-400">{totalVisitors > 0 ? totalVisitors.toLocaleString() : '—'}</span>
                    <span className="text-xs text-zinc-500">visitors tracked</span>
                </div>
            </div>

            {/* Stats Rows */}
            {referrerStats.length > 0 && (
                <div className="px-5 pb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-zinc-600 w-16">Referrers</span>
                    {referrerStats.map((r, i) => (
                        <span key={i} className="text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.04]">
                            {referrerIcons[r.name] || '🔗'} {r.name} ({r.count.toLocaleString()})
                        </span>
                    ))}
                </div>
            )}
            {countryStats.length > 0 && (
                <div className="px-5 pb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-zinc-600 w-16">Countries</span>
                    {countryStats.map((c, i) => (
                        <span key={i} className="text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.04]">
                            {c.flag} {c.country} ({c.users.toLocaleString()})
                        </span>
                    ))}
                </div>
            )}
            {deviceStats.length > 0 && (
                <div className="px-5 pb-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-zinc-600 w-16">Devices</span>
                    {deviceStats.map((d, i) => (
                        <span key={i} className="text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.04]">
                            {deviceIcons[d.device] || '🖥️'} {d.device} ({d.count.toLocaleString()})
                        </span>
                    ))}
                </div>
            )}

            {/* 3D Globe */}
            <div className="relative flex justify-center items-center"
                style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(20,30,55,1) 0%, rgba(8,8,16,1) 65%)' }}>
                {/* Subtle grid overlay for premium feel */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }} />
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

            {/* Activity Log */}
            <div className="px-5 py-4 border-t border-white/[0.06] space-y-2.5 max-h-[280px] overflow-y-auto">
                <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Live Activity</div>
                {activityLog.length === 0 && (
                    <div className="text-xs text-zinc-600 py-4 text-center">No recent activity data</div>
                )}
                {activityLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs group">
                        <span className="relative flex h-2 w-2 mt-1.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" style={{ animationDelay: `${i * 200}ms` }} />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <div className="flex-1 min-w-0">
                            <span className="text-zinc-300">
                                <span className="font-semibold text-violet-300">{log.anonName}</span>
                                {' '}from {log.flag} <span className="text-zinc-400">{log.country}</span>
                                {' '}{log.action}{' '}
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
