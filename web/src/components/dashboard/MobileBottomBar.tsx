'use client';

import { Bell, FileDown, RefreshCw, Sparkles } from 'lucide-react';

interface MobileBottomBarProps {
  onRefresh: () => void;
  onAskAI: () => void;
  onExport: () => void;
  onNotifications: () => void;
  isRefreshing?: boolean;
  alertCount?: number;
}

/**
 * Fixed bottom action bar for mobile (< md breakpoint).
 * Ask AI is the primary CTA — full-width gradient pill in the center.
 * Flanked by utility icon buttons: Refresh, Notifications, Export.
 */
export default function MobileBottomBar({
  onRefresh,
  onAskAI,
  onExport,
  onNotifications,
  isRefreshing = false,
  alertCount = 0,
}: MobileBottomBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#05080c]/95 shadow-[0_-18px_42px_rgba(0,0,0,0.4)] backdrop-blur-xl md:hidden">
      <div
        className="flex items-center gap-2 px-3 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#05090d] text-zinc-400 transition-all duration-100 active:scale-[0.93] active:opacity-80"
        >
          <RefreshCw className={`h-4.5 w-4.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Ask AI — primary CTA */}
        <button
          type="button"
          onClick={onAskAI}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-sm font-semibold text-[#031014] shadow-[0_8px_20px_rgba(34,211,238,0.22)] transition-all duration-100 active:scale-[0.97] active:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={onNotifications}
          aria-label={`Alerts${alertCount > 0 ? ` (${alertCount})` : ''}`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#05090d] text-zinc-400 transition-all duration-100 active:scale-[0.93] active:opacity-80"
        >
          <Bell className={`h-4.5 w-4.5 ${alertCount > 0 ? 'text-amber-300' : ''}`} />
          {alertCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        {/* Export */}
        <button
          type="button"
          onClick={onExport}
          aria-label="Export report"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#05090d] text-zinc-400 transition-all duration-100 active:scale-[0.93] active:opacity-80"
        >
          <FileDown className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}
