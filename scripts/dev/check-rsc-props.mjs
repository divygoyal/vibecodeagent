#!/usr/bin/env node
/**
 * Static check of the Server Component -> Client Component boundary.
 *
 *   node scripts/dev/check-rsc-props.mjs [--web <dir>] [--json] [--verbose]
 *   (cd web && npm run check:rsc)
 *
 * React can only pass serializable values from a Server Component to a Client
 * Component (or to a host element such as <button>). A function prop
 * (`formatValue={(v) => ...}`, `icon={Search}`, `onClick={...}`, `fn.bind(x)`)
 * or a class instance crashes the page at render time with
 * "Functions cannot be passed directly to Client Components" — the
 * "Something went wrong" page in production.
 *
 * How it works (TypeScript compiler API, the project's own tsconfig):
 *  1. Server modules = app entry files (page, layout, template, not-found, loading,
 *     default) without 'use client', plus every non-client module they import,
 *     transitively. Imports are resolved per binding through barrels
 *     (`@/components/ui`), so a barrel does not drag in every module it re-exports.
 *  2. In each server module, every JSX element whose tag is a host element or a
 *     component defined in a 'use client' module (or a known client package such
 *     as next/link, radix-ui, framer-motion, sonner, recharts) is checked.
 *  3. Each attribute (and spread, and function-valued children) is classified by
 *     its type: callable -> error; class instance (URL, RegExp, Error, Intl.*,
 *     user classes) -> error; nested inside objects/arrays as well. References
 *     to client components (exports of 'use client' modules) are allowed, as
 *     React serializes those as client references. Date is reported as a note
 *     (it serializes). Map and Set serialize in React 19 Flight; reported as notes.
 *
 * Exit 1 when any error is found. Output: file:line:col, the element, the prop, why.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opts = { web: path.resolve(here, '../../web'), json: false, verbose: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--web') opts.web = path.resolve(argv[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else {
        console.error('usage: node scripts/dev/check-rsc-props.mjs [--web <dir>] [--json] [--verbose]');
        process.exit(2);
    }
}

const requireWeb = createRequire(path.join(opts.web, 'package.json'));
const ts = requireWeb('typescript');
const SRC = path.join(opts.web, 'src') + path.sep;

// ---------------------------------------------------------------- program
const configPath = path.join(opts.web, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, { noEmit: true, incremental: false, tsBuildInfoFile: undefined }, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
});
const rootNames = parsed.fileNames.filter((f) => path.resolve(f).startsWith(SRC));
const program = ts.createProgram({ rootNames, options: { ...parsed.options, noEmit: true, incremental: false } });
const checker = program.getTypeChecker();

// ---------------------------------------------------------------- helpers
const directiveCache = new Map();
/** 'client' | 'server' | null — the module's leading directive. */
function directive(sf) {
    if (directiveCache.has(sf.fileName)) return directiveCache.get(sf.fileName);
    let d = null;
    for (const st of sf.statements) {
        if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
        if (st.expression.text === 'use client') d = 'client';
        if (st.expression.text === 'use server') d = 'server';
    }
    directiveCache.set(sf.fileName, d);
    return d;
}
const isSrc = (f) => path.resolve(f).startsWith(SRC);
const rel = (f) => path.relative(path.dirname(opts.web), f);

/** Packages whose components are Client Components (their bundles start with 'use client'). */
const CLIENT_PACKAGES = [
    /^next\/(link|image|script|form)$/, /^next\/dist\/client\//,
    /^radix-ui$/, /^@radix-ui\//, /^framer-motion$/, /^motion(\/|$)/, /^sonner$/, /^recharts$/,
    /^@number-flow\//, /^nuqs(\/|$)/, /^react-grid-layout$/, /^@dnd-kit\//, /^@nivo\//, /^swr$/,
    /^@tanstack\/react-query$/, /^next-auth\/react$/, /^cobe$/,
];
const pkgClientCache = new Map();
function isClientPackage(spec) {
    if (pkgClientCache.has(spec)) return pkgClientCache.get(spec);
    let client = CLIENT_PACKAGES.some((re) => re.test(spec));
    if (!client) {
        try {
            const head = fs.readFileSync(requireWeb.resolve(spec), 'utf8').slice(0, 400);
            client = /^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/.test(head);
        } catch { /* unresolvable: treat as server-safe */ }
    }
    pkgClientCache.set(spec, client);
    return client;
}

/** The import declaration that brings `ident` into scope, if any. */
function importOf(symbol) {
    const d = symbol?.declarations?.[0];
    if (!d) return null;
    let n = d;
    while (n && !ts.isImportDeclaration(n)) n = n.parent;
    return n && ts.isStringLiteral(n.moduleSpecifier) ? n : null;
}

