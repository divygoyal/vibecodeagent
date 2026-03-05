'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // g + o = Go to Overview
      // g + a = Go to Analytics
      // g + s = Go to SEO
      // g + c = Go to Chat
      // g + b = Go to Bot
      // ? = Show keyboard shortcuts (via command palette)

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        // Open command palette
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);
}
