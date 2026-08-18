import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import DodoPayments from 'dodopayments';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Lazy-init to avoid crashing at build time when env vars aren't set
let _client: DodoPayments | null = null;
function getClient() {
    if (!_client) {
        _client = new DodoPayments({
            bearerToken: process.env.DODO_PAYMENTS_API_KEY,
            environment: 'live_mode',
        });
    }
    return _client;
}

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
        const userEmail = session.user.email;
        if (!userId) {
            return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
        }

        // Fetch user data to get subscription_id
        const userRes = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });

        if (!userRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
        }

        const userData = await userRes.json();

        if (userData.plan === 'free') {
            return NextResponse.json({ error: 'You are already on the free plan' }, { status: 400 });
        }

        // Idempotency: if already cancelled, return success without calling Dodo again
        if (userData.subscription_cancelled) {
            console.log(`[Cancel] Subscription already cancelled for user ${userId}, returning success`);
            return NextResponse.json({ success: true, message: 'Subscription is already cancelled. You will retain access until the end of your current billing period.' });
        }

        let subscriptionId = userData.subscription_id;

        // If subscription_id not in DB, search Dodo Payments by email
        if (!subscriptionId && userEmail) {
            try {
                const subs = getClient().subscriptions.list({ page_size: 10 });
                for await (const sub of subs) {
                    if (
                        sub.customer?.email === userEmail &&
                        sub.status === 'active'
                    ) {
                        subscriptionId = sub.subscription_id;
                        break;
                    }
                }
            } catch (searchErr) {
                console.error('[Cancel] Error searching for subscription:', searchErr);
            }
        }

        if (!subscriptionId) {
            return NextResponse.json({ error: 'No active subscription found. Please contact support.' }, { status: 400 });
        }

        // Cancel subscription via Dodo Payments API
        await getClient().subscriptions.update(subscriptionId, {
            status: 'cancelled',
        });

        // Mark as cancelled in our DB immediately (so UI updates without waiting for webhook)
        await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}/cancel-flag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({ subscription_cancelled: true }),
        });

        console.log(`[Cancel] Subscription ${subscriptionId} cancelled for user ${userId}`);

        return NextResponse.json({ success: true, message: 'Subscription cancelled. You will retain access until the end of your current billing period.' });
    } catch (err) {
        console.error('[Cancel] Error cancelling subscription:', err);
        return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }
}
