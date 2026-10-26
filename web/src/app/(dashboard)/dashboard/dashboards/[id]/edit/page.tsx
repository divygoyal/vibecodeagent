'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

import { Banner, Button, EmptyState } from '@/components/ui';
import { Editor } from '@/components/dashboard-builder/editor/Editor';
import { fetchJson } from '@/components/dashboard-builder/useWidgetData';
import type { DashboardRecord } from '@/lib/builder/types';

/** Dashboard editor: desktop only (1024 px and up); smaller screens get the view route. */
export default function DashboardEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [wide, setWide] = useState<boolean | null>(null);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const f = () => setWide(mq.matches);
        f();
        mq.addEventListener('change', f);
        return () => mq.removeEventListener('change', f);
    }, []);
    const { data, error } = useSWR<{ dashboard: DashboardRecord }>(`/api/dashboards/${id}`, (u: string) => fetchJson(u), { revalidateOnFocus: false, revalidateIfStale: false });

    if (wide === false) {
        return (
            <div className="space-y-4">
                <Banner variant="neutral" title="Editing works on larger screens">Open this dashboard on a computer to change it. You can still view and share it here.</Banner>
                <Button asChild variant="secondary"><Link href={`/dashboard/dashboards/${id}`}>View dashboard</Link></Button>
            </div>
        );
    }
    if (error) return <EmptyState variant="page" title="Dashboard not found" actions={<Button asChild variant="secondary"><Link href="/dashboard/dashboards">All dashboards</Link></Button>} />;
    if (!data || wide === null) return null;
    return <Editor initial={data.dashboard} />;
}
