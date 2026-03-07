'use client';

import { useEffect, useRef, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GlobeVisitor } from './RealtimeGlobe';

interface RealtimeMapboxProps {
    visitors: GlobeVisitor[];
    mapboxToken: string;
}

function getWarmthColor(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';   // red
    if (warmth > 0.4) return '#f97316';   // orange
    if (warmth > 0.25) return '#eab308';  // yellow
    return '#3b82f6';                      // blue
}

const RealtimeMapbox = memo(function RealtimeMapbox({ visitors, mapboxToken }: RealtimeMapboxProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);

    // Initialize map
    useEffect(() => {
        if (!containerRef.current || !mapboxToken) return;

        mapboxgl.accessToken = mapboxToken;

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [10, 35],
            zoom: 2.2,
            projection: 'globe',
            attributionControl: false,
            logoPosition: 'bottom-right',
        });

        // Hide Mapbox logo
        map.on('load', () => {
            const logo = containerRef.current?.querySelector('.mapboxgl-ctrl-logo');
            if (logo) (logo as HTMLElement).style.display = 'none';
        });

        // Atmosphere / fog for dark space background with stars
        map.on('style.load', () => {
            map.setFog({
                color: 'rgb(12, 18, 32)',
                'high-color': 'rgb(12, 18, 32)',
                'horizon-blend': 0.02,
                'space-color': 'rgb(10, 10, 20)',
                'star-intensity': 0.6,
            });
        });

        mapRef.current = map;

        return () => {
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
            map.remove();
            mapRef.current = null;
        };
    }, [mapboxToken]);

    // Sync avatar markers when visitors change
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Clear old markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        visitors.forEach((v) => {
            if (v.lat === 0 && v.lng === 0) return;

            const warmthColor = getWarmthColor(v.warmth);

            // Create custom marker element
            const el = document.createElement('div');
            el.style.cssText = 'position:relative;width:36px;height:36px;cursor:pointer;';

            // Pulsing ring
            const pulse = document.createElement('div');
            pulse.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${warmthColor};opacity:0;animation:mapbox-pulse 2s ease-out infinite;`;
            el.appendChild(pulse);

            // Avatar circle with warmth ring
            const avatar = document.createElement('div');
            avatar.style.cssText = `position:absolute;top:4px;left:4px;width:28px;height:28px;border-radius:50%;background:${v.avatarColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;box-shadow:0 0 0 3px ${warmthColor},0 2px 8px rgba(0,0,0,0.5);`;
            avatar.textContent = v.avatarInitial;
            el.appendChild(avatar);

            // Warmth indicator dot (top-right)
            const dot = document.createElement('div');
            dot.style.cssText = `position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:${warmthColor};border:2px solid #0c1220;z-index:1;`;
            el.appendChild(dot);

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat([v.lng, v.lat])
                .addTo(map);

            markersRef.current.push(marker);
        });
    }, [visitors]);

    if (!mapboxToken) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#0c1220]">
                <p className="text-zinc-500 text-sm">Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the globe</p>
            </div>
        );
    }

    return (
        <>
            <style>{`
                @keyframes mapbox-pulse {
                    0% { transform: scale(0.8); opacity: 0.4; }
                    100% { transform: scale(2); opacity: 0; }
                }
                .mapboxgl-ctrl-logo { display: none !important; }
                .mapboxgl-ctrl-attrib { display: none !important; }
            `}</style>
            <div ref={containerRef} className="w-full h-full" />
        </>
    );
});

export default RealtimeMapbox;
