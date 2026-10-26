/**
 * Light / Dark / System theme for the app (DESIGN.md 2.1).
 *
 * - The preference lives in localStorage['tc-theme'] ('light' | 'dark' | 'system').
 * - The resolved theme is written to <html data-theme="light|dark"> before first
 *   paint by THEME_INIT_SCRIPT (inlined in app/layout.tsx <head>).
 * - Only the app (/dashboard/**) follows the preference. Marketing and public
 *   pages are always light; embeds and shares read ?theme=light|dark.
 * - Client-side navigation does not re-run the head script, so AppShell calls
 *   useAppTheme() to apply the preference on mount and to restore light when it
 *   unmounts.
 */
'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
    THEME_EVENT,
    THEME_STORAGE_KEY,
    type ResolvedTheme,
    type ThemePreference,
} from './themeScript';

export { THEME_STORAGE_KEY, THEME_INIT_SCRIPT, type ResolvedTheme, type ThemePreference } from './themeScript';

export function readThemePreference(): ThemePreference {
    if (typeof window === 'undefined') return 'light';
    try {
        const v = window.localStorage.getItem(THEME_STORAGE_KEY);
        return v === 'dark' || v === 'system' ? v : 'light';
    } catch {
        return 'light';
    }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
    if (pref === 'system') {
        if (typeof window === 'undefined' || !window.matchMedia) return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
}

export function applyResolvedTheme(theme: ResolvedTheme) {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    if (el.getAttribute('data-theme') !== theme) el.setAttribute('data-theme', theme);
    el.style.colorScheme = theme;
}

export function setThemePreference(pref: ThemePreference) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
        // Private mode: the choice lasts for this page only.
    }
    applyResolvedTheme(resolveTheme(pref));
    window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(cb: () => void) {
    window.addEventListener(THEME_EVENT, cb);
    window.addEventListener('storage', cb);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', cb);
    return () => {
        window.removeEventListener(THEME_EVENT, cb);
        window.removeEventListener('storage', cb);
        mq?.removeEventListener?.('change', cb);
    };
}

/** Current preference + setter. Server render returns 'light'. */
export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
    const pref = useSyncExternalStore(subscribe, readThemePreference, () => 'light' as ThemePreference);
    const set = useCallback((p: ThemePreference) => setThemePreference(p), []);
    return [pref, set];
}

/** Resolved theme ('light' | 'dark') that tracks the preference and the OS. */
export function useResolvedTheme(): ResolvedTheme {
    const [pref] = useThemePreference();
    const sys = useSyncExternalStore(
        subscribe,
        () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        () => 'light' as ResolvedTheme,
    );
    return pref === 'system' ? sys : pref;
}

/**
 * For the app shell: keep <html data-theme> in sync with the preference while
 * mounted, and go back to light when leaving the app (marketing is light only).
 */
export function useAppTheme() {
    const theme = useResolvedTheme();
    useEffect(() => {
        applyResolvedTheme(theme);
    }, [theme]);
    useEffect(() => () => applyResolvedTheme('light'), []);
    return theme;
}
