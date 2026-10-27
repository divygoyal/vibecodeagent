'use client';

import { useEffect } from 'react';

import { chatSheetDelta } from './chatWidget';

/**
 * Hide the Tawk.to chat bubble while a Modal, Drawer or sheet is open. The
 * bubble sits above every layer (max z-index) and on phones covers the bottom
 * corner of bottom sheets, where it swallows taps on footer buttons and on
 * Select options. Counted, so nested sheets show it again only when the last
 * one closes, and only where the route wants it (components/ui/chatWidget.ts).
 */
export function useHideChatWidget(open: boolean): void {
    useEffect(() => {
        if (!open) return;
        chatSheetDelta(1);
        return () => chatSheetDelta(-1);
    }, [open]);
}
