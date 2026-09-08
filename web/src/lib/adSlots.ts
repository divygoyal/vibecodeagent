/**
 * Shared types + display helpers for publisher-defined ad slots.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PUBLISHER SETS THE PRICE. This module contains no pricing logic.
 *
 * There is no suggested price, no recommended price, no CPM band, no category
 * base rate and no traffic/engagement multiplier here or anywhere else. The only
 * numeric operation in this file is a unit conversion between the string a
 * publisher typed into a text box ("50", "49.99") and the integer cents we
 * store, plus the reverse for display. Verified GA4 traffic is rendered beside
 * a slot as context and is never an input to its price.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Billing period options. Kept deliberately small and concrete. */
export type BillingPeriod = 'month' | 'week' | 'newsletter_send' | 'one_off';

export const BILLING_PERIODS: ReadonlyArray<{
    value: BillingPeriod;
    /** Label for the publisher's <select>. */
    label: string;
    /** Suffix rendered after a price, e.g. "$50 / month". */
    suffix: string;
}> = [
    { value: 'month', label: 'Per month', suffix: '/ month' },
    { value: 'week', label: 'Per week', suffix: '/ week' },
    { value: 'newsletter_send', label: 'Per newsletter send', suffix: 'per send' },
    { value: 'one_off', label: 'One-off', suffix: 'one-off' },
];

const BILLING_SUFFIX: Record<string, string> = BILLING_PERIODS.reduce(
    (acc, p) => ({ ...acc, [p.value]: p.suffix }),
    {} as Record<string, string>,
);

export function billingPeriodSuffix(period: string | null | undefined): string {
    return BILLING_SUFFIX[period || 'month'] || '/ month';
}

export function billingPeriodLabel(period: string | null | undefined): string {
    return BILLING_PERIODS.find((p) => p.value === period)?.label || 'Per month';
}

/** One thing a publisher is selling on one of their sites. */
export interface AdSlot {
    id: number;
    entry_id: number;
    /** Free text, publisher's own words — "Header banner", "Podcast read". */
    name: string;
    /** Exactly what the publisher typed, in integer cents. Never computed. */
    price_cents: number;
    billing_period: BillingPeriod | string;
    quantity_total: number;
    quantity_taken: number;
    /** Server-computed `total - taken`, for display only. */
    quantity_open: number;
    preview_image_url: string | null;
    preview_note: string | null;
    is_active: boolean;
    created_at?: string | null;
    updated_at?: string | null;
}

/** A slot row while the publisher is still editing it in the form. */
export interface AdSlotDraft {
    /** Present when editing a saved slot; absent for a brand-new row. */
    id?: number;
    /** Stable key for React while the row has no server id yet. */
    key: string;
    name: string;
    /** Raw text straight out of the price input, e.g. "50" or "49.99". */
    priceInput: string;
    billing_period: BillingPeriod;
    quantity_total: string;
    quantity_taken: string;
    preview_image_url: string;
    preview_note: string;
    is_active: boolean;
}

export type AdSlotRequestStatus = 'new' | 'accepted' | 'declined' | 'paid' | 'cancelled';

/** A buyer's request for one specific slot. */
export interface AdSlotRequestRecord {
    id: number;
    slot_id: number;
    entry_id: number;
    site_name?: string | null;
    buyer_name: string | null;
    buyer_email: string;
    message: string | null;
    /** Snapshot of the slot as advertised when the buyer hit send. */
    slot_name_at_request: string | null;
    price_cents_at_request: number;
    billing_period_at_request: string | null;
    status: AdSlotRequestStatus | string;
    publisher_note: string | null;
    paid_at: string | null;
    created_at: string | null;
    updated_at?: string | null;
}

