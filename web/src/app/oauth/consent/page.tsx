import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AlertTriangle, Check, Laptop, ShieldCheck, X } from 'lucide-react';
import { ConsentForm, type ConsentSite } from '@/components/connect-ai/ConsentForm';
import { cx, s } from '@/components/connect-ai/styles';
import '@/components/connect-ai/connect-ai.css';
import { dashboardConnectPath, demoGrantsEnabled, issuer, mcpEnabled } from '@/lib/mcp/config';
import { getSessionUser } from '@/lib/mcp/session';
import { loadSessionSites, type SessionSites } from '@/lib/mcp/sessionSites';
import { ClientError, getClient, verifiedClientName, type ClientInfo } from '@/lib/oauth/clients';
import { classifyRedirectUri, safeEqual } from '@/lib/oauth/primitives';
import { csrfBinding, csrfCookieName, decodeTxn } from '@/lib/oauth/txn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an AI app · TrafficClaw', robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className={cx('tc-cai min-h-screen px-4 py-8 sm:py-14', s.canvas)}>
            <div className="mx-auto w-full max-w-[520px]">
                <div className="mb-5 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--tc-brand)] text-[13px] font-semibold text-[var(--tc-brand-fg)]" aria-hidden>T</span>
                    <span className="text-[15px] font-semibold tracking-[-0.02em]">TrafficClaw</span>
                </div>
                {children}
            </div>
        </div>
    );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
    return (
        <Shell>
            <div className={cx(s.card, 'p-6')} role="alert">
                <h1 className={s.title}>{title}</h1>
                <p className={cx(s.bodySm, 'mt-2')}>{message}</p>
            </div>
        </Shell>
    );
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    if (!mcpEnabled()) return <ErrorCard title="Not available" message="Connecting AI apps is not enabled on this server." />;
    const params = await searchParams;
    const rawTxn = typeof params.txn === 'string' ? params.txn : '';
    const txn = decodeTxn(rawTxn);
    const jar = await cookies();
    const csrf = jar.get(csrfCookieName())?.value ?? '';
    if (!txn || !csrf || !safeEqual(csrfBinding(csrf), txn.n)) {
        return <ErrorCard title="This approval link expired" message="Start the connection again from your AI app. Links work for 30 minutes in the browser that opened them." />;
    }

    let client: ClientInfo;
    try {
        client = await getClient(txn.c);
    } catch (err) {
        return <ErrorCard title="This app could not be identified" message={err instanceof ClientError ? `${err.message}. Start again from your AI app.` : 'Start again from your AI app.'} />;
    }

    const verifiedName = verifiedClientName(client.client_id, txn.r);
    const redirect = classifyRedirectUri(txn.r);
    const redirectLabel = redirect.ok ? redirect.host : 'unknown';
    const local = redirect.ok && (redirect.kind === 'loopback' || redirect.kind === 'custom');
    const appName = verifiedName ?? client.client_name;
    const identity = client.kind === 'cimd' ? client.client_host : null;

    const signedIn = await getSessionUser();
    let sites: SessionSites | null = null;
    if (signedIn) {
        try {
            sites = await loadSessionSites(signedIn.user);
        } catch {
            sites = null;
        }
    }
    const consentSites: ConsentSite[] = (sites?.sites ?? []).map((x) => ({ site_id: x.site_id, ga4: Boolean(x.ga4), gsc: Boolean(x.gsc) }));
    const returnUrl = `/oauth/consent?txn=${encodeURIComponent(rawTxn)}`;
    const dash = `${issuer().replace(/^https?:\/\//, '')}${dashboardConnectPath()}`;

    return (
        <Shell>
            <main className={cx(s.card, 'p-5 sm:p-6')}>
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className={s.title}>{appName}</h1>
                    {verifiedName ? (
                        <span className={cx(s.pill, 'bg-[var(--tc-brand-soft)] text-[var(--tc-brand-soft-fg)]')}><ShieldCheck size={14} strokeWidth={1.75} aria-hidden />Verified app</span>
                    ) : null}
                </div>
                <p className={cx(s.bodySm, 'mt-1')}>
                    wants to connect to your TrafficClaw account.{' '}
                    {identity ? <>App identity: <span className={s.mono}>{identity}</span>. </> : null}
                    Sends you back to <span className={cx(s.mono, 'text-[var(--tc-fg)]')}>{redirectLabel}</span>.
                </p>

                {!verifiedName ? (
                    <div className="mt-4 flex gap-3 rounded-lg border border-[color-mix(in_oklab,var(--tc-warn)_25%,transparent)] bg-[var(--tc-warn-soft)] p-3.5" role="note">
                        <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--tc-warn)]" aria-hidden />
                        <div className="text-[13px] leading-[18px] text-[var(--tc-fg)]">
                            <p className="font-medium">TrafficClaw can&apos;t verify this app.</p>
                            <p className="mt-0.5 text-[var(--tc-fg-secondary)]">{client.kind === 'dcr' ? 'It registered itself and its name is not checked. ' : ''}Only continue if you just started this from your AI tool.</p>
                        </div>
                    </div>
                ) : null}
                {local ? (
                    <p className={cx(s.bodySm, 'mt-3 flex items-center gap-2')}><Laptop size={14} strokeWidth={1.75} aria-hidden />This app runs on your computer ({redirectLabel}).</p>
                ) : null}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                        <h2 className={cx(s.meta, 'mb-2 font-medium uppercase tracking-[0.04em]')}>It will be able to</h2>
                        <ul className="space-y-1.5">
                            {['See which Analytics properties and Search Console sites you have', 'Read traffic, engagement and search numbers for them'].map((t) => (
                                <li key={t} className={cx(s.body, 'flex gap-2')}><Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--tc-up)]" aria-hidden />{t}</li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className={cx(s.meta, 'mb-2 font-medium uppercase tracking-[0.04em]')}>It can not</h2>
                        <ul className="space-y-1.5">
                            {['Change anything in Analytics, Search Console or TrafficClaw', 'See Gmail, Drive or any other Google data'].map((t) => (
                                <li key={t} className={cx(s.body, 'flex gap-2')}><X size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--tc-fg-muted)]" aria-hidden />{t}</li>
                            ))}
                        </ul>
                    </div>
                </div>
                <p className={cx(s.meta, 'mt-3')}>GA4 provides no visitor-level personal data.</p>

                <div className="mt-5 border-t border-[var(--tc-border-subtle)] pt-5">
                    <ConsentForm
                        txn={rawTxn}
                        csrf={csrf}
                        appName={appName}
                        signedIn={signedIn ? { email: signedIn.user.email, name: signedIn.user.name } : null}
                        google={signedIn ? { connected: Boolean(sites?.connected), reauth: Boolean(sites?.reauthRequired), ga4: sites?.ga4Count ?? 0, gsc: sites?.gscCount ?? 0 } : null}
                        sites={consentSites}
                        demoAllowed={demoGrantsEnabled()}
                        returnUrl={returnUrl}
                    />
                </div>
            </main>
            <p className={cx(s.meta, 'mt-4 px-1')}>
                {appName} writes the answers itself. TrafficClaw only sends it the numbers it asks for, and {appName}&apos;s own privacy policy applies to what it does with them. Disconnect any time at <span className={s.mono}>{dash}</span>.
            </p>
        </Shell>
    );
}
