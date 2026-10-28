/**
 * /share/<token> with a wrong or revoked token answers 404 with the not-available card (round 7, like /view and
 * /embed/d); a share service outage is not "gone" (the page says it could not load).
 *
 * Run: cd web && npx --offline tsx --test tests/builder/shareNotFound.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const app = path.resolve(import.meta.dirname, '../../src/app/share/[token]');

test('lookupShare: unknown token is gone; 5xx and network errors are not; a share comes back', async () => {
    process.env.ADMIN_API_KEY = 'test-key';
    process.env.ADMIN_API_URL = 'http://admin.invalid';
    const realFetch = globalThis.fetch;
    let next: () => Promise<Response> = async () => new Response('{}', { status: 404 });
    globalThis.fetch = (async () => next()) as typeof fetch;
    try {
        const { lookupShare, getShareData } = await import('@/app/api/share/route');
        assert.deepEqual(await lookupShare('nope', { incrementView: false }), { share: null, gone: true });
        next = async () => new Response('{}', { status: 410 });
        assert.equal((await lookupShare('revoked')).gone, true);
        next = async () => new Response('oops', { status: 502 });
        assert.deepEqual(await lookupShare('t'), { share: null, gone: false });
        next = async () => { throw new Error('ECONNREFUSED'); };
        assert.deepEqual(await lookupShare('t'), { share: null, gone: false });
        next = async () => Response.json({ token: 'ok', userId: 'u', propertyId: 'p', siteUrl: 'https://a.example', config: null, views: 3, createdAt: '2026-10-01' });
        const found = await lookupShare('ok');
        assert.equal(found.gone, false);
        assert.equal(found.share?.siteUrl, 'https://a.example');
        assert.equal((await getShareData('ok'))?.views, 3);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('pages call notFound() when gone; both segments have a server not-found with the share card', () => {
    for (const dir of ['', 'events']) {
        const page = fs.readFileSync(path.join(app, dir, 'page.tsx'), 'utf8');
        assert.match(page, /if \(gone\) notFound\(\);/, `${dir || 'share'} page`);
        const nf = fs.readFileSync(path.join(app, dir, 'not-found.tsx'), 'utf8');
        assert.match(nf, /<ShareNotFound /);
        assert.doesNotMatch(nf, /'use client'/);
    }
    // The 500 bug: ShareNotFound is a server component, so it must not call a client module's function.
    const chrome = fs.readFileSync(path.resolve(app, '../../../components/share/ShareChrome.tsx'), 'utf8');
    assert.doesNotMatch(chrome, /'use client'/);
    assert.match(chrome, /from '@\/components\/ui\/buttonStyles'/);
    assert.doesNotMatch(chrome, /from '@\/components\/ui\/Button'/);
});
