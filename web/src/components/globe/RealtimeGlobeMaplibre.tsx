'use client';

// MapLibre is imported at runtime and its classes are used untyped here.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, memo, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getGlobeAvatarUrl } from '@/lib/globeUtils';
import { Button } from '@/components/ui/Button';

// ─── Types ───
export interface GlobeVisitor {
    id: string;
    name: string;
    country: string;
    lat: number;
    lng: number;
    warmth: number;
    avatarColor: string;
    avatarInitial: string;
    users?: number;
    // Optional enriched fields for popup card
    city?: string;
    device?: string;
    page?: string;
    estValue?: string;
    confidence?: number;
}

export interface RealtimeMapboxProps {
    visitors: GlobeVisitor[];
    byCountry?: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    autoPan?: boolean;
    onAutoPanChange?: (enabled: boolean) => void;
    initialZoom?: number;
}

export interface RealtimeMapboxHandle {
    toggleAutoPan: () => boolean;
    isAutoPanning: () => boolean;
}

/**
 * Colours for the map, markers and popup. Light by default; dark only when the
 * page is dark (embeds take ?theme=dark, DESIGN 2.1). No starfield in light.
 */
interface GlobePalette {
    dark: boolean;
    style: string;
    sky: string;
    land: string;
    water: string;
    border: string;
    line: string;
    label: string;
    labelMinor: string;
    halo: string;
    markerRing: string;
    markerShadow: string;
    popupBg: string;
    popupFg: string;
    popupText: string;
    popupMuted: string;
    popupBorder: string;
    popupDivider: string;
    popupShadow: string;
    closeHoverBg: string;
}

const LIGHT_PALETTE: GlobePalette = {
    dark: false,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    sky: '#f6f7f9',
    land: '#dde1e7',
    water: '#ffffff',
    border: '#c6ccd5',
    line: '#e7eaee',
    label: '#636b78',
    labelMinor: '#8a919c',
    halo: 'rgba(255,255,255,0.85)',
    markerRing: 'rgba(255,255,255,0.95)',
    markerShadow: '0 2px 8px rgba(16,19,26,0.18)',
    popupBg: '#ffffff',
    popupFg: '#171a20',
    popupText: '#4b5361',
    popupMuted: '#636b78',
    popupBorder: '#e7eaee',
    popupDivider: '#eff1f4',
    popupShadow: '0 4px 8px -2px rgba(16,19,26,0.06), 0 12px 32px -8px rgba(16,19,26,0.16)',
    closeHoverBg: '#eff1f4',
};

const DARK_PALETTE: GlobePalette = {
    dark: true,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    sky: '#0e1014',
    land: '#292929',
    water: '#1e1e1f',
    border: '#3d3d42',
    line: '#333336',
    label: '#8a919c',
    labelMinor: '#636b78',
    halo: 'rgba(0,0,0,0.6)',
    markerRing: 'rgba(255,255,255,0.25)',
    markerShadow: '0 4px 16px rgba(0,0,0,0.5)',
    popupBg: '#15171c',
    popupFg: '#eef0f3',
    popupText: '#c6ccd5',
    popupMuted: '#8a919c',
    popupBorder: 'rgba(255,255,255,0.08)',
    popupDivider: 'rgba(255,255,255,0.06)',
    popupShadow: '0 24px 64px -12px rgba(0,0,0,0.7)',
    closeHoverBg: 'rgba(255,255,255,0.08)',
};

