'use client';

import React, { useState, useMemo, memo } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Country → approximate lat/lng for bubble placement
const COUNTRY_COORDS: Record<string, [number, number]> = {
    'India': [78.9629, 20.5937], 'United States': [-95.7129, 37.0902], 'Brazil': [-51.9253, -14.2350],
    'United Kingdom': [-1.1743, 52.3555], 'Germany': [10.4515, 51.1657], 'France': [2.2137, 46.2276],
    'Canada': [-106.3468, 56.1304], 'Australia': [133.7751, -25.2744], 'Japan': [138.2529, 36.2048],
    'China': [104.1954, 35.8617], 'Russia': [105.3188, 61.5240], 'South Korea': [127.7669, 35.9078],
    'Indonesia': [113.9213, -0.7893], 'Mexico': [-102.5528, 23.6345], 'Italy': [12.5674, 41.8719],
    'Spain': [-3.7038, 40.4168], 'Turkey': [35.2433, 38.9637], 'Netherlands': [5.2913, 52.1326],
    'Saudi Arabia': [45.0792, 23.8859], 'Argentina': [-63.6167, -38.4161],
    'South Africa': [22.9375, -30.5595], 'Nigeria': [8.6753, 9.0820], 'Egypt': [30.8025, 26.8206],
    'Pakistan': [69.3451, 30.3753], 'Bangladesh': [90.3563, 23.6850], 'Vietnam': [108.2772, 14.0583],
    'Thailand': [100.9925, 15.8700], 'Philippines': [121.7740, 12.8797], 'Poland': [19.1451, 51.9194],
    'Ukraine': [31.1656, 48.3794], 'Colombia': [-74.2973, 4.5709], 'Malaysia': [101.9758, 4.2105],
    'Peru': [-75.0152, -9.1900], 'Chile': [-71.5430, -35.6751], 'Sweden': [18.6435, 60.1282],
    'Norway': [8.4689, 60.4720], 'Finland': [25.7482, 61.9241], 'Denmark': [9.5018, 56.2639],
    'Ireland': [-8.2439, 53.4129], 'Singapore': [103.8198, 1.3521], 'New Zealand': [174.886, -40.9006],
    'Portugal': [-8.2245, 39.3999], 'Switzerland': [8.2275, 46.8182], 'Austria': [14.5501, 47.5162],
    'Belgium': [4.4699, 50.5039], 'Czech Republic': [15.4730, 49.8175], 'Romania': [24.9668, 45.9432],
    'Israel': [34.8516, 31.0461], 'Kenya': [37.9062, -0.0236], 'Ghana': [-1.0232, 7.9465],
    'Morocco': [-7.0926, 31.7917], 'Taiwan': [120.9605, 23.6978], 'Hong Kong': [114.1694, 22.3193],
    'United Arab Emirates': [53.8478, 23.4241], 'Greece': [21.8243, 39.0742], 'Hungary': [19.5033, 47.1625],
};

// City → approximate lat/lng
const CITY_COORDS: Record<string, [number, number]> = {
    'Mumbai': [72.8777, 19.0760], 'Delhi': [77.1025, 28.7041], 'Bangalore': [77.5946, 12.9716],
    'New York': [-74.006, 40.7128], 'London': [-0.1278, 51.5074], 'Paris': [2.3522, 48.8566],
    'Tokyo': [139.6917, 35.6895], 'Berlin': [13.4050, 52.5200], 'Sydney': [151.2093, -33.8688],
    'Toronto': [-79.3832, 43.6532], 'São Paulo': [-46.6333, -23.5505], 'Lagos': [3.3792, 6.5244],
    'Moscow': [37.6173, 55.7558], 'Seoul': [126.9780, 37.5665], 'Singapore': [103.8198, 1.3521],
    'Dubai': [55.2708, 25.2048], 'San Francisco': [-122.4194, 37.7749], 'Los Angeles': [-118.2437, 34.0522],
    'Chicago': [-87.6298, 41.8781], 'Houston': [-95.3698, 29.7604],
};

interface MapBubble {
    name: string;
    coordinates: [number, number];
    users: number;
    type: 'country' | 'city';
}

interface WorldMapProps {
    byCountry: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    onBubbleClick?: (name: string, type: 'country' | 'city') => void;
    activeCountry?: string | null;
}

