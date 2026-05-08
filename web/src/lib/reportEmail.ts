/**
 * Report-email orchestrator — used by the superadmin "Email Report" action.
 *
 * Pulls a target user's saved workspace + Google tokens via the admin API,
 * runs the existing report pipeline (fetch → analyze → Gemini synth →
 * generate PDF), then ships the result to the user via Brevo template ID 6
 * with the rendered PDF attached.
 *
 * All Brevo template params are PLAIN STRINGS — Brevo auto-escapes HTML in
 * `{{ params.X }}` substitutions, and {% if %} blocks aren't supported in
 * API-uploaded templates. So we pre-compute color/arrow/delta strings here.
 */

import { sendTransactional } from './brevo';
import { fetchGoogleTokensFromDb, getValidAccessToken } from './googleApi';
import { computePeriod, fetchReportData, type ReportPeriod, type ReportRawData } from './reportDataFetcher';
import { analyzeReportData, type ReportAnalysis } from './reportAnalysis';
import { synthesizeWithGemini } from './reportGeminiSynth';
import { generateReportPdf } from './reportPdfGenerate';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const PUBLIC_DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || 'https://trafficclaw.com/dashboard/analytics';
const BREVO_REPORT_TEMPLATE_ID = Number(process.env.BREVO_REPORT_TEMPLATE_ID || '6') || 6;

// ─── Public types ──────────────────────────────────────────────────────────

export interface SendUserReportEmailInput {
    /** OAuth provider ID string (session.user.id-equivalent) — admin API resolves to DB user. */
    userId: string;
    period: 'weekly' | 'monthly';
}

export interface SendUserReportEmailResult {
    ok: boolean;
    error?: string;
    /** Brevo's accepted-message ID, when ok=true. */
    messageId?: string;
}

// ─── Formatting helpers ────────────────────────────────────────────────────

function formatCount(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 100_000) return Math.round(n / 1000) + 'k';
    if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(n).toLocaleString('en-US');
}

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatDateRange(p: ReportPeriod): string {
    const fmt = (d: string) =>
        new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endYear = new Date(p.endDate + 'T00:00:00Z').getUTCFullYear();
    return `${fmt(p.startDate)} – ${fmt(p.endDate)}, ${endYear}`;
}

function siteSlug(siteUrl: string): string {
    return (siteUrl || 'site')
        .replace(/^sc-domain:/, '')
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'site';
}

interface DeltaParts {
    delta: string;
    color: string;
    arrow: string;
}

/** Convert a percentage delta into the (text, color, arrow) the template expects. */
function deltaParts(deltaPct: number): DeltaParts {
    const safe = Number.isFinite(deltaPct) ? deltaPct : 0;
    const up = safe >= 0;
    const sign = up ? '+' : '';
    return {
        delta: `${sign}${safe.toFixed(1)}%`,
        color: up ? '#34d399' : '#f87171',
        arrow: up ? '▲' : '▼',
    };
}

/** Avg-session-duration delta has to be computed manually — KPISummary doesn't expose it. */
function computeAvgDurationDelta(rawData: ReportRawData, currentAvg: number): number {
    const prev = rawData.ga4?.dailyPrev ?? [];
    let totalSessions = 0;
    let weightedDuration = 0;
    for (const day of prev) {
        const sessions = (day as { sessions?: number }).sessions ?? 0;
        const duration = (day as { avgSessionDuration?: number }).avgSessionDuration ?? 0;
        if (sessions > 0 && duration >= 0) {
            totalSessions += sessions;
            weightedDuration += sessions * duration;
        }
    }
    const prevAvg = totalSessions > 0 ? weightedDuration / totalSessions : 0;
    if (prevAvg <= 0) return 0;
    return ((currentAvg - prevAvg) / prevAvg) * 100;
}

// ─── Chart URL ─────────────────────────────────────────────────────────────

