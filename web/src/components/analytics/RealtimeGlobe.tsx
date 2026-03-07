'use client';

import { useRef, useEffect, useCallback, memo, useState } from 'react';
import createGlobe from 'cobe';

// ─── Coordinates for countries (lat, lng) ───
export const COUNTRY_COORDS: Record<string, [number, number]> = {
    'India': [20.59, 78.96], 'United States': [37.09, -95.71], 'Brazil': [-14.24, -51.93],
    'United Kingdom': [52.36, -1.17], 'Germany': [51.17, 10.45], 'France': [46.23, 2.21],
    'Canada': [56.13, -106.35], 'Australia': [-25.27, 133.78], 'Japan': [36.20, 138.25],
    'China': [35.86, 104.20], 'Russia': [61.52, 105.32], 'South Korea': [35.91, 127.77],
    'Indonesia': [-0.79, 113.92], 'Mexico': [23.63, -102.55], 'Italy': [41.87, 12.57],
    'Spain': [40.42, -3.70], 'Turkey': [38.96, 35.24], 'Netherlands': [52.13, 5.29],
    'Saudi Arabia': [23.89, 45.08], 'Argentina': [-38.42, -63.62],
    'South Africa': [-30.56, 22.94], 'Nigeria': [9.08, 8.68], 'Egypt': [26.82, 30.80],
    'Pakistan': [30.38, 69.35], 'Bangladesh': [23.69, 90.36], 'Vietnam': [14.06, 108.28],
    'Thailand': [15.87, 100.99], 'Philippines': [12.88, 121.77], 'Poland': [51.92, 19.15],
    'Ukraine': [48.38, 31.17], 'Colombia': [4.57, -74.30], 'Malaysia': [4.21, 101.98],
    'Peru': [-9.19, -75.02], 'Chile': [-35.68, -71.54], 'Sweden': [60.13, 18.64],
    'Norway': [60.47, 8.47], 'Finland': [61.92, 25.75], 'Denmark': [56.26, 9.50],
    'Ireland': [53.41, -8.24], 'Singapore': [1.35, 103.82], 'New Zealand': [-40.90, 174.89],
    'Portugal': [40.00, -8.22], 'Switzerland': [46.82, 8.23], 'Austria': [47.52, 14.55],
    'Belgium': [50.50, 4.47], 'Czech Republic': [49.82, 15.47], 'Romania': [45.94, 24.97],
    'Israel': [31.05, 34.85], 'Kenya': [-0.02, 37.91], 'Ghana': [7.95, -1.02],
    'Morocco': [31.79, -7.09], 'Taiwan': [23.70, 120.96], 'Hong Kong': [22.32, 114.17],
    'United Arab Emirates': [23.42, 53.85], 'Greece': [39.07, 21.82], 'Hungary': [47.16, 19.50],
};

export const CITY_COORDS: Record<string, [number, number]> = {
    'Mumbai': [19.08, 72.88], 'Delhi': [28.70, 77.10], 'Bangalore': [12.97, 77.59],
    'New York': [40.71, -74.01], 'London': [51.51, -0.13], 'Paris': [48.86, 2.35],
    'Tokyo': [35.69, 139.69], 'Berlin': [52.52, 13.41], 'Sydney': [-33.87, 151.21],
    'Toronto': [43.65, -79.38], 'São Paulo': [-23.55, -46.63], 'Lagos': [6.52, 3.38],
    'Moscow': [55.76, 37.62], 'Seoul': [37.57, 126.98], 'Singapore': [1.35, 103.82],
    'Dubai': [25.20, 55.27], 'San Francisco': [37.77, -122.42], 'Los Angeles': [34.05, -118.24],
    'Chicago': [41.88, -87.63], 'Houston': [29.76, -95.37],
    'Hyderabad': [17.39, 78.49], 'Chennai': [13.08, 80.27], 'Kolkata': [22.57, 88.36],
    'Pune': [18.52, 73.86], 'Shanghai': [31.23, 121.47], 'Beijing': [39.90, 116.40],
    'Shenzhen': [22.54, 114.06], 'Bangkok': [13.76, 100.50], 'Jakarta': [-6.21, 106.85],
    'Manila': [14.60, 120.98], 'Kuala Lumpur': [3.14, 101.69], 'Istanbul': [41.01, 28.98],
    'Cairo': [30.04, 31.24], 'Nairobi': [-1.29, 36.82], 'Johannesburg': [-26.20, 28.05],
    'Mexico City': [19.43, -99.13], 'Buenos Aires': [-34.60, -58.38], 'Lima': [-12.05, -77.04],
    'Bogotá': [4.71, -74.07], 'Amsterdam': [52.37, 4.90], 'Madrid': [40.42, -3.70],
    'Rome': [41.90, 12.50], 'Lisbon': [38.72, -9.14], 'Warsaw': [52.23, 21.01],
};

