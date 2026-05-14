/**
 * Feedback-email orchestrator — used by the superadmin "Send Feedback Email"
 * action. Targets users who've burned their free AI credits but haven't
 * bought, to surface why they didn't convert and offer a fixed discount.
 *
 * Unlike the report email this body is largely static, so it goes through
 * Brevo's templateId mode (template created by .brevo-create-feedback-template.py,
 * id surfaced via BREVO_FEEDBACK_TEMPLATE_ID — defaults to the id printed when
 * the script was first run).
 *
 * Coupon is currently a single hardcoded code (NEWBEE20) shown to every
 * recipient. Override via FEEDBACK_COUPON_CODE / FEEDBACK_COUPON_PERCENT if
 * you ever need to swap. Actually honouring the code at checkout is a Dodo
 * concern handled outside this file.
 */

import { sendTransactional } from './brevo';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const PUBLIC_DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || 'https://trafficclaw.com/dashboard/analytics';
const FEEDBACK_TEMPLATE_ID = Number(process.env.BREVO_FEEDBACK_TEMPLATE_ID || '9');
const COUPON_CODE = process.env.FEEDBACK_COUPON_CODE || 'NEWBEE20';
const DEFAULT_COUPON_PERCENT = Number(process.env.FEEDBACK_COUPON_PERCENT || '20');
const DEFAULT_EXPIRY_DAYS = Number(process.env.FEEDBACK_COUPON_EXPIRY_DAYS || '14');
const REPLY_EMAIL = process.env.BREVO_FEEDBACK_REPLY_EMAIL || 'hello@trafficclaw.com';

export interface SendUserFeedbackEmailInput {
    /** OAuth provider ID string (session.user.id-equivalent) — admin API resolves to DB user. */
    userId: string;
    /** Override coupon percent. Falls back to FEEDBACK_COUPON_PERCENT env (20). */
    couponPercent?: number;
    /** Override coupon expiry in days. Falls back to FEEDBACK_COUPON_EXPIRY_DAYS env (14). */
    expiryDays?: number;
}

export interface SendUserFeedbackEmailResult {
    ok: boolean;
    error?: string;
    messageId?: string;
    /** The code that was placed in the email body. With the default config this
     *  is always NEWBEE20, but returning it keeps the API symmetric with the
     *  earlier random-code design and lets the UI display it for confirmation. */
    couponCode?: string;
}

interface UserDetailPayload {
    email: string | null;
    github_username: string | null;
}

async function fetchUserDetails(userId: string): Promise<UserDetailPayload | null> {
    if (!ADMIN_API_KEY) return null;
    const enc = encodeURIComponent(userId);
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${enc}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(8_000),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const profile = await res.json();
        return {
            email: profile?.email || null,
            github_username: profile?.github_username || null,
        };
    } catch {
        return null;
    }
}

function formatExpiry(daysFromNow: number): string {
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function sendUserFeedbackEmail(input: SendUserFeedbackEmailInput): Promise<SendUserFeedbackEmailResult> {
    const user = await fetchUserDetails(input.userId);
    if (!user) return { ok: false, error: 'Could not load user from admin API' };
    if (!user.email) return { ok: false, error: 'User has no email on file' };

    const firstName = (user.github_username || user.email.split('@')[0] || 'there').trim();
    const couponPercent = Number.isFinite(input.couponPercent) ? Number(input.couponPercent) : DEFAULT_COUPON_PERCENT;
    const expiryDays = Number.isFinite(input.expiryDays) ? Number(input.expiryDays) : DEFAULT_EXPIRY_DAYS;
    const couponExpiresLabel = formatExpiry(expiryDays);

    const sendResult = await sendTransactional({
        toEmail: user.email,
        toName: user.github_username || firstName,
        templateId: FEEDBACK_TEMPLATE_ID,
        params: {
            first_name: firstName,
            coupon_code: COUPON_CODE,
            coupon_percent: String(couponPercent),
            coupon_expires_label: couponExpiresLabel,
            dashboard_url: PUBLIC_DASHBOARD_URL,
            reply_email: REPLY_EMAIL,
        },
    });

    if (sendResult.ok) {
        return { ok: true, messageId: sendResult.messageId, couponCode: COUPON_CODE };
    }
    return { ok: false, error: sendResult.error || 'Brevo send failed (see server logs).', couponCode: COUPON_CODE };
}
