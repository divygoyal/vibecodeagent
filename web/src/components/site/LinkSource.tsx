'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { BarChart3, ChevronDown, ExternalLink, RotateCw, Search, UserPlus } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtFull } from '@/lib/format';
import { buildSiteDirectory, DIRECTORY_KEY, DIRECTORY_STORE_KEY, PAIRS_KEY } from '@/lib/sites/siteDirectory';
import type { DirectoryPayload } from '@/lib/sites/directoryTypes';
import { GOOD_MATCH, rankGa4Properties, rankSearchConsoleSites, scoreGa4Property, scoreSearchConsoleSite } from '@/lib/sites/linkCandidates';
import { siteKind } from '@/lib/sites/pairing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui';
import { siteHref } from '@/components/shell/nav';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { fetchJson, useSite } from './useSiteData';

const GSC_WELCOME = 'https://search.google.com/search-console/welcome';
const GA4_CREATE = 'https://analytics.google.com/analytics/web/#/a/p/admin/createproperty';
/** Settings > Google: where "connect another Google account" lives. */
const GOOGLE_SETTINGS = '/dashboard/settings?tab=google';

type SessionUser = { email?: string | null; provider?: string };

/**
 * "Link a Search Console site" (GA4-only sites) / "Link a GA4 property" (Search Console-only
 * sites): a picker with everything this Google account can see, best match first, saved to the
 * pairing store the portfolio and the MCP tools use (PATCH /api/portfolio/assets/<site key>, as the
 * portfolio's pairing dialog does). "Check again" re-lists Google bypassing every cache, and the
 * guidance covers the two usual reasons a site is missing: not added in Google yet, or added
 * under another Google account.
 */
