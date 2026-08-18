import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/** GET /api/site-repo-links → list saved (site → repo) links for the current user. */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ links: [] });
    }
    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}/site-repo-links`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
            }
        );
        if (!res.ok) {
            if (res.status === 404) return NextResponse.json({ links: [] });
            return NextResponse.json({ error: 'Failed to fetch site-repo links' }, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ links: [] });
    }
}

/** POST /api/site-repo-links → upsert one link. Body: { site_url, repo_full_name, confirmed? }. */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    }
    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    let body: { site_url?: string; repo_full_name?: string; confirmed?: boolean };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body?.site_url || !body?.repo_full_name) {
        return NextResponse.json({ error: 'site_url and repo_full_name are required' }, { status: 400 });
    }
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}/site-repo-links`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({
                    site_url: body.site_url,
                    repo_full_name: body.repo_full_name,
                    confirmed: !!body.confirmed,
                }),
                cache: 'no-store',
            }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return NextResponse.json({ error: data.detail || 'Failed to save link' }, { status: res.status });
        }
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Failed to save link' }, { status: 500 });
    }
}
