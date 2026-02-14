'use client';

import { useState, useEffect, useMemo } from 'react';

interface Visitor {
    id: string;
    lat: number;
    lng: number;
    country: string;
    city: string;
    device: string;
    referrer: string;
    flag: string;
}

interface WorldMapProps {
    visitors?: Visitor[];
    totalOnline?: number;
}

interface VisitorDot extends Visitor {
    x: number;
    y: number;
}


// Convert lat/lng to SVG x/y using Mercator-ish projection
function geoToSvg(lat: number, lng: number, width: number, height: number): [number, number] {
    const x = ((lng + 180) / 360) * width;
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = height / 2 - (mercN / Math.PI) * (height / 2) * 0.82;
    return [x, Math.max(10, Math.min(height - 10, y))];
}

const DEFAULT_VISITORS: Visitor[] = [
    { id: '1', lat: 40.71, lng: -74.01, country: 'United States', city: 'New York', device: 'Desktop', referrer: 'Google', flag: '🇺🇸' },
    { id: '2', lat: 51.51, lng: -0.13, country: 'United Kingdom', city: 'London', device: 'Desktop', referrer: 'Direct', flag: '🇬🇧' },
    { id: '3', lat: 28.61, lng: 77.23, country: 'India', city: 'New Delhi', device: 'Mobile', referrer: 'Google', flag: '🇮🇳' },
    { id: '4', lat: 19.08, lng: 72.88, country: 'India', city: 'Mumbai', device: 'Mobile', referrer: 'Twitter', flag: '🇮🇳' },
    { id: '5', lat: 52.52, lng: 13.41, country: 'Germany', city: 'Berlin', device: 'Desktop', referrer: 'GitHub', flag: '🇩🇪' },
    { id: '6', lat: 35.68, lng: 139.69, country: 'Japan', city: 'Tokyo', device: 'Desktop', referrer: 'Direct', flag: '🇯🇵' },
    { id: '7', lat: -33.87, lng: 151.21, country: 'Australia', city: 'Sydney', device: 'Tablet', referrer: 'Google', flag: '🇦🇺' },
    { id: '8', lat: 48.86, lng: 2.35, country: 'France', city: 'Paris', device: 'Mobile', referrer: 'LinkedIn', flag: '🇫🇷' },
    { id: '9', lat: 43.65, lng: -79.38, country: 'Canada', city: 'Toronto', device: 'Desktop', referrer: 'Google', flag: '🇨🇦' },
    { id: '10', lat: 37.77, lng: -122.42, country: 'United States', city: 'San Francisco', device: 'Desktop', referrer: 'Direct', flag: '🇺🇸' },
    { id: '11', lat: 55.75, lng: 37.62, country: 'Russia', city: 'Moscow', device: 'Desktop', referrer: 'Yandex', flag: '🇷🇺' },
    { id: '12', lat: -23.55, lng: -46.63, country: 'Brazil', city: 'São Paulo', device: 'Mobile', referrer: 'Google', flag: '🇧🇷' },
    { id: '13', lat: 1.35, lng: 103.82, country: 'Singapore', city: 'Singapore', device: 'Desktop', referrer: 'Direct', flag: '🇸🇬' },
    { id: '14', lat: 25.20, lng: 55.27, country: 'UAE', city: 'Dubai', device: 'Mobile', referrer: 'Instagram', flag: '🇦🇪' },
    { id: '15', lat: 34.05, lng: -118.24, country: 'United States', city: 'Los Angeles', device: 'Desktop', referrer: 'Google', flag: '🇺🇸' },
    { id: '16', lat: 12.97, lng: 77.59, country: 'India', city: 'Bangalore', device: 'Desktop', referrer: 'GitHub', flag: '🇮🇳' },
    { id: '17', lat: 41.01, lng: 28.98, country: 'Turkey', city: 'Istanbul', device: 'Mobile', referrer: 'Direct', flag: '🇹🇷' },
    { id: '18', lat: -6.21, lng: 106.85, country: 'Indonesia', city: 'Jakarta', device: 'Mobile', referrer: 'Google', flag: '🇮🇩' },
];

