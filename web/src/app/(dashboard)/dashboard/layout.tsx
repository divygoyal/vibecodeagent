'use client';

import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
import useSWR from 'swr';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceIncompleteBanner from '@/components/WorkspaceIncompleteBanner';
const CreditWelcome = dynamic(() => import('@/components/CreditWelcome'), { ssr: false });
import DatePicker, { MobileDatePicker } from '@/components/DatePicker';
import MobileBottomBar from '@/components/dashboard/MobileBottomBar';
import MobileExportModal from '@/components/dashboard/MobileExportModal';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import Image from 'next/image';
import {
    Bot, BarChart3, Search, Settings,
    ChevronLeft, ChevronRight, LogOut, Menu, X,
    Coins, MessageSquare,
    ChevronDown, Bell, Globe, Sparkles, Trophy, Share2, Loader2, LifeBuoy, Headphones, type LucideIcon
} from 'lucide-react';
import {
    type Ga4Availability,
    type PropertyOption,
    type SiteOption,
    formatSiteLabel,
    resolveDashboardSelection,
} from '@/lib/dashboardSelection';
import { DEMO_DOMAIN_LABEL } from '@/lib/demoWorkspace';
import { useCredits, useAlerts, useContainerStatus, useSiteList, usePropertyList } from '@/lib/useDashboardData';
import { isPushEnabled, sendBrowserNotification } from '@/lib/pushNotifications';
import { useChatStore } from '@/stores/chatStore';
import { CreditsCard } from '@/components/sidebar/CreditsCard';

// Extended user type — id is added via JWT callback in auth.ts
type SessionUser = { id?: string; name?: string | null; email?: string | null; image?: string | null };
type AlertItem = {
    id: string | number;
    title?: string;
    metric?: string;
    severity?: 'critical' | 'warning' | 'success' | string;
};

// Workspace context — single source of truth for the user's active GA4 + GSC selection.
// Persisted server-side via /api/user/workspace; localStorage acts as a fast first-paint cache.
// Renamed from RegistrationContext; `useRegistration` is kept as an alias to avoid breaking
// 30+ existing call sites in one phase.
export interface WorkspaceSaveInput {
    property?: string | null;
    site?: string | null;
    range?: string;
    label?: string | null;
}
interface WorkspaceContextType {
    isRegistered: boolean;
    isRegistering: boolean;
    registrationError: string | null;
    retryRegistration: () => void;
    selectedProperty: string;
    setSelectedProperty: (v: string) => void;
    selectedSite: string;
    setSelectedSite: (v: string) => void;
    resolvedPropertyId: string;
    resolvedSiteUrl: string;
    hasGa4Properties: boolean;
    ga4Availability: Ga4Availability;
    propertyInventoryError: string | null;
    siteInventoryError: string | null;
    propertyInventoryLoading: boolean;
    siteInventoryLoading: boolean;
    isDemoWorkspace: boolean;
    demoDomainLabel: string;
    range: string;
    setRange: (v: string) => void;
    workspaceLabel: string;
    saveWorkspace: (data: WorkspaceSaveInput) => Promise<boolean>;
    loadWorkspace: () => Promise<void>;
    isWorkspaceLoaded: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
    isRegistered: false,
    isRegistering: true,
    registrationError: null,
    retryRegistration: () => { },
    selectedProperty: '',
    setSelectedProperty: () => { },
    selectedSite: '',
    setSelectedSite: () => { },
    resolvedPropertyId: '',
    resolvedSiteUrl: '',
    hasGa4Properties: false,
    ga4Availability: 'inventory_empty',
    propertyInventoryError: null,
    siteInventoryError: null,
    propertyInventoryLoading: false,
    siteInventoryLoading: false,
    isDemoWorkspace: false,
    demoDomainLabel: DEMO_DOMAIN_LABEL,
    range: '30d',
    setRange: () => { },
    workspaceLabel: '',
    saveWorkspace: async () => false,
    loadWorkspace: async () => { },
    isWorkspaceLoaded: false,
});

export const useWorkspace = () => useContext(WorkspaceContext);
// Back-compat alias — existing call sites import { useRegistration }. Phase 3 sweeps these.
export const useRegistration = useWorkspace;

function getInventoryErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'info' in error) {
        const info = (error as { info?: { error?: string } }).info;
        if (info?.error) {
            return info.error;
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return null;
}

type SidebarItem = { icon: LucideIcon; label: string; href: string };
type SidebarGroup = { label: string | null; items: SidebarItem[] };

const sidebarGroups: SidebarGroup[] = [
    { label: 'Intelligence', items: [
        { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/ai-chat' },
        { icon: Bot, label: 'Bot', href: '/dashboard/bot' },
    ]},
    { label: 'Analysis', items: [
        { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
        { icon: Search, label: 'SEO', href: '/dashboard/seo' },
        { icon: Share2, label: 'Share Dashboard', href: '/dashboard/share' },
    ]},
    { label: 'Social APIs', items: [
        { icon: Sparkles, label: 'X mentions', href: '/dashboard/x-api' },
        { icon: Globe, label: 'Globe API', href: '/dashboard/globe' },
    ]},
    { label: 'Growth', items: [
        { icon: Trophy, label: 'Leaderboard', href: '/leaderboard' },
    ]},
    { label: 'Help', items: [
        { icon: LifeBuoy, label: 'Support', href: '/dashboard/support' },
    ]},
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const isOverviewRoute = pathname === '/dashboard';
    const isSetupRoute = pathname === '/dashboard/setup';
    const isAnalyticsMainRoute = pathname === '/dashboard/analytics';
    // The dedicated AI-chat page has its own bottom-anchored input, so the
    // MobileBottomBar is suppressed there to avoid two stacked action bars.
    const isAiChatRoute = pathname === '/dashboard/ai-chat';
    // The dashboard-builder edit/preview screens take over the full viewport
    // height and have their own toolbar — hide the bottom bar there too.
    const isDashboardBuilderRoute = pathname?.startsWith('/dashboard/dashboards/') ?? false;
    const shellRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-xl';
    const shellCompactRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-lg';
    const shellBadgeRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-full';
    const brandAccentColor = '#7AD9DA';
    const sidebarActiveItemClasses = 'border border-[#14C4E1]/24 bg-[linear-gradient(180deg,rgba(20,196,225,0.16),rgba(7,48,60,0.16))] text-[#7AD9DA] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(5,24,34,0.24)]';
    const sidebarInactiveItemClasses = 'border border-transparent text-zinc-400 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.06]';
    const { credits, plan: userPlan, subscriptionCancelled, isLoading: creditsLoading } = useCredits();

    // Sidebar badge for unread admin replies on the user's support thread.
    // Polled lightly (60s) — best-effort; never break the dashboard render on a fetch hiccup.
    const { data: supportUnreadData } = useSWR<{ unread: number }>(
        '/api/support/unread-count',
        (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ unread: 0 })),
        { refreshInterval: 60_000, revalidateOnFocus: true, shouldRetryOnError: false },
    );
    const supportUnread = Math.max(0, Number(supportUnreadData?.unread || 0));

    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    // First-paint settling gate. Without this the dashboard flickers through
    // "no property" → "connect Google" → final UI as the four primary SWR
    // queries (container, sites, properties, credits) resolve at different
    // times. We hold a unified loader on the very first dashboard hit per
    // session and lift it once those queries settle, capped at 1.5s so a
    // slow request can't strand the user. Stored in sessionStorage so
    // subsequent navigation within the dashboard is instant.
    //
    // Initial state MUST be deterministic across SSR & CSR — reading
    // sessionStorage in the useState initializer would make SSR (no window)
    // and CSR (returning user with the flag) disagree, which is the same
    // hydration-mismatch class of bug we just fixed for #418/#310. Instead
    // we always start with the gate "not yet settled" and let a useEffect
    // below decide whether to lift it immediately (returning user) or run
    // the timer (first dashboard hit).
    const [settled, setSettled] = useState<boolean>(false);
    // User-scoped localStorage helper — prevents cross-user data leaks
    const user = session?.user as SessionUser | undefined;
    const getUserKey = useCallback((key: string) => {
        const uid = user?.id || user?.email || '';
        return uid ? `${key}:${uid}` : key;
    }, [user?.id, user?.email]);

    // First-paint celebration — show the credit-welcome ONLY the very first
    // time a user signs up, ever. Server-side flag (welcome_seen) so the
    // popup doesn't re-fire after sign-out/sign-in or on a new device.
    // Wired up after loadWorkspace resolves — see effect below.

    const [selectedProperty, setSelectedProperty] = useState('');
    const [selectedSite, setSelectedSite] = useState('');
    const [showWelcome, setShowWelcome] = useState(false);
    const [range, setRange] = useState('30d');

    // Load user-scoped selections and chat history once session is available
    useEffect(() => {
        if (!user) return;
        // Scope chat store to current user
        const uid = user.id || user.email || '';
        if (uid) useChatStore.getState().setCurrentUser(uid);
        // Load saved property/site/range
        const propKey = getUserKey('tc-last-property');
        const siteKey = getUserKey('tc-last-site');
        const rangeKey = getUserKey('tc-last-range');
        const savedProp = localStorage.getItem(propKey) || '';
        const savedSite = localStorage.getItem(siteKey) || '';
        const savedRange = localStorage.getItem(rangeKey) || '30d';
        if (savedProp) setSelectedProperty(savedProp);
        if (savedSite) setSelectedSite(savedSite);
        if (savedRange) setRange(savedRange);
    }, [user, getUserKey]);

    // Scope chat store to the active workspace. Without this, switching workspace
    // (e.g. via /dashboard/setup → saveWorkspace) leaves the previous workspace's
    // messages and thread id in place, so the AI keeps responding inside the old
    // conversation. selectedProperty/Site change together via saveWorkspace, so
    // the combined key flips atomically on a real switch.
    useEffect(() => {
        if (!user) return;
        const workspaceKey = selectedProperty || selectedSite || '';
        useChatStore.getState().setCurrentWorkspace(workspaceKey);
    }, [user, selectedProperty, selectedSite]);

    // Workspace persistence — server is source of truth, localStorage is fast first-paint cache.
    const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
    // workspace_setup_completed is read by the middleware off the JWT claim
    // (see web/src/middleware.ts). The layout no longer needs to track it
    // for redirect purposes; the server flag still flows back via loadWorkspace
    // for any client-side branches that may need it later.
    const [serverWelcomeSeen, setServerWelcomeSeen] = useState(true);
    // User-chosen friendly name shown in the sidebar pill, AI chat, exports.
    // Falls back to formatSiteLabel(displaySiteUrl) or the GA4 displayName
    // when not set; the fallback is computed in the consumer, not here.
    const [workspaceLabel, setWorkspaceLabel] = useState('');
    const workspaceLoadAttempted = useRef(false);

    const loadWorkspace = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch('/api/user/workspace', { cache: 'no-store' });
            if (!res.ok) {
                setIsWorkspaceLoaded(true);
                return;
            }
            const data = await res.json();
            // Only override localStorage values if the server has something for us.
            if (data?.exists && (data.selected_property_id || data.selected_site_url)) {
                if (typeof data.selected_property_id === 'string') {
                    setSelectedProperty(data.selected_property_id);
                    localStorage.setItem(getUserKey('tc-last-property'), data.selected_property_id);
                }
                if (typeof data.selected_site_url === 'string') {
                    setSelectedSite(data.selected_site_url);
                    localStorage.setItem(getUserKey('tc-last-site'), data.selected_site_url);
                }
                if (typeof data.selected_range === 'string') {
                    setRange(data.selected_range);
                    localStorage.setItem(getUserKey('tc-last-range'), data.selected_range);
                }
            }
            setServerWelcomeSeen(Boolean(data?.welcome_seen));
            if (typeof data?.workspace_label === 'string') {
                setWorkspaceLabel(data.workspace_label);
            } else {
                setWorkspaceLabel('');
            }

            // If the user record exists but no GA4 property is saved, force them
            // back through /dashboard/setup. Without this, dashboardSelection
            // would have to either auto-pick an arbitrary first property (the
            // re-login bug we're fixing) or leave the AI chat unscoped — both
            // wrong. The setup flow is the only place that actually persists a
            // deliberate selection.
            if (data?.exists && !data?.selected_property_id && !isSetupRoute) {
                router.replace('/dashboard/setup');
                return;
            }
        } catch {
            // Network errors are non-fatal — we keep whatever localStorage gave us.
        } finally {
            setIsWorkspaceLoaded(true);
        }
    }, [user, getUserKey, isSetupRoute, router]);

    useEffect(() => {
        if (!user || workspaceLoadAttempted.current) return;
        workspaceLoadAttempted.current = true;
        loadWorkspace();
    }, [user, loadWorkspace]);

    // Show the credit-welcome popup ONCE in the user's lifetime. Server-side
    // flag means it won't re-fire after sign-out/sign-in or on a new device.
    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        if (!serverWelcomeSeen) setShowWelcome(true);
    }, [isWorkspaceLoaded, serverWelcomeSeen]);

    const saveWorkspace = useCallback(async (data: WorkspaceSaveInput): Promise<boolean> => {
        if (!user) return false;
        // Optimistic local update so the UI reflects the change immediately.
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
            setRange(data.range);
            localStorage.setItem(getUserKey('tc-last-range'), data.range);
        }
        if (data.label === null) {
            payload.clear_label = true;
            setWorkspaceLabel('');
        } else if (typeof data.label === 'string') {
            payload.workspace_label = data.label;
            setWorkspaceLabel(data.label);
        }
        try {
            const res = await fetch('/api/user/workspace', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            return res.ok;
        } catch {
            return false;
        }
    }, [user, getUserKey]);
    const [bellOpen, setBellOpen] = useState(false);

    // ─── Mobile bottom bar handlers ───
    // The MobileBottomBar (md:hidden, replaces the floating AI-chat sparkle on
    // small screens) emits four actions. Refresh hits SWR's global mutate so
    // every cached query revalidates. AskAI navigates to /dashboard/ai-chat —
    // we deliberately route to the dedicated page rather than dispatching the
    // `open-ai-chat` event the desktop floating button uses, because the
    // floating <AIChatbot> early-returns null when GA4 isn't connected, which
    // would silently swallow the click. The dedicated page handles every
    // connection state with its own connector orbs. Notifications opens the
    // bell dropdown already wired to the desktop top-bar. Export dispatches a
    // custom event that pages with export support listen for, falling back to
    // a toast hint when no listener is mounted.
    const swr = useSWRConfig();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleMobileRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await swr.mutate(() => true, undefined, { revalidate: true });
        } catch {
            // non-fatal — SWR will retry on next focus
        } finally {
            setTimeout(() => setIsRefreshing(false), 600);
        }
    }, [swr]);
    const handleMobileAskAI = useCallback(() => {
        if (pathname === '/dashboard/ai-chat') {
            // Already on the dedicated page — no-op.
            return;
        }
        router.push('/dashboard/ai-chat');
    }, [router, pathname]);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const handleMobileExport = useCallback(() => {
        setExportModalOpen(true);
    }, []);

    // Logout handler — clears user-scoped data to prevent cross-user leaks
    const handleSignOut = useCallback(() => {
        // Clear chat history
        useChatStore.getState().clearChat();
        // Clear user-scoped localStorage keys (any key containing user ID).
        // Matches both `:${uid}` (legacy + workspace-less) and `:${uid}:${workspaceKey}`
        // (chat history / thread id scoped per workspace).
        const uid = user?.id || user?.email || '';
        if (uid) {
            const suffix = `:${uid}`;
            const infix = `:${uid}:`;
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.endsWith(suffix) || key.includes(infix))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        }
        // Clear legacy non-scoped keys (from before this fix)
        ['tc-last-property', 'tc-last-site', 'tc-last-range', 'tc-chat-history',
         'tc-credit-usage', 'tc-last-briefing-date', 'tc-onboarded', 'tc-welcomed',
         'tc-notification-prefs', 'tc-push-enabled'].forEach(k => localStorage.removeItem(k));
        // Clear session storage
        sessionStorage.removeItem('tc-registered');
        sessionStorage.removeItem('tc-registered-user');
        signOut({ callbackUrl: '/' });
    }, [user?.id, user?.email]);

    // Close bell dropdown on route change
    useEffect(() => {
        setBellOpen(false);
    }, [pathname]);

    // Close bell dropdown on any click outside
    const bellRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!bellOpen) return;
        const handler = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [bellOpen]);

    // Alerts for notification bell
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const {
        sites: gscSites,
        isLoading: siteInventoryLoading,
        error: siteInventoryRequestError,
    } = useSiteList(hasGoogleConnection);
    const {
        properties,
        isLoading: propertyInventoryLoading,
        error: propertyInventoryRequestError,
    } = usePropertyList(hasGoogleConnection);

    // Drive the settling gate (declared above with the other useStates so
    // the hook order is stable). Three lift conditions, any of which wins:
    //   1) sessionStorage already says we settled in this tab — returning
    //      navigation, lift immediately so the user doesn't sit through a
    //      gate they've already paid for.
    //   2) On /dashboard/setup — never gate the wizard.
    //   3) All four primary SWR queries (container, credits, sites,
    //      properties) have resolved — first paint is now coherent.
    //   4) Cap: 1.5s elapsed regardless. Better to show partially-loaded
    //      UI than strand the user behind a stuck spinner.
    useEffect(() => {
        if (settled) return;
        if (typeof window !== 'undefined' && sessionStorage.getItem('tc-dashboard-settled') === 'true') {
            setSettled(true);
            return;
        }
        if (isSetupRoute) {
            setSettled(true);
            return;
        }
        const allSettled = !containerLoading && !creditsLoading
            && !siteInventoryLoading && !propertyInventoryLoading;
        const cap = setTimeout(() => {
            sessionStorage.setItem('tc-dashboard-settled', 'true');
            setSettled(true);
        }, 1500);
        if (allSettled) {
            clearTimeout(cap);
            sessionStorage.setItem('tc-dashboard-settled', 'true');
            setSettled(true);
        }
        return () => clearTimeout(cap);
    }, [settled, isSetupRoute, containerLoading, creditsLoading, siteInventoryLoading, propertyInventoryLoading]);

    const typedSites = gscSites as SiteOption[];
    const typedProperties = properties as PropertyOption[];
    const siteInventoryError = getInventoryErrorMessage(siteInventoryRequestError);
    const propertyInventoryError = getInventoryErrorMessage(propertyInventoryRequestError);
    const selection = useMemo(() => resolveDashboardSelection({
        selectedSite,
        selectedProperty,
        sites: typedSites,
        properties: typedProperties,
        siteInventoryError,
        propertyInventoryError,
    }), [propertyInventoryError, selectedProperty, selectedSite, siteInventoryError, typedProperties, typedSites]);
    const {
        resolvedSiteUrl,
        resolvedPropertyId,
        hasGa4Properties,
        ga4Availability,
        isStaleWorkspace,
    } = selection;
    const isDemoWorkspace = hasGoogleConnection
        && !siteInventoryLoading
        && !propertyInventoryLoading
        && !siteInventoryError
        && !propertyInventoryError
        && typedSites.length === 0
        && typedProperties.length === 0;
    const displaySiteUrl = resolvedSiteUrl || (siteInventoryError ? selectedSite : '');

    // Redirect-to-setup guard lives in middleware now — see web/src/middleware.ts.
    // Reading the JWT claim before the RSC ships avoids the layout-effect race
    // where AI chat would render before the redirect could land.

    // Stale-workspace guard. When the user's saved site OR property is no
    // longer present in their current Google inventory (revoked access,
    // switched Google account, site removed from Search Console, property
    // deleted), force them through the picker rather than silently snapping
    // to a fuzzy-matched or first-available substitute. This declaration
    // sits ABOVE the local-state clear effects so React runs the redirect
    // first within a render — otherwise the clear effects would zero out
    // selectedSite/Property, the next render's resolution would no longer
    // be 'stale', and the redirect would never fire.
    useEffect(() => {
        if (!user) return;
        if (!isStaleWorkspace) return;
        if (isSetupRoute) return;
        router.replace('/dashboard/setup?reason=stale');
    }, [user, isStaleWorkspace, isSetupRoute, router]);

    useEffect(() => {
        if (!user) return;
        const siteKey = getUserKey('tc-last-site');

        if (resolvedSiteUrl) {
            if (resolvedSiteUrl !== selectedSite) {
                setSelectedSite(resolvedSiteUrl);
            }
            localStorage.setItem(siteKey, resolvedSiteUrl);
            return;
        }

        if (!siteInventoryError && selectedSite) {
            setSelectedSite('');
            localStorage.removeItem(siteKey);
        }
    }, [getUserKey, resolvedSiteUrl, selectedSite, setSelectedSite, siteInventoryError, user]);

    useEffect(() => {
        if (!user) return;
        const propertyKey = getUserKey('tc-last-property');

        if (resolvedPropertyId) {
            if (resolvedPropertyId !== selectedProperty) {
                setSelectedProperty(resolvedPropertyId);
            }
            localStorage.setItem(propertyKey, resolvedPropertyId);
            return;
        }

        if (!propertyInventoryError && selectedProperty) {
            setSelectedProperty('');
            localStorage.removeItem(propertyKey);
        }
    }, [getUserKey, propertyInventoryError, resolvedPropertyId, selectedProperty, setSelectedProperty, user]);

    const alertSiteUrl = displaySiteUrl || typedSites[0]?.siteUrl || '';
    const { alerts, alertCount } = useAlerts(alertSiteUrl, hasGoogleConnection && !!alertSiteUrl);
    const typedAlerts = alerts as AlertItem[];
    const criticalAlertCount = typedAlerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning').length;
    const mobileOverviewSiteLabel = (() => {
        const siteUrl = displaySiteUrl || typedSites[0]?.siteUrl || '';
        if (!siteUrl) return 'Dashboard';
        return formatSiteLabel(siteUrl);
    })();

    // Send browser push notifications for new critical alerts
    const prevAlertCountRef = useRef(criticalAlertCount);
    useEffect(() => {
        if (criticalAlertCount > prevAlertCountRef.current && isPushEnabled()) {
            const newAlerts = typedAlerts.filter((alert) => alert.severity === 'critical');
            if (newAlerts.length > 0) {
                sendBrowserNotification(
                    'TrafficClaw Alert',
                    newAlerts[0].title || 'New critical alert detected',
                    { tag: 'critical-alert', onClick: () => setBellOpen(true) }
                );
            }
        }
        prevAlertCountRef.current = criticalAlertCount;
    }, [criticalAlertCount, typedAlerts]);

    // Enforce dark mode — clear any stale light-mode preference
    useEffect(() => {
        localStorage.removeItem('gc-theme');
        document.documentElement.setAttribute('data-theme', 'dark');
    }, []);

    // Persist selected property/site to user-scoped localStorage
    useEffect(() => {
        if (selectedProperty && user) localStorage.setItem(getUserKey('tc-last-property'), selectedProperty);
    }, [selectedProperty, user, getUserKey]);
    useEffect(() => {
        if (selectedSite && user) localStorage.setItem(getUserKey('tc-last-site'), selectedSite);
    }, [selectedSite, user, getUserKey]);
    useEffect(() => {
        if (range && user) localStorage.setItem(getUserKey('tc-last-range'), range);
    }, [range, user, getUserKey]);

    // Dark mode only — theme toggle removed

    // Registration state — check sessionStorage first to avoid re-registering on refresh
    // Bug #3 fix: validate cached registration belongs to current user
    const [registrationState, setRegistrationState] = useState({
        isRegistered: false,
        isRegistering: true,
        registrationError: null as string | null,
    });

    // Bug #1 fix: prevent duplicate registration calls with a ref
    const registrationAttempted = useRef(false);
    const registrationCacheHydrated = useRef(false);

    // Bug #3 fix: clear registration flag on sign-out so a different account doesn't reuse it
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
            setRegistrationState({
                isRegistered: true,
                isRegistering: false,
                registrationError: null,
            });
        }
    }, [session?.user]);

    // Bug #3 fix: if session user email doesn't match cached user, invalidate cache
    useEffect(() => {
        if (session?.user?.email) {
            const cachedUser = sessionStorage.getItem('tc-registered-user');
            if (cachedUser && cachedUser !== session.user.email) {
                // Different user — clear stale cache
                sessionStorage.removeItem('tc-registered');
                sessionStorage.removeItem('tc-registered-user');
                registrationAttempted.current = false;
                setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
            }
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
        setRegistrationState({
            isRegistered: true,
            isRegistering: false,
            registrationError: getRegistrationWarning(reason),
        });
    }, [getRegistrationWarning]);

    useEffect(() => {
        // Skip if already registered
        if (registrationState.isRegistered) return;
        // Bug #1 fix: don't reset state when session is briefly undefined — just wait
        if (!session?.user) return;
        // Bug #1 fix: prevent re-entry if registration is already in-flight
        if (registrationAttempted.current) return;
        registrationAttempted.current = true;

        const registerProvider = async () => {
            try {
                setRegistrationState(prev => ({ ...prev, isRegistering: true, registrationError: null }));

                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data?.synced) {
                        // Persist in sessionStorage with user identity only after admin sync succeeds
                        sessionStorage.setItem('tc-registered', 'true');
                        sessionStorage.setItem('tc-registered-user', session.user?.email || session.user?.name || '');
                        setRegistrationState({
                            isRegistered: true,
                            isRegistering: false,
                            registrationError: null,
                        });
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

        registerProvider();
    }, [applyDegradedRegistration, registrationState.isRegistered, session?.user?.email]); // Bug #1 fix: stable dependency — only changes on actual login

    // Bug #6 fix: retry callback so child components can retry without full page reload
    const retryRegistration = useCallback(() => {
        registrationAttempted.current = false;
        setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
    }, []);

    // Bug #13 fix: redirect to login if session is expired/unauthenticated
    if (status === 'unauthenticated') {
        return (
            <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-zinc-500 mb-4">Your session has expired</p>
                    <button
                        onClick={() => signIn()}
                        className="px-5 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 font-medium text-sm"
                    >
                        Sign In Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex max-w-[100vw]">
            <a href="#main-content" className="skip-to-content">Skip to content</a>
            {/* ─── Sidebar (Desktop) ─── */}
            <aside
                className={`relative hidden lg:flex flex-col border-r border-white/[0.06] bg-[linear-gradient(180deg,#04070c_0%,#050913_16%,#020306_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] transition-all duration-300 sticky top-0 h-screen overflow-y-auto overflow-x-visible ${collapsed ? 'w-[68px]' : 'w-[248px]'
                    }`}
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(20,196,225,0.16),transparent_64%),radial-gradient(circle_at_top_right,rgba(122,217,218,0.1),transparent_48%)]" />
                {/* Logo */}
                <div className="relative z-10 h-16 flex items-center px-4 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
                    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
                        <Image src="/icon.svg" alt="TrafficClaw" width={32} height={32} className={`${shellCompactRadiusClass} flex-shrink-0`} />
                        {!collapsed && (
                            <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">
                                Traffic<span style={{ color: brandAccentColor }}>Claw</span>
                            </span>
                        )}
                    </Link>
                </div>

                {/* Workspace selector — links to /dashboard/setup (single source of truth) */}
                {hasGoogleConnection && (
                    <div className="relative px-2.5 pt-3 pb-1.5 z-10">
                        <Link
                            href="/dashboard/setup"
                            aria-label="Switch workspace"
                            title="Switch workspace"
                            className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] border border-white/[0.08] shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${shellCompactRadiusClass} hover:border-[#14C4E1]/24 hover:bg-[linear-gradient(180deg,rgba(16,24,34,0.94),rgba(8,13,20,0.96))] transition ${collapsed ? 'justify-center' : ''}`}
                        >
                            <div className={`w-4 h-4 ${isOverviewRoute ? 'rounded-none' : 'rounded'} bg-[#14C4E1]/14 flex items-center justify-center flex-shrink-0`}>
                                <Globe className="w-2.5 h-2.5 text-[#7AD9DA]" />
                            </div>
                            {!collapsed && (
                                <>
                                    <span className="flex-1 text-left truncate font-medium">
                                        {workspaceLabel
                                            || (displaySiteUrl ? formatSiteLabel(displaySiteUrl) : '')
                                            || (isDemoWorkspace ? DEMO_DOMAIN_LABEL : 'Select workspace')}
                                    </span>
                                    <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                </>
                            )}
                        </Link>
                    </div>
                )}

                {/* Grouped nav items */}
                <nav className="relative z-10 flex-1 py-2 px-2.5 overflow-y-auto" aria-label="Main navigation">
                    {sidebarGroups.map((group, gi) => (
                        <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-[var(--divider)]' : ''}>
                            {group.label && !collapsed && (
                                <div className="px-3 pb-1 pt-0.5">
                                    <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{group.label}</span>
                                </div>
                            )}
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                    const showSupportBadge = item.href === '/dashboard/support' && supportUnread > 0;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`relative flex items-center gap-3 px-3 py-2.5 ${shellRadiusClass} text-sm font-medium transition-all duration-200 group ${isActive
                                                ? sidebarActiveItemClasses
                                                : sidebarInactiveItemClasses
                                            }`}
                                        >
                                            <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-[#7AD9DA]' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                            {!collapsed && <span className="truncate">{item.label}</span>}
                                            {showSupportBadge && !collapsed && (
                                                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold leading-none">
                                                    {supportUnread > 99 ? '99+' : supportUnread}
                                                </span>
                                            )}
                                            {showSupportBadge && collapsed && (
                                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[var(--app-bg,#06090d)]" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Bottom section: Settings + Credits + User + Collapse — sticky at viewport bottom */}
                <div className="relative z-10 border-t border-[var(--divider)] p-2.5 space-y-1.5 sticky bottom-0 bg-[var(--app-bg,#06090d)] backdrop-blur supports-[backdrop-filter]:bg-[var(--app-bg,#06090d)]/95">
                    {/* Settings link */}
                    {(() => {
                        const isSettingsActive = pathname.startsWith('/dashboard/settings');
                        return (
                            <Link
                                href="/dashboard/settings"
                                className={`flex items-center gap-3 px-3 py-2.5 ${shellRadiusClass} text-sm font-medium transition-all duration-200 group ${isSettingsActive
                                    ? sidebarActiveItemClasses
                                    : sidebarInactiveItemClasses
                                }`}
                            >
                                <Settings className={`w-[18px] h-[18px] flex-shrink-0 ${isSettingsActive ? 'text-[#7AD9DA]' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                {!collapsed && <span className="truncate">Settings</span>}
                            </Link>
                        );
                    })()}

                    {/* Credits card — sticky right below Settings.
                        Replaces the old "{N} msgs" pill with a full card that shows credits left,
                        progress bar, plan badge, and an upgrade CTA (visible on Free or when running low). */}
                    <CreditsCard credits={credits} plan={userPlan} collapsed={collapsed} />


                    {/* User profile */}
                    {session?.user && !collapsed && (
                        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <Link href="/dashboard/plan" className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                                {session.user.image && (
                                    <Image
                                        src={session.user.image}
                                        alt=""
                                        width={28}
                                        height={28}
                                        className={`w-7 h-7 ${shellBadgeRadiusClass} ring-1 ring-white/[0.1]`}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                        {session.user.name}
                                        <span
                                            className={`text-[8px] px-1.5 py-0.5 ${shellBadgeRadiusClass} font-bold uppercase tracking-wider leading-none ${
                                                subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                : userPlan === 'growth' ? 'bg-gradient-to-r from-[#7AD9DA] to-cyan-400 text-[#041015]'
                                                : userPlan === 'starter' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                                                : 'bg-zinc-700 text-zinc-400'
                                            }`}
                                        >
                                            {subscriptionCancelled ? 'Ending' : userPlan === 'free' ? 'Free' : userPlan === 'starter' ? 'Starter' : userPlan === 'growth' ? 'Growth' : userPlan === 'pro' ? 'Pro' : 'Free'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-zinc-600 truncate">
                                        {session.user.email}
                                    </div>
                                </div>
                            </Link>
                            <button
                                onClick={handleSignOut}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                                aria-label="Sign out"
                                title="Sign out"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className={`w-full flex items-center justify-center py-2.5 text-zinc-600 hover:text-[#7AD9DA] transition-colors ${shellCompactRadiusClass} border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]`}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </aside>

            {/* ─── Main content area ─── */}
            <div className={`flex-1 flex flex-col min-h-screen w-full min-w-0 ${isOverviewRoute ? 'bg-[#010203]' : ''}`}>
                {/* Top bar — minimal: just date picker + bell */}
                <header className={`border-b border-[var(--card-border)] ${isOverviewRoute ? 'bg-[#020305]/95' : 'bg-[var(--header-bg)]'} backdrop-blur-xl sticky top-0 z-40`}>
                    <div className="flex h-12 items-center px-3 sm:px-4 md:px-6">
                        {/* Mobile menu button — wrapped in 44 px tap area */}
                        <button
                            className="lg:hidden flex items-center justify-center -ml-1.5 w-11 h-11 text-zinc-400 hover:text-white flex-shrink-0 mr-auto"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            aria-label="Open navigation menu"
                            aria-expanded={mobileOpen}
                        >
                            <Menu className="w-5 h-5" />
                        </button>

                        {/* Right side controls */}
                        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0">
                            {/* Global Date Range Picker — desktop here, compact mobile version rendered below on overview */}
                            <div className={`hidden md:block ${isAnalyticsMainRoute ? 'invisible pointer-events-none w-0 overflow-hidden' : ''}`}>
                                <DatePicker range={range} setRange={setRange} />
                            </div>
                            {/* Help & Support — always-visible global shortcut.
                                Lives in the dashboard layout so it follows the user
                                across every page. Renders as a "Need Help?" pill on
                                desktop, icon-only on mobile so the header stays tight.
                                The headset-in-gradient-circle treatment matches the
                                spec the user supplied. */}
                            <Link
                                href="/dashboard/support"
                                aria-label={`Help & Support${supportUnread > 0 ? ` (${supportUnread} new)` : ''}`}
                                title="Help & Support"
                                className={`group inline-flex items-center gap-2 rounded-full transition-all flex-shrink-0 h-11 sm:h-8 px-1.5 sm:pl-1 sm:pr-3 border ${
                                    pathname === '/dashboard/support'
                                        ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                                        : 'border-white/[0.06] bg-white/[0.02] hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]'
                                }`}
                            >
                                <span className="relative flex h-7 w-7 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                                    <Headphones className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                    {supportUnread > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-80 animate-ping" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300 ring-1 ring-[var(--app-bg,#06090d)]" />
                                        </span>
                                    )}
                                </span>
                                <span className="hidden sm:inline text-[12px] font-medium text-emerald-300 group-hover:text-emerald-200 transition-colors">
                                    Need Help?
                                </span>
                            </Link>

                            {/* Notification Bell — clickable rows that route to the
                                AI chat with a pre-filled question about the alert.
                                Falls back to the relevant dashboard route per category. */}
                            <div className="relative" ref={bellRef}>
                                <button
                                    onClick={() => setBellOpen(!bellOpen)}
                                    className={`relative w-11 h-11 sm:w-8 sm:h-8 ${shellCompactRadiusClass} flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all flex-shrink-0`}
                                    aria-label={`Alerts${criticalAlertCount > 0 ? ` (${criticalAlertCount} active)` : ''}`}
                                    aria-expanded={bellOpen}
                                    aria-haspopup="true"
                                    title="Alerts"
                                >
                                    <Bell className="w-4 h-4" />
                                    {criticalAlertCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-[var(--background)]">
                                            {criticalAlertCount > 9 ? '9+' : criticalAlertCount}
                                        </span>
                                    )}
                                </button>
                                {bellOpen && (
                                    <div className="absolute right-0 mt-2 z-50 w-[min(320px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0d12] shadow-2xl shadow-black/60">
                                        <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
                                            <span className="text-[12px] font-semibold text-white">Alerts</span>
                                            {alertCount > 0 && (
                                                <span className="text-[10px] text-zinc-500 tabular-nums">{alertCount} active</span>
                                            )}
                                        </div>
                                        <div className="max-h-[340px] overflow-y-auto">
                                            {alerts.length === 0 ? (
                                                <div className="px-4 py-8 text-center">
                                                    <Bell className="mx-auto mb-2 h-4 w-4 text-zinc-700" />
                                                    <p className="text-[11px] text-zinc-500">No alerts right now</p>
                                                    <p className="mt-0.5 text-[10px] text-zinc-600">Anomalies will surface here as they're detected.</p>
                                                </div>
                                            ) : (
                                                typedAlerts.slice(0, 10).map((alert) => {
                                                    // Compose a chat prompt that asks the AI to investigate THIS alert.
                                                    const prompt = `${alert.title}${alert.metric ? ` — ${alert.metric}` : ''}. Investigate why and recommend the next move.`;
                                                    const dotClass =
                                                        alert.severity === 'critical' ? 'bg-red-400' :
                                                        alert.severity === 'warning'  ? 'bg-amber-400' :
                                                        alert.severity === 'success'  ? 'bg-emerald-400' : 'bg-zinc-400';
                                                    return (
                                                        <Link
                                                            key={alert.id}
                                                            href={`/dashboard/ai-chat?q=${encodeURIComponent(prompt)}`}
                                                            onClick={() => setBellOpen(false)}
                                                            className="block border-b border-white/[0.04] px-4 py-2.5 transition-colors hover:bg-white/[0.03] last:border-0"
                                                        >
                                                            <div className="flex items-start gap-2.5">
                                                                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass}`} />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[12px] font-medium leading-snug text-zinc-100">{alert.title}</p>
                                                                    {alert.metric && (
                                                                        <p className="mt-0.5 text-[10.5px] text-zinc-500 tabular-nums">{alert.metric}</p>
                                                                    )}
                                                                    <p className="mt-1 text-[10px] text-zinc-600">Tap to ask the AI →</p>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {alerts.length > 0 && (
                                            <div className="border-t border-white/[0.05] px-4 py-2">
                                                <Link
                                                    href="/dashboard/ai-chat"
                                                    onClick={() => setBellOpen(false)}
                                                    className="text-[11px] font-medium text-zinc-300 transition-colors hover:text-white"
                                                >
                                                    Open AI chat →
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {isOverviewRoute && (
                        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 md:hidden">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold tracking-tight text-white">
                                    {mobileOverviewSiteLabel}
                                </div>
                            </div>
                            <div className="shrink-0">
                                <DatePicker range={range} setRange={setRange} compact />
                            </div>
                        </div>
                    )}
                </header>

                {/* Page content — reserves space for MobileBottomBar (~64 px
                    bar + safe-area-inset-bottom on notched devices) via the
                    `.pb-mobile-bar` utility, which auto-clears on md+ where
                    the bar is hidden. Suppressed on routes where we've
                    hidden the bar to avoid double-padding. */}
                <main
                    id="main-content"
                    className={`flex-1 overflow-y-auto overflow-x-hidden p-3 max-w-full sm:p-4 md:p-6 ${
                        !isSetupRoute && !isAiChatRoute && !isDashboardBuilderRoute ? 'pb-mobile-bar' : ''
                    } ${isOverviewRoute ? 'bg-[#010203]' : ''}`}
                    role="main"
                >
                    <div className="max-w-7xl mx-auto">
                        <WorkspaceContext.Provider value={{
                            ...registrationState,
                            retryRegistration,
                            selectedProperty,
                            setSelectedProperty,
                            selectedSite,
                            setSelectedSite,
                            resolvedPropertyId,
                            resolvedSiteUrl,
                            hasGa4Properties,
                            ga4Availability,
                            propertyInventoryError,
                            siteInventoryError,
                            propertyInventoryLoading,
                            siteInventoryLoading,
                            isDemoWorkspace,
                            demoDomainLabel: DEMO_DOMAIN_LABEL,
                            range,
                            setRange,
                            workspaceLabel,
                            saveWorkspace,
                            loadWorkspace,
                            isWorkspaceLoaded,
                        }}>
                            {!isSetupRoute && <WorkspaceIncompleteBanner />}
                            <ErrorBoundary>{children}</ErrorBoundary>
                        </WorkspaceContext.Provider>
                    </div>
                </main>
            </div>

            {/* Mobile bottom bar — replaces the floating AI-chat sparkle on
                small screens. Always mounted on mobile (component self-gates
                via md:hidden); hidden on tablet/desktop. Suppressed on the
                AI-chat and dashboard-builder routes — both have their own
                bottom-anchored UI that would compete with this bar. */}
            {!isSetupRoute && !isAiChatRoute && !isDashboardBuilderRoute && (
                <MobileBottomBar
                    onRefresh={handleMobileRefresh}
                    onAskAI={handleMobileAskAI}
                    onExport={handleMobileExport}
                    onNotifications={() => setBellOpen(true)}
                    isRefreshing={isRefreshing}
                    alertCount={criticalAlertCount}
                />
            )}

            {/* PDF report export modal — opens from the MobileBottomBar's
                Export button. Hits /api/report/user-generate which renders
                a weekly/monthly PDF from live GA4 + GSC data. */}
            <MobileExportModal
                isOpen={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                siteUrl={selectedSite}
                propertyId={selectedProperty}
            />

            {/* Floating AIChatbot widget removed — every "Ask AI" entry
                point now navigates to /dashboard/ai-chat?q=… (see lib/askAi.ts). */}

            {/* First-paint settling overlay — see settled state above. Sits
                on top of everything (z-200) and lifts once SWR has caught up
                or after 1.5s, so users see one clean paint instead of the
                "no property → connect → final UI" flicker chain. */}
            {!settled && !isSetupRoute && (
                <div
                    aria-hidden
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--background)]"
                >
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-7 h-7 text-[#7AD9DA] animate-spin" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            Loading workspace
                        </p>
                    </div>
                </div>
            )}

            {/* Credit welcome animation (first signup only) */}
            {showWelcome && (
                <CreditWelcome credits={5} onDismiss={() => {
                    setShowWelcome(false);
                    setServerWelcomeSeen(true);
                    // Persist the dismissal server-side so the popup never
                    // shows again — even after sign-out / sign-in.
                    fetch('/api/user/workspace', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mark_welcome_seen: true }),
                    }).catch(() => { /* non-fatal */ });
                }} />
            )}


            {/* ─── Mobile sidebar overlay ─── */}
            {mobileOpen && (
                <>
                    {/* Full-screen overlay — tap anywhere to dismiss */}
                    <div
                        className="fixed inset-0 bg-[#02050b]/72 backdrop-blur-sm z-50 lg:hidden cursor-pointer"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setMobileOpen(false); }}
                    />
                    <div className="fixed left-0 top-0 bottom-0 z-50 flex w-[min(296px,88vw)] flex-col overflow-hidden rounded-r-[30px] border-r border-white/[0.08] bg-[linear-gradient(180deg,#050914_0%,#060b12_18%,#020306_100%)] shadow-[0_30px_70px_rgba(0,0,0,0.45)] lg:hidden safe-area-bottom">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(20,196,225,0.18),transparent_64%),radial-gradient(circle_at_top_right,rgba(122,217,218,0.1),transparent_48%)]" />
                        {/* Header with logo and close */}
                        <div className="relative z-10 flex h-16 items-center justify-between border-b border-white/[0.06] px-4 pt-[env(safe-area-inset-top,0px)]">
                            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                                <Image src="/icon.svg" alt="TrafficClaw" width={28} height={28} className="rounded-lg" />
                                <span className="text-sm font-bold text-[var(--text-primary)]">
                                    Traffic<span style={{ color: brandAccentColor }}>Claw</span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="text-zinc-400 w-10 h-10 flex items-center justify-center -mr-2 rounded-xl border border-transparent hover:border-white/[0.08] hover:text-white hover:bg-white/[0.06] transition-colors active:bg-white/[0.1]"
                                aria-label="Close navigation menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mobile workspace selector — links to /dashboard/setup */}
                        {hasGoogleConnection && (
                            <div className="relative px-3 pt-3 pb-1.5 z-10">
                                <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1 mb-1.5 block">Workspace</label>
                                <Link
                                    href="/dashboard/setup"
                                    onClick={() => setMobileOpen(false)}
                                    className="relative w-full flex items-center gap-2.5 px-3 py-3 text-xs text-zinc-300 bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] border border-white/[0.08] rounded-2xl shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:border-[#14C4E1]/24 hover:bg-[linear-gradient(180deg,rgba(16,24,34,0.94),rgba(8,13,20,0.96))] transition"
                                    aria-label="Switch workspace"
                                >
                                    <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-[#14C4E1]/12">
                                        <Globe className="w-3.5 h-3.5 text-[#7AD9DA] flex-shrink-0" />
                                    </div>
                                    <span className="flex-1 text-left truncate">
                                        {workspaceLabel
                                            || (displaySiteUrl ? formatSiteLabel(displaySiteUrl) : '')
                                            || (isDemoWorkspace ? DEMO_DOMAIN_LABEL : 'Select workspace')}
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                </Link>
                            </div>
                        )}

                        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                            {/* Mobile date range picker */}
                            <MobileDatePicker range={range} setRange={setRange} />

                            {/* Divider before nav */}
                            <div className="mx-3 mt-2 border-t border-[var(--divider)]" />

                            {/* Grouped navigation items */}
                            <nav className="relative z-10 flex-1 py-2 px-3 overflow-y-auto">
                                {sidebarGroups.map((group, gi) => (
                                    <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-[var(--divider)]' : ''}>
                                        {group.label && (
                                            <div className="px-3 pb-1 pt-0.5">
                                                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{group.label}</span>
                                            </div>
                                        )}
                                        <div className="space-y-0.5">
                                            {group.items.map((item) => {
                                                const isActive = pathname === item.href ||
                                                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                                const showSupportBadge = item.href === '/dashboard/support' && supportUnread > 0;
                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setMobileOpen(false)}
                                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-2xl text-sm font-medium transition-all active:scale-[0.98] ${isActive
                                                            ? sidebarActiveItemClasses
                                                            : sidebarInactiveItemClasses + ' active:bg-white/[0.08]'
                                                        }`}
                                                    >
                                                        <item.icon className={`w-5 h-5 ${isActive ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                                        <span>{item.label}</span>
                                                        {showSupportBadge && (
                                                            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold leading-none">
                                                                {supportUnread > 99 ? '99+' : supportUnread}
                                                            </span>
                                                        )}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {/* Settings in mobile nav */}
                                <div className="mt-2 pt-2 border-t border-[var(--divider)]">
                                    <Link
                                        href="/dashboard/settings"
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-2xl text-sm font-medium transition-all active:scale-[0.98] ${pathname.startsWith('/dashboard/settings')
                                            ? sidebarActiveItemClasses
                                            : sidebarInactiveItemClasses + ' active:bg-white/[0.08]'
                                        }`}
                                    >
                                        <Settings className={`w-5 h-5 ${pathname.startsWith('/dashboard/settings') ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                        <span>Settings</span>
                                    </Link>
                                </div>
                            </nav>

                            {/* Credits card — mobile sidebar (mirrors desktop card sticky below Settings) */}
                            {credits !== null && (
                                <div className="border-t border-[var(--divider)] px-3 py-3">
                                    <CreditsCard
                                        credits={credits}
                                        plan={userPlan}
                                        mobile
                                        onNavigate={() => setMobileOpen(false)}
                                    />
                                </div>
                            )}

                            {/* User profile and sign out */}
                            {session?.user && (
                                <div className="border-t border-[var(--divider)] p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
                                    <div className="flex items-center gap-3 rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                        <Link href="/dashboard/plan" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                            {session.user.image && (
                                                <Image src={session.user.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                                    {session.user.name}
                                                    <span
                                                        className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none ${
                                                            subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                            : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                            : userPlan === 'growth' ? 'bg-gradient-to-r from-[#7AD9DA] to-cyan-400 text-[#041015]'
                                                            : userPlan === 'starter' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                                                            : 'bg-zinc-700 text-zinc-400'
                                                        }`}
                                                    >
                                                        {subscriptionCancelled ? 'Ending' : userPlan === 'free' ? 'Free' : userPlan === 'starter' ? 'Starter' : userPlan === 'growth' ? 'Growth' : userPlan === 'pro' ? 'Pro' : 'Free'}
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>
                                        <button
                                            onClick={handleSignOut}
                                            className="text-zinc-600 hover:text-zinc-400 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
                                            aria-label="Sign out"
                                        >
                                            <LogOut className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {/* Mobile upgrade hint */}
                                    {userPlan !== 'pro' && (
                                        <Link
                                            href="/dashboard/plan"
                                            onClick={() => setMobileOpen(false)}
                                            className="mt-2 flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.06] border border-violet-500/[0.1] hover:border-violet-500/[0.2] transition-all active:scale-[0.98]"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                            <span className="text-xs text-zinc-400">
                                                {userPlan === 'free' ? 'Upgrade to Pro' : 'Upgrade plan'}
                                            </span>
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
