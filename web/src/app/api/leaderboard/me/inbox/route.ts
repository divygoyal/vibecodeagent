import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { requireUser } from '@/lib/leaderboard/owner';
import type { InboxItem } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

/** GET /api/leaderboard/me/inbox: offers and ad-slot requests sent to my sites. */
export async function GET() {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const res = await lbAdmin<{ items: InboxItem[]; unread: number }>(`/api/lb/inquiries/${encodeURIComponent(auth.user.userId)}`);
    return NextResponse.json(res.data ?? { items: [], unread: 0 });
}
