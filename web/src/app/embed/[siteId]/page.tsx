'use client';

import { useRef, useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Link2, ExternalLink, Monitor, Navigation } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BrandMark } from '@/components/shell/BrandMark';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import type { RealtimeMapboxHandle } from '@/components/globe/RealtimeGlobeMaplibre';
import {
    convertCitiesToGlobeVisitors, convertToActivityFeed,
    hashStr, AVATAR_COLORS,
    type ActivityFeedItem, type GlobeVisitor,
} from '@/lib/globeUtils';

const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

// ─── Demo data (fallback) ───
const DEMO_VISITORS: GlobeVisitor[] = [
    { id: '1', lat: 37.77, lng: -122.42, name: 'coral falcon', country: 'United States', avatarColor: '#f87171', avatarInitial: 'CF', warmth: 0.8, users: 3 },
    { id: '2', lat: 51.51, lng: -0.13, name: 'jade owl', country: 'United Kingdom', avatarColor: '#34d399', avatarInitial: 'JO', warmth: 0.7, users: 2 },
    { id: '3', lat: 20.59, lng: 78.96, name: 'amber wolf', country: 'India', avatarColor: '#fbbf24', avatarInitial: 'AW', warmth: 0.5, users: 2 },
    { id: '4', lat: 35.69, lng: 139.69, name: 'silver crane', country: 'Japan', avatarColor: '#a78bfa', avatarInitial: 'SC', warmth: 0.65, users: 1 },
    { id: '5', lat: -33.87, lng: 151.21, name: 'rose finch', country: 'Australia', avatarColor: '#fb923c', avatarInitial: 'RF', warmth: 0.6, users: 1 },
    { id: '6', lat: 52.52, lng: 13.41, name: 'teal hawk', country: 'Germany', avatarColor: '#22d3ee', avatarInitial: 'TH', warmth: 0.55, users: 1 },
    { id: '7', lat: 1.35, lng: 103.82, name: 'bronze panda', country: 'Singapore', avatarColor: '#e879f9', avatarInitial: 'BP', warmth: 0.45, users: 1 },
    { id: '8', lat: -23.55, lng: -46.63, name: 'scarlet ibis', country: 'Brazil', avatarColor: '#f472b6', avatarInitial: 'SI', warmth: 0.35, users: 1 },
];
const DEMO_BY_COUNTRY = DEMO_VISITORS.map(v => ({ country: v.country, users: v.users ?? 1 }));

function withDemoAvatar(item: Omit<ActivityFeedItem, 'avatarSeed' | 'avatarColor' | 'avatarInitial'>): ActivityFeedItem {
    const avatarSeed = item.name;
    return {
        ...item,
        avatarSeed,
        avatarColor: AVATAR_COLORS[hashStr(avatarSeed) % AVATAR_COLORS.length],
        avatarInitial: item.name.charAt(0).toUpperCase(),
    };
}

// Demo activity is described by its age, not by a timestamp: a timestamp taken when the
// module loads differs between the server and the browser and caused a hydration mismatch.
const DEMO_ACTIVITY_SEEDS: (Omit<ActivityFeedItem, 'avatarSeed' | 'avatarColor' | 'avatarInitial' | 'timestamp'> & { ageSec: number })[] = [
    { id: 'a1', name: 'coral falcon', country: 'United States', page: '/dashboard/analytics', event: 'visited', ageSec: 8, warmth: 0.7, estValue: '$2.45', confidence: 82 },
    { id: 'a2', name: 'jade owl', country: 'United Kingdom', page: '/pricing', event: 'visited', ageSec: 24, warmth: 0.8, estValue: '$3.10', confidence: 88 },
    { id: 'a3', name: 'amber wolf', country: 'India', page: '', event: 'exited to', exitUrl: 'github.com/trafficclaw', ageSec: 41, warmth: 0.65, estValue: '$1.80', confidence: 75 },
    { id: 'a4', name: 'silver crane', country: 'Japan', page: '/docs/api', event: 'visited', ageSec: 63, warmth: 0.7, estValue: '$2.60', confidence: 80 },
];

