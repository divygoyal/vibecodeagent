/**
 * Server-safe theme constants and the inline <head> script (no 'use client',
 * so app/layout.tsx can inline the string). Hooks live in lib/theme.ts.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tc-theme';
export const THEME_EVENT = 'tc-theme-change';

/** Paths whose theme follows the stored preference. Everything else is light (or ?theme=). */
export const THEMED_PATH_PREFIXES = ['/dashboard'];
/** Paths that accept ?theme=light|dark (chrome-less embeds and shared dashboards). */
export const PARAM_THEMED_PATH_PREFIXES = ['/embed', '/share', '/view'];

/**
 * Inline script for <head>. Keep it dependency-free and tiny; it runs before
 * React hydrates. It mirrors resolveTheme() below.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,p=location.pathname,m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');function pref(){try{var v=localStorage.getItem('${THEME_STORAGE_KEY}');return v==='dark'||v==='system'?v:'light'}catch(e){return 'light'}}function themed(){return ${JSON.stringify(THEMED_PATH_PREFIXES)}.some(function(x){return p===x||p.indexOf(x+'/')===0})}function param(){if(!${JSON.stringify(PARAM_THEMED_PATH_PREFIXES)}.some(function(x){return p.indexOf(x+'/')===0}))return null;var t=new URLSearchParams(location.search).get('theme');return t==='dark'||t==='light'?t:null}function apply(){var t='light';var q=param();if(q){t=q}else if(themed()){var v=pref();t=v==='system'?(m&&m.matches?'dark':'light'):v}d.setAttribute('data-theme',t);d.style.colorScheme=t}apply();if(m&&m.addEventListener)m.addEventListener('change',function(){if(themed()&&pref()==='system')apply()})}catch(e){}})();`;

