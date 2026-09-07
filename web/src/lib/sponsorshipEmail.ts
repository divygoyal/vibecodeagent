/**
 * Transactional emails for a sponsorship request.
 *
 * Reuses the existing Brevo client (`src/lib/brevo.ts`) in subject+html mode
 * rather than templateId mode, because these bodies are data-heavy (a table of
 * sites and prices) and creating Brevo templates for a two-week experiment is
 * work that gets thrown away.
 *
 * Both sides get an email and both emails carry the other party's address in
 * the body, because fulfilment is manual: the point is to get the advertiser
 * and the publisher talking to each other directly. The operator is CC'd via
 * a separate send to SPONSORSHIP_OPERATOR_EMAIL so they can chase.
 *
 * Failure mode matches brevo.ts: log and return, never throw. A request that
 * was written to the database but whose email failed is recoverable (the
 * operator sees it in the requests list); a request lost to an exception
 * during email is not.
 */

import { sendTransactional } from './brevo';
import { formatCents } from './sponsorshipPricing';

const SITE_URL = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');
const OPERATOR_EMAIL = process.env.SPONSORSHIP_OPERATOR_EMAIL || process.env.BREVO_SENDER_EMAIL || '';

export interface SponsorshipEmailSite {
    entryId: number;
    name: string;
    domain: string | null;
    slug: string | null;
    priceCents: number;
    estimatedImpressions: number | null;
    publisherEmail: string | null;
    publisherName: string | null;
}

export interface SponsorshipEmailInput {
    requestId: number;
    advertiserEmail: string;
    advertiserName: string | null;
    advertiserSite: string | null;
    message: string | null;
    budgetCents: number | null;
    totalCents: number;
    sites: SponsorshipEmailSite[];
}

export interface SponsorshipEmailResult {
    advertiserSent: boolean;
    publishersSent: number;
    publishersFailed: number;
    operatorSent: boolean;
}

/** Minimal HTML escape. These strings are user-supplied and land in an email
 *  body, so they cannot go in raw. */
