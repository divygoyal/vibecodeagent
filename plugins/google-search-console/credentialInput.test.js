'use strict';

const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');

const { readGoogleCredentialsFromStdin } = require('./credentialInput');

test('loads Google credentials from the protected stdin channel', async () => {
    const config = await readGoogleCredentialsFromStdin(
        Readable.from([
            JSON.stringify({
                access_token: 'SENTINEL_ACCESS_TOKEN',
                refresh_token: 'SENTINEL_REFRESH_TOKEN',
            }),
        ]),
        true,
    );

    assert.deepEqual(config, {
        access_token: 'SENTINEL_ACCESS_TOKEN',
        refresh_token: 'SENTINEL_REFRESH_TOKEN',
    });
});

test('does not consume stdin unless the protected channel is enabled', async () => {
    const config = await readGoogleCredentialsFromStdin(
        Readable.from(['not-json']),
        false,
    );

    assert.deepEqual(config, {});
});

test('rejects malformed or oversized credential payloads without echoing them', async () => {
    await assert.rejects(
        readGoogleCredentialsFromStdin(Readable.from(['not-json']), true),
        /credential payload is invalid/,
    );
    await assert.rejects(
        readGoogleCredentialsFromStdin(Readable.from(['x'.repeat(17 * 1024)]), true),
        /credential payload is too large/,
    );
});
