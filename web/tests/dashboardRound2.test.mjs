// Round 2 dashboards (WS3): 16 new templates, themes, brand kit, schema, public doc, clipboard,
// conditional formatting. The 8 shipped templates and default docs must not change.
// Run: cd web && node --test tests/dashboardRound2.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const { TEMPLATES, buildFromTemplate, defaultTheme } = await import('../src/lib/builder/templates.ts');
const { TEMPLATES_R2 } = await import('../src/lib/builder/templates.round2.ts');
const { validateDoc } = await import('../src/lib/builder/schema.ts');
const { publicDoc } = await import('../src/lib/builder/publicDoc.ts');
const themes = await import('../src/lib/builder/themes.ts');
const { deriveBrand, contrast, hexToOklch, oklchToHex } = await import('../src/lib/builder/brand.ts');
const clip = await import('../src/lib/builder/clipboard.ts');
const { cellStyle } = await import('../src/lib/builder/cfRules.ts');

const SITE = { type: 'site', siteId: 'acmeanalytics.example' };
const ORIGINAL_8 = ['site-overview', 'search-performance', 'traffic-acquisition', 'content-performance', 'portfolio', 'client-report', 'audience-geography', 'key-events-revenue'];

test('the 8 shipped templates keep their ids and order; 16 new ones are appended', () => {
    assert.deepEqual(TEMPLATES.slice(0, 8).map((t) => t.id), ORIGINAL_8);
    assert.equal(TEMPLATES.length, 24);
    assert.deepEqual(TEMPLATES.slice(8).map((t) => t.id), TEMPLATES_R2.map((t) => t.id));
    assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 24);
});

test('shipped templates build exactly the same documents as before round 2', () => {
    for (const id of ORIGINAL_8) {
        const doc = buildFromTemplate(id, { name: id, defaultSource: SITE });
        assert.deepEqual(Object.keys(doc).sort(), ['controls', 'defaultSource', 'meta', 'name', 'pages', 'schemaVersion', 'settings', 'theme', 'widgets']);
        assert.deepEqual(Object.keys(doc.theme).sort(), ['badge', 'header', 'mode'], `${id} theme`);
        assert.deepEqual(doc.settings, { widthMode: 'contained', autoRefreshSec: 0 }, `${id} settings`);
        assert.equal(themes.isDefaultLook(doc.theme), true);
        assert.equal(themes.dashThemeAttrs(doc.theme, 'light'), null);
    }
});

function overlaps(items) {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i]; const b = items[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return `${a.i} / ${b.i}`;
    }
    return null;
}

test('every new template validates, has no overlaps and applies its suggested theme', () => {
    for (const t of TEMPLATES_R2) {
        const doc = buildFromTemplate(t.id, { name: t.name, defaultSource: t.portfolio ? { type: 'portfolio', include: 'all' } : SITE });
        const v = validateDoc(doc);
        assert.equal(v.ok, true, `${t.id}: ${v.ok ? '' : v.error}`);
        for (const p of doc.pages) {
            assert.equal(overlaps(p.layouts.lg), null, `${t.id}/${p.id} overlap`);
            for (const l of p.layouts.lg) assert.ok(l.x + l.w <= 12, `${t.id}/${l.i} overflows`);
        }
        assert.equal(doc.meta.createdFrom, t.id);
        assert.equal(doc.theme.id, t.themeId, `${t.id} theme`);
        // validateDoc keeps the round-2 fields (zod strips unknown keys on plain objects)
        assert.deepEqual(v.value.theme, doc.theme, `${t.id} theme survives validation`);
        assert.deepEqual(v.value.settings, doc.settings, `${t.id} settings survive validation`);
    }
});

test('template extras: TV wallboard settings, client report cover, brand words from the host', () => {
    const tv = buildFromTemplate('tv-wallboard', { name: 'TV', defaultSource: SITE });
    assert.deepEqual(tv.settings, { widthMode: 'full', autoRefreshSec: 300, tv: { rotateSec: 30, hideControls: true } });
    assert.equal(tv.theme.id, 'midnight');
    const cr = buildFromTemplate('client-monthly-seo', { name: 'Client', defaultSource: SITE });
    assert.equal(cr.theme.cover?.enabled, true);
    assert.equal(cr.theme.cover?.title, 'SEO report: {{site}}');
    assert.equal(cr.theme.badge.show, false);
    const bn = buildFromTemplate('brand-vs-nonbrand', { name: 'B', defaultSource: SITE });
    assert.deepEqual(bn.widgets.w_kb.filters, [{ dimension: 'query', op: 'regex', value: '{{var:brand}}' }]);
});