// ─── Latitude/Longitude → screen position (for avatar overlay) ───
function latLngToScreen(
    lat: number, lng: number,
    phi: number, theta: number,
    size: number, centerX: number, centerY: number
): { x: number; y: number; visible: boolean } {
    const latR = (lat * Math.PI) / 180;
    const lngR = (lng * Math.PI) / 180;

    // Spherical to cartesian
    const x = Math.cos(latR) * Math.sin(lngR + phi);
    const y = Math.sin(latR) * Math.cos(theta) - Math.cos(latR) * Math.sin(theta) * Math.cos(lngR + phi);
    const z = Math.sin(latR) * Math.sin(theta) + Math.cos(latR) * Math.cos(theta) * Math.cos(lngR + phi);

    // Only visible if on the front side
    const visible = z > 0.1;
    const radius = size * 0.42;

    return {
        x: centerX + x * radius,
        y: centerY - y * radius,
        visible,
    };
}

export interface GlobeVisitor {
    lat: number;
    lng: number;
    name: string;
    country: string;
    avatarColor: string;
    avatarInitial: string;
    warmth: number; // 0-1, purchase prediction warmth
    users: number;
}

interface RealtimeGlobeProps {
    byCountry: { country: string; users: number }[];
    byCity?: { city: string; country: string; users: number }[];
    visitors?: GlobeVisitor[];
}

