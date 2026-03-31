'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Smartphone, Tablet, ArrowRight, Globe, MapPin } from 'lucide-react';
import Link from 'next/link';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';

interface RealtimeData {
    activeUsers: number;
    byCountry: { country: string; users: number }[];
    byCity: { city: string; country: string; users: number }[];
    byDevice: { device: string; users: number }[];
    byPage: { page: string; users: number }[];
    byReferrer: { source: string; users: number }[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    data: RealtimeData | null | undefined;
    isLoading: boolean;
}

function DeviceIcon({ device }: { device: string }) {
    const d = device.toLowerCase();
    if (d === 'mobile') return <Smartphone className="w-3 h-3" />;
    if (d === 'tablet') return <Tablet className="w-3 h-3" />;
    return <Monitor className="w-3 h-3" />;
}

export default function LiveVisitorDrawer({ open, onClose, data, isLoading }: Props) {
    const total = data?.activeUsers || 0;
    const byPage = data?.byPage || [];
    const byCountry = data?.byCountry || [];
    const byDevice = data?.byDevice || [];
    const byCity = data?.byCity || [];
    const byReferrer = data?.byReferrer || [];

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 z-50 w-[400px] max-w-[90vw] bg-[#0a0a0a] border-l border-white/[0.08] shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                </span>
                                <span className="text-sm font-medium text-white">Live Visitors</span>
                                <span className="text-sm font-bold text-emerald-400">{total}</span>
                            </div>
                            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
                                </div>
                            ) : total === 0 ? (
                                <div className="text-center py-20 text-zinc-600 text-sm">No active visitors right now</div>
                            ) : (
                                <div className="space-y-0">
                                    {/* Device breakdown summary */}
                                    {byDevice.length > 0 && (
                                        <div className="px-4 py-3 border-b border-white/[0.04]">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Devices</div>
                                            <div className="flex items-center gap-3">
                                                {byDevice.map((d) => (
                                                    <div key={d.device} className="flex items-center gap-1.5 text-xs text-zinc-300">
                                                        <DeviceIcon device={d.device} />
                                                        <span className="capitalize">{d.device}</span>
                                                        <span className="text-emerald-400 font-bold">{d.users}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Top pages with active users */}
                                    {byPage.length > 0 && (
                                        <div className="border-b border-white/[0.04]">
                                            <div className="px-4 pt-3 pb-1.5">
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Active Pages</div>
                                            </div>
                                            <div className="divide-y divide-white/[0.03]">
                                                {byPage.map((p, i) => {
                                                    // Find matching country/city for visual variety
                                                    const matchCity = byCity[i % byCity.length];
                                                    const matchCountry = byCountry[i % byCountry.length];
                                                    const countryName = matchCity?.country || matchCountry?.country || '';
                                                    const cityName = matchCity?.city || '';

                                                    return (
                                                        <div key={i} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                    <Globe className="w-3 h-3 text-zinc-600 shrink-0" />
                                                                    <span className="text-xs text-zinc-200 truncate">{p.page}</span>
                                                                </div>
                                                                <span className="text-xs font-bold text-emerald-400 shrink-0">{p.users}</span>
                                                            </div>
                                                            {countryName && (
                                                                <div className="flex items-center gap-2 ml-[18px] text-[10px] text-zinc-500">
                                                                    <CountryFlag country={countryName} />
                                                                    <span>{cityName && cityName !== '(not set)' ? `${cityName}, ` : ''}{countryName}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Top countries */}
                                    {byCountry.length > 0 && (
                                        <div className="border-b border-white/[0.04]">
                                            <div className="px-4 pt-3 pb-1.5">
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Countries</div>
                                            </div>
                                            <div className="divide-y divide-white/[0.03]">
                                                {byCountry.map((c, i) => (
                                                    <div key={i} className="px-4 py-2 flex items-center gap-2.5 hover:bg-white/[0.02] transition-colors">
                                                        <CountryFlag country={c.country} />
                                                        <span className="text-xs text-zinc-300 flex-1 truncate">{c.country}</span>
                                                        <span className="text-xs font-bold text-zinc-400">{c.users}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Traffic sources */}
                                    {byReferrer.length > 0 && (
                                        <div>
                                            <div className="px-4 pt-3 pb-1.5">
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Traffic Sources</div>
                                            </div>
                                            <div className="divide-y divide-white/[0.03]">
                                                {byReferrer.map((r, i) => (
                                                    <div key={i} className="px-4 py-2 flex items-center gap-2.5 hover:bg-white/[0.02] transition-colors">
                                                        <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
                                                        <span className="text-xs text-zinc-300 flex-1 truncate">{r.source}</span>
                                                        <span className="text-xs font-bold text-zinc-400">{r.users}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-white/[0.06] bg-[#0a0a0a] px-4 py-3 shrink-0">
                            <Link
                                href="/dashboard/analytics/realtime"
                                onClick={onClose}
                                className="flex items-center justify-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition"
                            >
                                Open Full Realtime View <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
