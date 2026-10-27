// Round 2 site pages: source names, click-to-filter params, day/week/month buckets,
// rule-based findings and the Google update list.
// Run: cd web && node --test tests/siteRound2.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { sourceInfo, sourceMediumInfo, deviceLabel, geoLabel } = await import('../src/components/site/lib/sources.ts');
const { parseFilterParams, filtersToParams, ga4DimensionFilter, andFilters, cleanFilters, hasFilters } = await import('../src/components/site/lib/filters.ts');
const { bucketStart, isoWeekMonday, gaBucketDate, bucketDates, snapToBucket, bucketGscSeries, effectiveInterval, allowedIntervals } = await import('../src/components/site/lib/intervals.ts');
const { trendFinding, rateFinding, updateImpactFinding, peakHoursFinding, peakWindow, hourRange, overlayFinding, ctrBenchmarkFinding, geoFinding, topDriver } = await import('../src/components/site/lib/findings.ts');
const { GOOGLE_UPDATES, googleUpdatesIn, googleUpdateOn } = await import('../src/components/site/lib/googleUpdates.ts');

test('source names and favicon domains', () => {
    assert.deepEqual(sourceInfo('(direct)'), { label: 'Direct', domain: null, kind: 'direct' });
    assert.deepEqual(sourceInfo('(not set)'), { label: 'Not set', domain: null, kind: 'notset' });
    assert.equal(sourceInfo('google').label, 'Google');
    assert.equal(sourceInfo('google').domain, 'google.com');
    assert.equal(sourceInfo('google.co.uk').label, 'Google');
    assert.equal(sourceInfo('bing').label, 'Bing');
    assert.equal(sourceInfo('chatgpt.com').label, 'ChatGPT');
    assert.equal(sourceInfo('chatgpt.com').kind, 'ai');
    assert.equal(sourceInfo('t.co').label, 'X');
    assert.equal(sourceInfo('l.facebook.com').label, 'Facebook');
    assert.equal(sourceInfo('lm.facebook.com').domain, 'facebook.com');
    assert.equal(sourceInfo('https://www.reddit.com/r/x').label, 'Reddit');
    assert.equal(sourceInfo('news.ycombinator.com').label, 'Hacker News');
    assert.equal(sourceInfo('android-app://com.google.android.gm').label, 'Gmail');
    // Unknown domains keep their name and get their own favicon.
    assert.deepEqual(sourceInfo('www.someblog.io'), { label: 'someblog.io', domain: 'someblog.io', kind: 'referral' });
    // utm_source words keep the user's value, capitalised, no favicon.
    assert.deepEqual(sourceInfo('weekly_digest'), { label: 'Weekly_digest', domain: null, kind: 'other' });
    assert.equal(sourceInfo('newsletter').label, 'Newsletter');
});

test('source / medium, devices, geo', () => {
    assert.equal(sourceMediumInfo('google / organic').text, 'Google · organic');
    assert.equal(sourceMediumInfo('google / cpc').text, 'Google · paid search');
    assert.equal(sourceMediumInfo('(direct) / (none)').text, 'Direct');
    assert.equal(sourceMediumInfo('medium.com / referral').text, 'Medium');
    assert.equal(deviceLabel('mobile'), 'Mobile');
    assert.equal(deviceLabel('smart tv'), 'Smart TV');
    assert.equal(geoLabel('(not set)'), 'Unknown');
});

test('filter params round-trip into one GA4 dimensionFilter', () => {
    const f = parseFilterParams(['country:France', 'source:android-app://com.google.android.gm', 'bogus:1', 'device:']);
    assert.deepEqual(f, { country: 'France', source: 'android-app://com.google.android.gm' });
    assert.deepEqual(filtersToParams(f), ['source:android-app://com.google.android.gm', 'country:France']);
    assert.equal(hasFilters({}), false);
    assert.deepEqual(cleanFilters({ path: '/pricing', page: '/x' }), { path: '/pricing' });
    assert.equal(ga4DimensionFilter({}), null);
    assert.deepEqual(ga4DimensionFilter({ device: 'mobile' }), {
        filter: { fieldName: 'deviceCategory', stringFilter: { matchType: 'EXACT', value: 'mobile', caseSensitive: true } },
    });
    const two = ga4DimensionFilter({ country: 'France', channel: 'Organic Search' });
    assert.equal(two.andGroup.expressions.length, 2);
    assert.deepEqual(two.andGroup.expressions.map((e) => e.filter.fieldName), ['sessionDefaultChannelGroup', 'country']);
    const ai = { filter: { fieldName: 'sessionSource' } };
    assert.equal(andFilters(null, ai), ai);
    assert.equal(andFilters(two, ai).andGroup.expressions.length, 2);
});

