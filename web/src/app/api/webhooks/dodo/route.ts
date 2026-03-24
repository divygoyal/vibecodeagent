import { NextResponse } from 'next/server';
import DodoPayments, { type DodoPayments as DodoPaymentsNS } from 'dodopayments';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const client_lazy = (() => {
    let _client: DodoPayments | null = null;
    return () => {
        if (!_client) {
            _client = new DodoPayments({
                bearerToken: process.env.DODO_PAYMENTS_API_KEY,
                environment: 'live_mode',
            });
        }
        return _client;
    };
})();

// Product ID → plan config (live mode product IDs)
const PLANS: Record<string, { plan: string; credits: number; telegramBot: boolean }> = {
    'pdt_0NaLMLyWwiO355QaGlQwq': { plan: 'starter', credits: 50, telegramBot: false },
    'pdt_0NaLMM1bLW9wAbmxcsebm': { plan: 'growth', credits: 150, telegramBot: false },
    'pdt_0NaLMM4r23kncRahthuyj': { plan: 'pro', credits: 300, telegramBot: true },
};

// Simple in-memory dedup to prevent processing the same webhook event twice
const processedEvents = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_MAX_SIZE = 10_000; // Hard cap to prevent OOM from rapid unique events

function isDuplicate(eventId: string): boolean {
    // Clean up old entries
    const now = Date.now();
    for (const [id, ts] of processedEvents) {
        if (now - ts > DEDUP_TTL_MS) processedEvents.delete(id);
    }
    // Hard cap: if still over limit after TTL cleanup, evict oldest entries
    if (processedEvents.size >= DEDUP_MAX_SIZE) {
        const toDelete = processedEvents.size - DEDUP_MAX_SIZE + 100; // evict batch of 100
        let deleted = 0;
        for (const key of processedEvents.keys()) {
            if (deleted >= toDelete) break;
            processedEvents.delete(key);
            deleted++;
        }
    }
    if (processedEvents.has(eventId)) return true;
    processedEvents.set(eventId, now);
    return false;
}

async function updateSubscription(email: string, body: Record<string, unknown>) {
    const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(email)}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text();
        console.error(`[Webhook] Admin API error: ${res.status} ${errText}`);
    }
    return res;
}

async function setCancelFlag(identifier: string, cancelled: boolean) {
    const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(identifier)}/cancel-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
        body: JSON.stringify({ subscription_cancelled: cancelled }),
    });
    if (!res.ok) {
        console.error(`[Webhook] Failed to set cancel flag for ${identifier}: ${res.status}`);
    }
    return res;
}

