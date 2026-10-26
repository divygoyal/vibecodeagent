'use client';

import { createContext, useContext } from 'react';

import type { Ga4Availability } from '@/lib/dashboardSelection';
import { DEMO_DOMAIN_LABEL } from '@/lib/demoWorkspace';
import type { SiteEntry } from '@/lib/sites/siteDirectory';

/**
 * Workspace context: the user's current GA4 + Search Console pair, the legacy
 * range key and the site directory. Provided by components/shell/WorkspaceProvider
 * (mounted by AppShell). Leaf module on purpose: lib/useDashboardData imports it,
 * and the provider imports lib/useDashboardData.
 *
 * New code: read the current site with useCurrentSite() and the date range with
 * useDateRange() (components/shell). This context stays for the old pages.
 */
export interface WorkspaceSaveInput {
    property?: string | null;
    site?: string | null;
    /** Range key to save (a lib/dateRange preset or a legacy key). */
    range?: string;
    label?: string | null;
}

export interface WorkspaceContextType {
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
    /** Legacy range key for the old APIs ('7d', '30d', '90d', ...). */
    range: string;
    /** Legacy setter (old date pickers). New code uses useDateRange().setValue. */
    setRange: (v: string) => void;
    /** The saved range as stored (lib/dateRange preset or legacy key). */
    rangeKey: string;
    workspaceLabel: string;
    saveWorkspace: (data: WorkspaceSaveInput) => Promise<boolean>;
    loadWorkspace: () => Promise<void>;
    isWorkspaceLoaded: boolean;
    /** Google connected (admin DB or session). */
    hasGoogleConnection: boolean;
    /** Every site the user can access (Search Console + GA4), see lib/sites/siteDirectory. */
    siteDirectory: SiteEntry[];
    /** True until both inventories answered at least once. */
    siteDirectoryLoading: boolean;
    /** Server flag: the one-time welcome (credits) popup was seen. */
    welcomeSeen: boolean;
    markWelcomeSeen: () => void;
}

const noop = () => { };

export const WorkspaceContext = createContext<WorkspaceContextType>({
    isRegistered: false,
    isRegistering: true,
    registrationError: null,
    retryRegistration: noop,
    selectedProperty: '',
    setSelectedProperty: noop,
    selectedSite: '',
    setSelectedSite: noop,
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
    setRange: noop,
    rangeKey: '30d',
    workspaceLabel: '',
    saveWorkspace: async () => false,
    loadWorkspace: async () => { },
    isWorkspaceLoaded: false,
    hasGoogleConnection: false,
    siteDirectory: [],
    siteDirectoryLoading: true,
    welcomeSeen: true,
    markWelcomeSeen: noop,
});

export const useWorkspace = () => useContext(WorkspaceContext);
/** Back-compat alias: many old pages import { useRegistration }. */
export const useRegistration = useWorkspace;
