'use client';

/**
 * /dashboard/setup — Two-step linear workspace wizard.
 *
 * Step 1 ("Pick your website") — single-column list of GA4 properties shown
 * as websites. User clicks one, we advance to Step 2.
 *   Inverted branch: when the user has GSC sites but no GA4 properties at all,
 *   Step 1 becomes a list of Search Console sites instead.
 *
 * Step 2 ("Got Search Console for this site?") — soft-suggested GSC site
 * (token-overlap with the picked GA4) at the top, plus a searchable list of
 * the rest. User either picks one ("Use this site") or clicks "Skip — I
 * don't have one." Either action saves and routes to /dashboard/ai-chat.
 *   In the inverted branch, Step 2 asks about GA4 instead.
 *
 * Workspace name (label) is auto-derived: GA4 displayName wins, else GSC
 * root domain. No user-typed name input.
 */
import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
    CheckCircle2, Search, Sparkles, ArrowRight, AlertTriangle,
    BarChart3, Globe as GlobeIcon, Loader2, AlertCircle,
} from 'lucide-react';
import { useWorkspace } from '../layout';
import {
    formatSiteLabel,
    matchPropertyToSite,
    type PropertyOption,
    type SiteOption,
} from '@/lib/dashboardSelection';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { patchWorkspaceWithRetry } from '@/lib/workspaceClient';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

function siteHostTokens(siteUrl: string): { host: string; tokens: Set<string> } {
    const cleaned = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const host = cleaned.split('/')[0].toLowerCase();
    const tokens = new Set(host.split('.').flatMap((p) => p.split(/[-_]+/)).filter((t) => t.length >= 3));
    return { host, tokens };
}

function tokensOverlap(a: Set<string>, b: Set<string>): boolean {
    for (const t of a) if (b.has(t)) return true;
    return false;
}

function propertyTokens(p: PropertyOption | undefined): Set<string> {
    if (!p?.displayName) return new Set();
    return new Set(
        p.displayName
            .toLowerCase()
            .split(/[\s.\-_/]+/)
            .filter((t) => t.length >= 3)
    );
}

function rootDomainFromSite(siteUrl: string): string {
    const cleaned = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return cleaned.split('/')[0].toLowerCase();
}

// Best-effort hostname-token match between a GA4 property and the user's
// GSC site list. Returns the first overlapping site or null. Used to power
// the per-card "Search Console connected?" pill on Step 1 — no extra
// fetches; reuses the inventories we already have.
function gscMatchForProperty(prop: PropertyOption | undefined, sites: SiteOption[]): SiteOption | null {
    if (!prop) return null;
    const propTokens = propertyTokens(prop);
    if (!propTokens.size) return null;
    for (const site of sites) {
        const { tokens } = siteHostTokens(site.siteUrl);
        if (tokensOverlap(propTokens, tokens)) return site;
    }
    return null;
}

// Compact KPI formatter — 37424 → "37.4k", 1_240_000 → "1.2M". Avoids pulling
// in another util; matches the post-bridge.com card style the user referenced.
function formatCompact(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return Math.round(n).toLocaleString();
}

