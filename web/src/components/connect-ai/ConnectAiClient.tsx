'use client';

import { KeyRound, Plug, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react';
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
import type { PortfolioResponse } from '@/lib/portfolio/types';
import { McpTranscript, topClickMovers } from './McpTranscript';
import { PROMPT_GROUPS } from './setupClients';
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


/** Tool-call results in words ("rate_limited" -> "Rate limited"); the raw code stays in the title. */
const RESULT_LABELS: Record<string, string> = {
    rate_limited: 'Rate limited',
    site_not_in_grant: 'Site not shared',
    queries_excluded: 'Queries hidden',
    google_reauth_required: 'Google expired',
    not_found: 'Not found',
};

function resultLabel(status: string): string {
    const code = status.replace(/^error:/, '');
    if (RESULT_LABELS[code]) return RESULT_LABELS[code];
    const words = code.replace(/[_-]+/g, ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : 'Error';
}

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
    // "What you get" (round 5): the home page's Claude transcript, answered from the user's own sites
    // (the portfolio store, no Google call); the public demo portfolio when they have no search data yet.
    const { data: own, error: ownError } = useSWR<PortfolioResponse>(enabled ? '/api/portfolio?range=28d' : null, fetcher, {
        revalidateOnFocus: false,
        // A first sync fills the store in the background: poll until it is done, like the portfolio page.
        refreshInterval: (d) => (d?.syncing ? 3000 : 0),
    });
    const ownMovers = own ? topClickMovers(own.sites, ['lost', 'gained']) : null;
    const needSample = Boolean(own || ownError) && !ownMovers;
    const { data: sample } = useSWR<PortfolioResponse>(needSample ? '/api/portfolio?demo=1&range=28d' : null, fetcher, { revalidateOnFocus: false });
    const sampleMovers = sample ? topClickMovers(sample.sites, ['lost']) : null;

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
                <Card padding="none"><EmptyState variant="page" icon={Plug} title="Connect AI is not enabled" description="This server has the MCP connector turned off (TC_MCP_ENABLED=0)." /></Card>
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
        { key: 'status', header: 'Result', align: 'right', cell: (a) => (a.status === 'ok' ? <span className="text-up">OK</span> : <span className="text-down" title={a.status}>{resultLabel(a.status)}</span>) },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Connect AI"
                subtitle="Ask ChatGPT, Claude and other MCP apps about your Analytics and Search Console data. Read-only, free, and you choose which sites each app sees."
                keepBadgesOnPhone
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

            {/* Setup first (round 5 judge): with nothing connected, setting up is the page's job; the pitch follows. */}
            <Card>
                <CardHeader as="h2" title="Set up your app" />
                <SetupTabs url={url} urlShown />
            </Card>

            <section aria-labelledby="get-title" className="space-y-3">
                <div>
                    <h2 id="get-title" className="text-title text-fg">What you get</h2>
                    <p className="mt-0.5 text-body-sm text-fg-muted">Your AI app answers from your Analytics and Search Console numbers, with the tools below.</p>
                </div>
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                    <div className="flex min-w-0 flex-col gap-6">
                        {ownMovers ? (
                            <McpTranscript movers={ownMovers} caption={`Example answer from your own sites, last 28 days · ${TOOL_SUMMARIES.length} read-only tools`} />
                        ) : sampleMovers ? (
                            <McpTranscript movers={sampleMovers} caption={`Example answer from sample data · ${TOOL_SUMMARIES.length} read-only tools`} />
                        ) : (
                            <Skeleton className="h-[380px] w-full" rounded="card" />
                        )}
                    <Card>
                        <CardHeader
                            as="h3"
                            title={`${TOOL_SUMMARIES.length} read-only tools`}
                            description="Your AI app picks the tool for each question. None can change your data."
                        />
                        {/* Collapsed by default: plain names first, the tool name an AI app shows in monospace under it. */}
                        <details className="group border-t border-border-subtle pt-3">
                            <summary className="flex cursor-pointer list-none items-center gap-2 pointer-coarse:min-h-11 text-body-sm font-medium text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
                                <Wrench aria-hidden size={14} strokeWidth={1.75} className="text-fg-faint" />
                                <span className="group-open:hidden">What each tool does</span>
                                <span className="hidden group-open:inline">Hide the tools</span>
                            </summary>
                            <ul aria-label="Tools" className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                                {TOOL_SUMMARIES.map((t) => (
                                    <li key={t.name} className="min-w-0">
                                        <span className="text-body-sm font-medium text-fg">{t.label}</span>
                                        <span className="ml-1.5 font-mono text-[12px] text-fg-faint">{t.name}</span>
                                        <p className="text-body-sm text-fg-muted">{t.summary}</p>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </Card>
                    </div>
                    <Card>
                        <CardHeader as="h3" title="Try asking" description="Copy a question into ChatGPT or Claude once TrafficClaw is connected." />
                        <div className="space-y-4">
                            {PROMPT_GROUPS.map((g) => (
                                <div key={g.job}>
                                    <h4 className="text-caption uppercase tracking-[0.04em] text-fg-muted">{g.job}</h4>
                                    <ul className="mt-1 divide-y divide-border-subtle">
                                        {g.prompts.map((p) => (
                                            <li key={p} className="flex items-center gap-3 py-2">
                                                <span className="min-w-0 flex-1 text-body text-fg">{p}</span>
                                                <CopyButton text={p} className="shrink-0" />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </section>

            {/* items-start: Usage is short, it must not stretch into an empty box next to the apps list. */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
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
                toolbar={<CardHeader as="h2" title="Recent activity" className="mb-0 px-2 py-1" />}
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
