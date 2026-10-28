/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 9: saved views: (de)serialisation, validation, the default view, copied links, and what share links receive.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/savedViews-r9.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resetSources } from '@/lib/builder/docOps';
import { validateDoc } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicDoc } from '@/lib/builder/publicDoc';
import {
    cleanViewQuery, defaultViewOf, effectiveParams, hasViewState, MAX_VIEWS, publicDefaultQuery, removeView, saveView, savedViewProblem, setDefaultView, stateQuery, viewIsCurrent, viewLink,
} from '@/lib/builder/savedViews';
import type { DashboardDocV2, DateControl } from '@/lib/builder/types';

const withDate = (d: DashboardDocV2, patch: Partial<DateControl>): DashboardDocV2 => ({ ...d, controls: d.controls.map((c) => (c.type === 'date' ? { ...c, ...patch } : c)) });

// ── saved views ──────────────────────────────────────────────────────────

const doc = (): DashboardDocV2 => buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: 'acmeanalytics.example', ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' } });

test('saved views: only state keys are kept, in a stable order, within limits', () => {
    assert.equal(cleanViewQuery('?range=7d&tv=1&embed=1&theme=dark&compare=yoy&f.country=US&widgets=evil&preview=1'), 'compare=yoy&f.country=US&range=7d');
    assert.equal(cleanViewQuery('range=7d&page=p_main'), 'range=7d', 'the page tab is not part of a view');
    assert.equal(cleanViewQuery('tv=1'), null);
    assert.equal(cleanViewQuery(''), null);
    assert.equal(cleanViewQuery(`f.x=${'a'.repeat(2100)}`), null);
    assert.equal(stateQuery('b=1&range=7d&f.a=1'), 'f.a=1&range=7d');
    assert.equal(hasViewState(new URLSearchParams('page=p2&tv=1')), false);
    assert.equal(hasViewState(new URLSearchParams('page=p2&f.country=US')), true);
});

test('saved views: save, replace by name, limit, delete, default', () => {
    let d = doc();
    const first = saveView(d, '  Mobile   last 90d ', 'range=90d&f.f_device=mobile&tv=1');
    assert.ok(first.ok);
    if (!first.ok) return;
    d = first.doc;
    assert.equal(first.view.name, 'Mobile last 90d');
    assert.equal(first.view.query, 'f.f_device=mobile&range=90d');
    // Same name (any case) replaces the view and keeps its id.
    const again = saveView(d, 'mobile LAST 90d', 'range=28d&compare=yoy');
    assert.ok(again.ok);
    if (!again.ok) return;
    assert.equal(again.view.id, first.view.id);
    assert.equal(again.doc.views?.length, 1);
    d = again.doc;
    // Bad input.
    assert.deepEqual(saveView(d, '   ', 'range=7d'), { ok: false, error: 'Give the view a name.' });
    assert.equal(saveView(d, 'x'.repeat(61), 'range=7d').ok, false);
    assert.equal(saveView(d, 'Empty', 'tv=1').ok, false, 'nothing to save');
    // Limit.
    let full = d;
    for (let i = 0; i < MAX_VIEWS - 1; i++) {
        const r = saveView(full, `View ${i}`, `range=7d&f.n=${i}`);
        assert.ok(r.ok);
        if (r.ok) full = r.doc;
    }
    assert.equal(full.views?.length, MAX_VIEWS);
    assert.equal(saveView(full, 'One more', 'range=7d').ok, false);
    assert.equal(saveView(full, 'View 3', 'range=14d').ok, true, 'replacing still works at the limit');
    // Default.
    d = setDefaultView(d, first.view.id);
    assert.equal(d.defaultViewId, first.view.id);
    assert.equal(defaultViewOf(d)?.name, 'mobile LAST 90d', 'a replace takes the new spelling');
    assert.equal(setDefaultView(d, 'v_unknown').defaultViewId, undefined, 'an unknown id clears it');
    assert.equal(setDefaultView(d, null).defaultViewId, undefined);
    // Deleting the default view clears the default.
    const gone = removeView(d, first.view.id);
    assert.equal(gone.views, undefined);
    assert.equal(gone.defaultViewId, undefined);
    // The current URL equals the view regardless of the page tab and key order.
    assert.equal(viewIsCurrent(again.view, new URLSearchParams('compare=yoy&page=p_other&range=28d')), true);
    assert.equal(viewIsCurrent(again.view, new URLSearchParams('range=28d')), false);
});

