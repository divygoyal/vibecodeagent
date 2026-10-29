// What the site may say about verification: Search Console proves ownership, visitors come from Google Analytics.
// Run: cd web && node --test tests/leaderboardClaims.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const { VERIFICATION_CLAIM, VERIFICATION_SENTENCE, trafficBadgeTitle } = await import('../src/lib/leaderboard/claims.ts');

const read = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

test('the claim names both sources and never mixes them up', () => {
    assert.equal(VERIFICATION_CLAIM, 'Ownership verified in Google Search Console · visitors from Google Analytics');
    assert.match(VERIFICATION_SENTENCE, /verified in Google Search Console/);
    assert.match(VERIFICATION_SENTENCE, /visitor numbers come from Google Analytics/);
    assert.match(trafficBadgeTitle('12.3K', 'TrafficClaw'), /^Verified traffic: 12\.3K visitors in the last 28 days, from Google Analytics\./);
});

test('the leaderboard share card and the profile card say it', () => {
    assert.match(read('app/(marketing)/leaderboard/opengraph-image.tsx'), /VERIFICATION_CLAIM/);
    const profile = read('app/(marketing)/leaderboard/[id]/opengraph-image.tsx');
    assert.match(profile, /Owner verified in Search Console/);
    assert.match(profile, /visitors from Google Analytics/);
    assert.doesNotMatch(profile, /Verified owner \(Search Console\)/);
});

function* sources(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* sources(p);
        else if (/\.(tsx?|txt)$/.test(name)) yield p;
    }
}

// Search Console has no visitor numbers: no copy may call visitors confirmed, verified or checked through it.
const BANNED = [
    /confirmed (through|with|via|by) (Google )?(Analytics and )?Search Console/i,
    /visitors?[^.\n`]{0,60}(confirmed|verified|checked)[^.\n`]{0,30}Search Console/i,
    /visitor numbers,? confirmed/i,
    /verified visitors/i,
];

test('no source line says visitor numbers are confirmed through Search Console', () => {
    const root = new URL('../src', import.meta.url).pathname;
    const hits = [];
    for (const file of sources(root)) {
        if (file.endsWith('claims.ts')) continue;
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (BANNED.some((re) => re.test(line))) hits.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim().slice(0, 140)}`);
        });
    }
    assert.deepEqual(hits, []);
});