function resolveSpecifier(spec, fromFile) {
    const r = ts.resolveModuleName(spec, fromFile, parsed.options, ts.sys).resolvedModule;
    if (!r) return null;
    return { file: r.resolvedFileName, external: Boolean(r.isExternalLibraryImport) || r.resolvedFileName.includes(`${path.sep}node_modules${path.sep}`) };
}

/**
 * Where a symbol used in `fromFile` is really defined: { kind: 'client' | 'server' | 'package-client' | 'package' | 'local' | 'unknown', file }.
 * Follows import aliases and barrel re-exports.
 */
function originOf(symbol, fromFile) {
    if (!symbol) return { kind: 'unknown' };
    const imp = importOf(symbol);
    if (imp) {
        const spec = imp.moduleSpecifier.text;
        const res = resolveSpecifier(spec, fromFile);
        if (!res || res.external) return { kind: isClientPackage(spec) ? 'package-client' : 'package', spec };
    }
    let target = symbol;
    if (symbol.flags & ts.SymbolFlags.Alias) {
        try { target = checker.getAliasedSymbol(symbol); } catch { /* keep */ }
    }
    const decl = target?.declarations?.[0];
    if (!decl) return { kind: 'unknown' };
    const sf = decl.getSourceFile();
    if (!isSrc(sf.fileName)) return { kind: 'package', file: sf.fileName };
    // next/dynamic(() => import('./X')) declared in this module.
    if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isCallExpression(decl.initializer)) {
        const call = decl.initializer;
        if (ts.isIdentifier(call.expression) && call.expression.text === 'dynamic') {
            let spec = null;
            const visit = (n) => {
                if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) spec = n.arguments[0].text;
                else ts.forEachChild(n, visit);
            };
            visit(call.arguments[0] ?? call);
            const res = spec ? resolveSpecifier(spec, sf.fileName) : null;
            if (res && !res.external) {
                const dsf = program.getSourceFile(res.file);
                return { kind: dsf && directive(dsf) === 'client' ? 'client' : 'server', file: res.file };
            }
            return { kind: 'client', file: sf.fileName }; // dynamic() components are client components
        }
    }
    const d = directive(sf);
    if (sf.fileName === fromFile) return { kind: d === 'client' ? 'client' : 'local', file: sf.fileName };
    return { kind: d === 'client' ? 'client' : d === 'server' ? 'server-action' : 'server', file: sf.fileName };
}

// ---------------------------------------------------------------- reachability
const ENTRY = /^(page|layout|template|not-found|loading|default|forbidden|unauthorized)\.(tsx|ts|jsx|js)$/;
const appDir = path.join(SRC, 'app');
const reachable = new Map(); // file -> first importer (for the report)
const queue = [];
function add(file, via) {
    if (!file || reachable.has(file) || !isSrc(file)) return;
    const sf = program.getSourceFile(file);
    if (!sf || directive(sf) === 'client') return;
    reachable.set(file, via);
    queue.push(sf);
}
for (const sf of program.getSourceFiles()) {
    if (sf.fileName.startsWith(appDir + path.sep) && ENTRY.test(path.basename(sf.fileName))) add(sf.fileName, null);
}
while (queue.length) {
    const sf = queue.shift();
    const visitImports = (n) => {
        if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
            const clause = n.importClause;
            if (clause?.isTypeOnly) return;
            const res = resolveSpecifier(n.moduleSpecifier.text, sf.fileName);
            if (!res || res.external) return;
            if (!clause || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) {
                add(res.file, sf.fileName);
                return;
            }
            const names = [];
            if (clause.name) names.push(clause.name);
            if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                for (const el of clause.namedBindings.elements) if (!el.isTypeOnly) names.push(el.name);
            }
            for (const name of names) {
                const o = originOf(checker.getSymbolAtLocation(name), sf.fileName);
                if (o.kind === 'server' && o.file) add(o.file, sf.fileName);
            }
            return;
        }
        if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
            const res = resolveSpecifier(n.arguments[0].text, sf.fileName);
            if (res && !res.external) add(res.file, sf.fileName);
        }
        ts.forEachChild(n, visitImports);
    };
    visitImports(sf);
}

