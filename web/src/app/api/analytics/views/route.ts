import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import type { AnalyticsViewConfig } from '@/types/analyticsWorkspace';

type ScopeKey = `${string}::${string}`;

const viewStore = new Map<ScopeKey, AnalyticsViewConfig[]>();

function getScopeKey(userId: string, propertyId: string): ScopeKey {
    return `${userId}::${propertyId}`;
}

function sortViews(views: AnalyticsViewConfig[]): AnalyticsViewConfig[] {
    return [...views].sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
}

async function resolveAuth(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const propertyId = request.nextUrl.searchParams.get('propertyId') || request.headers.get('x-property-id') || '';
    if (!propertyId) {
        return { error: NextResponse.json({ error: 'propertyId is required' }, { status: 400 }) };
    }

    return {
        userId: String(session.user.id),
        propertyId,
    };
}

export async function GET(request: NextRequest) {
    const auth = await resolveAuth(request);
    if ('error' in auth) return auth.error;

    const key = getScopeKey(auth.userId, auth.propertyId);
    return NextResponse.json({ views: sortViews(viewStore.get(key) || []) });
}

export async function POST(request: NextRequest) {
    const auth = await resolveAuth(request);
    if ('error' in auth) return auth.error;

    const payload = (await request.json()) as Partial<AnalyticsViewConfig>;
    if (!payload.name?.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const key = getScopeKey(auth.userId, auth.propertyId);
    const current = viewStore.get(key) || [];
    const timestamp = new Date().toISOString();

    const next: AnalyticsViewConfig = {
        ...(payload as AnalyticsViewConfig),
        id: payload.id || `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        userId: auth.userId,
        propertyId: auth.propertyId,
        name: payload.name.trim(),
        isDefault: Boolean(payload.isDefault),
        createdAt: timestamp,
        updatedAt: timestamp,
    };

    const normalized = next.isDefault
        ? current.map((view) => ({ ...view, isDefault: false }))
        : [...current];

    const views = [...normalized, next];
    viewStore.set(key, views);

    return NextResponse.json({ view: next, views: sortViews(views) });
}

export async function PUT(request: NextRequest) {
    const auth = await resolveAuth(request);
    if ('error' in auth) return auth.error;

    const payload = (await request.json()) as Partial<AnalyticsViewConfig> & { id?: string };
    if (!payload.id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const key = getScopeKey(auth.userId, auth.propertyId);
    const current = viewStore.get(key) || [];
    let found = false;

    let views = current.map((view) => {
        if (view.id !== payload.id) return view;
        found = true;
        return {
            ...view,
            ...payload,
            userId: auth.userId,
            propertyId: auth.propertyId,
            name: payload.name?.trim() || view.name,
            updatedAt: new Date().toISOString(),
        };
    });

    if (!found) {
        return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    const target = views.find((view) => view.id === payload.id);
    if (target?.isDefault) {
        views = views.map((view) => (view.id === payload.id ? view : { ...view, isDefault: false }));
    }

    viewStore.set(key, views);
    return NextResponse.json({ view: views.find((view) => view.id === payload.id), views: sortViews(views) });
}

export async function DELETE(request: NextRequest) {
    const auth = await resolveAuth(request);
    if ('error' in auth) return auth.error;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const key = getScopeKey(auth.userId, auth.propertyId);
    const current = viewStore.get(key) || [];
    const views = current.filter((view) => view.id !== id);
    viewStore.set(key, views);

    return NextResponse.json({ views: sortViews(views) });
}
