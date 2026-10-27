/**
 * Server-only: load a user's portfolio from the snapshot store, starting a
 * background sync when the data is older than 6 hours. Shared by
 * GET /api/portfolio and GET /api/portfolio/export.csv.
 */
import { adminStore, AdminStoreError } from './adminStore';
import { googleAccessFor, sessionUserRegistrar } from './auth';
import { buildPortfolio, rangeUsersNeeded, RECENT_DAYS } from './build';
import { bucketDaysFor, windowRequests } from './ranges';
import type { SnapshotData } from './snapshot';
import { isRangeUsersRunning, isSyncRunning, lastSyncResult, needsSync, rangeUsersFailedRecently, startRangeUsers, startSync } from './sync';
import type { PortfolioRange, PortfolioResponse } from './types';

/**
 * With nothing stored, needsSync() is always true. After a sync that found no
 * property and no site (or failed at Google) wait before starting another one:
 * otherwise every poll started a new sync, `syncing` never turned false and the
 * page stayed on "Finding your sites" (and hammered Google during a quota error).
 * "Check again" (POST /api/portfolio/sync) is not held back.
 */
const EMPTY_RECHECK_MS = 10 * 60_000;
const ERROR_RETRY_MS = 60_000;

function emptySnapshot(range: PortfolioRange): SnapshotData {
    return { assets: [], windows: {}, totals: [], series: {}, recent: {}, bucket_days: bucketDaysFor(range) };
}

export async function loadPortfolio(identifier: string, range: PortfolioRange, req?: Request): Promise<PortfolioResponse> {
    const now = Date.now();
    // The token check (a refresh at Google when the token is old) and the snapshot do not depend on each
    // other: run them together so a first load waits for the slower one, not for both.
    const loadSnapshot = async (): Promise<SnapshotData> => {
        try {
            return await adminStore.snapshot(identifier, {
                windows: windowRequests(range, now),
                bucket_days: bucketDaysFor(range),
                recent_days: RECENT_DAYS,
                range_key: range,
            });
        } catch (err) {
            if (!(err instanceof AdminStoreError && err.status === 404)) throw err;
            return emptySnapshot(range); // user row not created yet
        }
    };
    const [access, snap] = await Promise.all([googleAccessFor(identifier, req), loadSnapshot()]);

    if (!access.ok) {
        const res = buildPortfolio(snap, {
            range, now,
            googleError: { status: 401, message: access.reason === 'not_connected' ? 'Google is not connected' : 'Google access expired. Reconnect Google.' },
        });
        if (res.sites.length === 0) res.state = 'no_google';
        return res;
    }

    const last = lastSyncResult(identifier);
    const settledEmpty = snap.assets.length === 0 && last !== undefined
        && (last.googleError !== null || last.properties + last.sites === 0)
        && now - (last.startedAt + last.ms) < (last.googleError ? ERROR_RETRY_MS : EMPTY_RECHECK_MS);
    let syncing = isSyncRunning(identifier);
    if (!syncing && !settledEmpty && needsSync(snap.assets, Math.floor(now / 1000))) {
        void startSync({ identifier, accessToken: access.token, reason: 'page', ensureUser: await sessionUserRegistrar(req) });
        syncing = true;
    }
    // Exact users for the range being viewed: fetched lazily, cached 6 hours.
    // Waits for the daily sync so a first visit does not double the Google load.
    let usersPending = isRangeUsersRunning(identifier, range);
    const ga4Window = snap.windows.ga4;
    // After a failed run (quota, outage) wait 5 minutes: the cards show summed users meanwhile.
    if (!usersPending && !syncing && ga4Window && !rangeUsersFailedRecently(identifier, range, now)) {
        const need = rangeUsersNeeded(snap, Math.floor(now / 1000));
        if (need.length > 0) {
            void startRangeUsers({ identifier, accessToken: access.token, rangeKey: range, window: ga4Window, properties: need.map((a) => a.asset_id) });
            usersPending = true;
        }
    }

    const res = buildPortfolio(snap, {
        range, now, syncing, usersPending: usersPending || (syncing && snap.assets.some((a) => a.asset_kind === 'ga4')),
        googleError: last?.googleError ?? null,
        noSites: !syncing && snap.assets.length === 0 && Boolean(last) && !last?.googleError && (last?.properties ?? 0) + (last?.sites ?? 0) === 0,
    });
    if (res.sites.length === 0 && !syncing && res.googleError?.status === 401) res.state = 'no_google';
    return res;
}
