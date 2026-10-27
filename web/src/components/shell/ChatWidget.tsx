'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { CHAT_DESKTOP_QUERY, chatBubbleAllowed, setChatWanted } from '@/components/ui/chatWidget';

/**
 * The Tawk.to loader (one per document, in app/providers.tsx). It renders
 * nothing: it tells components/ui/chatWidget.ts whether this route and width
 * want the bubble (marketing pages and Support, desktop only) and that module
 * loads the script the first time it is wanted.
 */
export function ChatWidget() {
    const pathname = usePathname() ?? '/';
    useEffect(() => {
        const mq = window.matchMedia(CHAT_DESKTOP_QUERY);
        const update = () => setChatWanted(mq.matches && chatBubbleAllowed(pathname));
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [pathname]);
    return null;
}
