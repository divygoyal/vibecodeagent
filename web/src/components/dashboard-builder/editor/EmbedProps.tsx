'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { EMBED_HEIGHT_MAX, EMBED_HEIGHT_MIN, embedHost, embedUrlProblem, fitEmbedHeight, normalizeEmbedConfig, selfHosts, type EmbedProbe } from '@/lib/builder/embed';
import type { EmbedWidget, WidgetDef } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { fetchJson } from '../useWidgetData';
import { Choice, Field, NumberInput, TextInput, Toggle } from './Fields';

/** The value after it stopped changing for `ms` (keeps the page check from firing on every keystroke). */
function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

/** Setup of a web embed widget (round 9). */
export function EmbedSetup({ widget, edit }: { widget: EmbedWidget; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    const apply = useEditorStore((s) => s.apply);
    const c = normalizeEmbedConfig(widget.config);
    const own = selfHosts(typeof window !== 'undefined' ? [window.location.hostname] : []);
    // The address is typed into a local draft and reaches the dashboard only when it is valid (or empty), so an
    // unfinished "http" never makes a save fail.
    const [draft, setDraft] = useState(c.url);
    const [committed, setCommitted] = useState(c.url);
    // Changed from outside (undo, paste): show it.
    if (c.url !== committed) {
        setCommitted(c.url);
        setDraft(c.url);
    }
    const problem = draft.trim() ? embedUrlProblem(draft, { selfHosts: own }) : null;
    const set = (patch: Partial<EmbedWidget['config']>, key?: string) => edit((w) => ({ ...w, config: { ...(w as EmbedWidget).config, ...patch } }) as WidgetDef, key);
    const onUrl = (v: string) => {
        setDraft(v);
        const t = v.trim();
        if (!t || !embedUrlProblem(t, { selfHosts: own })) {
            setCommitted(t);
            set({ url: t }, 'url');
        }
    };

    // Does the page allow being shown in a frame? (server reads its headers once an hour)
    const checked = useDebounced(!problem && c.url ? c.url : '', 600);
    const probe = useSWR<EmbedProbe>(checked ? ['embed-probe-editor', checked] : null, () => fetchJson<EmbedProbe>(`/api/dashboards/embed-check?${new URLSearchParams({ url: checked }).toString()}`), { revalidateOnFocus: false, dedupingInterval: 600_000, shouldRetryOnError: false });
    const verdict = checked && checked === c.url ? probe.data : undefined;

    const fixed = Boolean(c.heightPx);
    return (
        <>
            <Field label="Page address" hint={problem ?? 'Any https page. Pages that forbid framing show an "Open in a new tab" button instead.'}>
                <TextInput value={draft} placeholder="https://…" onChange={onUrl} />
            </Field>
            {c.url && !problem && checked === c.url ? (
                <p role="status" className="text-meta text-fg-muted" data-testid="embed-verdict">
                    {!verdict ? `Checking ${embedHost(c.url)}…`
                        : verdict.status === 'ok' ? `${embedHost(c.url)} allows being shown in a frame.`
                            : verdict.status === 'blocked' ? `${embedHost(c.url)} refuses to be framed (${verdict.reason}). Viewers get an "Open in a new tab" button.`
                                : `Could not check ${embedHost(c.url)}. It is tried when the dashboard opens.`}
                </p>
            ) : null}
            <Field label="Frame title" hint="Read aloud by screen readers.">
                <TextInput value={c.title} onChange={(v) => set({ title: v.slice(0, 200) || 'Embedded page' }, 'title')} />
            </Field>
            <Field label="Height" hint={fixed ? `The page is ${c.heightPx} px tall and the card resizes to fit.` : 'The page fills the card. Resize the card on the canvas, or set a height.'}>
                <Choice ariaLabel="Height" value={fixed ? 'fixed' : 'fill'} onChange={(v) => { if (v === 'fill') set({ heightPx: undefined }); else apply((d) => fitEmbedHeight(d, widget.id, 600), { announce: 'Card resized to 600 px' }); }} options={[{ value: 'fill', label: 'Fill the card' }, { value: 'fixed', label: 'Fixed height' }]} />
            </Field>
            {fixed ? (
                <Field label="Page height (px)">
                    <NumberInput value={c.heightPx!} min={EMBED_HEIGHT_MIN} max={EMBED_HEIGHT_MAX} onChange={(n) => apply((d) => fitEmbedHeight(d, widget.id, n), { coalesce: `${widget.id}:height` })} />
                </Field>
            ) : null}
            <Toggle label="Allow scrolling inside the frame" checked={c.scroll} onChange={(v) => set({ scroll: v })} />
            <Toggle
                label="Show on share links and embeds"
                description="Off by default. When on, visitors' browsers load this page, and its address is part of the shared dashboard."
                checked={Boolean(c.showOnPublic)}
                onChange={(v) => set({ showOnPublic: v ? true : undefined })}
            />
            <p className="rounded-control bg-surface-sunken p-3 text-meta text-fg-muted">The page runs in a sandbox: no access to this dashboard, no top-level navigation, no downloads and no referrer is sent.</p>
        </>
    );
}
