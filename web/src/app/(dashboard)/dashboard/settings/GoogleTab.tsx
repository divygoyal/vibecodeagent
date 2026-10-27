'use client';

import { signIn, useSession } from 'next-auth/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BarChart3, ExternalLink, ListChecks, Search, ShieldCheck, Unlink, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { SettingsSection } from '@/components/app/SettingsSection';
import { Avatar } from '@/components/ui/Avatar';
import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; provider?: string };

const SCOPES = [
    {
        icon: Search,
        title: 'See your Search Console data',
        body: 'Queries, pages, clicks, impressions and position for the sites you have access to. Read only.',
        scope: 'webmasters.readonly',
    },
    {
        icon: BarChart3,
        title: 'See your Google Analytics data',
        body: 'Users, sessions, channels, pages and events for your GA4 properties. Read only.',
        scope: 'analytics.readonly',
    },
    {
        icon: UserRound,
        title: 'Know who you are',
        body: 'Your name, email address and profile photo, to sign you in.',
        scope: 'openid email profile',
    },
] as const;

/** One Google connection as GET /api/google/connections returns it (metadata only, no tokens). */
interface ConnectionView {
    id: string;
    primary: boolean;
    email: string | null;
    name: string | null;
    status: 'connected' | 'needs_reconnect';
    ga4: number;
    gsc: number;
    lastSyncedAt: number | null;
}

