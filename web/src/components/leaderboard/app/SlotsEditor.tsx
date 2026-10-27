'use client';

/**
 * Ad slots a publisher sells on one site (restyled on the new tokens).
 *
 * The publisher types the price. There is no suggested amount and nothing here reads
 * the site's traffic: the text goes through parsePriceToCents unchanged.
 */
import { useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/Toaster';
import {
    BILLING_PERIODS, draftsToPayload, emptySlotDraft, formatAvailability, slotToDraft,
    type AdSlot, type AdSlotDraft, type BillingPeriod,
} from '@/lib/adSlots';
import type { PublicSlot } from '@/lib/leaderboard/types';

const MAX_SLOTS = 20;
const FIELD = 'tc-control w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint transition-[border-color,box-shadow] duration-120 hover:border-border-strong focus:border-focus focus:ring-2 focus:ring-focus/25 focus:outline-none disabled:opacity-50';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={cn('block', className)}>
            <span className="mb-1 block text-body-sm font-medium text-fg-secondary">{label}</span>
            {children}
        </label>
    );
}

export function SlotsEditor({ entryId, initial, onSaved }: { entryId: number; initial: PublicSlot[]; onSaved: () => void }) {
    const [drafts, setDrafts] = useState<AdSlotDraft[]>(() => initial.map((s) => slotToDraft(s as unknown as AdSlot)));
    const [saving, setSaving] = useState(false);
    const [hadSaved, setHadSaved] = useState(initial.length > 0);

    const patch = (key: string, p: Partial<AdSlotDraft>) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...p } : x)));

    async function save() {
        const payload = draftsToPayload(drafts);
        if (!payload.ok) { toast.error(payload.error); return; }
        if (payload.slots.length === 0 && !hadSaved) { toast.message('Add a slot first.'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/ad-slots', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry_id: entryId, slots: payload.slots }) });
            const data = (await res.json().catch(() => ({}))) as { error?: string; slots?: AdSlot[] };
            if (!res.ok) throw new Error(data.error || 'Could not save ad slots.');
            setDrafts((data.slots ?? []).map(slotToDraft));
            setHadSaved((data.slots ?? []).length > 0);
            toast.success('Ad slots saved');
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save ad slots.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader
                title="Ad slots you sell"
                description="Optional. Name each placement in your own words and set your own price. We never change it or suggest one."
                actions={drafts.length > 0 ? <Button size="sm" variant="secondary" icon={Plus} disabled={drafts.length >= MAX_SLOTS} onClick={() => setDrafts((d) => [...d, emptySlotDraft()])}>Add slot</Button> : null}
            />
            {drafts.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-control border border-dashed border-border bg-surface-sunken p-5">
                    <Megaphone aria-hidden size={18} className="text-fg-muted" />
                    <p className="text-body text-fg-secondary">Sponsors find your slots on your profile and on the Advertise page. Requests land in your Offers inbox.</p>
                    <Button variant="secondary" icon={Plus} onClick={() => setDrafts([emptySlotDraft()])}>Add an ad slot</Button>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {drafts.map((d, i) => {
                        const total = Math.max(parseInt(d.quantity_total || '0', 10) || 0, 0);
                        const taken = Math.max(parseInt(d.quantity_taken || '0', 10) || 0, 0);
                        return (
                            <div key={d.key} className="rounded-control border border-border-subtle bg-surface-sunken p-3.5">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-caption tracking-[0.04em] text-fg-muted uppercase">Slot {i + 1}</span>
                                        <Badge variant="neutral">{formatAvailability({ quantity_total: total, quantity_open: Math.max(total - taken, 0) })}</Badge>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch size="sm" checked={d.is_active} onCheckedChange={(v) => patch(d.key, { is_active: v })} label={d.is_active ? 'On sale' : 'Paused'} />
                                        <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Remove slot ${i + 1}`} onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}>Remove</Button>
                                    </div>
                                </div>
                                <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                                    <Field label="What are you selling?"><input className={cn(FIELD, 'h-9')} value={d.name} maxLength={120} placeholder="Header banner" onChange={(e) => patch(d.key, { name: e.target.value })} /></Field>
                                    <Field label="Your price (USD)">
                                        <div className="relative">
                                            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-fg-muted">$</span>
                                            <input className={cn(FIELD, 'h-9 pl-7')} inputMode="decimal" value={d.priceInput} placeholder="Amount" aria-label="Your price" onChange={(e) => patch(d.key, { priceInput: e.target.value })} />
                                        </div>
                                    </Field>
                                    <Field label="Billed">
                                        <select className={cn(FIELD, 'h-9')} value={d.billing_period} onChange={(e) => patch(d.key, { billing_period: e.target.value as BillingPeriod })}>
                                            {BILLING_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2">
                                    <Field label="How many exist"><input type="number" min={1} max={999} className={cn(FIELD, 'h-9')} value={d.quantity_total} onChange={(e) => patch(d.key, { quantity_total: e.target.value })} /></Field>
                                    <Field label="How many are taken"><input type="number" min={0} max={999} className={cn(FIELD, 'h-9')} value={d.quantity_taken} onChange={(e) => patch(d.key, { quantity_taken: e.target.value })} /></Field>
                                </div>
                                <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2">
                                    <Field label="Where it appears (optional)"><input className={cn(FIELD, 'h-9')} value={d.preview_note} maxLength={500} placeholder="Top of every blog post, 728x90" onChange={(e) => patch(d.key, { preview_note: e.target.value })} /></Field>
                                    <Field label="Preview image URL (optional)"><input className={cn(FIELD, 'h-9')} inputMode="url" autoCapitalize="none" spellCheck={false} value={d.preview_image_url} placeholder="https://example.com/screenshot.png" onChange={(e) => patch(d.key, { preview_image_url: e.target.value })} /></Field>
                                </div>
                            </div>
                        );
                    })}
                    <div className="flex justify-end"><Button variant="primary" loading={saving} onClick={save}>Save ad slots</Button></div>
                </div>
            )}
        </Card>
    );
}
