import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Check, Laptop, X } from 'lucide-react';
import { ConsentForm, type ConsentSite } from '@/components/connect-ai/ConsentForm';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';
import { Banner, Card, VerifiedBadge } from '@/components/ui';
import { dashboardConnectPath, demoGrantsEnabled, issuer, mcpEnabled } from '@/lib/mcp/config';
import { getSessionUser } from '@/lib/mcp/session';
import { loadSessionSites, type SessionSites } from '@/lib/mcp/sessionSites';
import { ClientError, getClient, verifiedClientName, type ClientInfo } from '@/lib/oauth/clients';
import { classifyRedirectUri, safeEqual } from '@/lib/oauth/primitives';
import { csrfBinding, csrfCookieName, decodeTxn } from '@/lib/oauth/txn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an AI app', robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="tc-root min-h-dvh bg-canvas px-4 py-8 text-fg sm:py-14">
            <div className="mx-auto w-full max-w-[520px]">
                <div className="mb-5 flex items-center gap-2">
                    <BrandMark size={28} />
                    <Wordmark />
                </div>
                {children}
            </div>
        </div>
    );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
    return (
        <Shell>
            <Card padding="lg" role="alert">
                <h1 className="text-title text-fg">{title}</h1>
                <p className="mt-2 text-body text-fg-secondary">{message}</p>
            </Card>
        </Shell>
    );
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    if (!mcpEnabled()) return <ErrorCard title="Not available" message="Connecting AI apps is not enabled on this server." />;
    const params = await searchParams;
    const rawTxn = typeof params.txn === 'string' ? params.txn : '';
    const txn = decodeTxn(rawTxn);
    const csrf = (await cookies()).get(csrfCookieName())?.value ?? '';
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
            <Card as="section" className="p-5 sm:p-6" aria-labelledby="consent-title">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 id="consent-title" className="text-title text-fg">{appName}</h1>
                    {verifiedName ? <VerifiedBadge label="Verified app" tooltip={`TrafficClaw recognises this app's identity (${identity ?? 'known client'}).`} /> : null}
                </div>
                <p className="mt-1 text-body text-fg-secondary">
                    wants to connect to your TrafficClaw account.{' '}
                    {identity ? <>App identity: <span className="font-mono text-[13px] text-fg">{identity}</span>. </> : null}
                    Sends you back to <span className="font-mono text-[13px] text-fg">{redirectLabel}</span>.
                </p>

                {!verifiedName ? (
                    <Banner variant="warn" className="mt-4" title="TrafficClaw can't verify this app">
                        {client.kind === 'dcr' ? 'It registered itself and its name is not checked. ' : ''}Only continue if you just started this from your AI tool.
                    </Banner>
                ) : null}
                {local ? (
                    <p className="mt-3 flex items-center gap-2 text-body-sm text-fg-muted"><Laptop aria-hidden size={14} strokeWidth={1.75} />This app runs on your computer ({redirectLabel}).</p>
                ) : null}

                <div className="mt-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <div>
                        <h2 className="mb-2 text-caption uppercase tracking-[0.04em] text-fg-muted">It will be able to</h2>
                        <ul className="space-y-1.5">
                            {['See which Analytics properties and Search Console sites you have', 'Read traffic, engagement and search numbers for them'].map((t) => (
                                <li key={t} className="flex gap-2 text-body text-fg"><Check aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-up" />{t}</li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className="mb-2 text-caption uppercase tracking-[0.04em] text-fg-muted">It can not</h2>
                        <ul className="space-y-1.5">
                            {['Change anything in Analytics, Search Console or TrafficClaw', 'See Gmail, Drive or any other Google data'].map((t) => (
                                <li key={t} className="flex gap-2 text-body text-fg"><X aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-muted" />{t}</li>
                            ))}
                        </ul>
                    </div>
                </div>
                <p className="mt-3 text-meta text-fg-muted">GA4 provides no visitor-level personal data.</p>

                <div className="mt-5 border-t border-border-subtle pt-5">
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
            </Card>
            <p className="mt-4 px-1 text-meta text-fg-muted">
                {appName} writes the answers itself. TrafficClaw only sends it the numbers it asks for, and {appName}&apos;s own privacy policy applies to what it does with them. Disconnect any time at <span className="font-mono">{dash}</span>.
            </p>
        </Shell>
    );
}