export function LinkSource({ source, variant = 'card' }: { source: 'ga4' | 'gsc'; variant?: 'card' | 'page' | 'inline' }) {
    const site = useSite();
    const { section } = useCurrentSite();
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const { data: session } = useSession();
    const user = session?.user as SessionUser | undefined;
    // The session email is the Google account's only when Google is the sign-in provider.
    const email = user?.provider === 'github' ? null : user?.email ?? null;

    const dir = useSWR<DirectoryPayload>(DIRECTORY_KEY, fetchJson, { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true });
    const [choice, setChoice] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [checking, setChecking] = useState(false);
    const [checkedAt, setCheckedAt] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);

    const linkGsc = source === 'gsc';
    const ga4Host = useMemo(() => dir.data?.properties.find((p) => p.property === site.ga4)?.host ?? null, [dir.data, site.ga4]);
    const target = { host: ga4Host, name: site.site?.ga4Name ?? site.label };

    const { options, best } = useMemo(() => {
        const d = dir.data;
        if (!d) return { options: [] as SelectOption[], best: undefined as string | undefined };
        const nameOf = new Map(d.properties.map((p) => [p.property, p.displayName]));
        if (linkGsc) {
            const pairedTo = new Map<string, string>();
            for (const [prop, gsc] of Object.entries(d.pairs ?? {})) if (gsc) pairedTo.set(gsc, nameOf.get(prop) ?? prop);
            const ranked = rankSearchConsoleSites(d.sites, target);
            const opts = ranked.map((s): SelectOption => {
                const unverified = s.permissionLevel === 'siteUnverifiedUser';
                const kind = siteKind(s.siteUrl) === 'domain' ? 'Domain' : 'URL prefix';
                const note = unverified ? 'not verified' : pairedTo.has(s.siteUrl) ? `linked to ${pairedTo.get(s.siteUrl)}` : null;
                return {
                    value: s.siteUrl,
                    textValue: s.siteUrl,
                    disabled: unverified,
                    label: <span className="flex min-w-0 items-baseline gap-1.5"><span className="max-w-full shrink-0 truncate">{s.siteUrl}</span><span className="min-w-0 truncate text-meta text-fg-muted">{kind}{note ? ` · ${note}` : ''}</span></span>,
                };
            });
            const top = ranked[0];
            return { options: opts, best: top && scoreSearchConsoleSite(top, target) < GOOD_MATCH ? top.siteUrl : undefined };
        }
        const gscUrl = site.gsc ?? '';
        const ranked = rankGa4Properties(d.properties, gscUrl);
        const opts = ranked.map((p): SelectOption => {
            const paired = d.pairs?.[p.property];
            return {
                value: p.property,
                textValue: p.displayName,
                label: (
                    <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="max-w-full shrink-0 truncate">{p.displayName}</span>
                        <span className="min-w-0 truncate text-meta text-fg-muted">{p.property.replace('properties/', '')}{paired ? ` · linked to ${paired.replace(/^sc-domain:/, '')}` : ''}</span>
                    </span>
                ),
            };
        });
        const top = ranked[0];
        return { options: opts, best: top && scoreGa4Property(top, gscUrl) < GOOD_MATCH ? top.property : undefined };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dir.data, linkGsc, site.gsc, ga4Host, target.name]);

    const value = choice && options.some((o) => o.value === choice) ? choice : best;
    const listError = dir.data ? (linkGsc ? dir.data.errors?.sites : dir.data.errors?.properties) : null;
    const thing = linkGsc ? 'Search Console site' : 'GA4 property';
    const things = linkGsc ? 'Search Console sites' : 'GA4 properties';

    const refreshCaches = async () => {
        await Promise.all([
            mutate(PAIRS_KEY),
            mutate(DIRECTORY_STORE_KEY),
            mutate((k) => typeof k === 'string' && k.startsWith('/api/portfolio?')),
        ]);
    };

    const save = async () => {
        if (!value) return;
        const key = linkGsc ? `ga4:${site.ga4}` : `gsc:${site.gsc}`;
        setSaving(true);
        try {
            const res = await fetch(`/api/portfolio/assets/${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(linkGsc ? { gscSite: value } : { ga4Property: value }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string };
                toast.error(body.error || `Could not link the ${thing}`, { duration: 8000 });
                return;
            }
            const fresh = await fetchJson<DirectoryPayload>(DIRECTORY_KEY);
            await mutate(DIRECTORY_KEY, fresh, { revalidate: false });
            await refreshCaches();
            toast.success(`Linked ${linkGsc ? value : options.find((o) => o.value === value)?.textValue ?? value}`);
            // A GA4-only site's route key ("ga4-123") becomes the Search Console host once linked: follow it.
            const entry = buildSiteDirectory({ sites: fresh.sites, properties: fresh.properties, pairs: fresh.pairs })
                .find((e) => (linkGsc ? e.ga4PropertyId === site.ga4 : e.gscSiteUrl === site.gsc));
            if (entry && entry.host !== site.host) router.replace(siteHref(entry.host, section ?? ''));
        } catch {
            toast.error(`Could not link the ${thing}. Try again in a moment.`);
        } finally {
            setSaving(false);
        }
    };

    const checkAgain = async () => {
        setChecking(true);
        try {
            // `refresh=1` skips the cached Google lists and the portfolio's cached inventory.
            const fresh = await fetchJson<DirectoryPayload>(`${DIRECTORY_KEY}?refresh=1`);
            await mutate(DIRECTORY_KEY, fresh, { revalidate: false });
            setCheckedAt(Date.now());
            // Let the portfolio store learn new sites too (pairing needs them there); it runs in the background.
            void fetch('/api/portfolio/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                .then(() => refreshCaches()).catch(() => undefined);
        } catch {
            toast.error('Could not reach Google. Try again in a moment.');
        } finally {
            setChecking(false);
        }
    };

    const count = linkGsc ? dir.data?.sites.length ?? 0 : dir.data?.properties.length ?? 0;
    const Icon = linkGsc ? Search : BarChart3;
    const account = email ? <strong className="font-medium text-fg">{email}</strong> : 'the Google account you connected';
    const page = variant === 'page';

    const body = (
        <div className={cn('flex flex-col gap-4', page ? 'mx-auto w-full max-w-2xl p-6 md:p-8' : 'p-4 md:p-5', variant === 'inline' && 'p-0 md:p-0')}>
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted"><Icon aria-hidden size={18} strokeWidth={1.75} /></span>
                <div className="min-w-0">
                    <h3 className={cn('text-fg', page ? 'text-title' : 'text-title-sm')}>{linkGsc ? 'Connect Search Console to see search data' : 'Link GA4 to see visitors'}</h3>
                    <p className="mt-0.5 text-body-sm text-fg-secondary">
                        {linkGsc
                            ? 'This site has no Search Console property linked. Pick one to see clicks, queries and rankings.'
                            : 'This site has no Google Analytics 4 property linked. Pick one to see users, sessions, sources and pages.'}
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {!dir.data && !dir.error ? <Skeleton className="h-9 w-full max-w-md" /> : options.length > 0 ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={value}
                                onValueChange={setChoice}
                                options={options}
                                placeholder={`Choose a ${thing}`}
                                ariaLabel={`Link a ${thing}`}
                                className="w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1"
                                contentClassName="max-w-[min(32rem,calc(100vw-2rem))]"
                            />
                            <Button variant="primary" loading={saving} disabled={!value} onClick={() => void save()}>Link</Button>
                            <Button variant="secondary" icon={RotateCw} loading={checking} onClick={() => void checkAgain()}>Check again</Button>
                        </div>
                        <p className="text-meta text-fg-muted">
                            {fmtFull(count)} {count === 1 ? thing : things} in this Google account{best ? ', best match first' : ''}. Linking applies everywhere: portfolio, site pages and AI tools.
                        </p>
                    </>
                ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <p className="text-body-sm text-fg-secondary">
                            {listError ? `Google didn't list your ${things}: ${listError.message}` : `No ${things} in this Google account yet.`}
                        </p>
                        <Button variant="secondary" size="sm" icon={RotateCw} loading={checking} onClick={() => void checkAgain()}>Check again</Button>
                    </div>
                )}
                <p aria-live="polite" className="text-meta text-fg-muted">
                    {checkedAt ? `Checked Google just now: ${fmtFull(count)} ${count === 1 ? thing : things} found.` : null}
                </p>
            </div>

            {/* Phones: the how-to folds into one line (it filled the middle of a GA-only Overview, round 4 polish). */}
            {!helpOpen ? (
                <button type="button" aria-expanded={false} onClick={() => setHelpOpen(true)}
                    className="tap-area flex items-center gap-1 border-t border-border-subtle pt-3 text-left text-body-sm font-medium text-brand-text md:hidden">
                    {linkGsc ? 'Not in Search Console yet, or in another account?' : 'Not in Google Analytics yet, or in another account?'}
                    <ChevronDown aria-hidden size={14} className="shrink-0" />
                </button>
            ) : null}
            <div className={cn('grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2', !helpOpen && 'max-md:hidden')}>
                <div className="min-w-0">
                    <p className="text-body-sm font-medium text-fg">{linkGsc ? 'Not in Search Console yet?' : 'Not in Google Analytics yet?'}</p>
                    <a href={linkGsc ? GSC_WELCOME : GA4_CREATE} target="_blank" rel="noopener noreferrer"
                        className="tap-area mt-1 inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                        {linkGsc ? 'Add it in Search Console' : 'Create a GA4 property'}<ExternalLink aria-hidden size={14} />
                    </a>
                    <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-meta text-fg-muted">
                        {linkGsc ? (
                            <>
                                <li>Choose Domain (every subdomain, http and https) or URL prefix, and enter {site.siteHost ?? ga4Host ?? 'your site'}.</li>
                                <li>Verify it: a DNS TXT record for Domain, or the HTML tag or file for URL prefix. Then press Check again.</li>
                            </>
                        ) : (
                            <>
                                <li>Create a property with a Web data stream for {site.siteHost ?? 'your site'}.</li>
                                <li>Add the Google tag to your site, then press Check again. Visits show within a day.</li>
                            </>
                        )}
                    </ol>
                </div>
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-body-sm font-medium text-fg"><UserPlus aria-hidden size={14} className="text-fg-muted" />In another Google account?</p>
                    <p className="mt-1 text-meta text-fg-muted [overflow-wrap:anywhere]">
                        Add {account} as a user in that property ({linkGsc
                            ? 'Search Console → Settings → Users and permissions; Restricted is enough'
                            : 'Google Analytics → Admin → Property access management; Viewer is enough'}), then press Check again.
                    </p>
                    <p className="mt-1 text-meta text-fg-muted">
                        Or <Link href={GOOGLE_SETTINGS} className="tap-area font-medium text-brand-text hover:underline">connect another Google account</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
    if (variant === 'inline') return <div id={`link-${source}`}>{body}</div>;
    return <Card padding="none" id={`link-${source}`} className="scroll-mt-20">{body}</Card>;
}
