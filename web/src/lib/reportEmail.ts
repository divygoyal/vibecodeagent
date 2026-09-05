/**
 * Report-email orchestrator — used by the superadmin "Email Report" action.
 *
 * Pulls a target user's saved workspace + Google tokens via the admin API,
 * runs the existing report pipeline (fetch → analyze → Gemini synth →
 * generate PDF), then ships the result via Brevo with the rendered PDF
 * attached.
 *
 * Body is rendered INLINE here (subject + htmlContent path, no Brevo
 * templateId) because the report email is heavily data-driven —
 * 2-3 dynamic finding cards, a "highest-impact move" callout, deep-link
 * AI-chat CTAs that carry the workspace context — and Brevo's templating
 * engine escapes HTML and doesn't support {% if %} from the API. Welcome
 * email stays templated (it's static).
 */

import { sendTransactional } from './brevo';
import { fetchGoogleTokensFromDb, getValidAccessToken } from './googleApi';
import { computePeriod, fetchReportData, type ReportPeriod, type ReportRawData } from './reportDataFetcher';
import { analyzeReportData, type ReportAnalysis } from './reportAnalysis';
import { synthesizeWithGemini } from './reportGeminiSynth';
import { generateReportPdf } from './reportPdfGenerate';
import { BRAND_NAME, SITE_URL, LOGO_LIGHT_SRC } from '@/lib/brand';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const PUBLIC_DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || 'https://trafficclaw.com/dashboard/analytics';
// Base URL used to build deep links inside the email body. Strips any
// /dashboard/* suffix from PUBLIC_DASHBOARD_URL so we can append /ai-chat,
// /seo, etc. cleanly. Override via PUBLIC_DASHBOARD_BASE_URL if your
// dashboard is mounted somewhere non-standard.
const DASHBOARD_BASE_URL = (
    process.env.PUBLIC_DASHBOARD_BASE_URL ||
    PUBLIC_DASHBOARD_URL.replace(/\/dashboard(\/.*)?$/, '/dashboard') ||
    'https://trafficclaw.com/dashboard'
).replace(/\/$/, '');

// ─── Public types ──────────────────────────────────────────────────────────

export interface SendUserReportEmailInput {
    /** OAuth provider ID string (session.user.id-equivalent) — admin API resolves to DB user. */
    userId: string;
    period: 'weekly' | 'monthly';
    /** Optional override — when not set, the user's saved selected_property_id is used.
     *  Set when the superadmin picks a specific property in the user-profile drawer. */
    propertyId?: string | null;
    /** Optional override — same idea, falls back to the user's saved selected_site_url. */
    siteUrl?: string | null;
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

