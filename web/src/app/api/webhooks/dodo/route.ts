import { NextResponse } from 'next/server';
import DodoPayments from 'dodopayments';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const DODO_WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_KEY || '';

const client = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY || 'unused-webhook-only',
});

// Product ID → plan config
const PLANS: Record<string, { plan: string; credits: number; telegramBot: boolean }> = {
    'pdt_0NZoVGbK4CoQKguLeiFbO': { plan: 'starter', credits: 50, telegramBot: false },
    'pdt_0NZoVI3aamuRliw0Ffnuh': { plan: 'growth', credits: 150, telegramBot: false },
    'pdt_0NZoVIVgk7pdElblScoop': { plan: 'pro', credits: 300, telegramBot: true },
};

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

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        let event: any;

        // Verify webhook signature (reject if no secret configured)
        if (!DODO_WEBHOOK_SECRET) {
            console.error('[Webhook] DODO_PAYMENTS_WEBHOOK_KEY not configured — rejecting request');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }

        try {
            event = client.webhooks.unwrap(rawBody, {
                headers: Object.fromEntries(req.headers.entries()),
                key: DODO_WEBHOOK_SECRET,
            });
        } catch (err) {
            console.error('[Webhook] Signature verification failed:', err);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const eventType = event.event_type || event.type;
        console.log(`[Webhook] DodoPayments event: ${eventType}`);

        const data = event.data || event;
        const productId = data?.product_id;
        const customerEmail = data?.customer?.email;
        const subscriptionId = data?.subscription_id;

        // subscription.active — new subscription started
        if (eventType === 'subscription.active') {
            if (!productId || !customerEmail) {
                console.warn('[Webhook] subscription.active missing product_id or email');
                return NextResponse.json({ error: 'Missing data' }, { status: 400 });
            }

            const planConfig = PLANS[productId];
            if (!planConfig) {
                console.log(`[Webhook] Unknown product ${productId}, ignoring`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] New subscription: ${customerEmail} → ${planConfig.plan} (${planConfig.credits} credits)`);
            await updateSubscription(customerEmail, {
                plan: planConfig.plan,
                credits: planConfig.credits,
                subscription_id: subscriptionId || null,
                telegram_bot_enabled: planConfig.telegramBot,
                reset_credits: true,
            });

            return NextResponse.json({ received: true, plan: planConfig.plan });
        }

        // subscription.renewed — monthly renewal, reset credits
        if (eventType === 'subscription.renewed') {
            if (!productId || !customerEmail) {
                console.warn('[Webhook] subscription.renewed missing data');
                return NextResponse.json({ received: true });
            }

            const planConfig = PLANS[productId];
            if (!planConfig) {
                console.log(`[Webhook] Unknown product ${productId} on renewal, ignoring`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] Renewal: ${customerEmail} → reset to ${planConfig.credits} credits`);
            await updateSubscription(customerEmail, {
                plan: planConfig.plan,
                credits: planConfig.credits,
                subscription_id: subscriptionId || null,
                telegram_bot_enabled: planConfig.telegramBot,
                reset_credits: true,
            });

            return NextResponse.json({ received: true, renewed: true });
        }

        // subscription.cancelled / subscription.expired — downgrade to free
        if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
            if (!customerEmail) {
                console.warn(`[Webhook] ${eventType} missing email`);
                return NextResponse.json({ received: true });
            }

            console.log(`[Webhook] ${eventType}: ${customerEmail} → downgrade to free`);
            await updateSubscription(customerEmail, {
                plan: 'free',
                credits: 0,
                subscription_id: null,
                telegram_bot_enabled: false,
                reset_credits: false, // keep remaining credits
            });

            return NextResponse.json({ received: true, downgraded: true });
        }

        // subscription.failed — log warning
        if (eventType === 'subscription.failed') {
            console.warn(`[Webhook] Subscription payment failed for ${customerEmail || 'unknown'}`);
            return NextResponse.json({ received: true });
        }

        // payment.succeeded — backward compat logging
        if (eventType === 'payment.succeeded') {
            console.log(`[Webhook] Payment succeeded: ${customerEmail || 'unknown'}, product: ${productId || 'unknown'}`);
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Unhandled event type: ${eventType}`);
        return NextResponse.json({ received: true });
    } catch (err) {
        console.error('[Webhook] Error processing webhook:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
