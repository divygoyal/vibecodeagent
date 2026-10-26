'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

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
    <div translate="no">
      <EmptyState
        variant="page"
        icon={AlertTriangle}
        title="Something went wrong"
        description="An unexpected error occurred while loading this page."
        actions={<Button variant="secondary" icon={RotateCcw} onClick={reset}>Try again</Button>}
      >
        {error.digest ? <p className="mt-3 font-mono text-meta text-fg-faint">Error ID: {error.digest}</p> : null}
      </EmptyState>
    </div>
  );
}
