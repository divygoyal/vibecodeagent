// Lets plain `node --test` import src/**/*.ts through the "@/" alias and extensionless
// relative imports (Node strips the types; this only fixes module resolution).
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const SRC = ${JSON.stringify(path_src())};
function tryResolve(base) {
  for (const cand of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (existsSync(cand) && !cand.endsWith(path.sep)) { try { if (!require_dir(cand)) return pathToFileURL(cand).href; } catch {} }
  }
  return null;
}
import { statSync } from 'node:fs';
function require_dir(p) { return statSync(p).isDirectory(); }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const url = tryResolve(path.join(SRC, specifier.slice(2)));
    if (url) return nextResolve(url, context);
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && context.parentURL.endsWith('.ts')) {
    const url = tryResolve(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (url) return nextResolve(url, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Packages without an exports map (next/headers, next-auth/core …) need the .js the bundler adds.
    if (err && err.code === 'ERR_MODULE_NOT_FOUND' && /^(next|next-auth)\\/[\\w/-]+$/.test(specifier)) return nextResolve(specifier + '.js', context);
    throw err;
  }
}
`));

function path_src() {
    return new URL('../src', import.meta.url).pathname;
}
