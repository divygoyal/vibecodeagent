'use client';

import React, { memo, useMemo, useState } from 'react';

const MAP_W = 960;
const MAP_H = 500;
const LON_MIN = -170;
const LON_MAX = 190;
const LAT_MIN = -58;
const LAT_MAX = 82;
const LAT_MIN_R = (LAT_MIN * Math.PI) / 180;
const MERC_MIN = Math.log(Math.tan(Math.PI / 4 + LAT_MIN_R / 2));
const LAT_MAX_R = (LAT_MAX * Math.PI) / 180;
const MERC_MAX = Math.log(Math.tan(Math.PI / 4 + LAT_MAX_R / 2));

const LANDMASSES = [
    'M88 124L142 78L194 66L228 88L240 126L224 154L194 168L174 210L140 236L102 226L76 188L78 152Z',
    'M258 74L312 54L346 68L338 102L298 118L264 102Z',
    'M220 252L260 282L278 340L260 396L234 452L210 426L200 372L182 320L192 274Z',
    'M372 114L422 86L484 82L544 98L616 90L694 104L774 138L840 178L872 220L848 254L790 256L730 284L676 270L642 236L598 218L556 226L512 212L470 220L442 188L406 176L382 150Z',
    'M470 236L514 248L548 286L560 338L540 394L506 418L474 388L450 344L444 288Z',
    'M738 356L786 344L832 366L846 404L822 432L772 438L738 414L726 382Z',
];

function project(lon: number, lat: number): [number, number] {
    const safeLat = Math.max(LAT_MIN, Math.min(LAT_MAX, lat));
    const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W;
    const latR = (safeLat * Math.PI) / 180;
    const merc = Math.log(Math.tan(Math.PI / 4 + latR / 2));
    const y = MAP_H - ((merc - MERC_MIN) / (MERC_MAX - MERC_MIN)) * MAP_H;
    return [x, y];
}

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
    'Toronto': [-79.38, 43.65], 'Sao Paulo': [-46.63, -23.55], 'São Paulo': [-46.63, -23.55], 'Lagos': [3.38, 6.52],
    'Moscow': [37.62, 55.76], 'Seoul': [126.98, 37.57], 'Singapore': [103.82, 1.35],
    'Dubai': [55.27, 25.20], 'San Francisco': [-122.42, 37.77], 'Los Angeles': [-118.24, 34.05],
    'Chicago': [-87.63, 41.88], 'Houston': [-95.37, 29.76],
};

interface WorldMapProps {
    byCountry: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    onBubbleClick?: (name: string, type: 'country' | 'city') => void;
    activeCountry?: string | null;
}

