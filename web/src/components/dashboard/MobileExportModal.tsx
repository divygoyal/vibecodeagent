'use client';

import { useState } from 'react';
import { FileDown, Loader2, Calendar, X } from 'lucide-react';
import { toast } from 'sonner';

interface MobileExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    siteUrl: string | null | undefined;
    propertyId: string | null | undefined;
}

type Period = 'weekly' | 'monthly';

/**
 * MobileExportModal — full-screen mobile sheet for generating a
 * weekly/monthly PDF report via /api/report/user-generate.
 *
 * The endpoint takes 30–60 s end-to-end (data fetch → analysis → Gemini
 * synthesis → PDF render), so we surface a non-dismissible loader during
 * the request. Result is downloaded as a blob; errors come back as a toast.
 */
export default function MobileExportModal({
    isOpen,
    onClose,
    siteUrl,
    propertyId,
}: MobileExportModalProps) {
    const [period, setPeriod] = useState<Period>('weekly');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const canGenerate = Boolean(siteUrl) && !loading;

    const handleGenerate = async () => {
        if (!siteUrl) {
            toast.error('Connect a Search Console site to generate reports');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/report/user-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period, siteUrl, propertyId: propertyId || undefined }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Report generation failed (${res.status})`);
            }

            const blob = await res.blob();
            const filenameHeader = res.headers.get('Content-Disposition') || '';
            const match = filenameHeader.match(/filename="?([^"]+)"?/);
            const filename = match?.[1] || `TrafficClaw_${period}_report.pdf`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`${period === 'weekly' ? 'Weekly' : 'Monthly'} report downloaded`);
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Report generation failed';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Backdrop — non-dismissible during generation so the user
                doesn't accidentally cancel a 30–60 s request. */}
            <div
                className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
                onClick={loading ? undefined : onClose}
                aria-hidden="true"
            />
            {/* Sheet */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-modal-title"
                className="fixed inset-x-0 bottom-0 z-[61] rounded-t-3xl border-t border-white/[0.08] bg-[#0a0d12] shadow-[0_-30px_70px_rgba(0,0,0,0.55)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[420px] sm:rounded-3xl sm:border"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {/* Drag handle (mobile only) */}
                <div className="flex justify-center pt-3 sm:hidden">
                    <div className="h-1 w-10 rounded-full bg-white/[0.12]" />
                </div>

                <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <FileDown className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                            <h2 id="export-modal-title" className="text-base font-semibold text-white leading-tight">
                                Export PDF report
                            </h2>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                Generated from your live GA4 + GSC data
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Close"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="px-5 pb-5 pt-5 space-y-4">
                    {/* Period selector */}
                    <div>
                        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2 block">
                            Period
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['weekly', 'monthly'] as const).map((option) => {
                                const active = period === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setPeriod(option)}
                                        disabled={loading}
                                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 min-h-[48px] text-sm font-semibold transition-colors ${
                                            active
                                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                                : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <Calendar className="h-3.5 w-3.5" />
                                        {option === 'weekly' ? 'Last 7 days' : 'Last 30 days'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Site context hint */}
                    {siteUrl ? (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11.5px] text-zinc-400">
                            Reporting on{' '}
                            <span className="font-semibold text-zinc-200">
                                {siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </span>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-[11.5px] text-amber-200">
                            Connect a Search Console site to generate reports.
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3.5 min-h-[52px] text-sm font-semibold text-[#031014] shadow-[0_8px_24px_rgba(34,211,238,0.22)] transition-all enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generating report…
                            </>
                        ) : (
                            <>
                                <FileDown className="h-4 w-4" />
                                Generate {period === 'weekly' ? 'weekly' : 'monthly'} report
                            </>
                        )}
                    </button>

                    {loading && (
                        <p className="text-center text-[11px] text-zinc-500">
                            This usually takes 30–60 seconds. Don't close the app.
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
