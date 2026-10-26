'use client';

import { useRef } from 'react';

/**
 * Focus return for controlled dialogs and drawers (opened by state, not by a
 * Radix Trigger): remembers what had focus when the content opened and gives
 * focus back to it on close, instead of the start of the page. Spread the
 * result on Dialog.Content.
 */
export function useReturnFocus() {
    const ref = useRef<HTMLElement | null>(null);
    return {
        onOpenAutoFocus: () => {
            const el = typeof document !== 'undefined' ? document.activeElement : null;
            ref.current = el instanceof HTMLElement && el !== document.body ? el : null;
        },
        onCloseAutoFocus: (e: Event) => {
            const el = ref.current;
            ref.current = null;
            if (el && el.isConnected) {
                e.preventDefault();
                el.focus({ preventScroll: true });
            }
        },
    };
}
