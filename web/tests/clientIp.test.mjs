// Client address for rate limits (src/lib/clientIp.ts): CF-Connecting-IP only from a Cloudflare peer.
// Run: cd web && node --test tests/clientIp.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const { clientAddress, clientKey, isCloudflareIp, peerAddress, addressKey } = await import('../src/lib/clientIp.ts');
const H = (o) => new Headers(o);

test('via Cloudflare: the peer (X-Real-Ip / last X-Forwarded-For) is an edge, so CF-Connecting-IP is the visitor', () => {
    assert.equal(clientAddress(H({ 'x-real-ip': '172.68.10.20', 'cf-connecting-ip': '203.0.113.7' })), '203.0.113.7');
    assert.equal(clientAddress(H({ 'x-forwarded-for': '198.51.100.9, 104.23.1.1', 'cf-connecting-ip': '203.0.113.7' })), '203.0.113.7');
    assert.equal(clientAddress(H({ 'x-real-ip': '2606:4700:10::ac43:1', 'cf-connecting-ip': '2001:db8:aa:bb::1' })), '2001:db8:aa:bb::1');
    assert.equal(clientKey(H({ 'x-real-ip': '2a06:98c1::1', 'cf-connecting-ip': '2001:db8:aa:bb:1:2:3:4' })), '2001:db8:aa:bb::/64');
});

test('direct to the origin with a forged CF-Connecting-IP: the peer counts, the header is ignored', () => {
    assert.equal(clientAddress(H({ 'x-real-ip': '198.51.100.23', 'cf-connecting-ip': '1.1.1.1' })), '198.51.100.23');
    // a forged first X-Forwarded-For entry does not matter either: our proxy's hop is the last one
    assert.equal(clientAddress(H({ 'x-forwarded-for': '162.158.0.1, 198.51.100.23', 'cf-connecting-ip': '1.1.1.1' })), '198.51.100.23');
    assert.equal(clientKey(H({ 'x-real-ip': '2001:db8:1:2::99', 'cf-connecting-ip': '10.0.0.1' })), '2001:db8:1:2::/64');
});

test('missing or junk headers', () => {
    assert.equal(clientAddress(H({})), 'unknown');
    assert.equal(clientAddress(H({ 'cf-connecting-ip': '1.2.3.4' })), 'unknown', 'no peer: the CF header alone is not trusted');
    assert.equal(clientAddress(H({ 'x-real-ip': '162.158.0.1', 'cf-connecting-ip': 'not-an-ip' })), '162.158.0.1');
    assert.equal(peerAddress(H({ 'x-forwarded-for': ' , ' })), '');
    assert.equal(addressKey('::ffff:192.0.2.1'), '192.0.2.1');
});

test('Cloudflare ranges (v4 and v6) and near misses', () => {
    for (const ip of ['173.245.48.1', '103.21.247.255', '104.16.0.1', '104.27.255.255', '172.64.0.1', '172.71.255.255', '131.0.72.5', '2400:cb00::1', '2a06:98c0::1', '2a06:98c7:ffff::1', '2c0f:f248::1']) {
        assert.equal(isCloudflareIp(ip), true, ip);
    }
    for (const ip of ['173.245.64.1', '104.28.0.1', '172.72.0.1', '8.8.8.8', '2a06:98c8::1', '2001:db8::1', '', 'junk']) {
        assert.equal(isCloudflareIp(ip), false, ip);
    }
});

test('no rate limiter reads proxy headers itself', () => {
    const offenders = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith(path.join('lib', 'clientIp.ts'))) {
                if (/['"](cf-connecting-ip|x-forwarded-for|x-real-ip)['"]/i.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
            }
        }
    };
    walk(new URL('../src', import.meta.url).pathname);
    assert.deepEqual(offenders, [], 'use lib/clientIp.ts');
});
