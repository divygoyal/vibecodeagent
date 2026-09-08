'use client';

/**
 * Repeatable editor for the things a publisher sells on one site.
 *
 * The publisher types the price. This component renders a text box and hands
 * the characters to `parsePriceToCents` unchanged — there is no suggested
 * amount, no placeholder amount, and nothing on this screen reads the site's
 * traffic. Verified GA4 numbers live elsewhere on the page as context.
 *
 * Purely presentational: drafts come in, edited drafts go out. The parent owns
 * loading, saving and messaging.
 */

import { Plus, Trash2, ChevronDown, Megaphone } from 'lucide-react';
import {
    BILLING_PERIODS,
    emptySlotDraft,
    formatAvailability,
    type AdSlotDraft,
    type BillingPeriod,
} from '@/lib/adSlots';

const MAX_SLOTS = 20;

const INPUT_CLASS =
    'w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-zinc-400';

export default function AdSlotsEditor({
    drafts,
    onChange,
    disabled,
}: {
    drafts: AdSlotDraft[];
    onChange: (next: AdSlotDraft[]) => void;
    disabled?: boolean;
}) {
    function updateRow(key: string, patch: Partial<AdSlotDraft>) {
        onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    }

    function removeRow(key: string) {
        onChange(drafts.filter((d) => d.key !== key));
    }

    function addRow() {
        if (drafts.length >= MAX_SLOTS) return;
        onChange([...drafts, emptySlotDraft()]);
    }

    return (
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Megaphone className="h-3.5 w-3.5 text-emerald-400" />
                        Ad slots you&apos;re selling
                    </h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                        Optional. Name each placement in your own words and set your own price — we never
                        change it or suggest one. Leave this empty to list the site without selling anything.
                    </p>
                </div>
                {drafts.length > 0 && (
                    <button
                        type="button"
                        onClick={addRow}
                        disabled={disabled || drafts.length >= MAX_SLOTS}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add slot
                    </button>
                )}
            </div>

            {drafts.length === 0 ? (
                <button
                    type="button"
                    onClick={addRow}
                    disabled={disabled}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] bg-black/20 px-3 py-2 text-[11px] font-medium text-zinc-400 transition hover:border-emerald-500/25 hover:text-emerald-300 disabled:opacity-50"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add an ad slot
                </button>
            ) : (
                <div className="mt-3 space-y-3">
                    {drafts.map((draft, index) => (
                        <SlotRow
                            key={draft.key}
                            draft={draft}
                            index={index}
                            disabled={disabled}
                            onPatch={(patch) => updateRow(draft.key, patch)}
                            onRemove={() => removeRow(draft.key)}
                        />
                    ))}
                    {drafts.length >= MAX_SLOTS && (
                        <p className="text-[10px] text-zinc-500">
                            That&apos;s the maximum of {MAX_SLOTS} slots for one site.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function SlotRow({
    draft,
    index,
    disabled,
    onPatch,
    onRemove,
}: {
    draft: AdSlotDraft;
    index: number;
    disabled?: boolean;
    onPatch: (patch: Partial<AdSlotDraft>) => void;
    onRemove: () => void;
}) {
    // Display-only availability line, straight from the two counts the
    // publisher typed.
    const total = Math.max(parseInt(draft.quantity_total || '0', 10) || 0, 0);
    const taken = Math.max(parseInt(draft.quantity_taken || '0', 10) || 0, 0);
    const availability = formatAvailability({
        quantity_total: total,
        quantity_open: Math.max(total - taken, 0),
    });

    return (
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Slot {index + 1}
                    </span>
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-400">
                        {availability}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onPatch({ is_active: !draft.is_active })}
                        disabled={disabled}
                        aria-pressed={draft.is_active}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            draft.is_active
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : 'border-white/[0.06] bg-black/20 text-zinc-500 hover:border-white/[0.1]'
                        }`}
                    >
                        {draft.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        disabled={disabled}
                        aria-label={`Remove slot ${index + 1}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/15 bg-red-500/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/[0.12] disabled:opacity-50"
                    >
                        <Trash2 className="h-3 w-3" />
                        Remove
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                <div>
                    <label className={LABEL_CLASS}>What are you selling? *</label>
                    <input
                        type="text"
                        value={draft.name}
                        onChange={(e) => onPatch({ name: e.target.value })}
                        placeholder="Header banner"
                        maxLength={120}
                        disabled={disabled}
                        className={INPUT_CLASS}
                    />
                </div>
                <div>
                    <label className={LABEL_CLASS}>Your price *</label>
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                            $
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={draft.priceInput}
                            onChange={(e) => onPatch({ priceInput: e.target.value })}
                            placeholder="Amount"
                            disabled={disabled}
                            aria-label="Your price"
                            className={`${INPUT_CLASS} pl-7`}
                        />
                    </div>
                </div>
                <div>
                    <label className={LABEL_CLASS}>Billed</label>
                    <div className="relative">
                        <select
                            value={draft.billing_period}
                            onChange={(e) => onPatch({ billing_period: e.target.value as BillingPeriod })}
                            disabled={disabled}
                            className="w-full appearance-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                        >
                            {BILLING_PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                    <label className={LABEL_CLASS}>How many exist</label>
                    <input
                        type="number"
                        min={1}
                        max={999}
                        value={draft.quantity_total}
                        onChange={(e) => onPatch({ quantity_total: e.target.value })}
                        disabled={disabled}
                        className={INPUT_CLASS}
                    />
                </div>
                <div>
                    <label className={LABEL_CLASS}>How many are taken</label>
                    <input
                        type="number"
                        min={0}
                        max={999}
                        value={draft.quantity_taken}
                        onChange={(e) => onPatch({ quantity_taken: e.target.value })}
                        disabled={disabled}
                        className={INPUT_CLASS}
                    />
                </div>
            </div>

            <div className="mt-3">
                <label className={LABEL_CLASS}>Preview image URL (optional)</label>
                <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={draft.preview_image_url}
                    onChange={(e) => onPatch({ preview_image_url: e.target.value })}
                    placeholder="https://example.com/screenshot.png"
                    disabled={disabled}
                    className={INPUT_CLASS}
                />
            </div>

            <div className="mt-3">
                <label className={LABEL_CLASS}>Where it sits / what the buyer gets (optional)</label>
                <textarea
                    value={draft.preview_note}
                    onChange={(e) => onPatch({ preview_note: e.target.value })}
                    placeholder="Top of every page, above the nav."
                    rows={2}
                    maxLength={500}
                    disabled={disabled}
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                />
            </div>
        </div>
    );
}