function readPalette(): GlobePalette {
    if (typeof document === 'undefined') return LIGHT_PALETTE;
    return document.documentElement.getAttribute('data-theme') === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

function getWarmthColor(warmth: number): string {
    if (warmth > 0.6) return '#ef4444';
    if (warmth > 0.4) return '#f97316';
    if (warmth > 0.25) return '#eab308';
    return '#3b82f6';
}

// ═══════════════════════════════════════════════════════
// Custom WebGL Star Layer — renders stars on a sky sphere
// at radius 200, just like Mapbox's setFog star-intensity.
// Stars move naturally with camera rotation (pitch/bearing/center).
// ═══════════════════════════════════════════════════════

function createStarLayer(mapInstance: any) {
    const NUM_STARS = 12000;
    const RADIUS = 200;

    let program: WebGLProgram | null = null;
    let posBuffer: WebGLBuffer | null = null;
    let attribBuffer: WebGLBuffer | null = null;
    let uMatrix: WebGLUniformLocation | null = null;
    let uIntensity: WebGLUniformLocation | null = null;
    let uSizeMult: WebGLUniformLocation | null = null;
    let aPos = -1, aSize = -1, aOpacity = -1;

    // Seeded PRNG (same as Mapbox's mulberry32)
    function mulberry32(seed: number) {
        return () => {
            seed |= 0;
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function generateStars() {
        const rand = mulberry32(42);
        const positions = new Float32Array(NUM_STARS * 3);
        const attributes = new Float32Array(NUM_STARS * 2);
        for (let i = 0; i < NUM_STARS; i++) {
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            positions[i * 3] = RADIUS * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = RADIUS * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = RADIUS * Math.cos(phi);
            const r = rand();
            if (r < 0.55) {
                attributes[i * 2] = rand() * 0.5 + 0.3;        // size: 0.3-0.8
                attributes[i * 2 + 1] = rand() * 0.2 + 0.6;      // opacity: 0.6-0.8
            } else if (r < 0.82) {
                attributes[i * 2] = rand() * 0.6 + 0.7;        // size: 0.7-1.3
                attributes[i * 2 + 1] = rand() * 0.2 + 0.7;    // opacity: 0.7-0.9
            } else {
                attributes[i * 2] = rand() * 0.6 + 1.2;        // size: 1.2-1.8
                attributes[i * 2 + 1] = rand() * 0.1 + 0.9;    // opacity: 0.9-1.0
            }
        }
        return { positions, attributes };
    }

    // ── Inline 4x4 matrix math (column-major, no gl-matrix dep) ──
    function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++)
            for (let r = 0; r < 4; r++)
                o[c * 4 + r] =
                    a[0 * 4 + r] * b[c * 4 + 0] +
                    a[1 * 4 + r] * b[c * 4 + 1] +
                    a[2 * 4 + r] * b[c * 4 + 2] +
                    a[3 * 4 + r] * b[c * 4 + 3];
        return o;
    }
    function rotX(a: number): Float32Array {
        const c = Math.cos(a), s = Math.sin(a);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    }
    function rotY(a: number): Float32Array {
        const c = Math.cos(a), s = Math.sin(a);
        return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    }
    function rotZ(a: number): Float32Array {
        const c = Math.cos(a), s = Math.sin(a);
        return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    function persp(fov: number, aspect: number, near: number, far: number): Float32Array {
        const f = 1.0 / Math.tan(fov / 2), nf = 1 / (near - far);
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    }

    return {
        id: 'custom-stars',
        type: 'custom' as const,
        renderingMode: '3d' as const,

        onAdd(_map: any, gl: WebGLRenderingContext) {
            const vs = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vs, `
                attribute vec3 a_pos;
                attribute float a_size;
                attribute float a_opacity;
                uniform mat4 u_matrix;
                uniform float u_size_mult;
                varying float v_opacity;
                void main() {
                    gl_Position = u_matrix * vec4(a_pos, 1.0);
                    gl_PointSize = a_size * u_size_mult;
                    v_opacity = a_opacity;
                }
            `);
            gl.compileShader(vs);

            const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fs, `
                precision mediump float;
                varying float v_opacity;
                uniform float u_intensity;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
                    float alpha = 1.0 - smoothstep(0.6, 1.0, d);
                    alpha *= v_opacity * u_intensity;
                    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
                }
            `);
            gl.compileShader(fs);

            program = gl.createProgram()!;
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);

            aPos = gl.getAttribLocation(program, 'a_pos');
            aSize = gl.getAttribLocation(program, 'a_size');
            aOpacity = gl.getAttribLocation(program, 'a_opacity');
            uMatrix = gl.getUniformLocation(program, 'u_matrix');
            uIntensity = gl.getUniformLocation(program, 'u_intensity');
            uSizeMult = gl.getUniformLocation(program, 'u_size_mult');

            const { positions, attributes } = generateStars();
            posBuffer = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            attribBuffer = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, attribBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, attributes, gl.STATIC_DRAW);
        },

        render(gl: WebGLRenderingContext) {
            if (!program) return;

            const center = mapInstance.getCenter();
            const pitch = mapInstance.getPitch() * Math.PI / 180;
            const bearing = mapInstance.getBearing() * Math.PI / 180;
            const zoom = mapInstance.getZoom();
            const lat = center.lat * Math.PI / 180;
            const lng = center.lng * Math.PI / 180;

            // Match user's Mapbox config: star-intensity: 0.7
            const intensity = zoom < 5 ? 1.15 : zoom < 7 ? 1.15 * (1 - (zoom - 5) / 2) : 0;
            if (intensity <= 0) return;

            const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

            // MVP: perspective * rotX(-pitch) * rotZ(-bearing) * rotX(lat) * rotY(-lng)
            let mvp = persp(0.6435, aspect, 1, 500);
            mvp = mat4Mul(mvp, rotX(-pitch));
            mvp = mat4Mul(mvp, rotZ(-bearing));
            mvp = mat4Mul(mvp, rotX(lat));
            mvp = mat4Mul(mvp, rotY(-lng));

            gl.useProgram(program);

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, attribBuffer);
            gl.enableVertexAttribArray(aSize);
            gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 8, 0);
            gl.enableVertexAttribArray(aOpacity);
            gl.vertexAttribPointer(aOpacity, 1, gl.FLOAT, false, 8, 4);

            gl.uniformMatrix4fv(uMatrix, false, mvp);
            gl.uniform1f(uIntensity, intensity);
            gl.uniform1f(uSizeMult, 1.4);

            // Premultiplied alpha blending (Mapbox style)
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.depthMask(false);
            gl.disable(gl.DEPTH_TEST);

            gl.drawArrays(gl.POINTS, 0, NUM_STARS);

            // Restore GL state for MapLibre
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.disableVertexAttribArray(aPos);
            gl.disableVertexAttribArray(aSize);
            gl.disableVertexAttribArray(aOpacity);
        },

        onRemove(_map: any, gl: WebGLRenderingContext) {
            if (program) gl.deleteProgram(program);
            if (posBuffer) gl.deleteBuffer(posBuffer);
            if (attribBuffer) gl.deleteBuffer(attribBuffer);
        },
    };
}