const RealtimeGlobe = memo(function RealtimeGlobe({ byCountry, byCity, visitors = [] }: RealtimeGlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerInteracting = useRef<number | null>(null);
    const pointerInteractionMovement = useRef(0);
    const widthRef = useRef(0);
    const markersRef = useRef<{ location: [number, number]; size: number }[]>([]);
    const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
    const phiRef = useRef(0);
    const [avatarPositions, setAvatarPositions] = useState<Array<{ x: number; y: number; visible: boolean; visitor: GlobeVisitor }>>([]);

    const buildMarkers = useCallback(() => {
        const markers: { location: [number, number]; size: number }[] = [];
        const maxUsers = Math.max(
            ...byCountry.map(c => c.users),
            ...(byCity || []).map(c => c.users),
            1
        );

        if (byCity?.length) {
            byCity.forEach(c => {
                const coord = CITY_COORDS[c.city];
                if (coord) {
                    markers.push({
                        location: coord,
                        size: Math.max(0.04, (c.users / maxUsers) * 0.3),
                    });
                }
            });
        }

        byCountry.forEach(c => {
            const coord = COUNTRY_COORDS[c.country];
            if (coord) {
                const hasCity = byCity?.some(city => city.country === c.country && CITY_COORDS[city.city]);
                if (!hasCity) {
                    markers.push({
                        location: coord,
                        size: Math.max(0.05, (c.users / maxUsers) * 0.35),
                    });
                }
            }
        });

        markersRef.current = markers;
        return markers;
    }, [byCountry, byCity]);

    useEffect(() => {
        let currentPhi = 0;
        const markers = buildMarkers();

        if (!canvasRef.current) return;

        const onResize = () => {
            if (canvasRef.current) {
                widthRef.current = canvasRef.current.offsetWidth;
            }
        };
        window.addEventListener('resize', onResize);
        onResize();

        globeRef.current = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: widthRef.current * 2,
            height: widthRef.current * 2,
            phi: 0,
            theta: 0.15,
            dark: 1,
            diffuse: 3,
            mapSamples: 36000,
            mapBrightness: 4,
            baseColor: [0.12, 0.12, 0.2],
            markerColor: [1, 0.3, 0.3],
            glowColor: [0.05, 0.05, 0.12],
            markers,
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    currentPhi += 0.002;
                }
                const totalPhi = currentPhi + pointerInteractionMovement.current;
                state.phi = totalPhi;
                state.width = widthRef.current * 2;
                state.height = widthRef.current * 2;
                state.markers = markersRef.current;
                phiRef.current = totalPhi;

                // Update avatar positions relative to globe rotation
                if (visitors.length > 0 && containerRef.current) {
                    const w = containerRef.current.offsetWidth;
                    const h = containerRef.current.offsetHeight;
                    const size = Math.min(w, h);
                    const cx = w / 2;
                    const cy = h / 2;

                    const positions = visitors.map(v => {
                        const pos = latLngToScreen(v.lat, v.lng, totalPhi, 0.15, size, cx, cy);
                        return { ...pos, visitor: v };
                    });
                    setAvatarPositions(positions);
                }
            },
        });

        return () => {
            globeRef.current?.destroy();
            window.removeEventListener('resize', onResize);
        };
    }, [buildMarkers, visitors]);

    useEffect(() => {
        buildMarkers();
    }, [buildMarkers]);

    // Warmth color: cold (blue) → warm (red/orange)
    const getWarmthColor = (warmth: number) => {
        if (warmth > 0.7) return '#ef4444'; // hot red
        if (warmth > 0.5) return '#f97316'; // orange
        if (warmth > 0.3) return '#eab308'; // yellow
        return '#3b82f6'; // cold blue
    };

    const getWarmthBorder = (warmth: number) => {
        if (warmth > 0.7) return 'ring-red-500/50';
        if (warmth > 0.5) return 'ring-orange-500/50';
        if (warmth > 0.3) return 'ring-yellow-500/50';
        return 'ring-blue-500/50';
    };

    return (
        <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
            <canvas
                ref={canvasRef}
                className="w-full h-full aspect-square cursor-grab active:cursor-grabbing"
                style={{ maxWidth: '850px', maxHeight: '850px' }}
                onPointerDown={(e) => {
                    pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
                    (e.target as HTMLElement).style.cursor = 'grabbing';
                }}
                onPointerUp={(e) => {
                    pointerInteracting.current = null;
                    (e.target as HTMLElement).style.cursor = 'grab';
                }}
                onPointerOut={(e) => {
                    pointerInteracting.current = null;
                    (e.target as HTMLElement).style.cursor = 'grab';
                }}
                onMouseMove={(e) => {
                    if (pointerInteracting.current !== null) {
                        const delta = e.clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta / 200;
                    }
                }}
                onTouchMove={(e) => {
                    if (pointerInteracting.current !== null && e.touches[0]) {
                        const delta = e.touches[0].clientX - pointerInteracting.current;
                        pointerInteractionMovement.current = delta / 200;
                    }
                }}
            />

            {/* ─── Avatar Pins Overlay ─── */}
            {avatarPositions.map((pos, i) => (
                pos.visible && (
                    <div
                        key={`avatar-${i}`}
                        className="absolute pointer-events-none transition-all duration-100"
                        style={{
                            left: `${pos.x}px`,
                            top: `${pos.y}px`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                        }}
                    >
                        {/* Pulse ring */}
                        <div
                            className="absolute inset-0 rounded-full animate-ping"
                            style={{
                                backgroundColor: getWarmthColor(pos.visitor.warmth),
                                opacity: 0.3,
                                width: '40px',
                                height: '40px',
                                marginLeft: '-8px',
                                marginTop: '-8px',
                            }}
                        />
                        {/* Red dot indicator */}
                        <div
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#0c1220] z-10"
                            style={{ backgroundColor: getWarmthColor(pos.visitor.warmth) }}
                        />
                        {/* Avatar circle */}
                        <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ${getWarmthBorder(pos.visitor.warmth)} shadow-lg`}
                            style={{ backgroundColor: pos.visitor.avatarColor }}
                        >
                            {pos.visitor.avatarInitial}
                        </div>
                    </div>
                )
            ))}
        </div>
    );
});

export default RealtimeGlobe;
