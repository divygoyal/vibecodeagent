'use client';

/**
 * /dashboard/setup — Unified workspace selection.
 *
 * Single screen where the user picks a GA4 property and/or a GSC site. The
 * selection becomes the dashboard's single source of truth (see
 * useWorkspace() in dashboard/layout.tsx). At least one of the two is
 * required before Continue is enabled. Reachable both as a guarded
 * post-login step (no saved workspace yet) and as a "Workspace" link in
 * the dashboard header.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { CheckCircle2, Search, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../layout';
import {
    formatSiteLabel,
    matchPropertyToSite,
    type PropertyOption,
    type SiteOption,
} from '@/lib/dashboardSelection';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList, usePropertyList } from '@/lib/useDashboardData';

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

export default function SetupPage() {
    const router = useRouter();
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
    const [propSearch, setPropSearch] = useState('');
    const [siteSearch, setSiteSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [autoMatched, setAutoMatched] = useState<{ property: string; site: string } | null>(null);

    // Hydrate the form from current workspace once it loads.
    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        if (selectedProperty && !chosenProperty) setChosenProperty(selectedProperty);
        if (selectedSite && !chosenSite) setChosenSite(selectedSite);
    }, [isWorkspaceLoaded, selectedProperty, selectedSite, chosenProperty, chosenSite]);

    // Single-property + single-site auto-select on first paint.
    useEffect(() => {
        if (chosenProperty || chosenSite) return;
        if (propsLoading || sitesLoading) return;
        if (properties.length === 1 && properties[0].property) {
            setChosenProperty(properties[0].property);
        }
        if (sites.length === 1 && sites[0].siteUrl) {
            setChosenSite(sites[0].siteUrl);
        }
    }, [propsLoading, sitesLoading, properties, sites, chosenProperty, chosenSite]);

    // Auto-match GSC site when a GA4 property is picked and no site selected.
    useEffect(() => {
        if (!chosenProperty || chosenSite) return;
        if (!sites.length) return;
        const propObj = properties.find((p) => p.property === chosenProperty);
        if (!propObj?.displayName) return;
        const propTokens = new Set(
            (propObj.displayName || '')
                .toLowerCase()
                .split(/[\s.\-_/]+/)
                .filter((t) => t.length >= 3)
        );
        for (const site of sites) {
            const { tokens } = siteHostTokens(site.siteUrl);
            if (tokensOverlap(propTokens, tokens)) {
                setChosenSite(site.siteUrl);
                setAutoMatched({ property: chosenProperty, site: site.siteUrl });
                return;
            }
        }
    }, [chosenProperty, chosenSite, sites, properties]);

    // Reverse auto-match: when a GSC site is picked first, find a GA4 property.
    useEffect(() => {
        if (!chosenSite || chosenProperty) return;
        if (!properties.length) return;
        const match = matchPropertyToSite(chosenSite, properties);
        if (match?.property) {
            setChosenProperty(match.property);
            setAutoMatched({ property: match.property, site: chosenSite });
        }
    }, [chosenSite, chosenProperty, properties]);

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

    const canContinue = Boolean(chosenProperty || chosenSite);

    // Mismatch warning: both picked but tokens don't overlap.
    const showMismatch = useMemo(() => {
        if (!chosenProperty || !chosenSite) return false;
        const propObj = properties.find((p) => p.property === chosenProperty);
        if (!propObj?.displayName) return false;
        const propTokens = new Set(
            (propObj.displayName || '')
                .toLowerCase()
                .split(/[\s.\-_/]+/)
                .filter((t) => t.length >= 3)
        );
        const { tokens: siteTokens } = siteHostTokens(chosenSite);
        return propTokens.size > 0 && siteTokens.size > 0 && !tokensOverlap(propTokens, siteTokens);
    }, [chosenProperty, chosenSite, properties]);

    const onContinue = async () => {
        if (!canContinue || saving) return;
        setSaving(true);
        setSaveError(null);
        const ok = await saveWorkspace({
            property: chosenProperty || null,
            site: chosenSite || null,
        });
        setSaving(false);
        if (!ok) {
            setSaveError('Could not save your workspace. Try again.');
            return;
        }
        router.push('/dashboard/ai-chat');
    };

    const onSkip = async () => {
        // Save an empty workspace so the redirect-guard stops looping back here.
        // The dashboard will surface "Pick a property" banners until they return.
        await saveWorkspace({ property: null, site: null });
        router.push('/dashboard/ai-chat');
    };

    const onContinueWithDemo = async () => {
        setSaving(true);
        const ok = await saveWorkspace({ property: DEMO_PROPERTY_ID, site: DEMO_SITE_URL });
        setSaving(false);
        if (ok) router.push('/dashboard/ai-chat');
    };

    // ─── Render branches ──────────────────────────────────────────────

    if (!hasGoogleConnection) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] p-8 text-center shadow-[0_22px_50px_rgba(0,0,0,0.4)]">
                    <div className="w-12 h-12 rounded-xl bg-[#14C4E1]/14 mx-auto mb-5 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-[#7AD9DA]" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-white mb-2">Connect Google to set up your workspace</h1>
                    <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                        TrafficClaw uses your Google Analytics and Search Console data. Connect once and we&apos;ll bring everything in.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <button
                            type="button"
                            onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                            className="px-5 py-2.5 rounded-xl bg-[#14C4E1]/14 text-[#7AD9DA] hover:bg-[#14C4E1]/22 border border-[#14C4E1]/22 transition-colors text-sm font-medium"
                        >
                            Connect Google
                        </button>
                        <button
                            type="button"
                            onClick={onContinueWithDemo}
                            disabled={saving}
                            className="px-5 py-2.5 rounded-xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-sm font-medium disabled:opacity-50"
                        >
                            Continue with demo data
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const inventoryEmpty = !propsLoading && !sitesLoading && properties.length === 0 && sites.length === 0 && !propsError && !sitesError;

    if (inventoryEmpty) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] p-8 text-center shadow-[0_22px_50px_rgba(0,0,0,0.4)]">
                    <div className="w-12 h-12 rounded-xl bg-yellow-500/12 mx-auto mb-5 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-yellow-400" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-white mb-2">No GA4 or Search Console data found</h1>
                    <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                        We couldn&apos;t find any GA4 properties or Search Console sites for this Google account. You can re-connect with a different account, or explore the dashboard with demo data.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <button
                            type="button"
                            onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                            className="px-5 py-2.5 rounded-xl bg-[#14C4E1]/14 text-[#7AD9DA] hover:bg-[#14C4E1]/22 border border-[#14C4E1]/22 transition-colors text-sm font-medium"
                        >
                            Switch Google account
                        </button>
                        <button
                            type="button"
                            onClick={onContinueWithDemo}
                            disabled={saving}
                            className="px-5 py-2.5 rounded-xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-sm font-medium disabled:opacity-50"
                        >
                            Continue with demo data
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Main two-column picker ───────────────────────────────────────

    return (
        <div className="max-w-5xl mx-auto py-6 sm:py-10 px-4 pb-32 sm:pb-10">
            <div className="mb-6 sm:mb-8 flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-white">Pick your workspace</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Choose a GA4 property and a Search Console site. Both are recommended, but either one will work.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onSkip}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
                >
                    Skip for now
                </button>
            </div>

            {autoMatched && chosenProperty === autoMatched.property && chosenSite === autoMatched.site && (
                <div className="mb-4 rounded-xl border border-[#14C4E1]/22 bg-[#14C4E1]/06 px-4 py-2.5 flex items-center gap-2 text-xs text-[#7AD9DA]">
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>We auto-matched a GA4 property to your Search Console site. Change either side below if it&apos;s wrong.</span>
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
                {/* GA4 column */}
                <PickerColumn
                    title="GA4 property"
                    badge={chosenProperty ? properties.find((p) => p.property === chosenProperty)?.displayName || 'Selected' : 'None selected'}
                    error={propsError ? 'Could not load GA4 properties.' : null}
                    loading={propsLoading}
                    search={propSearch}
                    onSearch={setPropSearch}
                    emptyText="No GA4 properties on this account."
                >
                    {filteredProperties.map((p) => {
                        const id = p.property || p.propertyId || '';
                        const isSelected = chosenProperty === id;
                        return (
                            <button
                                key={id || p.displayName}
                                type="button"
                                disabled={!id}
                                onClick={() => setChosenProperty(isSelected ? '' : id)}
                                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${
                                    isSelected
                                        ? 'border-[#14C4E1]/40 bg-[#14C4E1]/10 text-white'
                                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.1]'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{p.displayName || '(unnamed)'}</div>
                                    <div className="text-[10px] text-zinc-500 truncate">{id}</div>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#7AD9DA] flex-shrink-0" />}
                            </button>
                        );
                    })}
                </PickerColumn>

                {/* GSC column */}
                <PickerColumn
                    title="Search Console site"
                    badge={chosenSite ? formatSiteLabel(chosenSite) : 'None selected'}
                    error={sitesError ? 'Could not load Search Console sites.' : null}
                    loading={sitesLoading}
                    search={siteSearch}
                    onSearch={setSiteSearch}
                    emptyText="No Search Console sites on this account."
                >
                    {filteredSites.map((s) => {
                        const isSelected = chosenSite === s.siteUrl;
                        return (
                            <button
                                key={s.siteUrl}
                                type="button"
                                onClick={() => setChosenSite(isSelected ? '' : s.siteUrl)}
                                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${
                                    isSelected
                                        ? 'border-[#14C4E1]/40 bg-[#14C4E1]/10 text-white'
                                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.1]'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{formatSiteLabel(s.siteUrl)}</div>
                                    <div className="text-[10px] text-zinc-500 truncate">{s.siteUrl}</div>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#7AD9DA] flex-shrink-0" />}
                            </button>
                        );
                    })}
                </PickerColumn>
            </div>

            {showMismatch && (
                <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.06] px-4 py-3 flex items-start gap-2 text-xs text-yellow-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        These don&apos;t look like the same site — your GA4 property and Search Console site appear to be different domains. Continue anyway if that&apos;s intentional.
                    </span>
                </div>
            )}

            {saveError && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
                    {saveError}
                </div>
            )}

            {/* Continue — sticky on mobile, inline on desktop */}
            <div className="fixed sm:static bottom-0 inset-x-0 sm:bottom-auto sm:inset-x-auto sm:mt-6 px-4 sm:px-0 py-3 sm:py-0 bg-[#010203]/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-0 border-t border-white/[0.06] sm:border-0 z-10">
                <div className="max-w-5xl mx-auto sm:mx-0 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={!canContinue || saving}
                        className="px-5 py-2.5 rounded-xl bg-[#14C4E1]/14 text-[#7AD9DA] hover:bg-[#14C4E1]/22 border border-[#14C4E1]/22 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? 'Saving…' : 'Continue'}
                        {!saving && <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PickerColumn({
    title,
    badge,
    error,
    loading,
    search,
    onSearch,
    emptyText,
    children,
}: {
    title: string;
    badge: string;
    error: string | null;
    loading: boolean;
    search: string;
    onSearch: (v: string) => void;
    emptyText: string;
    children: React.ReactNode;
}) {
    const childArray = Array.isArray(children) ? children : [children];
    const isEmpty = !loading && !error && childArray.flat().filter(Boolean).length === 0;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <span className="text-[10px] text-zinc-500 truncate max-w-[55%]">{badge}</span>
            </div>
            <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/30"
                />
            </div>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {loading && (
                    <>
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-12 rounded-lg bg-white/[0.02] animate-pulse" />
                        ))}
                    </>
                )}
                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {error}
                    </div>
                )}
                {!loading && !error && children}
                {isEmpty && (
                    <div className="text-xs text-zinc-500 italic px-3 py-4 text-center">
                        {emptyText}
                    </div>
                )}
            </div>
        </div>
    );
}
