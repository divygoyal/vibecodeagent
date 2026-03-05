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

        const res = await fetch(`${ADMIN_API_URL}/api/users/${userId}/credits`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });

        if (!res.ok) {
            console.error('[Credits] Failed to fetch credits:', res.status);
            return NextResponse.json({ credits: null, plan: 'free', error: 'unavailable' });
        }

        const data = await res.json();

        // Also fetch plan info
        let plan = 'free';
        let telegramBotEnabled = false;
        let subscriptionEnd = null;
        try {
            const userRes = await fetch(`${ADMIN_API_URL}/api/users/${userId}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                plan = userData.plan || 'free';
                telegramBotEnabled = userData.telegram_bot_enabled || false;
                subscriptionEnd = userData.subscription_end || null;
            }
        } catch {
            // Plan fetch failed, default to free
        }

        return NextResponse.json({
            credits: data.credits ?? 0,
            plan,
            telegram_bot_enabled: telegramBotEnabled,
            subscription_end: subscriptionEnd,
        });
    } catch (err) {
        console.error('[Credits] Error:', err);
        return NextResponse.json({ credits: null, plan: 'free', error: 'unavailable' });
    }
}