    // Chart styled for the LIGHT-theme template card (#f9fafb wrapper):
    //   • subtle dark grid lines instead of dark bg lines
    //   • mid-grey ticks readable on a light bg
    //   • cyan stroke + low-opacity fill = brand-on-white
    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#14C4E1',
                backgroundColor: 'rgba(20,196,225,0.14)',
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
                    grid: { color: 'rgba(15,23,42,0.06)', borderColor: 'rgba(15,23,42,0.08)' },
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

// ─── Subject + findings + highest-impact helpers ───────────────────────────

/** URL-encoder friendly to email clients — RFC3986 + email-safe. */
function buildAiChatUrl(question: string, propertyId: string, siteUrl: string): string {
    const u = new URL(`${DASHBOARD_BASE_URL}/ai-chat`);
    u.searchParams.set('q', question.slice(0, 320));
    if (propertyId) u.searchParams.set('property', propertyId);
    if (siteUrl) u.searchParams.set('site', siteUrl);
    return u.toString();
}

/** Branded, predictable subject line. The earlier high-CTR variant pulled
 *  the loudest finding into the subject ("best ai coding agent is 1 spot
 *  from page 1") which made every email read like a hook instead of a
 *  report — back to the steady "Your {Weekly|Monthly} TrafficClaw report —
 *  {date range}" format. analysis + siteLabel kept on the signature so we
 *  can re-introduce per-period flavour later without touching callers. */
export function buildSubjectLine(
    _analysis: ReportAnalysis,
    period: 'weekly' | 'monthly',
    _siteLabel: string,
    dateRange: string,
): string {
    const periodCap = period === 'weekly' ? 'Weekly' : 'Monthly';
    return `Your ${periodCap} ${BRAND_NAME} report — ${dateRange}`;
}

interface FindingCard {
    /** Lucide icon slug — rendered via Iconify's hosted-SVG endpoint so the
     *  email gets a clean line-style mark in every modern client. The SVG is
     *  served from api.iconify.design and recoloured via query string to the
     *  brand cyan (#0891B2). Outlook desktop (which can't render SVG-via-img)
     *  shows a broken-image silhouette but layout stays intact. */
    icon: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
    /** Right-side number callout, e.g. "+420", "~280", "-630". Optional. */
    metricValue?: string;
    /** Small caps label under the number, e.g. "EST. CLICKS / MO". */
    metricLabel?: string;
    /** true → green (positive), false → red (negative), undefined → cyan. */
    metricPositive?: boolean;
}

/** Build the Iconify hosted-SVG URL for a Lucide icon, recolored to the
 *  brand cyan and sized for the email. Used by both card renderers and by
 *  the section eyebrow. Kept as a single source of truth so swapping CDN
 *  later (or self-hosting under /icons/) is a one-line change. */
function iconUrl(slug: string, size: number = 22, hexNoHash: string = '0891B2'): string {
    return `https://api.iconify.design/lucide/${slug}.svg?color=%23${hexNoHash}&width=${size}&height=${size}`;
}

export function buildFindings(
    analysis: ReportAnalysis,
    propertyId: string,
    siteUrl: string,
): FindingCard[] {
    const cards: FindingCard[] = [];

    // Priority order — first card is most important. Visual treatment is
    // identical for every card; hierarchy comes from position, not color.

    // 1. Critical alert — biggest "you have a problem" signal
    if (analysis.criticalAlerts && analysis.criticalAlerts.length > 0) {
        const a = analysis.criticalAlerts[0];
        const detail = (a.detail || '').replace(/\s+/g, ' ').trim();
        cards.push({
            icon: 'alert-triangle',
            title: a.title,
            body: detail || 'Open the dashboard for the full breakdown.',
            ctaLabel: 'Run AI investigation',
            ctaUrl: buildAiChatUrl(
                `Why ${a.title.toLowerCase().replace(/[?.!]+$/, '')}? ${detail ? detail + ' ' : ''}Help me understand the cause and what to do about it.`,
                propertyId,
                siteUrl,
            ),
        });
    }

    // 2. Striking-distance keyword
    const sdOpp = analysis.opportunities?.find((o) => o.type === 'striking_distance');
    if (sdOpp) {
        const slots = Math.max(1, Math.ceil(sdOpp.position - 10));
        const extra = Math.round(sdOpp.potentialClicks);
        cards.push({
            icon: 'search',
            title: `"${sdOpp.query}" is ${slots} ${slots === 1 ? 'spot' : 'spots'} from page 1`,
            body: `Currently #${sdOpp.position.toFixed(1)} with ${sdOpp.impressions.toLocaleString()} impressions.`,
            ctaLabel: 'Get the push-to-page-1 plan',
            ctaUrl: buildAiChatUrl(
                `My biggest opportunity is "${sdOpp.query}" at position #${sdOpp.position.toFixed(1)} with ${extra} clicks of upside. Give me a 3-step plan to push it onto page 1.`,
                propertyId,
                siteUrl,
            ),
            metricValue: `~${extra.toLocaleString()}`,
            metricLabel: 'Extra clicks',
            metricPositive: true,
        });
    }

    // 3. Decay page
    if (analysis.decayPages && analysis.decayPages.length > 0) {
        const d = analysis.decayPages[0];
        const pct = Math.round(((d.currentClicks - d.prevClicks) / Math.max(d.prevClicks, 1)) * -100);
        if (pct > 5) {
            const lost = Math.max(d.prevClicks - d.currentClicks, 0);
            cards.push({
                icon: 'trending-down',
                title: `${d.page} is decaying`,
                body: `Clicks down ${pct}% (${d.prevClicks.toLocaleString()} → ${d.currentClicks.toLocaleString()}). Position drift from #${d.prevPosition.toFixed(1)} to #${d.currentPosition.toFixed(1)}.`,
                ctaLabel: 'Refresh content with AI',
                ctaUrl: buildAiChatUrl(
                    `Help me refresh ${d.page} — clicks dropped ${pct}% and the page slipped from #${d.prevPosition.toFixed(1)} to #${d.currentPosition.toFixed(1)}. What specifically should I update first?`,
                    propertyId,
                    siteUrl,
                ),
                metricValue: `-${lost.toLocaleString()}`,
                metricLabel: 'Clicks lost',
                metricPositive: false,
            });
        }
    }

    // 4. Cannibalization (only if there's still room)
    if (cards.length < 3 && analysis.cannibalization && analysis.cannibalization.length > 0) {
        const c = analysis.cannibalization[0];
        const sample = c.pages.slice(0, 5).map((p) => p.page).join(', ');
        // Rough estimate: consolidating 4 splintered pages typically lifts the
        // surviving one ~50% of total combined clicks (the rest is duplication
        // that won't survive consolidation). Used only as the right-side
        // callout — the body still tells the user the underlying mechanic.
        const potentialLift = Math.round(c.totalClicks * 0.5);
        cards.push({
            icon: 'layers',
            title: `${c.pages.length} pages compete for "${c.query}"`,
            body: `${c.totalClicks.toLocaleString()} clicks split across ${c.pages.length} pages. Consolidate to one and lift authority.`,
            ctaLabel: 'See the consolidation plan',
            ctaUrl: buildAiChatUrl(
                `I have ${c.pages.length} pages competing for "${c.query}": ${sample}. Which should I consolidate to and what's the redirect/canonical strategy?`,
                propertyId,
                siteUrl,
            ),
            metricValue: `+${potentialLift.toLocaleString()}`,
            metricLabel: 'Potential clicks',
            metricPositive: true,
        });
    }

    // 5. Positive momentum keyword (only if we still have room)
    if (cards.length < 3 && analysis.keywordVelocity?.accelerating?.length) {
        const k = analysis.keywordVelocity.accelerating[0];
        cards.push({
            icon: 'trending-up',
            title: `"${k.query}" is climbing fast`,
            body: `Position improved by ${Math.abs(k.positionDelta).toFixed(1)} (now #${k.currentPosition.toFixed(1)}). Push it before momentum fades.`,
            ctaLabel: 'How to keep climbing',
            ctaUrl: buildAiChatUrl(
                `"${k.query}" climbed from #${k.prevPosition.toFixed(1)} to #${k.currentPosition.toFixed(1)}. What's the playbook to keep it moving toward #1 before momentum fades?`,
                propertyId,
                siteUrl,
            ),
            metricValue: `+${k.clickDelta.toLocaleString()}`,
            metricLabel: 'Extra clicks',
            metricPositive: true,
        });
    }

    return cards.slice(0, 3);
}

/** Single boldest action of the period — picked by revenue impact. */
export function buildHighestImpactMove(
    analysis: ReportAnalysis,
    propertyId: string,
    siteUrl: string,
): FindingCard | null {
    const opp = (analysis.opportunities || [])
        .slice()
        .sort((a, b) => (b.revenueEstimate || 0) - (a.revenueEstimate || 0))[0];
    if (opp && opp.revenueEstimate > 100) {
        const extra = Math.round(opp.potentialClicks);
        return {
            icon: 'rocket',
            title: `Push "${opp.query}" to page 1`,
            body: `At #${opp.position.toFixed(1)} today. Estimated impact: +${extra} clicks/mo (~$${Math.round(opp.revenueEstimate)}/mo at typical CTR).`,
            ctaLabel: 'Open AI plan',
            ctaUrl: buildAiChatUrl(
                `My single highest-impact move: "${opp.query}" at #${opp.position.toFixed(1)} with $${Math.round(opp.revenueEstimate)}/mo upside. Give me the concrete 3-step plan to win it.`,
                propertyId,
                siteUrl,
            ),
            metricValue: `+${extra.toLocaleString()}`,
            metricLabel: 'Est. clicks / mo',
            metricPositive: true,
        };
    }
    if (analysis.decayPages && analysis.decayPages.length > 0) {
        const d = analysis.decayPages[0];
        const pct = Math.round(((d.currentClicks - d.prevClicks) / Math.max(d.prevClicks, 1)) * -100);
        if (pct > 15) {
            // Body claims 30-60% recovery on refresh — pick the midpoint (45%)
            // for the right-side stat so the number ties to the body claim.
            const recoverable = Math.round(Math.max(d.prevClicks - d.currentClicks, 0) * 0.45);
            return {
                icon: 'refresh-cw',
                title: `Refresh ${d.page}`,
                body: `Clicks down ${pct}%. A targeted refresh typically recovers 30-60% of lost traffic.`,
                ctaLabel: 'Open AI plan',
                ctaUrl: buildAiChatUrl(
                    `${d.page} lost ${pct}% clicks. Help me refresh it — what specifically should change first?`,
                    propertyId,
                    siteUrl,
                ),
                metricValue: `+${recoverable.toLocaleString()}`,
                metricLabel: 'Recoverable / mo',
                metricPositive: true,
            };
        }
    }
    return null;
}

// Minimal HTML escape for body strings going into the inline email template.
// Server-side rendering means we control the data, but a malicious property
// name or query string shouldn't be able to inject markup. Keeps the email
// safe + standards-compliant.
function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

interface RenderInput {
    firstName: string;
    periodLabel: string;
    periodPhrase: string;
    siteLabel: string;
    dateRange: string;
    chartUrl: string;

