import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { fetchGithubTokenFromDb, getValidGithubToken, listUserRepos } from '@/lib/githubApi';

export const dynamic = 'force-dynamic';

/** GET /api/github/repos → list the current user's GitHub repos (lightweight, for the picker). */
export async function GET(req: NextRequest) {
    try {
        const jwt = await getToken({ req: req as any });
        if (!jwt) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = (jwt.sub as string) || '';
        const jwtGithubToken = (jwt as any)?.githubAccessToken as string | undefined;
        const dbGithubToken = userId ? await fetchGithubTokenFromDb(userId).catch(() => null) : null;
        const token = await getValidGithubToken(jwtGithubToken, userId || undefined) || dbGithubToken;
        if (!token) {
            return NextResponse.json({ code: 'GITHUB_NOT_CONNECTED', repos: [] }, { status: 400 });
        }
        const r = await listUserRepos(token, { sort: 'updated', per_page: 100 });
        if ('error' in r) {
            return NextResponse.json({ error: r.error, message: r.message, repos: [] }, { status: 502 });
        }
        return NextResponse.json({ repos: r.data });
    } catch (e: any) {
        return NextResponse.json({ error: 'failed', message: e?.message || 'Failed to list repos', repos: [] }, { status: 500 });
    }
}
