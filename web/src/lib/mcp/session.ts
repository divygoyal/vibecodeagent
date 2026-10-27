import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export interface SessionUser {
    /** Primary provider sub: the identifier the admin service resolves. */
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    provider: string | null;
    googleAccessToken: string | null;
    googleRefreshToken: string | null;
}

export async function getSessionUser(): Promise<{ user: SessionUser; session: unknown } | null> {
    const session = await getServerSession(authOptions);
    const u = session?.user as Record<string, unknown> | undefined;
    if (!u || typeof u.id !== 'string' || !u.id) return null;
    return {
        session,
        user: {
            id: u.id,
            name: (u.name as string | null) ?? null,
            email: (u.email as string | null) ?? null,
            image: (u.image as string | null) ?? null,
            provider: (u.provider as string | null) ?? null,
            googleAccessToken: (u.googleAccessToken as string | null) || null,
            googleRefreshToken: (u.googleRefreshToken as string | null) || null,
        },
    };
}
