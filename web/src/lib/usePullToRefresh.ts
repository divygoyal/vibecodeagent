'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown>;
  /** Minimum pull distance in px to trigger refresh (default: 80) */
  threshold?: number;
  /** Maximum visual pull distance in px (default: 120) */
  maxPull?: number;
  /** Only enable on narrow viewports (default: 1024, matches lg breakpoint) */
  maxWidth?: number;
}

interface PullToRefreshState {
  /** Bind this ref to the scrollable container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current pull distance (0 when idle) */
  pullDistance: number;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
}

/**
 * Pull-to-refresh gesture hook for mobile.
 * Attaches touch listeners to a container and triggers `onRefresh` when the user
 * pulls down past the threshold while already at the top of the scroll area.
 */
export default function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  maxWidth = 1024,
}: UsePullToRefreshOptions): PullToRefreshState {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only activate on narrow viewports
      if (window.innerWidth >= maxWidth) return;
      // Only if we're at the top
      if (el.scrollTop > 5) return;
      if (isRefreshing) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY <= 0) {
        setPullDistance(0);
        return;
      }
      // Dampen the pull with a resistance factor
      const dampened = Math.min(deltaY * 0.45, maxPull);
      setPullDistance(dampened);

      // Prevent default scroll while pulling down
      if (dampened > 10) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullDistance >= threshold && !isRefreshing) {
        void handleRefresh();
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleRefresh, isRefreshing, maxPull, maxWidth, pullDistance, threshold]);

  return { containerRef, pullDistance, isRefreshing };
}
