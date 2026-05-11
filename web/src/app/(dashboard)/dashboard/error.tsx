'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
    // Best-effort telemetry — surface the crash in Clarity so we can see how
    // often it fires for real users (e.g. translate-induced removeChild).
    if (typeof window !== 'undefined' && (window as { clarity?: (...args: unknown[]) => void }).clarity) {
      try {
        (window as { clarity?: (...args: unknown[]) => void }).clarity?.('event', 'dashboard-error', { digest: error?.digest, message: error?.message });
      } catch { /* clarity not loaded yet */ }
    }
  }, [error]);

  return (
    <div translate="no" className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
      <p className="text-zinc-400 max-w-md mb-1">
        An unexpected error occurred while loading the dashboard.
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-600 mb-4 font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 font-medium text-sm"
      >
        <RotateCcw className="w-4 h-4" />
        Try Again
      </button>
    </div>
  );
}