    sessions: string;
    sessionsDelta: string;
    sessionsColor: string;
    sessionsArrow: string;
    users: string;
    usersDelta: string;
    usersColor: string;
    usersArrow: string;
    pageviews: string;
    pageviewsDelta: string;
    pageviewsColor: string;
    pageviewsArrow: string;
    avgDuration: string;
    avgDurationDelta: string;
    avgDurationColor: string;
    avgDurationArrow: string;

    highlightText: string;
    findings: FindingCard[];
    highestImpact: FindingCard | null;
    pdfFilename: string;
    dashboardUrl: string;
}

/** Color for the right-side metric callout: green/red for positive/negative
 *  click signals, brand cyan as the neutral default. */
function metricColor(positive?: boolean): string {
    if (positive === true) return '#059669';   // emerald-600
    if (positive === false) return '#dc2626';  // red-600
    return '#0891B2';                          // cyan-600
}

/** Compact horizontal row used for the "Other findings" list under the
 *  highest-impact card. Layout: cyan-tinted icon circle | title + body |
 *  big colored metric + label | chevron. Whole row is wrapped in <a> so any
 *  click in the row deep-links to the AI-chat plan for that finding. */
function renderFindingCard(f: FindingCard): string {
    const m = f.metricValue ? `
              <td valign="middle" align="right" width="100" style="padding:14px 6px 14px 6px;">
                <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${metricColor(f.metricPositive)};line-height:1.1;white-space:nowrap;">${esc(f.metricValue)}</div>
                ${f.metricLabel ? `<div style="font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;margin-top:4px;">${esc(f.metricLabel)}</div>` : ''}
              </td>` : '';
    return `
        <a href="${f.ctaUrl}" style="display:block;text-decoration:none;color:inherit;margin-bottom:8px;" target="_blank">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #eef0f3;border-radius:10px;border-collapse:separate;">
            <tr>
              <td width="48" valign="middle" align="center" style="padding:14px 0 14px 14px;">
                <div style="width:34px;height:34px;border-radius:9999px;background:rgba(20,196,225,0.1);text-align:center;line-height:34px;">
                  <img src="${iconUrl(f.icon, 18)}" alt="" width="18" height="18" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
                </div>
              </td>
              <td valign="middle" style="padding:14px 10px 14px 10px;">
                <div style="font-size:14px;font-weight:600;color:#0a0d12;line-height:1.35;letter-spacing:-0.01em;margin-bottom:2px;">${esc(f.title)}</div>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">${esc(f.body)}</p>
              </td>
              ${m}
              <td valign="middle" align="center" width="24" style="padding:14px 12px 14px 4px;color:#a1a1aa;font-size:16px;line-height:1;font-family:Georgia,serif;">&rsaquo;</td>
            </tr>
          </table>
        </a>`;
}

/** Hero card for the single highest-impact move. Layout: rocket-in-cyan-circle
 *  | pill + title + body + filled cyan CTA | big cyan metric. Cyan-tinted
 *  background plus a 4px solid cyan left stripe makes it the visual anchor
 *  of the opportunities section without resorting to a darker fill. */
function renderHighestImpactCard(f: FindingCard): string {
    const metricCol = f.metricValue ? `
              <td valign="middle" align="right" width="116" style="padding:20px 20px 20px 6px;">
                <div style="font-size:30px;font-weight:700;color:${metricColor(f.metricPositive)};letter-spacing:-0.025em;line-height:1.05;white-space:nowrap;">${esc(f.metricValue)}</div>
                ${f.metricLabel ? `<div style="font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#52525b;margin-top:5px;">${esc(f.metricLabel)}</div>` : ''}
              </td>` : '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fbfd" style="background:#f0fbfd;border:1px solid rgba(20,196,225,0.25);border-left:4px solid #14C4E1;border-radius:12px;border-collapse:separate;margin-bottom:14px;">
          <tr>
            <td width="68" valign="top" align="center" style="padding:20px 0 20px 16px;">
              <div style="width:46px;height:46px;border-radius:9999px;background:rgba(20,196,225,0.18);text-align:center;line-height:46px;">
                <img src="${iconUrl(f.icon || 'rocket', 24)}" alt="" width="24" height="24" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
              </div>
            </td>
            <td valign="top" style="padding:20px 12px 20px 12px;">
              <span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:#ffffff;border:1px solid rgba(8,145,178,0.4);color:#0891B2;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:8px;">Highest Impact</span>
              <div style="font-size:15px;font-weight:700;color:#0a0d12;line-height:1.3;letter-spacing:-0.01em;margin-bottom:5px;">${esc(f.title)}</div>
              <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#52525b;">${esc(f.body)}</p>
              <a href="${f.ctaUrl}" style="display:inline-block;background:#14C4E1;background-image:linear-gradient(135deg,#14C4E1 0%,#0891B2 100%);color:#ffffff;text-decoration:none;font-weight:600;font-size:12px;padding:8px 14px;border-radius:9999px;letter-spacing:-0.005em;" target="_blank">${esc(f.ctaLabel)} &rarr;</a>
            </td>
            ${metricCol}
          </tr>
        </table>`;
}

export function renderReportEmailHtml(input: RenderInput): string {
    const findingsHtml = input.findings.map(renderFindingCard).join('\n');
    const highestImpactHtml = input.highestImpact ? renderHighestImpactCard(input.highestImpact) : '';
    const hasOpportunities = !!input.highestImpact || input.findings.length > 0;
    const opportunitiesSection = hasOpportunities ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 12px;">
          <tr><td>
            <p class="section-eyebrow" style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#0891B2;">
              &#10022; ${esc(input.periodLabel)} Opportunities
            </p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
              Top opportunities to grow your organic traffic
            </p>
          </td></tr>
        </table>
        ${highestImpactHtml}
        ${findingsHtml}
        ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="IE=edge">
<title>Your ${esc(input.periodLabel)} ${BRAND_NAME} report</title>
<style>
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .gutter { padding-left: 0 !important; padding-right: 0 !important; }
    .card {
      padding: 24px 18px !important;
      border-radius: 14px !important;
      border-left-width: 0 !important;
      border-right-width: 0 !important;
    }
    .logo-wrap { padding-left: 18px !important; padding-right: 18px !important; }
    .heading { font-size: 22px !important; line-height: 1.22 !important; }
    .lede { font-size: 13px !important; }
    .stat-label { font-size: 9px !important; }
    .stat-value { font-size: 17px !important; }
    .stat-delta { font-size: 11px !important; }
    .cta {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 13px 18px !important;
      text-align: center !important;
    }
    .section-eyebrow { font-size: 10px !important; }
    .inside-row { font-size: 13px !important; padding: 8px 0 !important; }
    .footer-wrap { padding-left: 18px !important; padding-right: 18px !important; }
    .footer-copy { font-size: 12px !important; }
    .highlight-text { font-size: 13px !important; }
  }
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  table { border-collapse: collapse !important; }
  a { word-break: break-word; }
</style>
</head>
<body bgcolor="#f4f6f8" style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f6f8" style="background:#f4f6f8;">
  <tr><td align="center" class="gutter" style="padding:32px 16px;">
    <table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

      <tr><td class="logo-wrap" align="left" style="padding:0 0 22px;">
        <a href="${SITE_URL}" style="text-decoration:none;display:inline-block;" target="_blank">
          <img src="${SITE_URL}${LOGO_LIGHT_SRC}" alt="${BRAND_NAME}" width="150" height="30" style="display:inline-block;width:150px;height:30px;max-width:150px;border:0;outline:none;">
        </a>
      </td></tr>

      <tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e4e7ec;border-radius:18px;padding:30px 26px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">

        <div class="section-eyebrow" style="display:inline-block;padding:5px 12px;border-radius:9999px;background:rgba(20,196,225,0.1);border:1px solid rgba(20,196,225,0.25);color:#0891B2;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:16px;">
          ${esc(input.periodLabel)} report
        </div>

        <h1 class="heading" style="margin:0 0 6px;font-size:24px;line-height:1.22;font-weight:700;letter-spacing:-0.025em;color:#0a0d12;">
          Your ${esc(input.periodLabel)} report, ${esc(input.firstName)}.
        </h1>
        <p class="lede" style="margin:0 0 22px;font-size:13px;line-height:1.5;color:#71717a;">
          ${esc(input.siteLabel)} &middot; ${esc(input.dateRange)}
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
          <tr><td bgcolor="#f9fafb" style="background:#f9fafb;border:1px solid #e4e7ec;border-radius:12px;padding:8px;">
            <img src="${input.chartUrl}" alt="Sessions trend" style="display:block;width:100%;max-width:100%;height:auto;border-radius:8px;border:0;outline:none;">
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
          <tr>
            <td width="50%" valign="top" style="padding:0 5px 10px 0;">
              <div style="background:#f9fafb;border:1px solid #e4e7ec;border-radius:10px;padding:11px 13px;">
                <div class="stat-label" style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">Sessions</div>
                <div class="stat-value" style="font-size:19px;font-weight:700;color:#0a0d12;letter-spacing:-0.02em;line-height:1.1;">${esc(input.sessions)}</div>
                <div class="stat-delta" style="font-size:11px;font-weight:600;margin-top:4px;color:${input.sessionsColor};">${input.sessionsArrow} ${esc(input.sessionsDelta)}</div>
              </div>
            </td>
            <td width="50%" valign="top" style="padding:0 0 10px 5px;">
              <div style="background:#f9fafb;border:1px solid #e4e7ec;border-radius:10px;padding:11px 13px;">
                <div class="stat-label" style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">Active users</div>
                <div class="stat-value" style="font-size:19px;font-weight:700;color:#0a0d12;letter-spacing:-0.02em;line-height:1.1;">${esc(input.users)}</div>
                <div class="stat-delta" style="font-size:11px;font-weight:600;margin-top:4px;color:${input.usersColor};">${input.usersArrow} ${esc(input.usersDelta)}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td width="50%" valign="top" style="padding:0 5px 0 0;">
              <div style="background:#f9fafb;border:1px solid #e4e7ec;border-radius:10px;padding:11px 13px;">
                <div class="stat-label" style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">Pageviews</div>
                <div class="stat-value" style="font-size:19px;font-weight:700;color:#0a0d12;letter-spacing:-0.02em;line-height:1.1;">${esc(input.pageviews)}</div>
                <div class="stat-delta" style="font-size:11px;font-weight:600;margin-top:4px;color:${input.pageviewsColor};">${input.pageviewsArrow} ${esc(input.pageviewsDelta)}</div>
              </div>
            </td>
            <td width="50%" valign="top" style="padding:0 0 0 5px;">
              <div style="background:#f9fafb;border:1px solid #e4e7ec;border-radius:10px;padding:11px 13px;">
                <div class="stat-label" style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">Avg session</div>
                <div class="stat-value" style="font-size:19px;font-weight:700;color:#0a0d12;letter-spacing:-0.02em;line-height:1.1;">${esc(input.avgDuration)}</div>
                <div class="stat-delta" style="font-size:11px;font-weight:600;margin-top:4px;color:${input.avgDurationColor};">${input.avgDurationArrow} ${esc(input.avgDurationDelta)}</div>
              </div>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
          <tr>
            <td width="3" bgcolor="#0891B2" style="background:#0891B2;width:3px;line-height:1px;font-size:1px;">&nbsp;</td>
            <td bgcolor="#f9fafb" style="background:#f9fafb;padding:13px 16px;border-radius:0 6px 6px 0;">
              <p class="highlight-text" style="margin:0;font-size:14px;line-height:1.55;color:#3f3f46;">
                ${esc(input.highlightText)}
              </p>
            </td>
          </tr>
        </table>

        ${opportunitiesSection}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fbfd" style="background:#f0fbfd;border:1px solid rgba(20,196,225,0.25);border-radius:12px;margin-top:6px;">
          <tr>
            <td valign="top" width="44" style="padding:14px 0 14px 16px;">
              <div style="width:34px;height:34px;border-radius:9999px;background:rgba(20,196,225,0.18);text-align:center;line-height:34px;">
                <span style="font-size:16px;color:#0891B2;">&#128206;</span>
              </div>
            </td>
            <td valign="top" style="padding:14px 16px;">
              <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#0a0d12;letter-spacing:-0.01em;">
                Your full report is attached as a PDF
              </p>
              <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#52525b;">
                Open the attachment to read the complete report &mdash; charts, tables, query rankings, and deep insights.
              </p>
              <p style="margin:0;font-size:11px;color:#71717a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
                ${esc(input.pdfFilename)}
              </p>
            </td>
          </tr>
        </table>

        <hr style="border:none;border-top:1px solid #e4e7ec;margin:26px 0 18px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <!--[if mso]>
            <a href="${input.dashboardUrl}" style="text-decoration:none;">
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${input.dashboardUrl}" style="height:42px;v-text-anchor:middle;width:200px;" arcsize="50%" stroke="f" fillcolor="#14C4E1">
              <w:anchorlock/>
              <center style="color:#031017;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;">Open dashboard &rarr;</center>
            </v:roundrect>
            </a>
            <![endif]-->
            <!--[if !mso]><!-- -->
            <a href="${input.dashboardUrl}" class="cta" style="display:inline-block;background:#14C4E1;background-image:linear-gradient(135deg,#14C4E1 0%,#7AD9DA 100%);color:#031017;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:9999px;letter-spacing:-0.01em;" target="_blank">
              Open dashboard &nbsp;&rarr;
            </a>
            <!--<![endif]-->
          </td></tr>
        </table>

      </td></tr>

      <tr><td class="footer-wrap" style="padding:22px 8px 0;">
        <p class="footer-copy" style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#52525b;">
          Want to chat about the numbers? Reply to this email or hit <a href="https://trafficclaw.com/dashboard/support" style="color:#0891B2;text-decoration:none;font-weight:500;">Help &amp; Support</a> in the dashboard.
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#71717a;">&mdash; The ${BRAND_NAME} team</p>
        <p style="margin:14px 0 0;font-size:11px;color:#a1a1aa;">
          <a href="https://trafficclaw.com" style="color:#a1a1aa;text-decoration:none;">trafficclaw.com</a>
          &nbsp;&middot;&nbsp;
          <a href="mailto:hello@trafficclaw.com" style="color:#a1a1aa;text-decoration:none;">hello@trafficclaw.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
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

    // Caller-supplied property/site overrides (from the user-profile drawer's
    // per-property buttons) take precedence over the user's saved workspace
    // selection. Falling back to the saved selection lets the row-level Mail
    // icon keep working for "send for primary site" without overrides.
    const propertyId = (input.propertyId || user.selected_property_id || '').trim();
    const siteUrl = (input.siteUrl || user.selected_site_url || '').trim();
    if (!propertyId || !siteUrl) {
        return { ok: false, error: 'No GA4 property + GSC site available for this user (and none provided).' };
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
        rawData = await fetchReportData(accessToken, propertyId, siteUrl, reportPeriod);
        analysis = analyzeReportData(rawData);
        const gemini = await synthesizeWithGemini(analysis, reportPeriod, siteUrl, rawData);
        pdfBuffer = await generateReportPdf({ analysis, gemini, period: reportPeriod, siteUrl });
    } catch (err) {
        return { ok: false, error: `Report generation failed: ${(err as Error).message}` };
    }

    // Brevo's wire-payload cap is 10 MB. The base64-encoded PDF inflates the
    // raw buffer by ~4/3, plus the HTML body, plus payload framing. Anything
    // raw-PDF > 7 MB is risky; we cut at 7.0 MB to leave headroom for the
    // HTML body (~30-50 KB once rendered) and Brevo's overhead. Without this
    // guard a too-large send returns a generic "Brevo send failed" with no
    // clue why — admin had no signal that the size was the problem.
    const PDF_MAX_BYTES = 7_000_000;
    if (pdfBuffer.byteLength > PDF_MAX_BYTES) {
        const mb = (pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
        return {
            ok: false,
            error: `Report PDF is ${mb} MB which exceeds the 7 MB email-attachment limit (Brevo caps total payload at 10 MB). Try Weekly instead of Monthly, or download the PDF from the user-detail drawer and forward it manually.`,
        };
    }

    // ─── Build all template params (plain strings only) ───
    const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
    const periodPhrase = period === 'weekly' ? 'this week' : 'this month';
    const dateRange = formatDateRange(reportPeriod);
    const slug = siteSlug(siteUrl);
    const pdfFilename = `${slug}-${period}-${reportPeriod.endDate}.pdf`;
    const firstName = (user.github_username || user.email.split('@')[0] || 'there').trim();

    const sessions = deltaParts(analysis.kpis.sessionsDelta);
    const users = deltaParts(analysis.kpis.usersDelta);
    const pageviews = deltaParts(analysis.kpis.pageviewsDelta);
    const avgDurationDelta = deltaParts(computeAvgDurationDelta(rawData, analysis.kpis.avgSessionDuration));

    const chartUrl = buildChartUrl(analysis.dailySessions);
    const highlightText = buildHighlightText(analysis, period);

    // Build the dynamic bits — subject pulled from analysis, finding cards
    // sliced from criticalAlerts/opportunities/decayPages, and the bold
    // "highest-impact move" callout.
    const subject = buildSubjectLine(analysis, period, slug, dateRange);
    const findings = buildFindings(analysis, propertyId, siteUrl);
    const highestImpact = buildHighestImpactMove(analysis, propertyId, siteUrl);

    const html = renderReportEmailHtml({
        firstName,
        periodLabel,
        periodPhrase,
        siteLabel: slug,
        dateRange,
        chartUrl,

        sessions: formatCount(analysis.kpis.sessions),
        sessionsDelta: sessions.delta,
        sessionsColor: sessions.color,
        sessionsArrow: sessions.arrow,

        users: formatCount(analysis.kpis.users),
        usersDelta: users.delta,
        usersColor: users.color,
        usersArrow: users.arrow,

        pageviews: formatCount(analysis.kpis.pageviews),
        pageviewsDelta: pageviews.delta,
        pageviewsColor: pageviews.color,
        pageviewsArrow: pageviews.arrow,

        avgDuration: formatDuration(analysis.kpis.avgSessionDuration),
        avgDurationDelta: avgDurationDelta.delta,
        avgDurationColor: avgDurationDelta.color,
        avgDurationArrow: avgDurationDelta.arrow,

        highlightText,
        findings,
        highestImpact,
        pdfFilename,
        dashboardUrl: PUBLIC_DASHBOARD_URL,
    });

    const sendResult = await sendTransactional({
        toEmail: user.email,
        toName: user.github_username || firstName,
        // Inline HTML path — no templateId. Body is fully data-driven (per-user
        // findings cards, highest-impact callout, pre-filled AI-chat deep links).
        subject,
        htmlContent: html,
        attachments: [
            { name: pdfFilename, content: Buffer.from(pdfBuffer).toString('base64') },
        ],
    });

    if (sendResult.ok) {
        return { ok: true, messageId: sendResult.messageId };
    }
    return { ok: false, error: sendResult.error || 'Brevo send failed (see server logs).' };
}
