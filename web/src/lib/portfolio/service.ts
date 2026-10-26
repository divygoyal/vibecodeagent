/**
 * Server-only: load a user's portfolio from the snapshot store, starting a
 * background sync when the data is older than 6 hours. Shared by
 * GET /api/portfolio and GET /api/portfolio/export.csv.
 */
import { adminStore, AdminStoreError } from './adminStore';
import { googleAccessFor } from './auth';
import { buildPortfolio, RECENT_DAYS } from './build';
import { bucketDaysFor, windowRequests } from './ranges';
import type { SnapshotData } from './snapshot';
import { isSyncRunning, lastSyncResult, needsSync, startSync } from './sync';
import type { PortfolioRange, PortfolioResponse } from './types';

function emptySnapshot(range: PortfolioRange): SnapshotData {
    return { assets: [], windows: {}, totals: [], series: {}, recent: {}, bucket_days: bucketDaysFor(range) };
}

export async function loadPortfolio(identifier: string, range: PortfolioRange, req?: Request): Promise<PortfolioResponse> {
    const now = Date.now();
    const access = await googleAccessFor(identifier, req);

    let snap: SnapshotData;
    try {
        snap = await adminStore.snapshot(identifier, {
            windows: windowRequests(range, now),
            bucket_days: bucketDaysFor(range),
            recent_days: RECENT_DAYS,
        });
    } catch (err) {
        if (!(err instanceof AdminStoreError && err.status === 404)) throw err;
        snap = emptySnapshot(range); // user row not created yet
    }

    if (!access.ok) {
        const res = buildPortfolio(snap, {
            range, now,
            googleError: { status: 401, message: access.reason === 'not_connected' ? 'Google is not connected' : 'Google access expired. Reconnect Google.' },
        });
        if (res.sites.length === 0) res.state = 'no_google';
        return res;
    }

    let syncing = isSyncRunning(identifier);
    if (!syncing && needsSync(snap.assets, Math.floor(now / 1000))) {
        void startSync({ identifier, accessToken: access.token, reason: 'page' });
        syncing = true;
    }
    const last = lastSyncResult(identifier);
    const res = buildPortfolio(snap, {
        range, now, syncing,
        googleError: last?.googleError ?? null,
        noSites: !syncing && snap.assets.length === 0 && Boolean(last) && (last?.properties ?? 0) + (last?.sites ?? 0) === 0,
    });
    if (res.sites.length === 0 && !syncing && res.googleError?.status === 401) res.state = 'no_google';
    return res;
}