// ---------------------------------------------------------------- classification
const REACT_NODE_TYPES = new Set(['ReactElement', 'Element', 'ReactPortal', 'ReactNode', 'JSXElementConstructor']);
const ITERABLES = new Set(['Iterable', 'AsyncIterable', 'IterableIterator', 'ReadonlyArray']);
const BAD_BUILTINS = new Set(['RegExp', 'URL', 'URLSearchParams', 'Error', 'TypeError', 'RangeError', 'Headers', 'Request', 'Response', 'WeakMap', 'WeakSet', 'WeakRef',
    'NumberFormat', 'DateTimeFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'Segmenter', 'Buffer', 'AbortController', 'AbortSignal', 'Event', 'Node', 'HTMLElement', 'Window']);
const NOTE_BUILTINS = new Set(['Date', 'Map', 'Set', 'ReadonlyMap', 'ReadonlySet']);
const PRIMITIVE = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike
    | ts.TypeFlags.BooleanLike | ts.TypeFlags.EnumLike | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void | ts.TypeFlags.TypeParameter | ts.TypeFlags.ESSymbolLike;

/** First serialization problem inside `type`, or null. Returns { level: 'error'|'note', path, what }. */
function classify(type, node, pathStr = '', depth = 0, seen = new Set()) {
    if (!type || depth > 6) return null;
    if (type.flags & PRIMITIVE) return null;
    if (type.isUnion()) {
        let note = null;
        for (const t of type.types) {
            const r = classify(t, node, pathStr, depth, seen);
            if (r?.level === 'error') return r;
            note = note || r;
        }
        return note;
    }
    const id = type.id;
    if (seen.has(id)) return null;
    seen = new Set(seen).add(id);
    const sym = type.aliasSymbol && REACT_NODE_TYPES.has(type.aliasSymbol.name) ? type.aliasSymbol : type.getSymbol();
    const name = sym?.getName();
    if (name && REACT_NODE_TYPES.has(name)) return null;
    if (type.getCallSignatures().length || type.getConstructSignatures().length) return { level: 'error', path: pathStr, what: 'a function' };
    if (name && BAD_BUILTINS.has(name)) return { level: 'error', path: pathStr, what: `a ${name} instance (not serializable)` };
    if (name && ITERABLES.has(name)) {
        for (const arg of checker.getTypeArguments?.(type) ?? []) {
            const r = classify(arg, node, `${pathStr}[]`, depth + 1, seen);
            if (r) return r;
        }
        return null;
    }
    if (name === 'Promise') {
        const [arg] = checker.getTypeArguments?.(type) ?? [];
        return arg ? classify(arg, node, pathStr, depth + 1, seen) : null;
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
        for (const arg of checker.getTypeArguments(type)) {
            const r = classify(arg, node, `${pathStr}[]`, depth + 1, seen);
            if (r) return r;
        }
        return null;
    }
    if (name && NOTE_BUILTINS.has(name)) {
        if (name === 'Date') return { level: 'note', path: pathStr, what: 'a Date (serializes; arrives as a Date)' };
        const args = type.aliasTypeArguments ?? checker.getTypeArguments?.(type) ?? [];
        for (const arg of args) {
            const r = classify(arg, node, `${pathStr}<>`, depth + 1, seen);
            if (r?.level === 'error') return r;
        }
        return { level: 'note', path: pathStr, what: `a ${name} (serializes in React 19)` };
    }
    if (sym && sym.flags & ts.SymbolFlags.Class && !(type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Anonymous)) {
        return { level: 'error', path: pathStr, what: `an instance of class ${name}` };
    }
    if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return null;
    const literal = Boolean(type.objectFlags & ts.ObjectFlags.ObjectLiteral);
    for (const prop of checker.getPropertiesOfType(type)) {
        // Optional members of declared (non-literal) types are usually absent at runtime.
        if (!literal && prop.flags & ts.SymbolFlags.Optional) continue;
        if (prop.getName().startsWith('__@')) continue; // well-known symbols (Symbol.iterator …)
        const sub = `${pathStr}.${prop.getName()}`;
        if (prop.flags & ts.SymbolFlags.Method) return { level: 'error', path: sub, what: 'a function (method)' };
        const pt = checker.getTypeOfSymbolAtLocation(prop, node);
        const r = classify(pt, node, sub, depth + 1, seen);
        if (r?.level === 'error') return r;
    }
    for (const info of checker.getIndexInfosOfType(type)) {
        const r = classify(info.type, node, `${pathStr}[key]`, depth + 1, seen);
        if (r?.level === 'error') return r;
    }
    return null;
}

/** Is `expr` a reference to a client component / client export (serializable as a client reference)? */
function isClientReference(expr, fromFile) {
    let e = expr;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
    let id = e;
    if (ts.isPropertyAccessExpression(e)) {
        id = e.expression;
        while (ts.isPropertyAccessExpression(id)) id = id.expression;
    }
    if (!ts.isIdentifier(id)) return false;
    const o = originOf(checker.getSymbolAtLocation(id), fromFile);
    return o.kind === 'client' || o.kind === 'package-client' || o.kind === 'server-action';
}

function checkValue(expr, fromFile) {
    let typed = expr;
    while (ts.isParenthesizedExpression(typed)) typed = typed.expression;
    let e = typed;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e)) e = e.expression;
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return { level: 'error', path: '', what: 'an inline function' };
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'bind') {
        return isClientReference(e.expression.expression, fromFile) ? null : { level: 'error', path: '', what: 'a bound function (.bind)' };
    }
    if (isClientReference(e, fromFile)) return null;
    // A conditional / logical expression: check each branch separately (a client reference in one branch is fine).
    if (ts.isConditionalExpression(e)) return worst(checkValue(e.whenTrue, fromFile), checkValue(e.whenFalse, fromFile));
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
        return worst(checkValue(e.left, fromFile), checkValue(e.right, fromFile));
    }
    // An `as` assertion is the author's statement of the runtime type: use it.
    return classify(checker.getTypeAtLocation(typed), typed);
}
const worst = (a, b) => (a?.level === 'error' ? a : b?.level === 'error' ? b : a || b);