type WebhookEvent = DodoPaymentsNS.UnwrapWebhookEvent;

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY || '';

        if (!webhookKey) {
            console.error('[Webhook] DODO_PAYMENTS_WEBHOOK_KEY not configured — rejecting request');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }

        let event: WebhookEvent;
        try {
            event = client_lazy().webhooks.unwrap(rawBody, {
                headers: Object.fromEntries(req.headers.entries()),
                key: webhookKey,
            });
        } catch (err) {
            console.error('[Webhook] Signature verification failed:', err);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const eventType = event.type;
        console.log(`[Webhook] DodoPayments event: ${eventType}`);

        // Extract subscription data from typed event
        const data = event.data;

        // Deduplicate webhook events (Dodo may retry on network errors)
        // Use stable fields only (no timestamp) so retries of the same event are caught
        const dedupEmail = 'customer' in data && data.customer ? data.customer.email : '';
        const dedupProduct = 'product_id' in data ? data.product_id : '';
        const dedupSubId = 'subscription_id' in data ? data.subscription_id : '';
        const eventId = `${eventType}-${dedupEmail}-${dedupProduct}-${dedupSubId}`;
        if (isDuplicate(eventId)) {
            console.log(`[Webhook] Duplicate event detected, skipping: ${eventType}`);
            return NextResponse.json({ received: true, duplicate: true });
        }
        const productId = 'product_id' in data ? data.product_id : undefined;
        const customerEmail = 'customer' in data && data.customer ? data.customer.email : undefined;
        const subscriptionId = 'subscription_id' in data ? data.subscription_id : undefined;

        // ─── subscription.active — new subscription started ───
        if (eventType === 'subscription.active') {
            if (!productId || !customerEmail) {
                console.warn('[Webhook] subscription.active missing product_id or email');
                return NextResponse.json({ error: 'Missing data' }, { status: 400 });
            }

            const planConfig = PLANS[productId];
            if (!planConfig) {
                console.warn(`[Webhook] Unknown product ${productId} on subscription.active`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] New subscription: ${customerEmail} → ${planConfig.plan} (${planConfig.credits} credits)`);
            await updateSubscription(customerEmail, {
                plan: planConfig.plan,
                credits: planConfig.credits,
                subscription_id: subscriptionId || null,
                telegram_bot_enabled: planConfig.telegramBot,
                reset_credits: true,
                subscription_cancelled: false,
            });

            return NextResponse.json({ received: true, plan: planConfig.plan });
        }

        // ─── subscription.renewed — monthly renewal, reset credits ───
        if (eventType === 'subscription.renewed') {
            if (!productId || !customerEmail) {
                console.warn('[Webhook] subscription.renewed missing data');
                return NextResponse.json({ received: true });
            }

            const planConfig = PLANS[productId];
            if (!planConfig) {
                console.warn(`[Webhook] Unknown product ${productId} on renewal`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] Renewal: ${customerEmail} → reset to ${planConfig.credits} credits`);
            await updateSubscription(customerEmail, {
                plan: planConfig.plan,
                credits: planConfig.credits,
                subscription_id: subscriptionId || null,
                telegram_bot_enabled: planConfig.telegramBot,
                reset_credits: true,
                subscription_cancelled: false,
            });

            return NextResponse.json({ received: true, renewed: true });
        }

        // ─── subscription.on_hold — payment issue, keep plan but flag ───
        if (eventType === 'subscription.on_hold') {
            console.warn(`[Webhook] Subscription on hold for ${customerEmail || 'unknown'} — payment issue, plan remains active`);
            // Plan stays active during hold — Dodo will retry payment.
            // If all retries fail, subscription.failed or subscription.expired will fire.
            return NextResponse.json({ received: true });
        }

        // ─── subscription.plan_changed — user changed plan ───
        if (eventType === 'subscription.plan_changed') {
            if (!productId || !customerEmail) {
                console.warn('[Webhook] subscription.plan_changed missing data');
                return NextResponse.json({ received: true });
            }

            const planConfig = PLANS[productId];
            if (!planConfig) {
                console.warn(`[Webhook] Unknown product ${productId} on plan change`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] Plan changed: ${customerEmail} → ${planConfig.plan}`);
            await updateSubscription(customerEmail, {
                plan: planConfig.plan,
                credits: planConfig.credits,
                subscription_id: subscriptionId || null,
                telegram_bot_enabled: planConfig.telegramBot,
                reset_credits: true,
                subscription_cancelled: false,
            });

            return NextResponse.json({ received: true, plan: planConfig.plan });
        }

        // ─── subscription.cancelled — stop renewal, keep plan active until period ends ───
        if (eventType === 'subscription.cancelled') {
            if (!customerEmail) {
                console.warn('[Webhook] subscription.cancelled missing email');
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] subscription.cancelled: ${customerEmail} — plan stays active until billing period ends`);
            await setCancelFlag(customerEmail, true);
            return NextResponse.json({ received: true, cancelled: true });
        }

        // ─── subscription.expired — billing period ended, downgrade to free ───
        if (eventType === 'subscription.expired') {
            if (!customerEmail) {
                console.warn('[Webhook] subscription.expired missing email');
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] subscription.expired: ${customerEmail} → downgrade to free`);
            await updateSubscription(customerEmail, {
                plan: 'free',
                credits: 0,
                subscription_id: null,
                telegram_bot_enabled: false,
                reset_credits: false,
                subscription_cancelled: false,
            });

            return NextResponse.json({ received: true, downgraded: true });
        }

        // ─── subscription.failed — payment failed after retries ───
        if (eventType === 'subscription.failed') {
            console.warn(`[Webhook] Subscription payment failed for ${customerEmail || 'unknown'}`);
            // Dodo has exhausted retries. Downgrade to free.
            if (customerEmail) {
                await updateSubscription(customerEmail, {
                    plan: 'free',
                    credits: 0,
                    subscription_id: null,
                    telegram_bot_enabled: false,
                    reset_credits: false,
                    subscription_cancelled: false,
                });
                console.log(`[Webhook] Payment failed — downgraded ${customerEmail} to free`);
            }
            return NextResponse.json({ received: true });
        }

        // ─── payment.succeeded — log for audit trail ───
        if (eventType === 'payment.succeeded') {
            const paymentData = event.data;
            const payEmail = 'customer' in paymentData && paymentData.customer ? paymentData.customer.email : 'unknown';
            const payProduct = 'product_id' in paymentData ? paymentData.product_id : 'unknown';
            console.log(`[Webhook] Payment succeeded: ${payEmail}, product: ${payProduct}`);
            return NextResponse.json({ received: true });
        }

        // ─── refund.succeeded — downgrade plan on refund ───
        if (eventType === 'refund.succeeded') {
            const refundData = event.data;
            const refundEmail = 'customer' in refundData && refundData.customer ? refundData.customer.email : undefined;
            console.log(`[Webhook] Refund succeeded for ${refundEmail || 'unknown'}`);

            if (refundEmail) {
                await updateSubscription(refundEmail, {
                    plan: 'free',
                    credits: 0,
                    subscription_id: null,
                    telegram_bot_enabled: false,
                    reset_credits: false,
                    subscription_cancelled: false,
                });
                console.log(`[Webhook] Refund processed — downgraded ${refundEmail} to free`);
            }
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Unhandled event type: ${eventType}`);
        return NextResponse.json({ received: true });
    } catch (err) {
        console.error('[Webhook] Error processing webhook:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
