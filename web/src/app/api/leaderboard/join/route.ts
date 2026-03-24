import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/**
 * Join the leaderboard (opt-in). Requires authentication.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    try {
        const body = await req.json();

        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard join: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('Leaderboard join error:', err);
        return NextResponse.json({ error: 'Failed to join leaderboard' }, { status: 500 });
    }
}

/**
 * Get current user's leaderboard status.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ joined: false });
    }

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}/status`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard status: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ joined: false });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('Leaderboard status error:', err);
        return NextResponse.json({ joined: false });
    }
}

/**
 * Update leaderboard profile.
 */
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    try {
        const body = await req.json();

        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard update: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }

        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard update error:', err);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

/**
 * Leave the leaderboard (opt-out).
 */
export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard leave: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }

        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard leave error:', err);
        return NextResponse.json({ error: 'Failed to leave leaderboard' }, { status: 500 });
    }
}
