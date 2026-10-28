'use client';

/**
 * Schedule email (round 9, Looker Studio "Schedule email delivery" parity): recipients (max 10),
 * how often, the time in the owner's time zone, which pages, the date range, an optional note, a
 * test send to the owner, and a plain statement of what is and is not in the email.
 * The server does the rest (app/api/dashboards/[id]/email-schedule, cron/dashboard-email).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Banner, Button, Checkbox, Modal, SegmentedControl, Select, Switch } from '@/components/ui';
import { presetLabel } from '@/lib/builder/dates';
import { dateControlOf } from '@/lib/builder/publicDoc';
import { MAX_MESSAGE, MAX_RECIPIENTS, WEEKDAYS, normalizeEmail, ordinal, type EmailScheduleConfig, type Frequency, type RangeChoice } from '@/lib/builder/email/schedule';
import type { DashboardDocV2 } from '@/lib/builder/types';
import { fetchJson } from './useWidgetData';

type RecipientView = 'owner' | 'confirmed' | 'pending' | 'declined' | 'unsubscribed' | 'not_asked';

interface ScheduleResponse {
    config: EmailScheduleConfig | null;
    ownerEmail: string | null;
    recipients: Record<string, RecipientView>;
    last: { at?: string; ok?: boolean; sent?: number; error?: string } | null;
    next: string | null;
    shared: boolean;
    mock: boolean;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dashboardId: string;
    doc: DashboardDocV2;
    /** Whether the dashboard has a public link (the email's "View dashboard" button points to it). */
    shared: boolean;
}

const input = 'h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg';

const STATUS: Record<RecipientView, { text: string; tone: string } | null> = {
    owner: null,
    confirmed: { text: 'Confirmed', tone: 'text-up' },
    pending: { text: 'Waiting for confirmation', tone: 'text-fg-muted' },
    declined: { text: 'Said no', tone: 'text-down' },
    unsubscribed: { text: 'Unsubscribed', tone: 'text-down' },
    not_asked: { text: 'Will be asked to confirm', tone: 'text-fg-muted' },
};

export function browserTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

function zones(): string[] {
    try {
        const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
        return list.includes('UTC') ? list : ['UTC', ...list];
    } catch {
        return ['UTC'];
    }
}

