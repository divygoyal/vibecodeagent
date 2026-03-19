'use client';

import { useAnalyticsData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import { Loader2, ArrowUpRight } from 'lucide-react';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';

export default function PagesPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);

    if (isLoading && !data) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
    }

    const pages: any[] = data?.pages || [];
    const entryPages: any[] = data?.entryPages || [];

    return (
        <div className="space-y-6">
            {/* All Pages */}
            <div className="bg-[var(--card-bg)] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white">Pages</h2>
                    <span className="text-[10px] text-zinc-600">{pages.length} pages tracked</span>
                </div>
                <AnalyticsTable
                    data={pages}
                    searchKey={(p: any) => `${p.page} ${p.title}`}
                    searchPlaceholder="Search pages..."
                    columns={[
                        {
                            key: 'page', label: 'Path', sortable: true,
                            getValue: (p: any) => p.page,
                            render: (p: any) => (
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-zinc-300 text-xs truncate max-w-[280px]">{p.page}</span>
                                        <ArrowUpRight className="w-3 h-3 text-zinc-700 flex-shrink-0" />
                                    </div>
                                    {p.title && p.title !== p.page && (
                                        <span className="text-[10px] text-zinc-600 truncate block max-w-[280px]">{p.title}</span>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'views', label: 'Views', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.views || 0,
                            render: (p: any) => <span className="text-zinc-300 text-xs tabular-nums font-medium">{p.views?.toLocaleString()}</span>,
                        },
                        {
                            key: 'unique', label: 'Unique', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.uniqueViews || 0,
                            render: (p: any) => <span className="text-zinc-400 text-xs tabular-nums">{p.uniqueViews?.toLocaleString() || '—'}</span>,
                        },
                        {
                            key: 'time', label: 'Avg Time', align: 'right' as const,
                            render: (p: any) => <span className="text-zinc-400 text-xs">{p.avgTime || '—'}</span>,
                        },
                        {
                            key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.bounceRate || 0,
                            render: (p: any) => (
                                <span className={`text-xs tabular-nums ${(p.bounceRate || 0) > 50 ? 'text-red-400' : (p.bounceRate || 0) > 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {p.bounceRate != null ? `${p.bounceRate}%` : '—'}
                                </span>
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'views', dir: 'desc' }}
                />
            </div>

            {/* Entry Pages */}
            <div className="bg-[var(--card-bg)] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white">Entry Pages</h2>
                    <span className="text-[10px] text-zinc-600">Landing pages where visitors arrive</span>
                </div>
                <AnalyticsTable
                    data={entryPages}
                    searchKey={(p: any) => p.page}
                    searchPlaceholder="Search entry pages..."
                    columns={[
                        {
                            key: 'page', label: 'Path', sortable: true,
                            getValue: (p: any) => p.page,
                            render: (p: any) => <span className="text-zinc-300 text-xs truncate max-w-[300px] block">{p.page}</span>,
                        },
                        {
                            key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.sessions || 0,
                            render: (p: any) => <span className="text-zinc-300 text-xs tabular-nums font-medium">{p.sessions?.toLocaleString()}</span>,
                        },
                        {
                            key: 'users', label: 'Users', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.users || 0,
                            render: (p: any) => <span className="text-zinc-400 text-xs tabular-nums">{p.users?.toLocaleString() || '—'}</span>,
                        },
                        {
                            key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.bounceRate || 0,
                            render: (p: any) => (
                                <span className={`text-xs tabular-nums ${(p.bounceRate || 0) > 50 ? 'text-red-400' : (p.bounceRate || 0) > 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {p.bounceRate != null ? `${p.bounceRate}%` : '—'}
                                </span>
                            ),
                        },
                        {
                            key: 'pct', label: '%', align: 'right' as const, sortable: true,
                            getValue: (p: any) => p.percentage || 0,
                            render: (p: any) => <span className="text-zinc-500 text-xs tabular-nums">{p.percentage != null ? `${p.percentage}%` : '—'}</span>,
                        },
                    ]}
                    defaultSort={{ key: 'sessions', dir: 'desc' }}
                />
            </div>
        </div>
    );
}
