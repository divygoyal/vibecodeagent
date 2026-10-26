'use client';

import { AlertTriangle, ChevronDown, KeyRound, Plug, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CodeBlock, CopyButton } from './CopyButton';
import { SetupTabs } from './SetupTabs';
import { EXAMPLE_PROMPTS } from './setupClients';
import { cx, s } from './styles';
import { TOOL_SUMMARIES } from './toolSummaries';

interface Grant {
    id: number;
    client_name: string | null;
    client_host: string | null;
    redirect_host: string | null;
    verified: boolean;
    demo: boolean;
    exclude_queries: boolean;
    site_filter: string[] | null;
    created_at: number;
    last_used_at: number | null;
    calls_30d: number;
}

interface ApiKey {
    id: number;
    name: string;
    prefix: string;
    exclude_queries: boolean;
    site_filter: string[] | null;
    created_at: number;
    expires_at: number;
    last_used_at: number | null;
}

interface Activity {
    ts: number;
    tool: string;
    site_host: string | null;
    status: string;
    duration_ms: number | null;
    client_name: string | null;
}

interface Data {
    endpoint: string;
    grants: Grant[];
    keys: ApiKey[];
    usage: { calls_30d: number; calls_24h: number; errors_30d: number; cached_30d: number; by_tool: { tool: string; calls: number }[] } | null;
    activity: Activity[];
    google: { connected: boolean; reauth_required: boolean; ga4: number; gsc: number; sites: number };
}

class HttpError extends Error {
    constructor(public status: number) {
        super(`HTTP ${status}`);
    }
}

const fetcher = async (url: string) => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new HttpError(r.status);
    return r.json();
};

async function send(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { message?: string }).message || `Request failed (${r.status})`);
    return j;
}

function ago(ts: number | null): string {
    if (!ts) return 'never';
    const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
    if (sec < 7 * 86400) return `${Math.floor(sec / 86400)} d ago`;
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function day(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Card({ title, description, actions, children, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={cx(s.card, 'p-4 sm:p-5', className)}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className={s.titleSm}>{title}</h2>
                    {description ? <p className={cx(s.bodySm, 'mt-0.5 text-[var(--tc-fg-muted)]')}>{description}</p> : null}
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            {children}
        </section>
    );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[120ms] disabled:opacity-50', checked ? 'bg-[var(--tc-brand)]' : 'bg-[var(--tc-border-strong)]')}
        >
            <span className={cx('h-4 w-4 rounded-full bg-white shadow-[var(--tc-shadow-xs)] transition-transform duration-[120ms]', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
        </button>
    );
}

function Skeleton({ className }: { className?: string }) {
    return <div className={cx('animate-pulse rounded-md bg-[var(--tc-subtle)]', className)} />;
}

function NewKeyModal({ secret, onClose }: { secret: { key: string; name: string }; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(14_16_20/0.45)] p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-key-title">
            <div className={cx(s.card, 'w-full max-w-[520px] rounded-b-none p-5 shadow-[var(--tc-shadow-modal)] sm:rounded-xl')}>
                <div className="flex items-start justify-between gap-3">
                    <h2 id="new-key-title" className={s.title}>API key created</h2>
                    <button type="button" onClick={onClose} className={cx(s.btn, 'h-8 w-8', s.ghost)} aria-label="Close"><X size={16} strokeWidth={1.75} /></button>
                </div>
                <div className="mt-3 flex gap-3 rounded-lg border border-[color-mix(in_oklab,var(--tc-warn)_25%,transparent)] bg-[var(--tc-warn-soft)] p-3.5">
                    <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--tc-warn)]" aria-hidden />
                    <p className="text-[13px] leading-[18px]">Copy it now. TrafficClaw stores only a fingerprint and can&apos;t show this key again. Treat it like a password.</p>
                </div>
                <div className="mt-4"><CodeBlock label={secret.name} code={secret.key} /></div>
                <p className={cx(s.meta, 'mt-3')}>Send it as <span className={s.mono}>Authorization: Bearer {secret.key.slice(0, 9)}…</span></p>
                <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className={cx(s.btn, s.btnMd, s.primary)}>Done</button></div>
            </div>
        </div>
    );
}

