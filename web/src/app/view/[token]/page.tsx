'use client';

/**
 * Public dashboard (share link and embed). v1 shares render through the v2 viewer.
 * /view/<token>[?embed=1|true][&theme=light|dark][&page=][&range=][&compare=][&f.<id>=]
 * Data comes from GET /api/dashboards/public/<token>/query with the owner's access, cached;
 * the page never sees property ids or site URLs.
 */
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { signIn } from 'next-auth/react';
import { Copy, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button, EmptyState, Skeleton } from '@/components/ui';
import { DashboardView, useUrlControls } from '@/components/dashboard-builder/DashboardView';
import { DashboardBrandHeader, MadeWithBadge } from '@/components/dashboard-builder/DashboardBrandHeader';
import { fetchJson, publicPageLoader, QueryHttpError, usePageResults } from '@/components/dashboard-builder/useWidgetData';
import { canonicalJson } from '@/lib/builder/compile';
import { compareToParam, rangeToParam } from '@/lib/builder/dates';
import type { DashboardDocV2, PublicDashboard } from '@/lib/builder/types';

const keyName = (token: string) => `tc_dash_key_${token.slice(0, 12)}`;

function readKey(token: string): string | null {
    try {
        return sessionStorage.getItem(keyName(token));
    } catch {
        return null;
    }
}

export default function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} />
        </Suspense>
    );
}

function useThemeMode(param: string | null, docMode?: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
    const [os, setOs] = useState<'light' | 'dark'>('light');
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const f = () => setOs(mq.matches ? 'dark' : 'light');
        f();
        mq.addEventListener('change', f);
        return () => mq.removeEventListener('change', f);
    }, []);
    if (param === 'light' || param === 'dark') return param;
    if (docMode === 'auto') return os;
    return docMode ?? 'light';
}

function PublicDashboard({ token }: { token: string }) {
    const sp = useSearchParams();
    const embed = sp.get('embed') === '1' || sp.get('embed') === 'true';
    const preview = sp.get('preview') === '1';
    const [unlockKey, setUnlockKey] = useState<string | null>(() => (typeof window === 'undefined' ? null : readKey(token)));
    const docKey = `/api/dashboards/public/${token}${preview ? '?preview=1' : ''}`;
    const { data, error, mutate } = useSWR<{ dashboard: PublicDashboard }>([docKey, unlockKey], () => fetchJson(docKey, { headers: unlockKey ? { Authorization: `Bearer ${unlockKey}` } : undefined }), { revalidateOnFocus: false });
    const pub = data?.dashboard;
    const theme = useThemeMode(sp.get('theme'), pub?.doc?.theme.mode);

    const frame = (children: React.ReactNode) => (
        <div data-theme={theme} className="tc-root min-h-dvh bg-canvas text-fg">
            <div className={embed ? 'p-3 sm:p-4' : 'mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8'}>{children}</div>
        </div>
    );

    if (error) {
        const gone = error instanceof QueryHttpError && error.status === 404;
        return frame(<EmptyState variant="page" title={gone ? 'This dashboard is no longer shared' : 'Could not load this dashboard'} description={gone ? 'Ask the owner for a new link.' : 'Try again in a minute.'} />);
    }
    if (!pub) return frame(<div className="flex flex-col gap-4"><Skeleton className="h-8 w-72" /><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" rounded="card" />)}</div><Skeleton className="h-72" rounded="card" /></div>);
    if (pub.requiresPassword && !pub.unlocked) {
        return frame(<PasswordGate token={token} name={pub.name} onUnlocked={(k) => { try { sessionStorage.setItem(keyName(token), k); } catch { /* private mode */ } setUnlockKey(k); void mutate(); }} />);
    }
    if (!pub.doc) return frame(<EmptyState variant="page" title="This dashboard is no longer shared" />);
    return frame(<Loaded token={token} pub={pub} doc={pub.doc as unknown as DashboardDocV2} unlockKey={unlockKey} embed={embed} />);
}

function PasswordGate({ token, name, onUnlocked }: { token: string; name: string; onUnlocked: (key: string) => void }) {
    const [pw, setPw] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    return (
        <div className="mx-auto mt-16 max-w-sm rounded-card border border-border-subtle bg-surface p-6 shadow-card">
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-subtle text-fg-muted"><Lock aria-hidden size={18} /></span>
            <h1 className="text-title text-fg">{name}</h1>
            <p className="mt-1 text-body text-fg-secondary">This dashboard is password protected.</p>
            <form className="mt-4 space-y-3" onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr(null);
                try {
                    const r = await fetchJson<{ key: string }>(`/api/dashboards/public/${token}/unlock`, { method: 'POST', body: JSON.stringify({ password: pw }) });
                    onUnlocked(r.key);
                } catch (x) {
                    setErr(x instanceof Error ? x.message : 'That password is not right.');
                } finally {
                    setBusy(false);
                }
            }}>
                <input type="password" autoFocus aria-label="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-10 w-full rounded-control border border-border bg-surface px-3 text-body text-fg" />
                {err ? <p role="alert" className="text-body-sm text-down">{err}</p> : null}
                <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!pw}>View dashboard</Button>
            </form>
        </div>
    );
}

