'use client';

import { useEffect, useRef, memo, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

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

function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
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

        render(gl: WebGLRenderingContext, _matrix: any) {
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
    const visitorsRef = useRef(visitors);
    const onAutoPanChangeRef = useRef(onAutoPanChange);
    visitorsRef.current = visitors;
    onAutoPanChangeRef.current = onAutoPanChange;

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
        if (!containerRef.current) { setStatus('error'); setErrorMsg('Container not available'); return; }

        let map: any;
        let destroyed = false;
        setStatus('loading');

        (async () => {
            try {
                await loadMapLibreGL();
                if (destroyed || !containerRef.current || !_MapClass) return;

                while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);

                map = new _MapClass({
                    container: containerRef.current,
                    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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
                            'sky-color': '#06060e',
                            'horizon-color': '#06060e',
                            'fog-color': '#06060e',
                            'fog-ground-blend': 1,
                            'horizon-fog-blend': 1,
                            'sky-horizon-blend': 0,
                            'atmosphere-blend': 0,
                        });
                    } catch { /**/ }

                    // Star layer (behind everything)
                    try {
                        const layers = map.getStyle().layers;
                        const firstId = layers?.[0]?.id;
                        map.addLayer(createStarLayer(map), firstId);
                    } catch { /**/ }

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
                                            map.setPaintProperty(id, 'text-color', '#5a5a62');
                                            map.setPaintProperty(id, 'text-halo-color', 'rgba(0,0,0,0.6)');
                                            map.setPaintProperty(id, 'text-halo-width', 0.8);
                                        } else if (id.includes('city') || id.includes('capital') || id.includes('state')) {
                                            map.setLayoutProperty(id, 'text-transform', 'none');
                                            map.setPaintProperty(id, 'text-color', '#4a4a52');
                                            map.setPaintProperty(id, 'text-halo-color', 'rgba(0,0,0,0.5)');
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
                                        map.setPaintProperty(layer.id, 'background-color', '#292929');
                                    } else if (layer.type === 'fill') {
                                        map.setPaintProperty(layer.id, 'fill-color', layer.id.includes('water') ? '#1E1E1F' : '#292929');
                                    } else if (layer.type === 'line') {
                                        const isBorder = layer.id.includes('boundary') || layer.id.includes('border');
                                        map.setPaintProperty(layer.id, 'line-color', isBorder ? '#3d3d42' : '#333336');
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
    }, [startAutoPan, stopAutoPan]);

    useEffect(() => { const cleanup = initMap(); return cleanup; }, [initMap]);

    const createMarkerElement = useCallback((v: GlobeVisitor) => {
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
        const sz = isMobile ? 44 : 60;
        const inner = isMobile ? 40 : 56;
        const warmthColor = getWarmthColor(v.warmth);
        const avatarUrl = getAvatarUrl(v.name);

        const el = document.createElement('div');
        el.style.cssText = `width:${sz}px;height:${sz}px;cursor:pointer;z-index:10;`;
        el.title = `${v.name} — ${v.country}`;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

        const frame = document.createElement('div');
        frame.style.cssText = `width:${inner}px;height:${inner}px;margin:${(sz - inner) / 2}px;border-radius:50%;background:${v.avatarColor};border:${isMobile ? 2 : 2.5}px solid rgba(255,255,255,0.25);box-shadow:0 4px 24px rgba(0,0,0,0.6), 0 0 12px ${warmthColor}40;overflow:hidden;`;

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
        dot.style.cssText = `position:absolute;top:0;right:0;width:${isMobile ? 11 : 14}px;height:${isMobile ? 11 : 14}px;border-radius:50%;background:${warmthColor};border:${isMobile ? 2 : 3}px solid rgba(8,12,24,0.95);z-index:2;box-shadow:0 0 8px ${warmthColor}80;`;
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
            const warmthLabel = v.warmth > 0.6 ? 'Hot' : v.warmth > 0.4 ? 'Warm' : v.warmth > 0.25 ? 'Mild' : 'Cool';
            const warmthHex = getWarmthColor(v.warmth);
            const cityLabel = v.city && !v.city.startsWith('(') ? v.city : '';
            const deviceLabel = v.device || 'Desktop';
            const deviceIcon = deviceLabel.toLowerCase() === 'mobile' ? '📱' : deviceLabel.toLowerCase() === 'tablet' ? '📱' : '🖥';
            const pageLabel = v.page || '/';
            const estValue = v.estValue || `$${(v.warmth * 3.5).toFixed(2)}`;
            const confidence = v.confidence ?? Math.round(50 + v.warmth * 40);
            const convLikelihood = Math.round((confidence - 50) * 2.18);
            // Deterministic session time from name hash
            const nameHash = v.name.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
            const sessionMin = Math.abs(nameHash % 12) + 1;
            const sessionSec = Math.abs((nameHash >> 4) % 60);
            const totalVisits = Math.abs((nameHash >> 8) % 5) + 1;

            const popupHTML = `
                <div style="background:#13131D;border-radius:14px;min-width:260px;max-width:300px;font-family:system-ui,-apple-system,sans-serif;color:#e4e4e7;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);overflow:hidden;">
                    <!-- Header -->
                    <div style="padding:14px 16px 10px;display:flex;align-items:center;gap:12px;">
                        <div style="position:relative;flex-shrink:0;">
                            <div style="width:48px;height:48px;border-radius:50%;background:${v.avatarColor};border:2.5px solid ${warmthHex}50;overflow:hidden;box-shadow:0 0 16px ${warmthHex}30;">
                                <img src="${getAvatarUrl(v.name)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.parentNode.style.display='flex';this.parentNode.style.alignItems='center';this.parentNode.style.justifyContent='center';this.parentNode.style.fontSize='17px';this.parentNode.style.fontWeight='700';this.parentNode.style.color='white';this.parentNode.textContent='${v.avatarInitial}';" />
                            </div>
                            <div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:${warmthHex};border:2px solid #13131D;box-shadow:0 0 6px ${warmthHex}80;"></div>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:14px;font-weight:700;color:white;line-height:1.2;">${v.name}</div>
                            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:4px;">
                                <span style="font-size:11px;color:#a1a1aa;">📍 ${cityLabel ? cityLabel + ', ' : ''}${v.country}</span>
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;">
                                <span style="font-size:10px;color:#71717a;">${deviceIcon} ${deviceLabel}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div style="height:1px;background:rgba(255,255,255,0.06);margin:0 16px;"></div>

                    <!-- Stats rows -->
                    <div style="padding:8px 16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
                            <span style="font-size:11px;color:#71717a;">Current URL</span>
                            <span style="font-size:11px;font-weight:500;color:#d4d4d8;font-family:ui-monospace,monospace;background:rgba(255,255,255,0.04);padding:1px 6px;border-radius:4px;">${pageLabel.length > 20 ? pageLabel.slice(0, 20) + '…' : pageLabel}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
                            <span style="font-size:11px;color:#71717a;">Session time</span>
                            <span style="font-size:11px;font-weight:500;color:#d4d4d8;">${sessionMin} min ${sessionSec} sec</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
                            <span style="font-size:11px;color:#71717a;">Total visits</span>
                            <span style="font-size:11px;font-weight:500;color:#d4d4d8;">${totalVisits}</span>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div style="height:1px;background:rgba(255,255,255,0.06);margin:0 16px;"></div>

                    <!-- Conversion likelihood + estimated value -->
                    <div style="padding:10px 16px 12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span style="font-size:11px;color:#71717a;">Conversion likelihood</span>
                            <span style="font-size:11px;font-weight:600;color:${warmthHex};">${convLikelihood > 0 ? '+' : ''}${convLikelihood}% <span style="color:#52525b;font-weight:400;">vs. avg</span></span>
                        </div>
                        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;position:relative;">
                            <div style="height:100%;width:${warmthPct}%;background:linear-gradient(90deg,${warmthHex},${warmthHex}cc);border-radius:99px;"></div>
                            <div style="position:absolute;top:-3px;left:${Math.min(warmthPct, 95)}%;width:12px;height:12px;border-radius:50%;background:${warmthHex};border:2px solid #13131D;box-shadow:0 0 6px ${warmthHex}60;transform:translateX(-50%);"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                            <span style="font-size:11px;color:#71717a;">Estimated value</span>
                            <span style="font-size:12px;font-weight:700;color:${warmthHex};">${estValue}</span>
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
    }, []);

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
        if (containerRef.current) while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
        mapRef.current = null;
        markersRef.current = new Map();
        initMap();
    }, [initMap]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#06060e' }}>
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
                    border-top-color: #13131D !important;
                }
                .tc-visitor-popup .maplibregl-popup-close-button {
                    color: #52525b !important;
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
                    background: rgba(255,255,255,0.08) !important;
                    color: #a1a1aa !important;
                }
            `}</style>
            <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            {status === 'loading' && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: '#06060e' }}>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="text-zinc-500 text-sm">Loading globe...</span>
                    </div>
                </div>
            )}
            {status === 'error' && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: '#06060e' }}>
                    <div className="flex flex-col items-center gap-3 text-center px-4">
                        <span className="text-zinc-400 text-sm">{errorMsg || 'Globe failed to load'}</span>
                        <button onClick={handleRetry} className="px-4 py-2 text-sm bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition border border-emerald-500/20">Retry</button>
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