// Sanitize an id (propertyId, siteUrl) for use as a recharts <linearGradient>
// id. Recharts requires unique gradient ids per chart on the page; we derive
// from the source identifier so each card's gradient is stable across renders.
function sparkGradId(raw: string): string {
    return `sg-${raw.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

type Star = { id: number; x: number; y: number; size: number; opMin: number; opMax: number; dur: number; delay: number };

function MiniStarField() {
    const [stars, setStars] = useState<Star[]>([]);
    useEffect(() => {
        setStars(
            Array.from({ length: 80 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 1.4 + 0.3,
                opMin: Math.random() * 0.15 + 0.05,
                opMax: Math.random() * 0.5 + 0.35,
                dur: Math.random() * 4 + 3,
                delay: Math.random() * 6,
            })),
        );
    }, []);
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {stars.map((s) => (
                <span
                    key={s.id}
                    className="tc-star"
                    style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        ['--tw-opacity-min' as never]: s.opMin,
                        ['--tw-opacity-max' as never]: s.opMax,
                        ['--twinkle-dur' as never]: `${s.dur}s`,
                        ['--twinkle-delay' as never]: `${s.delay}s`,
                    } as CSSProperties}
                />
            ))}
        </div>
    );
}

// Same-origin guard for the returnTo URL we let the middleware bounce in.
// Only paths starting with "/dashboard/" are accepted, so a malicious caller
// can't send users to an arbitrary external site after setup completes.
function safeReturnTo(raw: string | null): string {
    if (!raw) return '/dashboard/ai-chat';
    if (!raw.startsWith('/dashboard/')) return '/dashboard/ai-chat';
    // Reject protocol-relative paths and embedded URLs.
    if (raw.startsWith('//') || raw.includes('\\') || /:\/\//.test(raw)) return '/dashboard/ai-chat';
    return raw;
}

export default function SetupPage() {
    const router = useRouter();
    // Where to send the user once setup is complete. Middleware appends
    // ?returnTo=<original-url> when it bounces a setup-incomplete user away
    // from a deep link (e.g. /dashboard/ai-chat?q=…&property=…&site=… from a
    // report-email CTA). Resolved on click, not in state — keeps the page
    // statically pre-renderable (no useSearchParams) and avoids the
    // cascading-render hit of useState+useEffect.
    const resolveReturnTo = useCallback(() => {
        if (typeof window === 'undefined') return '/dashboard/ai-chat';
        const params = new URLSearchParams(window.location.search);
        return safeReturnTo(params.get('returnTo'));
    }, []);
    const { data: session, update: updateSession } = useSession();
    const {
        selectedProperty,
        selectedSite,
        saveWorkspace,
        isWorkspaceLoaded,
    } = useWorkspace();
    const { hasGoogleConnection } = useContainerStatus();
    const {
        sites: gscSitesRaw,
        isLoading: sitesLoading,
        error: sitesError,
    } = useSiteList(hasGoogleConnection);
    const {
        properties: propsRaw,
        isLoading: propsLoading,
        error: propsError,
    } = usePropertyList(hasGoogleConnection);

    const sites = (gscSitesRaw as SiteOption[]) || [];
    const properties = (propsRaw as PropertyOption[]) || [];

    const [chosenProperty, setChosenProperty] = useState(selectedProperty);
    const [chosenSite, setChosenSite] = useState(selectedSite);
    // Pre-selected secondary on Step 2 (the GSC site clicked, or GA4
    // property in inverted mode). Commit happens via the bottom button.
    const [selectedSecondary, setSelectedSecondary] = useState('');
    const [propSearch, setPropSearch] = useState('');
    const [siteSearch, setSiteSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Wizard step. 'pick-website' = Step 1, 'pair-gsc' = Step 2,
    // 'done' = Step 3 (confirmation). The Done screen waits for a click
    // before routing to /dashboard/ai-chat. Always starts at Step 1 so the
    // sidebar workspace pill consistently lands users on the website
    // picker — they can always change either side from the start.
    const [step, setStep] = useState<'pick-website' | 'pair-gsc' | 'done'>('pick-website');
    // Snapshot of what was saved, frozen for the Done screen so it
    // shows what *was* committed, not whatever the form holds now.
    const [doneSnapshot, setDoneSnapshot] = useState<{ label: string; hasGa4: boolean; hasGsc: boolean }>({
        label: '',
        hasGa4: false,
        hasGsc: false,
    });
    // Loading state for the Done-screen "Go to workspace" button. The button
    // re-runs markSetupCompleted before navigating (in case finishSetup's
    // 12s timeout cut off updateSession() and left the JWT claim stale —
    // without the refreshed claim, middleware.ts bounces /dashboard/ai-chat
    // straight back to /dashboard/setup and the click looks dead.
    const [navigating, setNavigating] = useState(false);

    // greeting + userName must be CLIENT-ONLY. `new Date().getHours()` returns
    // the server's UTC hour during SSR and the client's local hour after
    // hydration; if they differ React throws hydration error #418 → recovery
    // loop → "Something went wrong" boundary. Same problem for `userName`,
    // which is null during SSR (useSession() hasn't resolved yet) and the
    // real name after mount. Both are deferred to a useEffect — empty
    // string on first render, populated post-mount. Mirrors the timeOfDay
    // fix at ai-chat/page.tsx:689.
    const [greeting, setGreeting] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('');
    // Banner toggle for users redirected here by the layout's stale-workspace
    // guard (?reason=stale). Read from window.location.search rather than
    // useSearchParams to avoid pulling the page into a Suspense boundary —
    // mirrors the resolveReturnTo pattern above.
    const [staleReason, setStaleReason] = useState(false);
    useEffect(() => {
        const hr = new Date().getHours();
        setGreeting(hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening');
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('reason') === 'stale') setStaleReason(true);
    }, []);
    useEffect(() => {
        const name = session?.user?.name?.split(' ')[0];
        if (name) setUserName(name);
        else setUserName('there');
    }, [session?.user?.name]);

    // Inverted mode — user has only GSC sites, no GA4 inventory at all.
    // Step 1 picks a GSC site, Step 2 (optional) pairs a GA4 property.
    const gscOnlyMode = !propsLoading && properties.length === 0 && sites.length > 0;

    // Hydrate the form from current workspace once it loads.
    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        if (selectedProperty && !chosenProperty) setChosenProperty(selectedProperty);
        if (selectedSite && !chosenSite) setChosenSite(selectedSite);
    }, [isWorkspaceLoaded, selectedProperty, selectedSite, chosenProperty, chosenSite]);

    // Soft-suggestion (Step 2 only): given the Step 1 pick, find a
    // token-overlap match in the OTHER inventory. Used to bubble that match
    // to the top of the list and tag it "Best match" — never auto-fills.
    const suggestion = useMemo<{ kind: 'site' | 'property'; siteUrl?: string; propertyId?: string } | null>(() => {
        if (chosenProperty && sites.length > 0) {
            const prop = properties.find((p) => p.property === chosenProperty);
            const propTokens = propertyTokens(prop);
            if (!propTokens.size) return null;
            for (const site of sites) {
                const { tokens } = siteHostTokens(site.siteUrl);
                if (tokensOverlap(propTokens, tokens)) {
                    return { kind: 'site', siteUrl: site.siteUrl };
                }
            }
        }
        if (chosenSite && properties.length > 0) {
            const match = matchPropertyToSite(chosenSite, properties);
            if (match?.property) {
                return { kind: 'property', propertyId: match.property };
            }
        }
        return null;
    }, [chosenProperty, chosenSite, properties, sites]);

    const filteredProperties = useMemo(() => {
        const q = propSearch.trim().toLowerCase();
        if (!q) return properties;
        return properties.filter((p) =>
            (p.displayName || '').toLowerCase().includes(q)
            || (p.property || '').toLowerCase().includes(q)
        );
    }, [properties, propSearch]);

    const filteredSites = useMemo(() => {
        const q = siteSearch.trim().toLowerCase();
        if (!q) return sites;
        return sites.filter((s) => formatSiteLabel(s.siteUrl).toLowerCase().includes(q));
    }, [sites, siteSearch]);

    // Suggestion-aware list ordering for Step 2 (GSC list when GA4 is picked,
    // or GA4 list in inverted mode). The matched item moves to the top with
    // a "best match" badge.
    //
    // These two useMemos MUST live above the early returns below
    // (`!hasGoogleConnection` and `inventoryEmpty`). When SWR transitions from
    // pending → resolved, those guards flip from true → false, and any hook
    // declared below them changes its call-order between renders → React
    // throws #310 ("Rendered more hooks than during the previous render"),
    // which is exactly the crash users hit on /dashboard/setup after signup.
    const orderedStep2Sites = useMemo(() => {
        if (!suggestion || suggestion.kind !== 'site') return filteredSites;
        const matchUrl = suggestion.siteUrl;
        const match = filteredSites.find((s) => s.siteUrl === matchUrl);
        if (!match) return filteredSites;
        return [match, ...filteredSites.filter((s) => s.siteUrl !== matchUrl)];
    }, [filteredSites, suggestion]);

    const orderedStep2Properties = useMemo(() => {
        if (!suggestion || suggestion.kind !== 'property') return filteredProperties;
        const matchId = suggestion.propertyId;
        const match = filteredProperties.find((p) => p.property === matchId);
        if (!match) return filteredProperties;
        return [match, ...filteredProperties.filter((p) => p.property !== matchId)];
    }, [filteredProperties, suggestion]);

    // Mark workspace_setup_completed=true server-side AND refresh the JWT
    // claim via NextAuth's update() trigger. Middleware reads the claim on
    // every dashboard request — without the JWT refresh it would still see
    // the old `false` value and bounce the user back here.
    const markSetupCompleted = useCallback(async () => {
        // Retry transient 502s — the layout-effect guard is a fallback if all
        // attempts fail, but we'd rather not depend on it.
        await patchWorkspaceWithRetry({ mark_setup_completed: true }).catch(() => null);
        try {
            await updateSession({ workspaceSetupCompleted: true });
        } catch {
            /* non-fatal — JWT will refresh on next sign-in. */
        }
    }, [updateSession]);

    // Hard 12s cap on any save — the admin API has been seen to take 8s+
    // with 504s under load. Without this, the button can stick at "Saving…"
    // for the user's perceived eternity.
    const withTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T | 'timeout'> => {
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
            setTimeout(() => resolve('timeout'), ms);
        });
        return Promise.race<T | 'timeout'>([p, timeoutPromise]);
    };

    // Helper used by both Step 2 buttons — saves with the explicit values
    // passed in (so we don't race React state updates from the Use/Skip click).
    // Computes the label from the explicit values too.
    const finishSetup = async (finalProperty: string | null, finalSite: string | null) => {
        if (saving) return;
        if (!finalProperty && !finalSite) return; // safety — Step 2 always has at least one
        setSaving(true);
        setSaveError(null);
        let label = '';
        if (finalProperty) {
            const prop = properties.find((p) => p.property === finalProperty);
            label = prop?.displayName || prop?.property || finalProperty;
        } else if (finalSite) {
            label = rootDomainFromSite(finalSite);
        }
        // Save the workspace first — the mark-setup PATCH depends on the row
        // existing. After save succeeds, mark-completed and JWT refresh run
        // in parallel since they don't depend on each other.
        const saved = await withTimeout(saveWorkspace({ property: finalProperty, site: finalSite, label }));
        if (saved === 'timeout' || !saved) {
            setSaving(false);
            setSaveError(saved === 'timeout'
                ? 'The server is taking too long. Please try again in a moment.'
                : 'Could not save your workspace. Try again.');
            return;
        }
        // markSetupCompleted refreshes the JWT claim that middleware checks.
        // Don't withTimeout this — if updateSession() is cut off the cookie
        // is never re-issued and the Done-screen "Go to workspace" button
        // bounces straight back to /setup. The Done button does retry, but
        // letting this complete the first time is much smoother.
        await markSetupCompleted();
        setSaving(false);
        // Transition to Done — the user clicks "Go to workspace" to leave.
        setDoneSnapshot({
            label,
            hasGa4: Boolean(finalProperty),
            hasGsc: Boolean(finalSite),
        });
        setStep('done');
    };

    const onContinueWithDemo = async () => {
        if (saving) return;
        setSaving(true);
        setSaveError(null);
        const saved = await withTimeout(saveWorkspace({
            property: DEMO_PROPERTY_ID,
            site: DEMO_SITE_URL,
            label: 'Demo workspace',
        }));
        if (saved === 'timeout' || !saved) {
            setSaving(false);
            setSaveError(saved === 'timeout'
                ? 'Could not load the demo workspace — the server is slow. Try again in a moment.'
                : 'Could not load the demo workspace. Try again.');
            return;
        }
        // markSetupCompleted runs the workspace_setup_completed PATCH AND
        // updateSession() to refresh the JWT claim that middleware reads.
        // Do NOT wrap this in withTimeout — if the timer fires before
        // updateSession() finishes, the JWT cookie is never re-issued and
        // middleware bounces /dashboard/ai-chat straight back to /setup,
        // which is what was leaving demo users stuck on the setup page.
        await markSetupCompleted();
        // Hard navigation so the just-refreshed JWT cookie ships with the
        // request (router.push can race the cookie write). Honour ?returnTo
        // when it was passed in (e.g. from a report-email deep link bounced
        // through setup); otherwise default to /dashboard/ai-chat.
        window.location.href = resolveReturnTo();
    };

    const cosmicShell = (children: React.ReactNode) => (
        <div className="relative min-h-screen overflow-hidden bg-black -m-3 sm:-m-4 md:-m-6">
            <MiniStarField />
            <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-[-220px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(20,196,225,0.18),transparent_70%)] blur-3xl" />
                <div className="absolute left-1/2 top-[280px] h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(122,217,218,0.10),transparent_70%)] blur-3xl" />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    );

    // ─── No-Google branch ─────────────────────────────────────────────

    if (!hasGoogleConnection) {
        return cosmicShell(
            <div className="max-w-2xl mx-auto py-16 sm:py-24 px-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-4 min-h-[16px]">
                    {greeting ? `${greeting}, ${userName}` : ''}
                </p>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                    Let&apos;s set up your workspace
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed">
                    TrafficClaw needs your Google Analytics and Search Console data to surface
                    insights, anomalies, and growth opportunities. Connect once and we&apos;ll
                    bring everything in.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)] hover:shadow-[0_0_36px_rgba(20,196,225,0.55)]"
                    >
                        Connect Google
                    </button>
                    <button
                        type="button"
                        onClick={onContinueWithDemo}
                        disabled={saving}
                        className="px-6 py-3 rounded-2xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        {saving ? 'Loading demo workspace…' : 'Continue with demo data →'}
                    </button>
                </div>
                {saveError && (
                    <p className="mt-4 text-[12px] text-red-300">{saveError}</p>
                )}
            </div>
        );
    }

    const inventoryEmpty = !propsLoading && !sitesLoading && properties.length === 0 && sites.length === 0 && !propsError && !sitesError;

    if (inventoryEmpty) {
        return cosmicShell(
            <div className="max-w-2xl mx-auto py-16 sm:py-24 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-yellow-500/12 mx-auto mb-6 flex items-center justify-center border border-yellow-500/20">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
                    No GA4 or Search Console data found
                </h1>
                <p className="text-sm text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed">
                    We couldn&apos;t find any GA4 properties or Search Console sites for this Google account.
                    Re-connect with a different account, or explore with demo data.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)]"
                    >
                        Switch Google account
                    </button>
                    <button
                        type="button"
                        onClick={onContinueWithDemo}
                        disabled={saving}
                        className="px-6 py-3 rounded-2xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        {saving ? 'Loading demo workspace…' : 'Continue with demo data →'}
                    </button>
                </div>
                {saveError && (
                    <p className="mt-4 text-[12px] text-red-300">{saveError}</p>
                )}
            </div>
        );
    }

    // ─── Main flow: two-step linear wizard ───────────────────────────
    // (orderedStep2Sites / orderedStep2Properties are declared above the
    // early returns — they must run on every render to keep the hook order
    // stable.)

    // Journey-style three-step indicator. Active pill pulses; connectors
    // animate their fill (left→right) the moment they flip to "done", so
    // moving 1→2→3 feels like progress sweeping along a path.
    const stepDone1 = step === 'pair-gsc' || step === 'done';
    const stepDone2 = step === 'done';
    const pill = (active: boolean, done: boolean, n: number, label: string) => (
        <span className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors duration-300 ${active ? 'text-[#7AD9DA]' : done ? 'text-zinc-200' : 'text-zinc-600'}`}>
            <span className={`relative w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${active ? 'bg-[#14C4E1]/22 border border-[#14C4E1]/55 tc-step-pulse' : done ? 'bg-[#14C4E1]/[0.14] border border-[#14C4E1]/35' : 'bg-white/[0.04] border border-white/[0.08]'}`}>
                <span className={`absolute inset-0 flex items-center justify-center text-[10px] transition-opacity duration-300 ${done ? 'opacity-0' : 'opacity-100'}`}>
                    {n}
                </span>
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0'}`}>
                    <CheckCircle2 className="w-3 h-3 text-[#7AD9DA]" />
                </span>
            </span>
            {label}
        </span>
    );
    const connector = (filled: boolean) => (
        <span className="relative inline-block w-12 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
            {filled && (
                <span className="tc-step-connector-fill absolute inset-0 block bg-gradient-to-r from-[#14C4E1] to-[#7AD9DA]" />
            )}
        </span>
    );
    const stepBadge = (
        <div className="flex items-center justify-center gap-3 mb-6">
            {pill(step === 'pick-website', stepDone1, 1, 'Website')}
            {connector(stepDone1)}
            {pill(step === 'pair-gsc', stepDone2, 2, gscOnlyMode ? 'GA4' : 'Search Console')}
            {connector(stepDone2)}
            {pill(step === 'done', false, 3, 'Done')}
        </div>
    );


    // ─── STEP 1 ──────────────────────────────────────────────────────

    if (step === 'pick-website') {
        const step1Loading = gscOnlyMode ? sitesLoading : propsLoading;
        const step1Error = gscOnlyMode ? sitesError : propsError;

        // Step 1 cards auto-advance — no Continue button. The click commits
        // the pick and moves the wizard to Step 2 in the same render. Step 2
        // fades in via the .fade-in wrapper so the transition feels deliberate
        // even though it's instant.
        const onPickProperty = (id: string) => {
            if (!id) return;
            setChosenProperty(id);
            setChosenSite('');
            setSelectedSecondary('');
            setStep('pair-gsc');
        };
        const onPickSite = (url: string) => {
            setChosenSite(url);
            setChosenProperty('');
            setSelectedSecondary('');
            setStep('pair-gsc');
        };

        return cosmicShell(
            <div className="max-w-5xl mx-auto py-10 sm:py-14 px-4 pb-24 sm:pb-14 fade-in">
                {staleReason && (
                    <div className="max-w-2xl mx-auto mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
                        <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 text-[12.5px] text-amber-100/90 leading-relaxed">
                            <span className="font-semibold text-amber-200">Your previous workspace is no longer available.</span>{' '}
                            The site or GA4 property you had selected is missing from this Google account. Pick a new one below.
                        </div>
                    </div>
                )}
                <div className="text-center mb-8">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500 mb-2">
                        TrafficClaw
                    </p>
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                        Set up your workspace
                    </h1>
                    <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
                        Pick the website you want to analyze. We&apos;ll connect Search Console next.
                    </p>
                </div>

                {stepBadge}

                {/* Search */}
                <div className="max-w-xl mx-auto mb-6 relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={gscOnlyMode ? siteSearch : propSearch}
                        onChange={(e) => (gscOnlyMode ? setSiteSearch : setPropSearch)(e.target.value)}
                        placeholder="Search your websites…"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0a0d12]/80 backdrop-blur-sm border border-white/[0.08] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/40 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                    />
                </div>

                {/* Card grid — 3 across on desktop */}
                {step1Error ? (
                    <div className="max-w-xl mx-auto rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Could not load your websites. Try refreshing.
                    </div>
                ) : step1Loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#0a0d12]/80 p-4 h-[180px] animate-pulse">
                                <div className="h-3.5 w-32 rounded bg-white/[0.05]" />
                                <div className="mt-4 h-12 w-full rounded bg-white/[0.03]" />
                                <div className="mt-4 h-3 w-24 rounded bg-white/[0.04]" />
                            </div>
                        ))}
                    </div>
                ) : gscOnlyMode ? (
                    filteredSites.length === 0 ? (
                        <div className="text-xs text-zinc-500 italic px-3 py-12 text-center">
                            No websites match your search.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredSites.map((s) => (
                                <WebsiteCardGsc
                                    key={s.siteUrl}
                                    siteUrl={s.siteUrl}
                                    selected={chosenSite === s.siteUrl}
                                    onClick={() => onPickSite(s.siteUrl)}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    filteredProperties.length === 0 ? (
                        <div className="text-xs text-zinc-500 italic px-3 py-12 text-center">
                            No websites match your search.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredProperties.map((p) => {
                                const id = p.property || p.propertyId || '';
                                const gscMatch = gscMatchForProperty(p, sites);
                                return (
                                    <WebsiteCardGa4
                                        key={id || p.displayName}
                                        propertyId={id}
                                        displayName={p.displayName || '(unnamed)'}
                                        disabled={!id}
                                        selected={chosenProperty === id}
                                        gscMatch={gscMatch}
                                        onClick={() => onPickProperty(id)}
                                    />
                                );
                            })}
                        </div>
                    )
                )}

                <p className="mt-8 text-center text-[11px] text-zinc-600">
                    Pick a website to continue.
                </p>


            </div>
        );
    }

    // ─── STEP 2 ──────────────────────────────────────────────────────

    const askingAboutGsc = !gscOnlyMode; // GA4 was Step 1, ask about GSC in Step 2
    const step2Loading = askingAboutGsc ? sitesLoading : propsLoading;
    const step2Error = askingAboutGsc ? sitesError : propsError;
    const stepSub = askingAboutGsc
        ? "If you have a Search Console property for this site, pick it. Otherwise skip — you can always add it later."
        : "If you have a GA4 property for this site, pick it. Otherwise skip — you can always add it later.";
    const skipSub = askingAboutGsc
        ? 'You can add it later from your workspace settings.'
        : 'You can add it later from your workspace settings.';

    const goBack = () => {
        // Reset selection so they can re-pick freely
        if (askingAboutGsc) setChosenSite('');
        else setChosenProperty('');
        setStep('pick-website');
    };

    // Step 2 auto-commits on row click — no separate Connect button. The
    // clicked row is tracked in `selectedSecondary` so we can paint the
    // cyan ring + spinner on it during the save round-trip.
    const onPickStep2Site = (siteUrl: string) => {
        if (saving) return;
        setSelectedSecondary(siteUrl);
        finishSetup(chosenProperty || null, siteUrl);
    };
    const onPickStep2Property = (propertyId: string) => {
        if (saving || !propertyId) return;
        setSelectedSecondary(propertyId);
        finishSetup(propertyId, chosenSite || null);
    };
    const onSkipStep2 = () => {
        if (saving) return;
        finishSetup(chosenProperty || null, chosenSite || null);
    };

    // ─── STEP 3 (Done) ───────────────────────────────────────────────

    if (step === 'done') {
        return cosmicShell(
            <div className="max-w-3xl mx-auto py-10 sm:py-14 px-4 pb-24 sm:pb-14 fade-in">
                <div className="text-center mb-8">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500 mb-2">
                        TrafficClaw
                    </p>
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                        Your SEO workspace is ready
                    </h1>
                    <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
                        We connected your analytics and search data.
                    </p>
                </div>

                {stepBadge}

                <div className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-8 shadow-[0_22px_60px_rgba(0,0,0,0.45)] text-center">
                    {/* Animated check ring */}
                    <div className="mx-auto mb-5 w-20 h-20 rounded-full border-2 border-[#14C4E1]/40 bg-[#14C4E1]/[0.08] flex items-center justify-center shadow-[0_0_36px_rgba(20,196,225,0.32)]">
                        <CheckCircle2 className="w-10 h-10 text-[#7AD9DA]" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-5 truncate">
                        {doneSnapshot.label || 'Your workspace'}
                    </h2>
                    <div className="space-y-2.5 mb-6">
                        <div className={`flex items-center justify-center gap-2 text-[12.5px] ${doneSnapshot.hasGa4 ? 'text-zinc-200' : 'text-zinc-500'}`}>
                            <CheckCircle2 className={`w-4 h-4 ${doneSnapshot.hasGa4 ? 'text-[#7AD9DA]' : 'text-zinc-600'}`} />
                            {doneSnapshot.hasGa4 ? 'GA4 connected' : 'GA4 — skipped'}
                        </div>
                        <div className={`flex items-center justify-center gap-2 text-[12.5px] ${doneSnapshot.hasGsc ? 'text-zinc-200' : 'text-zinc-500'}`}>
                            <CheckCircle2 className={`w-4 h-4 ${doneSnapshot.hasGsc ? 'text-[#7AD9DA]' : 'text-zinc-600'}`} />
                            {doneSnapshot.hasGsc ? 'Search Console connected' : 'Search Console — skipped'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            if (navigating) return;
                            setNavigating(true);
                            // Idempotent retry — if finishSetup's withTimeout
                            // raced past updateSession() the JWT claim is still
                            // false on disk. Re-running the PATCH + session
                            // update guarantees the cookie is fresh before we
                            // navigate, otherwise middleware bounces us right
                            // back to /dashboard/setup and the click looks dead.
                            await markSetupCompleted();
                            // Hard navigation rather than router.push so the
                            // browser ships the just-refreshed JWT cookie with
                            // the request. router.push can race the cookie
                            // write and hit middleware with the stale value.
                            // Honours ?returnTo when middleware bounced a deep
                            // link (e.g. /dashboard/ai-chat?q=…) through here.
                            window.location.href = resolveReturnTo();
                        }}
                        disabled={navigating}
                        className="group w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)] hover:shadow-[0_0_36px_rgba(20,196,225,0.55)] disabled:opacity-80 disabled:cursor-wait"
                    >
                        {navigating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Opening workspace…
                            </>
                        ) : (
                            <>
                                Go to workspace
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            </>
                        )}
                    </button>
                </div>


            </div>
        );
    }

    return cosmicShell(
        <div className="max-w-2xl mx-auto py-10 sm:py-14 px-4 pb-32 sm:pb-14 fade-in">
            <div className="text-center mb-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500 mb-2">
                    TrafficClaw
                </p>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                    Connect {askingAboutGsc ? 'Search Console' : 'Google Analytics'}
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 max-w-md mx-auto leading-relaxed">
                    {stepSub}
                </p>
            </div>

            {stepBadge}

            {/* Top action bar — Back + Skip both visible. Skip is the
                primary escape hatch when the user doesn't have GSC, so
                it gets equal weight with Back. */}
            <div className="mb-5 flex items-center justify-center gap-2.5">
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.10] text-zinc-200 hover:text-white text-[12px] font-medium transition-colors"
                >
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    Back to website list
                </button>
                <button
                    type="button"
                    onClick={onSkipStep2}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/[0.10] hover:bg-amber-500/[0.18] border border-amber-500/30 hover:border-amber-500/50 text-amber-200 hover:text-amber-100 text-[12px] font-semibold transition-colors disabled:opacity-50"
                >
                    Skip for now
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
                <div className="relative mb-4 group">
                    <span aria-hidden className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-r from-[#14C4E1]/0 via-[#14C4E1]/15 to-[#14C4E1]/0 opacity-0 group-focus-within:opacity-100 blur-md transition-opacity duration-300" />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 w-4 h-4 text-zinc-400 group-focus-within:text-[#7AD9DA] transition-colors" />
                    <input
                        type="text"
                        value={askingAboutGsc ? siteSearch : propSearch}
                        onChange={(e) => (askingAboutGsc ? setSiteSearch : setPropSearch)(e.target.value)}
                        placeholder={askingAboutGsc ? 'Search your Search Console properties…' : 'Search your GA4 properties…'}
                        className="relative w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0a0d12] border border-white/[0.12] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/55 focus:ring-2 focus:ring-[#14C4E1]/20 focus:shadow-[0_0_28px_rgba(20,196,225,0.22)] shadow-[0_4px_18px_rgba(0,0,0,0.35)] transition-all duration-200"
                    />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                    {step2Loading && (
                        <>
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />
                            ))}
                        </>
                    )}
                    {step2Error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Could not load — you can skip this step.
                        </div>
                    )}
                    {!step2Loading && !step2Error && askingAboutGsc && (
                        <>
                            {orderedStep2Sites.length === 0 && (
                                <div className="text-xs text-zinc-500 italic px-3 py-6 text-center">
                                    No Search Console properties found on this account.
                                </div>
                            )}
                            {orderedStep2Sites.map((s) => {
                                const isMatch = suggestion?.kind === 'site' && suggestion.siteUrl === s.siteUrl;
                                const isSelected = selectedSecondary === s.siteUrl;
                                const isSavingThis = saving && isSelected;
                                return (
                                    <Step2GscRow
                                        key={s.siteUrl}
                                        siteUrl={s.siteUrl}
                                        isMatch={isMatch}
                                        isSelected={isSelected}
                                        isSaving={isSavingThis}
                                        disabled={saving && !isSelected}
                                        onClick={() => onPickStep2Site(s.siteUrl)}
                                    />
                                );
                            })}
                        </>
                    )}
                    {!step2Loading && !step2Error && !askingAboutGsc && (
                        <>
                            {orderedStep2Properties.length === 0 && (
                                <div className="text-xs text-zinc-500 italic px-3 py-6 text-center">
                                    No GA4 properties found on this account.
                                </div>
                            )}
                            {orderedStep2Properties.map((p) => {
                                const id = p.property || p.propertyId || '';
                                const isMatch = suggestion?.kind === 'property' && suggestion.propertyId === id;
                                const isSelected = selectedSecondary === id;
                                const isSavingThis = saving && isSelected;
                                return (
                                    <button
                                        key={id || p.displayName}
                                        type="button"
                                        disabled={!id || (saving && !isSelected)}
                                        onClick={() => onPickStep2Property(id)}
                                        className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3 group ${
                                            isSelected
                                                ? 'border-[#14C4E1]/55 bg-[#14C4E1]/[0.12] text-white shadow-[0_0_24px_rgba(20,196,225,0.20)] ring-2 ring-[#14C4E1]/40'
                                                : isMatch
                                                    ? 'border-[#14C4E1]/30 bg-[#14C4E1]/[0.05] text-white hover:bg-[#14C4E1]/[0.10]'
                                                    : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.12]'
                                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                                    >
                                        <BarChart3 className={`w-3.5 h-3.5 flex-shrink-0 ${(isSelected || isMatch) ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate flex items-center gap-2">
                                                {p.displayName || '(unnamed)'}
                                                {isMatch && !isSelected && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                                                        <Sparkles className="w-2.5 h-2.5" />
                                                        Recommended
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10.5px] text-zinc-500 truncate font-mono">{id}</div>
                                        </div>
                                        {isSavingThis ? (
                                            <Loader2 className="w-4 h-4 text-[#7AD9DA] animate-spin flex-shrink-0" />
                                        ) : isSelected ? (
                                            <CheckCircle2 className="w-4 h-4 text-[#7AD9DA] flex-shrink-0" />
                                        ) : (
                                            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            {saveError && (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
                    {saveError}
                </div>
            )}

            <p className="mt-5 text-center text-[11px] text-zinc-600">{skipSub}</p>


        </div>
    );
}

// ─── WebsiteCardGa4 ─────────────────────────────────────────────────
// Rich card shown on Step 1 for each GA4 property. 30-day visitor
// sparkline + total visitor count, fetched per-card via useAnalyticsData.
// SWR dedupes by URL (60s) and the server has a 3-min cache, so firing
// N parallel fetches for typical inventories (3-5 properties) is cheap.
// The card stays clickable even when the data hasn't loaded or errored
// — selection should never be blocked on KPI fetches.

type Ga4TrafficPoint = { date?: string; activeUsers?: number };

function WebsiteCardGa4({
    propertyId,
    displayName,
    onClick,
    disabled,
    selected,
    gscMatch,
}: {
    propertyId: string;
    displayName: string;
    onClick: () => void;
    disabled?: boolean;
    selected?: boolean;
    gscMatch?: SiteOption | null;
}) {
    const { data, isLoading, isError } = useAnalyticsData('all', propertyId, true, '30d', false);
    const traffic: Ga4TrafficPoint[] = Array.isArray(data?.traffic) ? data.traffic : [];
    const sparkData = useMemo(
        () => traffic.map((t) => ({ v: typeof t.activeUsers === 'number' ? t.activeUsers : 0 })),
        [traffic]
    );
    const total = useMemo(() => {
        if (typeof data?.kpis?.totalUsers === 'number') return data.kpis.totalUsers;
        return sparkData.reduce((sum, p) => sum + (p.v || 0), 0);
    }, [data, sparkData]);
    const hasSpark = sparkData.length > 1 && sparkData.some((p) => p.v > 0);
    const gradId = sparkGradId(propertyId);
    const hasGsc = Boolean(gscMatch);

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`group relative text-left rounded-2xl border bg-[#0a0d12]/80 backdrop-blur-sm p-4 shadow-[0_22px_60px_rgba(0,0,0,0.30)] hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                selected
                    ? 'border-[#14C4E1]/55 bg-[#0c1a22] shadow-[0_0_28px_rgba(20,196,225,0.25)] ring-2 ring-[#14C4E1]/40'
                    : 'border-white/[0.08] hover:border-[#14C4E1]/30 hover:bg-[#0c1219]'
            }`}
            aria-pressed={selected}
            aria-label={`Pick ${displayName}`}
        >
            {selected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#14C4E1]/30 border border-[#14C4E1]/50 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#7AD9DA]" />
                </div>
            )}
            <div className="flex items-center gap-2 mb-3 pr-6">
                <div className="w-6 h-6 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0">
                    <GlobeIcon className="w-3 h-3 text-[#7AD9DA]" />
                </div>
                <div className="text-sm font-semibold text-white truncate flex-1">{displayName}</div>
            </div>

            <div className="h-12 w-full">
                {isLoading ? (
                    <div className="h-full w-full rounded bg-white/[0.02] animate-pulse" />
                ) : hasSpark ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#7AD9DA" stopOpacity={0.45} />
                                    <stop offset="100%" stopColor="#7AD9DA" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="v"
                                stroke="#7AD9DA"
                                strokeWidth={1.5}
                                fill={`url(#${gradId})`}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                        {isError ? 'No data' : '—'}
                    </div>
                )}
            </div>

            <div className="mt-3">
                <span className="text-[12.5px] text-zinc-300">
                    {isLoading ? <span className="inline-block w-12 h-3 rounded bg-white/[0.05] animate-pulse" /> : (
                        <>
                            <span className="font-semibold text-white">{formatCompact(total)}</span>{' '}
                            <span className="text-zinc-500">visitors</span>
                        </>
                    )}
                </span>
            </div>

            {/* Connection-status pills — informational so the user knows what
                data is paired with this website before they pick it. */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/[0.10] border border-emerald-500/25 text-[10px] font-medium text-emerald-300">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    GA4 connected
                </span>
                {hasGsc ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/[0.10] border border-emerald-500/25 text-[10px] font-medium text-emerald-300">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Search Console connected
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/[0.08] border border-amber-500/25 text-[10px] font-medium text-amber-300">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Search Console not connected
                    </span>
                )}
            </div>
        </button>
    );
}

// ─── WebsiteCardGsc ─────────────────────────────────────────────────
// Symmetrical card for the GSC-only inverted branch. Shows total clicks
// + 30-day click sparkline pulled from /api/seo's `trend` array.

type GscTrendPoint = { date?: string; clicks?: number };

function WebsiteCardGsc({
    siteUrl,
    onClick,
    selected,
}: {
    siteUrl: string;
    onClick: () => void;
    selected?: boolean;
}) {
    const { data, isLoading, isError } = useSeoData('all', siteUrl, true, '30d', false);
    const trend: GscTrendPoint[] = Array.isArray(data?.trend) ? data.trend : [];
    const sparkData = useMemo(
        () => trend.map((t) => ({ v: typeof t.clicks === 'number' ? t.clicks : 0 })),
        [trend]
    );
    const total = useMemo(() => {
        if (typeof data?.kpis?.totalClicks === 'number') return data.kpis.totalClicks;
        return sparkData.reduce((sum, p) => sum + (p.v || 0), 0);
    }, [data, sparkData]);
    const hasSpark = sparkData.length > 1 && sparkData.some((p) => p.v > 0);
    const gradId = sparkGradId(siteUrl);
    const label = formatSiteLabel(siteUrl);

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group relative text-left rounded-2xl border bg-[#0a0d12]/80 backdrop-blur-sm p-4 shadow-[0_22px_60px_rgba(0,0,0,0.30)] hover:-translate-y-0.5 transition-all ${
                selected
                    ? 'border-[#14C4E1]/55 bg-[#0c1a22] shadow-[0_0_28px_rgba(20,196,225,0.25)] ring-2 ring-[#14C4E1]/40'
                    : 'border-white/[0.08] hover:border-[#14C4E1]/30 hover:bg-[#0c1219]'
            }`}
            aria-pressed={selected}
            aria-label={`Pick ${label}`}
        >
            {selected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#14C4E1]/30 border border-[#14C4E1]/50 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#7AD9DA]" />
                </div>
            )}
            <div className="flex items-center gap-2 mb-3 pr-6">
                <div className="w-6 h-6 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0">
                    <GlobeIcon className="w-3 h-3 text-[#7AD9DA]" />
                </div>
                <div className="text-sm font-semibold text-white truncate flex-1">{label}</div>
            </div>

            <div className="h-12 w-full">
                {isLoading ? (
                    <div className="h-full w-full rounded bg-white/[0.02] animate-pulse" />
                ) : hasSpark ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#7AD9DA" stopOpacity={0.45} />
                                    <stop offset="100%" stopColor="#7AD9DA" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="v"
                                stroke="#7AD9DA"
                                strokeWidth={1.5}
                                fill={`url(#${gradId})`}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                        {isError ? 'No data' : '—'}
                    </div>
                )}
            </div>

            <div className="mt-3">
                <span className="text-[12.5px] text-zinc-300">
                    {isLoading ? <span className="inline-block w-12 h-3 rounded bg-white/[0.05] animate-pulse" /> : (
                        <>
                            <span className="font-semibold text-white">{formatCompact(total)}</span>{' '}
                            <span className="text-zinc-500">clicks</span>
                        </>
                    )}
                </span>
            </div>

            {/* Connection-status pills — GSC-only inverted branch always
                has GSC; GA4 is amber/not-connected by definition. */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/[0.10] border border-emerald-500/25 text-[10px] font-medium text-emerald-300">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Search Console connected
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/[0.08] border border-amber-500/25 text-[10px] font-medium text-amber-300">
                    <AlertCircle className="w-2.5 h-2.5" />
                    GA4 not connected
                </span>
            </div>
        </button>
    );
}

// ─── Step2GscRow ────────────────────────────────────────────────────
// Rich Search Console row used on Step 2. Mirrors the Step 1 GA4 cards
// (sparkline + KPI + connection pill) but in a horizontal layout so the
// list still scans top-to-bottom. Sparkline is yellow because it's
// charting impressions, not clicks — the visual cue separates the two
// metrics at a glance from the rest of the cyan/emerald palette.

type GscTrendImpressionsPoint = { date?: string; impressions?: number };

function Step2GscRow({
    siteUrl,
    isMatch,
    isSelected,
    isSaving,
    disabled,
    onClick,
}: {
    siteUrl: string;
    isMatch: boolean;
    isSelected: boolean;
    isSaving: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    const { data, isLoading, isError } = useSeoData('all', siteUrl, true, '30d', false);
    const trend: GscTrendImpressionsPoint[] = Array.isArray(data?.trend) ? data.trend : [];
    const sparkData = useMemo(
        () => trend.map((t) => ({ v: typeof t.impressions === 'number' ? t.impressions : 0 })),
        [trend]
    );
    const total = useMemo(() => {
        if (typeof data?.kpis?.totalImpressions === 'number') return data.kpis.totalImpressions;
        return sparkData.reduce((sum, p) => sum + (p.v || 0), 0);
    }, [data, sparkData]);
    const hasSpark = sparkData.length > 1 && sparkData.some((p) => p.v > 0);
    const gradId = sparkGradId(`s2-${siteUrl}`);
    const label = formatSiteLabel(siteUrl);

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-pressed={isSelected}
            aria-label={`Connect ${label}`}
            className={`group relative w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center gap-3.5 ${
                isSelected
                    ? 'border-[#14C4E1]/55 bg-[#14C4E1]/[0.10] shadow-[0_0_24px_rgba(20,196,225,0.20)] ring-2 ring-[#14C4E1]/40'
                    : isMatch
                        ? 'border-[#14C4E1]/30 bg-[#14C4E1]/[0.05] hover:bg-[#14C4E1]/[0.10] hover:-translate-y-0.5'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.16] hover:-translate-y-0.5'
            } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
        >
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                (isSelected || isMatch)
                    ? 'border-[#14C4E1]/30 bg-[#14C4E1]/[0.10]'
                    : 'border-white/[0.06] bg-white/[0.02]'
            }`}>
                <GlobeIcon className={`w-4 h-4 ${(isSelected || isMatch) ? 'text-[#7AD9DA]' : 'text-zinc-400'}`} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-white truncate">{label}</span>
                    {isMatch && !isSelected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-semibold uppercase tracking-wider text-emerald-300 flex-shrink-0">
                            <Sparkles className="w-2.5 h-2.5" />
                            Recommended
                        </span>
                    )}
                </div>
                <div className="text-[10.5px] text-zinc-500 truncate font-mono mb-1.5">{siteUrl}</div>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/[0.10] border border-emerald-500/25 text-[9.5px] font-medium text-emerald-300">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Search Console connected
                </span>
            </div>

            <div className="flex flex-col items-end justify-center gap-1 flex-shrink-0">
                <div className="h-9 w-[96px]">
                    {isLoading ? (
                        <div className="h-full w-full rounded bg-white/[0.02] animate-pulse" />
                    ) : hasSpark ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#FACC15" stopOpacity={0.45} />
                                        <stop offset="100%" stopColor="#FACC15" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="v"
                                    stroke="#FACC15"
                                    strokeWidth={1.5}
                                    fill={`url(#${gradId})`}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-end pr-1 text-[9.5px] text-zinc-600">
                            {isError ? 'No data' : '—'}
                        </div>
                    )}
                </div>
                <div className="flex items-baseline gap-1 leading-none">
                    {isLoading ? (
                        <span className="inline-block w-10 h-3 rounded bg-white/[0.05] animate-pulse" />
                    ) : (
                        <>
                            <span className="text-[12px] font-semibold text-white">{formatCompact(total)}</span>
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">impr.</span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-shrink-0 ml-1 w-4 flex items-center justify-center">
                {isSaving ? (
                    <Loader2 className="w-4 h-4 text-[#7AD9DA] animate-spin" />
                ) : isSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-[#7AD9DA]" />
                ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all" />
                )}
            </div>
        </button>
    );
}

