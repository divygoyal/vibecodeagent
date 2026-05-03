'use client';

import { Check } from 'lucide-react';
import {
  DEFAULT_SHARE_ACCENT,
  type NormalizedShareConfig,
  type ShareThemePreset,
} from '@/lib/shareTypes';

const PRESETS: { id: ShareThemePreset; label: string; color: string }[] = [
  { id: 'aurora', label: 'Aurora', color: DEFAULT_SHARE_ACCENT },
  { id: 'midnight', label: 'Midnight', color: '#7C3AED' },
  { id: 'solar', label: 'Solar', color: '#F59E0B' },
  { id: 'forest', label: 'Forest', color: '#10B981' },
  { id: 'rose', label: 'Rose', color: '#F43F5E' },
];

interface Props {
  draft: NormalizedShareConfig;
  onChange: (next: NormalizedShareConfig) => void;
}

export default function ShareThemePanel({ draft, onChange }: Props) {
  const accent = draft.theme.accentColor || DEFAULT_SHARE_ACCENT;
  const preset = draft.theme.preset;

  function applyPreset(p: typeof PRESETS[number]) {
    onChange({ ...draft, theme: { ...draft.theme, accentColor: p.color, preset: p.id } });
  }

  function applyCustom(value: string) {
    onChange({ ...draft, theme: { ...draft.theme, accentColor: value, preset: 'custom' } });
  }

  return (
    <div className="space-y-5">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-white/50">Theme</h3>

      <div className="space-y-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Accent presets</p>
        <div className="grid grid-cols-5 gap-1.5">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`relative flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition ${
                  active
                    ? 'border-white/30 bg-white/[0.06]'
                    : 'border-white/[0.06] hover:border-white/[0.18]'
                }`}
                title={p.label}
              >
                <span
                  className="h-5 w-5 rounded-full ring-1 ring-white/10"
                  style={{ backgroundColor: p.color, boxShadow: `0 0 18px ${p.color}55` }}
                />
                <span className="text-[9px] font-medium text-white/60">{p.label}</span>
                {active && (
                  <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-1">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">Custom accent</p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#14C4E1'}
            onChange={(e) => applyCustom(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-lg border border-white/[0.12] bg-transparent"
            aria-label="Pick a custom accent color"
          />
          <input
            type="text"
            value={accent}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) applyCustom(v);
            }}
            className="flex-1 rounded-lg border border-white/[0.1] bg-white/5 px-2.5 py-2 font-mono text-xs text-white outline-none focus:border-[var(--db-primary,#14C4E1)]/50"
            placeholder="#14C4E1"
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">
          Drives the main chart line, KPI deltas, and the &quot;live now&quot; pill on the public view.
        </p>
      </div>
    </div>
  );
}
