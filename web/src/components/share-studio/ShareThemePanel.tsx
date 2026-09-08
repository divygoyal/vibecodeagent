'use client';

import Link from 'next/link';
import { Check, Sparkles, Lock } from 'lucide-react';
import {
  DEFAULT_SHARE_ACCENT,
  type NormalizedShareConfig,
  type ShareThemePreset,
} from '@/lib/shareTypes';
import { useCredits } from '@/lib/useDashboardData';
import { BRAND_NAME } from '@/lib/brand';

// Plans allowed to hide the `Built with ${BRAND_NAME}` footer on a shared
// dashboard. Free and grandfathered Starter tiers always show it; this is
// part of the Growth/Pro value prop and a soft growth lever.
const WATERMARK_REMOVAL_PLANS = new Set(['growth', 'pro']);

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
  const { plan } = useCredits();
  const canRemoveWatermark = WATERMARK_REMOVAL_PLANS.has((plan || '').toLowerCase());
  // Default is true (footer visible). When the user is on Growth/Pro and
  // flips the toggle off, save persists `showWatermark: false` and the
  // public view drops the `Built with ${BRAND_NAME}` link.
  const watermarkEnabled = draft.branding?.showWatermark ?? true;

  function applyPreset(p: typeof PRESETS[number]) {
    onChange({ ...draft, theme: { ...draft.theme, accentColor: p.color, preset: p.id } });
  }

  function applyCustom(value: string) {
    onChange({ ...draft, theme: { ...draft.theme, accentColor: value, preset: 'custom' } });
  }

  function toggleWatermark() {
    if (!canRemoveWatermark) return;
    onChange({
      ...draft,
      branding: {
        ...draft.branding,
        showWatermark: !watermarkEnabled,
      },
    });
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
          Drives the main chart line, KPI sparkline bars, and the &quot;live now&quot; pill on the public view.
        </p>
      </div>

      {/* ── Branding / Watermark ──
         Removing the `Built with ${BRAND_NAME}` footer is gated to paid plans.
         Free + Starter see the toggle in locked/highlighted form with an
         inline upgrade CTA — this surface is one of the highest-converting
         spots in the app because the desire is concrete and immediate. */}
      <div className="px-1">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">Branding</p>
        <div className={`rounded-xl border ${canRemoveWatermark ? 'border-white/[0.08] bg-white/[0.02]' : 'border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.10] via-cyan-500/[0.06] to-transparent shadow-[0_0_28px_rgba(20,196,225,0.10)]'} p-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-white">Remove TrafficClaw watermark</span>
                {!canRemoveWatermark && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/[0.14] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                    <Sparkles className="h-2.5 w-2.5" />
                    Growth+
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-white/40">
                Hide the &quot;Built with {BRAND_NAME}&quot; link in the footer of your public share view. Your dashboard, your brand.
              </p>
              {!canRemoveWatermark && (
                <Link
                  href="/dashboard/plan"
                  className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-300 transition hover:text-emerald-200"
                >
                  Upgrade to Growth →
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={toggleWatermark}
              disabled={!canRemoveWatermark}
              aria-pressed={!watermarkEnabled}
              aria-label={canRemoveWatermark ? `Toggle ${BRAND_NAME} watermark` : 'Watermark removal requires Growth or Pro plan'}
              title={canRemoveWatermark ? '' : 'Available on Growth and Pro plans'}
              className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
                !canRemoveWatermark
                  ? 'cursor-not-allowed bg-white/[0.06]'
                  : !watermarkEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-white/[0.14] hover:bg-white/[0.20]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  !canRemoveWatermark
                    ? 'translate-x-1 opacity-50'
                    : !watermarkEnabled
                      ? 'translate-x-6'
                      : 'translate-x-1'
                }`}
              />
              {!canRemoveWatermark && (
                <Lock className="pointer-events-none absolute right-1 h-2.5 w-2.5 text-white/40" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
