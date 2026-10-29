/**
 * The picture of one chart in the email (round 9): a 2x PNG drawn with next/og (satori + resvg, no
 * browser). Light colours only; one accent colour; the numbers that matter as text, because mail
 * apps often show alt text first. Server only.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { barSize, LINE_SIZE, type ChartSpec } from './chartSpec';

const INK = '#171a20';
const MUTED = '#636b78';
const GRID = '#e7eaee';
const S = 2;

type EmailFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
let fontsPromise: Promise<EmailFont[]> | null = null;

/**
 * Geist (OFL, public/og-fonts) for the picture text, so a chart does not fall back to the renderer's own face
 * (round 9 review, item 21). The email body can only name the reader's system sans; Geist is the closest bundled
 * match. Missing files fall back to the built-in font rather than failing the image.
 */
function emailFonts(): Promise<EmailFont[]> {
    fontsPromise ??= Promise.all(
        ([['Geist-Regular.ttf', 400], ['Geist-Bold.ttf', 700]] as const).map(async ([file, weight]) => {
            const buf = await readFile(join(process.cwd(), 'public', 'og-fonts', file));
            return { name: 'Geist', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
        }),
    ).catch(() => {
        fontsPromise = null;
        return [];
    });
    return fontsPromise;
}

/** A line as SVG path. A `null` point is a gap: the line breaks there (no drop to 0). The area is drawn for the main series only. */
function linePaths(v: Array<number | null>, w: number, h: number, max: number, min: number): { line: string; area: string } {
    const span = max - min || 1;
    let line = '';
    let pen = false;
    v.forEach((x, i) => {
        if (x === null) { pen = false; return; }
        line += `${pen ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)} ${(h - ((x - min) / span) * h).toFixed(1)} `;
        pen = true;
    });
    line = line.trim();
    return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

export async function chartImage(spec: ChartSpec): Promise<ImageResponse> {
    const fonts = await emailFonts();
    const FONT = fonts.length ? 'Geist' : undefined;
    if (spec.g === 'line') {
        const W = LINE_SIZE.width * S, H = LINE_SIZE.height * S, pad = 24 * S;
        const plotW = W - pad * 2, plotH = H - pad * 2 - 64 * S;
        const all = [...spec.v, ...(spec.p ?? []).filter((x): x is number => x !== null)];
        const max = Math.max(...all, 0) * 1.08 || 1;
        const min = 0;
        const main = linePaths(spec.v, plotW, plotH, max, min);
        const prev = spec.p && spec.p.filter((x) => x !== null).length > 1 ? linePaths(spec.p, plotW, plotH, max, min) : null;
        return new ImageResponse(
            (
                <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#ffffff', padding: pad, fontFamily: FONT }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 52 * S }}>
                        <div style={{ display: 'flex', fontSize: 15 * S, fontWeight: 700, color: INK }}>{spec.t}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline' }}>
                            <div style={{ display: 'flex', fontSize: 22 * S, fontWeight: 700, color: INK }}>{spec.f[1] ?? ''}</div>
                            <div style={{ display: 'flex', fontSize: 11 * S, color: MUTED, marginLeft: 8 * S }}>{`latest · high ${spec.f[0] ?? ''}`}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', width: plotW, height: plotH, marginTop: 6 * S }}>
                        <svg width={plotW} height={plotH} viewBox={`0 0 ${plotW} ${plotH}`}>
                            {[0, 0.5, 1].map((t) => <line key={t} x1="0" x2={plotW} y1={plotH * t} y2={plotH * t} stroke={GRID} strokeWidth={S} />)}
                            <path d={main.area} fill={spec.c} fillOpacity="0.12" />
                            {prev ? <path d={prev.line} fill="none" stroke="#9aa3b2" strokeWidth={2 * S} strokeDasharray={`${6 * S} ${5 * S}`} strokeLinejoin="round" /> : null}
                            <path d={main.line} fill="none" stroke={spec.c} strokeWidth={2.5 * S} strokeLinejoin="round" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 * S, fontSize: 11 * S, color: MUTED }}>
                        <div style={{ display: 'flex' }}>{spec.l[0] ?? ''}</div>
                        {spec.p ? <div style={{ display: 'flex' }}>{spec.p.includes(null) ? 'dashed: previous period (part has no data)' : 'dashed: previous period'}</div> : null}
                        <div style={{ display: 'flex' }}>{spec.l[1] ?? ''}</div>
                    </div>
                </div>
            ),
            { width: W, height: H, ...(fonts.length ? { fonts } : {}) },
        );
    }

    const size = barSize(spec.v.length);
    const W = size.width * S, H = size.height * S, pad = 24 * S;
    const max = Math.max(...spec.v, 0) || 1;
    return new ImageResponse(
        (
            <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#ffffff', padding: pad, fontFamily: FONT }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', height: 30 * S }}>
                    <div style={{ display: 'flex', fontSize: 15 * S, fontWeight: 700, color: INK }}>{spec.t}</div>
                    {spec.m ? <div style={{ display: 'flex', fontSize: 11 * S, color: MUTED }}>{spec.m}</div> : null}
                </div>
                {spec.v.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', height: 26 * S }}>
                        <div style={{ display: 'flex', width: 150 * S, fontSize: 12 * S, color: INK, overflow: 'hidden', whiteSpace: 'nowrap' }}>{(spec.l[i] ?? '').slice(0, 26)}</div>
                        <div style={{ display: 'flex', flex: 1, height: 12 * S, background: '#f1f3f6', borderRadius: 6 * S }}>
                            <div style={{ display: 'flex', width: `${Math.max(2, (v / max) * 100)}%`, height: 12 * S, background: spec.c, borderRadius: 6 * S }} />
                        </div>
                        <div style={{ display: 'flex', width: 70 * S, justifyContent: 'flex-end', fontSize: 12 * S, fontWeight: 700, color: INK }}>{spec.f[i] ?? ''}</div>
                    </div>
                ))}
            </div>
        ),
        { width: W, height: H, ...(fonts.length ? { fonts } : {}) },
    );
}
