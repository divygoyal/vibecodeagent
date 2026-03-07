'use client';

import { useEffect, useRef, memo, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { GlobeVisitor } from './RealtimeGlobe';

// ─── DiceBear avatar URL generator ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

export interface RealtimeMapboxProps {
    visitors: GlobeVisitor[];
    mapboxToken: string;
    byCountry?: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    autoPan?: boolean;
}

export interface RealtimeMapboxHandle {
    toggleAutoPan: () => boolean;
    isAutoPanning: () => boolean;
}

function getWarmthColor(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

const RealtimeMapboxInner = memo(forwardRef<RealtimeMapboxHandle, RealtimeMapboxProps>(function RealtimeMapboxInner({ visitors, mapboxToken, autoPan: autoPanProp = true }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const retryCountRef = useRef(0);
    const autoPanRef = useRef(autoPanProp);
    const autoPanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autoPanIndexRef = useRef(0);
    const visitorsRef = useRef(visitors);
    visitorsRef.current = visitors;

    useImperativeHandle(ref, () => ({
        toggleAutoPan: () => {
            autoPanRef.current = !autoPanRef.current;
            if (autoPanRef.current) {
                startAutoPan();
            } else {
                stopAutoPan();
            }
            return autoPanRef.current;
        },
        isAutoPanning: () => autoPanRef.current,
    }));

    const stopAutoPan = useCallback(() => {
        if (autoPanTimerRef.current) {
            clearInterval(autoPanTimerRef.current);
            autoPanTimerRef.current = null;
        }
    }, []);

    const startAutoPan = useCallback(() => {
        stopAutoPan();
        const map = mapRef.current;
        if (!map) return;

        const fly = () => {
            const v = visitorsRef.current;
            if (!autoPanRef.current || v.length === 0 || !mapRef.current) return;

            const idx = autoPanIndexRef.current % v.length;
            const visitor = v[idx];
            autoPanIndexRef.current = idx + 1;

            mapRef.current.flyTo({
                center: [visitor.lng, visitor.lat],
                zoom: 3.5 + Math.random() * 1.5,
                duration: 3000,
                essential: true,
            });
        };

        // Initial fly
        setTimeout(fly, 1500);
        autoPanTimerRef.current = setInterval(fly, 6000);
    }, [stopAutoPan]);

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

                    // Start auto-panning if enabled
                    if (autoPanRef.current) {
                        startAutoPan();
                    }
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

                // Pause auto-pan on user interaction, resume after
                map.on('dragstart', () => {
                    if (autoPanRef.current) stopAutoPan();
                });
                map.on('dragend', () => {
                    if (autoPanRef.current) {
                        setTimeout(() => startAutoPan(), 4000);
                    }
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
            stopAutoPan();
            markersRef.current.forEach(m => { try { m.remove(); } catch { /**/ } });
            markersRef.current = [];
            if (map) {
                try { map.remove(); } catch { /**/ }
            }
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapboxToken]);

    useEffect(() => {
        const cleanup = initMap();
        return cleanup;
    }, [initMap]);

    // Sync avatar markers - DataFast style: large 55px avatars with dark bg and colored dot
    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== 'ready') return;

        markersRef.current.forEach(m => { try { m.remove(); } catch { /**/ } });
        markersRef.current = [];

        import('mapbox-gl').then(({ default: mapboxgl }) => {
            visitors.forEach((v) => {
                if (v.lat === 0 && v.lng === 0) return;

                const warmthColor = getWarmthColor(v.warmth);
                const avatarUrl = getAvatarUrl(v.name);

                // ─── DataFast-style marker: large avatar in dark circle with colored dot ───
                const el = document.createElement('div');
                el.style.cssText = 'position:relative;width:60px;height:60px;cursor:pointer;';

                // Outer dark circle (the "frame")
                const frame = document.createElement('div');
                frame.style.cssText = `
                    position:absolute;top:2px;left:2px;width:56px;height:56px;
                    border-radius:50%;
                    background:rgba(15,20,35,0.9);
                    border:2.5px solid rgba(255,255,255,0.12);
                    box-shadow:0 4px 20px rgba(0,0,0,0.5);
                    overflow:hidden;
                    transition:transform 0.2s ease;
                `;

                // DiceBear avatar image (fills the dark circle)
                const img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = v.name;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
                img.onerror = () => {
                    img.remove();
                    frame.style.cssText += `display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;background:${v.avatarColor};`;
                    frame.textContent = v.avatarInitial;
                };
                frame.appendChild(img);
                el.appendChild(frame);

                // Warmth indicator dot (top-right, outside the circle)
                const dot = document.createElement('div');
                dot.style.cssText = `
                    position:absolute;top:0;right:0;width:14px;height:14px;
                    border-radius:50%;
                    background:${warmthColor};
                    border:3px solid rgba(8,12,24,0.95);
                    z-index:2;
                    box-shadow:0 0 6px ${warmthColor}80;
                `;
                el.appendChild(dot);

                // Hover: scale up
                el.onmouseenter = () => { frame.style.transform = 'scale(1.12)'; };
                el.onmouseleave = () => { frame.style.transform = 'scale(1)'; };

                const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([v.lng, v.lat])
                    .addTo(map);

                markersRef.current.push(marker);
            });
        }).catch(() => { /* ignore */ });
    }, [visitors, status]);

    const handleRetry = useCallback(() => {
        retryCountRef.current++;
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

            <div ref={containerRef} className="w-full h-full" style={{ background: '#080c18' }} />

            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#080c18' }}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-zinc-500 text-sm">Loading globe...</span>
                    </div>
                </div>
            )}

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
}));

const RealtimeMapbox = forwardRef<RealtimeMapboxHandle, RealtimeMapboxProps>(function RealtimeMapbox(props, ref) {
    return <RealtimeMapboxInner {...props} ref={ref} />;
});

export default RealtimeMapbox;
