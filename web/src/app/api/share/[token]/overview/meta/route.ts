import { NextResponse } from 'next/server';
import { getShareData } from '@/app/api/share/route';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const share = await getShareData(token, { incrementView: false });

    if (!share) {
        return NextResponse.json({ error: 'Share not found or revoked' }, { status: 404 });
    }

    return NextResponse.json({
        token: share.token,
        siteUrl: share.siteUrl,
        propertyId: share.propertyId,
        views: share.views,
        createdAt: share.createdAt,
        config: share.config,
    });
}