const WorldMap = memo(function WorldMap({ byCountry, byCity, onBubbleClick, activeCountry }: WorldMapProps) {
    const [tooltip, setTooltip] = useState<{ name: string; users: number; x: number; y: number } | null>(null);

    const bubbles: MapBubble[] = useMemo(() => {
        const result: MapBubble[] = [];

        // City bubbles (if available, prefer these)
        if (byCity && byCity.length > 0) {
            byCity.forEach(c => {
                const coords = CITY_COORDS[c.city];
                if (coords) {
                    result.push({ name: `${c.city}, ${c.country}`, coordinates: coords, users: c.users, type: 'city' });
                }
            });
        }

        // Country bubbles (for countries without city data)
        const citiedCountries = new Set(byCity?.map(c => c.country) || []);
        byCountry.forEach(c => {
            if (!citiedCountries.has(c.country)) {
                const coords = COUNTRY_COORDS[c.country];
                if (coords) {
                    result.push({ name: c.country, coordinates: coords, users: c.users, type: 'country' });
                }
            } else {
                // Also add country bubble but smaller
                const coords = COUNTRY_COORDS[c.country];
                if (coords) {
                    result.push({ name: c.country, coordinates: coords, users: c.users, type: 'country' });
                }
            }
        });

        return result;
    }, [byCountry, byCity]);

    const maxUsers = Math.max(...bubbles.map(b => b.users), 1);

    const getBubbleSize = (users: number) => {
        const ratio = users / maxUsers;
        return Math.max(4, Math.min(28, ratio * 28));
    };

    return (
        <div className="relative w-full h-full select-none">
            <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 130, center: [10, 20] }}
                style={{ width: '100%', height: '100%' }}
            >
                <ZoomableGroup zoom={1} minZoom={1} maxZoom={6}>
                    <Geographies geography={GEO_URL}>
                        {({ geographies }: { geographies: any[] }) =>
                            geographies.map((geo: any) => (
                                <Geography
                                    key={geo.rpiKey || geo.properties?.name}
                                    geography={geo}
                                    fill="#1a1a2e"
                                    stroke="#252540"
                                    strokeWidth={0.5}
                                    style={{
                                        default: { outline: 'none' },
                                        hover: { fill: '#252545', outline: 'none' },
                                        pressed: { outline: 'none' },
                                    }}
                                />
                            ))
                        }
                    </Geographies>

                    {/* Bubbles */}
                    {bubbles.map((bubble, i) => {
                        const size = getBubbleSize(bubble.users);
                        const isActive = activeCountry && bubble.name.includes(activeCountry);
                        const isDimmed = activeCountry && !isActive;

                        return (
                            <Marker key={`${bubble.name}-${i}`} coordinates={bubble.coordinates}>
                                {/* Pulse ring */}
                                <circle
                                    r={size + 4}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth={1}
                                    opacity={0.3}
                                    className="animate-ping"
                                    style={{ animationDuration: `${2 + i * 0.3}s` }}
                                />
                                {/* Main bubble */}
                                <circle
                                    r={size}
                                    fill={isActive ? '#34d399' : '#3b82f6'}
                                    fillOpacity={isDimmed ? 0.15 : 0.6}
                                    stroke={isActive ? '#34d399' : '#60a5fa'}
                                    strokeWidth={1.5}
                                    strokeOpacity={isDimmed ? 0.1 : 0.8}
                                    className="cursor-pointer transition-all duration-300"
                                    onClick={() => onBubbleClick?.(bubble.name.split(',')[0].trim(), bubble.type)}
                                    onMouseEnter={(e) => {
                                        const rect = (e.target as SVGCircleElement).closest('svg')?.getBoundingClientRect();
                                        if (rect) {
                                            setTooltip({
                                                name: bubble.name,
                                                users: bubble.users,
                                                x: e.clientX - rect.left,
                                                y: e.clientY - rect.top,
                                            });
                                        }
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                />
                                {/* Number label */}
                                {bubble.users > 1 && size >= 10 && (
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill="white"
                                        fontSize={Math.max(8, size * 0.5)}
                                        fontWeight="bold"
                                        className="pointer-events-none select-none"
                                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                                    >
                                        {bubble.users}
                                    </text>
                                )}
                            </Marker>
                        );
                    })}
                </ZoomableGroup>
            </ComposableMap>

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
