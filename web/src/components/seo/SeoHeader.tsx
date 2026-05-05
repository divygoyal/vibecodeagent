'use client';

import { Download, Search } from 'lucide-react';
import { formatSiteLabel } from '@/lib/dashboardSelection';

interface SeoHeaderProps {
    siteUrl: string;
    isDemo: boolean;
    canExport: boolean;
    onExport: () => void;
}

export default function SeoHeader({ siteUrl, isDemo, canExport, onExport }: SeoHeaderProps) {
    const siteLabel = siteUrl ? formatSiteLabel(siteUrl) : 'No site selected';

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-zinc-400">
                    <Search className="h-3 w-3" />
                    <span className="truncate max-w-[260px]">{siteLabel}</span>
                    {isDemo ? (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                            Demo
                        </span>
                    ) : null}
                </div>
                <h1 className="text-[28px] font-semibold tracking-tight text-white drop-shadow-sm">
                    SEO
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                    Search Console rankings, query movement, and page health for your site.
                </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                <button
                    type="button"
                    onClick={onExport}
                    disabled={!canExport}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-3.5 py-2 text-[12px] font-medium text-zinc-300 transition hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Download className="h-3.5 w-3.5" />
                    Export
                </button>
            </div>
        </div>
    );
}
