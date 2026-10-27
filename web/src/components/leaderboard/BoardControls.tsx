'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Tabs } from '@/components/ui/Tabs';
import { CATEGORY_LABELS, RANGES, TABS } from '@/lib/leaderboard/constants';
import type { BoardTab, RangeKey } from '@/lib/leaderboard/types';
import { cn } from '@/lib/cn';

interface Props {
    tab: BoardTab;
    range: RangeKey;
    category: string;
    q: string;
    categories: Array<{ name: string; count: number }>;
    /** Wraps the results so they dim while the next page loads. */
    children: React.ReactNode;
}

/** Tabs, range, search and category. Everything lives in the URL; the server renders each state. */
export function BoardControls({ tab, range, category, q, categories, children }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [pending, startTransition] = useTransition();
    const [search, setSearch] = useState(q);
    const first = useRef(true);

    const hrefFor = (patch: Record<string, string | null>) => {
        const next = new URLSearchParams(params.toString());
        for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
        }
        if (!('page' in patch)) next.delete('page');
        const qs = next.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    };
    const go = (patch: Record<string, string | null>) => startTransition(() => router.replace(hrefFor(patch), { scroll: false }));

    useEffect(() => {
        if (first.current) { first.current = false; return; }
        const t = window.setTimeout(() => go({ q: search.trim() || null }), 300);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <div>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <Tabs
                    ariaLabel="Leaderboard views"
                    value={tab}
                    variant="underline"
                    className="-mb-px md:flex-1 md:border-b-0"
                    items={TABS.map((t) => ({ value: t.value, label: t.label, href: hrefFor({ tab: t.value === 'top' ? null : t.value }) }))}
                />
                <SegmentedControl
                    ariaLabel="Date range"
                    value={range}
                    onChange={(v) => go({ range: v === '28d' ? null : v })}
                    options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
                />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput value={search} onValueChange={setSearch} placeholder="Search sites" className="sm:w-64" />
                <Select
                    ariaLabel="Category"
                    value={category || 'all'}
                    onValueChange={(v) => go({ category: v === 'all' ? null : v })}
                    options={[
                        { value: 'all', label: 'All categories' },
                        ...categories.map((c) => ({ value: c.name, label: `${CATEGORY_LABELS[c.name] ?? c.name} (${c.count})`, textValue: c.name })),
                    ]}
                    className="sm:w-52"
                />
            </div>
            <div className={cn('mt-4 transition-opacity duration-120', pending && 'opacity-60')} aria-busy={pending}>
                {children}
            </div>
        </div>
    );
}
