export type SiteOption = {
    siteUrl: string;
};

export type PropertyOption = {
    displayName?: string;
    propertyId?: string;
    property?: string;
};

export type Ga4Availability = 'available' | 'site_unmatched' | 'inventory_empty' | 'inventory_error' | 'stale';

export type DashboardSelectionResolution = {
    resolvedSiteUrl: string;
    resolvedPropertyId: string;
    matchedProperty: PropertyOption | null;
    hasGa4Properties: boolean;
    ga4Availability: Ga4Availability;
    isSelectedSiteValid: boolean;
    isSelectedPropertyValid: boolean;
    /**
     * True when the user has a saved workspace (site, property, or both) but
     * at least one of those saved values is no longer present in the current
     * Google inventory. Consumers should treat this as "force re-pick"
     * rather than silently substituting a different site/property.
     */
    isStaleWorkspace: boolean;
};

export function formatSiteLabel(siteUrl: string) {
    return siteUrl.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
}

function normalizeText(value?: string) {
    return (value || '').toLowerCase().trim();
}

export function matchPropertyToSite(siteUrl: string, properties: PropertyOption[]) {
    if (!siteUrl) {
        return null;
    }

    const domain = formatSiteLabel(siteUrl);
    const domainRoot = domain.split('.')[0];

    return (
        properties.find((property) => normalizeText(property.displayName).includes(normalizeText(domain))) ||
        properties.find((property) => normalizeText(property.propertyId || property.property).includes(normalizeText(domainRoot))) ||
        properties.find((property) => normalizeText(property.displayName).includes(normalizeText(domainRoot))) ||
        null
    );
}

