'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { usePathname, useRouter } from 'next/navigation';

import {
    resolveDashboardSelection,
    type PropertyOption,
    type SiteOption,
} from '@/lib/dashboardSelection';
import { isRangePreset, LEGACY_RANGES, toLegacyRange } from '@/lib/dateRange';
import { DEMO_DOMAIN_LABEL } from '@/lib/demoWorkspace';
import { buildSiteDirectory, PAIRS_KEY, siteForSelection } from '@/lib/sites/siteDirectory';
import { useConnections, usePropertyList, useSiteList } from '@/lib/useDashboardData';
import { patchWorkspaceWithRetry } from '@/lib/workspaceClient';
import { useChatStore } from '@/stores/chatStore';
import { WorkspaceContext, type WorkspaceSaveInput } from './workspaceContext';

async function pairsFetcher(url: string): Promise<{ pairs: Record<string, string | null> }> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { pairs: {} };
    return res.json();
}

type SessionUser = { id?: string; name?: string | null; email?: string | null; image?: string | null };

/** Cookie the middleware reads to send old /dashboard/analytics|seo|audit URLs to /dashboard/s/<host>/…. */
export const SITE_COOKIE = 'tc_site';

function writeSiteCookie(host: string | null) {
    if (typeof document === 'undefined') return;
    if (host) {
        document.cookie = `${SITE_COOKIE}=${encodeURIComponent(host)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } else {
        document.cookie = `${SITE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
}

function getInventoryErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'info' in error) {
        const info = (error as { info?: { error?: string } }).info;
        if (info?.error) return info.error;
    }
    if (error instanceof Error) return error.message;
    return null;
}

const LEGACY_SET = new Set<string>(LEGACY_RANGES);

/** Legacy key for the old pages: legacy keys pass through, new presets map to the nearest one. */
function legacyRangeOf(key: string): string {
    if (LEGACY_SET.has(key)) return key;
    if (isRangePreset(key)) return toLegacyRange(key);
    return '30d';
}

