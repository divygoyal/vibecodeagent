import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
        if (!userId) {
            return NextResponse.json({ credits: 10, plan: 'free' });
        }

        // Fetch credits and user data in parallel for faster response
        const encodedId = encodeURIComponent(String(userId));
        const headers = { 'X-API-Key': ADMIN_API_KEY };
        const [creditsRes, userRes] = await Promise.all([
            fetch(`${ADMIN_API_URL}/api/users/${encodedId}/credits`, { headers, cache: 'no-store' }),
            fetch(`${ADMIN_API_URL}/api/users/${encodedId}`, { headers, cache: 'no-store' }).catch(() => null),
        ]);

        if (!creditsRes.ok) {
            console.error('[Credits] Failed to fetch credits:', creditsRes.status);
            return NextResponse.json({ credits: null, plan: 'free', error: 'unavailable' });
        }

        const data = await creditsRes.json();

        let plan = 'free';
        let telegramBotEnabled = false;
        let subscriptionEnd = null;
        let subscriptionId = null;
        let subscriptionCancelled = false;
        if (userRes?.ok) {
            const userData = await userRes.json();
            plan = userData.plan || 'free';
            telegramBotEnabled = userData.telegram_bot_enabled || false;
            subscriptionEnd = userData.subscription_end || null;
            subscriptionId = userData.subscription_id || null;
            subscriptionCancelled = userData.subscription_cancelled || false;
        }

        return NextResponse.json({
            credits: data.credits ?? 0,
            plan,
            telegram_bot_enabled: telegramBotEnabled,
            subscription_end: subscriptionEnd,
            subscription_id: subscriptionId,
            subscription_cancelled: subscriptionCancelled,
        });
    } catch (err) {
        console.error('[Credits] Error:', err);
        return NextResponse.json({ credits: null, plan: 'free', error: 'unavailable' });
    }
}
