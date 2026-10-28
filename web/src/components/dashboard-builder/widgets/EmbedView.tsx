'use client';

import { ExternalLink, Globe, ShieldOff } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import {
    EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedBlockedMessage, embedHost, embedUrlProblem, normalizeEmbedConfig, normalizeEmbedUrl, selfHosts,
} from '@/lib/builder/embed';
import type { EmbedWidget } from '@/lib/builder/types';
import { useEmbedProbe } from '../useEmbedProbe';
import { WidgetFrame, type WidgetViewProps } from './WidgetFrame';

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
    const blocked = probe?.status === 'blocked' ? probe : null;
    const editing = mode === 'edit';
    const open = href ? (
        <Button asChild size="sm" variant="secondary" icon={ExternalLink}><a href={href} target="_blank" rel="noopener noreferrer">Open {host}</a></Button>
    ) : undefined;
    const frameProps = { ...props, loading: false, result: undefined };

    return (
        <WidgetFrame props={frameProps} skeleton="none" bodyClassName={cn(c.heightPx ? 'overflow-y-auto' : 'overflow-hidden')}>
            {!href ? (
                editing || mode === 'view'
                    ? <Notice icon={Globe} title={c.url ? 'This address cannot be embedded' : 'Add a web page'} text={problem ?? undefined} />
                    : null
            ) : blocked ? (
                <Notice
                    icon={ShieldOff}
                    title={`${host} cannot be shown here`}
                    text={`${embedBlockedMessage(host)}${mode !== 'public' ? ` (${blocked.reason})` : ''}`}
                    action={open}
                />
            ) : (
                <div className="group/embed relative h-full min-h-0">
                    <iframe
                        // Remount when the address changes so a stale page never lingers.
                        key={href}
                        src={href}
                        title={c.title}
                        sandbox={EMBED_SANDBOX}
                        referrerPolicy={EMBED_REFERRER_POLICY}
                        allow=""
                        loading="lazy"
                        scrolling={c.scroll ? 'auto' : 'no'}
                        data-embed-frame=""
                        className={cn('block w-full border-0 bg-surface', editing && 'pointer-events-none')}
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
