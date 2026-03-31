'use client';

import { useEffect, useRef, memo, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { GlobeVisitor } from './RealtimeGlobe';
import 'mapbox-gl/dist/mapbox-gl.css';

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
    onAutoPanChange?: (enabled: boolean) => void;
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

// Load mapbox-gl via <script> tag from /public to completely bypass Turbopack.
// Turbopack transpiles the inline WebWorker bundle incorrectly ("w is not defined"),
// and the module namespace object is frozen so workerUrl can't be overridden.
// Loading as a plain script avoids both problems.
let _mapboxgl: any = null;
function loadMapboxGL(): Promise<any> {
    if (_mapboxgl) return Promise.resolve(_mapboxgl);
    // Already loaded by a previous script tag
    if (typeof window !== 'undefined' && (window as any).mapboxgl) {
        const m = (window as any).mapboxgl;
        m.workerUrl = '/mapbox-gl-csp-worker.js';
        _mapboxgl = m;
        return Promise.resolve(_mapboxgl);
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/mapbox-gl-csp.js';
        script.onload = () => {
            const m = (window as any).mapboxgl;
            if (!m || typeof m.Map !== 'function') {
                reject(new Error('mapbox-gl failed to load'));
                return;
            }
            m.workerUrl = '/mapbox-gl-csp-worker.js';
            _mapboxgl = m;
            resolve(_mapboxgl);
        };
        script.onerror = () => reject(new Error('Failed to load mapbox-gl script'));
        document.head.appendChild(script);
    });
}