test('day / week / month buckets', () => {
    assert.equal(bucketStart('2026-10-29', 'week'), '2026-10-26'); // Thursday -> Monday
    assert.equal(bucketStart('2026-10-26', 'week'), '2026-10-26');
    assert.equal(bucketStart('2026-11-01', 'week'), '2026-10-26'); // Sunday belongs to the week before
    assert.equal(bucketStart('2026-10-29', 'month'), '2026-10-01');
    assert.equal(isoWeekMonday(2026, 1), '2025-12-29');
    assert.equal(isoWeekMonday(2026, 44), '2026-10-26');
    assert.equal(gaBucketDate('202644', 'week', '2026-10-01'), '2026-10-26');
    assert.equal(gaBucketDate('202640', 'week', '2026-10-01'), '2026-10-01'); // clamped to the range start
    assert.equal(gaBucketDate('202609', 'month', '2026-09-15'), '2026-09-15');
    assert.deepEqual(bucketDates('2026-09-30', '2026-10-13', 'week'), ['2026-09-30', '2026-10-05', '2026-10-12']);
    assert.equal(snapToBucket('2026-10-07', ['2026-09-30', '2026-10-05', '2026-10-12']), '2026-10-05');
    assert.equal(snapToBucket('2026-09-01', ['2026-09-30']), null);
    assert.deepEqual(allowedIntervals(7), ['day']);
    assert.deepEqual(allowedIntervals(28), ['day', 'week']);
    assert.deepEqual(allowedIntervals(90), ['day', 'week', 'month']);
    assert.equal(effectiveInterval('month', 28), 'week');
    assert.equal(effectiveInterval('week', 7), 'day');
});

test('Search Console series roll up into weeks with weighted position', () => {
    const p = (date, clicks, impressions, position, prev = null) => ({ date, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position, ...(prev ? { prevDate: prev[0], prev_clicks: prev[1], prev_impressions: prev[2], prev_ctr: 0, prev_position: prev[3] } : {}) });
    const out = bucketGscSeries([
        p('2026-10-24', 10, 100, 4, ['2026-10-10', 5, 50, 6]), // Saturday
        p('2026-10-25', 30, 300, 8, ['2026-10-11', 5, 50, 8]), // Sunday
        p('2026-10-26', 5, 0, 0, ['2026-10-12', 1, 10, 9]), // Monday, new week
    ], 'week');
    assert.equal(out.length, 2);
    assert.equal(out[0].date, '2026-10-24');
    assert.equal(out[0].clicks, 40);
    assert.equal(out[0].impressions, 400);
    assert.equal(out[0].ctr, 0.1);
    assert.equal(out[0].position, 7); // (4*100 + 8*300) / 400
    assert.equal(out[0].prev_clicks, 10);
    assert.equal(out[0].prev_position, 7);
    assert.equal(out[0].prevDate, '2026-10-10');
    assert.equal(out[1].position, 0);
});

test('trend findings name the change and its biggest driver', () => {
    const f = trendFinding({
        metric: 'Clicks', cur: 1180, prev: 1000, compareText: 'previous 28 days', driverUnit: 'clicks',
        drivers: [{ label: '/pricing', cur: 400, prev: 260 }, { label: '/blog', cur: 300, prev: 280 }, { label: '/old', cur: 10, prev: 30 }],
    });
    assert.equal(f.text, 'Clicks up 18% vs previous 28 days, led by /pricing (+140 clicks).');
    assert.equal(f.tone, 'good');
    const down = trendFinding({ metric: 'Users', cur: 900, prev: 1000, compareText: 'previous 28 days', drivers: [{ label: 'Organic Search', cur: 500, prev: 600 }] });
    assert.equal(down.text, 'Users down 10% vs previous 28 days, mostly from Organic Search (−100).');
    assert.equal(down.tone, 'bad');
    assert.equal(trendFinding({ metric: 'Users', cur: 1010, prev: 1000, compareText: 'previous 7 days' }).text, 'Users steady vs previous 7 days (+1%).');
    const pos = trendFinding({ metric: 'Avg. position', cur: 8, prev: 10, lowerIsBetter: true });
    assert.equal(pos.tone, 'good');
    // Without a comparison: the busiest full day.
    const busy = trendFinding({ metric: 'Users', cur: 30, series: [{ date: '2026-10-20', value: 5 }, { date: '2026-10-21', value: 20 }, { date: '2026-10-22', value: 5 }, { date: '2026-10-23', value: 50 }], partialLast: true });
    assert.equal(busy.text, 'Busiest day: Wed, Oct 21, 20 users (2.0× the average day).');
    assert.equal(trendFinding({ metric: 'Users', cur: null }), null);
    // A driver that explains less than a fifth of the change is not named.
    assert.equal(topDriver([{ label: 'a', cur: 11, prev: 10 }, { label: 'b', cur: 20, prev: 10 }, { label: 'c', cur: 60, prev: 10 }], 1).label, 'c');
    assert.equal(topDriver([{ label: 'a', cur: 5, prev: 10 }], 1), null);
});

