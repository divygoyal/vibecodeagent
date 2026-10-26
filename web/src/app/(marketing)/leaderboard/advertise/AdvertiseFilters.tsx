'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select } from '@/components/ui/Select';
import { BILLING_PERIODS } from '@/lib/adSlots';
import { CATEGORY_LABELS } from '@/lib/leaderboard/constants';
import { cn } from '@/lib/cn';

const SORTS = [
    { value: 'traffic', label: 'Most traffic' },
    { value: 'price_asc', label: 'Price: low to high' },
    { value: 'price_desc', label: 'Price: high to low' },
    { value: 'newest', label: 'Newest' },
];

export function AdvertiseFilters({ categories, children }: { categories: string[]; children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [pending, startTransition] = useTransition();
    const set = (key: string, value: string, empty: string) => {
        const next = new URLSearchParams(params.toString());
        if (value === empty) next.delete(key); else next.set(key, value);
        const qs = next.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    };
    return (
        <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                    ariaLabel="Category"
                    value={params.get('category') || 'all'}
                    onValueChange={(v) => set('category', v, 'all')}
                    options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))]}
                    className="sm:w-48"
                />
                <Select
                    ariaLabel="Billing period"
                    value={params.get('period') || 'all'}
                    onValueChange={(v) => set('period', v, 'all')}
                    options={[{ value: 'all', label: 'Any billing' }, ...BILLING_PERIODS.map((p) => ({ value: p.value, label: p.label }))]}
                    className="sm:w-48"
                />
                <Select
                    ariaLabel="Sort"
                    label="Sort:"
                    value={params.get('sort') || 'traffic'}
                    onValueChange={(v) => set('sort', v, 'traffic')}
                    options={SORTS}
                    className="sm:w-56"
                />
            </div>
            <div className={cn('mt-4 transition-opacity duration-120', pending && 'opacity-60')} aria-busy={pending}>{children}</div>
        </div>
    );
}