// Simplified world map path (continents outline)
const WORLD_PATH = "M170,85 L172,78 L178,76 L185,78 L192,74 L200,72 L208,70 L215,68 L220,65 L228,62 L235,58 L240,55 L248,52 L255,48 L260,50 L268,52 L275,55 L280,58 L285,55 L290,50 L295,48 L300,45 L305,42 L310,40 L320,38 L330,36 L340,35 L350,34 L360,35 L370,36 L380,38 L390,40 L400,42 L410,45 L420,42 L430,40 L440,38 L450,36 L460,35 L470,36 L480,38 L490,40 L500,42 L510,45 L520,48 L530,52 L540,55 L545,58 L550,62 L555,65 L558,70 L560,75 L562,80 L565,85 L568,90 L570,95 L572,100 L574,108 L576,115 L574,120 L570,125 L565,130 L560,135 L555,140 L550,145 L545,148 L540,150 L535,155 L530,160 L525,165 L520,168 L515,170 L510,172 L505,175 L500,178 L495,180 L490,182 L485,185 L480,188 L475,190 L470,192 L465,195 L460,198 L455,200 M170,85 L168,90 L165,95 L162,102 L160,110 L155,118 L150,125 L145,130 L140,135 L138,140 L135,148 L130,155 L125,162 L120,168 L118,172 L115,178 L112,185 L110,190 L108,195 L106,200 L105,208 M260,50 L258,55 L255,60 L252,65 L250,72 L248,78 L246,85 L244,90 L242,95 L240,102 L238,110 L235,118 L232,125 L230,132 L228,138 L225,145 L222,152 L220,158 L218,165 L215,172 L212,178 L210,185 L208,192 L205,198 L202,205 M290,50 L292,55 L295,62 L298,68 L300,75 L302,82 L305,88 L308,95 L310,102 L312,110 L315,118 L318,125 L320,132 L318,140 L315,148 L312,155 L310,162 L308,168 L305,175 L302,182 L300,188 L298,195 L295,202 M350,34 L348,40 L345,48 L342,55 L340,62 L338,70 L336,78 L334,85 L332,92 L330,100 L328,108 L326,115 L324,122 L322,130 L320,138 L318,145 L316,152 L315,160 M390,40 L392,48 L395,55 L398,62 L400,70 L402,78 L405,85 L408,92 L410,100 L412,108 L415,115 L418,122 L420,130 L422,138 L424,145 L425,152 L426,160 L428,168 L430,175 M450,36 L448,42 L446,50 L444,58 L442,65 L440,72 L438,80 L436,88 L434,95 L432,102 L430,110 L428,118 L426,125 L424,132 L422,140 L420,148 M520,48 L522,55 L525,62 L528,70 L530,78 L532,85 L535,92 L538,100 L540,108 L542,115 L544,122 L545,130 L546,138 L548,145 L550,152 L552,160 L554,168 L555,175";

