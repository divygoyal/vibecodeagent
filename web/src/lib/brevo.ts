/**
 * Thin Brevo (transactional email) client for the web layer.
 *
 * Mirrors admin/services/brevo.py — same env vars, same single send
 * helper. Used by the superadmin report-email flow. Production code
 * calls Brevo's REST API directly (no MCP); the MCP is dev-only.
 *
 * Failure mode: log + return false. Never throw to the caller; email
 * delivery is best-effort and a Brevo blip should not crash the
 * superadmin action.
 *
 * Env vars (set in web/.env.local for dev, .env / Coolify for prod):
 *   BREVO_API_KEY           — xkeysib-... transactional API key
 *   BREVO_SENDER_EMAIL      — verified sender (e.g. hello@trafficclaw.com)
 *   BREVO_SENDER_NAME       — display name (default "TrafficClaw")
 *
 * Reference: https://developers.brevo.com/reference/sendtransacemail
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoSendInput {
    toEmail: string;
    toName?: string;
    templateId?: number;
    params?: Record<string, unknown>;
    subject?: string;
    htmlContent?: string;
    /** Optional [{ name, content (base64) }] attachments for things like a PDF report. */
    attachments?: Array<{ name: string; content: string }>;
}

export function isBrevoConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendTransactional(input: BrevoSendInput): Promise<boolean> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'TrafficClaw';

    if (!apiKey || !senderEmail) {
        console.warn('[brevo] skipped — BREVO_API_KEY or BREVO_SENDER_EMAIL not set', { toEmail: input.toEmail });
        return false;
    }

    if (!input.templateId && !(input.subject && input.htmlContent)) {
        console.error('[brevo] send called without templateId or subject+htmlContent');
        return false;
    }

    type BrevoPayload = {
        sender: { email: string; name: string };
        to: Array<{ email: string; name?: string }>;
        templateId?: number;
        params?: Record<string, unknown>;
        subject?: string;
        htmlContent?: string;
        attachment?: Array<{ name: string; content: string }>;
    };

    const payload: BrevoPayload = {
        sender: { email: senderEmail, name: senderName },
        to: [{ email: input.toEmail, ...(input.toName ? { name: input.toName } : {}) }],
    };
    if (input.templateId) {
        payload.templateId = input.templateId;
        if (input.params) payload.params = input.params;
    } else {
        payload.subject = input.subject!;
        payload.htmlContent = input.htmlContent!;
    }
    if (input.attachments?.length) {
        payload.attachment = input.attachments;
    }

    let res: Response;
    try {
        res = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15_000),
        });
    } catch (err) {
        console.error('[brevo] network error', { toEmail: input.toEmail, err: err instanceof Error ? err.message : err });
        return false;
    }

    if (res.ok) {
        let messageId = '';
        try {
            const body = await res.json();
            messageId = body?.messageId || '';
        } catch { /* ignore */ }
        console.info('[brevo] sent', { toEmail: input.toEmail, templateId: input.templateId, messageId });
        return true;
    }

    let bodyPreview = '';
    try {
        bodyPreview = (await res.text()).slice(0, 500);
    } catch { /* ignore */ }
    console.error('[brevo] non-2xx', { toEmail: input.toEmail, status: res.status, body: bodyPreview });
    return false;
}
