/**
 * The HTML and plain-text of the scheduled dashboard email and of the confirmation email (round 9).
 * Pure: a model in, strings out. Email-safe: one 600 px table layout, inline styles, no scripts,
 * no web fonts, light colours only (mail apps restyle dark mode themselves). Everything the owner
 * typed is escaped.
 */
import { BRAND_NAME } from '@/lib/brand';
import type { DigestKpi, DigestModel } from './types';

export const esc = (s: unknown): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const INK = '#171a20';
const MUTED = '#636b78';
const LINE = '#e7eaee';
const CANVAS = '#f6f7f9';
const UP = '#12795a';
const DOWN = '#b42318';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const safeColor = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

function kpiCell(k: DigestKpi, width: string): string {
    const tone = k.delta?.tone === 'good' ? UP : k.delta?.tone === 'bad' ? DOWN : MUTED;
    const arrow = k.delta?.dir === 'up' ? '&#9650; ' : k.delta?.dir === 'down' ? '&#9660; ' : '';
    return `<td width="${width}" valign="top" style="padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;background:#ffffff;"><tr><td style="padding:12px 14px;">
<div style="font:500 12px/16px ${FONT};color:${MUTED};">${esc(k.label)}</div>
<div style="font:600 24px/30px ${FONT};color:${INK};margin-top:2px;">${esc(k.value)}</div>
${k.delta ? `<div style="font:600 12px/16px ${FONT};color:${tone};margin-top:2px;">${arrow}${esc(k.delta.text)}${k.compare ? ` <span style="font-weight:400;color:${MUTED};">${esc(k.compare)}</span>` : ''}</div>` : ''}
</td></tr></table></td>`;
}

function kpiGrid(kpis: DigestKpi[]): string {
    if (!kpis.length) return '';
    const per = kpis.length === 1 ? 1 : kpis.length === 2 || kpis.length === 4 ? 2 : 3;
    const w = `${Math.floor(100 / per)}%`;
    const rows: string[] = [];
    for (let i = 0; i < kpis.length; i += per) {
        const cells = kpis.slice(i, i + per).map((k) => kpiCell(k, w));
        while (cells.length < per) cells.push(`<td width="${w}" style="padding:6px;"></td>`);
        rows.push(`<tr>${cells.join('')}</tr>`);
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px;width:calc(100% + 12px);">${rows.join('')}</table>`;
}

export interface ReportRenderOptions {
    unsubscribeUrl: string;
    /** 'Weekly report' style kicker; default from the schedule. */
    isTest?: boolean;
    ownerEmail?: string;
}

export function reportSubject(m: DigestModel, opts: { isTest?: boolean } = {}): string {
    return `${opts.isTest ? '[Test] ' : ''}${m.dashboardName}: ${m.rangeLabel}`.slice(0, 200);
}

export function renderReportHtml(m: DigestModel, o: ReportRenderOptions): string {
    const accent = safeColor(m.accent, '#0d3a2c');
    const pages = m.pages.map((p) => `
<tr><td style="padding:18px 24px 4px 24px;">
${m.pages.length > 1 ? `<div style="font:600 15px/20px ${FONT};color:${INK};margin:0 0 6px 0;">${esc(p.title)}</div>` : ''}
${kpiGrid(p.kpis)}
${p.charts.map((c) => `<div style="margin:12px 0 0 0;"><img src="${esc(c.imageUrl)}" width="${Math.min(c.width, 552)}" alt="${esc(c.alt)}" style="display:block;width:100%;max-width:552px;height:auto;border:1px solid ${LINE};border-radius:10px;"></div>`).join('')}
</td></tr>`).join('');
    const preheader = m.pages.flatMap((p) => p.kpis).slice(0, 3).map((k) => `${k.label} ${k.value}${k.delta ? ` (${k.delta.dir === 'down' ? '-' : k.delta.dir === 'up' ? '+' : ''}${k.delta.text.replace(/^[-+]/, '')})` : ''}`).join(' · ');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(reportSubject(m, o))}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
<tr><td style="padding:22px 24px 14px 24px;border-top:4px solid ${accent};border-radius:14px 14px 0 0;">
${o.isTest ? `<div style="display:inline-block;font:600 11px/16px ${FONT};color:#7a4b00;background:#fff4d6;border-radius:6px;padding:2px 8px;margin-bottom:8px;">TEST EMAIL, sent to you only</div>` : ''}
<div style="font:600 12px/16px ${FONT};color:${accent};letter-spacing:.04em;text-transform:uppercase;">${esc(m.company || BRAND_NAME)}</div>
<div style="font:700 22px/28px ${FONT};color:${INK};margin-top:4px;">${esc(m.dashboardName)}</div>
<div style="font:400 13px/18px ${FONT};color:${MUTED};margin-top:2px;">${esc(m.rangeLabel)}${m.siteLabel ? ` &middot; ${esc(m.siteLabel)}` : ''}</div>
${m.message ? `<div style="font:400 14px/21px ${FONT};color:${INK};margin-top:12px;padding:10px 12px;background:${CANVAS};border-radius:8px;white-space:pre-wrap;">${esc(m.message)}</div>` : ''}
</td></tr>
${pages}
<tr><td align="left" style="padding:20px 24px 8px 24px;">
<a href="${esc(m.viewUrl)}" style="display:inline-block;background:${accent};color:#ffffff;font:600 14px/20px ${FONT};text-decoration:none;padding:11px 20px;border-radius:9px;">View dashboard</a>
<div style="font:400 12px/18px ${FONT};color:${MUTED};margin-top:8px;">${m.viewKind === 'public' ? 'Opens the shared view of this dashboard (it may ask for a password).' : `Opens the dashboard in ${esc(BRAND_NAME)}; you need to be signed in as its owner.`}</div>
</td></tr>
<tr><td style="padding:18px 24px 22px 24px;border-top:1px solid ${LINE};">
<div style="font:400 12px/18px ${FONT};color:${MUTED};">${esc(m.scheduleText)}${o.ownerEmail ? ` Scheduled by ${esc(o.ownerEmail)}.` : ''}</div>
<div style="font:400 12px/18px ${FONT};color:${MUTED};margin-top:6px;"><a href="${esc(o.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from these emails</a> &middot; Sent by ${esc(BRAND_NAME)}</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderReportText(m: DigestModel, o: ReportRenderOptions): string {
    const lines: string[] = [m.dashboardName, m.rangeLabel + (m.siteLabel ? ` · ${m.siteLabel}` : ''), ''];
    if (o.isTest) lines.unshift('[TEST EMAIL, sent to you only]');
    if (m.message) lines.push(m.message, '');
    for (const p of m.pages) {
        if (m.pages.length > 1) lines.push(p.title.toUpperCase());
        for (const k of p.kpis) lines.push(`${k.label}: ${k.value}${k.delta ? ` (${k.delta.dir === 'down' ? '-' : k.delta.dir === 'up' ? '+' : ''}${k.delta.text.replace(/^[-+]/, '')}${k.compare ? ` ${k.compare}` : ''})` : ''}`);
        lines.push('');
    }
    lines.push(`View dashboard: ${m.viewUrl}`, '', m.scheduleText, `Unsubscribe: ${o.unsubscribeUrl}`);
    return lines.join('\n');
}