export function resolveDashboardSelection({
    selectedSite,
    selectedProperty,
    sites,
    properties,
    siteInventoryError,
    propertyInventoryError,
    siteInventoryLoading,
    propertyInventoryLoading,
}: {
    selectedSite: string;
    selectedProperty: string;
    sites: SiteOption[];
    properties: PropertyOption[];
    siteInventoryError?: string | null;
    propertyInventoryError?: string | null;
    /**
     * Inventory loading flags. CRITICAL for the stale-detection path: when
     * an inventory is still loading, its `sites`/`properties` array is
     * legitimately empty AND `siteInventoryError`/`propertyInventoryError`
     * is null — so without these flags the stale branch falsely fires the
     * moment the dashboard mounts after a hard navigation (e.g. fresh
     * setup → dashboard transition where SWR hasn't fetched inventory
     * yet). The result was an infinite redirect loop between /setup
     * and the dashboard. Defaulting to `false` keeps callers that don't
     * yet pass these unchanged.
     */
    siteInventoryLoading?: boolean;
    propertyInventoryLoading?: boolean;
}): DashboardSelectionResolution {
    const validSites = sites
        .map((site) => site.siteUrl)
        .filter((siteUrl): siteUrl is string => Boolean(siteUrl));
    const validProperties = properties.filter((property): property is PropertyOption & { property: string } => Boolean(property.property));

    const isSelectedSiteValid = Boolean(selectedSite) && validSites.includes(selectedSite);
    const isSelectedPropertyValid = Boolean(selectedProperty) && validProperties.some((property) => property.property === selectedProperty);
    const hasGa4Properties = validProperties.length > 0;
    const hadSavedSelection = Boolean(selectedSite) || Boolean(selectedProperty);

    // STALE PATH — the user has a saved workspace but at least one piece is
    // no longer in the current Google inventory (revoked access, switched
    // Google account, site removed from Search Console, property deleted).
    //
    // We deliberately do NOT silently substitute a fuzzy-matched property or
    // fall back to validSites[0] — that would silently put the user on the
    // wrong workspace and persist the wrong pairing back to localStorage on
    // the next save.
    //
    // Hard guards before classifying as stale:
    //   - Both inventories must be FULLY LOADED (loading=false). While
    //     loading, the arrays are legitimately empty so every saved value
    //     would falsely look "missing" and we'd loop /setup ↔ /dashboard.
    //   - Neither inventory may be in an error state, so a transient
    //     network hiccup doesn't bounce a valid user to the picker.
    if (
        hadSavedSelection
        && !siteInventoryLoading
        && !propertyInventoryLoading
        && !siteInventoryError
        && !propertyInventoryError
        && ((selectedSite && !isSelectedSiteValid) || (selectedProperty && !isSelectedPropertyValid))
    ) {
        return {
            resolvedSiteUrl: '',
            resolvedPropertyId: '',
            matchedProperty: null,
            hasGa4Properties,
            ga4Availability: 'stale',
            isSelectedSiteValid,
            isSelectedPropertyValid,
            isStaleWorkspace: true,
        };
    }

    // HAPPY PATH — the user's explicit site + property pairing is intact.
    // We respect the pairing even when the property's display name doesn't
    // match the site domain (e.g., GA4 property "bhagwadgeeta" paired with
    // site "bhagavadgitaexplained.com"). No fuzzy matching is performed.
    if (isSelectedSiteValid && isSelectedPropertyValid) {
        const explicitProperty = validProperties.find((property) => property.property === selectedProperty) || null;
        return {
            resolvedSiteUrl: selectedSite,
            resolvedPropertyId: selectedProperty,
            matchedProperty: explicitProperty,
            hasGa4Properties,
            ga4Availability: 'available',
            isSelectedSiteValid,
            isSelectedPropertyValid,
            isStaleWorkspace: false,
        };
    }

    // Site-only saved selection (user is mid-setup or chose to operate
    // without a GA4 pairing). Surfaces as "site_unmatched" so the GA4-locked
    // UI prompts them to pair a property.
    if (isSelectedSiteValid) {
        return {
            resolvedSiteUrl: selectedSite,
            resolvedPropertyId: '',
            matchedProperty: null,
            hasGa4Properties,
            ga4Availability: hasGa4Properties ? 'site_unmatched' : propertyInventoryError ? 'inventory_error' : 'inventory_empty',
            isSelectedSiteValid,
            isSelectedPropertyValid,
            isStaleWorkspace: false,
        };
    }

    // Property-only saved selection (no site picked yet).
    if (isSelectedPropertyValid) {
        return {
            resolvedSiteUrl: '',
            resolvedPropertyId: selectedProperty,
            matchedProperty: validProperties.find((property) => property.property === selectedProperty) || null,
            hasGa4Properties,
            ga4Availability: 'available',
            isSelectedSiteValid,
            isSelectedPropertyValid,
            isStaleWorkspace: false,
        };
    }

    // No usable saved selection. Preserve the user's last input through
    // an inventory error so they can read what was there before the network
    // recovered, but otherwise leave both resolved fields empty so the
    // dashboard surfaces the right empty/error state.
    return {
        resolvedSiteUrl: siteInventoryError ? selectedSite : '',
        resolvedPropertyId: '',
        matchedProperty: null,
        hasGa4Properties,
        ga4Availability: propertyInventoryError ? 'inventory_error' : 'inventory_empty',
        isSelectedSiteValid,
        isSelectedPropertyValid,
        isStaleWorkspace: false,
    };
}

export function getGa4AvailabilityCopy(
    availability: Ga4Availability,
    siteUrl?: string,
    propertyInventoryError?: string | null,
) {
    const siteLabel = siteUrl ? formatSiteLabel(siteUrl) : 'this site';

    switch (availability) {
        case 'stale':
            return {
                title: 'Your previous workspace is no longer available',
                description: 'The site or GA4 property you had selected is missing from this Google account. Pick a new workspace to continue.',
            };
        case 'site_unmatched':
            return {
                title: 'No GA4 property matches this site',
                description: `${siteLabel} is available in Search Console, but we couldn't find a matching GA4 property for it. Use SEO or Performance while GA4 is disconnected for this site.`,
            };
        case 'inventory_error':
            return {
                title: 'GA4 inventory is temporarily unavailable',
                description: propertyInventoryError || 'We could not refresh your Google Analytics property list right now. Try again in a moment.',
            };
        case 'inventory_empty':
        default:
            return {
                title: 'No GA4 properties available',
                description: 'This Google account does not currently expose any GA4 properties. Search Console-based views can still work, but this section needs GA4.',
            };
    }
}
