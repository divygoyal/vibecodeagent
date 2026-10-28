// Round 7 audit #12: builder autosave must not conflict with itself. A fake server that answers 412 when If-Match is
// not the current revision (like /api/dashboards/[id] PUT), with slow PUTs, and edits that arrive mid-save.
// Run: cd web && node --test tests/
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutosave } from '../src/components/dashboard-builder/editor/autosave.ts';

function setup({ putMs = 30 } = {}) {
    const server = { rev: 1, doc: { v: 0 }, puts: [] };
    const st = { id: 'd1', doc: { v: 0 }, rev: 1, savedDoc: { v: 0 }, status: 'saved' };
    st.savedDoc = st.doc;
    const events = [];
    const save = createAutosave({
        get: () => st,
        put: async (id, doc, rev) => {
            server.puts.push({ doc, rev });
            await new Promise((r) => setTimeout(r, putMs));
            if (rev !== server.rev) { const e = new Error('conflict'); e.status = 412; throw e; }
            server.rev += 1;
            server.doc = doc;
            return server.rev;
        },
        latestRev: async () => server.rev,
        setSaving: () => { st.status = 'saving'; },
        markSaved: (rev, doc) => { st.rev = rev; st.savedDoc = doc; st.status = st.doc === doc ? 'saved' : 'dirty'; },
        conflict: () => { st.status = 'conflict'; events.push('conflict'); },
        failed: (e) => { st.status = 'error'; events.push(`error:${e.message}`); },
    });
    const edit = (v) => { st.doc = { v }; st.status = 'dirty'; };
    return { server, st, save, edit, events };
}

test('back-to-back edits during a slow save: no 412, the last doc is saved with the latest rev', async () => {
    const { server, st, save, edit, events } = setup();
    edit(1);
    const first = save();
    edit(2);
    const second = save(); // the autosave timer fired while the first PUT is in flight
    edit(3);
    const third = save();
    await Promise.all([first, second, third]);
    assert.deepEqual(events, []);
    assert.equal(st.status, 'saved');
    assert.deepEqual(server.doc, { v: 3 });
    // One PUT at a time, each with the revision the previous one returned; queued saves fold into one.
    assert.deepEqual(server.puts.map((p) => p.rev), [1, 2]);
    assert.deepEqual(server.puts.map((p) => p.doc.v), [1, 3]);
    assert.equal(st.rev, 3);
});

test('a queued save with nothing new does not PUT again', async () => {
    const { server, st, save, edit } = setup();
    edit(1);
    const a = save();
    const b = save();
    await Promise.all([a, b]);
    assert.equal(server.puts.length, 1);
    assert.equal(st.status, 'saved');
});

test('a real change elsewhere still shows the conflict, and Overwrite (force) uses the server rev', async () => {
    const { server, st, save, edit, events } = setup();
    server.rev = 5; // another tab saved
    edit(1);
    await save();
    assert.deepEqual(events, ['conflict']);
    assert.equal(st.status, 'conflict');
    await save(true);
    assert.equal(st.status, 'saved');
    assert.deepEqual(server.doc, { v: 1 });
    assert.equal(server.puts.at(-1).rev, 5);
});

test('a failed PUT reports once and the next edit saves normally', async () => {
    const { st, save, edit, events } = setup();
    let fail = true;
    const save2 = createAutosave({
        get: () => st,
        put: async (id, doc, rev) => { if (fail) throw new Error('offline'); return rev + 1; },
        latestRev: async () => st.rev,
        setSaving: () => { st.status = 'saving'; },
        markSaved: (rev, doc) => { st.rev = rev; st.savedDoc = doc; st.status = st.doc === doc ? 'saved' : 'dirty'; },
        conflict: () => events.push('conflict'),
        failed: (e) => { st.status = 'error'; events.push(`error:${e.message}`); },
    });
    edit(1);
    await Promise.all([save2(), save2()]);
    assert.deepEqual(events, ['error:offline']);
    fail = false;
    edit(2);
    await save2();
    assert.equal(st.status, 'saved');
    void save;
});
