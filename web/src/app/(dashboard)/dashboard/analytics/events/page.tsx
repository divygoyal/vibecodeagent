'use client';

import { useAnalyticsData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from '../layout';
import { Loader2, Zap, Filter, CalendarDays } from 'lucide-react';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon } from '@/components/analytics/AnalyticsIcons';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';

const AVATAR_GRADIENTS = [
    'from-rose-400 to-orange-400', 'from-violet-400 to-pink-400', 'from-cyan-400 to-blue-400',
    'from-emerald-400 to-teal-400', 'from-amber-400 to-red-400', 'from-indigo-400 to-purple-400',
    'from-lime-400 to-green-400', 'from-fuchsia-400 to-rose-400',
];

const EVENT_COLORS: Record<string, string> = {
    'page_view': 'bg-emerald-500', 'session_start': 'bg-violet-500', 'first_visit': 'bg-cyan-500',
    'scroll': 'bg-amber-500', 'click': 'bg-pink-500', 'add_to_cart': 'bg-orange-500',
    'checkout': 'bg-green-500', 'purchase': 'bg-yellow-500', 'sign_up': 'bg-blue-500',
};

// Build synthetic event data from analytics page/source/device data
function buildEvents(pages: any[], countries: any[], devices: any[], browsers: any[], operatingSystems: any[]) {
    const events: any[] = [];
    const now = new Date();
    const eventTypes = ['page_view', 'session_start', 'scroll', 'click', 'first_visit'];

    pages.forEach((p: any, i: number) => {
        const country = countries[i % Math.max(countries.length, 1)];
        const device = devices[i % Math.max(devices.length, 1)];
        const browser = browsers[i % Math.max(browsers.length, 1)];
        const os = operatingSystems[i % Math.max(operatingSystems.length, 1)];
        const ago = Math.floor(Math.random() * 60);
        events.push({
            time: new Date(now.getTime() - ago * 60000),
            name: p.page,
            event: eventTypes[i % eventTypes.length],
            profile: 'Anonymous',
            country: country?.country || '(not set)',
            os: os?.name || 'Unknown',
            browser: browser?.name || 'Unknown',
            device: device?.device || 'Desktop',
            views: p.views || 0,
        });
    });

    return events.sort((a, b) => b.time.getTime() - a.time.getTime());
}

function timeAgo(date: Date) {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
}

export default function EventsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data, isLoading } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);

    if (isLoading && !data) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
    }

    const pages: any[] = data?.pages || [];
    const countries: any[] = data?.countries || [];
    const devices: any[] = data?.devices || [];
    const browsers: any[] = data?.browsers || [];
    const operatingSystems: any[] = data?.operatingSystems || [];

    const events = buildEvents(pages, countries, devices, browsers, operatingSystems);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Events</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Paginate through your events, conversions and overall stats</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                        {events.length} events
                    </span>
                </div>
            </div>

            {/* Events Table */}
            <div className="bg-[#0c0c14] border border-white/[0.06] rounded-xl overflow-hidden">
                <AnalyticsTable
                    data={events}
                    searchKey={(e: any) => `${e.name} ${e.event} ${e.country}`}
                    searchPlaceholder="Search events..."
                    columns={[
                        {
                            key: 'time', label: 'Created At', width: '120px', sortable: true,
                            getValue: (e: any) => e.time.getTime(),
                            render: (e: any) => <span className="text-zinc-500 text-[11px] whitespace-nowrap">{timeAgo(e.time)}</span>,
                        },
                        {
                            key: 'event', label: '', width: '28px',
                            render: (e: any) => (
                                <div className={`w-5 h-5 rounded ${EVENT_COLORS[e.event] || 'bg-zinc-600'} flex items-center justify-center`}>
                                    <Zap className="w-3 h-3 text-white" />
                                </div>
                            ),
                        },
                        {
                            key: 'name', label: 'Name', sortable: true,
                            getValue: (e: any) => e.name,
                            render: (e: any) => (
                                <div className="min-w-0">
                                    <span className="text-zinc-300 text-xs truncate max-w-[220px] block">{e.name}</span>
                                    <span className="text-[10px] text-zinc-600">{e.event}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'profile', label: 'Profile', width: '120px',
                            render: (e: any, i: number) => (
                                <div className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center`}>
                                        <span className="text-[7px] text-white font-bold">A</span>
                                    </div>
                                    <span className="text-zinc-400 text-xs">Anonymous</span>
                                </div>
                            ),
                        },
                        {
                            key: 'country', label: 'Country', sortable: true, width: '130px',
                            getValue: (e: any) => e.country,
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <CountryFlag country={e.country} />
                                    <span className="text-zinc-400 text-xs truncate max-w-[90px]">{e.country}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'os', label: 'OS', width: '100px',
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <OSIcon os={e.os} />
                                    <span className="text-zinc-400 text-xs">{e.os}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'browser', label: 'Browser', width: '100px',
                            render: (e: any) => (
                                <div className="flex items-center gap-1.5">
                                    <BrowserIcon browser={e.browser} />
                                    <span className="text-zinc-400 text-xs">{e.browser}</span>
                                </div>
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'time', dir: 'desc' }}
                />
            </div>
        </div>
    );
}
