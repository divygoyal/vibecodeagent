/**
 * Branded PDF for client reports (round 2 white-label kit). Browser only, same tools as the
 * existing export (html2canvas-pro + jsPDF, loaded on demand); no server and no headless browser.
 * The cover block becomes its own first page; every later page gets a slim header with the
 * company and report name and a footer "Prepared by … for … · note · Page n of N".
 * Dashboards without a cover or brand kit keep using lib/dashboardPdfExport.ts.
 */
import type { ThemeV2 } from './types';

export interface ReportPdfOptions {
    name: string;
    dateLabel?: string;
    theme: ThemeV2;
    /** Page colour as #rrggbb (the dashboard canvas). */
    background: string;
    /** Text colour as #rrggbb. */
    ink: string;
    muted: string;
    filename?: string;
}

const MARGIN = 10;
const HEADER = 12;
const FOOTER = 9;

function rgb(hex: string): [number, number, number] {
    const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS colour (rgb(...) or #hex) to #rrggbb. */
export function cssToHex(css: string, fallback: string): string {
    const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css);
    if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    return /^#[0-9a-f]{6}$/i.test(css) ? css : fallback;
}

export function hasReportKit(theme: ThemeV2): boolean {
    return Boolean(theme.cover?.enabled || theme.brand?.preparedBy || theme.brand?.preparedFor || theme.brand?.footer);
}

export async function exportReportPdf(root: HTMLElement, o: ReportPdfOptions): Promise<void> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}';
    document.head.appendChild(freeze);
    await new Promise((r) => setTimeout(r, 150));
    try {
        const ignore = (el: Element) => el.getAttribute('data-pdf-ignore') === 'true';
        const cover = root.querySelector<HTMLElement>('[data-dash-cover]');
        const opts = { scale: 2, useCORS: true, allowTaint: false, backgroundColor: o.background, logging: false } as const;
        const coverCanvas = cover ? await html2canvas(cover, { ...opts, ignoreElements: ignore }) : null;
        const body = await html2canvas(root, { ...opts, ignoreElements: (el) => ignore(el) || el.hasAttribute('data-dash-cover') });

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
        const W = pdf.internal.pageSize.getWidth();
        const H = pdf.internal.pageSize.getHeight();
        const [br, bg, bb] = rgb(o.background);
        const ink = rgb(o.ink);
        const muted = rgb(o.muted);
        const brand = o.theme.brand ?? {};
        const company = o.theme.header.companyName;
        const footerText = [
            brand.preparedBy && brand.preparedFor ? `Prepared by ${brand.preparedBy} for ${brand.preparedFor}` : brand.preparedBy ? `Prepared by ${brand.preparedBy}` : brand.preparedFor ? `Prepared for ${brand.preparedFor}` : '',
            brand.footer ?? '',
        ].filter(Boolean).join(' · ');
        const paint = () => { pdf.setFillColor(br, bg, bb); pdf.rect(0, 0, W, H, 'F'); };

        const contentW = W - MARGIN * 2;
        const bodyH = contentW * (body.height / body.width);
        const perPage = H - MARGIN - HEADER - FOOTER;
        const bodyPages = Math.max(1, Math.ceil(bodyH / perPage));
        const total = bodyPages + (coverCanvas ? 1 : 0);

        const footer = (n: number) => {
            pdf.setFillColor(br, bg, bb);
            pdf.rect(0, H - FOOTER, W, FOOTER, 'F');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            pdf.setTextColor(muted[0], muted[1], muted[2]);
            if (footerText) pdf.text(footerText.slice(0, 160), MARGIN, H - 3.5);
            const p = `Page ${n} of ${total}`;
            pdf.text(p, W - MARGIN - pdf.getTextWidth(p), H - 3.5);
        };

        let n = 0;
        if (coverCanvas) {
            n++;
            paint();
            const maxW = contentW;
            const maxH = H - MARGIN * 2 - FOOTER;
            let w = maxW;
            let h = w * (coverCanvas.height / coverCanvas.width);
            if (h > maxH) { h = maxH; w = h * (coverCanvas.width / coverCanvas.height); }
            pdf.addImage(coverCanvas.toDataURL('image/png'), 'PNG', (W - w) / 2, Math.max(MARGIN, (H - FOOTER - h) / 2), w, h, undefined, 'FAST');
            footer(n);
        }
        const img = body.toDataURL('image/png');
        for (let i = 0; i < bodyPages; i++) {
            if (n > 0) pdf.addPage();
            n++;
            paint();
            const top = MARGIN + HEADER;
            pdf.addImage(img, 'PNG', MARGIN, top - i * perPage, contentW, bodyH, undefined, 'FAST');
            // mask above the content and draw the running header
            pdf.setFillColor(br, bg, bb);
            pdf.rect(0, 0, W, top, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(ink[0], ink[1], ink[2]);
            pdf.text((company ? `${company} · ${o.name}` : o.name).slice(0, 120), MARGIN, MARGIN + 5);
            if (o.dateLabel) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(muted[0], muted[1], muted[2]);
                pdf.text(o.dateLabel, W - MARGIN - pdf.getTextWidth(o.dateLabel), MARGIN + 5);
            }
            footer(n);
        }
        const safe = (o.filename || o.name).replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'report';
        pdf.save(`${safe}.pdf`);
    } finally {
        freeze.remove();
    }
}
