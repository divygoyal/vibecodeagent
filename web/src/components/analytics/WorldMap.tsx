'use client';

import React, { useState, useMemo, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Mercator Projection (bounded) ───
const MAP_W = 960;
const MAP_H = 500;
const LON_MIN = -170, LON_MAX = 190;
const LAT_MIN = -58, LAT_MAX = 82;
const LAT_MIN_R = (LAT_MIN * Math.PI) / 180;
const MERC_MIN = Math.log(Math.tan(Math.PI / 4 + LAT_MIN_R / 2));
const LAT_MAX_R = (LAT_MAX * Math.PI) / 180;
const MERC_MAX = Math.log(Math.tan(Math.PI / 4 + LAT_MAX_R / 2));

function project(lon: number, lat: number): [number, number] {
    const cLat = Math.max(LAT_MIN, Math.min(LAT_MAX, lat));
    const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W;
    const r = (cLat * Math.PI) / 180;
    const m = Math.log(Math.tan(Math.PI / 4 + r / 2));
    const y = MAP_H - ((m - MERC_MIN) / (MERC_MAX - MERC_MIN)) * MAP_H;
    return [x, y];
}

// ─── Minimal TopoJSON Decoder (zero-dependency) ───
function decodeTopo(topo: any): string[] {
    if (!topo?.transform || !topo?.arcs) return [];
    const { scale, translate } = topo.transform;
    const arcs = topo.arcs.map((arc: number[][]) => {
        let x = 0, y = 0;
        return arc.map(([dx, dy]: number[]) => {
            x += dx; y += dy;
            return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
    });
    const resolve = (idx: number) => idx >= 0 ? arcs[idx] : [...arcs[~idx]].reverse();
    const ring = (ids: number[]) => {
        const pts: number[][] = [];
        ids.forEach(i => { const a = resolve(i); pts.push(...(pts.length ? a.slice(1) : a)); });
        return pts;
    };
    const toPath = (coords: number[][]) => {
        if (!coords.length) return '';
        return coords.map(([lon, lat], i) => {
            const [px, py] = project(lon, lat);
            return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        }).join('') + 'Z';
    };
    const paths: string[] = [];
    const land = topo.objects.land;
    const geoms = land.geometries || [land];
    geoms.forEach((g: any) => {
        const walk = (a: any, depth: number) => {
            if (depth === 0) paths.push(toPath(ring(a)));
            else a.forEach((s: any) => walk(s, depth - 1));
        };
        if (g.type === 'Polygon') walk(g.arcs, 1);
        else if (g.type === 'MultiPolygon') walk(g.arcs, 2);
    });
    return paths;
}

// ─── Coordinates ───
const COUNTRY_COORDS: Record<string, [number, number]> = {
    'India': [78.96, 20.59], 'United States': [-95.71, 37.09], 'Brazil': [-51.93, -14.24],
    'United Kingdom': [-1.17, 52.36], 'Germany': [10.45, 51.17], 'France': [2.21, 46.23],
    'Canada': [-106.35, 56.13], 'Australia': [133.78, -25.27], 'Japan': [138.25, 36.20],
    'China': [104.20, 35.86], 'Russia': [105.32, 61.52], 'South Korea': [127.77, 35.91],
    'Indonesia': [113.92, -0.79], 'Mexico': [-102.55, 23.63], 'Italy': [12.57, 41.87],
    'Spain': [-3.70, 40.42], 'Turkey': [35.24, 38.96], 'Netherlands': [5.29, 52.13],
    'Saudi Arabia': [45.08, 23.89], 'Argentina': [-63.62, -38.42],
    'South Africa': [22.94, -30.56], 'Nigeria': [8.68, 9.08], 'Egypt': [30.80, 26.82],
    'Pakistan': [69.35, 30.38], 'Bangladesh': [90.36, 23.69], 'Vietnam': [108.28, 14.06],
    'Thailand': [100.99, 15.87], 'Philippines': [121.77, 12.88], 'Poland': [19.15, 51.92],
    'Ukraine': [31.17, 48.38], 'Colombia': [-74.30, 4.57], 'Malaysia': [101.98, 4.21],
    'Peru': [-75.02, -9.19], 'Chile': [-71.54, -35.68], 'Sweden': [18.64, 60.13],
    'Norway': [8.47, 60.47], 'Finland': [25.75, 61.92], 'Denmark': [9.50, 56.26],
    'Ireland': [-8.24, 53.41], 'Singapore': [103.82, 1.35], 'New Zealand': [174.89, -40.90],
    'Portugal': [-8.22, 40.00], 'Switzerland': [8.23, 46.82], 'Austria': [14.55, 47.52],
    'Belgium': [4.47, 50.50], 'Czech Republic': [15.47, 49.82], 'Romania': [24.97, 45.94],
    'Israel': [34.85, 31.05], 'Kenya': [37.91, -0.02], 'Ghana': [-1.02, 7.95],
    'Morocco': [-7.09, 31.79], 'Taiwan': [120.96, 23.70], 'Hong Kong': [114.17, 22.32],
    'United Arab Emirates': [53.85, 23.42], 'Greece': [21.82, 39.07], 'Hungary': [19.50, 47.16],
};

const CITY_COORDS: Record<string, [number, number]> = {
    'Mumbai': [72.88, 19.08], 'Delhi': [77.10, 28.70], 'Bangalore': [77.59, 12.97],
    'New York': [-74.01, 40.71], 'London': [-0.13, 51.51], 'Paris': [2.35, 48.86],
    'Tokyo': [139.69, 35.69], 'Berlin': [13.41, 52.52], 'Sydney': [151.21, -33.87],
    'Toronto': [-79.38, 43.65], 'São Paulo': [-46.63, -23.55], 'Lagos': [3.38, 6.52],
    'Moscow': [37.62, 55.76], 'Seoul': [126.98, 37.57], 'Singapore': [103.82, 1.35],
    'Dubai': [55.27, 25.20], 'San Francisco': [-122.42, 37.77], 'Los Angeles': [-118.24, 34.05],
    'Chicago': [-87.63, 41.88], 'Houston': [-95.37, 29.76],
};

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

interface WorldMapProps {
    byCountry: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    onBubbleClick?: (name: string, type: 'country' | 'city') => void;
    activeCountry?: string | null;
}

const WorldMap = memo(function WorldMap({ byCountry, byCity, onBubbleClick, activeCountry }: WorldMapProps) {
    const [landPaths, setLandPaths] = useState<string[]>([]);
    const [tooltip, setTooltip] = useState<{ name: string; users: number; x: number; y: number } | null>(null);

    // Fetch real world map on mount
    useEffect(() => {
        let cancel = false;
        fetch(TOPO_URL)
            .then(r => r.json())
            .then(topo => { if (!cancel) setLandPaths(decodeTopo(topo)); })
            .catch(() => {});
        return () => { cancel = true; };
    }, []);

    const bubbles = useMemo(() => {
        const result: { name: string; x: number; y: number; users: number; type: 'country' | 'city' }[] = [];
        if (byCity?.length) {
            byCity.forEach(c => {
                const co = CITY_COORDS[c.city];
                if (co) { const [x, y] = project(co[0], co[1]); result.push({ name: `${c.city}, ${c.country}`, x, y, users: c.users, type: 'city' }); }
            });
        }
        byCountry.forEach(c => {
            const co = COUNTRY_COORDS[c.country];
            if (co) { const [x, y] = project(co[0], co[1]); result.push({ name: c.country, x, y, users: c.users, type: 'country' }); }
        });
        return result;
    }, [byCountry, byCity]);

    const maxUsers = Math.max(...bubbles.map(b => b.users), 1);
    const getR = (u: number) => Math.max(5, Math.min(26, (u / maxUsers) * 26));

    return (
        <div className="relative w-full h-full select-none overflow-hidden">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <rect width={MAP_W} height={MAP_H} fill="var(--card-bg)" />

                {/* Subtle grid */}
                {Array.from({ length: 37 }).map((_, i) => (
                    <line key={`v${i}`} x1={(i * MAP_W) / 36} y1={0} x2={(i * MAP_W) / 36} y2={MAP_H} stroke="rgba(255,255,255,0.02)" strokeWidth={0.3} />
                ))}
                {Array.from({ length: 19 }).map((_, i) => (
                    <line key={`h${i}`} x1={0} y1={(i * MAP_H) / 18} x2={MAP_W} y2={(i * MAP_H) / 18} stroke="rgba(255,255,255,0.02)" strokeWidth={0.3} />
                ))}

                {/* Real landmasses from TopoJSON */}
                {landPaths.map((d, i) => (
                    <path key={i} d={d} fill="#1a1a30" stroke="#2a2a48" strokeWidth={0.4} strokeLinejoin="round" />
                ))}

                {/* Bubbles */}
                {bubbles.map((b, i) => {
                    const r = getR(b.users);
                    const isActive = activeCountry && b.name.includes(activeCountry);
                    const isDimmed = activeCountry && !isActive;
                    const color = isActive ? '#34d399' : '#3b82f6';
                    return (
                        <g key={`${b.name}-${i}`}>
                            <circle cx={b.x} cy={b.y} r={r} fill="none" stroke={color} strokeWidth={0.6}>
                                <animate attributeName="r" values={`${r};${r + 9};${r}`} dur={`${2 + (i % 4) * 0.5}s`} repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.4;0;0.4" dur={`${2 + (i % 4) * 0.5}s`} repeatCount="indefinite" />
                            </circle>
                            <circle cx={b.x} cy={b.y} r={r * 2} fill={color} opacity={isDimmed ? 0.01 : 0.05} />
                            <circle
                                cx={b.x} cy={b.y} r={r}
                                fill={color} fillOpacity={isDimmed ? 0.1 : 0.55}
                                stroke={color} strokeWidth={isDimmed ? 0.4 : 1.2} strokeOpacity={isDimmed ? 0.1 : 0.8}
                                className="cursor-pointer" style={{ transition: 'all 0.3s' }}
                                onClick={() => onBubbleClick?.(b.name.split(',')[0].trim(), b.type)}
                                onMouseEnter={(e) => {
                                    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect();
                                    if (rect) setTooltip({ name: b.name, users: b.users, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            />
                            {b.users > 0 && r >= 9 && (
                                <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                                    fill="white" fontSize={Math.max(8, r * 0.5)} fontWeight="bold"
                                    className="pointer-events-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                    {b.users}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip */}
            <AnimatePresence>
                {tooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute pointer-events-none z-30 bg-[var(--dropdown-bg)] backdrop-blur-sm border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-2xl"
                        style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
                    >
                        <p className="text-xs font-semibold text-white">{tooltip.name}</p>
                        <p className="text-[11px] text-blue-400 tabular-nums">{tooltip.users} active users</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

export default WorldMap;