export const REQUEST_STATUS_FLOW: ReadonlyArray<{
    value: AdSlotRequestStatus;
    label: string;
    /** Tailwind classes matching the existing dark palette. */
    className: string;
}> = [
    { value: 'new', label: 'New', className: 'border-[#14C4E1]/25 bg-[#14C4E1]/10 text-[#7AD9DA]' },
    { value: 'accepted', label: 'Accepted', className: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
    { value: 'paid', label: 'Paid', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
    { value: 'declined', label: 'Declined', className: 'border-white/[0.1] bg-white/[0.03] text-zinc-400' },
    { value: 'cancelled', label: 'Cancelled', className: 'border-white/[0.1] bg-white/[0.03] text-zinc-500' },
];

export function requestStatusMeta(status: string) {
    return REQUEST_STATUS_FLOW.find((s) => s.value === status) || REQUEST_STATUS_FLOW[0];
}

/**
 * Convert the publisher's typed amount into integer cents.
 *
 * Unit conversion only — "50" becomes 5000 because a dollar is 100 cents. No
 * price is invented, adjusted or suggested. Returns null when the text isn't a
 * usable amount so the caller can show a validation message instead of silently
 * storing a wrong number.
 */
export function parsePriceToCents(input: string): number | null {
    const cleaned = (input || '').trim().replace(/[$,\s]/g, '');
    if (!cleaned) return null;
    if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null;
    const amount = Number(cleaned);
    if (!Number.isFinite(amount) || amount < 0) return null;
    // 1_000_000 dollars is the ceiling the API also enforces.
    if (amount > 1_000_000) return null;
    return Math.round(amount * 100);
}

/** Inverse of parsePriceToCents, for prefilling the edit form. */
export function centsToPriceInput(cents: number | null | undefined): string {
    const value = Number(cents || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2);
}

/** "$50" / "$49.99". Display formatting of a stored amount, nothing more. */
export function formatCents(cents: number | null | undefined): string {
    const value = Number(cents || 0);
    if (!Number.isFinite(value) || value <= 0) return '$0';
    const dollars = value / 100;
    return value % 100 === 0
        ? `$${dollars.toLocaleString('en-US')}`
        : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "$50 / month" — the publisher's price plus their chosen period. */
export function formatSlotPrice(slot: Pick<AdSlot, 'price_cents' | 'billing_period'>): string {
    return `${formatCents(slot.price_cents)} ${billingPeriodSuffix(slot.billing_period)}`;
}

/** Human availability string: "2 of 3 open", "Sold out". */
export function formatAvailability(slot: Pick<AdSlot, 'quantity_total' | 'quantity_open'>): string {
    const total = Math.max(Number(slot.quantity_total || 0), 0);
    const open = Math.max(Number(slot.quantity_open || 0), 0);
    if (total === 0) return 'Unavailable';
    if (open === 0) return 'Sold out';
    if (open === total) return total === 1 ? '1 available' : `${total} available`;
    return `${open} of ${total} open`;
}

/** Build a fresh empty draft row for the publisher's editor. */
export function emptySlotDraft(): AdSlotDraft {
    return {
        key: `new-${Math.random().toString(36).slice(2, 10)}`,
        name: '',
        priceInput: '',
        billing_period: 'month',
        quantity_total: '1',
        quantity_taken: '0',
        preview_image_url: '',
        preview_note: '',
        is_active: true,
    };
}

/** Hydrate a saved slot into an editable draft row. */
export function slotToDraft(slot: AdSlot): AdSlotDraft {
    return {
        id: slot.id,
        key: `slot-${slot.id}`,
        name: slot.name || '',
        priceInput: centsToPriceInput(slot.price_cents),
        billing_period: (BILLING_PERIODS.find((p) => p.value === slot.billing_period)?.value) || 'month',
        quantity_total: String(Math.max(Number(slot.quantity_total || 1), 1)),
        quantity_taken: String(Math.max(Number(slot.quantity_taken || 0), 0)),
        preview_image_url: slot.preview_image_url || '',
        preview_note: slot.preview_note || '',
        is_active: slot.is_active !== false,
    };
}

/** Payload shape the sync endpoint expects for one slot. */
export interface AdSlotPayload {
    id?: number;
    name: string;
    price_cents: number;
    billing_period: BillingPeriod;
    quantity_total: number;
    quantity_taken: number;
    preview_image_url: string | null;
    preview_note: string | null;
    is_active: boolean;
}

/**
 * Validate + convert drafts for the API. Rows the publisher left completely
 * blank are dropped rather than reported as errors, so a stray empty row can
 * never block saving a listing.
 */
export function draftsToPayload(
    drafts: AdSlotDraft[],
): { ok: true; slots: AdSlotPayload[] } | { ok: false; error: string } {
    const slots: AdSlotPayload[] = [];
    for (const draft of drafts) {
        const name = draft.name.trim();
        const isBlankRow = !name && !draft.priceInput.trim() && !draft.preview_note.trim() && !draft.preview_image_url.trim();
        if (isBlankRow) continue;

        if (!name) return { ok: false, error: 'Give every ad slot a name (e.g. "Header banner").' };

        const price_cents = parsePriceToCents(draft.priceInput);
        if (price_cents === null) {
            return { ok: false, error: `Enter a price for "${name}" — just the amount, e.g. 50.` };
        }

        const total = Math.min(Math.max(parseInt(draft.quantity_total || '1', 10) || 1, 1), 999);
        const takenRaw = Math.max(parseInt(draft.quantity_taken || '0', 10) || 0, 0);
        if (takenRaw > total) {
            return { ok: false, error: `"${name}": taken (${takenRaw}) can't exceed how many exist (${total}).` };
        }

        slots.push({
            ...(draft.id ? { id: draft.id } : {}),
            name: name.slice(0, 120),
            price_cents,
            billing_period: draft.billing_period,
            quantity_total: total,
            quantity_taken: takenRaw,
            preview_image_url: draft.preview_image_url.trim() || null,
            preview_note: draft.preview_note.trim().slice(0, 500) || null,
            is_active: draft.is_active,
        });
    }
    return { ok: true, slots };
}