function buildChartUrl(daily: Array<{ date: string; sessions: number }>): string {
    if (!daily?.length) {
        // Edge case: no data yet. Empty chart URL — template still renders, image is just blank.
        return 'https://quickchart.io/chart?bkg=transparent&w=520&h=180&v=4&c=' +
            encodeURIComponent(JSON.stringify({
                type: 'line',
                data: { labels: [], datasets: [{ data: [] }] },
                options: { plugins: { legend: { display: false } } },
            }));
    }
    const labels = daily.map((d) => {
        const dt = new Date((d.date.length === 10 ? d.date : d.date) + 'T00:00:00Z');
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    });
    const data = daily.map((d) => d.sessions || 0);

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#14C4E1',
                backgroundColor: 'rgba(20,196,225,0.18)',
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: 0,
            }],
        },
        options: {
            plugins: { legend: { display: false }, title: { display: false } },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#71717a', font: { size: 10 } },
                },
                x: {
                    grid: { display: false, borderColor: 'transparent' },
                    ticks: { color: '#71717a', font: { size: 10 } },
                },
            },
        },
    };
    return 'https://quickchart.io/chart?bkg=transparent&w=520&h=180&v=4&c=' +
        encodeURIComponent(JSON.stringify(config));
}

// ─── Highlight one-liner ───────────────────────────────────────────────────

function buildHighlightText(analysis: ReportAnalysis, period: 'weekly' | 'monthly'): string {
    const phrase = period === 'weekly' ? 'this week' : 'this month';
    if (analysis.criticalAlerts?.length) {
        const top = analysis.criticalAlerts[0];
        const detail = (top.detail || '').replace(/\s+/g, ' ').trim();
        return detail ? `${top.title} — ${detail}` : top.title;
    }
    if (analysis.opportunities?.length) {
        const opp = analysis.opportunities[0];
        // Opportunity items are GSC-shaped (query + metrics) — phrase one human-readable line.
        const potential = opp.potentialClicks > 0 ? ` (~+${Math.round(opp.potentialClicks)} clicks)` : '';
        return `Top opportunity ${phrase}: "${opp.query}" at position ${opp.position.toFixed(1)}${potential}.`;
    }
    const sd = analysis.kpis?.sessionsDelta ?? 0;
    if (sd >= 0) {
        return `Sessions are up ${sd}% ${phrase} — see the full breakdown in the attached PDF.`;
    }
    return `Sessions are down ${Math.abs(sd)}% ${phrase} — the attached PDF unpacks why.`;
}

// ─── Admin API lookup ──────────────────────────────────────────────────────

interface UserDetailPayload {
    email: string | null;
    github_username: string | null;
    selected_property_id: string | null;
    selected_site_url: string | null;
}

