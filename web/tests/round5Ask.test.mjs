// Round 5 stream F: Ask answers in the app's language (links, changes, tables) and the plan meter. Run: cd web && node --test tests/round5Ask.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { linkAnswer, parseDelta, parseNumber, analyzeTable } = await import('../src/lib/chat/answerFormat.ts');

const SITES = [
    { host: 'acmeanalytics.example', names: ['acmeanalytics.example', 'Acme Analytics'] },
    { host: 'docs.acmeanalytics.example', names: ['docs.acmeanalytics.example'] },
    { host: 'recipenest.example', names: ['recipenest.example', 'www.recipenest.example'] },
    { host: 'ga4-412300108', names: ['ga4-412300108', 'Creative Prints', 'creativeprints.example'] },
];

test('linkAnswer: site names link to their site page, the longest name wins, URLs and code stay', () => {
    const out = linkAnswer('**recipenest.example** grew; docs.acmeanalytics.example too. See https://recipenest.example/x and `acmeanalytics.example`.', SITES);
    assert.match(out, /\*\*\[recipenest\.example\]\(\/dashboard\/s\/recipenest\.example\)\*\*/);
    assert.match(out, /\[docs\.acmeanalytics\.example\]\(\/dashboard\/s\/docs\.acmeanalytics\.example\)/);
    assert.ok(!out.includes('[acmeanalytics.example](/dashboard/s/acmeanalytics.example)'), 'no link inside docs. host or code');
    assert.ok(out.includes('https://recipenest.example/x'), 'bare URL untouched');
    assert.match(linkAnswer('Creative Prints sold 40 prints.', SITES), /^\[Creative Prints\]\(\/dashboard\/s\/ga4-412300108\)/);
    // A name at the end of a sentence still links; a longer host does not.
    assert.match(linkAnswer('Down on recipenest.example.', SITES), /\(\/dashboard\/s\/recipenest\.example\)\.$/);
    assert.equal(linkAnswer('see recipenest.examples', SITES), 'see recipenest.examples');
});

test('linkAnswer: "its Search tab" links to the site named before it, else to the current site', () => {
    const out = linkAnswer('Worth a look: **recipenest.example** is down 7%. Open its Search tab to see which queries lost clicks.', SITES);
    assert.match(out, /\[its Search tab\]\(\/dashboard\/s\/recipenest\.example\/search\)/);
    assert.match(linkAnswer('Open the Actions page.', SITES, 'acmeanalytics.example'), /\[the Actions page\]\(\/dashboard\/s\/acmeanalytics\.example\/actions\)/);
    assert.match(linkAnswer('Check Search › Opportunities tab.', SITES, 'acmeanalytics.example'), /\(\/dashboard\/s\/acmeanalytics\.example\/search\?tab=opportunities\)/);
    assert.equal(linkAnswer('Open the Search tab.', SITES, null), 'Open the Search tab.', 'no site known: no link');
    const fenced = '```\nrecipenest.example\n```';
    assert.equal(linkAnswer(fenced, SITES), fenced);
    assert.equal(linkAnswer('|---|---:|', SITES), '|---|---:|');
});

test('parseDelta: signs, unicode minus, polarity, flat and ambiguous', () => {
    assert.deepEqual(parseDelta('+882%'), { direction: 'up', tone: 'good', text: '+882%' });
    assert.deepEqual(parseDelta('−7%'), { direction: 'down', tone: 'bad', text: '−7%' });
    assert.equal(parseDelta('-4.5%', { betterDown: true }).tone, 'good');
    assert.equal(parseDelta('0%').direction, 'flat');
    assert.equal(parseDelta('12%'), null, 'unsigned is a value, not a change');
    assert.equal(parseDelta('+342'), null, 'bare numbers only in change columns');
    assert.equal(parseDelta('+1.6', { bare: true, neutral: true }).tone, 'neutral');
    // Position changes (new minus old), the app's MetricDelta convention (r10): the arrow is where the number moved, the colour says better or worse.
    assert.deepEqual(parseDelta('+1.6', { bare: true, rank: true }), { direction: 'up', tone: 'bad', text: '1.6', spoken: 'worse by 1.6' });
    assert.deepEqual(parseDelta('−0.3', { bare: true, rank: true }), { direction: 'down', tone: 'good', text: '0.3', spoken: 'improved 0.3' });
    assert.equal(parseDelta('0.0', { bare: true, rank: true }).direction, 'flat');
    assert.equal(parseNumber('1,551'), 1551);
    assert.equal(parseNumber('12.4K'), 12400);
    assert.equal(parseNumber('–'), null);
});

