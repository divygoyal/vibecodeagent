/**
 * Round 9 polish: the donut's legend puts "Other" last whatever its size, and its centre rounds like every KPI.
 * Run: cd web && npx --offline tsx --test tests/builder/donut-r9.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Donut, type DonutItem } from '@/components/charts/Donut';

const legend = (html: string): string[] => [...html.matchAll(/<li[^>]*>.*?<span class="min-w-0 flex-1 truncate text-fg-secondary">([^<]*)<\/span>/g)].map((m) => m[1]);
const render = (items: DonutItem[], extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Donut, { items, size: 160, ...extra }));

test('donut: a query "(other)" row that is bigger than other slices still comes last', () => {
    const html = render([
        { key: 'a', label: 'Organic Search', value: 31616 },
        { key: '(other)-1', label: 'Other', value: 12000, other: true },
        { key: 'b', label: 'Direct', value: 8000 },
        { key: 'c', label: 'Referral', value: 2000 },
    ]);
    assert.deepEqual(legend(html), ['Organic Search', 'Direct', 'Referral', 'Other']);
});

test('donut: rows folded past the slice limit join the query "(other)" row in one last Other', () => {
    const items: DonutItem[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: `k${n}`, label: `Row ${n}`, value: 100 - n }));
    items.push({ key: 'o', label: 'Other', value: 50, other: true });
    const html = render(items, { maxSlices: 4 });
    assert.deepEqual(legend(html), ['Row 1', 'Row 2', 'Row 3', 'Other']);
    assert.ok(html.includes('>1.9K<') === false);
    // Other = rows 4..7 (96+95+94+93) + 50 = 428 at 4 slices
    assert.ok(html.includes('428'));
});

test('donut: without an "(other)" row nothing changes (sorted by size, fold at the limit)', () => {
    const html = render([{ key: 'a', label: 'A', value: 10 }, { key: 'b', label: 'B', value: 30 }, { key: 'c', label: 'C', value: 20 }]);
    assert.deepEqual(legend(html), ['B', 'C', 'A']);
});

test('donut: the centre rounds like a KPI tile (75,550 reads 75.6K) and its title gives the exact sum', () => {
    const html = render([{ key: 'a', label: 'A', value: 50000 }, { key: 'b', label: 'B', value: 25550 }], { centerLabel: 'Sessions' });
    assert.ok(html.includes('>75.6K<'));
    assert.ok(html.includes('title="75,550 sessions: the sum of the slices"'));
});
