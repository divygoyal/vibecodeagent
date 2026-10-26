'use client';

import { Check } from 'lucide-react';

import { SettingsSection } from '@/components/app/SettingsSection';
import { cn } from '@/lib/cn';
import { useThemePreference, type ThemePreference } from '@/lib/theme';

const OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
    { value: 'light', label: 'Light', description: 'Bright, like the marketing site' },
    { value: 'dark', label: 'Dark', description: 'Easier on the eyes at night' },
    { value: 'system', label: 'System', description: 'Follows your device' },
];

/** A tiny page drawn with the real tokens of the given theme (a data-theme wrapper switches them). */
function Mini({ theme }: { theme: 'light' | 'dark' }) {
    return (
        <div data-theme={theme} aria-hidden className="flex h-full w-full flex-col gap-1.5 bg-canvas p-2">
            <div className="h-1.5 w-1/3 rounded-full bg-fg-faint" />
            <div className="flex flex-1 gap-1.5">
                <div className="w-1/4 rounded-sm bg-surface" />
                <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex-1 rounded-sm border border-border-subtle bg-surface p-1">
                        <div className="h-full w-full rounded-[2px] bg-m-clicks/30" />
                    </div>
                    <div className="h-2 rounded-sm bg-brand" />
                </div>
            </div>
        </div>
    );
}

function Preview({ value }: { value: ThemePreference }) {
    if (value !== 'system') return <Mini theme={value} />;
    return (
        <div aria-hidden className="relative h-full w-full">
            <div className="absolute inset-0"><Mini theme="light" /></div>
            <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"><Mini theme="dark" /></div>
        </div>
    );
}

/** Appearance (DESIGN 5.14): Light, Dark or System, applied at once and remembered on this device. */
export function AppearanceTab() {
    const [pref, setPref] = useThemePreference();

    return (
        <SettingsSection title="Theme" description="Applies to the app on this device. The marketing site is always light.">
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {OPTIONS.map((o) => {
                    const selected = pref === o.value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setPref(o.value)}
                            className={cn(
                                'group flex flex-col gap-3 rounded-card border bg-surface p-2.5 text-left transition-colors duration-120',
                                selected ? 'border-brand ring-1 ring-brand' : 'border-border hover:border-border-strong',
                            )}
                        >
                            <span className="block aspect-[16/10] overflow-hidden rounded-control border border-border-subtle">
                                <Preview value={o.value} />
                            </span>
                            <span className="flex items-start justify-between gap-2 px-0.5 pb-0.5">
                                <span className="min-w-0">
                                    <span className="block text-body font-medium text-fg">{o.label}</span>
                                    <span className="block text-meta text-fg-muted">{o.description}</span>
                                </span>
                                {selected ? <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-brand-text" /> : null}
                            </span>
                        </button>
                    );
                })}
            </div>
        </SettingsSection>
    );
}
