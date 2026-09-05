'use client';

import { Check } from 'lucide-react';
import type { ThemePreset, BorderRadius, DashboardTheme } from '@/types/dashboard';
import { THEME_PRESETS } from '@/lib/dashboardBuilder';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import { BRAND_NAME } from '@/lib/brand';

// ── Preset swatch ──

function PresetSwatch({ preset, active, onClick }: { preset: ThemePreset; active: boolean; onClick: () => void }) {
  const theme = THEME_PRESETS[preset];
  if (!theme) return null;

  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-[3/2] rounded-lg overflow-hidden border-2 transition-all ${
        active ? 'border-[var(--db-primary)] shadow-lg shadow-[var(--db-primary)]/10' : 'border-white/[0.06] hover:border-white/[0.12]'
      }`}
    >
      <div className="absolute inset-0" style={{ backgroundColor: theme.backgroundColor ?? '#09090b' }}>
        <div className="absolute top-2 left-2 right-2 h-3 rounded" style={{ backgroundColor: theme.cardBackground ?? '#18181b' }} />
        <div className="absolute top-7 left-2 w-[40%] h-5 rounded" style={{ backgroundColor: theme.cardBackground ?? '#18181b' }} />
        <div className="absolute top-7 right-2 w-[40%] h-5 rounded" style={{ backgroundColor: theme.cardBackground ?? '#18181b' }} />
        <div className="absolute bottom-3 left-2 w-3 h-1 rounded" style={{ backgroundColor: theme.primaryColor ?? '#10b981' }} />
        <div className="absolute bottom-3 left-7 w-3 h-1 rounded" style={{ backgroundColor: theme.accentColor ?? '#06b6d4' }} />
      </div>
      {active && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--db-primary)] flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}
      <span className="absolute bottom-1 left-1.5 text-[8px] font-medium" style={{ color: theme.textColor ?? '#fff' }}>
        {preset === 'custom' ? 'Custom' : preset.charAt(0).toUpperCase() + preset.slice(1)}
      </span>
    </button>
  );
}

// ── Color input ──

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded border border-white/10 cursor-pointer bg-transparent"
        />
        <span className="text-[10px] text-white/40 font-mono w-16">{value}</span>
      </div>
    </div>
  );
}

// ── Component ──

export default function ThemeCustomizer() {
  const { theme, applyPreset, updateTheme } = useDashboardBuilderStore();

  const presets: ThemePreset[] = ['default', 'light', 'midnight', 'ocean', 'forest'];

  const radiusOptions: { value: BorderRadius; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'full', label: 'Extra' },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-1">
        Theme
      </h3>

      {/* Preset grid */}
      <div>
        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2 px-1">
          Presets
        </p>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <PresetSwatch
              key={p}
              preset={p}
              active={theme.preset === p}
              onClick={() => applyPreset(p)}
            />
          ))}
        </div>
      </div>

      {/* Custom colors */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider px-1">
          Colors
        </p>
        <div className="space-y-2 px-1">
          <ColorInput
            label="Primary"
            value={theme.primaryColor || '#10b981'}
            onChange={(v) => updateTheme({ primaryColor: v })}
          />
          <ColorInput
            label="Accent"
            value={theme.accentColor || '#06b6d4'}
            onChange={(v) => updateTheme({ accentColor: v })}
          />
          <ColorInput
            label="Background"
            value={theme.backgroundColor || '#09090b'}
            onChange={(v) => updateTheme({ backgroundColor: v })}
          />
          <ColorInput
            label="Card BG"
            value={theme.cardBackground || '#18181b'}
            onChange={(v) => updateTheme({ cardBackground: v })}
          />
          <ColorInput
            label="Text"
            value={theme.textColor || '#ffffff'}
            onChange={(v) => updateTheme({ textColor: v })}
          />
        </div>
      </div>

      {/* Border radius */}
      <div>
        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2 px-1">
          Border Radius
        </p>
        <div className="flex gap-1 px-1">
          {radiusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateTheme({ borderRadius: opt.value })}
              className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                theme.borderRadius === opt.value
                  ? 'bg-[var(--db-primary)] text-white font-medium'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Branding */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider px-1">
          Branding
        </p>
        <div className="px-1 space-y-2">
          <div>
            <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={theme.companyName || ''}
              onChange={(e) => updateTheme({ companyName: e.target.value })}
              placeholder="Your Company"
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1">
              Logo URL
            </label>
            <input
              type="text"
              value={theme.logoUrl || ''}
              onChange={(e) => updateTheme({ logoUrl: e.target.value })}
              placeholder="https://..."
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20 transition-colors"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
              Show {BRAND_NAME} Badge
            </label>
            <button
              onClick={() => updateTheme({ showTrafficClawBranding: !theme.showTrafficClawBranding })}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                theme.showTrafficClawBranding ? 'bg-[var(--db-primary)]' : 'bg-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  theme.showTrafficClawBranding ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
