'use client';

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'tc-local-storage';

function subscribe(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(EVENT, onChange);
    };
}

/**
 * A localStorage string as external store: `null` on the server and during
 * hydration (so the first render matches the server), then the stored value.
 * Writes notify every hook in this tab; other tabs through the `storage` event.
 * Storage that throws (private mode, blocked) reads as null and writes are dropped.
 */
export function useLocalStorageString(key: string): [string | null, (value: string | null) => void] {
    const value = useSyncExternalStore(
        subscribe,
        () => {
            try { return window.localStorage.getItem(key); } catch { return null; }
        },
        () => null,
    );
    const set = useCallback((next: string | null) => {
        try {
            if (next === null) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, next);
        } catch { /* storage blocked */ }
        window.dispatchEvent(new Event(EVENT));
    }, [key]);
    return [value, set];
}
