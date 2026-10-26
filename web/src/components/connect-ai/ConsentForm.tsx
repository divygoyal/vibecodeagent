'use client';

import { signIn, signOut } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { Badge, Banner, Button, Checkbox, GoogleMark, Pill, RadioGroup, SearchInput } from '@/components/ui';
import { RADIX_TOUCH_FIX } from './touchFix';

export interface ConsentSite {
    site_id: string;
    ga4: boolean;
    gsc: boolean;
}

export interface ConsentFormProps {
    txn: string;
    csrf: string;
    appName: string;
    signedIn: { email: string | null; name: string | null } | null;
    google: { connected: boolean; reauth: boolean; ga4: number; gsc: number } | null;
    sites: ConsentSite[];
    demoAllowed: boolean;
    returnUrl: string;
}

/**
 * The consent form posts natively to /oauth/authorize/decision (no client
 * fetch), so the decision route can answer with a redirect to the AI app.
 * Radix controls drive hidden inputs that carry the values.
 */
export function ConsentForm(p: ConsentFormProps) {
    const [mode, setMode] = useState<'all' | 'selected'>('all');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [hideQueries, setHideQueries] = useState(false);
    const [filter, setFilter] = useState('');
    const [submitting, setSubmitting] = useState<string | null>(null);
    const shown = useMemo(() => p.sites.filter((x) => x.site_id.includes(filter.trim().toLowerCase())), [p.sites, filter]);
    const connected = Boolean(p.signedIn && p.google?.connected);
    const canAllow = connected && (mode === 'all' || picked.size > 0);

    return (
        <form method="post" action="/oauth/authorize/decision" className={`space-y-5 ${RADIX_TOUCH_FIX}`} onSubmit={(e) => {
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            setSubmitting(submitter?.value ?? 'allow');
        }}>
            <input type="hidden" name="txn" value={p.txn} />
            <input type="hidden" name="csrf" value={p.csrf} />
            <input type="hidden" name="sites" value={mode} />
            {mode === 'selected' ? Array.from(picked).map((id) => <input key={id} type="hidden" name="site" value={id} />) : null}
            {hideQueries ? <input type="hidden" name="exclude_queries" value="1" /> : null}

            {!p.signedIn ? (
                <div className="space-y-3 rounded-control border border-border-subtle bg-surface-sunken p-4">
                    <p className="text-body text-fg">Sign in to TrafficClaw with the Google account that can see your Analytics and Search Console data.</p>
                    <Button variant="google" size="lg" className="w-full" onClick={() => signIn('google', { callbackUrl: p.returnUrl })}>
                        <GoogleMark />Continue with Google
                    </Button>
                </div>
            ) : (
                <>
                    <div className="rounded-control border border-border-subtle bg-surface-sunken p-4">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-body font-medium text-fg">Google connection</span>
                            {p.google?.connected ? <Pill tone="up" dot>Connected</Pill> : <Pill tone="down" dot>{p.google?.reauth ? 'Expired' : 'Not connected'}</Pill>}
                        </div>
                        {p.google?.connected ? (
                            <p className="mt-1 text-body-sm text-fg-muted tabular-nums">
                                {p.google.ga4} Analytics {p.google.ga4 === 1 ? 'property' : 'properties'} · {p.google.gsc} Search Console {p.google.gsc === 1 ? 'site' : 'sites'}
                            </p>
                        ) : (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <p className="min-w-0 flex-1 basis-[220px] text-body-sm text-fg-muted">Connect Google so TrafficClaw can read your Analytics and Search Console data.</p>
                                <Button size="sm" onClick={() => signIn('google', { callbackUrl: p.returnUrl }, { prompt: 'consent' })}>Connect Google</Button>
                            </div>
                        )}
                    </div>

                    {connected ? (
                        <div className="space-y-3">
                            <h2 className="text-title-sm text-fg">Which sites?</h2>
                            <RadioGroup
                                ariaLabel="Which sites"
                                value={mode}
                                onValueChange={setMode}
                                options={[
                                    { value: 'all', label: <>All my sites, including ones I add later <span className="text-fg-muted tabular-nums">({p.sites.length})</span></> },
                                    { value: 'selected', label: <>Only selected sites{picked.size ? <span className="text-fg-muted tabular-nums"> ({picked.size} chosen)</span> : null}</> },
                                ]}
                            />
                            {mode === 'selected' ? (
                                <div className="ml-6 rounded-control border border-border-subtle bg-surface-sunken p-2">
                                    {p.sites.length > 8 ? <SearchInput value={filter} onValueChange={setFilter} placeholder="Filter sites" size="sm" className="mb-2 w-full md:w-full" /> : null}
                                    <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                                        {shown.map((site) => (
                                            <li key={site.site_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-subtle">
                                                <Checkbox
                                                    className="min-w-0 flex-1"
                                                    label={<span className="block truncate">{site.site_id}</span>}
                                                    checked={picked.has(site.site_id)}
                                                    onCheckedChange={(v) => {
                                                        const next = new Set(picked);
                                                        if (v) next.add(site.site_id);
                                                        else next.delete(site.site_id);
                                                        setPicked(next);
                                                    }}
                                                />
                                                <span className="flex shrink-0 gap-1">
                                                    {site.ga4 ? <Badge>GA4</Badge> : null}
                                                    {site.gsc ? <Badge>GSC</Badge> : null}
                                                </span>
                                            </li>
                                        ))}
                                        {shown.length === 0 ? <li className="px-2 py-1.5 text-meta text-fg-muted">No sites match.</li> : null}
                                    </ul>
                                </div>
                            ) : null}
                            <Checkbox
                                className="pt-1"
                                checked={hideQueries}
                                onCheckedChange={setHideQueries}
                                label="Don't share search queries"
                                description={`${p.appName} still sees totals, pages and trends.`}
                            />
                        </div>
                    ) : null}
                </>
            )}

            {p.signedIn && p.google && !p.google.connected && p.google.reauth ? (
                <Banner variant="warn">Your Google sign-in expired. Reconnect it, or use demo data for now.</Banner>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <Button type="submit" name="action" value="deny" size="lg" loading={submitting === 'deny'} disabled={submitting !== null}>Cancel</Button>
                {p.signedIn ? (
                    <Button type="submit" name="action" value="allow" variant="primary" size="lg" className="sm:ml-auto sm:min-w-[140px]" loading={submitting === 'allow'} disabled={!canAllow || submitting !== null}>Allow</Button>
                ) : null}
            </div>
            {p.demoAllowed ? (
                <div className="flex justify-center border-t border-border-subtle pt-4">
                    <Button type="submit" name="action" value="demo" variant="link" size="sm" loading={submitting === 'demo'} disabled={submitting !== null}>Use demo data instead (no Google account needed)</Button>
                </div>
            ) : null}
            {p.signedIn ? (
                <p className="text-center text-meta text-fg-muted">
                    Signed in as {p.signedIn.email || p.signedIn.name || 'you'}.{' '}
                    <button type="button" onClick={() => signOut({ callbackUrl: p.returnUrl })} className="underline underline-offset-4 hover:text-fg">Not you?</button>
                </p>
            ) : null}
        </form>
    );
}
