import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'TrafficClaw verified leaderboard entry';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type EntryDetail = {
    startup_name: string;
    description: string | null;
    monthly_visitors: number;
    category: string | null;
    visitor_trend: number;
    is_verified?: boolean;
    verification_status?: string;
};

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let entry: EntryDetail | null = null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${encodeURIComponent(id)}/detail`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });
        if (res.ok) entry = (await res.json()) as EntryDetail;
    } catch {
        // fall through
    }

    const verified = entry?.verification_status === 'verified' || entry?.is_verified;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(135deg, #04070d 0%, #050913 60%, #02050a 100%)',
                    color: 'white',
                    padding: '64px',
                    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: 14,
                                background: 'linear-gradient(135deg, #34d399 0%, #22d3ee 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 26,
                                fontWeight: 800,
                                color: '#04111a',
                            }}
                        >
                            T
                        </div>
                        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
                            TrafficClaw
                        </span>
                    </div>
                    <span
                        style={{
                            fontSize: 18,
                            fontWeight: 600,
                            padding: '10px 18px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#7AD9DA',
                        }}
                    >
                        Verified Traffic Leaderboard
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {verified && (
                            <span
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 16px',
                                    borderRadius: 999,
                                    background: 'rgba(52,211,153,0.12)',
                                    border: '1px solid rgba(52,211,153,0.4)',
                                    color: '#34d399',
                                    fontSize: 18,
                                    fontWeight: 600,
                                }}
                            >
                                ✓ Verified via Google Analytics
                            </span>
                        )}
                        {entry?.category && (
                            <span
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 999,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#cbd5e1',
                                    fontSize: 18,
                                    fontWeight: 500,
                                }}
                            >
                                {entry.category}
                            </span>
                        )}
                    </div>
                    <h1
                        style={{
                            fontSize: 86,
                            lineHeight: 1.02,
                            fontWeight: 800,
                            letterSpacing: '-0.04em',
                            margin: 0,
                            maxWidth: '95%',
                        }}
                    >
                        {entry?.startup_name || 'Startup not found'}
                    </h1>
                    {entry?.description && (
                        <p
                            style={{
                                fontSize: 26,
                                lineHeight: 1.35,
                                color: '#94a3b8',
                                margin: 0,
                                maxWidth: '85%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                            }}
                        >
                            {entry.description}
                        </p>
                    )}
                </div>

                {entry && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 18, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600 }}>
                                Monthly visitors
                            </span>
                            <span
                                style={{
                                    fontSize: 96,
                                    fontWeight: 800,
                                    letterSpacing: '-0.05em',
                                    backgroundImage: 'linear-gradient(135deg,#34d399,#22d3ee)',
                                    backgroundClip: 'text',
                                    color: 'transparent',
                                }}
                            >
                                {formatNumber(entry.monthly_visitors)}
                            </span>
                        </div>
                        {entry.visitor_trend !== 0 && (
                            <span
                                style={{
                                    fontSize: 28,
                                    fontWeight: 700,
                                    padding: '12px 22px',
                                    borderRadius: 14,
                                    background: entry.visitor_trend > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                                    border: `1px solid ${entry.visitor_trend > 0 ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
                                    color: entry.visitor_trend > 0 ? '#34d399' : '#f87171',
                                }}
                            >
                                {entry.visitor_trend > 0 ? '↑' : '↓'} {Math.abs(entry.visitor_trend).toFixed(1)}% / 30d
                            </span>
                        )}
                    </div>
                )}
            </div>
        ),
        size,
    );
}
