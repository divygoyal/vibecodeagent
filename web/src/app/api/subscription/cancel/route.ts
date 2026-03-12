import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import DodoPayments from 'dodopayments';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const client = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    environment: 'live_mode',
});

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
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
        const subscriptionId = userData.subscription_id;

        if (!subscriptionId) {
            return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
        }

        if (userData.plan === 'free') {
            return NextResponse.json({ error: 'You are already on the free plan' }, { status: 400 });
        }

        // Cancel subscription via Dodo Payments API
        await client.subscriptions.update(subscriptionId, {
            status: 'cancelled',
        });

        console.log(`[Cancel] Subscription ${subscriptionId} cancelled for user ${userId}`);

        return NextResponse.json({ success: true, message: 'Subscription cancelled. You will retain access until the end of your current billing period.' });
    } catch (err) {
        console.error('[Cancel] Error cancelling subscription:', err);
        return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }
}