/**
 * Workspace state for the whole app (moved out of the old dashboard layout):
 * the selected GA4 property + Search Console site (server-persisted, with a
 * user-scoped localStorage first-paint cache), provider registration, the
 * GA4/GSC inventories, the site directory and the legacy range key.
 *
 * Changes from the old layout:
 * - no forced redirect to /dashboard/setup when nothing is picked (PRODUCT: the
 *   user lands on Portfolio); the stale-workspace guard only runs on old
 *   single-site pages;
 * - the selected site's host is mirrored to the `tc_site` cookie;
 * - saved ranges may be lib/dateRange presets ('3m'); old pages get the
 *   nearest legacy key ('90d').
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const pathname = usePathname() ?? '';
    const router = useRouter();
    const isSetupRoute = pathname === '/dashboard/setup';
    const user = session?.user as SessionUser | undefined;

    const getUserKey = useCallback((key: string) => {
        const uid = user?.id || user?.email || '';
        return uid ? `${key}:${uid}` : key;
    }, [user?.id, user?.email]);

    const [selectedProperty, setSelectedProperty] = useState('');
    const [selectedSite, setSelectedSite] = useState('');
    const [rangeKey, setRangeKey] = useState('30d');
    const [workspaceLabel, setWorkspaceLabel] = useState('');
    const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
    const [welcomeSeen, setWelcomeSeen] = useState(true);
    const workspaceLoadAttempted = useRef(false);

    // User-scoped first-paint cache.
    useEffect(() => {
        if (!user) return;
        const uid = user.id || user.email || '';
        if (uid) useChatStore.getState().setCurrentUser(uid);
        const savedProp = localStorage.getItem(getUserKey('tc-last-property')) || '';
        const savedSite = localStorage.getItem(getUserKey('tc-last-site')) || '';
        const savedRange = localStorage.getItem(getUserKey('tc-last-range')) || '';
         
        if (savedProp) setSelectedProperty(savedProp);
        if (savedSite) setSelectedSite(savedSite);
        if (savedRange) setRangeKey(savedRange);
    }, [user, getUserKey]);

    // Scope chat history to the active workspace pair.
    useEffect(() => {
        if (!user) return;
        useChatStore.getState().setCurrentWorkspace(selectedProperty || selectedSite || '');
    }, [user, selectedProperty, selectedSite]);

    const loadWorkspace = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch('/api/user/workspace', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.exists && (data.selected_property_id || data.selected_site_url)) {
                if (typeof data.selected_property_id === 'string') {
                    setSelectedProperty(data.selected_property_id);
                    localStorage.setItem(getUserKey('tc-last-property'), data.selected_property_id);
                }
                if (typeof data.selected_site_url === 'string') {
                    setSelectedSite(data.selected_site_url);
                    localStorage.setItem(getUserKey('tc-last-site'), data.selected_site_url);
                }
            }
            if (data?.exists && typeof data.selected_range === 'string' && data.selected_range) {
                setRangeKey(data.selected_range);
                localStorage.setItem(getUserKey('tc-last-range'), data.selected_range);
            }
            setWorkspaceLabel(typeof data?.workspace_label === 'string' ? data.workspace_label : '');
            setWelcomeSeen(Boolean(data?.welcome_seen));
        } catch {
            // Network errors are non-fatal: keep the localStorage values.
        } finally {
            setIsWorkspaceLoaded(true);
        }
    }, [user, getUserKey]);

    useEffect(() => {
        if (!user || workspaceLoadAttempted.current) return;
        workspaceLoadAttempted.current = true;
        void loadWorkspace();
    }, [user, loadWorkspace]);

    const saveWorkspace = useCallback(async (data: WorkspaceSaveInput): Promise<boolean> => {
        if (!user) return false;
        const payload: Record<string, unknown> = {};
        if (data.property === null) {
            payload.clear_property = true;
            setSelectedProperty('');
            localStorage.removeItem(getUserKey('tc-last-property'));
        } else if (typeof data.property === 'string') {
            payload.selected_property_id = data.property;
            setSelectedProperty(data.property);
            localStorage.setItem(getUserKey('tc-last-property'), data.property);
        }
        if (data.site === null) {
            payload.clear_site = true;
            setSelectedSite('');
            localStorage.removeItem(getUserKey('tc-last-site'));
        } else if (typeof data.site === 'string') {
            payload.selected_site_url = data.site;
            setSelectedSite(data.site);
            localStorage.setItem(getUserKey('tc-last-site'), data.site);
        }
        if (typeof data.range === 'string') {
            payload.selected_range = data.range;
            setRangeKey(data.range);
            localStorage.setItem(getUserKey('tc-last-range'), data.range);
        }
        if (data.label === null) {
            payload.clear_label = true;
            setWorkspaceLabel('');
        } else if (typeof data.label === 'string') {
            payload.workspace_label = data.label;
            setWorkspaceLabel(data.label);
        }
        const result = await patchWorkspaceWithRetry(payload);
        if (!result.ok) {
            console.warn(`Workspace save failed after ${result.attempts} attempt(s): ${result.error ?? `HTTP ${result.status}`}`);
        }
        return result.ok;
    }, [user, getUserKey]);

    // Legacy setter (old date pickers): local only, like before; saving happens through saveWorkspace.
    const setRange = useCallback((v: string) => {
        setRangeKey(v);
        if (user) localStorage.setItem(getUserKey('tc-last-range'), v);
    }, [user, getUserKey]);

    // ─── Provider registration (unchanged from the old layout) ───
    const [registrationState, setRegistrationState] = useState({
        isRegistered: false,
        isRegistering: true,
        registrationError: null as string | null,
    });
    const registrationAttempted = useRef(false);
    const registrationCacheHydrated = useRef(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            sessionStorage.removeItem('tc-registered');
            sessionStorage.removeItem('tc-registered-user');
        }
    }, [status]);

    useEffect(() => {
        if (!session?.user || registrationCacheHydrated.current) return;
        registrationCacheHydrated.current = true;
        const cached = sessionStorage.getItem('tc-registered');
        const cachedUser = sessionStorage.getItem('tc-registered-user');
        const currentUser = session.user.email || session.user.name || '';
        if (cached === 'true' && cachedUser && cachedUser === currentUser) {
            registrationAttempted.current = true;
             
            setRegistrationState({ isRegistered: true, isRegistering: false, registrationError: null });
        }
    }, [session?.user]);

    useEffect(() => {
        if (!session?.user?.email) return;
        const cachedUser = sessionStorage.getItem('tc-registered-user');
        if (cachedUser && cachedUser !== session.user.email) {
            sessionStorage.removeItem('tc-registered');
            sessionStorage.removeItem('tc-registered-user');
            registrationAttempted.current = false;
             
            setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
        }
    }, [session?.user?.email]);

    const getRegistrationWarning = useCallback((reason?: string) => {
        const normalized = (reason || '').toLowerCase();
        if (normalized.includes('abort') || normalized.includes('timed out')) {
            return 'Background provider sync is taking longer than usual. The dashboard will keep loading while we retry.';
        }
        if (normalized.includes('missing-admin-api-key') || normalized.includes('missing-session-data')) {
            return 'Background provider sync is temporarily unavailable. The dashboard will keep loading in degraded mode.';
        }
        return 'Background provider sync is delayed right now. The dashboard can still load while connected features catch up.';
    }, []);

    const applyDegradedRegistration = useCallback((reason?: string) => {
        setRegistrationState({ isRegistered: true, isRegistering: false, registrationError: getRegistrationWarning(reason) });
    }, [getRegistrationWarning]);

    useEffect(() => {
        if (registrationState.isRegistered) return;
        if (!session?.user) return;
        if (registrationAttempted.current) return;
        registrationAttempted.current = true;
        const registerProvider = async () => {
            try {
                setRegistrationState((prev) => ({ ...prev, isRegistering: true, registrationError: null }));
                const res = await fetch('/api/auth/register-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data?.synced) {
                        sessionStorage.setItem('tc-registered', 'true');
                        sessionStorage.setItem('tc-registered-user', session.user?.email || session.user?.name || '');
                        setRegistrationState({ isRegistered: true, isRegistering: false, registrationError: null });
                    } else if (data?.registered || data?.degraded) {
                        applyDegradedRegistration(data?.reason);
                    } else {
                        throw new Error(data?.reason || 'Provider sync is still pending');
                    }
                } else {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to register provider');
                }
            } catch (err) {
                console.warn('Registration degraded:', err);
                applyDegradedRegistration(err instanceof Error ? err.message : undefined);
            }
        };
        void registerProvider();
    }, [applyDegradedRegistration, registrationState.isRegistered, session?.user]);

    const retryRegistration = useCallback(() => {
        registrationAttempted.current = false;
        setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
    }, []);

    const markWelcomeSeen = useCallback(() => {
        setWelcomeSeen(true);
        fetch('/api/user/workspace', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mark_welcome_seen: true }),
        }).catch(() => { /* non-fatal */ });
    }, []);

    const ctxBase = useMemo(() => ({ ...registrationState, retryRegistration }), [registrationState, retryRegistration]);

    return (
        <WorkspaceContext.Provider
            value={{
                // Inventory-dependent fields are filled by InventoryLayer below
                // (its hooks need isRegistered from this context).
                ...ctxBase,
                selectedProperty,
                setSelectedProperty,
                selectedSite,
                setSelectedSite,
                resolvedPropertyId: '',
                resolvedSiteUrl: '',
                hasGa4Properties: false,
                ga4Availability: 'inventory_empty',
                propertyInventoryError: null,
                siteInventoryError: null,
                propertyInventoryLoading: true,
                siteInventoryLoading: true,
                isDemoWorkspace: false,
                demoDomainLabel: DEMO_DOMAIN_LABEL,
                range: legacyRangeOf(rangeKey),
                setRange,
                rangeKey,
                workspaceLabel,
                saveWorkspace,
                loadWorkspace,
                isWorkspaceLoaded,
                hasGoogleConnection: false,
                siteDirectory: [],
                siteDirectoryLoading: true,
                welcomeSeen,
                markWelcomeSeen,
            }}
        >
            <InventoryLayer
                user={user}
                pathname={pathname}
                isSetupRoute={isSetupRoute}
                router={router}
                getUserKey={getUserKey}
                selectedProperty={selectedProperty}
                selectedSite={selectedSite}
                setSelectedProperty={setSelectedProperty}
                setSelectedSite={setSelectedSite}
            >
                {children}
            </InventoryLayer>
        </WorkspaceContext.Provider>
    );
}

