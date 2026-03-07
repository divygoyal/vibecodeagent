'use client';

import { useEffect, useRef, memo, useState, useCallback, Component, type ReactNode } from 'react';
import type { GlobeVisitor } from './RealtimeGlobe';

// ─── DiceBear avatar URL generator ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

interface RealtimeMapboxProps {
    visitors: GlobeVisitor[];
    mapboxToken: string;
    byCountry?: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
}

function getWarmthColor(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

// ─── Error boundary to catch mapbox-gl crashes ───
class MapboxErrorBoundary extends Component<
    { children: ReactNode; onError: () => void },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error) {
        console.warn('Mapbox GL error:', error.message);
        this.props.onError();
    }
    render() { return this.state.hasError ? null : this.props.children; }
}

const RealtimeMapboxInner = memo(function RealtimeMapboxInner({ visitors, mapboxToken, onMapFailed }: RealtimeMapboxProps & { onMapFailed: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);

    // Initialize map
    useEffect(() => {
        if (!containerRef.current || !mapboxToken) {
            onMapFailed();
            return;
        }

        let map: any;
        let destroyed = false;
        // Timeout: if map doesn't load within 8s, fallback
        const timeout = setTimeout(() => {
            if (!mapRef.current) {
                console.warn('Mapbox GL: timed out loading');
                onMapFailed();
            }
        }, 8000);

        (async () => {
            try {
                const mapboxgl = (await import('mapbox-gl')).default;
                // @ts-expect-error - CSS import for mapbox styles
                await import('mapbox-gl/dist/mapbox-gl.css');

                if (destroyed || !containerRef.current) return;

                // Check WebGL support
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) {
                    console.warn('WebGL not supported');
                    onMapFailed();
                    return;
                }

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
                    // If the style fails to load, fallback to COBE
                    if (e?.error?.status === 401 || e?.error?.status === 403) {
                        onMapFailed();
                    }
                });

                map.on('load', () => {
                    clearTimeout(timeout);
                    if (destroyed) return;
                    mapRef.current = map;
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
            } catch (err) {
                console.warn('Failed to initialize Mapbox GL:', err);
                clearTimeout(timeout);
                onMapFailed();
            }
        })();

        return () => {
            destroyed = true;
            clearTimeout(timeout);
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
            if (map) {
                try { map.remove(); } catch { /* ignore */ }
            }
            mapRef.current = null;
        };
    }, [mapboxToken, onMapFailed]);

    // Sync avatar markers when visitors change
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

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

                    const pulse = document.createElement('div');
                    pulse.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${warmthColor};opacity:0;animation:mapbox-pulse 2s ease-out infinite;`;
                    el.appendChild(pulse);

                    const avatarWrap = document.createElement('div');
                    avatarWrap.style.cssText = `position:absolute;top:4px;left:4px;width:36px;height:36px;border-radius:50%;background:#1a1a2e;box-shadow:0 0 0 3px ${warmthColor},0 2px 8px rgba(0,0,0,0.5);overflow:hidden;`;

                    const img = document.createElement('img');
                    img.src = avatarUrl;
                    img.alt = v.name;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    img.onerror = () => {
                        avatarWrap.style.cssText += `display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:${v.avatarColor};`;
                        avatarWrap.textContent = v.avatarInitial;
                    };
                    avatarWrap.appendChild(img);
                    el.appendChild(avatarWrap);

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

// Main export: tries Mapbox first, falls back to COBE globe
export default function RealtimeMapbox(props: RealtimeMapboxProps) {
    const [useCobe, setUseCobe] = useState(false);
    const [CobeGlobe, setCobeGlobe] = useState<any>(null);

    const handleMapFailed = useCallback(() => {
        setUseCobe(true);
        // Dynamically load the COBE globe as fallback
        import('./RealtimeGlobe').then(mod => {
            setCobeGlobe(() => mod.default);
        }).catch(() => { /* both failed */ });
    }, []);

    if (useCobe && CobeGlobe) {
        return (
            <CobeGlobe
                byCountry={props.byCountry || []}
                byCity={props.byCity || []}
                visitors={props.visitors}
            />
        );
    }

    if (useCobe && !CobeGlobe) {
        // Loading COBE fallback
        return <div className="w-full h-full bg-[#0c1220]" />;
    }

    return (
        <MapboxErrorBoundary onError={handleMapFailed}>
            <RealtimeMapboxInner {...props} onMapFailed={handleMapFailed} />
        </MapboxErrorBoundary>
    );
}
