'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui';
import { CodeBlock } from './CopyButton';
import { SETUP_CLIENTS, type SetupClient } from './setupClients';

/** Client tabs with numbered steps and copyable snippets for the server URL. */
export function SetupTabs({ url, initial = 'claude', variant = 'pills', urlShown = false }: {
    url: string; initial?: SetupClient['id']; variant?: 'pills' | 'underline';
    /** The page already shows the server URL with a copy button: skip snippets that are just the URL. */
    urlShown?: boolean;
}) {
    const [active, setActive] = useState<SetupClient['id']>(initial);
    const client = SETUP_CLIENTS.find((c) => c.id === active) ?? SETUP_CLIENTS[0];
    return (
        <div>
            <Tabs
                ariaLabel="AI app"
                variant={variant}
                value={active}
                onValueChange={setActive}
                panelIdPrefix="setup"
                items={SETUP_CLIENTS.map((c) => ({ value: c.id, label: c.name }))}
            />
            <div role="tabpanel" id={`setup-${client.id}`} className="pt-4">
                <ol className="space-y-2.5">
                    {client.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle text-caption font-semibold text-fg-secondary tabular-nums">{i + 1}</span>
                            <span className="text-body text-fg">{step}</span>
                        </li>
                    ))}
                </ol>
                <div className="mt-4 space-y-3">
                    {client.snippets(url).filter((sn) => !(urlShown && sn.code === url)).map((sn) => <CodeBlock key={sn.label} label={sn.label} code={sn.code} />)}
                </div>
                {client.note ? <p className="mt-3 text-meta text-fg-muted">{client.note}</p> : null}
            </div>
        </div>
    );
}
