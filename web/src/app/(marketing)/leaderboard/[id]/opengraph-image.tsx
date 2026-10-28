import { BRAND_NAME } from '@/lib/brand';
import { OgDelta, OgMark, OgTick, ogFitBold, ogMeasure, ogRender } from '@/components/marketing/site/og';
import { deltaText, metricText } from '@/lib/leaderboard/format';
import { fitSize } from '@/lib/ogFit';
import { getEmbed } from '@/lib/leaderboard/server';

export const alt = `${BRAND_NAME} verified leaderboard profile`;
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

// Raw token values (an image cannot read CSS variables). Light, like the public pages.
const C = { bg: '#f6f7f9', card: '#ffffff', border: '#dde1e7', fg: '#171a20', muted: '#636b78', brand: '#0d3a2c', brandSoft: '#ebfbf4', brandText: '#157459', users: '#5b4fe0', up: '#157f3c', down: '#c92a2a' };

function sparkPath(values: Array<number | null>, w: number, h: number): { line: string; area: string } | null {
    const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
    if (pts.length < 2) return null;
    const lo = Math.min(...pts.map((p) => p.v));
    const hi = Math.max(...pts.map((p) => p.v));
    const span = hi - lo || 1;
    const last = values.length - 1 || 1;
    const xy = pts.map((p) => [(p.i / last) * w, h - 6 - ((p.v - lo) / span) * (h - 12)] as const);
    const line = xy.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

// Inner width of the white card is 992 px: a text column, a gap and the stat column must fit in it.
const LEFT_W = 480;
const RIGHT_W = 460;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const e = await getEmbed(id);

    const visitors = metricText(e?.visitors);
    const clicks = metricText(e?.clicks);
    const headline = visitors ?? clicks;
    const headlineLabel = visitors ? 'visitors, last 28 days' : clicks ? 'search clicks, last 28 days' : '';
    const delta = (visitors ? e?.visitors : e?.clicks)?.delta_pct ?? null;
    const deltaLabel = deltaText(delta);
    const spark = e?.spark ? sparkPath(e.spark.values, RIGHT_W, 150) : null;
    const rank = e?.rank_overall ? `#${e.rank_overall} overall` : null;

    // Ranges such as "50K–100K" are wide: step the headline down until it fits its column. Names wrap, then end in an ellipsis.
    const { bold } = await ogMeasure();
    const headlineSize = headline ? fitSize(headline, bold, { maxWidth: RIGHT_W, sizes: [104, 96, 88, 80, 72, 64], letterSpacing: -4 }) : 104;
    const name = await ogFitBold(e?.name ?? 'Profile not found', { maxWidth: LEFT_W, sizes: [68, 56, 48, 42], maxLines: 2, letterSpacing: -2 });

    return ogRender(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, color: C.fg, padding: 56, fontFamily: 'Geist' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <OgMark size={48} />
                        <span style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: -0.6 }}>{BRAND_NAME}</span>
                    </div>
                    <span style={{ display: 'flex', fontSize: 20, color: C.muted }}>Verified traffic leaderboard</span>
                </div>

                <div style={{ display: 'flex', flex: 1, marginTop: 36, background: C.card, border: `1px solid ${C.border}`, borderRadius: 28, padding: 48, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: LEFT_W }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700, padding: '8px 16px', borderRadius: 999, background: C.brandSoft, color: C.brandText }}>
                                    {e?.verification.level === 'owner' ? <OgTick size={20} color={C.brandText} /> : null}
                                    <span style={{ display: 'flex' }}>{e?.verification.level === 'owner' ? 'Verified owner (Search Console)' : e ? e.verification.label : 'Not listed'}</span>
                                </span>
                                {e?.category ? <span style={{ display: 'flex', fontSize: 20, padding: '8px 16px', borderRadius: 999, background: '#eff1f4', color: C.muted }}>{e.category}</span> : null}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {name.lines.map((line, i) => (
                                    <div key={i} style={{ display: 'flex', fontSize: name.size, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{line}</div>
                                ))}
                            </div>
                        </div>
                        {rank ? <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>{rank}{e?.rank_category && e.category ? `  ·  #${e.rank_category} in ${e.category}` : ''}</div> : <div style={{ display: 'flex' }} />}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', width: RIGHT_W }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', fontSize: headlineSize, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>{headline ?? 'Verified'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                                <span style={{ display: 'flex', fontSize: 24, color: C.muted }}>{headlineLabel}</span>
                                {deltaLabel ? <OgDelta label={deltaLabel} size={26} up={C.up} down={C.down} /> : null}
                            </div>
                        </div>
                        {spark ? (
                            <svg width={RIGHT_W} height="150" viewBox={`0 0 ${RIGHT_W} 150`} style={{ display: 'flex' }}>
                                <path d={spark.area} fill={C.users} fillOpacity="0.12" />
                                <path d={spark.line} fill="none" stroke={C.users} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        ) : <div style={{ display: 'flex' }} />}
                    </div>
                </div>
            </div>
        ),
    );
}
