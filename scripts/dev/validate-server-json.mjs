#!/usr/bin/env node
/**
 * Validate the official MCP Registry manifest (repo root server.json) against
 * the JSON Schema named in its "$schema" field, plus the registry's own extra
 * rules (namespace shape, description length, https URLs).
 *
 * No new dependency: uses ajv from web/node_modules (pulled in by eslint).
 *   node scripts/dev/validate-server-json.mjs [server.json] [--offline schema.json]
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const require = createRequire(resolve(here, '../../web/package.json'));
const Ajv = require('ajv');

const args = process.argv.slice(2);
const offlineAt = args.indexOf('--offline');
const offline = offlineAt >= 0 ? args.splice(offlineAt, 2)[1] : null;
const file = resolve(args[0] || resolve(here, '../../server.json'));
const doc = JSON.parse(readFileSync(file, 'utf8'));

const schemaUrl = doc.$schema;
if (!schemaUrl) throw new Error('server.json has no $schema');
const schema = offline ? JSON.parse(readFileSync(offline, 'utf8')) : await (async () => {
    const res = await fetch(schemaUrl);
    if (!res.ok) throw new Error(`could not fetch ${schemaUrl}: HTTP ${res.status}`);
    return res.json();
})();

const ajv = new Ajv({ allErrors: true, schemaId: 'auto', extendRefs: true });
const validate = ajv.compile(schema);
const problems = [];
if (!validate(doc)) for (const e of validate.errors) problems.push(`${e.dataPath || '/'} ${e.message}`);

// Extra rules the official registry applies on publish (official-registry-requirements.md).
if (!/^[a-z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(doc.name || '')) problems.push('name must look like com.example/server');
if ((doc.description || '').length > 100) problems.push('description is longer than 100 characters');
for (const r of doc.remotes || []) if (!/^https:\/\//.test(r.url)) problems.push(`remote ${r.url} must be https`);
if (!(doc.remotes || []).length && !(doc.packages || []).length) problems.push('needs remotes or packages');
for (const i of doc.icons || []) if (!/^https:\/\//.test(i.src)) problems.push(`icon ${i.src} must be https`);

if (problems.length) {
    console.error(`INVALID ${file}\n- ${problems.join('\n- ')}`);
    process.exit(1);
}
console.log(`OK ${file}\n  schema ${schemaUrl}\n  name ${doc.name}, version ${doc.version}, remotes ${(doc.remotes || []).map((r) => `${r.type} ${r.url}`).join(', ')}`);