const RealtimeMapboxInner = memo(forwardRef<RealtimeMapboxHandle, RealtimeMapboxProps>(function RealtimeMapboxInner({ visitors, mapboxToken, autoPan: autoPanProp = false, onAutoPanChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<Map<string, { marker: any; el: HTMLDivElement; lngLat: [number, number] }>>(new Map());
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const retryCountRef = useRef(0);
    const autoPanRef = useRef(autoPanProp);
    const autoPanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autoPanDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoPanIndexRef = useRef(0);
    const visitorsRef = useRef(visitors);
    const onAutoPanChangeRef = useRef(onAutoPanChange);
    visitorsRef.current = visitors;
    onAutoPanChangeRef.current = onAutoPanChange;

    // ─── Auto-pan: properly clears ALL timers ───
    const stopAutoPan = useCallback(() => {
        if (autoPanTimerRef.current) {
            clearInterval(autoPanTimerRef.current);
            autoPanTimerRef.current = null;
        }
        if (autoPanDelayRef.current) {
            clearTimeout(autoPanDelayRef.current);
            autoPanDelayRef.current = null;
        }
    }, []);

    const startAutoPan = useCallback(() => {
        stopAutoPan();
        const map = mapRef.current;
        if (!map) return;

        // Slow continuous rotation — keeps globe at the same zoom level
        const ROTATION_DEG_PER_TICK = 0.3; // degrees per tick
        const TICK_MS = 50; // ~60fps-ish

        autoPanTimerRef.current = setInterval(() => {
            if (!autoPanRef.current || !mapRef.current) return;
            const center = mapRef.current.getCenter();
            mapRef.current.setCenter([center.lng + ROTATION_DEG_PER_TICK, center.lat]);
        }, TICK_MS);
    }, [stopAutoPan]);

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

    const initMap = useCallback(() => {
        if (!containerRef.current || !mapboxToken) {
            setStatus('error');
            setErrorMsg('Missing Mapbox token');
            return;
        }

        let map: any;
        let destroyed = false;
        let readyFired = false;
        setStatus('loading');

        // Helper: mark map as ready (deduplicated — style.load and load both call this)
        const markReady = () => {
            if (readyFired || destroyed) return;
            readyFired = true;
            mapRef.current = map;
            setStatus('ready');
            retryCountRef.current = 0;

            // Hide branding
            const logo = containerRef.current?.querySelector('.mapboxgl-ctrl-logo');
            if (logo) (logo as HTMLElement).style.display = 'none';
            const attrib = containerRef.current?.querySelector('.mapboxgl-ctrl-attrib');
            if (attrib) (attrib as HTMLElement).style.display = 'none';

            if (autoPanRef.current) {
                startAutoPan();
            }
        };

        (async () => {
            try {
                const mapboxgl = await loadMapboxGL();

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
                    renderWorldCopies: false,
                });

                map.on('error', (e: any) => {
                    const msg = e?.error?.message || e?.message || 'Unknown map error';
                    console.warn('Mapbox error:', msg);
                    if (e?.error?.status === 401 || e?.error?.status === 403) {
                        setStatus('error');
                        setErrorMsg('Invalid Mapbox token');
                    } else if (msg.includes('WebGL') || msg.includes('Failed to initialize')) {
                        setStatus('error');
                        setErrorMsg('WebGL not available — try a different browser or enable hardware acceleration');
                    }
                });

                // Use style.load as the primary ready signal — it fires earlier and more
                // reliably than 'load' (which waits for ALL tiles/sprites to finish).
                // The 'load' event may never fire if any tile request stalls or fails.
                map.on('style.load', () => {
                    if (destroyed) return;
                    map.setFog({
                        color: 'rgb(8, 12, 24)',
                        'high-color': 'rgb(8, 12, 24)',
                        'horizon-blend': 0.015,
                        'space-color': 'rgb(6, 6, 14)',
                        'star-intensity': 0.7,
                    });
                    markReady();
                });

                // Also listen to 'load' as a fallback in case style.load somehow missed
                map.on('load', () => markReady());

                // Timeout fallback: if neither event fires within 8 seconds, force ready
                // (the map canvas is usually visible even if tiles are still loading)
                setTimeout(() => {
                    if (!readyFired && !destroyed && map) {
                        console.warn('Mapbox: load/style.load did not fire within 8s, forcing ready');
                        mapRef.current = map;
                        markReady();
                    }
                }, 8000);

                // On user interaction: stop auto-pan permanently
                const disableAutoPan = () => {
                    if (autoPanRef.current) {
                        stopAutoPan();
                        autoPanRef.current = false;
                        onAutoPanChangeRef.current?.(false);
                    }
                };
                map.on('dragstart', disableAutoPan);
                map.on('zoomstart', disableAutoPan);

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
            markersRef.current.forEach(m => { try { m.marker.remove(); } catch { /**/ } });
            markersRef.current = new Map();
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

    // Create marker DOM element — CRITICAL: no `position: relative` on outermost element
    // Setting position on the Mapbox marker element causes drift during zoom/rotation
    // See: https://github.com/mapbox/mapbox-gl-js/issues/4048
    const createMarkerElement = useCallback((v: GlobeVisitor) => {
        const warmthColor = getWarmthColor(v.warmth);
        const avatarUrl = getAvatarUrl(v.name);

        // Outermost element — NO position property, let Mapbox fully control it
        const el = document.createElement('div');
        el.style.cssText = 'width:60px;height:60px;cursor:pointer;z-index:10;';
        el.title = `${v.name} — ${v.country}`;

        // Inner wrapper handles relative positioning for the warmth dot
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

        const frame = document.createElement('div');
        frame.style.cssText = `
            width:56px;height:56px;margin:2px;
            border-radius:50%;
            background:${v.avatarColor};
            border:2.5px solid rgba(255,255,255,0.25);
            box-shadow:0 4px 24px rgba(0,0,0,0.6), 0 0 12px ${warmthColor}40;
            overflow:hidden;
        `;

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
        wrapper.appendChild(frame);

        const dot = document.createElement('div');
        dot.style.cssText = `
            position:absolute;top:0;right:0;width:14px;height:14px;
            border-radius:50%;
            background:${warmthColor};
            border:3px solid rgba(8,12,24,0.95);
            z-index:2;
            box-shadow:0 0 8px ${warmthColor}80;
        `;
        wrapper.appendChild(dot);
        el.appendChild(wrapper);

        el.onmouseenter = () => {
            frame.style.transform = 'scale(1.15)';
            frame.style.transition = 'transform 0.2s ease';
            frame.style.boxShadow = `0 4px 24px rgba(0,0,0,0.6),0 0 20px ${warmthColor}30`;
        };
        el.onmouseleave = () => {
            frame.style.transform = '';
            frame.style.boxShadow = '0 4px 24px rgba(0,0,0,0.6)';
        };

        return el;
    }, []);

    // Incremental marker sync — Mapbox handles positioning & globe occlusion natively
    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== 'ready' || !_mapboxgl) return;

        const mapboxgl = _mapboxgl;
        const currentMap = markersRef.current;
        const newIds = new Set<string>();

        visitors.forEach((v) => {
            if (v.lat === 0 && v.lng === 0) return;
            newIds.add(v.id);

            const existing = currentMap.get(v.id);
            if (existing) {
                const [oldLng, oldLat] = existing.lngLat;
                if (Math.abs(oldLng - v.lng) > 0.01 || Math.abs(oldLat - v.lat) > 0.01) {
                    existing.marker.setLngLat([v.lng, v.lat]);
                    existing.lngLat = [v.lng, v.lat];
                }
            } else {
                const el = createMarkerElement(v);
                const lngLat: [number, number] = [v.lng, v.lat];
                const marker = new mapboxgl.Marker({
                    element: el,
                    anchor: 'center',
                })
                    .setLngLat(lngLat)
                    .addTo(map);
                currentMap.set(v.id, { marker, el, lngLat });
            }
        });

        for (const [id, entry] of currentMap) {
            if (!newIds.has(id)) {
                try { entry.marker.remove(); } catch { /**/ }
                currentMap.delete(id);
            }
        }
    }, [visitors, status, createMarkerElement]);

    const handleRetry = useCallback(() => {
        retryCountRef.current++;
        if (containerRef.current) {
            while (containerRef.current.firstChild) {
                containerRef.current.removeChild(containerRef.current.firstChild);
            }
        }
        mapRef.current = null;
        markersRef.current = new Map();
        initMap();
    }, [initMap]);

    return (
        <div className="relative w-full h-full" style={{ minHeight: '100%' }}>
            <style>{`
                .mapboxgl-ctrl-logo { display: none !important; }
                .mapboxgl-ctrl-attrib { display: none !important; }
            `}</style>

            <div ref={containerRef} className="absolute inset-0" style={{ background: '#080c18' }} />

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
        </div>
    );
}));

const RealtimeMapbox = forwardRef<RealtimeMapboxHandle, RealtimeMapboxProps>(function RealtimeMapbox(props, ref) {
    return <RealtimeMapboxInner {...props} ref={ref} />;
});

export default RealtimeMapbox;
