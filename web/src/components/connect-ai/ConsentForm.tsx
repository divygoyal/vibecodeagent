'use client';

import { signIn, signOut } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { cx, s } from './styles';

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

function SiteBadges({ site }: { site: ConsentSite }) {
    return (
        <span className="ml-auto flex shrink-0 gap-1">
            {site.ga4 ? <span className={cx(s.badge, 'border border-[var(--tc-border)] text-[var(--tc-fg-muted)]')}>GA4</span> : null}
            {site.gsc ? <span className={cx(s.badge, 'border border-[var(--tc-border)] text-[var(--tc-fg-muted)]')}>GSC</span> : null}
        </span>
    );
}

export function ConsentForm(p: ConsentFormProps) {
    const [mode, setMode] = useState<'all' | 'selected'>('all');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const shown = useMemo(() => p.sites.filter((x) => x.site_id.includes(filter.trim().toLowerCase())), [p.sites, filter]);
    const canAllow = Boolean(p.signedIn && p.google?.connected) && (mode === 'all' || picked.size > 0);

    return (
        <form method="post" action="/oauth/authorize/decision" onSubmit={() => setSubmitting(true)} className="space-y-5">
            <input type="hidden" name="txn" value={p.txn} />
            <input type="hidden" name="csrf" value={p.csrf} />

            {!p.signedIn ? (
                <div className={cx(s.sunken, 'space-y-3 p-4')}>
                    <p className={s.body}>Sign in to TrafficClaw with the Google account that has your Analytics and Search Console access.</p>
                    <button type="button" onClick={() => signIn('google', { callbackUrl: p.returnUrl })} className={cx(s.btn, s.btnLg, 'w-full border border-[var(--tc-border)] bg-white text-[#1f1f1f] shadow-[var(--tc-shadow-xs)] hover:bg-[#f6f7f9]')}>
                        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                        Continue with Google
                    </button>
                </div>
            ) : (
                <>
                    <div className={cx(s.sunken, 'p-4')}>
                        <div className="flex items-center justify-between gap-3">
                            <span className={cx(s.titleSm, 'text-sm')}>Google connection</span>
                            {p.google?.connected ? (
                                <span className={cx(s.pill, 'bg-[var(--tc-up-soft)] text-[var(--tc-up)]')}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />Connected
                                </span>
                            ) : (
                                <span className={cx(s.pill, 'bg-[var(--tc-down-soft)] text-[var(--tc-down)]')}>{p.google?.reauth ? 'Expired' : 'Not connected'}</span>
                            )}
                        </div>
                        {p.google?.connected ? (
                            <p className={cx(s.bodySm, 'mt-1 tabular')}>{p.google.ga4} Analytics {p.google.ga4 === 1 ? 'property' : 'properties'} · {p.google.gsc} Search Console {p.google.gsc === 1 ? 'site' : 'sites'}</p>
                        ) : (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <p className={cx(s.bodySm, 'flex-1')}>Connect Google so TrafficClaw can read your Analytics and Search Console data.</p>
                                <button type="button" onClick={() => signIn('google', { callbackUrl: p.returnUrl }, { prompt: 'consent' })} className={cx(s.btn, s.btnSm, s.secondary)}>Connect Google</button>
                            </div>
                        )}
                    </div>

                    {p.google?.connected ? (
                        <fieldset className="space-y-2">
                            <legend className={cx(s.titleSm, 'mb-2 text-sm')}>Which sites?</legend>
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input type="radio" name="sites" value="all" checked={mode === 'all'} onChange={() => setMode('all')} className="mt-0.5 h-4 w-4 accent-[var(--tc-brand)]" />
                                <span className={s.body}>All my sites, including ones I add later <span className={s.muted}>({p.sites.length})</span></span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input type="radio" name="sites" value="selected" checked={mode === 'selected'} onChange={() => setMode('selected')} className="mt-0.5 h-4 w-4 accent-[var(--tc-brand)]" />
                                <span className={s.body}>Only selected sites{mode === 'selected' && picked.size ? <span className={s.muted}> ({picked.size} chosen)</span> : null}</span>
                            </label>
                            {mode === 'selected' ? (
                                <div className={cx(s.sunken, 'ml-6 p-2')}>
                                    {p.sites.length > 8 ? <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sites" aria-label="Filter sites" className={cx(s.input, 'mb-2 h-8')} /> : null}
                                    <div className="max-h-56 space-y-0.5 overflow-y-auto">
                                        {shown.map((site) => (
                                            <label key={site.site_id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--tc-subtle)]">
                                                <input
                                                    type="checkbox"
                                                    name="site"
                                                    value={site.site_id}
                                                    checked={picked.has(site.site_id)}
                                                    onChange={(e) => {
                                                        const next = new Set(picked);
                                                        if (e.target.checked) next.add(site.site_id);
                                                        else next.delete(site.site_id);
                                                        setPicked(next);
                                                    }}
                                                    className="h-4 w-4 shrink-0 accent-[var(--tc-brand)]"
                                                />
                                                <span className={cx(s.body, 'min-w-0 truncate')}>{site.site_id}</span>
                                                <SiteBadges site={site} />
                                            </label>
                                        ))}
                                        {shown.length === 0 ? <p className={cx(s.meta, 'px-2 py-1.5')}>No sites match.</p> : null}
                                    </div>
                                </div>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-2.5 pt-2">
                                <input type="checkbox" name="exclude_queries" value="1" className="mt-0.5 h-4 w-4 accent-[var(--tc-brand)]" />
                                <span className={s.body}>Don&apos;t share search queries <span className={cx(s.bodySm, 'block')}>{p.appName} still sees totals, pages and trends.</span></span>
                            </label>
                        </fieldset>
                    ) : null}
                </>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <button type="submit" name="action" value="deny" disabled={submitting} className={cx(s.btn, s.btnLg, s.secondary, 'sm:w-auto')}>Cancel</button>
                <button type="submit" name="action" value="allow" disabled={!canAllow || submitting} className={cx(s.btn, s.btnLg, s.primary, 'sm:ml-auto sm:min-w-[140px]')}>Allow</button>
            </div>
            {p.demoAllowed ? (
                <div className="flex items-center justify-center border-t border-[var(--tc-border-subtle)] pt-4">
                    <button type="submit" name="action" value="demo" disabled={submitting} className={cx(s.btn, s.btnSm, s.ghost, 'underline-offset-4 hover:underline')}>Use demo data instead (no Google account needed)</button>
                </div>
            ) : null}
            {p.signedIn ? (
                <p className={cx(s.meta, 'text-center')}>
                    Signed in as {p.signedIn.email || p.signedIn.name || 'you'}.{' '}
                    <button type="button" onClick={() => signOut({ callbackUrl: p.returnUrl })} className="underline underline-offset-4 hover:text-[var(--tc-fg)]">Not you?</button>
                </p>
            ) : null}
        </form>
    );
}
