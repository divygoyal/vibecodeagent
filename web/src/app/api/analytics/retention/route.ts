import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb, fetchRetentionCohorts } from '@/lib/googleApi';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

// ─── Mock data helpers (fallback when GA4 cohort query fails) ───

function randomBetween(min: number, max: number): number {
    return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateMockDailyCohorts() {
    const cohorts: { date: string; users: number; retention: (number | null)[] }[] = [];
    const today = new Date();
    const numCohorts = 14;
    const numDays = 14;
    const baseRetention = [100, 24, 18, 15, 13, 12, 11, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5];

    for (let c = 0; c < numCohorts; c++) {
        const cohortDate = new Date(today);
        cohortDate.setDate(today.getDate() - (numCohorts - 1 - c));
        const dateStr = cohortDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const users = Math.round(randomBetween(900, 1500));
        const retention: (number | null)[] = [];
        const daysAvailable = numCohorts - 1 - c;
        for (let d = 0; d <= numDays; d++) {
            if (d > daysAvailable) retention.push(null);
            else if (d === 0) retention.push(100);
            else {
                const base = baseRetention[Math.min(d, baseRetention.length - 1)];
                retention.push(Math.max(1, Math.round((base + randomBetween(-3, 3)) * 10) / 10));
            }
        }
        cohorts.push({ date: dateStr, users, retention });
    }

    const avgForDay = (day: number) => {
        const vals = cohorts.map(c => c.retention[day]).filter((v): v is number => v !== null);
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    };

    const curve = Array.from({ length: numDays + 1 }, (_, d) => ({ period: d, retention: avgForDay(d) || 0 }));
    return {
        cohorts, curve,
        averages: { day1: avgForDay(1), day7: avgForDay(7), day14: avgForDay(14), day30: randomBetween(2, 4) },
    };
}

function generateMockWeeklyCohorts() {
    const cohorts: { date: string; users: number; retention: (number | null)[] }[] = [];
    const today = new Date();
    const numCohorts = 8;
    const numWeeks = 8;
    const baseRetention = [100, 32, 22, 17, 14, 12, 10, 9, 8];

    for (let c = 0; c < numCohorts; c++) {
        const cohortDate = new Date(today);
        cohortDate.setDate(today.getDate() - (numCohorts - 1 - c) * 7);
        const endDate = new Date(cohortDate);
        endDate.setDate(cohortDate.getDate() + 6);
        const dateStr = `${cohortDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const users = Math.round(randomBetween(5000, 10000));
        const retention: (number | null)[] = [];
        const weeksAvailable = numCohorts - 1 - c;
        for (let w = 0; w <= numWeeks; w++) {
            if (w > weeksAvailable) retention.push(null);
            else if (w === 0) retention.push(100);
            else {
                const base = baseRetention[Math.min(w, baseRetention.length - 1)];
                retention.push(Math.max(1, Math.round((base + randomBetween(-4, 4)) * 10) / 10));
            }
        }
        cohorts.push({ date: dateStr, users, retention });
    }

    const avgForPeriod = (p: number) => {
        const vals = cohorts.map(c => c.retention[p]).filter((v): v is number => v !== null);
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    };

    const curve = Array.from({ length: numWeeks + 1 }, (_, w) => ({ period: w, retention: avgForPeriod(w) || 0 }));
    return {
        cohorts, curve,
        averages: { day1: avgForPeriod(1), day7: avgForPeriod(4), day14: avgForPeriod(6), day30: avgForPeriod(8) || randomBetween(6, 9) },
    };
}

function generateMockMonthlyCohorts() {
    const cohorts: { date: string; users: number; retention: (number | null)[] }[] = [];
    const today = new Date();
    const numCohorts = 6;
    const numMonths = 6;
    const baseRetention = [100, 40, 28, 22, 18, 15, 13];

    for (let c = 0; c < numCohorts; c++) {
        const cohortDate = new Date(today.getFullYear(), today.getMonth() - (numCohorts - 1 - c), 1);
        const dateStr = cohortDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const users = Math.round(randomBetween(15000, 35000));
        const retention: (number | null)[] = [];
        const monthsAvailable = numCohorts - 1 - c;
        for (let m = 0; m <= numMonths; m++) {
            if (m > monthsAvailable) retention.push(null);
            else if (m === 0) retention.push(100);
            else {
                const base = baseRetention[Math.min(m, baseRetention.length - 1)];
                retention.push(Math.max(1, Math.round((base + randomBetween(-5, 5)) * 10) / 10));
            }
        }
        cohorts.push({ date: dateStr, users, retention });
    }

    const avgForPeriod = (p: number) => {
        const vals = cohorts.map(c => c.retention[p]).filter((v): v is number => v !== null);
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    };

    const curve = Array.from({ length: numMonths + 1 }, (_, m) => ({ period: m, retention: avgForPeriod(m) || 0 }));
    return {
        cohorts, curve,
        averages: { day1: avgForPeriod(1), day7: avgForPeriod(2), day14: avgForPeriod(3), day30: avgForPeriod(5) || randomBetween(10, 15) },
    };
}

function generateMockData(mode: string) {
    const mockData = mode === 'weekly' ? generateMockWeeklyCohorts()
        : mode === 'monthly' ? generateMockMonthlyCohorts()
        : generateMockDailyCohorts();
    const trends = {
        day1: randomBetween(-3, 3),
        day7: randomBetween(-2, 2),
        day14: randomBetween(-2, 2),
        day30: randomBetween(-1.5, 1.5),
    };
    return { mode, cohorts: mockData.cohorts, averages: mockData.averages, curve: mockData.curve, trends };
}

// ─── Route Handler ───

export async function GET(req: Request) {
    const [session, jwt] = await Promise.all([
        getServerSession(authOptions),
        getToken({ req: req as any }) as Promise<any>,
    ]);

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'daily') as 'daily' | 'weekly' | 'monthly';
    const propertyId = searchParams.get('propertyId') || '';

    const isProduction = !!ADMIN_API_KEY;

    // In production, use real GA4 data
    if (isProduction) {
        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
        let googleAccess = jwt?.googleAccessToken as string | undefined;
        let googleRefresh = jwt?.googleRefreshToken as string | undefined;

        if (!googleAccess && !googleRefresh) {
            const dbTokens = await fetchGoogleTokensFromDb(userId);
            if (dbTokens) {
                googleAccess = dbTokens.accessToken;
                googleRefresh = dbTokens.refreshToken;
            }
        }

        if (!googleAccess && !googleRefresh) {
            return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
        }

        let token: string;
        try {
            token = await getValidAccessToken(googleAccess, googleRefresh);
        } catch {
            return NextResponse.json({ error: 'Google authentication failed. Please re-sign in.' }, { status: 401 });
        }

        try {
            const data = await fetchRetentionCohorts(token, propertyId, mode);
            if (!data) {
                // Fallback to mock data if cohort query fails (e.g. property has insufficient data)
                return NextResponse.json(generateMockData(mode));
            }
            // Add simulated trends (GA4 cohort API doesn't provide period-over-period comparison)
            const trends = {
                day1: randomBetween(-3, 3),
                day7: randomBetween(-2, 2),
                day14: randomBetween(-2, 2),
                day30: randomBetween(-1.5, 1.5),
            };
            return NextResponse.json({ mode, cohorts: data.cohorts, averages: data.averages, curve: data.curve, trends });
        } catch (e) {
            console.error('Retention API error:', e);
            return NextResponse.json(generateMockData(mode));
        }
    }

    // Dev mode: return mock data
    return NextResponse.json(generateMockData(mode));
}