// ── confirmation email (recipients other than the owner) ─────────────────

export interface ConfirmModel {
    dashboardName: string;
    ownerEmail: string;
    scheduleText: string;
    confirmUrl: string;
    declineUrl: string;
}

export const confirmSubject = (m: ConfirmModel) => `${m.ownerEmail} wants to email you the report "${m.dashboardName}"`.slice(0, 200);

export function renderConfirmHtml(m: ConfirmModel): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(confirmSubject(m))}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
<tr><td style="padding:24px;">
<div style="font:600 12px/16px ${FONT};color:#0d3a2c;letter-spacing:.04em;text-transform:uppercase;">${esc(BRAND_NAME)}</div>
<div style="font:700 20px/26px ${FONT};color:${INK};margin-top:6px;">Do you want to get this report by email?</div>
<p style="font:400 15px/22px ${FONT};color:${INK};margin:12px 0 0 0;"><strong>${esc(m.ownerEmail)}</strong> set up an email report of the dashboard <strong>${esc(m.dashboardName)}</strong> and added your address. ${esc(m.scheduleText)}</p>
<p style="font:400 14px/21px ${FONT};color:${MUTED};margin:10px 0 0 0;">Nothing is sent to you until you say yes. If you do not know ${esc(m.ownerEmail)}, choose No.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
<td style="padding-right:10px;"><a href="${esc(m.confirmUrl)}" style="display:inline-block;background:#0d3a2c;color:#ffffff;font:600 14px/20px ${FONT};text-decoration:none;padding:11px 20px;border-radius:9px;">Yes, send me the report</a></td>
<td><a href="${esc(m.declineUrl)}" style="display:inline-block;background:#ffffff;color:${INK};font:600 14px/20px ${FONT};text-decoration:none;padding:10px 20px;border-radius:9px;border:1px solid ${LINE};">No</a></td>
</tr></table>
<p style="font:400 12px/18px ${FONT};color:${MUTED};margin:18px 0 0 0;">You get this one message only. The links open a page where you confirm your choice.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderConfirmText(m: ConfirmModel): string {
    return [
        `${m.ownerEmail} set up an email report of the dashboard "${m.dashboardName}" and added your address.`,
        m.scheduleText,
        'Nothing is sent to you until you say yes.',
        '',
        `Yes, send me the report: ${m.confirmUrl}`,
        `No: ${m.declineUrl}`,
    ].join('\n');
}
