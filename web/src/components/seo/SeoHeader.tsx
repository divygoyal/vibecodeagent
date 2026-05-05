'use client';

import { Download } from 'lucide-react';

interface SeoHeaderProps {
    canExport: boolean;
    onExport: () => void;
}

export default function SeoHeader({ canExport, onExport }: SeoHeaderProps) {
    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
            <div className="min-w-0">
                <h1 className="text-[28px] font-semibold tracking-tight text-white">
                    SEO
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                    Track your search performance, discover opportunities, and fix issues.
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
