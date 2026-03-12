'use client';

import { useRef, useEffect, useCallback, memo, useState } from 'react';
import createGlobe from 'cobe';

// ─── DiceBear avatar URL generator ───
function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

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
    'Cambodia': [12.57, 104.99], 'Myanmar': [19.76, 96.08], 'Laos': [19.86, 102.50],
    'Sri Lanka': [7.87, 80.77], 'Nepal': [28.39, 84.12], 'Afghanistan': [33.94, 67.71],
    'Iraq': [33.22, 43.68], 'Iran': [32.43, 53.69], 'Jordan': [30.59, 36.24],
    'Lebanon': [33.85, 35.86], 'Kuwait': [29.31, 47.48], 'Qatar': [25.35, 51.18],
    'Bahrain': [26.07, 50.56], 'Oman': [21.47, 55.98], 'Yemen': [15.55, 48.52],
    'Ethiopia': [9.15, 40.49], 'Tanzania': [-6.37, 34.89], 'Uganda': [1.37, 32.29],
    'Rwanda': [-1.94, 29.87], 'Senegal': [14.50, -14.45], 'Cameroon': [7.37, 12.35],
    'Algeria': [28.03, 1.66], 'Tunisia': [33.89, 9.54], 'Libya': [26.34, 17.23],
    'Sudan': [12.86, 30.22], 'Congo': [-0.23, 15.83],
    'Democratic Republic of the Congo': [-4.04, 21.76],
    'Angola': [-11.20, 17.87], 'Zambia': [-13.13, 27.85], 'Zimbabwe': [-19.02, 29.15],
    'Mozambique': [-18.67, 35.53], 'Madagascar': [-18.77, 46.87],
    'Ivory Coast': [7.54, -5.55], 'Côte d\'Ivoire': [7.54, -5.55],
    'Mali': [17.57, -4.00], 'Burkina Faso': [12.24, -1.56],
    'Niger': [17.61, 8.08], 'Chad': [15.45, 18.73],
    'Botswana': [-22.33, 24.68], 'Namibia': [-22.96, 18.49],
    'Belarus': [53.71, 27.95], 'Lithuania': [55.17, 23.88], 'Latvia': [56.88, 24.60],
    'Estonia': [58.60, 25.01], 'Bulgaria': [42.73, 25.49], 'Serbia': [44.02, 21.01],
    'Croatia': [45.10, 15.20], 'Slovakia': [48.67, 19.70], 'Slovenia': [46.15, 14.99],
    'Bosnia and Herzegovina': [43.92, 17.68], 'Albania': [41.15, 20.17],
    'North Macedonia': [41.51, 21.75], 'Moldova': [47.41, 28.37], 'Montenegro': [42.71, 19.37],
    'Kosovo': [42.60, 20.90], 'Luxembourg': [49.82, 6.13], 'Iceland': [64.96, -19.02],
    'Malta': [35.94, 14.38], 'Cyprus': [35.13, 33.43],
    'Georgia': [42.32, 43.36], 'Armenia': [40.07, 45.04], 'Azerbaijan': [40.14, 47.58],
    'Kazakhstan': [48.02, 66.92], 'Uzbekistan': [41.38, 64.59],
    'Turkmenistan': [38.97, 59.56], 'Kyrgyzstan': [41.20, 74.77], 'Tajikistan': [38.86, 71.28],
    'Mongolia': [46.86, 103.85], 'North Korea': [40.34, 127.51],
    'Costa Rica': [9.75, -83.75], 'Panama': [8.54, -80.78], 'Cuba': [21.52, -77.78],
    'Jamaica': [18.11, -77.30], 'Haiti': [18.97, -72.29],
    'Dominican Republic': [18.74, -70.16], 'Puerto Rico': [18.22, -66.59],
    'Trinidad and Tobago': [10.69, -61.22], 'Guatemala': [15.78, -90.23],
    'Honduras': [15.20, -86.24], 'El Salvador': [13.79, -88.90],
    'Nicaragua': [12.87, -85.21], 'Ecuador': [-1.83, -78.18],
    'Bolivia': [-16.29, -63.59], 'Paraguay': [-23.44, -58.44], 'Uruguay': [-32.52, -55.77],
    'Venezuela': [6.42, -66.59], 'Guyana': [4.86, -58.93], 'Suriname': [3.92, -56.03],
    'Fiji': [-17.71, 178.07], 'Papua New Guinea': [-6.31, 143.96],
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
    'Ho Chi Minh City': [10.82, 106.63], 'Hanoi': [21.03, 105.85], 'Da Nang': [16.05, 108.22],
    'Phnom Penh': [11.56, 104.92], 'Siem Reap': [13.36, 103.86],
    'Minsk': [53.90, 27.57], 'Kyiv': [50.45, 30.52], 'Prague': [50.08, 14.44],
    'Budapest': [47.50, 19.04], 'Vienna': [48.21, 16.37], 'Zurich': [47.38, 8.54],
    'Dublin': [53.35, -6.26], 'Copenhagen': [55.68, 12.57], 'Stockholm': [59.33, 18.07],
    'Helsinki': [60.17, 24.94], 'Oslo': [59.91, 10.75], 'Brussels': [50.85, 4.35],
    'Barcelona': [41.39, 2.17], 'Milan': [45.46, 9.19], 'Munich': [48.14, 11.58],
    'Bucharest': [44.43, 26.10], 'Athens': [37.98, 23.73], 'Sofia': [42.70, 23.32],
    'Belgrade': [44.79, 20.45], 'Zagreb': [45.81, 15.98], 'Bratislava': [48.15, 17.11],
    'Taipei': [25.03, 121.57], 'Osaka': [34.69, 135.50], 'Yokohama': [35.44, 139.64],
    'Melbourne': [-37.81, 144.96], 'Auckland': [-36.85, 174.76], 'Perth': [-31.95, 115.86],
    'Vancouver': [49.28, -123.12], 'Montreal': [45.50, -73.57], 'Ottawa': [45.42, -75.70],
    'Washington': [38.91, -77.04], 'Boston': [42.36, -71.06], 'Seattle': [47.61, -122.33],
    'Denver': [39.74, -104.99], 'Atlanta': [33.75, -84.39], 'Miami': [25.76, -80.19],
    'Dallas': [32.78, -96.80], 'Phoenix': [33.45, -112.07], 'Philadelphia': [39.95, -75.17],
    'San Diego': [32.72, -117.16], 'Austin': [30.27, -97.74], 'Portland': [45.52, -122.68],
    'Minneapolis': [44.98, -93.27], 'Detroit': [42.33, -83.05], 'Charlotte': [35.23, -80.84],
    'Nashville': [36.16, -86.78], 'Columbus': [39.96, -83.00], 'Indianapolis': [39.77, -86.16],
    'San Jose': [37.34, -121.89], 'Raleigh': [35.78, -78.64],
    'Riyadh': [24.71, 46.67], 'Jeddah': [21.49, 39.19], 'Doha': [25.29, 51.53],
    'Abu Dhabi': [24.45, 54.65], 'Casablanca': [33.57, -7.59], 'Cape Town': [-33.93, 18.42],
    'Accra': [5.56, -0.19], 'Addis Ababa': [9.02, 38.75], 'Dar es Salaam': [-6.79, 39.28],
    'Kampala': [0.35, 32.58], 'Lusaka': [-15.39, 28.32],
    'Tbilisi': [41.72, 44.79], 'Yerevan': [40.18, 44.51], 'Baku': [40.41, 49.87],
    'Almaty': [43.24, 76.95], 'Tashkent': [41.30, 69.24],
    'Colombo': [6.93, 79.85], 'Kathmandu': [27.72, 85.32], 'Dhaka': [23.81, 90.41],
    'Lahore': [31.55, 74.35], 'Karachi': [24.86, 67.01], 'Islamabad': [33.69, 73.04],
    'Tehran': [35.69, 51.39], 'Baghdad': [33.31, 44.37], 'Amman': [31.95, 35.93],
    'Beirut': [33.89, 35.50], 'Tel Aviv': [32.09, 34.77],
    'Rio de Janeiro': [-22.91, -43.17], 'Bogota': [4.71, -74.07], 'Santiago': [-33.45, -70.67],
    'Quito': [-0.18, -78.47], 'Havana': [23.11, -82.37], 'San Juan': [18.47, -66.11],
    'Guangzhou': [23.13, 113.26], 'Chengdu': [30.57, 104.07], 'Hangzhou': [30.27, 120.15],
    'Nanjing': [32.06, 118.80], 'Wuhan': [30.59, 114.31], 'Xi\'an': [34.26, 108.94],
    'Surabaya': [-7.25, 112.75], 'Bandung': [-6.91, 107.61], 'Cebu City': [10.32, 123.89],
    'Davao City': [7.07, 125.61],
};

