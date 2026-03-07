'use client';

import { useEffect, useRef, memo, useState, Component, type ReactNode } from 'react';
import type { GlobeVisitor } from './RealtimeGlobe';

// ─── DiceBear avatar URL generator ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

interface RealtimeMapboxProps {
    visitors: GlobeVisitor[];
    mapboxToken: string;
}

function getWarmthColor(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

// ─── Error boundary to catch mapbox-gl crashes ───
class MapboxErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error) { console.warn('Mapbox GL error:', error.message); }
    render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

const RealtimeMapboxInner = memo(function RealtimeMapboxInner({ visitors, mapboxToken }: RealtimeMapboxProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [mapError, setMapError] = useState(false);

    // Initialize map
    useEffect(() => {
        if (!containerRef.current || !mapboxToken) return;

        let map: any;
        let destroyed = false;

        (async () => {
            try {
                const mapboxgl = (await import('mapbox-gl')).default;
                // @ts-expect-error - CSS import for mapbox styles
                await import('mapbox-gl/dist/mapbox-gl.css');

                if (destroyed || !containerRef.current) return;

                mapboxgl.accessToken = mapboxToken;

                map = new mapboxgl.Map({
                    container: containerRef.current,
                    style: 'mapbox://styles/mapbox/dark-v11',
                    center: [10, 35],
                    zoom: 2.2,
                    projection: 'globe',
                    attributionControl: false,
                    logoPosition: 'bottom-right',
                });

                map.on('error', (e: any) => {
                    console.warn('Mapbox error event:', e?.error?.message || e);
                });

                map.on('load', () => {
                    if (destroyed) return;
                    const logo = containerRef.current?.querySelector('.mapboxgl-ctrl-logo');
                    if (logo) (logo as HTMLElement).style.display = 'none';
                });

                map.on('style.load', () => {
                    if (destroyed) return;
                    map.setFog({
                        color: 'rgb(12, 18, 32)',
                        'high-color': 'rgb(12, 18, 32)',
                        'horizon-blend': 0.02,
                        'space-color': 'rgb(10, 10, 20)',
                        'star-intensity': 0.6,
                    });
                });

                mapRef.current = map;
            } catch (err) {
                console.warn('Failed to initialize Mapbox GL:', err);
                setMapError(true);
            }
        })();

        return () => {
            destroyed = true;
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
            if (map) {
                try { map.remove(); } catch { /* ignore */ }
            }
            mapRef.current = null;
        };
    }, [mapboxToken]);

    // Sync avatar markers when visitors change
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Wait for map to be loaded
        const sync = () => {
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            import('mapbox-gl').then(({ default: mapboxgl }) => {
                visitors.forEach((v) => {
                    if (v.lat === 0 && v.lng === 0) return;

                    const warmthColor = getWarmthColor(v.warmth);
                    const avatarUrl = getAvatarUrl(v.name);

                    const el = document.createElement('div');
                    el.style.cssText = 'position:relative;width:44px;height:44px;cursor:pointer;';

                    // Pulsing ring
                    const pulse = document.createElement('div');
                    pulse.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${warmthColor};opacity:0;animation:mapbox-pulse 2s ease-out infinite;`;
                    el.appendChild(pulse);

                    // Avatar image with warmth ring
                    const avatarWrap = document.createElement('div');
                    avatarWrap.style.cssText = `position:absolute;top:4px;left:4px;width:36px;height:36px;border-radius:50%;background:#1a1a2e;box-shadow:0 0 0 3px ${warmthColor},0 2px 8px rgba(0,0,0,0.5);overflow:hidden;`;

                    const img = document.createElement('img');
                    img.src = avatarUrl;
                    img.alt = v.name;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    img.onerror = () => {
                        // Fallback to initials if DiceBear fails
                        avatarWrap.style.cssText += `display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:${v.avatarColor};`;
                        avatarWrap.textContent = v.avatarInitial;
                    };
                    avatarWrap.appendChild(img);
                    el.appendChild(avatarWrap);

                    // Warmth indicator dot (top-right)
                    const dot = document.createElement('div');
                    dot.style.cssText = `position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:${warmthColor};border:2px solid #0c1220;z-index:1;`;
                    el.appendChild(dot);

                    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                        .setLngLat([v.lng, v.lat])
                        .addTo(map);

                    markersRef.current.push(marker);
                });
            }).catch(() => { /* ignore */ });
        };

        if (map.loaded()) {
            sync();
        } else {
            map.on('load', sync);
        }
    }, [visitors]);

    if (mapError) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#0c1220]">
                <p className="text-zinc-500 text-sm">Globe failed to load. Please refresh the page.</p>
            </div>
        );
    }

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

// Wrap in error boundary
export default function RealtimeMapbox(props: RealtimeMapboxProps) {
    const fallback = (
        <div className="w-full h-full flex items-center justify-center bg-[#0c1220]">
            <p className="text-zinc-500 text-sm">Globe failed to load. Please refresh the page.</p>
        </div>
    );
    return (
        <MapboxErrorBoundary fallback={fallback}>
            <RealtimeMapboxInner {...props} />
        </MapboxErrorBoundary>
    );
}
