'use client';

import { ArrowLeft, type LucideIcon } from 'lucide-react';

interface SeoSelectionEmptyStateProps {
    title: string;
    description: string;
    icon?: LucideIcon;
}

export default function SeoSelectionEmptyState({ title, description, icon: Icon = ArrowLeft }: SeoSelectionEmptyStateProps) {
    return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-[16px] border border-dashed border-white/[0.06] bg-[#0a0b0e] px-6 py-10 text-center">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.06] bg-white/[0.02]">
                <Icon className="h-4 w-4 text-zinc-400" />
            </div>
            <p className="text-[13px] font-semibold tracking-tight text-white">{title}</p>
            <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-zinc-500">{description}</p>
        </div>
    );
}
