'use client';

import { useCallback, useState } from 'react';

/**
 * Width of an element, kept in sync with a ResizeObserver. Use the returned
 * callback as the element's `ref`. Width is 0 until the element mounts, so
 * charts can render a skeleton of the right height first.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, number] {
    const [width, setWidth] = useState(0);
    const ref = useCallback((el: T | null) => {
        if (!el) return;
        const set = () => setWidth(Math.round(el.getBoundingClientRect().width));
        set();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => set());
        ro.observe(el);
        // React 19 runs a ref callback's return value as its cleanup.
        return () => ro.disconnect();
    }, []);
    return [ref, width];
}