test('themes: snapshot on pick, back to TrafficClaw restores a default document', () => {
    const base = defaultTheme('light');
    const exec = themes.applyThemePreset(base, 'executive');
    assert.equal(exec.id, 'executive');
    assert.equal(exec.font, 'serif-headings');
    assert.equal(exec.density, 'airy');
    assert.equal(themes.isDefaultLook(exec), false);
    assert.equal(themes.dashThemeAttrs(exec, 'dark')['data-theme'], 'dark');
    const back = themes.applyThemePreset(exec, 'trafficclaw');
    assert.deepEqual(back, base);
    assert.equal(themes.isDefaultLook(back), true);
    const paper = themes.applyThemePreset(base, 'paper');
    assert.equal(themes.dashThemeAttrs(paper, 'dark')['data-theme'], 'light', 'paper is light only');
    assert.deepEqual(themes.densityPx(undefined), { row: 32, gap: 16 });
    assert.deepEqual(themes.densityPx('compact'), { row: 28, gap: 12 });
    assert.equal(themes.isDefaultLook({ ...base, brand: { color: '#ff0000' } }), false);
});

test('deriveBrand: readable tokens for awkward colours in light and dark', () => {
    const colours = ['#1e40af', '#f97316', '#0d9488', '#e11d48', '#facc15', '#39ff14', '#111111', '#808080', '#157459', '#7c3aed'];
    for (const hex of colours) {
        for (const [mode, surface] of [['light', '#ffffff'], ['dark', '#15171c']]) {
            const t = deriveBrand(hex, mode, surface);
            const at = `${hex} ${mode}`;
            assert.ok(contrast(t['--tc-brand-fg'], t['--tc-brand']) >= 4.5, `${at} brand-fg on brand`);
            assert.ok(contrast(t['--tc-brand'], surface) >= 3, `${at} brand on surface`);
            assert.ok(contrast(t['--tc-brand-text'], surface) >= 4.5, `${at} brand-text`);
            assert.ok(contrast(t['--tc-focus'], surface) >= 3, `${at} focus`);
            assert.ok(contrast(t['--tc-brand-soft-fg'], t['--tc-brand-soft']) >= 4.5, `${at} soft-fg on soft`);
        }
    }
    const back = oklchToHex(hexToOklch('#3b4cca'));
    assert.equal(back, '#3b4cca');
});

test('schema keeps theme, brand, cover and TV settings; rejects unsafe values', () => {
    const doc = buildFromTemplate('site-overview', { name: 'x', defaultSource: SITE });
    const themed = {
        ...doc,
        theme: { ...themes.applyThemePreset(doc.theme, 'studio'), brand: { color: '#ff6600', preparedFor: 'Acme', preparedBy: 'Agency', footer: 'Hi', logoDarkUrl: 'https://cdn.example/logo.svg' }, cover: { enabled: true, layout: 'split', title: '{{site}}', imageUrl: 'https://cdn.example/x.jpg', showKpis: true } },
        settings: { ...doc.settings, tv: { rotateSec: 60, hideControls: false } },
    };
    const v = validateDoc(themed);
    assert.equal(v.ok, true, v.ok ? '' : v.error);
    assert.deepEqual(v.value.theme, themed.theme);
    assert.deepEqual(v.value.settings, themed.settings);
    assert.equal(validateDoc({ ...themed, theme: { ...themed.theme, brand: { color: 'red' } } }).ok, false);
    assert.equal(validateDoc({ ...themed, theme: { ...themed.theme, brand: { color: '#ff0000;background:url(x)' } } }).ok, false);
    assert.equal(validateDoc({ ...themed, theme: { ...themed.theme, id: 'hacker' } }).ok, false);
    assert.equal(validateDoc({ ...themed, theme: { ...themed.theme, cover: { enabled: true, layout: 'left', imageUrl: 'http://x.example/a.png' } } }).ok, false);
    assert.equal(validateDoc({ ...themed, settings: { ...themed.settings, tv: { rotateSec: 7, hideControls: true } } }).ok, false);
});

