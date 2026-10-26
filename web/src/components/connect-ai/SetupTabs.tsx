'use client';

import { useState } from 'react';
import { CodeBlock } from './CopyButton';
import { SETUP_CLIENTS, type SetupClient } from './setupClients';
import { cx, s } from './styles';

export function SetupTabs({ url, initial = 'claude', clients = SETUP_CLIENTS }: { url: string; initial?: SetupClient['id']; clients?: SetupClient[] }) {
    const [active, setActive] = useState<SetupClient['id']>(initial);
    const client = clients.find((c) => c.id === active) ?? clients[0];
    return (
        <div>
            <div role="tablist" aria-label="AI app" className="-mx-1 flex gap-1 overflow-x-auto border-b border-[var(--tc-border-subtle)] px-1">
                {clients.map((c) => (
                    <button
                        key={c.id}
                        role="tab"
                        type="button"
                        id={`tab-${c.id}`}
                        aria-selected={c.id === active}
                        aria-controls={`panel-${c.id}`}
                        onClick={() => setActive(c.id)}
                        className={cx(
                            'relative h-10 shrink-0 px-3 text-sm font-medium transition-colors duration-[120ms]',
                            c.id === active ? 'text-[var(--tc-fg)] after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--tc-brand)]' : 'text-[var(--tc-fg-muted)] hover:text-[var(--tc-fg)]',
                        )}
                    >
                        {c.name}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`panel-${client.id}`} aria-labelledby={`tab-${client.id}`} className="pt-4">
                <ol className="space-y-2.5">
                    {client.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--tc-subtle)] text-[11px] font-semibold text-[var(--tc-fg-secondary)] tabular">{i + 1}</span>
                            <span className={s.body}>{step}</span>
                        </li>
                    ))}
                </ol>
                <div className="mt-4 space-y-3">
                    {client.snippets(url).map((sn) => <CodeBlock key={sn.label} label={sn.label} code={sn.code} />)}
                </div>
                {client.note ? <p className={cx(s.meta, 'mt-3')}>{client.note}</p> : null}
            </div>
        </div>
    );
}
