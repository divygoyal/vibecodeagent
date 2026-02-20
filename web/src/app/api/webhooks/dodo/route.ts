import { NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const DODO_WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_KEY || '';

// DodoPayments product ID → credits mapping
const CREDIT_PRODUCTS: Record<string, number> = {
    'pdt_0NYn4ZUFJs2YcTSvqivsI': 100,   // 100 credits for $1
    'pdt_0NYn4ZZQMZXmfjC3aNpkI': 500,   // 500 credits for $5
    'pdt_0NYn4Zjup0Bo2kI7DIfBp': 1200,  // 1200 credits for $10
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[Webhook] DodoPayments event:', body.type);

        // Verify webhook event type
        if (body.type !== 'payment.succeeded') {
            return NextResponse.json({ received: true });
        }

        const payment = body.data;
        const productId = payment?.product_id;
        const customerEmail = payment?.customer?.email;
        const paymentId = payment?.payment_id;

        if (!productId || !customerEmail) {
            console.warn('[Webhook] Missing product_id or customer email');
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        // Check if this is a credit purchase
        const creditsToAdd = CREDIT_PRODUCTS[productId];
        if (!creditsToAdd) {
            console.log(`[Webhook] Product ${productId} is not a credit pack, ignoring`);
            return NextResponse.json({ received: true });
        }

        // Add credits to user via admin API
        console.log(`[Webhook] Adding ${creditsToAdd} credits for ${customerEmail} (payment: ${paymentId})`);

        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(customerEmail)}/credits/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                amount: creditsToAdd,
                reason: 'purchase',
                payment_id: paymentId,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Webhook] Failed to add credits: ${res.status} ${errText}`);
            return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 });
        }

        const result = await res.json();
        console.log(`[Webhook] Credits added successfully. New balance: ${result.credits}`);

        return NextResponse.json({
            received: true,
            credits_added: creditsToAdd,
            new_balance: result.credits
        });
    } catch (err) {
        console.error('[Webhook] Error processing webhook:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