function fmtNext(iso: string | null, tz: string): string {
    if (!iso) return '';
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function EmailScheduleDialog({ open, onOpenChange, dashboardId, doc, shared }: Props) {
    const base = `/api/dashboards/${dashboardId}/email-schedule`;
    const pages = useMemo(() => doc.pages.filter((p) => !p.hidden), [doc.pages]);
    const tzList = useMemo(zones, []);

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState<'' | 'save' | 'test' | 'remove'>('');
    const [info, setInfo] = useState<ScheduleResponse | null>(null);
    const [saved, setSaved] = useState(false);

    const [enabled, setEnabled] = useState(true);
    const [recipients, setRecipients] = useState<string[]>([]);
    const [draft, setDraft] = useState('');
    const [draftError, setDraftError] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('weekly');
    const [weekday, setWeekday] = useState(1);
    const [monthDay, setMonthDay] = useState(1);
    const [time, setTime] = useState('08:00');
    const [timezone, setTimezone] = useState(browserTimeZone());
    const [pickedPages, setPickedPages] = useState<string[] | 'all'>('all');
    const [range, setRange] = useState<RangeChoice>('default');
    const [message, setMessage] = useState('');

    const apply = useCallback((r: ScheduleResponse) => {
        setInfo(r);
        const c = r.config;
        setSaved(Boolean(c));
        if (c) {
            setEnabled(c.enabled);
            setRecipients(c.recipients);
            setFrequency(c.frequency); setWeekday(c.weekday); setMonthDay(c.monthDay);
            setTime(c.time); setTimezone(c.timezone);
            setPickedPages(c.pages === 'all' ? 'all' : c.pages.filter((id) => pages.some((p) => p.id === id)));
            setRange(c.range); setMessage(c.message);
        } else {
            setEnabled(true);
            setRecipients(r.ownerEmail ? [r.ownerEmail.toLowerCase()] : []);
            setTimezone(browserTimeZone());
        }
    }, [pages]);

    useEffect(() => {
        if (!open) return;
        let live = true;
        setLoading(true); setLoadError('');
        fetchJson<ScheduleResponse>(base)
            .then((r) => { if (live) apply(r); })
            .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the schedule'); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [open, base, apply]);

    const addDraft = (raw: string) => {
        const parts = raw.split(/[\s,;]+/).filter(Boolean);
        if (!parts.length) return;
        const next = [...recipients];
        for (const p of parts) {
            const e = normalizeEmail(p);
            if (!e) { setDraftError(`"${p.slice(0, 40)}" is not a valid email address.`); setDraft(p); setRecipients(next); return; }
            if (!next.includes(e)) {
                if (next.length >= MAX_RECIPIENTS) { setDraftError(`Up to ${MAX_RECIPIENTS} recipients.`); setRecipients(next); return; }
                next.push(e);
            }
        }
        setRecipients(next); setDraft(''); setDraftError('');
    };

    const body = (): Record<string, unknown> => ({ enabled, recipients, frequency, weekday, monthDay, time, timezone, pages: pickedPages, range, message });

    const save = async () => {
        if (draft.trim()) { addDraft(draft); if (normalizeEmail(draft.trim()) === null) return; }
        setBusy('save');
        try {
            const r = await fetchJson<{ config: EmailScheduleConfig; recipients: Record<string, RecipientView>; confirmations: Record<string, string>; next: string | null }>(base, { method: 'PUT', body: JSON.stringify(body()) });
            setInfo((i) => (i ? { ...i, config: r.config, recipients: r.recipients, next: r.next } : i));
            setSaved(true);
            const asked = Object.entries(r.confirmations).filter(([, o]) => o === 'sent').map(([e]) => e);
            const capped = Object.values(r.confirmations).filter((o) => o === 'capped').length;
            if (capped) toast.warning('Some confirmation emails were not sent', { description: 'Daily limit for confirmation emails reached. Save again tomorrow to ask the rest.' });
            toast.success(r.config.enabled ? 'Schedule saved' : 'Schedule paused', asked.length ? { description: `We asked ${asked.join(', ')} to confirm before sending them reports.` } : undefined);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save the schedule');
        } finally {
            setBusy('');
        }
    };

    const test = async () => {
        setBusy('test');
        try {
            const r = await fetchJson<{ ok: boolean; to: string; mock: boolean; file?: string }>(`${base}/test`, { method: 'POST', body: JSON.stringify({ config: body() }) });
            toast.success(r.mock ? 'Test email rendered (demo mode, nothing was sent)' : `Test email sent to ${r.to}`, r.mock ? { description: r.file } : undefined);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not send the test');
        } finally {
            setBusy('');
        }
    };

    const remove = async () => {
        setBusy('remove');
        try {
            await fetchJson(base, { method: 'DELETE' });
            setSaved(false);
            setInfo((i) => (i ? { ...i, config: null, next: null, recipients: {} } : i));
            setRecipients(info?.ownerEmail ? [info.ownerEmail.toLowerCase()] : []);
            toast.success('Schedule removed. No more emails will be sent.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not remove the schedule');
        } finally {
            setBusy('');
        }
    };

    const togglePage = (id: string, on: boolean) => {
        const cur = pickedPages === 'all' ? pages.map((p) => p.id) : pickedPages;
        const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
        setPickedPages(next.length === pages.length ? 'all' : next);
    };

    const defaultRange = presetLabel(dateControlOf(doc).default);
    const outside = recipients.filter((r) => r !== info?.ownerEmail?.toLowerCase());
    const noPages = pickedPages !== 'all' && pickedPages.length === 0;
    const canSave = !busy && !loading && !noPages && (recipients.length > 0 || draft.trim().length > 0 || !enabled);

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Schedule email"
            description={doc.name}
            size="lg"
            footer={(
                <>
                    {saved ? <Button variant="ghost" disabled={Boolean(busy)} onClick={remove}>Remove schedule</Button> : null}
                    <Button variant="secondary" icon={Send} disabled={Boolean(busy) || loading} onClick={test}>{busy === 'test' ? 'Sending…' : 'Send a test now'}</Button>
                    <Button variant="primary" disabled={!canSave} onClick={save}>{busy === 'save' ? 'Saving…' : saved ? 'Save changes' : 'Save schedule'}</Button>
                </>
            )}
        >
            {loadError ? <Banner variant="danger">{loadError}</Banner> : null}
            <div className="space-y-5" aria-busy={loading}>
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} label="Send this dashboard by email" description="Free. Pause it any time; nothing is sent while it is off." />

                <div className="space-y-1.5">
                    <label htmlFor="email-sched-to" className="text-body-sm font-medium text-fg">Recipients <span className="font-normal text-fg-muted">({recipients.length} of {MAX_RECIPIENTS})</span></label>
                    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-control border border-border bg-surface px-2 py-1.5">
                        {recipients.map((e) => {
                            const st = STATUS[info?.recipients[e] ?? (e === info?.ownerEmail?.toLowerCase() ? 'owner' : 'not_asked')];
                            return (
                                <span key={e} className="inline-flex items-center gap-1 rounded-badge bg-subtle py-0.5 pl-2 pr-1 text-body-sm text-fg">
                                    {e}{st ? <span className={`text-meta ${st.tone}`}>· {st.text}</span> : <span className="text-meta text-fg-muted">· you</span>}
                                    <button type="button" aria-label={`Remove ${e}`} onClick={() => setRecipients(recipients.filter((x) => x !== e))} className="rounded p-0.5 text-fg-muted hover:text-fg"><X aria-hidden size={12} /></button>
                                </span>
                            );
                        })}
                        <input
                            id="email-sched-to"
                            value={draft}
                            onChange={(e) => { setDraft(e.target.value); setDraftError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addDraft(draft); } else if (e.key === 'Backspace' && !draft && recipients.length) setRecipients(recipients.slice(0, -1)); }}
                            onBlur={() => draft.trim() && addDraft(draft)}
                            onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); addDraft(t); } }}
                            placeholder={recipients.length ? 'Add another address' : 'name@example.com'}
                            type="email" inputMode="email" autoComplete="off" maxLength={254}
                            className="h-7 min-w-40 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
                        />
                    </div>
                    {draftError ? <p role="alert" className="text-meta text-down">{draftError}</p> : null}
                    <p className="text-meta text-fg-muted">{outside.length ? 'Anyone other than you gets one email asking them to confirm before they receive reports. Every report has an unsubscribe link.' : 'Add colleagues or clients. They confirm once by email before they receive reports; every report has an unsubscribe link.'}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                        <p className="text-body-sm font-medium text-fg">Repeat</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <SegmentedControl ariaLabel="Repeat" variant="neutral" size="sm" value={frequency} onChange={setFrequency} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
                            {frequency === 'weekly' ? <Select ariaLabel="Day of the week" size="sm" className="min-w-36" value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: `on ${d}` }))} /> : null}
                            {frequency === 'monthly' ? <Select ariaLabel="Day of the month" size="sm" className="min-w-36" value={String(monthDay)} onValueChange={(v) => setMonthDay(Number(v))} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: i === 30 ? 'on the 31st (or last day)' : `on the ${ordinal(i + 1)}` }))} /> : null}
                        </div>
                    </div>
                    <label className="block space-y-1.5"><span className="text-body-sm font-medium text-fg">Time</span>
                        <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} />
                    </label>
                    <label className="block space-y-1.5"><span className="text-body-sm font-medium text-fg">Time zone</span>
                        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={input} aria-label="Time zone">
                            {(tzList.includes(timezone) ? tzList : [timezone, ...tzList]).map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                        </select>
                    </label>
                </div>

                {pages.length > 1 ? (
                    <fieldset className="space-y-2">
                        <legend className="mb-1 text-body-sm font-medium text-fg">Pages to include</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <Checkbox checked={pickedPages === 'all'} onCheckedChange={(v) => setPickedPages(v ? 'all' : pages.slice(0, 1).map((p) => p.id))} label="All pages" />
                            {pickedPages !== 'all' ? pages.map((p) => <Checkbox key={p.id} checked={pickedPages.includes(p.id)} onCheckedChange={(v) => togglePage(p.id, v)} label={p.title} />) : null}
                        </div>
                        {noPages ? <p role="alert" className="text-meta text-down">Pick at least one page.</p> : <p className="text-meta text-fg-muted">The email shows the scorecards and charts of each page (up to 5 pages).</p>}
                    </fieldset>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <p className="text-body-sm font-medium text-fg">Date range</p>
                        <Select ariaLabel="Date range" className="w-full" value={range} onValueChange={(v) => setRange(v as RangeChoice)} options={[{ value: 'default', label: `Dashboard default (${defaultRange})` }, { value: '7d', label: 'Last 7 days' }, { value: '28d', label: 'Last 28 days' }]} />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-body-sm font-medium text-fg">&ldquo;View dashboard&rdquo; button</p>
                        <p className="text-body-sm text-fg-secondary">{shared ? 'Opens your public link.' : 'Opens the dashboard in the app (sign-in needed). Turn on the public link in Share to let recipients open it directly.'}</p>
                    </div>
                </div>

                <label className="block space-y-1.5"><span className="text-body-sm font-medium text-fg">Note <span className="font-normal text-fg-muted">(optional)</span></span>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))} rows={2} placeholder="A line shown above the numbers, e.g. what to look at this week" className="w-full rounded-control border border-border bg-surface p-3 text-body text-fg" />
                    <span className="block text-right text-meta text-fg-muted">{message.length}/{MAX_MESSAGE}</span>
                </label>

                <div className="space-y-1.5 rounded-card border border-border-subtle bg-surface-sunken p-3 text-body-sm text-fg-secondary">
                    <p className="flex items-center gap-1.5 font-medium text-fg"><Mail aria-hidden size={14} />What is in the email</p>
                    <p>Key numbers with their change and chart pictures of each page, plus a &ldquo;View dashboard&rdquo; button. There is no PDF attachment: PDF export runs in the browser, and email is sent from our server.</p>
                    {info?.next && enabled ? <p className="font-medium text-fg">Next email: {fmtNext(info.next, timezone)} ({timezone})</p> : null}
                    {info?.last ? <p className="text-meta text-fg-muted">{info.last.ok ? `Last sent ${info.last.sent ?? 0} email${info.last.sent === 1 ? '' : 's'}${info.last.at ? ` on ${new Date(info.last.at.endsWith('Z') ? info.last.at : `${info.last.at}Z`).toLocaleString()}` : ''}.` : `Last run did not send: ${info.last.error ?? 'unknown error'}.`}</p> : null}
                    {info?.mock ? <p className="text-meta text-fg-muted">Demo mode: emails are written to a folder and never sent.</p> : null}
                </div>
            </div>
        </Modal>
    );
}
