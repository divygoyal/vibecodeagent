import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions, ensureAdminUserSynced } from '@/lib/adminUserSync';
import { normalizeXWidgetConfig, type XWidgetConfig } from '@/lib/socialEmbeds';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type Session = { user?: { id: string } } | null;

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sync = await ensureAdminUserSynced(session);
        if (!sync.synced) {
            console.error('Admin user sync before social embed create failed:', sync.reason);
            return NextResponse.json(
                { error: 'Your account is still syncing with the admin backend. Please try again in a moment.' },
                { status: sync.skipped ? 503 : 502 }
            );
        }

        const body = await req.json();
        const { platform, domain, sourceSiteUrl, label, config } = body as {
            platform?: string;
            domain?: string;
            sourceSiteUrl?: string | null;
            label?: string | null;
            config?: Partial<XWidgetConfig> | null;
        };

        const res = await fetch(`${ADMIN_API_URL}/api/social-embed-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                user_identifier: session.user.id,
                platform,
                domain,
                source_site_url: sourceSiteUrl || undefined,
                label: label || undefined,
                config: normalizeXWidgetConfig(config),
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const message = res.status === 404
                ? 'Your account is not available in the admin backend yet. Please refresh and try again.'
                : data.detail || data.error || 'Failed to create social embed token';
            return NextResponse.json(
                { error: message },
                { status: res.status }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Create social embed token error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sync = await ensureAdminUserSynced(session);
        if (!sync.synced) {
            console.error('Admin user sync before social embed update failed:', sync.reason);
            return NextResponse.json(
                { error: 'Your account is still syncing with the admin backend. Please try again in a moment.' },
                { status: sync.skipped ? 503 : 502 }
            );
        }

        const body = await req.json();
        const { token, domain, sourceSiteUrl, label, config } = body as {
            token?: string;
            domain?: string;
            sourceSiteUrl?: string | null;
            label?: string | null;
            config?: Partial<XWidgetConfig> | null;
        };

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const res = await fetch(`${ADMIN_API_URL}/api/social-embed-tokens/${encodeURIComponent(token)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                user_identifier: session.user.id,
                domain,
                source_site_url: sourceSiteUrl || undefined,
                label: label || undefined,
                config: normalizeXWidgetConfig(config),
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const message = res.status === 404
                ? 'This widget could not be found.'
                : data.detail || data.error || 'Failed to update social embed token';
            return NextResponse.json({ error: message }, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Update social embed token error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sync = await ensureAdminUserSynced(session);
        if (!sync.synced && !sync.skipped) {
            console.warn('Admin user sync before social embed list failed:', sync.reason);
        }

        const { searchParams } = new URL(req.url);
        const platform = searchParams.get('platform');
        const query = new URLSearchParams({ user_identifier: session.user.id });
        if (platform) {
            query.set('platform', platform);
        }

        const res = await fetch(`${ADMIN_API_URL}/api/social-embed-tokens?${query.toString()}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
        });

        const data = await res.json().catch(() => []);
        if (!res.ok) {
            return NextResponse.json(
                {
                    error: res.status === 404
                        ? 'Your account is not available in the admin backend yet. Please refresh and try again.'
                        : 'Failed to list social embed tokens',
                },
                { status: res.status }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('List social embed tokens error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sync = await ensureAdminUserSynced(session);
        if (!sync.synced && !sync.skipped) {
            console.warn('Admin user sync before social embed revoke failed:', sync.reason);
        }

        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');
        if (!token) {
            return NextResponse.json({ error: 'token parameter required' }, { status: 400 });
        }

        const res = await fetch(`${ADMIN_API_URL}/api/social-embed-tokens/${encodeURIComponent(token)}?user_identifier=${encodeURIComponent(session.user.id)}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': ADMIN_API_KEY },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return NextResponse.json(
                { error: data.detail || data.error || 'Failed to revoke social embed token' },
                { status: res.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Revoke social embed token error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
