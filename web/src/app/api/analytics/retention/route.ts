import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─── Helpers ───

function randomBetween(min: number, max: number): number {
    return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateDailyCohorts(): {
    cohorts: { date: string; users: number; retention: (number | null)[] }[];
    averages: { day1: number; day7: number; day14: number; day30: number };
    curve: { period: number; retention: number }[];
} {
    const cohorts: { date: string; users: number; retention: (number | null)[] }[] = [];
    const today = new Date();
    const numCohorts = 14;
    const numDays = 14;

    // Realistic daily retention decay curve (base values)
    const baseRetention = [
        100, 24, 18, 15, 13, 12, 11, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5,
    ];

    for (let c = 0; c < numCohorts; c++) {
        const cohortDate = new Date(today);
        cohortDate.setDate(today.getDate() - (numCohorts - 1 - c));
        const dateStr = cohortDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const users = Math.round(randomBetween(900, 1500));

        const retention: (number | null)[] = [];
        const daysAvailable = numCohorts - 1 - c; // how many days of data we have

        for (let d = 0; d <= numDays; d++) {
            if (d > daysAvailable) {
                retention.push(null); // not enough time elapsed
            } else if (d === 0) {
                retention.push(100);
            } else {
                const base = baseRetention[Math.min(d, baseRetention.length - 1)];
                const variance = randomBetween(-3, 3);
                retention.push(Math.max(1, Math.round((base + variance) * 10) / 10));
            }
        }

        cohorts.push({ date: dateStr, users, retention });
    }

    // Calculate averages across all cohorts
    const avgForDay = (day: number): number => {
        const vals = cohorts
            .map(c => c.retention[day])
            .filter((v): v is number => v !== null);
        if (vals.length === 0) return 0;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    const averages = {
        day1: avgForDay(1),
        day7: avgForDay(7),
        day14: avgForDay(14),
        day30: Math.round(randomBetween(2, 4) * 10) / 10, // simulated since we only have 14 cohorts
    };

    // Build the retention curve (average across cohorts for each period)
    const curve: { period: number; retention: number }[] = [];
    for (let d = 0; d <= numDays; d++) {
        curve.push({ period: d, retention: avgForDay(d) || 0 });
    }

    return { cohorts, averages, curve };
}

function generateWeeklyCohorts(): {
    cohorts: { date: string; users: number; retention: (number | null)[] }[];
    averages: { day1: number; day7: number; day14: number; day30: number };
    curve: { period: number; retention: number }[];
} {
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
            if (w > weeksAvailable) {
                retention.push(null);
            } else if (w === 0) {
                retention.push(100);
            } else {
                const base = baseRetention[Math.min(w, baseRetention.length - 1)];
                const variance = randomBetween(-4, 4);
                retention.push(Math.max(1, Math.round((base + variance) * 10) / 10));
            }
        }

        cohorts.push({ date: dateStr, users, retention });
    }

    const avgForPeriod = (p: number): number => {
        const vals = cohorts.map(c => c.retention[p]).filter((v): v is number => v !== null);
        if (vals.length === 0) return 0;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    const averages = {
        day1: avgForPeriod(1), // Week 1
        day7: avgForPeriod(4), // Week 4
        day14: avgForPeriod(6), // Week 6
        day30: avgForPeriod(8) || Math.round(randomBetween(6, 9) * 10) / 10, // Week 8
    };

    const curve: { period: number; retention: number }[] = [];
    for (let w = 0; w <= numWeeks; w++) {
        curve.push({ period: w, retention: avgForPeriod(w) || 0 });
    }

    return { cohorts, averages, curve };
}

function generateMonthlyCohorts(): {
    cohorts: { date: string; users: number; retention: (number | null)[] }[];
    averages: { day1: number; day7: number; day14: number; day30: number };
    curve: { period: number; retention: number }[];
} {
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
            if (m > monthsAvailable) {
                retention.push(null);
            } else if (m === 0) {
                retention.push(100);
            } else {
                const base = baseRetention[Math.min(m, baseRetention.length - 1)];
                const variance = randomBetween(-5, 5);
                retention.push(Math.max(1, Math.round((base + variance) * 10) / 10));
            }
        }

        cohorts.push({ date: dateStr, users, retention });
    }

    const avgForPeriod = (p: number): number => {
        const vals = cohorts.map(c => c.retention[p]).filter((v): v is number => v !== null);
        if (vals.length === 0) return 0;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    const averages = {
        day1: avgForPeriod(1),  // Month 1
        day7: avgForPeriod(2),  // Month 2
        day14: avgForPeriod(3), // Month 3
        day30: avgForPeriod(5) || Math.round(randomBetween(10, 15) * 10) / 10, // Month 5
    };

    const curve: { period: number; retention: number }[] = [];
    for (let m = 0; m <= numMonths; m++) {
        curve.push({ period: m, retention: avgForPeriod(m) || 0 });
    }

    return { cohorts, averages, curve };
}

// ─── Route Handler ───

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'daily';

    let data;

    switch (mode) {
        case 'weekly':
            data = generateWeeklyCohorts();
            break;
        case 'monthly':
            data = generateMonthlyCohorts();
            break;
        default:
            data = generateDailyCohorts();
            break;
    }

    // Add previous period trends (simulated)
    const trends = {
        day1: randomBetween(-3, 3),
        day7: randomBetween(-2, 2),
        day14: randomBetween(-2, 2),
        day30: randomBetween(-1.5, 1.5),
    };

    return NextResponse.json({
        mode,
        cohorts: data.cohorts,
        averages: data.averages,
        curve: data.curve,
        trends,
    });
}
