'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import createGlobe from 'cobe';

interface Visitor {
    id: string;
    lat: number;
    lng: number;
    country: string;
    city: string;
    device: string;
    referrer: string;
    flag: string;
}

interface GlobeProps {
    visitors?: Visitor[];
    totalOnline?: number;
}

const DEFAULT_VISITORS: Visitor[] = [
    { id: '1', lat: 40.71, lng: -74.01, country: 'United States', city: 'New York', device: 'Desktop', referrer: 'Google', flag: '🇺🇸' },
    { id: '2', lat: 51.51, lng: -0.13, country: 'United Kingdom', city: 'London', device: 'Desktop', referrer: 'Direct', flag: '🇬🇧' },
    { id: '3', lat: 28.61, lng: 77.23, country: 'India', city: 'New Delhi', device: 'Mobile', referrer: 'Google', flag: '🇮🇳' },
    { id: '4', lat: 19.08, lng: 72.88, country: 'India', city: 'Mumbai', device: 'Mobile', referrer: 'Twitter', flag: '🇮🇳' },
    { id: '5', lat: 52.52, lng: 13.41, country: 'Germany', city: 'Berlin', device: 'Desktop', referrer: 'GitHub', flag: '🇩🇪' },
    { id: '6', lat: 35.68, lng: 139.69, country: 'Japan', city: 'Tokyo', device: 'Desktop', referrer: 'Direct', flag: '🇯🇵' },
    { id: '7', lat: -33.87, lng: 151.21, country: 'Australia', city: 'Sydney', device: 'Tablet', referrer: 'Google', flag: '🇦🇺' },
    { id: '8', lat: 48.86, lng: 2.35, country: 'France', city: 'Paris', device: 'Mobile', referrer: 'LinkedIn', flag: '🇫🇷' },
    { id: '9', lat: 43.65, lng: -79.38, country: 'Canada', city: 'Toronto', device: 'Desktop', referrer: 'Google', flag: '🇨🇦' },
    { id: '10', lat: 37.77, lng: -122.42, country: 'United States', city: 'San Francisco', device: 'Desktop', referrer: 'Direct', flag: '🇺🇸' },
    { id: '11', lat: 55.75, lng: 37.62, country: 'Russia', city: 'Moscow', device: 'Desktop', referrer: 'Yandex', flag: '🇷🇺' },
    { id: '12', lat: -23.55, lng: -46.63, country: 'Brazil', city: 'São Paulo', device: 'Mobile', referrer: 'Google', flag: '🇧🇷' },
    { id: '13', lat: 1.35, lng: 103.82, country: 'Singapore', city: 'Singapore', device: 'Desktop', referrer: 'Direct', flag: '🇸🇬' },
    { id: '14', lat: 25.20, lng: 55.27, country: 'UAE', city: 'Dubai', device: 'Mobile', referrer: 'Instagram', flag: '🇦🇪' },
    { id: '15', lat: 34.05, lng: -118.24, country: 'United States', city: 'Los Angeles', device: 'Desktop', referrer: 'Google', flag: '🇺🇸' },
    { id: '16', lat: 12.97, lng: 77.59, country: 'India', city: 'Bangalore', device: 'Desktop', referrer: 'GitHub', flag: '🇮🇳' },
    { id: '17', lat: 41.01, lng: 28.98, country: 'Turkey', city: 'Istanbul', device: 'Mobile', referrer: 'Direct', flag: '🇹🇷' },
    { id: '18', lat: -6.21, lng: 106.85, country: 'Indonesia', city: 'Jakarta', device: 'Mobile', referrer: 'Google', flag: '🇮🇩' },
    { id: '19', lat: 37.57, lng: 126.98, country: 'South Korea', city: 'Seoul', device: 'Desktop', referrer: 'Naver', flag: '🇰🇷' },
    { id: '20', lat: 39.90, lng: 116.40, country: 'China', city: 'Beijing', device: 'Mobile', referrer: 'Baidu', flag: '🇨🇳' },
];

const referrerIcons: Record<string, string> = {
    'Direct': '🔗', 'Google': '🔍', 'GitHub': '🐙', 'Twitter': '𝕏',
    'LinkedIn': '💼', 'Instagram': '📷', 'Yandex': '🔎', 'Naver': '🇰🇷', 'Baidu': '🔍',
};
const deviceIcons: Record<string, string> = { 'Desktop': '🖥️', 'Mobile': '📱', 'Tablet': '📟' };

