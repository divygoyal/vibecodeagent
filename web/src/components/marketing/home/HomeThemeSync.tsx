'use client';

import { useEffect } from 'react';

import { THEME_STORAGE_KEY } from '@/lib/themeScript';
import { resolveHomeTheme, type HomeTheme } from './homeTheme';

function apply(theme: HomeTheme) {
    const wrapper = document.querySelector<HTMLElement>('.tc-root[data-theme]');
    wrapper?.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
}

/**
 * Keeps the home page on the visitor's theme (client-side navigation lands here without the inline script,
 * and the OS setting can change while the page is open), and restores the marketing site's light theme on
 * the way out. Renders nothing.
 */
export function HomeThemeSync() {
    useEffect(() => {
        const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
        const saved = () => {
            try {
                return window.localStorage.getItem(THEME_STORAGE_KEY);
            } catch {
                return null;
            }
        };
        const update = () => apply(resolveHomeTheme(saved(), Boolean(mql?.matches)));
        update();
        mql?.addEventListener('change', update);
        return () => {
            mql?.removeEventListener('change', update);
            apply('light');
        };
    }, []);
    return null;
}
