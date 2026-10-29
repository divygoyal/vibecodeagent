#!/usr/bin/env node
/**
 * Builds web/public/geo/admin1/<ISO2>.json: one small file per country with its first-level regions (states,
 * provinces) for the dashboard builder's region map.
 *
 * Source: Natural Earth "ne_10m_admin_1_states_provinces" (PUBLIC DOMAIN, naturalearthdata.com), GeoJSON from
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
 *
 * Usage: node scripts/geo/build-admin1.mjs <ne_10m_admin_1_states_provinces.geojson> [outDir] [budgetBytes]
 *
 * No dependency: this file has its own Douglas-Peucker simplifier. Neighbouring regions share their border, so the
 * borders are cut into chains between the points where the neighbour changes, every chain is simplified once
 * (always in the same direction) and both neighbours get the identical line: no gaps and no overlaps.
 *
 * A few countries are published by Google Analytics at a coarser level than Natural Earth's admin-1 (Great Britain:
 * England/Scotland/Wales/Northern Ireland; France, Spain, Italy: regions). Their units are merged here
 * (shared edges cancel out), with the English names Google uses as aliases.
 *
 * Output (v1): { v, country, q, units: [{ n: name, a?: [aliases], p: [polygon: [ring: delta-coded ints]] }] }
 *   ring = [x0, y0, dx1, dy1, ...] in 1/q degrees, not closed (the reader closes it). Exterior rings run clockwise
 *   and holes counter-clockwise (the winding d3-geo expects, lon/lat plane).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const [, , src, outDir = 'web/public/geo/admin1', budgetArg] = process.argv;
if (!src) {
    console.error('usage: build-admin1.mjs <geojson> [outDir] [budgetBytes]');
    process.exit(1);
}
const BUDGET = Number(budgetArg) || 140_000;

// ── Merge rules ──────────────────────────────────────────────────────────

const EN = {
    // Spain (Natural Earth names the autonomous communities in Spanish)
    'Cataluña': ['Catalonia'], 'Andalucía': ['Andalusia'], 'País Vasco': ['Basque Country'], 'Aragón': ['Aragon'],
    'Valenciana': ['Valencian Community', 'Valencia'], 'Murcia': ['Region of Murcia'], 'Foral de Navarra': ['Navarre', 'Navarra'],
    'Madrid': ['Community of Madrid', 'Comunidad de Madrid'], 'Castilla y León': ['Castile and Leon'], 'Castilla-La Mancha': ['Castile-La Mancha'],
    'Baleares': ['Balearic Islands', 'Illes Balears'], 'Canarias': ['Canary Islands'], 'Asturias': ['Asturias', 'Principality of Asturias'],
    'La Rioja': ['La Rioja'], 'Cantabria': ['Cantabria'], 'Extremadura': ['Extremadura'], 'Galicia': ['Galicia'],
    // Italy
    'Piemonte': ['Piedmont'], 'Lombardia': ['Lombardy'], 'Toscana': ['Tuscany'], 'Sardegna': ['Sardinia'], "Valle d'Aosta": ['Aosta Valley'],
    'Trentino-Alto Adige': ['Trentino-South Tyrol', 'Trentino-Alto Adige/Sudtirol'], 'Apulia': ['Apulia', 'Puglia'], 'Sicily': ['Sicily', 'Sicilia'],
    // France
    'Bretagne': ['Brittany'], 'Normandie': ['Normandy'], 'Corse': ['Corsica'], 'Bourgogne-Franche-Comté': ['Burgundy-Franche-Comte', 'Burgundy-Franche-Comté'],
    "Provence-Alpes-Côte-d'Azur": ["Provence-Alpes-Cote d'Azur", "Provence-Alpes-Côte d'Azur"], 'Île-de-France': ['Ile-de-France'],
    'Réunion': ['Reunion'], 'Guyane française': ['French Guiana'],
};

const MERGE = {
    GB: (p) => p.geonunit,
    FR: (p) => p.region,
    ES: (p) => p.region,
    IT: (p) => p.region,
};

// ── Geometry helpers ─────────────────────────────────────────────────────

const PREC = 1e5;
const pk = (pt) => `${Math.round(pt[0] * PREC)},${Math.round(pt[1] * PREC)}`;

/** Planar signed area, lon/lat with y up: negative = clockwise. */
function area2(r) {
    let s = 0;
    for (let i = 0, n = r.length; i < n; i++) {
        const a = r[i], b = r[(i + 1) % n];
        s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
}

function open(ring) {
    const r = ring.slice();
    if (r.length > 1 && pk(r[0]) === pk(r[r.length - 1])) r.pop();
    return r;
}

function orient(ring, clockwise) {
    return (area2(ring) < 0) === clockwise ? ring : ring.slice().reverse();
}

function inRing(pt, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
}

/** Features -> rings of one unit. GeoJSON rings are exterior first; orient exterior clockwise, holes counter-clockwise. */
function featureRings(geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    const out = [];
    for (const poly of polys) {
        poly.forEach((ring, i) => {
            const r = open(ring);
            if (r.length >= 3) out.push(orient(r, i === 0));
        });
    }
    return out;
}

/** Merge several units' rings: an edge used in both directions inside the group is internal and disappears. */
function dissolve(ringSets) {
    const edges = new Map(); // "a>b" -> [a, b]
    for (const rings of ringSets) {
        for (const r of rings) {
            for (let i = 0; i < r.length; i++) {
                const a = r[i], b = r[(i + 1) % r.length];
                const ka = pk(a), kb = pk(b);
                if (ka === kb) continue;
                edges.set(`${ka}>${kb}`, [a, b]);
            }
        }
    }
    const live = new Map();
    for (const [k, e] of edges) {
        const [ka, kb] = k.split('>');
        if (edges.has(`${kb}>${ka}`)) continue;
        const list = live.get(ka) ?? [];
        list.push({ k, a: e[0], b: e[1], kb });
        live.set(ka, list);
    }
    const rings = [];
    for (const list of live.values()) {
        for (const start of list) {
            if (start.used) continue;
            const ring = [];
            let e = start;
            while (e && !e.used) {
                e.used = true;
                ring.push(e.a);
                const next = live.get(e.kb)?.find((x) => !x.used);
                e = next;
            }
            if (ring.length >= 3) rings.push(ring);
        }
    }
    return rings;
}

/** Rings -> polygons (exterior + holes). */
function toPolygons(rings) {
    const ext = [];
    const holes = [];
    for (const r of rings) (area2(r) < 0 ? ext : holes).push(r);
    const polys = ext.map((r) => ({ r, a: Math.abs(area2(r)), holes: [] }));
    for (const h of holes) {
        const host = polys.filter((p) => inRing(h[0], p.r)).sort((a, b) => a.a - b.a)[0];
        if (host) host.holes.push(h);
    }
    return polys;
}

function dp(points, eps) {
    const n = points.length;
    if (n < 3) return points.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    const e2 = eps * eps;
    while (stack.length) {
        const [s, e] = stack.pop();
        const [ax, ay] = points[s], [bx, by] = points[e];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let best = -1, bi = -1;
        for (let i = s + 1; i < e; i++) {
            const [px, py] = points[i];
            let d;
            if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
            else {
                const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
            }
            if (d > best) { best = d; bi = i; }
        }
        if (best > e2) {
            keep[bi] = 1;
            stack.push([s, bi], [bi, e]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

// ── Simplify one country, topology aware ─────────────────────────────────

/** units: [{ name, aliases, polys: [{ r, holes }] }] -> same with every ring simplified by eps. */
function simplifyCountry(units, eps) {
    // Which units touch each vertex.
    const touch = new Map();
    units.forEach((u, ui) => {
        for (const poly of u.polys) for (const r of [poly.r, ...poly.holes]) for (const pt of r) {
            const k = pk(pt);
            let s = touch.get(k);
            if (!s) touch.set(k, (s = new Set()));
            s.add(ui);
        }
    });
    const label = (a, b) => {
        const sa = touch.get(pk(a)), sb = touch.get(pk(b));
        const out = [];
        for (const x of sa) if (sb.has(x)) out.push(x);
        return out.sort((x, y) => x - y).join(',');
    };
    const cache = new Map();
    const chainKey = (c) => `${pk(c[0])}|${pk(c[c.length - 1])}|${c.length}|${pk(c[c.length >> 1])}`;
    const simplifyChain = (c) => {
        const fwd = pk(c[0]) <= pk(c[c.length - 1]);
        const canon = fwd ? c : c.slice().reverse();
        const key = chainKey(canon);
        let res = cache.get(key);
        if (!res) cache.set(key, (res = dp(canon, eps)));
        return fwd ? res : res.slice().reverse();
    };
    const simplifyRing = (ring) => {
        const n = ring.length;
        const labels = ring.map((_, i) => label(ring[i], ring[(i + 1) % n]));
        const nodes = [];
        for (let i = 0; i < n; i++) if (labels[i] !== labels[(i - 1 + n) % n]) nodes.push(i);
        if (nodes.length === 0) {
            // A ring that is one border all around: cut it at its first vertex and its farthest one.
            let far = 0, fd = -1;
            for (let i = 1; i < n; i++) {
                const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
                if (d > fd) { fd = d; far = i; }
            }
            nodes.push(0, far);
        } else if (nodes.length === 1) nodes.push((nodes[0] + (n >> 1)) % n);
        nodes.sort((x, y) => x - y);
        const out = [];
        for (let k = 0; k < nodes.length; k++) {
            const s = nodes[k], e = nodes[(k + 1) % nodes.length];
            const chain = [];
            for (let i = s; ; i = (i + 1) % n) {
                chain.push(ring[i]);
                if (i === e && chain.length > 1) break;
            }
            const simp = simplifyChain(chain);
            for (let i = 0; i < simp.length - 1; i++) out.push(simp[i]);
        }
        return out;
    };
    const minArea = (eps * 3) ** 2;
    return units.map((u) => {
        const polys = [];
        let biggest = null;
        for (const poly of u.polys) {
            const r = simplifyRing(poly.r);
            // A ring that collapsed to a sliver can flip its winding; d3 would then fill the whole globe. Drop it.
            if (r.length < 3 || area2(r) >= 0) continue;
            const a = Math.abs(area2(r));
            const holes = poly.holes.map(simplifyRing).filter((h) => h.length >= 3 && area2(h) > minArea);
            const p = { r, a, holes };
            if (!biggest || a > biggest.a) biggest = p;
            if (a >= minArea) polys.push(p);
        }
        if (!polys.length && biggest) polys.push(biggest);
        return { ...u, polys };
    });
}

function encodeRing(ring, q) {
    const out = [];
    let px = 0, py = 0;
    let last = null;
    for (const pt of ring) {
        const x = Math.round(pt[0] * q), y = Math.round(pt[1] * q);
        if (last && last[0] === x && last[1] === y) continue;
        out.push(x - px, y - py);
        px = x; py = y;
        last = [x, y];
    }
    return out;
}

function encode(country, units, q) {
    return {
        v: 1,
        country,
        q,
        units: units.map((u) => ({
            n: u.name,
            ...(u.aliases.length ? { a: u.aliases } : {}),
            p: u.polys.map((p) => [encodeRing(p.r, q), ...p.holes.map((h) => encodeRing(h, q))]),
        })).filter((u) => u.p.length),
    };
}

// ── Main ─────────────────────────────────────────────────────────────────

const gj = JSON.parse(readFileSync(src, 'utf8'));
const byCountry = new Map();
for (const f of gj.features) {
    const cc = f.properties.iso_a2;
    if (!cc || cc === '-99' || !f.geometry) continue;
    if (!byCountry.has(cc)) byCountry.set(cc, []);
    byCountry.get(cc).push(f);
}

const latin = (s) => typeof s === 'string' && s.length > 0 && s.length < 40 && /^[\p{Script=Latin}\p{P}\p{Z}\d]+$/u.test(s);

function unitsOf(cc, feats) {
    const merge = MERGE[cc];
    if (merge) {
        const groups = new Map();
        for (const f of feats) {
            const g = merge(f.properties);
            if (!g) continue;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(f);
        }
        return [...groups].map(([name, fs]) => {
            const rings = dissolve(fs.map((f) => featureRings(f.geometry)));
            return { name, aliases: EN[name] ?? [], polys: toPolygons(rings) };
        });
    }
    return feats.map((f) => {
        const p = f.properties;
        const aliases = new Set();
        for (const a of [p.name_en, p.woe_name, p.gn_name, p.abbrev, p.postal, ...(p.name_alt ? String(p.name_alt).split('|') : [])]) {
            if (latin(a) && a !== p.name) aliases.add(a.trim());
            if (aliases.size >= 6) break;
        }
        return { name: p.name || p.name_en || p.woe_name, aliases: [...aliases], polys: toPolygons(featureRings(f.geometry)) };
    }).filter((u) => u.name && u.polys.length);
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.json')) unlinkSync(join(outDir, f));

const report = [];
for (const [cc, feats] of [...byCountry].sort()) {
    const units = unitsOf(cc, feats);
    if (!units.length) continue;
    // Extent of the country decides where the tolerance search starts.
    let w = 180, e = -180, s = 90, n = -90;
    for (const u of units) for (const p of u.polys) for (const pt of p.r) { w = Math.min(w, pt[0]); e = Math.max(e, pt[0]); s = Math.min(s, pt[1]); n = Math.max(n, pt[1]); }
    const span = Math.max(e - w, n - s, 0.05);
    let lo = 0, hi = Math.max(span / 20, 0.01), best = null;
    // Smallest tolerance that fits the budget (about 12 halvings are enough).
    const attempt = (eps) => {
        const simp = simplifyCountry(units, eps);
        const q = eps < 0.002 ? 10000 : eps < 0.02 ? 1000 : 100;
        const doc = encode(cc, simp, q);
        return { eps, q, text: JSON.stringify(doc) };
    };
    // 0.004 degrees is about 400 m: under a pixel on any map this widget draws. Tiny countries get a finer start.
    let first = attempt(Math.min(0.004, Math.max(span / 800, 0.0002)));
    if (first.text.length <= BUDGET) best = first;
    else {
        lo = first.eps;
        for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            const a = attempt(mid);
            if (a.text.length <= BUDGET) { best = a; hi = mid; } else lo = mid;
            if (best && hi - lo < lo * 0.03) break;
        }
        best ??= attempt(hi);
    }
    writeFileSync(join(outDir, `${cc}.json`), best.text);
    report.push([cc, units.length, best.text.length, best.eps]);
}
report.sort((a, b) => b[2] - a[2]);
const total = report.reduce((t, r) => t + r[2], 0);
console.log(`countries ${report.length}, total ${(total / 1e6).toFixed(2)} MB`);
for (const r of report.slice(0, 15)) console.log(r[0], r[1], `${(r[2] / 1000).toFixed(0)} KB`, `eps ${r[3].toFixed(4)}`);
