'use client';

import { RefreshCw, MessageSquare, FileDown, Bell } from 'lucide-react';

interface MobileBottomBarProps {
  onRefresh: () => void;
  onAskAI: () => void;
  onExport: () => void;
  onNotifications: () => void;
  isRefreshing?: boolean;
  alertCount?: number;
}

/**
 * Fixed bottom action bar for mobile (< lg breakpoint).
 * 56px tall, sits above the chatbot FAB. 4 icon buttons: Refresh, Ask AI, Export, Notifications.
 */
export default function MobileBottomBar({
  onRefresh,
  onAskAI,
  onExport,
  onNotifications,
  isRefreshing = false,
  alertCount = 0,
}: MobileBottomBarProps) {
  const actions = [
    {
      icon: RefreshCw,
      label: 'Refresh',
      onClick: onRefresh,
      className: isRefreshing ? 'animate-spin' : '',
    },
    {
      icon: MessageSquare,
      label: 'Ask AI',
      onClick: onAskAI,
      className: '',
    },
    {
      icon: FileDown,
      label: 'Export',
      onClick: onExport,
      className: '',
    },
    {
      icon: Bell,
      label: 'Alerts',
      onClick: onNotifications,
      badge: alertCount > 0 ? alertCount : undefined,
      className: '',
    },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center border-t border-white/[0.06] bg-[#010203]/90 backdrop-blur-xl safe-area-bottom lg:hidden">
      <div className="grid w-full grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-zinc-400 transition-colors active:text-white"
            >
              <span className="relative">
                <Icon className={`h-5 w-5 ${action.className}`} />
                {action.badge !== undefined && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {action.badge > 9 ? '9+' : action.badge}
                  </span>
                )}
              </span>
              <span className="text-[9px] uppercase tracking-[0.1em]">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
