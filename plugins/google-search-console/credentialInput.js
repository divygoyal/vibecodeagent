'use strict';

const MAX_CREDENTIAL_PAYLOAD_BYTES = 16 * 1024;

function optionalCredential(value) {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

async function readGoogleCredentialsFromStdin(
    stream = process.stdin,
    enabled = process.env.TRAFFICCLAW_PLUGIN_CREDENTIALS_STDIN === '1',
) {
    if (!enabled) return {};

    stream.setEncoding('utf8');
    let raw = '';
    for await (const chunk of stream) {
        raw += chunk;
        if (Buffer.byteLength(raw, 'utf8') > MAX_CREDENTIAL_PAYLOAD_BYTES) {
            throw new Error('Google credential payload is too large');
        }
    }

    if (!raw.trim()) return {};

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        throw new Error('Google credential payload is invalid');
    }

    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('Google credential payload is invalid');
    }

    return {
        access_token: optionalCredential(payload.access_token),
        refresh_token: optionalCredential(payload.refresh_token),
    };
}

module.exports = { readGoogleCredentialsFromStdin };
