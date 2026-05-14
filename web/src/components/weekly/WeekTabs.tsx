'use client';

/**
 * WeekTabs — horizontal scrollable strip of week pills.
 *
 * Renders the most-recent N weekly digest summaries as a tab strip with
 * the selected week highlighted. Each pill shows "Week N" + the digest's
 * headline as a tooltip on hover. Horizontally scrollable on mobile.
 *
 * Visual language matches the rest of the TrafficClaw dashboard:
 *   - Inactive pill: bg-white/[0.02] + zinc text
 *   - Active pill:   #14C4E1 cyan glow, same as sidebar active-item
 *   - Container:     zinc-950 bg with subtle border
 */

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { digestKey, type DigestSummary } from '@/lib/weeklyDigestClient';

interface WeekTabsProps {
    weeks: DigestSummary[];
    selectedKey: string;
    onSelect: (key: string) => void;
    /** When true, render a single trailing "Upgrade for more weeks" CTA — used for free-tier gating. */
    showUpgradeHint?: boolean;
    /** Click handler for the upgrade CTA (typically navigates to /dashboard/plan). */
    onUpgradeClick?: () => void;
}

function truncate(s: string | null | undefined, max: number): string {
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
}

export default function WeekTabs({ weeks, selectedKey, onSelect, showUpgradeHint, onUpgradeClick }: WeekTabsProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const activePillRef = useRef<HTMLButtonElement | null>(null);

    // Scroll the active pill into view on mount/change. Without this, opening
    // the page on an older week (deep-link from email) leaves the active tab
    // off-screen.
    useEffect(() => {
        if (!activePillRef.current || !scrollRef.current) return;
        const pill = activePillRef.current;
        const strip = scrollRef.current;
        const pillRect = pill.getBoundingClientRect();
        const stripRect = strip.getBoundingClientRect();
        if (pillRect.left < stripRect.left || pillRect.right > stripRect.right) {
            pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [selectedKey]);

    const scrollBy = (dir: 'left' | 'right') => {
        if (!scrollRef.current) return;
        const delta = dir === 'left' ? -240 : 240;
        scrollRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    };

    if (!weeks.length) {
        return null;
    }

    return (
        <div className="relative">
            <div className="flex items-center gap-2">
                {/* Left chevron — desktop only; mobile users swipe */}
                <button
                    type="button"
                    onClick={() => scrollBy('left')}
                    className="hidden md:flex flex-shrink-0 w-8 h-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    aria-label="Scroll weeks left"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Scrollable strip */}
                <div
                    ref={scrollRef}
                    className="flex-1 flex gap-2 overflow-x-auto scrollbar-none py-1 px-0.5"
                    style={{ scrollbarWidth: 'none' }}
                >
                    {weeks.map((w) => {
                        const key = digestKey(w.year, w.iso_week);
                        const isActive = key === selectedKey;
                        const subtitle = truncate(w.headline, 40);
                        return (
                            <button
                                key={key}
                                ref={isActive ? activePillRef : undefined}
                                type="button"
                                onClick={() => onSelect(key)}
                                title={w.headline || `Week ${w.iso_week}, ${w.year}`}
                                className={`group flex-shrink-0 flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-xl text-left transition-all min-w-[140px] ${
                                    isActive
                                        ? 'border border-[#14C4E1]/24 bg-[linear-gradient(180deg,rgba(20,196,225,0.16),rgba(7,48,60,0.16))] text-[#7AD9DA] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(5,24,34,0.24)]'
                                        : 'border border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1]'
                                }`}
                            >
                                <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                                    {w.year}
                                </span>
                                <span className={`text-sm font-semibold ${isActive ? 'text-[#7AD9DA]' : 'text-white'}`}>
                                    Week {w.iso_week}
                                </span>
                                {subtitle ? (
                                    <span className="text-[10px] leading-tight text-zinc-500 max-w-[160px] truncate">
                                        {subtitle}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}

                    {showUpgradeHint && (
                        <button
                            type="button"
                            onClick={onUpgradeClick}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.06] text-violet-300 hover:from-violet-500/[0.12] hover:to-purple-500/[0.12] transition-all"
                            title="Upgrade for 26-week history"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium whitespace-nowrap">
                                Upgrade for 26 weeks
                            </span>
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => scrollBy('right')}
                    className="hidden md:flex flex-shrink-0 w-8 h-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    aria-label="Scroll weeks right"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