function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&radius=50`;
}

/** Ring and dot colour by how engaged a visitor is: status colours, not decoration. */
function warmthTone(warmth: number): { ring: string; dot: string } {
    if (warmth > 0.6) return { ring: 'ring-down', dot: 'bg-down' };
    if (warmth > 0.25) return { ring: 'ring-warn', dot: 'bg-warn' };
    return { ring: 'ring-info', dot: 'bg-info' };
}

// ─── A clock that is 0 on the server and during hydration, then ticks every 15 s ───
// "x minutes ago" depends on the current time, so it must not be rendered before the
// browser has mounted (server and client would print different words).
let clockValue = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(onChange: () => void) {
    clockListeners.add(onChange);
    if (clockListeners.size === 1) {
        clockValue = Date.now();
        clockTimer = setInterval(() => {
            clockValue = Date.now();
            clockListeners.forEach((l) => l());
        }, 15_000);
    }
    // Tell the component the clock now has a value.
    queueMicrotask(() => onChange());
    return () => {
        clockListeners.delete(onChange);
        if (clockListeners.size === 0 && clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    };
}

function useClock(): number {
    return useSyncExternalStore(subscribeClock, () => clockValue, () => 0);
}

function formatTimeAgo(ts: number, now: number): string {
    if (!now) return '';
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 10) return 'a few seconds ago';
    if (s < 60) return `${s} seconds ago`;
    const m = Math.floor(s / 60);
    return `${m} minute${m > 1 ? 's' : ''} ago`;
}

export default function EmbedGlobePage() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const mapRef = useRef<RealtimeMapboxHandle>(null);
    const [isAutoPanning, setIsAutoPanning] = useState(false);
    const now = useClock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [realtimeData, setRealtimeData] = useState<Record<string, any> | null>(null);
    // Always start as demo to avoid hydration mismatch (server has no search params)
    const [isDemo, setIsDemo] = useState(true);
    const lastDataRef = useRef<string>('');
    const hasLiveDataRef = useRef(false);
    const intervalRef = useRef<number>(60_000);

    // ─── Adaptive polling ───
    useEffect(() => {
        if (!token) return;
        hasLiveDataRef.current = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        let cancelled = false;

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/embed/realtime?token=${encodeURIComponent(token)}`);
                if (res.status === 429) {
                    intervalRef.current = 180_000;
                } else if (res.ok) {
                    const data = await res.json();
                    const dataStr = JSON.stringify(data);
                    intervalRef.current = dataStr !== lastDataRef.current ? 60_000 : 120_000;
                    lastDataRef.current = dataStr;
                    setRealtimeData(data);
                    setIsDemo(false);
                    hasLiveDataRef.current = true;
                } else if (!hasLiveDataRef.current) {
                    setIsDemo(true);
                }
            } catch {
                if (!hasLiveDataRef.current) setIsDemo(true);
            }
            if (!cancelled && document.visibilityState === 'visible') {
                timeoutId = setTimeout(fetchData, intervalRef.current);
            }
        };

        const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData(); };
        document.addEventListener('visibilitychange', handleVisibility);
        fetchData();
        return () => { cancelled = true; clearTimeout(timeoutId); document.removeEventListener('visibilitychange', handleVisibility); };
    }, [token]);

    // ─── Data conversion ───
    const realVisitors = useMemo(() => {
        if (!realtimeData || isDemo) return [];
        return convertCitiesToGlobeVisitors(
            Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [],
            Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : [],
        );
    }, [realtimeData, isDemo]);

    const realActivity = useMemo<ActivityFeedItem[]>(() => {
        if (!realtimeData || isDemo) return [];
        return convertToActivityFeed(
            Array.isArray(realtimeData.byCity) ? realtimeData.byCity : [],
            Array.isArray(realtimeData.byPage) ? realtimeData.byPage : [],
            [],
        );
    }, [realtimeData, isDemo]);

    const realByCountry = useMemo<{ country: string; users: number }[]>(() => {
        if (!realtimeData || isDemo) return [];
        return (Array.isArray(realtimeData.byCountry) ? realtimeData.byCountry : []).map((c: { country?: string; users?: number }) => ({
            country: String(c.country ?? ''), users: Number(c.users) || 0,
        }));
    }, [realtimeData, isDemo]);

    // Demo feed items get their timestamps from the browser clock (0 until mounted).
    const demoActivity = useMemo<ActivityFeedItem[]>(
        () => DEMO_ACTIVITY_SEEDS.map(({ ageSec, ...rest }) => withDemoAvatar({ ...rest, timestamp: now - ageSec * 1000 })),
        [now],
    );

    // ─── Display data ───
    const hasLiveResponse = !isDemo && realtimeData !== null;
    const displayVisitors = hasLiveResponse ? realVisitors : DEMO_VISITORS;
    const displayByCountry = hasLiveResponse ? realByCountry : DEMO_BY_COUNTRY;
    const displayActivity = hasLiveResponse ? realActivity : demoActivity;
    const activeUsers = hasLiveResponse
        ? Number(realtimeData.activeUsers) || 0
        : DEMO_VISITORS.reduce((s, v) => s + (v.users ?? 1), 0);
    // Show branding for free users and demo mode; paid users can remove it
    const showBranding = isDemo || !realtimeData || realtimeData.showBranding !== false;

    const toggleAutoPan = useCallback(() => {
        if (mapRef.current) {
            const newVal = mapRef.current.toggleAutoPan();
            setIsAutoPanning(newVal);
        }
    }, []);

    const handleAutoPanChange = useCallback((enabled: boolean) => {
        setIsAutoPanning(enabled);
    }, []);

    // On phones the three parts stack (stats, map, feed); from sm up they float over the map.
    const panel = 'bg-surface text-fg sm:rounded-card sm:border sm:border-border-subtle sm:shadow-popover';

    return (
        <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-canvas text-fg sm:block">
            {/* ─── Map ─── */}
            <div className="relative order-0 min-h-0 flex-1 sm:absolute sm:inset-0">
                <div className="absolute inset-0">
                    <RealtimeGlobeMaplibre
                        ref={mapRef}
                        visitors={displayVisitors}
                        byCountry={displayByCountry}
                        autoPan={isAutoPanning}
                        onAutoPanChange={handleAutoPanChange}
                    />
                </div>
            </div>

            {/* ─── Top left: stats ─── */}
            <section aria-label="Visitors right now" className="relative z-10 -order-1 shrink-0 border-b border-border-subtle sm:absolute sm:top-4 sm:left-4 sm:z-20 sm:max-w-xs sm:border-b-0">
                <div className={cn(panel, 'p-3 sm:p-4')}>
                    <div className="mb-2 flex items-center gap-2">
                        <h1 className="text-caption uppercase tracking-[0.04em] text-fg-muted">Real-time</h1>
                        {isDemo ? <Badge variant="warn">Demo</Badge> : null}
                    </div>

                    <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body" aria-live="polite">
                        <span className="relative flex size-2 shrink-0">
                            <span className="absolute inline-flex size-full animate-live-dot rounded-full bg-up opacity-60 motion-reduce:animate-none" />
                            <span className="relative inline-flex size-2 rounded-full bg-up" />
                        </span>
                        <span><span className="text-stat-sm font-semibold text-fg tabular-nums">{activeUsers}</span> {activeUsers === 1 ? 'visitor' : 'visitors'} on your site</span>
                    </p>

                    <div className="border-t border-border-subtle pt-2">
                        <dl className="space-y-2 text-body-sm">
                            <div className="flex items-start gap-3">
                                <dt className="w-[68px] shrink-0 pt-0.5 text-fg-muted">Referrers</dt>
                                <dd className="flex flex-wrap gap-1">
                                    <span className="flex items-center gap-1 text-fg-secondary">
                                        <Link2 aria-hidden className="size-3 text-fg-muted" />
                                        Direct
                                        <span className="text-fg-muted tabular-nums">({activeUsers})</span>
                                    </span>
                                </dd>
                            </div>

                            <div className="flex items-start gap-3">
                                <dt className="w-[68px] shrink-0 pt-0.5 text-fg-muted">Countries</dt>
                                <dd className="flex flex-wrap gap-x-2.5 gap-y-1">
                                    {displayByCountry.slice(0, 4).map((c) => (
                                        <span key={c.country} className="flex items-center gap-1 text-fg-secondary">
                                            <CountryFlag country={c.country} />
                                            {c.country}
                                            <span className="text-fg-muted tabular-nums">({c.users})</span>
                                        </span>
                                    ))}
                                    {displayByCountry.length > 4 ? (
                                        <span className="inline-flex h-5 items-center rounded-full bg-subtle px-1.5 text-caption text-fg-muted tabular-nums">
                                            +{displayByCountry.length - 4}
                                        </span>
                                    ) : null}
                                    {hasLiveResponse && displayByCountry.length === 0 ? (
                                        <span className="text-fg-muted">No active visitors</span>
                                    ) : null}
                                </dd>
                            </div>

                            <div className="hidden items-start gap-3 sm:flex">
                                <dt className="w-[68px] shrink-0 pt-0.5 text-fg-muted">Devices</dt>
                                <dd className="flex flex-wrap gap-1.5">
                                    <span className="flex items-center gap-1 text-fg-secondary">
                                        <Monitor aria-hidden className="size-3 text-fg-muted" />
                                        Desktop
                                        <span className="text-fg-muted tabular-nums">({activeUsers})</span>
                                    </span>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </section>

            {/* ─── Right: map controls ─── */}
            <div className="absolute top-16 right-3 z-20 hidden sm:right-4 sm:top-16 sm:block">
                <Button
                    variant="secondary"
                    iconOnly
                    icon={Navigation}
                    aria-label={isAutoPanning ? 'Stop auto-panning' : 'Auto-pan the map'}
                    aria-pressed={isAutoPanning}
                    onClick={toggleAutoPan}
                    className={cn('shadow-popover', isAutoPanning && 'border-brand text-brand-text')}
                />
            </div>

            {/* ─── Bottom left: activity ─── */}
            <section aria-label="Recent activity" className="relative z-10 order-1 max-w-full shrink-0 border-t border-border-subtle sm:absolute sm:bottom-4 sm:left-4 sm:z-20 sm:max-w-sm sm:border-t-0">
                <div className={cn(panel, 'overflow-hidden')}>
                    <ul className="max-h-[180px] divide-y divide-border-subtle overflow-y-auto sm:max-h-[240px]" aria-live="polite">
                        {hasLiveResponse && displayActivity.length === 0 ? (
                            <li className="px-3 py-4 text-body-sm text-fg-muted sm:px-4">No active visitor activity right now.</li>
                        ) : null}
                        {displayActivity.map((item) => {
                            const tone = warmthTone(item.warmth);
                            return (
                                <li key={item.id} className="px-3 py-2.5 sm:px-4">
                                    <div className="flex items-start gap-2.5">
                                        <div className="relative mt-0.5 shrink-0">
                                            <span className={cn('block size-6 overflow-hidden rounded-full bg-subtle ring-2', tone.ring)}>
                                                <Image src={getAvatarUrl(item.name)} alt="" width={24} height={24} className="size-full" unoptimized />
                                            </span>
                                            <span aria-hidden className={cn('absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-surface', tone.dot)} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-x-1 text-body-sm leading-snug">
                                                <span className="font-medium text-fg">{item.name}</span>
                                                <span className="text-fg-muted">from</span>
                                                <CountryFlag country={item.country} />
                                                <span className="font-medium text-fg">{item.country}</span>
                                                <span className="text-fg-muted">{item.event}</span>
                                                {item.event === 'visited' ? (
                                                    <span className="font-mono text-meta text-fg-secondary">{item.page}</span>
                                                ) : (
                                                    <>
                                                        <ExternalLink aria-hidden className="size-3 text-fg-muted" />
                                                        <span className="truncate text-meta text-fg-muted">{item.exitUrl}</span>
                                                    </>
                                                )}
                                            </p>
                                            <p className="mt-0.5 min-h-4 text-caption text-fg-muted">{formatTimeAgo(item.timestamp, now)}</p>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>

            {/* ─── Bottom right: powered by (hidden for paid users) ─── */}
            {showBranding ? (
                <div className="absolute right-3 bottom-3 z-20 hidden sm:right-4 sm:bottom-4 sm:block">
                    <a
                        href="https://trafficclaw.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface px-3 py-2 text-meta text-fg-muted shadow-popover transition-colors duration-120 hover:text-fg"
                    >
                        <BrandMark size={16} />
                        <span>Powered by <span className="font-medium text-fg">TrafficClaw</span></span>
                    </a>
                </div>
            ) : null}
        </div>
    );
}
