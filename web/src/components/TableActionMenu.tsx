'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    MoreHorizontal, ScanSearch, Sparkles, TrendingUp, Copy,
    ExternalLink, BarChart3, FileText, Target, Zap, RefreshCw, Ghost, Smartphone
} from 'lucide-react';
import { buildAskAiUrl } from '@/lib/askAi';

interface ActionItem {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    color?: string;
    divider?: boolean;
}

interface TableActionMenuProps {
    actions: ActionItem[];
    size?: 'sm' | 'md';
}

export default function TableActionMenu({ actions, size = 'sm' }: TableActionMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

    return (
        <div ref={ref} className="relative inline-flex">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={`action-menu group inline-flex items-center justify-center rounded-lg transition-all hover:bg-white/[0.06] ${size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'}`}
                aria-label="Actions"
            >
                <MoreHorizontal className={`${iconSize} text-[var(--text-secondary)] opacity-60 group-hover:opacity-100 transition-opacity`} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 backdrop-blur-xl">
                    {actions.map((action, i) => (
                        <div key={i}>
                            {action.divider && i > 0 && <div className="my-1 h-px bg-white/[0.06]" />}
                            <button
                                onClick={(e) => { e.stopPropagation(); action.onClick(); setOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                            >
                                <action.icon className={`w-3.5 h-3.5 ${action.color || 'text-zinc-500'}`} />
                                {action.label}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Pre-built action factories
export function useTableActions() {
    const router = useRouter();

    const auditPage = (url: string) => ({
        label: 'Run Audit',
        icon: ScanSearch,
        color: 'text-emerald-400',
        onClick: () => router.push(`/dashboard/audit?url=${encodeURIComponent(url)}`),
    });

    // Note: the previous `site` param is no longer threaded through — the
    // dedicated /dashboard/ai-chat page reads the active site/property from
    // the workspace context, which is the single source of truth.
    const analyzeWithAI = (context: string, _site?: string) => ({
        label: 'Analyze with AI',
        icon: Sparkles,
        color: 'text-cyan-400',
        onClick: () => router.push(buildAskAiUrl(context)),
    });

    const trackKeyword = (keyword: string) => ({
        label: 'Track Keyword',
        icon: Target,
        color: 'text-amber-400',
        onClick: () => router.push(buildAskAiUrl(`Set up tracking and analysis for the keyword "${keyword}". What's the best strategy to improve its ranking?`)),
    });

    const optimizePage = (url: string) => ({
        label: 'Optimize Page',
        icon: Zap,
        color: 'text-violet-400',
        onClick: () => router.push(buildAskAiUrl(`Analyze and provide optimization recommendations for ${url}`)),
    });

    const viewTrend = (query: string) => ({
        label: 'View Trend',
        icon: TrendingUp,
        color: 'text-blue-400',
        onClick: () => router.push(buildAskAiUrl(`Show me the detailed trend and analysis for "${query}" keyword performance`)),
    });

    const copyToClipboard = (text: string) => ({
        label: 'Copy',
        icon: Copy,
        color: 'text-zinc-500',
        onClick: () => navigator.clipboard.writeText(text),
    });

    const openExternal = (url: string) => ({
        label: 'Open in Browser',
        icon: ExternalLink,
        color: 'text-zinc-500',
        onClick: () => window.open(url.startsWith('http') ? url : `https://${url}`, '_blank'),
    });

    const generateContent = (keyword: string) => ({
        label: 'Generate Content',
        icon: FileText,
        color: 'text-emerald-400',
        divider: true,
        onClick: () => router.push(buildAskAiUrl(`Generate an SEO-optimized blog post outline targeting the keyword "${keyword}"`)),
    });

    const viewAnalytics = (page: string) => ({
        label: 'View Analytics',
        icon: BarChart3,
        color: 'text-blue-400',
        onClick: () => router.push(`/dashboard/analytics`),
    });

    // The pre-migration code passed `detail.message` here, which the
    // AIChatbot listener never read (it consumed `detail.question`) — so
    // these three actions silently no-op'd before. Migration to
    // buildAskAiUrl fixes that latent bug at the same time.
    const refreshContent = (url: string) => ({
        label: 'Refresh Content',
        icon: RefreshCw,
        onClick: () => router.push(buildAskAiUrl(`Suggest content refresh strategies for this page: ${url}`)),
    });

    const zombieAction = (url: string, diagnosis: string) => ({
        label: `Fix ${diagnosis}`,
        icon: Ghost,
        onClick: () => router.push(buildAskAiUrl(`This page is classified as a "${diagnosis}" page (0 clicks). Suggest what to do with: ${url}`)),
    });

    const mobileOptimize = (query: string) => ({
        label: 'Optimize for Mobile',
        icon: Smartphone,
        onClick: () => router.push(buildAskAiUrl(`Suggest mobile optimization strategies for the keyword: ${query}`)),
    });

    return {
        auditPage, analyzeWithAI, trackKeyword, optimizePage,
        viewTrend, copyToClipboard, openExternal, generateContent, viewAnalytics,
        refreshContent, zombieAction, mobileOptimize,
    };
}

interface BulkActionBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    actions: ActionItem[];
}

export function BulkActionBar({ selectedCount, onClearSelection, actions }: BulkActionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <span className="text-sm font-medium text-emerald-400">{selectedCount} selected</span>
            <div className="flex items-center gap-2 ml-auto">
                {actions.map((action, i) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={i}
                            onClick={action.onClick}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {action.label}
                        </button>
                    );
                })}
                <button
                    onClick={onClearSelection}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-2 transition-colors"
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
