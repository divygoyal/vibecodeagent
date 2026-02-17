'use client';

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Mercator projection helpers (pure math, no library)
function lngToX(lng: number, width: number): number {
    return ((lng + 180) / 360) * width;
}
function latToY(lat: number, height: number): number {
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return (height / 2) - (height * mercN) / (2 * Math.PI);
}

// Country → approximate lat/lng for bubble placement
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

// Minimal world landmass outline (simplified, ~50 points per continent shape)
// This is a very simplified world outline for the dark map background
const WORLD_PATH = 'M186,114l2,-3l4,-1l3,2l1,4l-2,3l-4,1l-3,-2zM124,96l12,-8l8,2l6,8l-1,9l-7,6l-10,1l-7,-4l-3,-8zM280,68l20,-5l15,7l8,15l-3,14l-12,9l-16,1l-12,-7l-5,-13zM350,95l8,-2l12,4l6,10l-1,8l-8,5l-10,-1l-7,-6l-3,-9zM440,110l15,-8l20,3l12,12l-2,15l-14,10l-18,0l-12,-10l-4,-14zM500,60l30,-15l25,5l15,20l-5,22l-20,12l-28,0l-18,-15l-4,-20z';

interface WorldMapProps {
    byCountry: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    onBubbleClick?: (name: string, type: 'country' | 'city') => void;
    activeCountry?: string | null;
}

const MAP_W = 900;
const MAP_H = 500;

const WorldMap = memo(function WorldMap({ byCountry, byCity, onBubbleClick, activeCountry }: WorldMapProps) {
    const [tooltip, setTooltip] = useState<{ name: string; users: number; x: number; y: number } | null>(null);

    const bubbles = useMemo(() => {
        const result: { name: string; x: number; y: number; users: number; type: 'country' | 'city' }[] = [];

        // City bubbles
        if (byCity && byCity.length > 0) {
            byCity.forEach(c => {
                const coords = CITY_COORDS[c.city];
                if (coords) {
                    result.push({
                        name: `${c.city}, ${c.country}`,
                        x: lngToX(coords[0], MAP_W),
                        y: latToY(coords[1], MAP_H),
                        users: c.users,
                        type: 'city',
                    });
                }
            });
        }

        // Country bubbles
        byCountry.forEach(c => {
            const coords = COUNTRY_COORDS[c.country];
            if (coords) {
                result.push({
                    name: c.country,
                    x: lngToX(coords[0], MAP_W),
                    y: latToY(coords[1], MAP_H),
                    users: c.users,
                    type: 'country',
                });
            }
        });

        return result;
    }, [byCountry, byCity]);

    const maxUsers = Math.max(...bubbles.map(b => b.users), 1);
    const getR = (users: number) => Math.max(4, Math.min(22, (users / maxUsers) * 22));

    return (
        <div className="relative w-full h-full select-none overflow-hidden">
            <svg
                viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                className="w-full h-full"
                style={{ background: 'transparent' }}
            >
                {/* Grid lines */}
                {Array.from({ length: 19 }).map((_, i) => {
                    const x = (i * MAP_W) / 18;
                    return <line key={`v${i}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />;
                })}
                {Array.from({ length: 10 }).map((_, i) => {
                    const y = (i * MAP_H) / 9;
                    return <line key={`h${i}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />;
                })}

                {/* Simplified continent shapes as rectangles for visual structure */}
                {/* North America */}
                <ellipse cx={lngToX(-100, MAP_W)} cy={latToY(45, MAP_H)} rx={80} ry={55} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />
                {/* South America */}
                <ellipse cx={lngToX(-58, MAP_W)} cy={latToY(-15, MAP_H)} rx={40} ry={60} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />
                {/* Europe */}
                <ellipse cx={lngToX(15, MAP_W)} cy={latToY(50, MAP_H)} rx={45} ry={30} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />
                {/* Africa */}
                <ellipse cx={lngToX(20, MAP_W)} cy={latToY(5, MAP_H)} rx={40} ry={55} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />
                {/* Asia */}
                <ellipse cx={lngToX(90, MAP_W)} cy={latToY(40, MAP_H)} rx={80} ry={45} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />
                {/* Oceania */}
                <ellipse cx={lngToX(135, MAP_W)} cy={latToY(-25, MAP_H)} rx={35} ry={25} fill="#151525" stroke="#1e1e35" strokeWidth={0.5} opacity={0.8} />

                {/* Bubbles */}
                {bubbles.map((b, i) => {
                    const r = getR(b.users);
                    const isActive = activeCountry && b.name.includes(activeCountry);
                    const isDimmed = activeCountry && !isActive;
                    const color = isActive ? '#34d399' : '#3b82f6';

                    return (
                        <g key={`${b.name}-${i}`}>
                            {/* Pulse ring */}
                            <circle cx={b.x} cy={b.y} r={r + 5} fill="none" stroke={color} strokeWidth={0.8} opacity={0.25}>
                                <animate attributeName="r" values={`${r + 2};${r + 10};${r + 2}`} dur={`${2 + (i % 5) * 0.4}s`} repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.3;0.05;0.3" dur={`${2 + (i % 5) * 0.4}s`} repeatCount="indefinite" />
                            </circle>
                            {/* Glow */}
                            <circle cx={b.x} cy={b.y} r={r * 1.8} fill={color} opacity={isDimmed ? 0.02 : 0.06} />
                            {/* Main bubble */}
                            <circle
                                cx={b.x} cy={b.y} r={r}
                                fill={color}
                                fillOpacity={isDimmed ? 0.12 : 0.55}
                                stroke={color}
                                strokeWidth={1.2}
                                strokeOpacity={isDimmed ? 0.08 : 0.7}
                                className="cursor-pointer"
                                style={{ transition: 'all 0.3s ease' }}
                                onClick={() => onBubbleClick?.(b.name.split(',')[0].trim(), b.type)}
                                onMouseEnter={(e) => {
                                    const svg = (e.target as SVGCircleElement).closest('svg');
                                    const rect = svg?.getBoundingClientRect();
                                    if (rect) {
                                        setTooltip({ name: b.name, users: b.users, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                    }
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            />
                            {/* Number label */}
                            {b.users > 1 && r >= 8 && (
                                <text
                                    x={b.x} y={b.y}
                                    textAnchor="middle" dominantBaseline="central"
                                    fill="white" fontSize={Math.max(7, r * 0.55)} fontWeight="bold"
                                    className="pointer-events-none select-none"
                                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                                >
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
                        className="absolute pointer-events-none z-30 bg-[#0a0a14] border border-white/[0.12] rounded-xl px-3 py-2 shadow-2xl"
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