async function fetchUserDetails(userId: string): Promise<UserDetailPayload | null> {
    if (!ADMIN_API_KEY) return null;
    const enc = encodeURIComponent(userId);
    try {
        const [profileRes, workspaceRes] = await Promise.all([
            fetch(`${ADMIN_API_URL}/api/users/${enc}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                signal: AbortSignal.timeout(8_000),
                cache: 'no-store',
            }),
            fetch(`${ADMIN_API_URL}/api/users/${enc}/workspace`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                signal: AbortSignal.timeout(8_000),
                cache: 'no-store',
            }),
        ]);
        if (!profileRes.ok) return null;
        const profile = await profileRes.json();
        const workspace = workspaceRes.ok ? await workspaceRes.json() : {};
        return {
            email: profile?.email || null,
            github_username: profile?.github_username || null,
            selected_property_id: workspace?.selected_property_id || null,
            selected_site_url: workspace?.selected_site_url || null,
        };
    } catch {
        return null;
    }
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function sendUserReportEmail(input: SendUserReportEmailInput): Promise<SendUserReportEmailResult> {
    const { userId, period } = input;
    if (period !== 'weekly' && period !== 'monthly') {
        return { ok: false, error: 'Invalid period — must be weekly or monthly' };
    }

    const user = await fetchUserDetails(userId);
    if (!user) return { ok: false, error: 'Could not load user from admin API' };
    if (!user.email) return { ok: false, error: 'User has no email on file' };
    if (!user.selected_property_id || !user.selected_site_url) {
        return { ok: false, error: 'User has not finished workspace setup (no GA4 property + GSC site).' };
    }

    const tokens = await fetchGoogleTokensFromDb(userId);
    if (!tokens?.refreshToken && !tokens?.accessToken) {
        return { ok: false, error: 'User has not connected Google Analytics.' };
    }

    let accessToken: string;
    try {
        accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch (err) {
        return { ok: false, error: `Could not refresh Google token: ${(err as Error).message}` };
    }

    const reportPeriod = computePeriod(period);

    let rawData: ReportRawData;
    let analysis: ReportAnalysis;
    let pdfBuffer: Uint8Array;
    try {
        rawData = await fetchReportData(accessToken, user.selected_property_id, user.selected_site_url, reportPeriod);
        analysis = analyzeReportData(rawData);
        const gemini = await synthesizeWithGemini(analysis, reportPeriod, user.selected_site_url, rawData);
        pdfBuffer = await generateReportPdf({ analysis, gemini, period: reportPeriod, siteUrl: user.selected_site_url });
    } catch (err) {
        return { ok: false, error: `Report generation failed: ${(err as Error).message}` };
    }

    // ─── Build all template params (plain strings only) ───
    const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
    const periodPhrase = period === 'weekly' ? 'this week' : 'this month';
    const dateRange = formatDateRange(reportPeriod);
    const slug = siteSlug(user.selected_site_url);
    const pdfFilename = `${slug}-${period}-${reportPeriod.endDate}.pdf`;
    const firstName = (user.github_username || user.email.split('@')[0] || 'there').trim();

    const sessions = deltaParts(analysis.kpis.sessionsDelta);
    const users = deltaParts(analysis.kpis.usersDelta);
    const pageviews = deltaParts(analysis.kpis.pageviewsDelta);
    const avgDurationDelta = deltaParts(computeAvgDurationDelta(rawData, analysis.kpis.avgSessionDuration));

    const chartUrl = buildChartUrl(analysis.dailySessions);
    const highlightText = buildHighlightText(analysis, period);

    const ok = await sendTransactional({
        toEmail: user.email,
        toName: user.github_username || firstName,
        templateId: BREVO_REPORT_TEMPLATE_ID,
        params: {
            first_name: firstName,
            period_label: periodLabel,
            period_phrase: periodPhrase,
            site_label: slug,
            date_range: dateRange,
            chart_url: chartUrl,

            sessions: formatCount(analysis.kpis.sessions),
            sessions_delta: sessions.delta,
            sessions_color: sessions.color,
            sessions_arrow: sessions.arrow,

            users: formatCount(analysis.kpis.users),
            users_delta: users.delta,
            users_color: users.color,
            users_arrow: users.arrow,

            pageviews: formatCount(analysis.kpis.pageviews),
            pageviews_delta: pageviews.delta,
            pageviews_color: pageviews.color,
            pageviews_arrow: pageviews.arrow,

            avg_duration: formatDuration(analysis.kpis.avgSessionDuration),
            avg_duration_delta: avgDurationDelta.delta,
            avg_duration_color: avgDurationDelta.color,
            avg_duration_arrow: avgDurationDelta.arrow,

            highlight_text: highlightText,
            pdf_filename: pdfFilename,
            dashboard_url: PUBLIC_DASHBOARD_URL,
        },
        attachments: [
            { name: pdfFilename, content: Buffer.from(pdfBuffer).toString('base64') },
        ],
    });

    return ok ? { ok: true } : { ok: false, error: 'Brevo send failed (see server logs).' };
}
