// Demo-mode fault injection (src/lib/demo/faults.ts) and the edge-case demo accounts.
// Run: cd web && node --test tests/demoFaults.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { parseDemoFaults, splitFaultToken } = await import('../src/lib/demo/faults.ts');
const { demoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
const { accountKeyFromToken, getDemoAccount, getDemoSite, getDemoSites, findSiteByPropertyId } = await import('../src/lib/demo/catalog.ts');

const noNetwork = () => { throw new Error('network'); };
const runReport = (token, signal) => demoGoogleFetch('https://analyticsdata.googleapis.com/v1beta/properties/412300101:runReport', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'engagementRate' }] }),
    signal,
}, noNetwork);
const gscQuery = (token) => demoGoogleFetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent('sc-domain:acmeanalytics.example')}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ startDate: '2026-09-01', endDate: '2026-09-30', dimensions: ['query'] }),
}, noNetwork);

test('parse: scopes, aliases and timeout ms', () => {
    assert.deepEqual(parseDemoFaults('ga4:timeout:8000,gsc:empty'), [
        { kind: 'timeout', scope: 'ga4', ms: 8000 },
        { kind: 'empty', scope: 'gsc', ms: undefined },
    ]);
    assert.deepEqual(parseDemoFaults('quota+all:500').map((f) => `${f.scope}:${f.kind}`), ['data:429', 'all:500']);
    assert.deepEqual(parseDemoFaults('nonsense, '), []);
    assert.deepEqual(splitFaultToken('demo-access:main~429'), { token: 'demo-access:main', spec: '429' });
    assert.equal(accountKeyFromToken('demo-refresh:many~gsc:403'), 'many');
});

test('no faults: the generator answers', async () => {
    const res = await runReport('demo-access:main');
    assert.equal(res.status, 200);
    assert.ok((await res.json()).rows.length > 0);
});

test('429 / 403 / 500 from a token suffix, with Google-shaped bodies', async () => {
    for (const [spec, status, googleStatus] of [['429', 429, 'RESOURCE_EXHAUSTED'], ['403', 403, 'PERMISSION_DENIED'], ['500', 500, 'INTERNAL']]) {
        const res = await runReport(`demo-access:main~${spec}`);
        assert.equal(res.status, status);
        assert.equal((await res.json()).error.status, googleStatus);
    }
});

test('scoped fault: gsc:403 leaves GA4 working', async () => {
    assert.equal((await runReport('demo-access:main~gsc:403')).status, 200);
    assert.equal((await gscQuery('demo-access:main~gsc:403')).status, 403);
});

test('empty: no rows; huge: counts x 10M, rates untouched', async () => {
    const empty = await (await runReport('demo-access:main~empty')).json();
    assert.equal(empty.rows, undefined);
    assert.equal(empty.rowCount, 0);
    assert.equal((await (await gscQuery('demo-access:main~empty')).json()).rows, undefined);

    const normal = await (await runReport('demo-access:main')).json();
    const huge = await (await runReport('demo-access:main~huge')).json();
    assert.equal(Number(huge.rows[0].metricValues[0].value), Number(normal.rows[0].metricValues[0].value) * 10_000_000);
    assert.equal(huge.rows[0].metricValues[1].value, normal.rows[0].metricValues[1].value);
});

test('revoked: refresh gives invalid_grant, data calls 401', async () => {
    const token = await demoGoogleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: 'grant_type=refresh_token&refresh_token=demo-refresh:main~revoked' }, noNetwork);
    assert.equal(token.status, 400);
    assert.equal((await token.json()).error, 'invalid_grant');
    assert.equal((await runReport('demo-access:main~revoked')).status, 401);
    // A healthy refresh keeps the scenario suffix on the new access token.
    const ok = await demoGoogleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: 'grant_type=refresh_token&refresh_token=demo-refresh:main~gsc:429' }, noNetwork);
    assert.equal((await ok.json()).access_token, 'demo-access:main~gsc:429');
});

test('timeout: 504 after the wait, AbortError when the caller gives up', async () => {
    const t0 = Date.now();
    const res = await runReport('demo-access:main~timeout:60');
    assert.equal(res.status, 504);
    assert.ok(Date.now() - t0 >= 55);
    await assert.rejects(runReport('demo-access:main~timeout:5000', AbortSignal.timeout(30)), (err) => err.name === 'TimeoutError' || err.name === 'AbortError');
});

test('TC_DEMO_FAULTS env applies to every call; list:empty empties the account list', async () => {
    process.env.TC_DEMO_FAULTS = 'list:empty';
    try {
        const res = await demoGoogleFetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', { headers: { Authorization: 'Bearer demo-access:main' } }, noNetwork);
        assert.deepEqual(await res.json(), {});
        assert.equal((await runReport('demo-access:main')).status, 200, 'list faults leave data calls alone');
    } finally {
        delete process.env.TC_DEMO_FAULTS;
    }
});

test('edge-case accounts: empty, ga4only, gsconly, many (200 sites, not in the public catalogue)', () => {
    assert.equal(getDemoAccount('empty').gaAccounts.length + getDemoAccount('empty').gscSiteKeys.length, 0);
    assert.equal(getDemoAccount('ga4only').gscSiteKeys.length, 0);
    assert.equal(getDemoAccount('gsconly').gaAccounts.length, 0);
    const many = getDemoAccount('many');
    const keys = new Set([...many.gaAccounts.flatMap((a) => a.siteKeys), ...many.gscSiteKeys]);
    assert.equal(keys.size, 200);
    assert.ok(!getDemoSites().some((s) => s.key.startsWith('bulk')));
    const s = getDemoSite('bulk001');
    assert.equal(findSiteByPropertyId(s.ga.propertyId)?.key, 'bulk001');
});
