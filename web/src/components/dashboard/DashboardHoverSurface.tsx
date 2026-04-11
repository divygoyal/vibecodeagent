'use client';

import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

type DashboardHoverTone = 'emerald' | 'cyan' | 'amber' | 'mixed';
type DashboardHoverElement = 'div' | 'section';

interface DashboardHoverSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: DashboardHoverElement;
  tone?: DashboardHoverTone;
  interactive?: boolean;
  children: ReactNode;
}

function setForwardedRef(
  forwardedRef: ((instance: HTMLElement | null) => void) | MutableRefObject<HTMLElement | null> | null,
  node: HTMLElement | null,
) {
  if (!forwardedRef) return;

  if (typeof forwardedRef === 'function') {
    forwardedRef(node);
    return;
  }

  forwardedRef.current = node;
}

const DashboardHoverSurface = forwardRef<HTMLElement, DashboardHoverSurfaceProps>(function DashboardHoverSurface(
  {
    as = 'div',
    tone = 'mixed',
    interactive = true,
    className = '',
    children,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    ...rest
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  const mediaRef = useRef<MediaQueryList | null>(null);

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      localRef.current = node;
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const canTrackPointer = useCallback(() => {
    if (!interactive || typeof window === 'undefined') {
      return false;
    }

    mediaRef.current ??= window.matchMedia('(hover: hover) and (pointer: fine)');
    return mediaRef.current.matches;
  }, [interactive]);

  const commitPointerPosition = useCallback(() => {
    frameRef.current = null;

    const node = localRef.current;
    const point = pointRef.current;
    if (!node || !point) return;

    const bounds = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${point.x - bounds.left}px`);
    node.style.setProperty('--my', `${point.y - bounds.top}px`);
  }, []);

  const schedulePointerCommit = useCallback(() => {
    if (typeof window === 'undefined' || frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(commitPointerPosition);
  }, [commitPointerPosition]);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      onPointerEnter?.(event);
      if (!canTrackPointer()) {
        return;
      }

      pointRef.current = { x: event.clientX, y: event.clientY };
      localRef.current?.style.setProperty('--hover-opacity', '1');
      schedulePointerCommit();
    },
    [canTrackPointer, onPointerEnter, schedulePointerCommit],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      onPointerMove?.(event);
      if (!canTrackPointer()) {
        return;
      }

      pointRef.current = { x: event.clientX, y: event.clientY };
      schedulePointerCommit();
    },
    [canTrackPointer, onPointerMove, schedulePointerCommit],
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      onPointerLeave?.(event);
      if (!interactive) {
        return;
      }

      localRef.current?.style.setProperty('--hover-opacity', '0');
    },
    [interactive, onPointerLeave],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return createElement(
    as,
    {
      ...rest,
      ref: setRefs,
      className: ['dashboard-hover-surface', interactive ? 'dashboard-hover-surface--interactive' : '', className]
        .filter(Boolean)
        .join(' '),
      'data-tone': tone,
      onPointerEnter: handlePointerEnter,
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave,
    },
    children,
  );
});

export default DashboardHoverSurface;