interface InventoryLayerProps {
    children: ReactNode;
    user: SessionUser | undefined;
    pathname: string;
    isSetupRoute: boolean;
    router: ReturnType<typeof useRouter>;
    getUserKey: (k: string) => string;
    selectedProperty: string;
    selectedSite: string;
    setSelectedProperty: (v: string) => void;
    setSelectedSite: (v: string) => void;
}

/**
 * Second layer: the inventory hooks use useRegisteredSWR, which reads
 * isRegistered from the context above, so they must sit inside it.
 */
function InventoryLayer({ children, user, pathname, isSetupRoute, router, getUserKey, selectedProperty, selectedSite, setSelectedProperty, setSelectedSite }: InventoryLayerProps) {
    const parent = useWorkspaceParent();
    const { hasGoogleConnection } = useConnections();
    const { sites: gscSites, isLoading: siteInventoryLoading, hasLoaded: siteInventoryLoaded, error: siteErr } = useSiteList(hasGoogleConnection);
    const { properties, isLoading: propertyInventoryLoading, hasLoaded: propertyInventoryLoaded, error: propErr } = usePropertyList(hasGoogleConnection);

    const typedSites = gscSites as SiteOption[];
    const typedProperties = properties as PropertyOption[];
    const siteInventoryError = getInventoryErrorMessage(siteErr);
    const propertyInventoryError = getInventoryErrorMessage(propErr);

    const selection = useMemo(() => resolveDashboardSelection({
        selectedSite,
        selectedProperty,
        sites: typedSites,
        properties: typedProperties,
        siteInventoryError,
        propertyInventoryError,
        siteInventoryLoading,
        propertyInventoryLoading,
        siteInventoryReady: siteInventoryLoaded,
        propertyInventoryReady: propertyInventoryLoaded,
    }), [propertyInventoryError, propertyInventoryLoading, propertyInventoryLoaded, selectedProperty, selectedSite, siteInventoryError, siteInventoryLoading, siteInventoryLoaded, typedProperties, typedSites]);
    const { resolvedSiteUrl, resolvedPropertyId, hasGa4Properties, ga4Availability, isStaleWorkspace } = selection;

    const isDemoWorkspace = hasGoogleConnection
        && !siteInventoryLoading && !propertyInventoryLoading
        && !siteInventoryError && !propertyInventoryError
        && typedSites.length === 0 && typedProperties.length === 0;

    // The pairing the portfolio stored (stream URIs + manual overrides), so the switcher,
    // setup and site pages pair sites exactly like the portfolio and the MCP tools.
    const { data: pairsData } = useSWR<{ pairs: Record<string, string | null> }>(
        user && hasGoogleConnection ? PAIRS_KEY : null,
        pairsFetcher,
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    );
    const storedPairs = pairsData?.pairs;
    const siteDirectory = useMemo(() => buildSiteDirectory({
        sites: typedSites,
        properties: typedProperties,
        pairs: storedPairs,
    }), [typedSites, typedProperties, storedPairs]);
    const siteDirectoryLoading = hasGoogleConnection ? !(siteInventoryLoaded && propertyInventoryLoaded) && !(siteInventoryError && propertyInventoryError) : false;

    // Stale saved selection: old single-site pages send the user to the picker.
    // Portfolio and /dashboard/s/[host] pick the site themselves, so they never redirect.
    useEffect(() => {
        if (!user || !isStaleWorkspace || isSetupRoute) return;
        if (pathname === '/dashboard' || pathname.startsWith('/dashboard/s/')) return;
        if (!/^\/dashboard\/(analytics|seo|audit)(\/|$)/.test(pathname)) return;
        router.replace('/dashboard/setup?reason=stale');
    }, [user, isStaleWorkspace, isSetupRoute, pathname, router]);

    // Keep the selection in step with what resolved (same as the old layout).
    useEffect(() => {
        if (!user) return;
        const key = getUserKey('tc-last-site');
        if (resolvedSiteUrl) {
            if (resolvedSiteUrl !== selectedSite) setSelectedSite(resolvedSiteUrl);
            localStorage.setItem(key, resolvedSiteUrl);
            return;
        }
        if (!siteInventoryError && selectedSite && siteInventoryLoaded) {
            setSelectedSite('');
            localStorage.removeItem(key);
        }
    }, [getUserKey, resolvedSiteUrl, selectedSite, setSelectedSite, siteInventoryError, siteInventoryLoaded, user]);

    useEffect(() => {
        if (!user) return;
        const key = getUserKey('tc-last-property');
        if (resolvedPropertyId) {
            if (resolvedPropertyId !== selectedProperty) setSelectedProperty(resolvedPropertyId);
            localStorage.setItem(key, resolvedPropertyId);
            return;
        }
        if (!propertyInventoryError && selectedProperty && propertyInventoryLoaded) {
            setSelectedProperty('');
            localStorage.removeItem(key);
        }
    }, [getUserKey, propertyInventoryError, propertyInventoryLoaded, resolvedPropertyId, selectedProperty, setSelectedProperty, user]);

    // Mirror the selected site's route key to the tc_site cookie for the middleware redirects.
    const selectedHost = useMemo(
        () => siteForSelection(siteDirectory, resolvedSiteUrl || selectedSite, resolvedPropertyId || selectedProperty)?.host ?? null,
        [siteDirectory, resolvedSiteUrl, selectedSite, resolvedPropertyId, selectedProperty],
    );
    useEffect(() => {
        if (siteDirectoryLoading) return;
        writeSiteCookie(selectedHost);
    }, [selectedHost, siteDirectoryLoading]);

    return (
        <WorkspaceContext.Provider
            value={{
                ...parent,
                resolvedPropertyId,
                resolvedSiteUrl,
                hasGa4Properties,
                ga4Availability,
                propertyInventoryError,
                siteInventoryError,
                propertyInventoryLoading,
                siteInventoryLoading,
                isDemoWorkspace,
                hasGoogleConnection,
                siteDirectory,
                siteDirectoryLoading,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
}

function useWorkspaceParent() {
    return useContext(WorkspaceContext);
}