test('saved views: they survive validateDoc (save route) and bad ones are refused', () => {
    let d = doc();
    const r = saveView(d, 'Q3', 'range=3m&compare=prevw&d.w_x=a%7Cb');
    assert.ok(r.ok);
    if (!r.ok) return;
    d = setDefaultView(r.doc, r.view.id);
    const v = validateDoc(JSON.parse(JSON.stringify(d)));
    assert.ok(v.ok, v.ok ? '' : v.error);
    if (v.ok) {
        assert.deepEqual(v.value.views, d.views);
        assert.equal(v.value.defaultViewId, r.view.id);
    }
    const bad = (fn: (x: DashboardDocV2) => DashboardDocV2) => validateDoc(fn(JSON.parse(JSON.stringify(d))));
    assert.equal(bad((x) => ({ ...x, views: [...x.views!, { ...x.views![0] }] })).ok, false, 'duplicate id');
    assert.equal(bad((x) => ({ ...x, views: [...x.views!, { id: 'v_other', name: 'q3', query: 'range=7d' }] })).ok, false, 'duplicate name');
    assert.equal(bad((x) => ({ ...x, defaultViewId: 'v_missing' })).ok, false, 'unknown default');
    assert.equal(bad((x) => ({ ...x, views: [{ id: 'v_a', name: 'A', query: 'tv=1&embed=1' }] })).ok, false, 'not view state');
    assert.equal(bad((x) => ({ ...x, views: [{ id: 'v_a', name: 'A', query: 'range=7d&page=p1' }] })).ok, false, 'page is not stored');
    assert.equal(bad((x) => ({ ...x, views: [{ id: 'bad id!', name: 'A', query: 'range=7d' }] })).ok, false, 'id shape');
    assert.equal(bad((x) => ({ ...x, views: Array.from({ length: MAX_VIEWS + 1 }, (_, i) => ({ id: `v_${i}`, name: `V${i}`, query: `range=7d&f.n=${i}` })) })).ok, false, 'too many');
    assert.equal(savedViewProblem({ views: [{ id: 'v_a', name: 'A', query: 'range=7d' }], defaultViewId: 'v_a' }), null);
});

test('saved views: the default view applies when the URL carries no state', () => {
    const q = 'compare=yoy&f.country=US&range=7d';
    // No state: the default stands in; a page tab alone does not count as state.
    assert.equal(effectiveParams(new URLSearchParams(''), q).get('range'), '7d');
    const withPage = effectiveParams(new URLSearchParams('page=p2'), q);
    assert.equal(withPage.get('range'), '7d');
    assert.equal(withPage.get('page'), 'p2');
    // Any state in the URL wins whole (the viewer's own link is exact).
    assert.equal(effectiveParams(new URLSearchParams('range=28d'), q).get('f.country'), null);
    // "Cleared" marker: the viewer removed everything, the default stays away.
    assert.equal(effectiveParams(new URLSearchParams('dv=0'), q).get('range'), null);
    // No default: the URL itself.
    const sp = new URLSearchParams('tv=1');
    assert.equal(effectiveParams(sp, undefined), sp);
});

test('saved views: copied links carry state keys only', () => {
    const sp = new URLSearchParams('tv=1&embed=1&theme=dark&preview=1&page=p2&range=7d&f.country=US&compare=prevw');
    assert.equal(viewLink('https://trafficclaw.com', '/view/abc', sp), 'https://trafficclaw.com/view/abc?compare=prevw&f.country=US&page=p2&range=7d');
    assert.equal(viewLink('https://trafficclaw.com', '/view/abc', new URLSearchParams('tv=1')), 'https://trafficclaw.com/view/abc');
});


test('public link: the owner\'s saved views never reach viewers; the default view arrives only as far as the share allows', () => {
    let d = doc();
    const r = saveView(d, 'Client view', 'range=7d&compare=yoy&f.f_country=US&s.s1=acmeanalytics.example&d.w_x=secret%7Cvalue&m.m1=gsc%3Aclicks&x=country%3AUS');
    assert.ok(r.ok);
    if (!r.ok) return;
    d = setDefaultView(r.doc, r.view.id);
    const labelOf = () => 'Acme';
    const share = (date: boolean, compare: boolean, filters: boolean) => ({ viewerControls: { date, compare, filters } });

    const all = publicDoc(d, labelOf, share(true, true, true));
    const json = JSON.stringify(all);
    assert.equal((all as any).views, undefined);
    assert.equal((all as any).defaultViewId, undefined);
    assert.ok(!json.includes('Client view'), 'view names stay with the owner');
    assert.ok(!json.includes('acmeanalytics'), 'no site id');
    assert.ok(!json.includes('secret'), 'no drilled values');
    assert.equal(all.defaultViewQuery, 'compare=yoy&f.f_country=US&m.m1=gsc%3Aclicks&range=7d&x=country%3AUS');

    // Locked dates drop dates and comparison; locked filters drop f.* and x.
    assert.equal(publicDoc(d, labelOf, share(false, true, true)).defaultViewQuery, 'f.f_country=US&m.m1=gsc%3Aclicks&x=country%3AUS');
    assert.equal(publicDoc(d, labelOf, share(true, false, false)).defaultViewQuery, 'm.m1=gsc%3Aclicks&range=7d');
    assert.equal(publicDoc(d, labelOf, share(false, false, false)).defaultViewQuery, 'm.m1=gsc%3Aclicks');
    // No default view: nothing. Without share info (older callers): nothing.
    assert.equal(publicDoc({ ...d, defaultViewId: undefined }, labelOf, share(true, true, true)).defaultViewQuery, undefined);
    assert.equal(publicDoc(d, labelOf).defaultViewQuery, undefined);
    assert.equal(publicDefaultQuery(withDate(d, { viewerCanChange: false }), share(true, true, true)), 'f.f_country=US&m.m1=gsc%3Aclicks&x=country%3AUS');
});

test('copies start without the owner\'s views (they hold site ids and drilled values)', () => {
    let d = doc();
    const r = saveView(d, 'Mine', 'range=7d&s.s1=acmeanalytics.example');
    assert.ok(r.ok);
    if (!r.ok) return;
    d = setDefaultView(r.doc, r.view.id);
    const copy = resetSources(d, { type: 'portfolio', include: 'all' });
    assert.equal(copy.views, undefined);
    assert.equal(copy.defaultViewId, undefined);
    assert.ok(validateDoc(JSON.parse(JSON.stringify(copy))).ok);
});