export default function InteractiveGlobe({ visitors = DEFAULT_VISITORS, totalOnline = 84 }: GlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const phiRef = useRef(0);
    const widthRef = useRef(0);
    const [activityLog, setActivityLog] = useState<{ visitor: Visitor; action: string; time: string }[]>([]);

    // Generate random activity log
    useEffect(() => {
        const actions = ['scroll_to_problem', 'scroll_to_solution', 'scroll_to_pricing', 'scroll_to_review', 'click_cta', 'view_docs', 'scroll_to_faq'];
        const logs = visitors.slice(0, 6).map((v, i) => ({
            visitor: v,
            action: actions[i % actions.length],
            time: `${Math.floor(Math.random() * 10) + 1} minutes ago`,
        }));
        setActivityLog(logs);
    }, [visitors]);

    // Aggregate stats
    const countryStats = (() => {
        const counts: Record<string, { count: number; flag: string }> = {};
        visitors.forEach(v => {
            if (!counts[v.country]) counts[v.country] = { count: 0, flag: v.flag };
            counts[v.country].count++;
        });
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    })();

    const referrerStats = (() => {
        const counts: Record<string, number> = {};
        visitors.forEach(v => { counts[v.referrer] = (counts[v.referrer] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    })();

    const deviceStats = (() => {
        const counts: Record<string, number> = {};
        visitors.forEach(v => { counts[v.device] = (counts[v.device] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    })();

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

        const markers = visitors.map(v => ({
            location: [v.lat, v.lng] as [number, number],
            size: 0.06,
        }));

        let phi = 0;

        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: widthRef.current * 2,
            height: widthRef.current * 2,
            phi: 0,
            theta: 0.25,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 24000,
            mapBrightness: 2.5,
            baseColor: [0.15, 0.18, 0.25],
            markerColor: [0.2, 0.82, 0.6],
            glowColor: [0.08, 0.12, 0.2],
            markers,
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    phi += 0.003;
                }
                state.phi = phi + pointerInteractionMovement.current;
                state.width = widthRef.current * 2;
                state.height = widthRef.current * 2;
                phiRef.current = phi;
            },
        });

        return () => {
            globe.destroy();
        };
    }, [visitors]);

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">GrowClaw</span>
                    <span className="text-xs text-zinc-500 border-l border-white/[0.08] pl-2 ml-1">REAL-TIME</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-400">{totalOnline}</span>
                    <span className="text-xs text-zinc-500">visitors online</span>
                </div>
            </div>

            {/* Stats Row */}
            <div className="px-5 pb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Referrers</span>
                    {referrerStats.map(([ref, count]) => (
                        <span key={ref} className="text-zinc-400 bg-white/[0.03] px-1.5 py-0.5 rounded">
                            {referrerIcons[ref] || '🔗'} {ref} ({count})
                        </span>
                    ))}
                </div>
            </div>
            <div className="px-5 pb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Countries</span>
                    {countryStats.map(([country, data]) => (
                        <span key={country} className="text-zinc-400 bg-white/[0.03] px-1.5 py-0.5 rounded">
                            {data.flag} {country} ({data.count})
                        </span>
                    ))}
                </div>
            </div>
            <div className="px-5 pb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Devices</span>
                    {deviceStats.map(([device, count]) => (
                        <span key={device} className="text-zinc-400 bg-white/[0.03] px-1.5 py-0.5 rounded">
                            {deviceIcons[device] || '🖥️'} {device} ({count})
                        </span>
                    ))}
                </div>
            </div>

            {/* 3D Globe */}
            <div className="relative flex justify-center items-center"
                style={{ background: 'radial-gradient(ellipse at center, rgba(15,25,40,1) 0%, rgba(8,8,14,1) 70%)' }}>
                <div className="w-full max-w-[600px] aspect-square relative">
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
            <div className="px-5 py-4 border-t border-white/[0.06] space-y-2">
                {activityLog.map((log, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="text-zinc-400">
                            <span className="text-zinc-300 font-medium">{log.visitor.flag} {log.visitor.city}</span>
                            {' '}performed{' '}
                            <span className="text-emerald-400 font-mono">{log.action}</span>
                        </span>
                        <span className="text-zinc-600 ml-auto whitespace-nowrap">{log.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