test('CTR and position findings use points and positions', () => {
    assert.equal(rateFinding({ metric: 'ctr', cur: 0.031, prev: 0.03, compareText: 'previous 28 days' }).text, 'CTR up 0.1 pt to 3.1% vs previous 28 days.');
    assert.equal(rateFinding({ metric: 'position', cur: 16.8, prev: 17.2 }).text, 'Average position improved from 17.2 to 16.8.');
    assert.equal(rateFinding({ metric: 'position', cur: 16.8, prev: 15 }).tone, 'bad');
    assert.equal(rateFinding({ metric: 'position', cur: 0 }), null);
});

test('a Google update that moved clicks is named', () => {
    const series = [];
    for (let i = 1; i <= 30; i++) series.push({ date: `2026-05-${String(i).padStart(2, '0')}`, value: i < 21 ? 100 : 70 });
    const f = updateImpactFinding(series, [{ name: 'May 2026 core update', start: '2026-05-21' }], 'Clicks');
    assert.equal(f.text, 'Clicks down 30% a day on average since the May 2026 core update began (May 21).');
    assert.equal(updateImpactFinding(series.map((x) => ({ ...x, value: 100 })), [{ name: 'x', start: '2026-05-21' }], 'Clicks'), null);
    assert.equal(updateImpactFinding(series, [{ name: 'late', start: '2026-05-28' }], 'Clicks'), null); // fewer than 7 days after
});

test('peak hours finding', () => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 1));
    grid[3][14] = 10;
    grid[3][15] = 10;
    grid[3][16] = 10;
    const w = peakWindow(grid);
    assert.equal(w.day, 3);
    assert.equal(w.hour, 14);
    assert.equal(peakHoursFinding(grid).text.startsWith('Busiest on Wednesdays, 2–5 pm: '), true);
    assert.equal(hourRange(11, 14), '11 am–2 pm');
    assert.equal(hourRange(21, 24), '9 pm–12 am');
    assert.equal(peakHoursFinding(Array.from({ length: 7 }, () => Array(24).fill(0))), null);
});

test('overlay, CTR benchmark and geo findings', () => {
    const clicks = [10, 20, 30, 40, 50, 60];
    const sessions = clicks.map((c) => c * 1.3);
    assert.match(overlayFinding(clicks, sessions).text, /1\.3× as many Google organic sessions as Search Console clicks and they move together/);
    assert.match(overlayFinding(clicks, clicks.map((c) => c * 0.6)).text, /60% as many/);
    assert.equal(overlayFinding([0, 0], [0, 0]), null);
    assert.match(ctrBenchmarkFinding([{ potential: 600 }, { potential: 640 }], 40).text, /^2 of 40 queries get fewer clicks than usual for their position: about \+1,240 clicks/);
    assert.equal(ctrBenchmarkFinding([], 12).tone, 'good');
    assert.equal(geoFinding([{ label: 'United States', cur: 440, prev: 400 }, { label: 'India', cur: 138, prev: 100 }, { label: 'France', cur: 422, prev: 420 }]).text,
        'United States brings 44% of users; India grew fastest (+38%).');
});

test('Google update list is sorted, well formed and searchable', () => {
    for (const u of GOOGLE_UPDATES) {
        assert.match(u.start, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(u.end >= u.start, u.name);
        assert.ok(['core', 'spam', 'helpful'].includes(u.kind));
    }
    const starts = GOOGLE_UPDATES.map((u) => u.start);
    assert.deepEqual([...starts].sort(), starts);
    assert.deepEqual(googleUpdatesIn('2026-03-01', '2026-06-30').map((u) => u.name), ['March 2026 spam update', 'March 2026 core update', 'May 2026 core update', 'June 2026 spam update']);
    assert.equal(googleUpdateOn('2026-05-25').name, 'May 2026 core update');
    assert.equal(googleUpdateOn('2026-07-15'), null);
});