export function ConnectAiClient({ endpoint, enabled }: { endpoint: string; enabled: boolean }) {
    const { data, error, isLoading, mutate } = useSWR<Data>(enabled ? '/api/ai-connections' : null, fetcher, { revalidateOnFocus: true });
    const [busy, setBusy] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [keyName, setKeyName] = useState('');
    const [keyDays, setKeyDays] = useState(90);
    const [keyHideQueries, setKeyHideQueries] = useState(false);
    const [secret, setSecret] = useState<{ key: string; name: string } | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);
    const url = data?.endpoint ?? endpoint;

    const act = useCallback(async (id: string, fn: () => Promise<unknown>, ok: string) => {
        setBusy(id);
        try {
            await fn();
            toast.success(ok);
            await mutate();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(null);
        }
    }, [mutate]);

    if (!enabled) {
        return (
            <div className={cx(s.card, 'p-6')}>
                <h2 className={s.title}>Connect AI is not enabled</h2>
                <p className={cx(s.bodySm, 'mt-1')}>This server does not have the MCP connector turned on (TC_MCP_ENABLED).</p>
            </div>
        );
    }

    const grants = data?.grants ?? [];
    const keys = data?.keys ?? [];

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className={s.heading}>Connect AI</h1>
                    <p className={cx(s.bodySm, 'mt-1 max-w-[640px] text-[var(--tc-fg-muted)]')}>Ask ChatGPT, Claude and other MCP apps about your Analytics and Search Console data. Read-only, free, and you choose which sites each app sees.</p>
                </div>
                {data ? <span className={cx(s.pill, grants.length ? 'bg-[var(--tc-brand-soft)] text-[var(--tc-brand-soft-fg)]' : 'bg-[var(--tc-subtle)] text-[var(--tc-fg-muted)]')}><Plug size={12} strokeWidth={1.75} aria-hidden />{grants.length ? `${grants.length} connected` : 'Nothing connected yet'}</span> : null}
            </header>

            {error ? (
                <div className="flex gap-3 rounded-lg border border-[color-mix(in_oklab,var(--tc-down)_25%,transparent)] bg-[var(--tc-down-soft)] p-3.5" role="alert">
                    <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--tc-down)]" aria-hidden />
                    <div className="flex-1 text-[13px]">Could not load your connections. <button type="button" onClick={() => mutate()} className="underline underline-offset-4">Retry</button></div>
                </div>
            ) : null}
            {data && !data.google.connected ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color-mix(in_oklab,var(--tc-down)_25%,transparent)] bg-[var(--tc-down-soft)] p-3.5" role="alert">
                    <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-[var(--tc-down)]" aria-hidden />
                    <p className="min-w-0 flex-1 text-[13px]">{data.google.reauth_required ? 'Your Google connection expired. AI apps get "google_reauth_required" until you reconnect.' : 'Connect Google so AI apps can read your Analytics and Search Console data.'}</p>
                    <button type="button" onClick={() => signIn('google', { callbackUrl: '/dashboard/connect-ai' }, { prompt: 'consent' })} className={cx(s.btn, s.btnSm, s.secondary)}><RefreshCw size={14} strokeWidth={1.75} aria-hidden />Reconnect Google</button>
                </div>
            ) : null}

            <Card title="Server URL" description="Paste this into your AI app. It signs you in with OAuth; API keys below are only for apps without OAuth.">
                <div className={cx(s.sunken, 'flex items-center gap-2 p-2 pl-3')}>
                    <code className={cx(s.mono, 'min-w-0 flex-1 truncate text-[14px] text-[var(--tc-fg)]')}>{url}</code>
                    <CopyButton text={url} size="md" />
                </div>
            </Card>

            <Card title="Set up your app">
                <SetupTabs url={url} />
                <div className="mt-5 border-t border-[var(--tc-border-subtle)] pt-4">
                    <h3 className={cx(s.meta, 'mb-2 font-medium uppercase tracking-[0.04em]')}>Try asking</h3>
                    <ul className="space-y-1.5">
                        {EXAMPLE_PROMPTS.slice(0, 3).map((p) => (
                            <li key={p} className="flex items-center gap-2">
                                <span className={cx(s.body, 'min-w-0 flex-1')}>&ldquo;{p}&rdquo;</span>
                                <CopyButton text={p} />
                            </li>
                        ))}
                    </ul>
                </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card
                    title="Connected apps"
                    description="Apps you approved. Revoking signs them out within seconds."
                    actions={grants.length > 1 ? (
                        <button type="button" disabled={busy === 'all'} onClick={() => { if (window.confirm('Revoke every connected app?')) void act('all', () => send('/api/ai-connections/revoke-all', 'POST', {}), 'All apps revoked'); }} className={cx(s.btn, s.btnSm, s.dangerText)}>Revoke all</button>
                    ) : undefined}
                >
                    {isLoading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : grants.length === 0 ? (
                        <p className={cx(s.bodySm, 'rounded-lg border border-dashed border-[var(--tc-border)] p-4 text-center')}>No apps yet. Add the server URL in ChatGPT, Claude or another app and approve it.</p>
                    ) : (
                        <ul className="divide-y divide-[var(--tc-border-subtle)]">
                            {grants.map((g) => (
                                <li key={g.id} className="py-3 first:pt-0 last:pb-0">
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={cx(s.body, 'font-medium')}>{g.client_name || 'App'}</span>
                                                {g.verified ? <span className={cx(s.pill, 'h-5 px-2 text-[11px] bg-[var(--tc-brand-soft)] text-[var(--tc-brand-soft-fg)]')}><ShieldCheck size={12} strokeWidth={1.75} aria-hidden />Verified</span> : null}
                                                {g.demo ? <span className={cx(s.badge, 'bg-[var(--tc-subtle)] text-[var(--tc-fg-secondary)]')}>Demo data</span> : null}
                                            </div>
                                            <p className={cx(s.meta, 'mt-0.5')}>
                                                {g.client_host && g.client_host !== 'unverified' ? <span className={s.mono}>{g.client_host}</span> : 'Self-registered'}{g.redirect_host ? <> · returns to <span className={s.mono}>{g.redirect_host}</span></> : null}
                                            </p>
                                            <p className={cx(s.meta, 'mt-0.5 tabular')}>
                                                Last used {ago(g.last_used_at)} · {g.calls_30d} calls in 30 days · {g.site_filter ? `${g.site_filter.length} ${g.site_filter.length === 1 ? 'site' : 'sites'}` : 'all sites'} · approved {day(g.created_at)}
                                            </p>
                                            {!g.demo ? (
                                                <label className="mt-2 flex items-center gap-2">
                                                    <Switch checked={!g.exclude_queries} disabled={busy === `q${g.id}`} label={`Share search queries with ${g.client_name || 'this app'}`} onChange={(v) => void act(`q${g.id}`, () => send(`/api/ai-connections/${g.id}`, 'PATCH', { exclude_queries: !v }), v ? 'Search queries shared' : 'Search queries hidden')} />
                                                    <span className={s.bodySm}>Share search queries</span>
                                                </label>
                                            ) : null}
                                        </div>
                                        <button type="button" disabled={busy === `g${g.id}`} onClick={() => { if (window.confirm(`Revoke ${g.client_name || 'this app'}?`)) void act(`g${g.id}`, () => send(`/api/ai-connections/${g.id}`, 'DELETE'), 'App revoked'); }} className={cx(s.btn, s.btnSm, s.secondary)}>Revoke</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card title="Usage" description="Tool calls from all your apps and keys. Free, with a fair-use limit of about 60 calls a minute.">
                    {isLoading ? <Skeleton className="h-28" /> : (
                        <>
                            <dl className="grid grid-cols-3 gap-3">
                                {[['Last 24 h', data?.usage?.calls_24h ?? 0], ['Last 30 days', data?.usage?.calls_30d ?? 0], ['Errors (30 d)', data?.usage?.errors_30d ?? 0]].map(([label, v]) => (
                                    <div key={label as string} className={cx(s.sunken, 'p-3')}>
                                        <dt className={s.meta}>{label}</dt>
                                        <dd className="mt-1 text-2xl font-semibold leading-[30px]">{Number(v).toLocaleString()}</dd>
                                    </div>
                                ))}
                            </dl>
                            {(data?.activity?.length ?? 0) > 0 ? (
                                <div className="mt-4 overflow-x-auto">
                                    <table className="w-full min-w-[420px] text-left text-[13px] tabular">
                                        <thead className={s.meta}><tr><th className="pb-1.5 font-medium">When</th><th className="pb-1.5 font-medium">App</th><th className="pb-1.5 font-medium">Tool</th><th className="pb-1.5 font-medium">Site</th><th className="pb-1.5 text-right font-medium">Result</th></tr></thead>
                                        <tbody className="divide-y divide-[var(--tc-border-subtle)]">
                                            {data!.activity.slice(0, 8).map((a, i) => (
                                                <tr key={`${a.ts}-${i}`}>
                                                    <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--tc-fg-muted)]">{ago(a.ts)}</td>
                                                    <td className="py-1.5 pr-2 max-w-[120px] truncate">{a.client_name || 'API key'}</td>
                                                    <td className={cx(s.mono, 'py-1.5 pr-2 text-[12px]')}>{a.tool}</td>
                                                    <td className="py-1.5 pr-2 max-w-[140px] truncate text-[var(--tc-fg-secondary)]">{a.site_host || '—'}</td>
                                                    <td className={cx('py-1.5 text-right whitespace-nowrap', a.status === 'ok' ? 'text-[var(--tc-up)]' : 'text-[var(--tc-down)]')}>{a.status === 'ok' ? 'OK' : a.status.replace(/^error:/, '')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : <p className={cx(s.bodySm, 'mt-3')}>No calls yet.</p>}
                        </>
                    )}
                </Card>
            </div>

            <Card
                title="API keys"
                description="For apps and scripts that can't sign in with OAuth. Up to 5 active keys."
                actions={!creating ? <button type="button" onClick={() => setCreating(true)} disabled={keys.length >= 5} className={cx(s.btn, s.btnSm, s.secondary)}><Plus size={14} strokeWidth={1.75} aria-hidden />Create key</button> : undefined}
            >
                {creating ? (
                    <form
                        className={cx(s.sunken, 'mb-4 grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end')}
                        onSubmit={(e) => {
                            e.preventDefault();
                            void (async () => {
                                setBusy('create');
                                try {
                                    const res = await send('/api/ai-connections/keys', 'POST', { name: keyName || 'API key', expires_in_days: keyDays, exclude_queries: keyHideQueries }) as { key: string; name: string };
                                    setSecret({ key: res.key, name: res.name });
                                    setCreating(false);
                                    setKeyName('');
                                    await mutate();
                                } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Could not create the key');
                                } finally {
                                    setBusy(null);
                                }
                            })();
                        }}
                    >
                        <label className="space-y-1.5">
                            <span className={cx(s.meta, 'font-medium')}>Name</span>
                            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} maxLength={60} placeholder="e.g. Cursor on laptop" className={s.input} autoFocus />
                        </label>
                        <label className="space-y-1.5">
                            <span className={cx(s.meta, 'font-medium')}>Expires</span>
                            <select value={keyDays} onChange={(e) => setKeyDays(Number(e.target.value))} className={cx(s.input, 'pr-8')}>
                                <option value={30}>30 days</option>
                                <option value={90}>90 days</option>
                                <option value={365}>1 year</option>
                            </select>
                        </label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setCreating(false)} className={cx(s.btn, s.btnMd, s.ghost)}>Cancel</button>
                            <button type="submit" disabled={busy === 'create'} className={cx(s.btn, s.btnMd, s.primary)}><KeyRound size={16} strokeWidth={1.75} aria-hidden />Create</button>
                        </div>
                        <label className="flex items-center gap-2 sm:col-span-3">
                            <input type="checkbox" checked={keyHideQueries} onChange={(e) => setKeyHideQueries(e.target.checked)} className="h-4 w-4 accent-[var(--tc-brand)]" />
                            <span className={s.bodySm}>Don&apos;t share search queries with this key</span>
                        </label>
                    </form>
                ) : null}
                {isLoading ? <Skeleton className="h-12" /> : keys.length === 0 ? (
                    <p className={s.bodySm}>No API keys. OAuth is simpler and safer when your app supports it.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-[13px] tabular">
                            <thead className={s.meta}><tr><th className="pb-1.5 font-medium">Name</th><th className="pb-1.5 font-medium">Key</th><th className="pb-1.5 font-medium">Created</th><th className="pb-1.5 font-medium">Expires</th><th className="pb-1.5 font-medium">Last used</th><th /></tr></thead>
                            <tbody className="divide-y divide-[var(--tc-border-subtle)]">
                                {keys.map((k) => (
                                    <tr key={k.id}>
                                        <td className="py-2 pr-2 font-medium">{k.name}{k.exclude_queries ? <span className={cx(s.meta, 'ml-1.5 font-normal')}>(no queries)</span> : null}</td>
                                        <td className={cx(s.mono, 'py-2 pr-2 text-[12px] text-[var(--tc-fg-secondary)]')}>{k.prefix}…</td>
                                        <td className="py-2 pr-2 whitespace-nowrap">{day(k.created_at)}</td>
                                        <td className="py-2 pr-2 whitespace-nowrap">{day(k.expires_at)}</td>
                                        <td className="py-2 pr-2 whitespace-nowrap">{ago(k.last_used_at)}</td>
                                        <td className="py-2 text-right"><button type="button" disabled={busy === `k${k.id}`} onClick={() => { if (window.confirm(`Revoke the key "${k.name}"?`)) void act(`k${k.id}`, () => send(`/api/ai-connections/keys/${k.id}`, 'DELETE'), 'Key revoked'); }} className={cx(s.btn, s.btnSm, s.secondary)}>Revoke</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <section className={cx(s.card)}>
                <button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5">
                    <span>
                        <span className={cx(s.titleSm, 'block')}>Tools your AI app can use</span>
                        <span className={cx(s.bodySm, 'text-[var(--tc-fg-muted)]')}>13 read-only tools. None can change your data.</span>
                    </span>
                    <ChevronDown size={16} strokeWidth={1.75} className={cx('shrink-0 text-[var(--tc-fg-muted)] transition-transform', toolsOpen && 'rotate-180')} aria-hidden />
                </button>
                {toolsOpen ? (
                    <ul className="grid gap-x-6 gap-y-2 border-t border-[var(--tc-border-subtle)] p-4 sm:grid-cols-2 sm:p-5">
                        {TOOL_SUMMARIES.map((t) => (
                            <li key={t.name} className="min-w-0">
                                <span className={cx(s.mono, 'text-[12px] text-[var(--tc-fg)]')}>{t.name}</span>
                                <p className={s.bodySm}>{t.summary}</p>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>

            {secret ? <NewKeyModal secret={secret} onClose={() => setSecret(null)} /> : null}
        </div>
    );
}