const WorldMap = memo(function WorldMap({ byCountry, byCity, onBubbleClick, activeCountry }: WorldMapProps) {
    const [tooltip, setTooltip] = useState<{ name: string; users: number; x: number; y: number } | null>(null);

    const bubbles = useMemo(() => {
        const next: { name: string; x: number; y: number; users: number; type: 'country' | 'city' }[] = [];

        byCountry.forEach((country) => {
            const point = COUNTRY_COORDS[country.country];
            if (!point) return;
            const [x, y] = project(point[0], point[1]);
            next.push({ name: country.country, x, y, users: country.users, type: 'country' });
        });

        byCity?.forEach((city) => {
            const point = CITY_COORDS[city.city];
            if (!point) return;
            const [x, y] = project(point[0], point[1]);
            next.push({ name: `${city.city}, ${city.country}`, x, y, users: city.users, type: 'city' });
        });

        return next.sort((a, b) => a.users - b.users);
    }, [byCountry, byCity]);

    const maxUsers = Math.max(...bubbles.map((bubble) => bubble.users), 1);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-[#07090f]">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="map-ocean" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0b0f17" />
                        <stop offset="100%" stopColor="#06080d" />
                    </linearGradient>
                    <radialGradient id="map-glow" cx="52%" cy="18%" r="72%">
                        <stop offset="0%" stopColor="rgba(73,224,183,0.16)" />
                        <stop offset="45%" stopColor="rgba(73,224,183,0.05)" />
                        <stop offset="100%" stopColor="rgba(73,224,183,0)" />
                    </radialGradient>
                </defs>

                <rect width={MAP_W} height={MAP_H} fill="url(#map-ocean)" />
                <rect width={MAP_W} height={MAP_H} fill="url(#map-glow)" opacity="0.8" />

                {Array.from({ length: 9 }).map((_, index) => (
                    <line
                        key={`lat-${index}`}
                        x1={0}
                        x2={MAP_W}
                        y1={(index * MAP_H) / 8}
                        y2={(index * MAP_H) / 8}
                        stroke="rgba(255,255,255,0.03)"
                        strokeDasharray="3 10"
                        strokeWidth="0.6"
                    />
                ))}

                {Array.from({ length: 13 }).map((_, index) => (
                    <line
                        key={`lng-${index}`}
                        x1={(index * MAP_W) / 12}
                        x2={(index * MAP_W) / 12}
                        y1={0}
                        y2={MAP_H}
                        stroke="rgba(255,255,255,0.025)"
                        strokeDasharray="3 12"
                        strokeWidth="0.6"
                    />
                ))}

                {LANDMASSES.map((path, index) => (
                    <path
                        key={path}
                        d={path}
                        fill={index === 3 ? '#111824' : '#0d131d'}
                        stroke="rgba(130,146,176,0.16)"
                        strokeWidth="1"
                    />
                ))}

                {bubbles.map((bubble, index) => {
                    const radius = Math.max(4.5, Math.min(18, (bubble.users / maxUsers) * 16));
                    const isActive = activeCountry && bubble.name.includes(activeCountry);
                    const dimmed = activeCountry && !isActive;
                    const fill = isActive ? '#49e0b7' : bubble.type === 'city' ? '#7ea4ff' : '#4ad5ff';
                    const haloOpacity = dimmed ? 0.04 : isActive ? 0.28 : 0.12;

                    return (
                        <g key={`${bubble.name}-${index}`} opacity={dimmed ? 0.35 : 1}>
                            <circle cx={bubble.x} cy={bubble.y} r={radius * 1.9} fill={fill} opacity={haloOpacity} />
                            <circle
                                cx={bubble.x}
                                cy={bubble.y}
                                r={radius}
                                fill={fill}
                                stroke={isActive ? '#d7fff4' : 'rgba(255,255,255,0.7)'}
                                strokeWidth={isActive ? 1.4 : 0.8}
                                className="cursor-pointer transition-all duration-150"
                                onClick={() => onBubbleClick?.(bubble.name.split(',')[0].trim(), bubble.type)}
                                onMouseEnter={(event) => {
                                    const rect = (event.target as SVGElement).closest('svg')?.getBoundingClientRect();
                                    if (!rect) return;
                                    setTooltip({
                                        name: bubble.name,
                                        users: bubble.users,
                                        x: event.clientX - rect.left,
                                        y: event.clientY - rect.top,
                                    });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            />
                        </g>
                    );
                })}
            </svg>

            {tooltip && (
                <div
                    className="pointer-events-none absolute z-20 rounded-2xl border border-white/[0.08] bg-[#0a0d13]/95 px-3 py-2 shadow-2xl"
                    style={{
                        left: tooltip.x > 320 ? tooltip.x - 14 : tooltip.x + 14,
                        top: Math.max(tooltip.y - 14, 16),
                        transform: tooltip.x > 320 ? 'translateX(-100%)' : undefined,
                    }}
                >
                    <p className="text-xs font-semibold text-white">{tooltip.name}</p>
                    <p className="mt-1 text-[11px] tabular-nums text-[var(--analytics-cyan)]">{tooltip.users.toLocaleString()} active users</p>
                </div>
            )}
        </div>
    );
});

export default WorldMap;