function Loaded({ token, pub, doc, unlockKey, embed }: { token: string; pub: PublicDashboard; doc: DashboardDocV2; unlockKey: string | null; embed: boolean }) {
    const allow = pub.share?.viewerControls ?? { date: false, compare: false, filters: false };
    const ctl = useUrlControls(doc, allow);
    const query = useMemo(() => {
        const q = new URLSearchParams();
        if (ctl.state.pageId) q.set('page', ctl.state.pageId);
        q.set('range', rangeToParam(ctl.state.date.range));
        q.set('compare', compareToParam(ctl.state.date.compare));
        for (const [k, v] of Object.entries(ctl.state.filters)) if (v.length) q.set(`f.${k}`, v.join(','));
        return q;
    }, [ctl.state]);
    const page = usePageResults(`pub:${token}:${pub.rev}:${canonicalJson(ctl.state)}:${unlockKey ?? ''}`, publicPageLoader(token, query, unlockKey), doc.settings.autoRefreshSec ? doc.settings.autoRefreshSec * 1000 : 300_000);
    const rootRef = useRef<HTMLDivElement>(null);

    // Embeds report their height so the host page can size the iframe (PostHog-style).
    useEffect(() => {
        if (!embed || typeof window === 'undefined' || window.parent === window) return;
        const el = rootRef.current;
        if (!el) return;
        const post = () => window.parent.postMessage({ type: 'tc:dimensions', height: Math.ceil(el.getBoundingClientRect().height) + 32 }, '*');
        const ro = new ResizeObserver(post);
        ro.observe(el);
        post();
        return () => ro.disconnect();
    }, [embed]);

    const siteLabel = doc.defaultSource && 'label' in (doc.defaultSource as object) ? String((doc.defaultSource as unknown as { label: string }).label) : '';
    const copy = async () => {
        try {
            const r = await fetchJson<{ id: string }>(`/api/dashboards/public/${token}/copy`, { method: 'POST', body: JSON.stringify({}), headers: unlockKey ? { Authorization: `Bearer ${unlockKey}` } : undefined });
            window.location.href = `/dashboard/dashboards/${r.id}/edit`;
        } catch (e) {
            if (e instanceof QueryHttpError && e.status === 401) void signIn(undefined, { callbackUrl: window.location.href });
            else toast.error(e instanceof Error ? e.message : 'Could not copy');
        }
    };

    const header = (
        <div className="flex flex-col gap-3">
            <DashboardBrandHeader doc={doc} />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className={embed ? 'truncate text-title text-fg' : 'truncate text-heading text-fg'}>{doc.name}</h1>
                    {doc.description ? <p className="mt-1 max-w-[720px] text-body text-fg-secondary">{doc.description}</p> : null}
                </div>
                {pub.share?.allowCopy && !embed ? <Button variant="secondary" icon={Copy} onClick={copy}>Use as template</Button> : null}
            </div>
        </div>
    );

    return (
        <div ref={rootRef}>
            <DashboardView
                doc={doc}
                mode="public"
                siteLabel={siteLabel}
                state={ctl.state}
                onPage={ctl.setPage}
                onDate={ctl.setDate}
                onFilter={ctl.setFilter}
                allow={allow}
                data={page.data}
                loading={!page.data && !page.error}
                refetching={page.isValidating && Boolean(page.data)}
                onRetry={() => void page.mutate()}
                options={{}}
                header={header}
                footer={pub.share?.badge ? <div className="flex justify-center pt-2"><MadeWithBadge /></div> : null}
            />
            {page.error ? <p className="mt-4 text-center text-body-sm text-fg-muted">{page.error instanceof Error ? page.error.message : 'Data is temporarily unavailable.'}</p> : null}
        </div>
    );
}