function esc(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function profileUrl(site: SponsorshipEmailSite): string {
    return `${SITE_URL}/leaderboard/${site.slug || site.entryId}`;
}

/** Plain inline styles only — email clients do not have a stylesheet. */
const WRAP = 'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b;';
const TD = 'padding:8px 10px;border-bottom:1px solid #e4e4e7;font-size:14px;';
const TH = 'padding:8px 10px;border-bottom:2px solid #18181b;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;text-align:left;color:#52525b;';

function siteTable(sites: SponsorshipEmailSite[], totalCents: number): string {
    const rows = sites
        .map(
            (s) => `<tr>
        <td style="${TD}"><a href="${esc(profileUrl(s))}" style="color:#0e7490;">${esc(s.name)}</a>${
            s.domain ? `<br><span style="color:#71717a;font-size:12px;">${esc(s.domain)}</span>` : ''
        }</td>
        <td style="${TD}text-align:right;">${
            s.estimatedImpressions ? s.estimatedImpressions.toLocaleString('en-US') : '—'
        }</td>
        <td style="${TD}text-align:right;font-weight:600;">${formatCents(s.priceCents)}</td>
      </tr>`,
        )
        .join('');
    return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead><tr>
        <th style="${TH}">Site</th>
        <th style="${TH}text-align:right;">Est. impressions / 30d</th>
        <th style="${TH}text-align:right;">Price / 30d</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="${TD}font-weight:600;">Total</td>
        <td style="${TD}"></td>
        <td style="${TD}text-align:right;font-weight:700;">${formatCents(totalCents)}</td>
      </tr></tfoot>
    </table>`;
}

/**
 * Notify the advertiser, every publisher in the request, and the operator.
 *
 * Publisher sends run sequentially rather than in parallel: a budget request
 * can touch a dozen sites, and Brevo rate-limits bursts. Sequential is slower
 * but the caller already treats this as fire-and-forget.
 */
export async function sendSponsorshipRequestEmails(
    input: SponsorshipEmailInput,
): Promise<SponsorshipEmailResult> {
    const result: SponsorshipEmailResult = {
        advertiserSent: false,
        publishersSent: 0,
        publishersFailed: 0,
        operatorSent: false,
    };

    const advertiserLabel = input.advertiserName || input.advertiserEmail;
    const multi = input.sites.length > 1;

    /* ----------------------------- advertiser ----------------------------- */
    const advertiserHtml = `<div style="${WRAP}">
    <p>Thanks — your sponsorship request is in.</p>
    <p>You asked about ${multi ? `<strong>${input.sites.length} sites</strong>` : '<strong>1 site</strong>'}
       for a total of <strong>${formatCents(input.totalCents)}</strong> over a 30-day window.</p>
    ${siteTable(input.sites, input.totalCents)}
    <p><strong>What happens next.</strong> Every publisher listed above has been emailed directly and
       has your address. There is no payment step in the product yet: whoever accepts will agree the
       creative and the window with you, and TrafficClaw will send a single invoice by hand.</p>
    <p>Traffic numbers on every site above are pulled from that site's own Google Analytics via
       read-only OAuth and refreshed daily. They are not self-reported.</p>
    <p style="color:#71717a;font-size:13px;">Impression estimates are modelled from verified pageviews
       and assume the slot renders on 85% of them. Reach figures across multiple sites are summed and
       not deduplicated, so treat the total as an upper bound — these audiences overlap.</p>
    <p style="color:#71717a;font-size:13px;">Reference: request #${input.requestId}</p>
  </div>`;

    const advertiserSend = await sendTransactional({
        toEmail: input.advertiserEmail,
        toName: input.advertiserName || undefined,
        subject: multi
            ? `Your sponsorship request for ${input.sites.length} sites (#${input.requestId})`
            : `Your sponsorship request for ${input.sites[0]?.name ?? 'a site'} (#${input.requestId})`,
        htmlContent: advertiserHtml,
    });
    result.advertiserSent = advertiserSend.ok;

    /* ----------------------------- publishers ----------------------------- */
    for (const site of input.sites) {
        if (!site.publisherEmail) {
            result.publishersFailed += 1;
            console.warn('[sponsorship] no publisher email on file', {
                requestId: input.requestId,
                entryId: site.entryId,
            });
            continue;
        }
        const publisherHtml = `<div style="${WRAP}">
      <p>Someone wants to sponsor <strong>${esc(site.name)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="${TD}">Advertiser</td><td style="${TD}"><strong>${esc(advertiserLabel)}</strong></td></tr>
        <tr><td style="${TD}">Reply to</td><td style="${TD}"><a href="mailto:${esc(input.advertiserEmail)}" style="color:#0e7490;">${esc(input.advertiserEmail)}</a></td></tr>
        ${input.advertiserSite ? `<tr><td style="${TD}">Their site</td><td style="${TD}">${esc(input.advertiserSite)}</td></tr>` : ''}
        <tr><td style="${TD}">Your listed price</td><td style="${TD}"><strong>${formatCents(site.priceCents)}</strong> for 30 days</td></tr>
        ${multi ? `<tr><td style="${TD}">Part of</td><td style="${TD}">a ${input.sites.length}-site plan totalling ${formatCents(input.totalCents)}</td></tr>` : ''}
      </table>
      ${input.message ? `<p style="border-left:3px solid #e4e4e7;padding-left:12px;color:#3f3f46;">${esc(input.message)}</p>` : ''}
      <p><strong>You are in control.</strong> Reply to the advertiser directly to accept, decline or
         counter. Nothing is booked, no money has moved, and no script has been added to your site.
         If you accept, you place the creative yourself and TrafficClaw invoices the advertiser.</p>
      <p>Your price came from your listing at <a href="${esc(profileUrl(site))}" style="color:#0e7490;">${esc(
          profileUrl(site),
      )}</a>. You can change it any time in Dashboard → Settings.</p>
      <p style="color:#71717a;font-size:13px;">Reference: request #${input.requestId}</p>
    </div>`;

        const send = await sendTransactional({
            toEmail: site.publisherEmail,
            toName: site.publisherName || undefined,
            subject: `Sponsorship request for ${site.name} — ${formatCents(site.priceCents)}/30 days`,
            htmlContent: publisherHtml,
        });
        if (send.ok) result.publishersSent += 1;
        else result.publishersFailed += 1;
    }

    /* ------------------------------ operator ------------------------------ */
    if (OPERATOR_EMAIL) {
        const operatorHtml = `<div style="${WRAP}">
      <p><strong>New sponsorship request #${input.requestId}</strong> (${input.sites.length} site${
          multi ? 's' : ''
      }, ${formatCents(input.totalCents)})</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        <tr><td style="${TD}">Advertiser</td><td style="${TD}">${esc(advertiserLabel)} &lt;${esc(input.advertiserEmail)}&gt;</td></tr>
        ${input.advertiserSite ? `<tr><td style="${TD}">Their site</td><td style="${TD}">${esc(input.advertiserSite)}</td></tr>` : ''}
        ${input.budgetCents ? `<tr><td style="${TD}">Stated budget</td><td style="${TD}">${formatCents(input.budgetCents)}</td></tr>` : ''}
      </table>
      ${siteTable(input.sites, input.totalCents)}
      ${input.message ? `<p style="border-left:3px solid #e4e4e7;padding-left:12px;">${esc(input.message)}</p>` : ''}
      <p style="color:#71717a;font-size:13px;">Mark items paid via
         <code>PATCH /api/sponsorship/request-items/{id}</code> so the 30-day gate counts them.</p>
    </div>`;
        const send = await sendTransactional({
            toEmail: OPERATOR_EMAIL,
            subject: `[TrafficClaw] Sponsorship request #${input.requestId} — ${formatCents(input.totalCents)}`,
            htmlContent: operatorHtml,
        });
        result.operatorSent = send.ok;
    }

    return result;
}