test('analyzeTable: numbers right, changes coloured, bars on the ranked count, sparkline for dates', () => {
    const movers = analyzeTable(['Site', 'Users (28 days)', 'vs before', 'Search clicks', 'vs before'], [
        ['designstudio.example', '1,551', '+882%', '342', '+969%'],
        ['puzzlehub.example', '24,763', '+46%', '10,154', '+34%'],
        ['docs.acmeanalytics.example', '–', '–', '12,216', '+27%'],
    ]);
    assert.deepEqual(movers.numeric, [false, true, true, true, true]);
    assert.deepEqual(movers.delta, [false, false, true, false, true]);
    assert.deepEqual(movers.foldDelta, [false, false, true, false, true], 'on phones each change sits under its number: no sideways scroll');
    assert.equal(movers.barCol, 1);
    assert.equal(movers.barMetric, 'users');
    const queries = analyzeTable(['Query', 'Clicks', 'Impressions', 'CTR', 'Position'], [
        ['a', '900', '20,000', '4.5%', '3.1'], ['b', '700', '30,000', '2.3%', '5.0'], ['c', '400', '9,000', '4.4%', '2.2'],
    ]);
    assert.equal(queries.barCol, 1, 'clicks, sorted high to low');
    assert.equal(queries.betterDown[4], true);
    const pos = analyzeTable(['Query', 'Position', 'vs before'], [['a', '4.8', '+1.6'], ['b', '6.1', '−0.4'], ['c', '9.0', '+2.0']]);
    assert.equal(pos.delta[2], true);
    assert.equal(pos.rankDelta[2], true, 'a position change is drawn as a rank move');
    assert.equal(movers.rankDelta.some(Boolean), false);
    const weeks = analyzeTable(['Week', 'Clicks', 'Change'], [['Sep 29', '1,240', '–'], ['Oct 6', '1,310', '+6%'], ['Oct 13', '1,402', '+7%'], ['Oct 20', '1,612', '+15%']]);
    assert.deepEqual(weeks.foldDelta, [false, false, true]);
    assert.equal(analyzeTable(['Change', 'Clicks'], [['+5%', '1'], ['+6%', '2']]).foldDelta.some(Boolean), false);
    assert.equal(weeks.timeSeries, true);
    assert.equal(weeks.seriesCol, 1);
    assert.equal(weeks.barCol, -1, 'a time series gets a sparkline, not bars');
});

test('messageBalance: the meter counts against the plan allowance, extra messages are bonus', async () => {
    const { messageBalance, planAllowance } = await import('../src/lib/plans.ts');
    assert.equal(planAllowance('pro'), 100);
    assert.equal(planAllowance('growth'), 50);
    assert.equal(planAllowance('starter'), 50);
    assert.equal(planAllowance('free'), 5);
    assert.deepEqual(messageBalance(300, 'pro'), { allowance: 100, total: 300, fromPlan: 100, bonus: 200, pct: 100, level: 'ok' });
    assert.deepEqual(messageBalance(73, 'pro'), { allowance: 100, total: 73, fromPlan: 73, bonus: 0, pct: 73, level: 'ok' });
    assert.equal(messageBalance(9, 'growth').level, 'low');
    assert.equal(messageBalance(0, 'growth').level, 'out');
    assert.equal(messageBalance(3, 'free').pct, 60);
});
