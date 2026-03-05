'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface LastUpdatedProps {
  timestamp?: Date | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function getTimeAgo(timestamp: Date): string {
  const diff = Date.now() - timestamp.getTime();
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);

  if (mins >= 60) return `${Math.floor(mins / 60)}h ago`;
  if (mins > 0) return `${mins}m ago`;
  if (secs > 10) return `${secs}s ago`;
  return 'just now';
}

export default function LastUpdated({ timestamp, onRefresh, isRefreshing }: LastUpdatedProps) {
  // Force re-render every 30s to update the "X ago" text
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!timestamp) return null;

  const label = getTimeAgo(timestamp);

  return (
    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
      <span>Updated {label}</span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-0.5 rounded hover:bg-white/[0.04] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-50"
          aria-label="Refresh data"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  );
}