// ─── Latitude/Longitude → screen position (for avatar overlay) ───
function latLngToScreen(
    lat: number, lng: number,
    phi: number, theta: number,
    size: number, centerX: number, centerY: number
): { x: number; y: number; visible: boolean } {
    const latR = (lat * Math.PI) / 180;
    const lngR = (lng * Math.PI) / 180;

    const x = Math.cos(latR) * Math.sin(lngR + phi);
    const y = Math.sin(latR) * Math.cos(theta) - Math.cos(latR) * Math.sin(theta) * Math.cos(lngR + phi);
    const z = Math.sin(latR) * Math.sin(theta) + Math.cos(latR) * Math.cos(theta) * Math.cos(lngR + phi);

    const visible = z > 0.15;
    const radius = size * 0.42;

    return {
        x: centerX + x * radius,
        y: centerY - y * radius,
        visible,
    };
}

export interface GlobeVisitor {
    id: string;
    lat: number;
    lng: number;
    name: string;
    country: string;
    avatarColor: string;
    avatarInitial: string;
    warmth: number;
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
    const frameRef = useRef(0);
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
                        size: Math.max(0.02, (c.users / maxUsers) * 0.12),
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
                        size: Math.max(0.02, (c.users / maxUsers) * 0.15),
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
            if (containerRef.current) {
                widthRef.current = containerRef.current.offsetWidth;
            }
        };
        window.addEventListener('resize', onResize);
        onResize();

        const canvasSize = Math.max(widthRef.current, 600);

        globeRef.current = createGlobe(canvasRef.current, {
            devicePixelRatio: Math.min(window.devicePixelRatio, 2),
            width: canvasSize * 2,
            height: canvasSize * 2,
            phi: 0.3,
            theta: 0.2,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 24000,
            mapBrightness: 2.5,
            baseColor: [0.05, 0.08, 0.15],
            markerColor: [0.1, 0.8, 0.5],
            glowColor: [0.03, 0.06, 0.12],
            markers,
            onRender: (state) => {
                if (!pointerInteracting.current) {
                    currentPhi += 0.003;
                }
                const totalPhi = currentPhi + pointerInteractionMovement.current;
                state.phi = totalPhi;
                state.width = canvasSize * 2;
                state.height = canvasSize * 2;
                state.markers = markersRef.current;
                phiRef.current = totalPhi;

                // Throttle avatar position updates to every 3rd frame
                frameRef.current++;
                if (visitors.length > 0 && containerRef.current && frameRef.current % 3 === 0) {
                    const w = containerRef.current.offsetWidth;
                    const h = containerRef.current.offsetHeight;
                    const size = Math.min(w, h);
                    const cx = w / 2;
                    const cy = h / 2;

                    const positions = visitors.map(v => {
                        const pos = latLngToScreen(v.lat, v.lng, totalPhi, 0.2, size, cx, cy);
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

    const getWarmthColor = (warmth: number) => {
        if (warmth > 0.6) return '#10b981';
        if (warmth > 0.4) return '#06b6d4';
        if (warmth > 0.25) return '#8b5cf6';
        return '#3b82f6';
    };

    return (
        <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(ellipse at center, #0a1628 0%, #050a14 70%, #000 100%)' }}>
            {/* Subtle star field background */}
            <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.3), transparent), radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,0.2), transparent), radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.15), transparent), radial-gradient(1px 1px at 80% 50%, rgba(255,255,255,0.25), transparent), radial-gradient(1px 1px at 10% 80%, rgba(255,255,255,0.2), transparent), radial-gradient(1px 1px at 70% 90%, rgba(255,255,255,0.15), transparent), radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.18), transparent), radial-gradient(1px 1px at 90% 10%, rgba(255,255,255,0.22), transparent)',
            }} />

            <canvas
                ref={canvasRef}
                className="cursor-grab active:cursor-grabbing"
                style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '900px',
                    maxHeight: '900px',
                }}
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
                        className="absolute pointer-events-none"
                        style={{
                            left: `${pos.x}px`,
                            top: `${pos.y}px`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                            transition: 'left 0.15s ease-out, top 0.15s ease-out',
                        }}
                    >
                        {/* Pulsing glow ring */}
                        <div
                            className="absolute rounded-full"
                            style={{
                                width: '48px',
                                height: '48px',
                                left: '-8px',
                                top: '-8px',
                                background: getWarmthColor(pos.visitor.warmth),
                                opacity: 0.15,
                                animation: 'globe-pulse 2.5s ease-out infinite',
                            }}
                        />
                        {/* Avatar container with glow border */}
                        <div
                            className="relative rounded-full overflow-hidden"
                            style={{
                                width: '32px',
                                height: '32px',
                                boxShadow: `0 0 0 2.5px ${getWarmthColor(pos.visitor.warmth)}, 0 0 12px ${getWarmthColor(pos.visitor.warmth)}40, 0 2px 8px rgba(0,0,0,0.6)`,
                                background: '#0f172a',
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={getAvatarUrl(pos.visitor.name)} alt="" className="w-full h-full" />
                        </div>
                        {/* Warmth indicator dot */}
                        <div
                            className="absolute rounded-full border-2 border-[#0a1628]"
                            style={{
                                width: '10px',
                                height: '10px',
                                top: '-2px',
                                right: '-2px',
                                background: getWarmthColor(pos.visitor.warmth),
                                zIndex: 11,
                            }}
                        />
                    </div>
                )
            ))}

            <style>{`
                @keyframes globe-pulse {
                    0% { transform: scale(0.8); opacity: 0.2; }
                    50% { opacity: 0.1; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
            `}</style>
        </div>
    );
});

export default RealtimeGlobe;
