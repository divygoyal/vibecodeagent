import { BRAND_NAME, SITE_URL } from '@/lib/brand';

/**
 * One-time announcement to verified leaderboard publishers: you can now list
 * ad slots on your profile at whatever price you choose.
 *
 * Pure template — no sending, no data access. Rendered by the superadmin
 * announce route (dry-run by default) and sent through lib/brevo.ts.
 */

export interface AnnouncementSite {
  slug: string | null;
  startup_name: string;
  monthly_visitors: number;
  ad_slot_count: number;
}

export interface AnnouncementInput {
  name: string | null;
  sites: AnnouncementSite[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function profileUrl(site: AnnouncementSite): string {
  return `${SITE_URL}/leaderboard/${encodeURIComponent(site.slug || site.startup_name)}`;
}

export function buildAdSlotsAnnouncement(input: AnnouncementInput): RenderedEmail {
  const firstName = input.name?.trim().split(/\s+/)[0] || null;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const primary = input.sites[0];
  const settingsUrl = `${SITE_URL}/dashboard/settings#leaderboard`;
  const sponsorUrl = `${SITE_URL}/sponsor`;

  const subject =
    input.sites.length === 1
      ? `You can now sell ad slots on ${primary.startup_name} — at your price`
      : `You can now sell ad slots on your ${input.sites.length} verified sites — at your price`;

  const siteLinesText = input.sites
    .map((s) => `  • ${s.startup_name} — ${fmt(s.monthly_visitors)} verified monthly visitors → ${profileUrl(s)}`)
    .join('\n');

  const text = `${greeting}

Your site is already on the ${BRAND_NAME} leaderboard with traffic verified straight from Google Analytics. Sponsors browsing the board keep asking the same thing: "can I buy a placement here?"

Starting today, you can say yes.

Go to Settings → Leaderboard and add the placements you're willing to sell — a header banner, a newsletter mention, a footer logo, anything you like — with a price YOU set. We don't calculate, suggest or change it. Buyers see your verified traffic next to your price, request the slot, and you accept or decline. Money changes hands directly between you; we're not taking a cut in this phase.

Your verified site${input.sites.length > 1 ? 's' : ''}:
${siteLinesText}

Set up your slots (2 minutes): ${settingsUrl}
See how slots look to buyers: ${sponsorUrl}

Things worth knowing:
  • It's optional. Leave it empty and your listing stays exactly as it is.
  • You control everything: name, price, billing period, how many are available, a screenshot of where it sits.
  • Your profile also shows sponsors who your audience is — countries, how they arrive, top pages, what they search for — so the right buyers find you.

Reply to this email if anything is unclear; a human reads it.

— ${BRAND_NAME}
`;

  const siteRowsHtml = input.sites
    .map(
      (s) => `
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #27272a;font-size:14px;color:#fafafa;">
            <a href="${profileUrl(s)}" style="color:#fafafa;text-decoration:none;font-weight:600;">${escapeHtml(s.startup_name)}</a>
          </td>
          <td style="padding:10px 12px;border-top:1px solid #27272a;font-size:13px;color:#a1a1aa;text-align:right;white-space:nowrap;">
            ${fmt(s.monthly_visitors)} <span style="color:#71717a;">verified visitors / mo</span>
          </td>
        </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#e4e4e7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090b;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr><td style="padding:0 0 20px 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#34d399;font-weight:600;">${escapeHtml(BRAND_NAME)} · Leaderboard</td></tr>
          <tr><td style="font-size:26px;line-height:1.25;font-weight:700;color:#fafafa;padding-bottom:16px;">
            You can now sell ad slots on your verified site — at your price.
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#d4d4d8;padding-bottom:14px;">${escapeHtml(greeting)}</td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#d4d4d8;padding-bottom:14px;">
            Your site is already on the leaderboard with traffic verified straight from Google Analytics. Sponsors browsing the board keep asking the same thing: <em>“can I buy a placement here?”</em>
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#fafafa;font-weight:600;padding-bottom:14px;">Starting today, you can say yes.</td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#d4d4d8;padding-bottom:20px;">
            Go to <strong style="color:#fafafa;">Settings → Leaderboard</strong> and add the placements you're willing to sell — a header banner, a newsletter mention, a footer logo, anything you like — with a price <strong style="color:#fafafa;">you</strong> set. We don't calculate, suggest or change it. Buyers see your verified traffic next to your price, request the slot, and you accept or decline. Money changes hands directly between you; we're not taking a cut in this phase.
          </td></tr>

          <tr><td style="padding-bottom:20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #27272a;border-radius:12px;overflow:hidden;background:#111113;">
              <tr><td colspan="2" style="padding:10px 12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#71717a;">Your verified site${input.sites.length > 1 ? 's' : ''}</td></tr>
              ${siteRowsHtml}
            </table>
          </td></tr>

          <tr><td align="left" style="padding-bottom:12px;">
            <a href="${settingsUrl}" style="display:inline-block;background:#10b981;color:#052e16;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px;text-decoration:none;">Set up your slots — 2 minutes</a>
          </td></tr>
          <tr><td style="font-size:13px;color:#a1a1aa;padding-bottom:24px;">
            or <a href="${sponsorUrl}" style="color:#34d399;text-decoration:underline;">see how slots look to buyers</a>
          </td></tr>

          <tr><td style="font-size:14px;line-height:1.7;color:#a1a1aa;padding-bottom:20px;border-top:1px solid #27272a;padding-top:20px;">
            <div style="color:#fafafa;font-weight:600;margin-bottom:6px;">Worth knowing</div>
            • It's optional — leave it empty and your listing stays exactly as it is.<br/>
            • You control everything: name, price, billing period, availability, a screenshot of where it sits.<br/>
            • Your profile now also shows sponsors <em>who</em> your audience is — countries, how they arrive, top pages, what they search for — so the right buyers find you.
          </td></tr>

          <tr><td style="font-size:13px;line-height:1.6;color:#71717a;">
            Reply to this email if anything is unclear; a human reads it.<br/>— ${escapeHtml(BRAND_NAME)}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