export default function WorldMap({ visitors = DEFAULT_VISITORS, totalOnline = 84 }: WorldMapProps) {
    const [hoveredVisitor, setHoveredVisitor] = useState<Visitor | null>(null);
    const [pulsePhase, setPulsePhase] = useState(0);

    const W = 700;
    const H = 380;

    useEffect(() => {
        const interval = setInterval(() => {
            setPulsePhase(p => (p + 1) % 100);
        }, 50);
        return () => clearInterval(interval);
    }, []);

    const visitorDots: VisitorDot[] = useMemo(() =>
        visitors.map(v => {
            const [x, y] = geoToSvg(v.lat, v.lng, W, H);
            return { ...v, x, y };
        }),
        [visitors]
    );

    // Aggregate stats
    const countryStats = useMemo(() => {
        const counts: Record<string, { count: number; flag: string }> = {};
        visitors.forEach(v => {
            if (!counts[v.country]) counts[v.country] = { count: 0, flag: v.flag };
            counts[v.country].count++;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);
    }, [visitors]);

    const referrerStats = useMemo(() => {
        const counts: Record<string, number> = {};
        visitors.forEach(v => { counts[v.referrer] = (counts[v.referrer] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    }, [visitors]);

    const deviceStats = useMemo(() => {
        const counts: Record<string, number> = {};
        visitors.forEach(v => { counts[v.device] = (counts[v.device] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [visitors]);

    const referrerIcons: Record<string, string> = {
        'Direct': '🔗', 'Google': '🔍', 'GitHub': '🐙', 'Twitter': '𝕏',
        'LinkedIn': '💼', 'Instagram': '📷', 'Yandex': '🔎',
    };

    const deviceIcons: Record<string, string> = {
        'Desktop': '🖥️', 'Mobile': '📱', 'Tablet': '📟',
    };

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white">🌍 GrowClaw</span>
                        <span className="text-xs text-zinc-500 border-l border-white/[0.08] pl-2 ml-1">REAL-TIME</span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-400">{totalOnline}</span>
                    <span className="text-xs text-zinc-500">visitors online</span>
                </div>
            </div>

            {/* Stats Row */}
            <div className="px-5 pb-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Referrers</span>
                    {referrerStats.map(([ref, count]) => (
                        <span key={ref} className="text-zinc-400">
                            {referrerIcons[ref] || '🔗'} {ref} ({count})
                        </span>
                    ))}
                </div>
            </div>
            <div className="px-5 pb-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Countries</span>
                    {countryStats.map(([country, data]) => (
                        <span key={country} className="text-zinc-400">
                            {data.flag} {country} ({data.count})
                        </span>
                    ))}
                </div>
            </div>
            <div className="px-5 pb-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Devices</span>
                    {deviceStats.map(([device, count]) => (
                        <span key={device} className="text-zinc-400">
                            {deviceIcons[device] || '🖥️'} {device} ({count})
                        </span>
                    ))}
                </div>
            </div>

            {/* Map */}
            <div className="relative">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-auto"
                    style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0.95) 0%, rgba(15,15,25,0.98) 100%)' }}
                >
                    {/* Grid lines */}
                    {Array.from({ length: 7 }).map((_, i) => (
                        <line key={`hline-${i}`} x1={0} y1={H * (i + 1) / 8} x2={W} y2={H * (i + 1) / 8} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />
                    ))}
                    {Array.from({ length: 11 }).map((_, i) => (
                        <line key={`vline-${i}`} x1={W * (i + 1) / 12} y1={0} x2={W * (i + 1) / 12} y2={H} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />
                    ))}

                    {/* Continent outlines */}
                    <path d={WORLD_PATH} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />

                    {/* Landmass shapes (simplified blobs) */}
                    {/* North America */}
                    <ellipse cx={180} cy={105} rx={70} ry={55} fill="rgba(255,255,255,0.03)" />
                    {/* South America */}
                    <ellipse cx={220} cy={220} rx={40} ry={60} fill="rgba(255,255,255,0.03)" />
                    {/* Europe */}
                    <ellipse cx={370} cy={82} rx={45} ry={30} fill="rgba(255,255,255,0.03)" />
                    {/* Africa */}
                    <ellipse cx={380} cy={185} rx={40} ry={55} fill="rgba(255,255,255,0.03)" />
                    {/* Asia */}
                    <ellipse cx={500} cy={100} rx={80} ry={50} fill="rgba(255,255,255,0.03)" />
                    {/* Australia */}
                    <ellipse cx={580} cy={235} rx={35} ry={25} fill="rgba(255,255,255,0.03)" />

                    {/* Visitor dots */}
                    {visitorDots.map((v, i) => {
                        const pulseScale = 1 + 0.3 * Math.sin(((pulsePhase + i * 15) / 100) * Math.PI * 2);
                        return (
                            <g key={v.id}
                                onMouseEnter={() => setHoveredVisitor(v)}
                                onMouseLeave={() => setHoveredVisitor(null)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Pulse ring */}
                                <circle
                                    cx={v.x} cy={v.y}
                                    r={6 * pulseScale}
                                    fill="none"
                                    stroke="rgba(52,211,153,0.3)"
                                    strokeWidth={0.8}
                                />
                                {/* Glow */}
                                <circle
                                    cx={v.x} cy={v.y}
                                    r={4}
                                    fill="rgba(52,211,153,0.15)"
                                />
                                {/* Core dot */}
                                <circle
                                    cx={v.x} cy={v.y}
                                    r={2.5}
                                    fill="#34d399"
                                    className="drop-shadow-sm"
                                />
                            </g>
                        );
                    })}
                </svg>

                {/* Tooltip */}
                {hoveredVisitor && (
                    <div
                        className="absolute pointer-events-none bg-zinc-900/95 border border-white/[0.1] rounded-xl px-3 py-2.5 shadow-2xl backdrop-blur-sm z-10"
                        style={{
                            left: `${((hoveredVisitor as VisitorDot).x / W) * 100}%`,
                            top: `${((hoveredVisitor as VisitorDot).y / H) * 100 - 5}%`,
                            transform: 'translate(-50%, -100%)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">{hoveredVisitor.flag}</span>
                            <span className="text-xs font-semibold text-white">{hoveredVisitor.city}, {hoveredVisitor.country}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                            <span>{deviceIcons[hoveredVisitor.device]} {hoveredVisitor.device}</span>
                            <span>via {hoveredVisitor.referrer}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