test('public doc carries the theme, brand kit, cover and TV settings', () => {
    const doc = buildFromTemplate('tv-wallboard', { name: 'TV', defaultSource: SITE });
    const pub = publicDoc(doc, () => 'acmeanalytics.example');
    assert.equal(pub.theme.id, 'midnight');
    assert.deepEqual(pub.settings.tv, { rotateSec: 30, hideControls: true });
    const plain = publicDoc(buildFromTemplate('site-overview', { name: 'x', defaultSource: SITE }), () => 'x');
    assert.deepEqual(Object.keys(plain.settings).sort(), ['autoRefreshSec', 'widthMode'], 'default docs: same public settings as before');
});

test('clipboard: copy and paste widgets and pages with new ids, under existing widgets', () => {
    const doc = buildFromTemplate('site-overview', { name: 'x', defaultSource: SITE });
    const text = clip.copyWidgets(doc, 'p_main', ['w_search', 'w_traffic']);
    const c = clip.parseClip(text);
    assert.equal(c.tc, clip.CLIP_WIDGETS);
    assert.equal(c.items.length, 2);
    const target = buildFromTemplate('blank', { name: 'b', defaultSource: SITE });
    const r = clip.pasteWidgets(target, 'p_main', c);
    assert.equal(r.ids.length, 2);
    assert.equal(validateDoc(r.doc).ok, true);
    assert.ok(r.ids.every((id) => !doc.widgets[id]));
    const again = clip.pasteWidgets(r.doc, 'p_main', c);
    const lg = again.doc.pages[0].layouts.lg;
    assert.equal(overlaps(lg), null);
    assert.equal(lg.length, 4);
    const page = clip.parseClip(clip.copyPage(doc, 'p_main'));
    const p = clip.pastePage(target, page);
    assert.equal(p.doc.pages.length, 2);
    assert.equal(p.doc.pages[1].title, 'Overview');
    assert.equal(validateDoc(p.doc).ok, true);
    assert.equal(clip.parseClip('{"tc":"trafficclaw/widgets","v":1,"items":[{"widget":{"type":"evil"}}]}'), null);
    assert.equal(clip.parseClip('hello'), null);
});

test('conditional formatting: value and change rules, first match wins', () => {
    const col = { id: 'm:gsc:ctr', kind: 'metric', ref: 'gsc:ctr', visual: 'none' };
    const rules = [{ column: 'm:gsc:ctr', op: 'lt', value: 0.01, style: 'bad' }, { column: 'm:gsc:ctr', op: 'gte', value: 0.05, style: 'good' }, { column: 'm:gsc:ctr', op: 'lt', value: -0.2, style: 'warn', on: 'change' }];
    assert.equal(cellStyle(rules, col, { 'm:gsc:ctr': 0.005 }), 'bad');
    assert.equal(cellStyle(rules, col, { 'm:gsc:ctr': 0.08 }), 'good');
    assert.equal(cellStyle(rules, col, { 'm:gsc:ctr': 0.03, 'm:gsc:ctr:prev': 0.045 }), 'warn');
    assert.equal(cellStyle(rules, col, { 'm:gsc:ctr': 0.03, 'm:gsc:ctr:prev': 0.031 }), null);
    assert.equal(cellStyle(undefined, col, { 'm:gsc:ctr': 0.001 }), null);
});

