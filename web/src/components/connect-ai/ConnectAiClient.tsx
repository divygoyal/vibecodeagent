'use client';

import { KeyRound, Plug, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import {
    Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmModal, EmptyState, Modal, Pill, Select, Skeleton, Switch, Table, VerifiedBadge,
    type TableColumn,
} from '@/components/ui';
import { PageHeader } from '@/components/shell/PageHeader';
import { CodeBlock, CopyButton } from './CopyButton';
import { SetupTabs } from './SetupTabs';
import { EXAMPLE_PROMPTS } from './setupClients';
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
    created_at: number;
    expires_at: number;
    last_used_at: number | null;
}

interface Activity {
    ts: number;
    tool: string;
    site_host: string | null;
    status: string;
    client_name: string | null;
}

interface Data {
    endpoint: string;
    grants: Grant[];
    keys: ApiKey[];
    usage: { calls_30d: number; calls_24h: number; errors_30d: number } | null;
    activity: Activity[];
    google: { connected: boolean; reauth_required: boolean; ga4: number; gsc: number; sites: number };
}

const fetcher = async (url: string) => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
    return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function day(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Confirm = { title: string; description: string; label: string; run: () => Promise<unknown>; ok: string };

export function ConnectAiClient({ endpoint, enabled }: { endpoint: string; enabled: boolean }) {
    const { data, error, isLoading, mutate } = useSWR<Data>(enabled ? '/api/ai-connections' : null, fetcher);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [keyName, setKeyName] = useState('');
    const [keyDays, setKeyDays] = useState<'30' | '90' | '365'>('90');
    const [keyHideQueries, setKeyHideQueries] = useState(false);
    const [secret, setSecret] = useState<{ key: string; name: string } | null>(null);
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
            <>
                <PageHeader title="Connect AI" />
                <Card padding="none"><EmptyState variant="page" icon={Plug} title="Connect AI is not enabled" description="This server does not have the MCP connector turned on (TC_MCP_ENABLED)." /></Card>
            </>
        );
    }

    const grants = data?.grants ?? [];
    const keys = data?.keys ?? [];

    const keyColumns: TableColumn<ApiKey>[] = [
        { key: 'name', header: 'Name', cell: (k) => <span className="font-medium text-fg">{k.name}{k.exclude_queries ? <span className="ml-1.5 font-normal text-fg-muted">(no queries)</span> : null}</span> },
        { key: 'key', header: 'Key', cell: (k) => <span className="font-mono text-[12px] text-fg-secondary">{k.prefix}…</span> },
        { key: 'created', header: 'Created', cell: (k) => day(k.created_at) },
        { key: 'expires', header: 'Expires', cell: (k) => day(k.expires_at) },
        { key: 'used', header: 'Last used', cell: (k) => ago(k.last_used_at) },
        {
            key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
            cell: (k) => <Button size="sm" variant="ghost" icon={Trash2} disabled={busy === `k${k.id}`} onClick={() => setConfirm({ title: `Revoke "${k.name}"?`, description: 'Apps using this key stop working within seconds.', label: 'Revoke key', ok: 'Key revoked', run: () => send(`/api/ai-connections/keys/${k.id}`, 'DELETE') })}>Revoke</Button>,
        },
    ];
    const activityColumns: TableColumn<Activity>[] = [
        { key: 'when', header: 'When', cell: (a) => <span className="whitespace-nowrap text-fg-muted">{ago(a.ts)}</span> },
        { key: 'app', header: 'App', cell: (a) => <span className="block max-w-[140px] truncate">{a.client_name || 'API key'}</span> },
        { key: 'tool', header: 'Tool', cell: (a) => <span className="font-mono text-[12px]">{a.tool}</span> },
        { key: 'site', header: 'Site', cell: (a) => <span className="block max-w-[160px] truncate text-fg-secondary">{a.site_host || '—'}</span> },
        { key: 'status', header: 'Result', align: 'right', cell: (a) => (a.status === 'ok' ? <span className="text-up">OK</span> : <span className="text-down">{a.status.replace(/^error:/, '')}</span>) },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Connect AI"
                subtitle="Ask ChatGPT, Claude and other MCP apps about your Analytics and Search Console data. Read-only, free, and you choose which sites each app sees."
                badges={data ? <Pill tone={grants.length ? 'brand' : 'neutral'} icon={<Plug aria-hidden size={12} strokeWidth={1.75} />}>{grants.length ? `${grants.length} connected` : 'Nothing connected yet'}</Pill> : null}
            />

            {error ? (
                <Banner variant="danger" title="Could not load your connections" actions={<Button size="sm" onClick={() => mutate()}>Retry</Button>} />
            ) : data && !data.google.connected ? (
                <Banner
                    variant="danger"
                    title={data.google.reauth_required ? 'Google connection expired' : 'Google is not connected'}
                    actions={<Button size="sm" icon={RefreshCw} onClick={() => signIn('google', { callbackUrl: '/dashboard/connect-ai' }, { prompt: 'consent' })}>Reconnect Google</Button>}
                >
                    AI apps get &ldquo;google_reauth_required&rdquo; until you reconnect.
                </Banner>
            ) : null}

            <Card>
                <CardHeader as="h2" title="Server URL" description="Paste this into your AI app and sign in when it asks. API keys below are only for apps without OAuth." />
                <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken p-2 pl-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-[14px] text-fg">{url}</code>
                    <CopyButton text={url} size="md" />
                </div>
            </Card>

            <Card>
                <CardHeader as="h2" title="Set up your app" />
                <SetupTabs url={url} urlShown />
                <div className="mt-5 border-t border-border-subtle pt-4">
                    <h3 className="mb-2 text-caption uppercase tracking-[0.04em] text-fg-muted">Try asking</h3>
                    <ul className="space-y-1.5">
                        {EXAMPLE_PROMPTS.slice(0, 3).map((p) => (
                            <li key={p} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 text-body text-fg">&ldquo;{p}&rdquo;</span>
                                <CopyButton text={p} />
                            </li>
                        ))}
                    </ul>
                </div>
            </Card>

            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                <Card>
                    <CardHeader
                        as="h2"
                        title="Connected apps"
                        description="Apps you approved. Revoking signs them out within seconds."
                        actions={grants.length > 1 ? <Button size="sm" variant="ghost" className="text-down" onClick={() => setConfirm({ title: 'Revoke every connected app?', description: 'Each app has to be approved again before it can read your data.', label: 'Revoke all', ok: 'All apps revoked', run: () => send('/api/ai-connections/revoke-all', 'POST', {}) })}>Revoke all</Button> : undefined}
                    />
                    {isLoading ? (
                        <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                    ) : grants.length === 0 ? (
                        <EmptyState variant="inline" icon={Plug} title="No apps yet" description="Add the server URL in ChatGPT, Claude or another app and approve it." />
                    ) : (
                        <ul className="divide-y divide-border-subtle">
                            {grants.map((g) => (
                                <li key={g.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-body font-medium text-fg">{g.client_name || 'App'}</span>
                                            {g.verified ? <VerifiedBadge tooltip="TrafficClaw recognises this app's published identity." /> : null}
                                            {g.demo ? <Badge variant="neutral">Demo data</Badge> : null}
                                        </div>
                                        <p className="mt-0.5 text-meta text-fg-muted">
                                            {g.client_host && g.client_host !== 'unverified' ? <span className="font-mono">{g.client_host}</span> : 'Self-registered app'}
                                            {g.redirect_host ? <> · returns to <span className="font-mono">{g.redirect_host}</span></> : null}
                                        </p>
                                        <p className="mt-0.5 text-meta text-fg-muted tabular-nums">
                                            Last used {ago(g.last_used_at)} · {g.calls_30d} calls in 30 days · {g.site_filter ? `${g.site_filter.length} ${g.site_filter.length === 1 ? 'site' : 'sites'}` : 'all sites'} · approved {day(g.created_at)}
                                        </p>
                                        {!g.demo ? (
                                            <Switch
                                                size="sm"
                                                className="mt-2"
                                                checked={!g.exclude_queries}
                                                disabled={busy === `q${g.id}`}
                                                label={<span className="text-body-sm">Share search queries</span>}
                                                onCheckedChange={(v) => void act(`q${g.id}`, () => send(`/api/ai-connections/${g.id}`, 'PATCH', { exclude_queries: !v }), v ? 'Search queries shared' : 'Search queries hidden')}
                                            />
                                        ) : null}
                                    </div>
                                    <Button size="sm" disabled={busy === `g${g.id}`} onClick={() => setConfirm({ title: `Revoke ${g.client_name || 'this app'}?`, description: 'It loses access within seconds and has to be approved again.', label: 'Revoke', ok: 'App revoked', run: () => send(`/api/ai-connections/${g.id}`, 'DELETE') })}>Revoke</Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card>
                    <CardHeader as="h2" title="Usage" description="Tool calls from all your apps and keys. Free, with a fair-use limit of about 60 calls a minute." />
                    {isLoading ? <Skeleton className="h-28" /> : (
                        <>
                            <dl className="grid grid-cols-3 gap-3">
                                {([['Last 24 h', data?.usage?.calls_24h ?? 0], ['Last 30 days', data?.usage?.calls_30d ?? 0], ['Errors, 30 d', data?.usage?.errors_30d ?? 0]] as const).map(([label, v]) => (
                                    <div key={label} className="rounded-control border border-border-subtle bg-surface-sunken p-3">
                                        <dt className="text-meta text-fg-muted">{label}</dt>
                                        <dd className="mt-1 text-stat text-fg">{v.toLocaleString('en')}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="mt-3 text-body-sm text-fg-muted">TrafficClaw logs which tool ran, when and for which site, never the question or the answer. Kept for 30 days.</p>
                        </>
                    )}
                </Card>
            </div>

            <Table
                caption="Recent tool calls"
                toolbar={<CardHeader as="h2" title="Recent activity" className="mb-0" />}
                density="compact"
                loading={isLoading}
                columns={activityColumns}
                rows={(data?.activity ?? []).slice(0, 10)}
                rowKey={(a, i) => `${a.ts}-${i}`}
                empty={<EmptyState variant="inline" title="No calls yet" description="Calls from your AI apps show up here." />}
            />

            <Card>
                <CardHeader
                    as="h2"
                    title="API keys"
                    description="For apps and scripts that can't sign in with OAuth. Up to 5 active keys; each is shown once."
                    actions={<Button size="sm" icon={Plus} disabled={keys.length >= 5} onClick={() => setCreateOpen(true)}>Create key</Button>}
                />
                {isLoading ? <Skeleton className="h-12" /> : keys.length === 0 ? (
                    <EmptyState variant="inline" icon={KeyRound} title="No API keys" description="OAuth is simpler and safer when your app supports it." />
                ) : (
                    <Table card={false} density="compact" caption="API keys" columns={keyColumns} rows={keys} rowKey={(k) => String(k.id)} />
                )}
            </Card>

            <Card>
                <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <span>
                            <span className="block text-title-sm text-fg">Tools your AI app can use</span>
                            <span className="text-body-sm text-fg-muted">13 read-only tools. None can change your data.</span>
                        </span>
                        <span className="text-body-sm text-fg-muted group-open:hidden">Show</span>
                        <span className="hidden text-body-sm text-fg-muted group-open:inline">Hide</span>
                    </summary>
                    <ul className="mt-4 grid gap-x-6 gap-y-3 border-t border-border-subtle pt-4 grid-cols-1 sm:grid-cols-2">
                        {TOOL_SUMMARIES.map((t) => (
                            <li key={t.name} className="min-w-0">
                                <span className="font-mono text-[12px] text-fg">{t.name}</span>
                                <p className="text-body-sm text-fg-muted">{t.summary}</p>
                            </li>
                        ))}
                    </ul>
                </details>
            </Card>

            <Modal
                open={createOpen}
                onOpenChange={setCreateOpen}
                title="Create an API key"
                description="Use it as a Bearer token in apps that can't sign in with OAuth."
                footer={
                    <>
                        <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button
                            variant="primary"
                            icon={KeyRound}
                            loading={busy === 'create'}
                            onClick={() => void (async () => {
                                setBusy('create');
                                try {
                                    const res = await send('/api/ai-connections/keys', 'POST', { name: keyName.trim() || 'API key', expires_in_days: Number(keyDays), exclude_queries: keyHideQueries }) as { key: string; name: string };
                                    setCreateOpen(false);
                                    setSecret({ key: res.key, name: res.name });
                                    setKeyName('');
                                    setKeyHideQueries(false);
                                    await mutate();
                                } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Could not create the key');
                                } finally {
                                    setBusy(null);
                                }
                            })()}
                        >
                            Create key
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <label className="block space-y-1.5">
                        <span className="text-body-sm font-medium text-fg">Name</span>
                        <input value={keyName} onChange={(e) => setKeyName(e.target.value)} maxLength={60} placeholder="e.g. Cursor on my laptop" className="h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus:border-focus focus:outline-none" />
                    </label>
                    <Select
                        label="Expires:"
                        value={keyDays}
                        onValueChange={(v) => setKeyDays(v as '30' | '90' | '365')}
                        options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]}
                    />
                    <Checkbox checked={keyHideQueries} onCheckedChange={setKeyHideQueries} label="Don't share search queries with this key" description="Totals, pages and trends stay available." />
                </div>
            </Modal>

            <Modal
                open={secret !== null}
                onOpenChange={(o) => { if (!o) setSecret(null); }}
                title="Copy your API key"
                footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}
            >
                {secret ? (
                    <div className="space-y-4">
                        <Banner variant="warn" title="This is the only time you can see it">TrafficClaw keeps only a fingerprint. Treat the key like a password.</Banner>
                        <CodeBlock label={secret.name} code={secret.key} />
                        <p className="text-meta text-fg-muted">Send it as <span className="font-mono">Authorization: Bearer {secret.key.slice(0, 9)}…</span></p>
                    </div>
                ) : null}
            </Modal>

            <ConfirmModal
                open={confirm !== null}
                onOpenChange={(o) => { if (!o) setConfirm(null); }}
                title={confirm?.title ?? ''}
                description={confirm?.description}
                confirmLabel={confirm?.label ?? 'Confirm'}
                loading={busy === 'confirm'}
                onConfirm={async () => {
                    if (!confirm) return;
                    await act('confirm', confirm.run, confirm.ok);
                    setConfirm(null);
                }}
            />
        </div>
    );
}
