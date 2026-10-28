'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { setThemePreference, type ThemePreference } from '@/lib/theme';
import { THEME_EVENT, THEME_STORAGE_KEY } from '@/lib/themeScript';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

/** On the home page nothing saved means "follow the device" (homeTheme.ts), so the menu shows System then. */
function readHomePreference(): ThemePreference {
    try {
        const v = window.localStorage.getItem(THEME_STORAGE_KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
        return 'system';
    }
}

function subscribe(cb: () => void) {
    window.addEventListener(THEME_EVENT, cb);
    window.addEventListener('storage', cb);
    return () => {
        window.removeEventListener(THEME_EVENT, cb);
        window.removeEventListener('storage', cb);
    };
}

const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/** Light / Dark / System for the home page. Saved with the app's theme, so the dashboard follows the same choice. */
export function HomeThemeToggle() {
    const pref = useSyncExternalStore(subscribe, readHomePreference, () => 'system' as ThemePreference);
    const Icon = ICON[pref];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Theme: ${LABEL[pref]}. Change theme`}
                    title="Theme"
                    className="flex size-10 items-center justify-center rounded-control text-fg-secondary transition-colors duration-120 hover:bg-subtle hover:text-fg"
                >
                    <Icon className="size-[18px]" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuRadioGroup value={pref} onValueChange={(v) => setThemePreference(v as ThemePreference)}>
                    <DropdownMenuRadioItem value="light" icon={Sun}>Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark" icon={Moon}>Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system" icon={Monitor}>System</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