// ---------------------------------------------------------------- scan
const findings = [];
const tagsChecked = { host: 0, client: 0 };
for (const [file] of reachable) {
    const sf = program.getSourceFile(file);
    const visit = (n) => {
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) checkElement(sf, n);
        ts.forEachChild(n, visit);
    };
    visit(sf);
}

function tagLabel(tag) { return tag.getText(); }

function checkElement(sf, el) {
    const tag = el.tagName;
    let kind = null;
    if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) kind = 'host';
    else if (tag.kind === ts.SyntaxKind.JsxNamespacedName) kind = 'host';
    else {
        let id = tag;
        while (ts.isPropertyAccessExpression(id)) id = id.expression;
        if (ts.isIdentifier(id)) {
            const o = originOf(checker.getSymbolAtLocation(id), sf.fileName);
            if (o.kind === 'client' || o.kind === 'package-client') kind = 'client';
        }
    }
    if (!kind) return;
    tagsChecked[kind]++;
    const report = (node, prop, r) => {
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({
            level: r.level,
            file: rel(sf.fileName),
            line: line + 1,
            col: character + 1,
            element: tagLabel(tag),
            kind,
            prop: `${prop}${r.path || ''}`,
            what: r.what,
        });
    };
    for (const attr of el.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
            const name = attr.name.getText(sf);
            if (name === 'key' || name === 'ref') continue;
            const init = attr.initializer;
            if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
            const r = checkValue(init.expression, sf.fileName);
            if (r) report(attr, name, r);
        } else if (ts.isJsxSpreadAttribute(attr)) {
            const r = classify(checker.getTypeAtLocation(attr.expression), attr.expression, '');
            if (r) report(attr, `{...${attr.expression.getText(sf).slice(0, 40)}}`, r);
        }
    }
    // Function-as-children (render props) on the element.
    if (ts.isJsxOpeningElement(el)) {
        for (const child of el.parent.children) {
            if (ts.isJsxExpression(child) && child.expression) {
                const r = checkValue(child.expression, sf.fileName);
                if (r?.level === 'error') report(child, 'children', r);
            }
        }
    }
}

// ---------------------------------------------------------------- report
findings.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line, undefined, { numeric: true }));
const errors = findings.filter((f) => f.level === 'error');
const notes = findings.filter((f) => f.level === 'note');
if (opts.json) {
    console.log(JSON.stringify({ serverModules: reachable.size, checked: tagsChecked, errors, notes }, null, 2));
} else {
    for (const f of errors) console.log(`${f.file}:${f.line}:${f.col}  error  <${f.element}> ${f.prop} is ${f.what}${f.kind === 'host' ? ' (host element in a Server Component)' : ' (Client Component)'}`);
    if (opts.verbose || errors.length === 0) for (const f of notes) console.log(`${f.file}:${f.line}:${f.col}  note   <${f.element}> ${f.prop} is ${f.what}`);
    if (opts.verbose) for (const [f, via] of reachable) console.log(`server module ${rel(f)}${via ? `  (via ${rel(via)})` : ''}`);
    console.log(`check-rsc-props: ${reachable.size} server modules, ${tagsChecked.client} client-component and ${tagsChecked.host} host elements checked: ${errors.length} error(s), ${notes.length} note(s)`);
}
process.exit(errors.length ? 1 : 0);
