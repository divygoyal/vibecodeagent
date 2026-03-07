'use client';

import { useEffect, useRef, memo, useState, useCallback } from 'react';
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

const RealtimeMapboxInner = memo(function RealtimeMapboxInner({ visitors, mapboxToken }: RealtimeMapboxProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const retryCountRef = useRef(0);

    const initMap = useCallback(() => {
        if (!containerRef.current || !mapboxToken) {
            setStatus('error');
            setErrorMsg('Missing Mapbox token');
            return;
        }

        let map: any;
        let destroyed = false;

        setStatus('loading');

        (async () => {
            try {
                const mapboxgl = (await import('mapbox-gl')).default;
                // @ts-expect-error - CSS import
                await import('mapbox-gl/dist/mapbox-gl.css');

                if (destroyed || !containerRef.current) return;

                mapboxgl.accessToken = mapboxToken;

                // Clean up any previous map instance in the container
                while (containerRef.current.firstChild) {
                    containerRef.current.removeChild(containerRef.current.firstChild);
                }

                map = new mapboxgl.Map({
                    container: containerRef.current,
                    style: 'mapbox://styles/mapbox/dark-v11',
                    center: [30, 25],
                    zoom: 1.8,
                    projection: 'globe',
                    attributionControl: false,
                    logoPosition: 'bottom-right',
                    fadeDuration: 0,
                });

                map.on('error', (e: any) => {
                    const msg = e?.error?.message || 'Unknown map error';
                    console.warn('Mapbox error:', msg);
                    // Only mark as error for auth failures
                    if (e?.error?.status === 401 || e?.error?.status === 403) {
                        setStatus('error');
                        setErrorMsg('Invalid Mapbox token');
                    }
                });

                map.on('load', () => {
                    if (destroyed) return;
                    mapRef.current = map;
                    setStatus('ready');
                    retryCountRef.current = 0;

                    // Hide branding
                    const logo = containerRef.current?.querySelector('.mapboxgl-ctrl-logo');
                    if (logo) (logo as HTMLElement).style.display = 'none';
                    const attrib = containerRef.current?.querySelector('.mapboxgl-ctrl-attrib');
                    if (attrib) (attrib as HTMLElement).style.display = 'none';
                });

                map.on('style.load', () => {
                    if (destroyed) return;
                    map.setFog({
                        color: 'rgb(8, 12, 24)',
                        'high-color': 'rgb(8, 12, 24)',
                        'horizon-blend': 0.015,
                        'space-color': 'rgb(6, 6, 14)',
                        'star-intensity': 0.7,
                    });
                });

            } catch (err: any) {
                console.warn('Mapbox init failed:', err?.message || err);
                if (!destroyed) {
                    setStatus('error');
                    setErrorMsg(err?.message || 'Failed to initialize map');
                }
            }
        })();

        return () => {
            destroyed = true;
            markersRef.current.forEach(m => { try { m.remove(); } catch { /**/ } });
            markersRef.current = [];
            if (map) {
                try { map.remove(); } catch { /**/ }
            }
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapboxToken]);

    // Init on mount
    useEffect(() => {
        const cleanup = initMap();
        return cleanup;
    }, [initMap]);

    // Sync avatar markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== 'ready') return;

        // Clear old markers
        markersRef.current.forEach(m => { try { m.remove(); } catch { /**/ } });
        markersRef.current = [];

        import('mapbox-gl').then(({ default: mapboxgl }) => {
            visitors.forEach((v) => {
                if (v.lat === 0 && v.lng === 0) return;

                const warmthColor = getWarmthColor(v.warmth);
                const avatarUrl = getAvatarUrl(v.name);

                // Marker container
                const el = document.createElement('div');
                el.style.cssText = 'position:relative;width:48px;height:48px;cursor:pointer;';

                // Pulsing ring
                const pulse = document.createElement('div');
                pulse.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${warmthColor};opacity:0;animation:mapbox-pulse 2.5s ease-out infinite;`;
                el.appendChild(pulse);

                // Avatar wrapper with glow ring
                const avatarWrap = document.createElement('div');
                avatarWrap.style.cssText = `position:absolute;top:6px;left:6px;width:36px;height:36px;border-radius:50%;background:#0f172a;box-shadow:0 0 0 3px ${warmthColor},0 0 16px ${warmthColor}50,0 2px 8px rgba(0,0,0,0.6);overflow:hidden;`;

                const img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = v.name;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                img.onerror = () => {
                    // Fallback to initials
                    img.remove();
                    avatarWrap.style.cssText += `display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:white;background:${v.avatarColor};`;
                    avatarWrap.textContent = v.avatarInitial;
                };
                avatarWrap.appendChild(img);
                el.appendChild(avatarWrap);

                // Warmth indicator dot
                const dot = document.createElement('div');
                dot.style.cssText = `position:absolute;top:3px;right:3px;width:11px;height:11px;border-radius:50%;background:${warmthColor};border:2.5px solid #080c18;z-index:1;`;
                el.appendChild(dot);

                const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([v.lng, v.lat])
                    .addTo(map);

                markersRef.current.push(marker);
            });
        }).catch(() => { /* ignore */ });
    }, [visitors, status]);

    const handleRetry = useCallback(() => {
        retryCountRef.current++;
        // Clean container
        if (containerRef.current) {
            while (containerRef.current.firstChild) {
                containerRef.current.removeChild(containerRef.current.firstChild);
            }
        }
        mapRef.current = null;
        markersRef.current = [];
        initMap();
    }, [initMap]);

    return (
        <>
            <style>{`
                @keyframes mapbox-pulse {
                    0% { transform: scale(0.8); opacity: 0.35; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
                .mapboxgl-ctrl-logo { display: none !important; }
                .mapboxgl-ctrl-attrib { display: none !important; }
            `}</style>

            {/* Map container - always rendered */}
            <div ref={containerRef} className="w-full h-full" style={{ background: '#080c18' }} />

            {/* Loading overlay */}
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#080c18' }}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-zinc-500 text-sm">Loading globe...</span>
                    </div>
                </div>
            )}

            {/* Error overlay with retry */}
            {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#080c18' }}>
                    <div className="flex flex-col items-center gap-3 text-center px-4">
                        <span className="text-zinc-400 text-sm">{errorMsg || 'Globe failed to load'}</span>
                        <button
                            onClick={handleRetry}
                            className="px-4 py-2 text-sm bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition border border-emerald-500/20"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}
        </>
    );
});

export default function RealtimeMapbox(props: RealtimeMapboxProps) {
    return <RealtimeMapboxInner {...props} />;
}
