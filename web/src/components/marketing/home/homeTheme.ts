/**
 * The home page follows the visitor's theme (round 3): dark when the app theme saved on this device is dark,
 * or when nothing is saved (or "system") and the OS prefers dark. The rest of the marketing site stays light
 * (DESIGN 2.1). The marketing layout's wrapper carries data-theme="light"; this flips it, and HomeThemeSync
 * puts it back when the visitor leaves the home page.
 *
 * Server-safe (no 'use client'): the page inlines HOME_THEME_SCRIPT so the first paint is already right.
 */
import { THEME_STORAGE_KEY } from '@/lib/themeScript';

export const HOME_THEME_SCRIPT = `(function(){try{var v=null;try{v=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');var t=v==='dark'||((v===null||v==='system')&&m&&m.matches)?'dark':'light';var w=document.querySelector('.tc-root[data-theme]');if(w)w.setAttribute('data-theme',t);var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t}catch(e){}})();`;

export type HomeTheme = 'light' | 'dark';

/** Same rule as the script, for the client component. */
export function resolveHomeTheme(saved: string | null, prefersDark: boolean): HomeTheme {
    return saved === 'dark' || ((saved === null || saved === 'system') && prefersDark) ? 'dark' : 'light';
}