// ═══════════════════════════════════════════════════
// Cache Map + Marker constructors
// ═══════════════════════════════════════════════════
let _MapClass: any = null;
let _MarkerClass: any = null;
let _PopupClass: any = null;
async function loadMapLibreGL() {
    if (_MapClass) return;
    const mod: any = await import('maplibre-gl');
    _MapClass = mod.Map ?? mod.default?.Map ?? mod.default;
    _MarkerClass = mod.Marker ?? mod.default?.Marker;
    _PopupClass = mod.Popup ?? mod.default?.Popup;
}

// ═══════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════
const RealtimeMapboxInner = memo(forwardRef<RealtimeMapboxHandle, RealtimeMapboxProps>(function RealtimeMapboxInner({ visitors, autoPan: autoPanProp = false, onAutoPanChange, initialZoom }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<Map<string, { marker: any; el: HTMLDivElement; lngLat: [number, number] }>>(new Map());
    const activePopupRef = useRef<any>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const retryCountRef = useRef(0);
    const autoPanRef = useRef(autoPanProp);
    const autoPanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autoPanDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onAutoPanChangeRef = useRef(onAutoPanChange);
    useEffect(() => { onAutoPanChangeRef.current = onAutoPanChange; }, [onAutoPanChange]);
    // The page theme is fixed for the life of an embed (?theme=), so read it once.
    const [palette] = useState<GlobePalette>(readPalette);

    const stopAutoPan = useCallback(() => {
        if (autoPanTimerRef.current) { clearInterval(autoPanTimerRef.current); autoPanTimerRef.current = null; }
        if (autoPanDelayRef.current) { clearTimeout(autoPanDelayRef.current); autoPanDelayRef.current = null; }
    }, []);

    const startAutoPan = useCallback(() => {
        stopAutoPan();
        if (!mapRef.current) return;
        autoPanTimerRef.current = setInterval(() => {
            if (!autoPanRef.current || !mapRef.current) return;
            const c = mapRef.current.getCenter();
            mapRef.current.setCenter([c.lng + 0.3, c.lat]);
        }, 50);
    }, [stopAutoPan]);

    useImperativeHandle(ref, () => ({
        toggleAutoPan: () => {
            autoPanRef.current = !autoPanRef.current;
            if (autoPanRef.current) startAutoPan(); else stopAutoPan();
            return autoPanRef.current;
        },
        isAutoPanning: () => autoPanRef.current,
    }));

    const initMap = useCallback(() => {
        // The container div always renders before this effect runs.
        if (!containerRef.current) return;

        let map: any;
        let destroyed = false;
        const pal = palette;

        (async () => {
            try {
                await loadMapLibreGL();
                if (destroyed || !containerRef.current || !_MapClass) return;

                while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);

                map = new _MapClass({
                    container: containerRef.current,
                    style: pal.style,
                    center: [30, 25],
                    zoom: initialZoom ?? 1.8,
                    attributionControl: false,
                    fadeDuration: 0,
                    renderWorldCopies: false,
                });

                map.on('error', (e: any) => console.warn('MapLibre error:', e?.error?.message || 'Unknown'));

                map.on('load', () => {
                    if (destroyed) return;
                    mapRef.current = map;
                    retryCountRef.current = 0;
                    setStatus('ready');
                    if (autoPanRef.current) startAutoPan();

                    const logo = containerRef.current?.querySelector('.maplibregl-ctrl-logo');
                    if (logo) (logo as HTMLElement).style.display = 'none';
                    const attrib = containerRef.current?.querySelector('.maplibregl-ctrl-attrib');
                    if (attrib) (attrib as HTMLElement).style.display = 'none';
                });

                map.on('style.load', () => {
                    if (destroyed) return;

                    // Critical: globe projection + sky (fast, must be sync)
                    try { map.setProjection({ type: 'globe' }); } catch (e) { console.warn('setProjection:', e); }
                    try {
                        map.setSky({
                            'sky-color': pal.sky,
                            'horizon-color': pal.sky,
                            'fog-color': pal.sky,
                            'fog-ground-blend': 1,
                            'horizon-fog-blend': 1,
                            'sky-horizon-blend': 0,
                            'atmosphere-blend': 0,
                        });
                    } catch { /**/ }

                    // Star layer (behind everything): dark theme only
                    if (pal.dark) {
                        try {
                            const layers = map.getStyle().layers;
                            const firstId = layers?.[0]?.id;
                            map.addLayer(createStarLayer(map), firstId);
                        } catch { /**/ }
                    }

                    // Make country labels visible at globe zoom (minzoom 0) + brighten
                    try {
                        const style = map.getStyle();
                        if (style?.layers) {
                            for (const layer of style.layers) {
                                try {
                                    if (layer.type === 'symbol') {
                                        const id = layer.id;
                                        // Country/continent labels: show from zoom 0, brighten
                                        if (id.includes('country') || id.includes('continent')) {
                                            map.setLayerZoomRange(id, 0, 24);
                                            map.setLayoutProperty(id, 'text-transform', 'none');
                                            map.setPaintProperty(id, 'text-color', pal.label);
                                            map.setPaintProperty(id, 'text-halo-color', pal.halo);
                                            map.setPaintProperty(id, 'text-halo-width', 0.8);
                                        } else if (id.includes('city') || id.includes('capital') || id.includes('state')) {
                                            map.setLayoutProperty(id, 'text-transform', 'none');
                                            map.setPaintProperty(id, 'text-color', pal.labelMinor);
                                            map.setPaintProperty(id, 'text-halo-color', pal.halo);
                                            map.setPaintProperty(id, 'text-halo-width', 0.6);
                                        } else if (id.includes('village') || id.includes('suburb') || id.includes('hamlet') ||
                                                   id.includes('housenumber') || id.includes('poi') || id.includes('roadname_minor')) {
                                            map.setLayoutProperty(id, 'visibility', 'none');
                                        }
                                    }
                                } catch { /**/ }
                            }
                        }
                    } catch { /**/ }

                    // Defer heavy layer restyling to avoid blocking first paint
                    setTimeout(() => {
                        if (destroyed || !map) return;
                        try {
                            const style = map.getStyle();
                            if (!style?.layers) return;
                            for (const layer of style.layers) {
                                try {
                                    if (layer.type === 'background') {
                                        map.setPaintProperty(layer.id, 'background-color', pal.land);
                                    } else if (layer.type === 'fill') {
                                        map.setPaintProperty(layer.id, 'fill-color', layer.id.includes('water') ? pal.water : pal.land);
                                    } else if (layer.type === 'line') {
                                        const isBorder = layer.id.includes('boundary') || layer.id.includes('border');
                                        map.setPaintProperty(layer.id, 'line-color', isBorder ? pal.border : pal.line);
                                        map.setPaintProperty(layer.id, 'line-opacity', isBorder ? 0.5 : 0.35);
                                    }
                                } catch { /**/ }
                            }
                        } catch { /**/ }
                    }, 0);
                });

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
                console.warn('MapLibre init failed:', err?.message || err);
                if (!destroyed) { setStatus('error'); setErrorMsg(err?.message || 'Failed to initialize map'); }
            }
        })();

        return () => {
            destroyed = true;
            stopAutoPan();
            if (activePopupRef.current) { try { activePopupRef.current.remove(); } catch { /**/ } activePopupRef.current = null; }
            markersRef.current.forEach(m => { try { m.marker.remove(); } catch { /**/ } });
            markersRef.current = new Map();
            if (map) { try { map.remove(); } catch { /**/ } }
            mapRef.current = null;
        };
    }, [startAutoPan, stopAutoPan, palette, initialZoom]);

    useEffect(() => { const cleanup = initMap(); return cleanup; }, [initMap]);

    const createMarkerElement = useCallback((v: GlobeVisitor) => {
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
        const sz = isMobile ? 44 : 60;
        const inner = isMobile ? 40 : 56;
        const warmthColor = getWarmthColor(v.warmth);
        const avatarUrl = getGlobeAvatarUrl(v.name);

        const el = document.createElement('div');
        el.style.cssText = `width:${sz}px;height:${sz}px;cursor:pointer;z-index:10;`;
        el.title = `${v.name} — ${v.country}`;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

        const frame = document.createElement('div');
        frame.style.cssText = `width:${inner}px;height:${inner}px;margin:${(sz - inner) / 2}px;border-radius:50%;background:${v.avatarColor};border:${isMobile ? 2 : 2.5}px solid ${palette.markerRing};box-shadow:${palette.markerShadow};overflow:hidden;`;

        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = v.name;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.onerror = () => {
            img.remove();
            frame.style.cssText += `display:flex;align-items:center;justify-content:center;font-size:${isMobile ? 15 : 20}px;font-weight:700;color:white;background:${v.avatarColor};`;
            frame.textContent = v.avatarInitial;
        };
        frame.appendChild(img);
        wrapper.appendChild(frame);

        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;top:0;right:0;width:${isMobile ? 11 : 14}px;height:${isMobile ? 11 : 14}px;border-radius:50%;background:${warmthColor};border:${isMobile ? 2 : 3}px solid ${palette.popupBg};z-index:2;`;
        wrapper.appendChild(dot);
        el.appendChild(wrapper);

        el.onmouseenter = () => { frame.style.transform = 'scale(1.15)'; frame.style.transition = 'transform 0.2s ease'; };
        el.onmouseleave = () => { frame.style.transform = ''; };

        // Click → show visitor card popup
        el.onclick = (e) => {
            e.stopPropagation();
            if (!mapRef.current || !_PopupClass) return;

            // Close any existing popup
            if (activePopupRef.current) { try { activePopupRef.current.remove(); } catch { /**/ } }

            const warmthPct = Math.round(v.warmth * 100);
            const warmthHex = getWarmthColor(v.warmth);
            const cityLabel = v.city && !v.city.startsWith('(') ? v.city : '';
            const deviceLabel = v.device || 'Desktop';
            const deviceIcon = deviceLabel.toLowerCase() === 'mobile' ? '📱' : deviceLabel.toLowerCase() === 'tablet' ? '📱' : '🖥';
            const pageLabel = v.page || '/';
            const estValue = v.estValue || `$${(v.warmth * 3.5).toFixed(2)}`;
            const confidence = v.confidence ?? Math.round(50 + v.warmth * 40);
            const convLikelihood = Math.round((confidence - 50) * 2.18);
            const p = palette;

            const popupHTML = `
                <div style="background:${p.popupBg};border-radius:12px;min-width:260px;max-width:300px;font-family:var(--font-geist-sans),system-ui,-apple-system,sans-serif;color:${p.popupFg};border:1px solid ${p.popupBorder};box-shadow:${p.popupShadow};overflow:hidden;">
                    <div style="padding:14px 16px 10px;display:flex;align-items:center;gap:12px;">
                        <div style="position:relative;flex-shrink:0;">
                            <div style="width:44px;height:44px;border-radius:50%;background:${v.avatarColor};overflow:hidden;">
                                <img src="${getGlobeAvatarUrl(v.name)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.parentNode.style.display='flex';this.parentNode.style.alignItems='center';this.parentNode.style.justifyContent='center';this.parentNode.style.fontSize='16px';this.parentNode.style.fontWeight='600';this.parentNode.style.color='white';this.parentNode.textContent='${v.avatarInitial}';" />
                            </div>
                            <div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:${warmthHex};border:2px solid ${p.popupBg};"></div>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:14px;font-weight:600;color:${p.popupFg};line-height:1.25;">${v.name}</div>
                            <div style="font-size:12px;color:${p.popupMuted};margin-top:3px;">${cityLabel ? cityLabel + ', ' : ''}${v.country}</div>
                            <div style="font-size:12px;color:${p.popupMuted};margin-top:2px;">${deviceIcon} ${deviceLabel}</div>
                        </div>
                    </div>
                    <div style="height:1px;background:${p.popupDivider};margin:0 16px;"></div>
                    <div style="padding:8px 16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:5px 0;">
                            <span style="font-size:12px;color:${p.popupMuted};">Current page</span>
                            <span style="font-size:12px;font-weight:500;color:${p.popupText};font-family:var(--font-geist-mono),ui-monospace,monospace;">${pageLabel.length > 24 ? pageLabel.slice(0, 24) + '…' : pageLabel}</span>
                        </div>
                    </div>
                    <div style="height:1px;background:${p.popupDivider};margin:0 16px;"></div>
                    <div style="padding:10px 16px 12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span style="font-size:12px;color:${p.popupMuted};">Conversion likelihood (est.)</span>
                            <span style="font-size:12px;font-weight:600;color:${p.popupFg};">${convLikelihood > 0 ? '+' : ''}${convLikelihood}% <span style="color:${p.popupMuted};font-weight:400;">vs. avg</span></span>
                        </div>
                        <div style="height:6px;background:${p.popupDivider};border-radius:99px;overflow:hidden;">
                            <div style="height:100%;width:${warmthPct}%;background:${warmthHex};border-radius:99px;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                            <span style="font-size:12px;color:${p.popupMuted};">Estimated value</span>
                            <span style="font-size:12px;font-weight:600;color:${p.popupFg};">${estValue}</span>
                        </div>
                    </div>
                </div>
            `;

            const popup = new _PopupClass({
                closeButton: true,
                closeOnClick: true,
                maxWidth: '320px',
                offset: [0, -38],
                className: 'tc-visitor-popup',
            })
                .setLngLat([v.lng, v.lat])
                .setHTML(popupHTML)
                .addTo(mapRef.current);

            activePopupRef.current = popup;
            popup.on('close', () => { activePopupRef.current = null; });
        };

        return el;
    }, [palette]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== 'ready' || !_MarkerClass || !_MapClass) return;
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
                const marker = new _MarkerClass({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
                currentMap.set(v.id, { marker, el, lngLat });
            }
        });

        for (const [id, entry] of currentMap) {
            if (!newIds.has(id)) { try { entry.marker.remove(); } catch { /**/ } currentMap.delete(id); }
        }
    }, [visitors, status, createMarkerElement]);

    // Globe occlusion: hide markers on the back side of the globe
    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== 'ready') return;

        const DEG2RAD = Math.PI / 180;
        function updateOcclusion() {
            const center = map.getCenter();
            const cLat = center.lat * DEG2RAD;
            const cLng = center.lng * DEG2RAD;
            for (const [, entry] of markersRef.current) {
                const [lng, lat] = entry.lngLat;
                const mLat = lat * DEG2RAD;
                const mLng = lng * DEG2RAD;
                // cos of angular distance — negative means back side
                const cosAngle = Math.sin(cLat) * Math.sin(mLat) + Math.cos(cLat) * Math.cos(mLat) * Math.cos(mLng - cLng);
                entry.el.style.display = cosAngle > -0.05 ? '' : 'none';
            }
        }

        map.on('move', updateOcclusion);
        updateOcclusion();
        return () => { map.off('move', updateOcclusion); };
    }, [status]);

    const handleRetry = useCallback(() => {
        retryCountRef.current++;
        setStatus('loading');
        if (containerRef.current) while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
        mapRef.current = null;
        markersRef.current = new Map();
        initMap();
    }, [initMap]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: palette.sky }}>
            <style>{`
                .maplibregl-ctrl-logo { display: none !important; }
                .maplibregl-ctrl-attrib { display: none !important; }
                .tc-visitor-popup {
                    z-index: 100 !important;
                }
                .tc-visitor-popup .maplibregl-popup-content {
                    background: transparent !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                    border-radius: 14px !important;
                    overflow: visible !important;
                }
                .tc-visitor-popup .maplibregl-popup-tip {
                    border-top-color: ${palette.popupBg} !important;
                }
                .tc-visitor-popup .maplibregl-popup-close-button {
                    color: ${palette.popupMuted} !important;
                    font-size: 16px !important;
                    right: 10px !important;
                    top: 10px !important;
                    width: 22px !important;
                    height: 22px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    border-radius: 50% !important;
                    z-index: 5 !important;
                    line-height: 1 !important;
                }
                .tc-visitor-popup .maplibregl-popup-close-button:hover {
                    background: ${palette.closeHoverBg} !important;
                    color: ${palette.popupFg} !important;
                }
            `}</style>
            <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            {status === 'loading' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: palette.sky }}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-fg-muted" />
                        <span className="text-body-sm text-fg-muted">Loading map…</span>
                    </div>
                </div>
            )}
            {status === 'error' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: palette.sky }}>
                    <div className="flex flex-col items-center gap-3 px-4 text-center">
                        <span className="text-body-sm text-fg-muted">{errorMsg || 'The map did not load'}</span>
                        <Button variant="secondary" size="sm" onClick={handleRetry}>Try again</Button>
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