test('theme CSS: text pairs pass 4.5:1 in every preset (7:1 in High contrast)', () => {
    const css = fs.readFileSync(new URL('../src/components/dashboard-builder/theme/dashboard-themes.css', import.meta.url), 'utf8');
    const blocks = [...css.matchAll(/\[data-dash-theme="(\w+)"\](\[data-theme(?:="(\w+)")?\])?\s*\{([^}]*)\}/g)];
    let checked = 0;
    for (const [, id, , mode, body] of blocks) {
        const v = Object.fromEntries([...body.matchAll(/--tc-([a-z-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map((m) => [m[1], m[2].length === 4 ? `#${m[2][1]}${m[2][1]}${m[2][2]}${m[2][2]}${m[2][3]}${m[2][3]}` : m[2]]));
        if (!v.surface || !v.fg) continue;
        const min = id === 'contrast' ? 7 : 4.5;
        for (const k of ['fg', 'fg-secondary', 'fg-muted', 'brand-text']) {
            if (v[k]) assert.ok(contrast(v[k], v.surface) >= min, `${id} ${mode ?? ''} ${k} on surface: ${contrast(v[k], v.surface).toFixed(2)}`);
        }
        if (v['fg-muted'] && v.canvas) assert.ok(contrast(v['fg-muted'], v.canvas) >= min, `${id} ${mode ?? ''} fg-muted on canvas`);
        if (v.brand && v['brand-fg']) assert.ok(contrast(v['brand-fg'], v.brand) >= 4.5, `${id} ${mode ?? ''} brand-fg on brand`);
        checked++;
    }
    assert.ok(checked >= 13, `checked ${checked} theme blocks`);
});

const vars = await import('../src/lib/builder/variables.ts');
const inter = await import('../src/lib/builder/interaction.ts');
const { compileWidget } = await import('../src/lib/builder/compile.ts');
const { publicControlsFromQuery } = await import('../src/lib/builder/publicDoc.ts');

test('variables: defaults, viewer values, invalid values fall back, filters filled before compile', () => {
    const doc = buildFromTemplate('brand-vs-nonbrand', { name: 'b', defaultSource: SITE });
    const v = doc.controls.find((c) => c.type === 'variable');
    assert.ok(v, 'brand template defines a brand variable');
    assert.equal(v.default, 'acmeanalytics');
    assert.deepEqual(vars.variableValues(doc.controls, { filters: {} }), { brand: 'acmeanalytics' });
    assert.deepEqual(vars.variableValues(doc.controls, { filters: { brand: ['acme|acme analytics'] } }), { brand: 'acme|acme analytics' });
    assert.deepEqual(vars.variableValues(doc.controls, { filters: { brand: ['(unclosed'] } }), { brand: 'acmeanalytics' });
    const ctl = { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: { brand: ['acme'] } };
    const q = compileWidget(doc.widgets.w_kb, { controlDefs: doc.controls, controls: ctl });
    assert.deepEqual(q.queries[0].filters, [{ dimension: 'query', op: 'regex', value: 'acme' }]);
    const qn = compileWidget(doc.widgets.w_kn, { controlDefs: doc.controls, controls: { ...ctl, filters: {} } });
    assert.deepEqual(qn.queries[0].filters, [{ dimension: 'query', op: 'not_regex', value: 'acmeanalytics' }]);
    assert.equal(vars.fillVariables('Brand: {{var:brand}} {{var:nope}}', { brand: 'acme' }), 'Brand: acme {{var:nope}}');
    assert.equal(validateDoc(doc).ok, true);
    // public viewers: only when the share allows filters and the control allows it
    const share = { viewerControls: { date: true, compare: true, filters: true } };
    assert.deepEqual(publicControlsFromQuery(new URLSearchParams('f.brand=acme'), doc, share).filters.brand, ['acme']);
    assert.equal(publicControlsFromQuery(new URLSearchParams('f.brand=acme'), doc, { viewerControls: { ...share.viewerControls, filters: false } }).filters.brand, undefined);
});

test('click to filter: URL round trip, toggling, allowed dimensions, the clicked widget keeps all values', () => {
    const doc = buildFromTemplate('site-overview', { name: 'x', defaultSource: SITE });
    doc.widgets.w_devices = { ...doc.widgets.w_devices, interactions: { clickToFilter: true } };
    const allowed = inter.clickableDims(doc);
    assert.deepEqual([...allowed], ['device']);
    assert.deepEqual(inter.interactionFromParam('device:mobile|country:DE', allowed), [{ dimension: 'device', op: 'eq', value: 'mobile' }]);
    assert.deepEqual(inter.toggleInteraction([{ dimension: 'device', op: 'eq', value: 'mobile' }], 'device', 'mobile'), []);
    const ctl = { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, filters: {}, interaction: [{ dimension: 'device', op: 'eq', value: 'mobile' }] };
    const own = compileWidget(doc.widgets.w_devices, { controlDefs: doc.controls, controls: ctl });
    assert.deepEqual(own.queries[0].filters, [], 'the clicked widget is not filtered by itself');
    const other = compileWidget(doc.widgets.w_search, { controlDefs: doc.controls, controls: ctl });
    assert.deepEqual(other.queries[0].filters, [{ dimension: 'device', op: 'eq', value: 'mobile' }]);
    const share = { viewerControls: { date: true, compare: true, filters: true } };
    assert.deepEqual(publicControlsFromQuery(new URLSearchParams('x=device:mobile'), doc, share).interaction, [{ dimension: 'device', op: 'eq', value: 'mobile' }]);
    assert.equal(publicControlsFromQuery(new URLSearchParams('x=page:%2Fsecret'), doc, share).interaction, undefined);
});