const LINK_RESULTS: Record<string, { kind: 'success' | 'info' | 'error'; text: string }> = {
    added: { kind: 'success', text: 'Google account added. Its sites appear in your portfolio after the next sync.' },
    updated: { kind: 'success', text: 'Google account reconnected.' },
    same: { kind: 'info', text: 'That is the Google account you signed in with. It is already connected.' },
    cancelled: { kind: 'info', text: 'No Google account was added.' },
    scopes: { kind: 'error', text: 'Allow both Search Console and Analytics on Google\'s screen, then try again.' },
    limit: { kind: 'error', text: 'You have connected the most Google accounts we allow. Disconnect one first.' },
    expired: { kind: 'error', text: 'That took too long or was opened in another tab. Try again.' },
    signed_out: { kind: 'error', text: 'You were signed out while Google was open. Sign in and try again.' },
    failed: { kind: 'error', text: 'Could not add that Google account. Try again.' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function syncedText(s: number | null): string {
    if (!s) return 'Not synced yet';
    const mins = Math.max(0, Math.round((Date.now() / 1000 - s) / 60));
    if (mins < 2) return 'Synced just now';
    if (mins < 60) return `Synced ${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `Synced ${hours} h ago`;
    return `Synced ${Math.round(hours / 24)} days ago`;
}

/** Google connections (DESIGN 5.14): the sign-in account, extra accounts, Reconnect / Disconnect, and what each permission is for. */
export function GoogleTab({ connected }: { connected: boolean }) {
    const { data: session } = useSession();
    const user = session?.user as SessionUser | undefined;
    const router = useRouter();
    const searchParams = useSearchParams();
    const [connecting, setConnecting] = useState(false);
    const [connections, setConnections] = useState<ConnectionView[] | null>(null);
    const [maxLinked, setMaxLinked] = useState(10);
    const [loadError, setLoadError] = useState(false);
    const [confirm, setConfirm] = useState<ConnectionView | null>(null);
    const [removing, setRemoving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/google/connections', { cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json() as { connections: ConnectionView[]; maxLinked?: number };
            setConnections(data.connections);
            if (data.maxLinked) setMaxLinked(data.maxLinked);
            setLoadError(false);
        } catch {
            setLoadError(true);
            setConnections((c) => c ?? []);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    // Back from the "Add another Google account" round trip (`?link=<result>`): toast, clean the URL.
    const linkResult = searchParams.get('link');
    useEffect(() => {
        if (!linkResult) return;
        const r = LINK_RESULTS[linkResult] ?? LINK_RESULTS.failed;
        if (r.kind === 'success') toast.success(r.text);
        else if (r.kind === 'info') toast.info(r.text);
        else toast.error(r.text);
        const params = new URLSearchParams(window.location.search);
        params.delete('link');
        const qs = params.toString();
        router.replace(`/dashboard/settings${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [linkResult, router]);

    const reconnectPrimary = () => {
        setConnecting(true);
        void signIn('google', { callbackUrl: '/dashboard/settings?tab=google&connected=google' }, { prompt: 'select_account consent' });
    };
    // A full-page navigation: the server starts Google's consent screen (own OAuth flow, not a sign-in).
    const startLink = (reconnect?: string) => {
        window.location.assign(`/api/google/link/start${reconnect ? `?reconnect=${encodeURIComponent(reconnect)}` : ''}`);
    };

    const disconnect = async () => {
        if (!confirm) return;
        setRemoving(true);
        try {
            const res = await fetch(`/api/google/connections/${encodeURIComponent(confirm.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(String(res.status));
            toast.success(`Disconnected ${confirm.email ?? 'that Google account'}. Its sites no longer show.`);
            setConfirm(null);
            await load();
        } catch {
            toast.error('Could not disconnect it. Try again.');
        } finally {
            setRemoving(false);
        }
    };

    const list = connections ?? [];
    const primary = list.find((c) => c.primary);
    const extra = list.filter((c) => !c.primary);
    const hasPrimary = connected || Boolean(primary);
    const signedInAs = user?.email ?? primary?.email ?? null;

    return (
        <>
            <SettingsSection
                title="Google accounts"
                description="TrafficClaw reads Search Console and Analytics through these accounts, read only. Add another account for sites that live in a client's or a work Google account."
            >
                {connections === null ? (
                    <div aria-busy className="flex flex-col gap-3">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : (
                    <ul className="flex flex-col divide-y divide-border" aria-label="Connected Google accounts">
                        {hasPrimary ? (
                            <ConnectionRow
                                primaryLabel={user?.provider === 'github' ? 'Main account' : 'Sign-in account'}
                                c={primary ?? { id: 'primary', primary: true, email: signedInAs, name: user?.name ?? null, status: 'connected', ga4: 0, gsc: 0, lastSyncedAt: null }}
                                action={(
                                    <Button variant="secondary" size="sm" loading={connecting} onClick={reconnectPrimary}>Reconnect</Button>
                                )}
                            />
                        ) : null}
                        {extra.map((c) => (
                            <ConnectionRow
                                key={c.id}
                                c={c}
                                action={(
                                    <>
                                        {c.status === 'needs_reconnect' ? (
                                            <Button variant="primary" size="sm" onClick={() => startLink(c.id)}>Reconnect</Button>
                                        ) : null}
                                        <Button variant="ghost" size="sm" icon={Unlink} onClick={() => setConfirm(c)}>Disconnect</Button>
                                    </>
                                )}
                            />
                        ))}
                    </ul>
                )}
                {loadError ? <Banner variant="warn" className="mt-3">Could not load the account list. Refresh the page to try again.</Banner> : null}
                {!hasPrimary && connections !== null && extra.length === 0 ? (
                    <Banner variant="warn" className="mt-4">Without a Google connection there is no data to show. Connect once and every site you can open in Google appears in your portfolio.</Banner>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    {hasPrimary ? (
                        <Button variant="google" onClick={() => startLink()} disabled={extra.length >= maxLinked}>
                            <GoogleMark />Add another Google account
                        </Button>
                    ) : (
                        <Button variant="google" loading={connecting} onClick={reconnectPrimary}><GoogleMark />Connect Google</Button>
                    )}
                    <p className="min-w-0 flex-1 basis-56 text-body-sm text-fg-muted">
                        {hasPrimary && signedInAs
                            ? <>You stay signed in as <span className="text-fg-secondary">{signedInAs}</span>. Extra accounts only add data.</>
                            : 'Connect once and every site you can open in Google appears in your portfolio.'}
                    </p>
                </div>
                {hasPrimary ? (
                    <p className="mt-3 text-body-sm text-fg-muted">
                        Reconnect if a site is missing or Google asked you to sign in again.{' '}
                        <Link href="/dashboard/setup" className="text-fg-secondary underline decoration-border-strong underline-offset-2 hover:text-fg">Review your sites</Link>
                    </p>
                ) : null}
            </SettingsSection>

            <Modal
                open={confirm !== null}
                onOpenChange={(o) => { if (!o) setConfirm(null); }}
                size="sm"
                title="Disconnect this Google account?"
                description={confirm?.email ? `${confirm.email} will no longer be read. Its sites stop showing in your portfolio, dashboards and Ask.` : undefined}
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setConfirm(null)}>Keep it</Button>
                        <Button variant="danger" loading={removing} onClick={() => void disconnect()}>Disconnect</Button>
                    </>
                )}
            >
                <p className="text-body-sm text-fg-secondary">
                    We delete its access token. Stored history is kept, hidden, and comes back if you connect the account again.
                    To remove TrafficClaw from that Google account entirely, also visit its{' '}
                    <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-brand-text underline underline-offset-2">Google account permissions</a>.
                </p>
            </Modal>

            <SettingsSection title="What you are allowing" description="We ask for the smallest set of permissions that does the job.">
                <ul className="flex flex-col gap-4">
                    {SCOPES.map((s) => {
                        const Icon = s.icon;
                        return (
                            <li key={s.scope} className="flex items-start gap-3">
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                                    <Icon aria-hidden size={16} strokeWidth={1.75} />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-body font-medium text-fg">{s.title}</p>
                                    <p className="mt-0.5 text-body-sm text-fg-muted">{s.body}</p>
                                    <code className="mt-1 inline-block rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">{s.scope}</code>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <div className="mt-5 flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-body-sm text-fg-secondary">
                    <ListChecks aria-hidden size={16} className="mt-0.5 shrink-0 text-fg-muted" />
                    <p>
                        We never change anything in your Google accounts: no editing properties, no verifying sites, no sending email.
                        You can remove our access at any time in your{' '}
                        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text underline underline-offset-2">
                            Google account permissions<ExternalLink aria-hidden size={14} />
                        </a>.
                    </p>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-meta text-fg-muted"><ShieldCheck aria-hidden size={14} />Tokens are encrypted on our servers.</p>
            </SettingsSection>
        </>
    );
}

function ConnectionRow({ c, action, primaryLabel = 'Sign-in account' }: { c: ConnectionView; action: ReactNode; primaryLabel?: string }) {
    const label = c.email ?? c.name ?? 'Google account';
    const needs = c.status === 'needs_reconnect';
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 first:pt-0 last:pb-0" data-connection={c.primary ? 'primary' : 'linked'}>
            <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                <Avatar name={label.replace(/@.*/, '')} size={40} />
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
                        <span className="min-w-0 truncate">{label}</span>
                        {c.primary ? <Pill tone="neutral">{primaryLabel}</Pill> : null}
                        <Pill tone={needs ? 'warn' : 'up'} dot>{needs ? 'Needs reconnect' : 'Connected'}</Pill>
                    </p>
                    <p className="mt-0.5 text-body-sm text-fg-muted">
                        {needs
                            ? 'Google stopped accepting this connection. Reconnect to read its sites again.'
                            : `${plural(c.ga4, 'GA4 property', 'GA4 properties')} · ${plural(c.gsc, 'Search Console site', 'Search Console sites')} · ${syncedText(c.lastSyncedAt)}`}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">{action}</div>
        </li>
    );
}
