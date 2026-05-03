'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Crown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { NormalizedShareConfig } from '@/lib/shareTypes';

interface Props {
  token: string;
  draft: NormalizedShareConfig;
  onChange: (next: NormalizedShareConfig) => void;
  userPlan: string | null;
}

export default function ShareBrandingPanel({ token, draft, onChange, userPlan }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const canRemoveWatermark = userPlan === 'pro' || userPlan === 'growth' || userPlan === 'starter';
  const branding = draft.branding;

  const setBranding = useCallback(
    (patch: Partial<NormalizedShareConfig['branding']>) => {
      onChange({ ...draft, branding: { ...branding, ...patch } });
    },
    [branding, draft, onChange],
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/share/${token}/logo`, { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Upload failed');
        setBranding({ logoUrl: data.logoUrl });
        toast.success('Logo uploaded');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [token, setBranding],
  );

  const handleClear = useCallback(async () => {
    try {
      await fetch(`/api/share/${token}/logo`, { method: 'DELETE' });
    } catch {
      // best-effort delete; we still clear the URL locally
    }
    setBranding({ logoUrl: null });
    toast.success('Logo removed');
  }, [token, setBranding]);

  return (
    <div className="space-y-5">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-white/50">Branding</h3>

      <div className="px-1">
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-white/40">Logo</label>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/5">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="Logo preview" className="h-full w-full object-contain" />
            ) : (
              <Upload className="h-4 w-4 text-white/20" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
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
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--db-primary,#14C4E1)]/30 bg-[var(--db-primary,#14C4E1)]/15 px-2.5 py-1.5 text-xs text-[var(--db-primary,#14C4E1)] transition-colors hover:bg-[var(--db-primary,#14C4E1)]/25 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? 'Uploading…' : branding.logoUrl ? 'Replace' : 'Upload logo'}
            </button>
            {branding.logoUrl && (
              <button
                type="button"
                onClick={handleClear}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/40 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-2.5 w-2.5" />
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-white/30">
          PNG, JPG, SVG, or WebP up to 1 MB. Replaces the TrafficClaw logo on the public view header.
        </p>
      </div>

      <div className="px-1">
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-white/40">Company name</label>
        <input
          type="text"
          value={branding.companyName ?? ''}
          onChange={(e) => setBranding({ companyName: e.target.value || null })}
          placeholder="Shared analytics"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white placeholder:text-white/20 outline-none transition-colors focus:border-[var(--db-primary,#14C4E1)]/50"
        />
        <p className="mt-1 text-[9px] leading-relaxed text-white/30">
          Replaces the &quot;Shared analytics&quot; chip text in the public header.
        </p>
      </div>

      <div className="px-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/60">
                TrafficClaw watermark
              </span>
              {!canRemoveWatermark && <Lock className="h-2.5 w-2.5 text-amber-400/60" />}
            </div>
            <p className="text-[9px] leading-relaxed text-white/30">
              {canRemoveWatermark
                ? 'Toggle the "Built with TrafficClaw" footer on or off.'
                : 'Upgrade to remove the "Built with TrafficClaw" footer.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!canRemoveWatermark && branding.showWatermark) {
                toast.message('Upgrade to remove the watermark.', {
                  action: { label: 'Upgrade', onClick: () => { window.location.href = '/dashboard/plan'; } },
                });
                return;
              }
              setBranding({ showWatermark: !branding.showWatermark });
            }}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
              branding.showWatermark ? 'bg-[var(--db-primary,#14C4E1)]' : 'bg-white/15'
            }`}
            aria-label="Toggle TrafficClaw watermark"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                branding.showWatermark ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {!canRemoveWatermark && (
          <a
            href="/dashboard/plan"
            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/[0.15] bg-gradient-to-r from-violet-500/[0.08] to-purple-500/[0.08] px-2.5 py-1.5 text-[10px] text-violet-300 transition-colors hover:border-violet-500/[0.3]"
          >
            <Crown className="h-2.5 w-2.5" />
            View upgrade options
          </a>
        )}
      </div>
    </div>
  );
}
