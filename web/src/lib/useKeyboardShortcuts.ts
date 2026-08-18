'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CHORD_TIMEOUT = 500; // ms to wait for second key after 'g'

const chordRoutes: Record<string, string> = {
  o: '/dashboard',
  a: '/dashboard/analytics',
  s: '/dashboard/seo',
  c: '/dashboard/ai-chat',
  b: '/dashboard/bot',
};

export default function useKeyboardShortcuts() {
  const router = useRouter();
  const pendingG = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // ? = Open command palette
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        return;
      }

      // g+* chord navigation
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!pendingG.current) {
          pendingG.current = true;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => { pendingG.current = false; }, CHORD_TIMEOUT);
          return;
        }
      }

      if (pendingG.current) {
        pendingG.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        const route = chordRoutes[e.key];
        if (route) {
          e.preventDefault();
          router.push(route);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);
}
