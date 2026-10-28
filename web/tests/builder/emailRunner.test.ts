/**
 * Scheduled dashboard email (round 9): the runner against an in-memory store and a mock transport.
 * Idempotency, per-owner caps, recipient confirmation, unsubscribe, failure handling, the test send,
 * and the email built from canned widget results.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/emailRunner.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanSpec, specFromToken } from '@/lib/builder/email/chartSpec';
import { buildDigestModel } from '@/lib/builder/email/digestModel';
import { renderReportHtml, renderConfirmHtml } from '@/lib/builder/email/render';
import { allowedByCap, applyLink, classifyRecipients, confirmNewRecipients, runDueSchedules, sendTestNow, type RunnerDeps } from '@/lib/builder/email/runner';
import { DEFAULT_CONFIG, type EmailScheduleConfig } from '@/lib/builder/email/schedule';
import { InMemoryStore } from '@/lib/builder/email/store';
import { MockTransport } from '@/lib/builder/email/transport';
import { verifyToken } from '@/lib/builder/email/tokens';
import type { DigestModel, ScheduleRow } from '@/lib/builder/email/types';
import { buildFromTemplate } from '@/lib/builder/templates';
import type { DashboardDocV2, DashboardQueryResponse, DataFrame, WidgetResult } from '@/lib/builder/types';

const SECRET = 'test-secret';
const ORIGIN = 'https://app.example.test';
const NOW = Date.parse('2026-10-28T09:05:00Z'); // 5 minutes after a 09:00 UTC daily window

const config = (o: Partial<EmailScheduleConfig> = {}): EmailScheduleConfig => ({
    ...DEFAULT_CONFIG, enabled: true, recipients: ['owner@example.com'], frequency: 'daily', time: '09:00', timezone: 'UTC', since: '2026-10-01T00:00:00Z', ...o,
});
const row = (id: string, c: EmailScheduleConfig, o: Partial<ScheduleRow> = {}, state: ScheduleRow['schedule']['state'] = {}): ScheduleRow => ({
    dashboardId: id, name: `Dash ${id}`, ownerUserId: 1, ownerIdentifier: 'gh-1', ownerEmail: 'owner@example.com', shareToken: null, schedule: { config: c, state }, ...o,
});
const digest = (name = 'Weekly report'): DigestModel => ({
    dashboardName: name, rangeLabel: 'Last 7 days · Oct 21 – Oct 27', siteLabel: 'acme.test', pages: [{ title: 'Overview', kpis: [{ label: 'Clicks', value: '1.2K', delta: { text: '12.4%', dir: 'up', tone: 'good' }, compare: 'vs previous period' }], charts: [] }],
    viewUrl: `${ORIGIN}/dashboard/dashboards/x`, viewKind: 'app', message: '', accent: '#0d3a2c', scheduleText: 'You get this email every day at 09:00 (UTC).',
});
function setup(rows: ScheduleRow[], o: Partial<RunnerDeps> = {}) {
    const store = new InMemoryStore(rows);
    const transport = new MockTransport();
    const built: string[] = [];
    const deps: RunnerDeps = { now: NOW, store, transport, origin: ORIGIN, secret: SECRET, buildDigest: async (r) => { built.push(r.dashboardId); return digest(r.name); }, ...o };
    return { store, transport, deps, built };
}
const state = (store: InMemoryStore, id: string) => store.rows.find((r) => r.dashboardId === id)!.schedule.state;

// ── idempotency ──────────────────────────────────────────────────────────

test('idempotent: the same window is sent once however often the cron runs', async () => {
    const { deps, transport, store } = setup([row('d1', config())]);
    const a = await runDueSchedules(deps);
    assert.equal(a.emailsSent, 1);
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].kind, 'report');
    assert.equal(state(store, 'd1').claimed, '2026-10-28T09:00:00.000Z');
    const b = await runDueSchedules({ ...deps, now: NOW + 10 * 60_000 });
    assert.equal(b.emailsSent, 0);
    assert.equal(transport.sent.length, 1, 'a second run in the same window sends nothing');
    const c = await runDueSchedules({ ...deps, now: Date.parse('2026-10-29T09:02:00Z') });
    assert.equal(c.emailsSent, 1, 'the next day is a new window');
});

test('idempotent: two runs at the same moment (overlapping cron) send once', async () => {
    const { deps, transport } = setup([row('d1', config({ recipients: ['owner@example.com'] }))]);
    const [a, b] = await Promise.all([runDueSchedules(deps), runDueSchedules(deps)]);
    assert.equal(a.emailsSent + b.emailsSent, 1);
    assert.equal(transport.sent.length, 1);
});

test('nothing is due before the time, for a disabled schedule, or past the grace period', async () => {
    const early = setup([row('d1', config())], { now: Date.parse('2026-10-28T08:55:00Z'), });
    // the previous day's window is already past grace and claimed state is empty, so still nothing
    assert.equal((await runDueSchedules(early.deps)).emailsSent, 0);
    const off = setup([row('d1', config({ enabled: false }))]);
    assert.equal((await runDueSchedules(off.deps)).emailsSent, 0);
    const late = setup([row('d1', config())], { now: Date.parse('2026-10-28T16:00:00Z') });
    assert.equal((await runDueSchedules(late.deps)).emailsSent, 0);
});

// ── failures ─────────────────────────────────────────────────────────────

test('a failed read of the data sends nothing and gives the window back for a retry', async () => {
    let fail = true;
    const { deps, transport, store } = setup([row('d1', config())], { buildDigest: async () => { if (fail) throw new Error('Google is down'); return digest(); } });
    const a = await runDueSchedules(deps);
    assert.equal(a.items[0].status, 'error');
    assert.equal(transport.sent.length, 0);
    assert.equal(state(store, 'd1').claimed, undefined);
    fail = false;
    const b = await runDueSchedules({ ...deps, now: NOW + 15 * 60_000 });
    assert.equal(b.emailsSent, 1, 'the next run inside the grace period retries');
});

test('when every send fails the window is released; when one succeeds it is kept', async () => {
    const rows = [row('d1', config({ recipients: ['owner@example.com', 'a@example.com'] }), {}, { recipients: { 'a@example.com': { status: 'confirmed' } } })];
    const down = setup(rows, { transport: new MockTransport(null, () => true) });
    const a = await runDueSchedules(down.deps);
    assert.equal(a.emailsSent, 0);
    assert.equal(state(down.store, 'd1').claimed, undefined);
    const half = setup(rows, { transport: new MockTransport(null, (m) => m.to === 'a@example.com') });
    const b = await runDueSchedules(half.deps);
    assert.equal(b.emailsSent, 1);
    assert.equal(state(half.store, 'd1').claimed, '2026-10-28T09:00:00.000Z');
});

// ── caps ─────────────────────────────────────────────────────────────────

test('allowedByCap', () => {
    assert.equal(allowedByCap(5, 0, 3), 3);
    assert.equal(allowedByCap(5, 2, 3), 1);
    assert.equal(allowedByCap(5, 3, 3), 0);
    assert.equal(allowedByCap(5, 9, 3), 0);
});

test('daily cap per owner: across all of the owner\'s dashboards, resets the next UTC day, other owners unaffected', async () => {
    const confirmed = (emails: string[]) => Object.fromEntries(emails.map((e) => [e, { status: 'confirmed' as const }]));
    const five = ['a', 'b', 'c', 'd', 'e'].map((x) => `${x}@example.com`);
    const rows = [
        row('d1', config({ recipients: five }), {}, { recipients: confirmed(five) }),
        row('d2', config({ recipients: five }), {}, { recipients: confirmed(five) }),
        row('d3', config({ recipients: ['other@example.com'] }), { ownerUserId: 2, ownerIdentifier: 'gh-2', ownerEmail: 'other@example.com' }),
    ];
    const { deps, transport } = setup(rows, { dailyCap: 7 });
    const r = await runDueSchedules(deps);
    const byDash = (id: string) => transport.sent.filter((m) => m.dashboardId === id).length;
    assert.equal(byDash('d1'), 5);
    assert.equal(byDash('d2'), 2, 'only 2 of the owner\'s 7 left');
    assert.equal(byDash('d3'), 1, 'another owner has their own cap');
    assert.ok(r.items.find((i) => i.dashboardId === 'd2')!.skipped.some((s) => s.includes('daily limit')));
    // next day: counts are per day
    const next = await runDueSchedules({ ...deps, now: Date.parse('2026-10-29T09:03:00Z') });
    assert.equal(next.emailsSent, 5 + 2 + 1, 'a new day, a new cap');
});

test('earlier sends today (from a previous run) count toward the cap', async () => {
    const rows = [row('d1', config({ recipients: ['owner@example.com'] }), {}, { sent: { '2026-10-28': 4 } })];
    const { deps, transport } = setup(rows, { dailyCap: 4 });
    assert.equal((await runDueSchedules(deps)).emailsSent, 0);
    assert.equal(transport.sent.length, 0);
});

// ── recipient confirmation ───────────────────────────────────────────────

test('classifyRecipients', () => {
    const c = classifyRecipients(['owner@example.com', 'new@example.com', 'ok@example.com', 'wait@example.com', 'no@example.com', 'bye@example.com'], 'Owner@Example.com', {
        recipients: { 'ok@example.com': { status: 'confirmed' }, 'wait@example.com': { status: 'pending' }, 'no@example.com': { status: 'declined' }, 'bye@example.com': { status: 'unsubscribed' } },
    });
    assert.deepEqual(c, { eligible: ['owner@example.com', 'ok@example.com'], ask: ['new@example.com'], waiting: ['wait@example.com'], blocked: ['no@example.com', 'bye@example.com'] });
});

test('an outside recipient gets one confirmation email and NO report until they say yes', async () => {
    const { deps, transport, store } = setup([row('d1', config({ recipients: ['owner@example.com', 'friend@example.com'] }))]);
    const a = await runDueSchedules(deps);
    const kinds = transport.sent.map((m) => `${m.kind}:${m.to}`).sort();
    assert.deepEqual(kinds, ['confirm:friend@example.com', 'report:owner@example.com']);
    assert.equal(state(store, 'd1').recipients!['friend@example.com'].status, 'pending');
    assert.equal(a.confirmationsSent, 1);
    // next day: still pending, no second confirmation, no report to the friend
    const b = await runDueSchedules({ ...deps, now: Date.parse('2026-10-29T09:03:00Z') });
    assert.equal(b.confirmationsSent, 0);
    assert.deepEqual(transport.sent.filter((m) => m.to === 'friend@example.com').map((m) => m.kind), ['confirm']);
});

test('confirmation links: yes starts reports, no and unsubscribe stop them for good, a later no wins over an old yes', async () => {
    const { deps, transport, store } = setup([row('d1', config({ recipients: ['owner@example.com', 'friend@example.com'] }))]);
    await runDueSchedules(deps);
    const confirmMail = transport.sent.find((m) => m.kind === 'confirm')!;
    const link = (kind: string) => {
        const m = new RegExp(`href="[^"]*respond\\?t=([^"&]+)"[^>]*>${kind}`).exec(confirmMail.html);
        return decodeURIComponent(m![1]);
    };
    const yes = link('Yes, send me the report');
    const no = link('No');
    assert.equal(verifyToken(yes, NOW, SECRET)?.k, 'confirm');
    assert.equal((await applyLink(store, yes, NOW + 1000, SECRET)).ok, true);
    assert.equal(state(store, 'd1').recipients!['friend@example.com'].status, 'confirmed');
    // the friend now gets the next report, with their own unsubscribe link and one-click headers
    transport.sent.length = 0;
    await runDueSchedules({ ...deps, now: Date.parse('2026-10-29T09:03:00Z') });
    const report = transport.sent.find((m) => m.to === 'friend@example.com')!;
    assert.equal(report.kind, 'report');
    assert.match(report.headers!['List-Unsubscribe'], /^<https:\/\/app\.example\.test\/api\/email-schedule\/respond\?t=/);
    assert.equal(report.headers!['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    const unsub = decodeURIComponent(/Unsubscribe: .*respond\?t=(\S+)/.exec(report.text)![1]);
    assert.deepEqual(verifyToken(unsub, NOW, SECRET), { k: 'unsub', d: 'd1', e: 'friend@example.com' });
    // unsubscribe is honoured at once and forever
    assert.equal((await applyLink(store, unsub, NOW, SECRET)).ok, true);
    transport.sent.length = 0;
    await runDueSchedules({ ...deps, now: Date.parse('2026-10-30T09:03:00Z') });
    assert.equal(transport.sent.filter((m) => m.to === 'friend@example.com').length, 0);
    // an old "yes" link cannot re-subscribe, and "no" after "unsubscribe" keeps them blocked
    const again = await applyLink(store, yes, NOW, SECRET);
    assert.ok(again.ok && !again.changed);
    assert.equal(state(store, 'd1').recipients!['friend@example.com'].status, 'unsubscribed');
    await applyLink(store, no, NOW, SECRET);
    assert.equal(state(store, 'd1').recipients!['friend@example.com'].status, 'declined');
});

test('a declined or unsubscribed address is never asked again or mailed', async () => {
    const rows = [row('d1', config({ recipients: ['owner@example.com', 'no@example.com'] }), {}, { recipients: { 'no@example.com': { status: 'declined' } } })];
    const { deps, transport } = setup(rows);
    const r = await runDueSchedules(deps);
    assert.deepEqual(transport.sent.map((m) => m.to), ['owner@example.com']);
    assert.ok(r.items[0].skipped.some((s) => s.startsWith('no@example.com')));
});

test('a "No" on one dashboard stops every dashboard of that owner from asking the same address again', async () => {
    const a = row('d1', config({ recipients: ['owner@example.com', 'stranger@example.com'] }), {}, { recipients: { 'stranger@example.com': { status: 'declined' } } });
    const b = row('d2', config({ recipients: ['owner@example.com', 'stranger@example.com'] }));
    const other = row('d3', config({ recipients: ['stranger@example.com'] }), { ownerUserId: 2, ownerIdentifier: 'gh-2', ownerEmail: 'someone@example.com' });
    const { deps, transport } = setup([a, b, other]);
    await runDueSchedules(deps);
    const toStranger = transport.sent.filter((m) => m.to === 'stranger@example.com');
    assert.deepEqual(toStranger.map((m) => `${m.dashboardId}:${m.kind}`), ['d3:confirm'], 'only another owner may still ask');
    const out = await confirmNewRecipients(deps, b, config({ recipients: ['stranger@example.com'] }));
    assert.equal(out['stranger@example.com'], 'blocked');
});

test('forged, expired or wrong-secret links do nothing', async () => {
    const { store, deps } = setup([row('d1', config({ recipients: ['owner@example.com', 'x@example.com'] }), {}, { recipients: { 'x@example.com': { status: 'pending' } } })]);
    const { linkToken } = await import('@/lib/builder/email/tokens');
    assert.equal((await applyLink(store, linkToken('confirm', 'd1', 'x@example.com', 0, 'other-secret'), NOW, SECRET)).ok, false);
    assert.equal((await applyLink(store, linkToken('confirm', 'd1', 'x@example.com', 0, SECRET), NOW + 15 * 86_400_000, SECRET)).ok, false, 'expired');
    assert.equal((await applyLink(store, 'garbage', NOW, SECRET)).ok, false);
    assert.equal(state(store, 'd1').recipients!['x@example.com'].status, 'pending');
    void deps;
});

test('confirming new recipients on save: one email each, owner skipped, capped per owner per day', async () => {
    const c = config({ recipients: ['owner@example.com', 'a@example.com', 'b@example.com', 'c@example.com'] });
    const { deps, transport } = setup([row('d1', c)], { confirmCap: 2 });
    const out = await confirmNewRecipients(deps, row('d1', c), c);
    assert.deepEqual(out, { 'a@example.com': 'sent', 'b@example.com': 'sent', 'c@example.com': 'capped' });
    assert.deepEqual(transport.sent.map((m) => m.to), ['a@example.com', 'b@example.com']);
    // saving again does not ask again
    const again = await confirmNewRecipients(deps, row('d1', c), c);
    assert.equal(again['a@example.com'], 'waiting');
    assert.equal(transport.sent.length, 2);
});

// ── test send ────────────────────────────────────────────────────────────

test('send a test now: owner only, whatever the recipients, counted in the cap, window untouched', async () => {
    const r = row('d1', config({ recipients: ['owner@example.com', 'friend@example.com'] }));
    const { deps, transport, store } = setup([r]);
    const out = await sendTestNow(deps, r, config({ recipients: ['owner@example.com', 'friend@example.com'] }));
    assert.ok(out.ok);
    assert.deepEqual(transport.sent.map((m) => `${m.kind}:${m.to}`), ['test:owner@example.com']);
    assert.match(transport.sent[0].subject, /^\[Test\] /);
    assert.equal(state(store, 'd1').claimed, undefined);
    assert.equal(state(store, 'd1').sent!['2026-10-28'], 1);
    const capped = await sendTestNow({ ...deps, dailyCap: 1 }, r, config());
    assert.ok(!capped.ok && capped.status === 429);
    const noMail = await sendTestNow(deps, row('d1', config(), { ownerEmail: null }), config());
    assert.ok(!noMail.ok && noMail.status === 409);
});

// ── the email itself ─────────────────────────────────────────────────────

function cannedResults(doc: DashboardDocV2): DashboardQueryResponse {
    const results: Record<string, WidgetResult> = {};
    const ok = (parts: Record<string, DataFrame>): WidgetResult => ({ status: 'ok', fetchedAt: '2026-10-28T08:00:00Z', cache: 'hit', parts, flags: {} });
    for (const [id, w] of Object.entries(doc.widgets)) {
        if (w.type === 'scorecard') {
            const m = w.config.metric.id;
            results[id] = ok({ total: { columns: [], rows: [{ [`m:${m}`]: 1234, [`m:${m}:prev`]: 1000 }] } });
        } else if (w.type === 'kpi-strip') {
            const row: Record<string, number> = {};
            for (const m of w.config.metrics) { row[`m:${m.id}`] = 5000; row[`m:${m.id}:prev`] = 4000; }
            results[id] = ok({ total: { columns: [], rows: [row] } });
        } else if (w.type === 'timeseries') {
            const m = w.config.series[0].metric.id;
            results[id] = ok({ series: { columns: [], rows: Array.from({ length: 14 }, (_, i) => ({ 'd:date': `2026-10-${String(15 + i).padStart(2, '0')}`, [`m:${m}`]: 100 + i * 7, [`m:${m}:prev`]: 90 + i * 3 })) } });
        } else if (w.type === 'bar') {
            const m = w.config.metrics[0].id;
            results[id] = ok({ rows: { columns: [], rows: ['US', 'GB', 'IN'].map((c, i) => ({ [`d:${w.config.dimension}`]: c, [`m:${m}`]: 300 - i * 90 })) } });
        }
    }
    return { results, resolved: { range: { start: '2026-10-21', end: '2026-10-27' }, timezone: 'UTC', today: '2026-10-28' }, meta: { durationMs: 1, google: { ga4Calls: 0, gscCalls: 0, ga4Reports: 0 }, cache: { hit: 0, stale: 0, miss: 0 } } };
}

test('the email: KPI tiles and signed chart pictures from widget results, view link public when shared else the app', () => {
    const doc = buildFromTemplate('site-overview', { name: 'Acme <b>report</b>', defaultSource: { type: 'site', siteId: 'acme.test' } });
    const page = doc.pages[0];
    const res = cannedResults(doc);
    const base = { doc, pages: [{ page, res }], config: config({ range: '7d' }), origin: ORIGIN, dashboardId: 'dash-1', siteLabel: 'acme.test', compareMode: 'previous_period' as const, secret: SECRET };
    const m = buildDigestModel({ ...base, shareToken: null });
    assert.ok(m.pages.length === 1 && m.pages[0].kpis.length > 0, 'has KPI tiles');
    assert.equal(m.rangeLabel.startsWith('Last 7 days'), true);
    assert.equal(m.viewKind, 'app');
    assert.equal(m.viewUrl, `${ORIGIN}/dashboard/dashboards/dash-1`);
    const shared = buildDigestModel({ ...base, shareToken: 'a'.repeat(32) });
    assert.equal(shared.viewUrl, `${ORIGIN}/view/${'a'.repeat(32)}`);
    assert.equal(shared.viewKind, 'public');
    const tile = m.pages[0].kpis[0];
    assert.ok(tile.value && tile.delta && tile.delta.dir === 'up');
    // charts are signed URLs that decode to a clean spec
    for (const c of m.pages[0].charts) {
        const t = new URL(c.imageUrl).searchParams.get('t');
        const spec = specFromToken(t, SECRET);
        assert.ok(spec, c.title);
        assert.equal(specFromToken(t, 'other'), null);
        assert.ok(c.width === 560 && c.height > 100);
    }
    // the email escapes everything the owner typed and carries the unsubscribe link
    const html = renderReportHtml(m, { unsubscribeUrl: `${ORIGIN}/api/email-schedule/respond?t=abc&x=1` });
    assert.ok(!html.includes('<b>report</b>'));
    assert.ok(html.includes('Acme &lt;b&gt;report&lt;/b&gt;'));
    assert.ok(html.includes('View dashboard'));
    assert.ok(html.includes('Unsubscribe from these emails'));
    assert.ok(html.includes('&amp;x=1'));
    assert.ok(!/<script/i.test(html));
});

test('a message from the owner is shown as plain text; the confirmation email names the owner and has both links', () => {
    const m = { ...digest(), message: '<img src=x onerror=alert(1)>\nHello' };
    const html = renderReportHtml(m, { unsubscribeUrl: 'https://x.test/u' });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    const c = renderConfirmHtml({ dashboardName: 'Weekly', ownerEmail: 'boss@example.com', scheduleText: 'They would like to send it every Monday at 09:00 (UTC).', confirmUrl: 'https://x.test/y', declineUrl: 'https://x.test/n' });
    assert.ok(c.includes('boss@example.com') && c.includes('https://x.test/y') && c.includes('https://x.test/n'));
    assert.ok(c.includes('Nothing is sent to you until you say yes'));
});

test('chart specs are cleaned: bad colour, huge arrays, control characters, non-numbers', () => {
    const s = cleanSpec({ g: 'bar', t: 'x'.repeat(500) + '\n', c: 'red', v: Array.from({ length: 100 }, () => 'NaN'), l: ['a\u0000b'], f: [] });
    assert.ok(s);
    assert.equal(s!.c, '#1f5bd6');
    assert.equal(s!.t.length, 60);
    assert.ok(s!.v.length <= 8 && s!.v.every((n) => n === 0));
    assert.ok(!s!.t.includes('\n') && !s!.l[0].includes('\u0000'));
    assert.equal(cleanSpec({ g: 'pie', v: [1] }), null);
    assert.equal(cleanSpec({ g: 'line', v: [1] }), null);
});
