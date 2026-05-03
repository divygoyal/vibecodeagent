'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Trash2, Loader2, AlignLeft, AlignCenter, AlignRight, Crown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardBuilderStore } from '@/stores/dashboardBuilderStore';
import type { DashboardTheme } from '@/types/dashboard';

type LogoPosition = NonNullable<DashboardTheme['logoPosition']>;

const POSITION_OPTIONS: { value: LogoPosition; label: string; icon: typeof AlignLeft }[] = [
  { value: 'top-left', label: 'Left', icon: AlignLeft },
  { value: 'top-center', label: 'Center', icon: AlignCenter },
  { value: 'top-right', label: 'Right', icon: AlignRight },
];

interface Props {
  /** User's plan, used to gate the watermark removal toggle. */
  userPlan: string | null;
}

export default function BrandingPanel({ userPlan }: Props) {
  const dashboardId = useDashboardBuilderStore((s) => s.dashboardId);
  const theme = useDashboardBuilderStore((s) => s.theme);
  const updateTheme = useDashboardBuilderStore((s) => s.updateTheme);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const canRemoveWatermark = userPlan === 'pro' || userPlan === 'growth' || userPlan === 'starter';

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!dashboardId) {
        toast.error('Save the dashboard first before uploading a logo.');
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/dashboards/${dashboardId}/logo`, {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Upload failed');
        updateTheme({ logoUrl: data.logoUrl });
        toast.success('Logo uploaded');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        toast.error(message);
      } finally {
        setUploading(false);
      }
    },
    [dashboardId, updateTheme],
  );

  const handleClear = useCallback(async () => {
    if (!dashboardId) {
      updateTheme({ logoUrl: '' });
      return;
    }
    try {
      await fetch(`/api/dashboards/${dashboardId}/logo`, { method: 'DELETE' });
    } catch {
      // Even if remote delete fails we still clear the URL locally so the user can retry.
    }
    updateTheme({ logoUrl: '' });
    toast.success('Logo removed');
  }, [dashboardId, updateTheme]);

  return (
    <div className="space-y-5">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider px-1">
        Branding
      </h3>

      {/* Logo upload */}
      <div className="px-1">
        <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-2">
          Logo
        </label>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
            {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
            ) : (
              <Upload className="w-4 h-4 text-white/20" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--db-primary)]/15 hover:bg-[var(--db-primary)]/25 text-[var(--db-primary)] border border-[var(--db-primary)]/30 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Uploading…' : theme.logoUrl ? 'Replace' : 'Upload logo'}
            </button>
            {theme.logoUrl && (
              <button
                onClick={handleClear}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded-lg bg-white/[0.03] hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/[0.04] hover:border-red-500/20 transition-colors"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-[9px] text-white/30 mt-1.5 leading-relaxed">
          PNG, JPG, SVG or WebP, up to 1 MB. Saved with this dashboard&apos;s public view.
        </p>
      </div>

      {/* Logo position */}
      <div className="px-1">
        <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-2">
          Logo Position
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {POSITION_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = (theme.logoPosition ?? 'top-left') === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateTheme({ logoPosition: opt.value })}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border transition-all ${
                  active
                    ? 'bg-[var(--db-primary)]/15 border-[var(--db-primary)]/40 text-[var(--db-primary)]'
                    : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.12]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium uppercase tracking-wider">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Company name */}
      <div className="px-1">
        <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          Company Name
        </label>
        <input
          type="text"
          value={theme.companyName ?? ''}
          onChange={(e) => updateTheme({ companyName: e.target.value })}
          placeholder="Your Company"
          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white outline-none focus:border-[var(--db-primary)]/50 placeholder:text-white/20 transition-colors"
        />
        <p className="text-[9px] text-white/30 mt-1 leading-relaxed">
          Shown next to your logo on the public dashboard.
        </p>
      </div>

      {/* Watermark toggle (plan-gated) */}
      <div className="px-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">
                TrafficClaw Watermark
              </span>
              {!canRemoveWatermark && <Lock className="w-2.5 h-2.5 text-amber-400/60" />}
            </div>
            <p className="text-[9px] text-white/30 leading-relaxed">
              {canRemoveWatermark
                ? 'Toggle the “Built with TrafficClaw” footer on or off.'
                : 'Upgrade to remove the “Built with TrafficClaw” footer.'}
            </p>
          </div>
          <button
            onClick={() => {
              if (!canRemoveWatermark && theme.showTrafficClawBranding) {
                toast.message('Upgrade to remove the watermark.', {
                  action: {
                    label: 'Upgrade',
                    onClick: () => {
                      window.location.href = '/dashboard/plan';
                    },
                  },
                });
                return;
              }
              updateTheme({ showTrafficClawBranding: !theme.showTrafficClawBranding });
            }}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              theme.showTrafficClawBranding ? 'bg-[var(--db-primary)]' : 'bg-white/15'
            }`}
            aria-label="Toggle TrafficClaw watermark"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                theme.showTrafficClawBranding ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {!canRemoveWatermark && (
          <a
            href="/dashboard/plan"
            className="mt-2 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-violet-500/[0.08] to-purple-500/[0.08] border border-violet-500/[0.15] text-violet-300 hover:border-violet-500/[0.3] transition-colors"
          >
            <Crown className="w-2.5 h-2.5" />
            View upgrade options
          </a>
        )}
      </div>
    </div>
  );
}
