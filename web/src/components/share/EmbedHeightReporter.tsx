'use client';

import { useEffect, useRef } from 'react';

import { watchEmbedHeight } from '@/lib/embedResize';

/**
 * Renders inside the embed's page root and reports that root's height to the host page (see lib/embedResize.ts), so the
 * iframe grows to the content and the Made-with footer is not cut off.
 */
export function EmbedHeightReporter() {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const root = ref.current?.parentElement;
        if (!root) return;
        return watchEmbedHeight(root, window);
    }, []);
    return <span ref={ref} hidden />;
}
