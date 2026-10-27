/**
 * Email for leaderboard offers. Best effort: BREVO_API_KEY / BREVO_SENDER_EMAIL are
 * absent in local dev, so every send no-ops and the offer still lands in the owner's
 * in-app inbox (and the superadmin list).
 */
import { isBrevoConfigured, sendTransactional } from '@/lib/brevo';
import { billingPeriodSuffix, formatCents } from '@/lib/adSlots';
import { SITE_ORIGIN } from './constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface SlotRequestMailInput {
    slotName: string;
    priceCents: number;
    billingPeriod: string | null;
    buyerName: string;
    buyerEmail: string;
    message: string;
    publisher: { startup_name: string; contact_email: string | null; founder_name: string | null; slug: string | null };
}

/** The two emails sent for a request on one ad slot (publisher + buyer). */
export function sendSlotRequestEmails(input: SlotRequestMailInput): void {
    if (!isBrevoConfigured()) return;
    const { publisher, buyerEmail } = input;
    const priceLine = `${formatCents(input.priceCents)} ${billingPeriodSuffix(input.billingPeriod)}`;
    const profileUrl = `${SITE_ORIGIN}/leaderboard/${publisher.slug || ''}`;
    const safeSlot = escapeHtml(input.slotName);
    const safePrice = escapeHtml(priceLine);
    const safeSite = escapeHtml(publisher.startup_name);
    const safeBuyer = escapeHtml(input.buyerName || buyerEmail);
    const safeMessage = input.message ? escapeHtml(input.message).replace(/\n/g, '<br />') : '';
    const sends: Promise<unknown>[] = [];

    if (publisher.contact_email && EMAIL_RE.test(publisher.contact_email)) {
        sends.push(
            sendTransactional({
                toEmail: publisher.contact_email,
                toName: publisher.founder_name || publisher.startup_name,
                subject: `New ad slot request: ${input.slotName} on ${publisher.startup_name}`,
                htmlContent: `
                    <p><strong>${safeBuyer}</strong> wants to book <strong>${safeSlot}</strong> on ${safeSite}.</p>
                    <p>Listed at <strong>${safePrice}</strong> when they sent this.</p>
                    ${safeMessage ? `<p><em>${safeMessage}</em></p>` : ''}
                    <p>Reply to them directly at <a href="mailto:${escapeHtml(buyerEmail)}">${escapeHtml(buyerEmail)}</a>, then mark the deal accepted or paid in your TrafficClaw dashboard under Leaderboard.</p>
                `,
            }).catch((err) => console.error('[ad-slot-requests] publisher email failed:', err)),
        );
    }
    sends.push(
        sendTransactional({
            toEmail: buyerEmail,
            toName: input.buyerName || undefined,
            subject: `Your request for ${input.slotName} on ${publisher.startup_name}`,
            htmlContent: `
                <p>We passed your request for <strong>${safeSlot}</strong> on ${safeSite} to the publisher.</p>
                <p>Listed at <strong>${safePrice}</strong>.</p>
                <p>They'll reply to you directly. Arrangement and payment happen between the two of you. TrafficClaw just makes the introduction.</p>
                ${publisher.slug ? `<p><a href="${profileUrl}">View the listing</a></p>` : ''}
            `,
        }).catch((err) => console.error('[ad-slot-requests] buyer email failed:', err)),
    );
    void Promise.allSettled(sends);
}

const KIND_LABEL: Record<string, string> = {
    sponsorship: 'sponsorship offer',
    acquisition: 'acquisition offer',
    partnership: 'partnership offer',
};

export interface InquiryMailInput {
    kind: string;
    name: string;
    email: string;
    company: string;
    budget: string;
    message: string;
    publisher: { startup_name: string; contact_email: string | null; founder_name: string | null; slug: string | null };
}

/** Email the owner about a new offer, and confirm to the sender. */
export function sendInquiryEmails(input: InquiryMailInput): void {
    if (!isBrevoConfigured()) return;
    const { publisher } = input;
    const label = KIND_LABEL[input.kind] || 'offer';
    const safe = {
        who: escapeHtml(input.name || input.email),
        company: input.company ? ` from ${escapeHtml(input.company)}` : '',
        site: escapeHtml(publisher.startup_name),
        budget: input.budget ? `<p>Budget or terms: <strong>${escapeHtml(input.budget)}</strong></p>` : '',
        message: escapeHtml(input.message).replace(/\n/g, '<br />'),
        email: escapeHtml(input.email),
    };
    const sends: Promise<unknown>[] = [];
    if (publisher.contact_email && EMAIL_RE.test(publisher.contact_email)) {
        sends.push(
            sendTransactional({
                toEmail: publisher.contact_email,
                toName: publisher.founder_name || publisher.startup_name,
                subject: `New ${label} for ${publisher.startup_name}`,
                htmlContent: `
                    <p><strong>${safe.who}</strong>${safe.company} sent a ${label} for ${safe.site}.</p>
                    ${safe.budget}
                    <p><em>${safe.message}</em></p>
                    <p>Reply directly to <a href="mailto:${safe.email}">${safe.email}</a>. You can also see it in your TrafficClaw dashboard under Leaderboard > Offers.</p>
                `,
            }).catch((err) => console.error('[leaderboard-inquiry] owner email failed:', err)),
        );
    }
    sends.push(
        sendTransactional({
            toEmail: input.email,
            toName: input.name || undefined,
            subject: `We passed your ${label} to ${publisher.startup_name}`,
            htmlContent: `
                <p>Your ${label} for ${safe.site} was delivered to the owner. They will reply to you directly at this address.</p>
                ${publisher.slug ? `<p><a href="${SITE_ORIGIN}/leaderboard/${publisher.slug}">View the listing</a></p>` : ''}
            `,
        }).catch((err) => console.error('[leaderboard-inquiry] sender email failed:', err)),
    );
    void Promise.allSettled(sends);
}
