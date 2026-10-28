'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Globe, RotateCw, ShieldOff, WifiOff } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import {
    EMBED_LOAD_TIMEOUT_MS, EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedDisclosure, embedFailureMessage, embedHost, embedUrlProblem, normalizeEmbedConfig, normalizeEmbedUrl, probeFailure, selfHosts,
    type EmbedFailure,
} from '@/lib/builder/embed';
import type { EmbedWidget } from '@/lib/builder/types';
import { useEmbedProbe } from '../useEmbedProbe';
import { WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { BRAND_NAME } from '@/lib/brand';

function Notice({ icon: Icon, title, text, action }: { icon: typeof Globe; title: string; text?: string; action?: React.ReactNode }) {
    return (
        <div role="status" className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-sunken px-4 py-4 text-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-subtle text-fg-muted"><Icon aria-hidden size={16} strokeWidth={1.75} /></span>
            <p className="text-body-sm font-medium text-fg">{title}</p>
            {text ? <p className="max-w-[360px] text-body-sm text-fg-muted">{text}</p> : null}
            {action}
        </div>
    );
}

/**
 * "From example.com · not part of TrafficClaw". Only the host is ever shortened (with an ellipsis, full host in the
 * tooltip); the disclosure itself is never cut: when the card is too narrow it wraps to a second line.
 */
export function EmbedSource({ host }: { host: string }) {
    return (
        <p data-embed-source="" className="mb-1.5 flex shrink-0 flex-wrap items-center gap-x-1 text-meta text-fg-muted">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <Globe aria-hidden size={12} className="shrink-0" />
                <span className="shrink-0">From</span>
                <span className="min-w-0 truncate" title={host} data-embed-host="">{host}</span>
            </span>
            <span data-embed-disclosure="" className="whitespace-nowrap">· {embedDisclosure(BRAND_NAME)}</span>
        </p>
    );
}

/**
 * How a framed page is doing: loading, or why we gave up on it. A browser fires the frame's load event for its own
 * error page too, so load alone proves nothing: while the page is loading, the viewer's own browser also asks for the
 * address (a no-cors request: any answer counts, a refused connection, missing host or bad certificate rejects), and a
 * timer ends a page that never finishes.
 */
function useFrameState(key: string, href: string | null) {
    const [st, setSt] = useState<{ key: string; state: 'loading' | 'loaded' | EmbedFailure }>({ key, state: 'loading' });
    const state = st.key === key ? st.state : 'loading';
    const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === 'undefined');
    const [box, setBox] = useState<HTMLDivElement | null>(null);
    // The timer starts when the card is on screen (a lazy frame off screen is not "slow", it has not started).
    useEffect(() => {
        if (!box) return;
        if (typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setOnScreen(true); });
        io.observe(box);
        return () => io.disconnect();
    }, [box]);
    useEffect(() => {
        if (state !== 'loading' || !onScreen) return;
        const t = setTimeout(() => setSt({ key, state: 'timeout' }), EMBED_LOAD_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [state, onScreen, key]);
    useEffect(() => {
        if (state !== 'loading' || !onScreen || !href || typeof fetch === 'undefined') return;
        const ctl = new AbortController();
        // GET (some servers reset a HEAD), dropped as soon as the headers are in: the frame loads the body.
        fetch(href, { method: 'GET', mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal })
            .then(() => ctl.abort())
            .catch((e: unknown) => { if (!ctl.signal.aborted && (e as { name?: string } | null)?.name !== 'AbortError') setSt({ key, state: 'unreachable' }); });
        return () => ctl.abort();
    }, [state, onScreen, key, href]);
    return { state, setBox, loaded: () => setSt({ key, state: 'loaded' }), failed: () => setSt({ key, state: 'error' }) } as const;
}

/** A web page in a sandboxed iframe (round 9, lib/builder/embed.ts). */
export function EmbedView(props: WidgetViewProps<EmbedWidget>) {
    const { widget, mode } = props;
    const c = normalizeEmbedConfig(widget.config);
    // The viewer's own host is never embedded either (a page on our origin with allow-same-origin would escape the sandbox).
    const own = selfHosts(typeof window !== 'undefined' ? [window.location.hostname] : []);
    const problem = c.url ? embedUrlProblem(c.url, { selfHosts: own }) : 'Add an https address.';
    const href = problem ? null : normalizeEmbedUrl(c.url, { selfHosts: own });
    const probe = useEmbedProbe(widget.id, c.url, Boolean(href));
    const host = embedHost(c.url);
    const [attempt, setAttempt] = useState(0);
    const { state: frameState, setBox, loaded, failed } = useFrameState(`${href}|${attempt}`, href);
    const known = probeFailure(probe);
    // The server says the page refuses framing or does not answer; or the frame never loaded (timer) or reported an error.
    const failure: EmbedFailure | null = known ? known.kind : frameState === 'timeout' || frameState === 'error' || frameState === 'unreachable' ? frameState : null;
    const editing = mode === 'edit';
    const open = href ? (
        <Button asChild size="sm" variant="secondary" icon={ExternalLink}><a href={href} target="_blank" rel="noopener noreferrer">Open {host}</a></Button>
    ) : undefined;
    const retry = (failure === 'timeout' || failure === 'error' || failure === 'unreachable') && !known ? (
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
    ) : undefined;
    const frameProps = { ...props, loading: false, result: undefined };

    return (
        <WidgetFrame props={frameProps} skeleton="none" bodyClassName={cn(c.heightPx ? 'overflow-y-auto' : 'overflow-hidden')}>
            {!href ? (
                editing || mode === 'view'
                    ? <Notice icon={Globe} title={c.url ? 'This address cannot be embedded' : 'Add a web page'} text={problem ?? undefined} />
                    : null
            ) : failure ? (
                <Notice
                    icon={failure === 'blocked' ? ShieldOff : WifiOff}
                    title={`${host} cannot be shown here`}
                    // The server's own words (which header, which error) are for the owner; a public link only gets the plain sentence.
                    text={`${embedFailureMessage(host, failure)}${known && mode !== 'public' ? ` (${known.reason})` : ''}`}
                    action={<span className="flex flex-wrap items-center justify-center gap-2">{retry}{open}</span>}
                />
            ) : (
                <div ref={setBox} className="group/embed relative flex h-full min-h-0 flex-col">
                    {/* Always say where the content comes from (the editor too), so a page framed on a public link can't pass as ours. */}
                    <EmbedSource host={host} />
                    <iframe
                        // Remount when the address changes (or on Try again) so a stale page never lingers.
                        key={`${href}|${attempt}`}
                        src={href}
                        title={c.title}
                        sandbox={EMBED_SANDBOX}
                        referrerPolicy={EMBED_REFERRER_POLICY}
                        allow=""
                        loading="lazy"
                        scrolling={c.scroll ? 'auto' : 'no'}
                        data-embed-frame=""
                        onLoad={loaded}
                        onError={failed}
                        className={cn('block min-h-0 w-full flex-1 border-0 bg-surface', editing && 'pointer-events-none')}
                        style={{ height: c.heightPx ? c.heightPx : '100%' }}
                    />
                    {!editing ? (
                        <a
                            href={href} target="_blank" rel="noopener noreferrer"
                            data-pdf-ignore="true"
                            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-control border border-border-subtle bg-surface-raised px-2 py-1 text-meta text-fg-secondary opacity-0 shadow-popover transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/embed:opacity-100"
                        >
                            <ExternalLink aria-hidden size={12} /> Open in a new tab
                        </a>
                    ) : null}
                </div>
            )}
        </WidgetFrame>
    );
}
