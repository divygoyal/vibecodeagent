export type SiteOption = {
    siteUrl: string;
};

export type PropertyOption = {
    displayName?: string;
    propertyId?: string;
    property?: string;
};

export type Ga4Availability = 'available' | 'site_unmatched' | 'inventory_empty' | 'inventory_error';

export type DashboardSelectionResolution = {
    resolvedSiteUrl: string;
    resolvedPropertyId: string;
    matchedProperty: PropertyOption | null;
    hasGa4Properties: boolean;
    ga4Availability: Ga4Availability;
    isSelectedSiteValid: boolean;
    isSelectedPropertyValid: boolean;
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
}: {
    selectedSite: string;
    selectedProperty: string;
    sites: SiteOption[];
    properties: PropertyOption[];
    siteInventoryError?: string | null;
    propertyInventoryError?: string | null;
}): DashboardSelectionResolution {
    const validSites = sites
        .map((site) => site.siteUrl)
        .filter((siteUrl): siteUrl is string => Boolean(siteUrl));
    const validProperties = properties.filter((property): property is PropertyOption & { property: string } => Boolean(property.property));

    const isSelectedSiteValid = Boolean(selectedSite) && validSites.includes(selectedSite);
    const isSelectedPropertyValid = Boolean(selectedProperty) && validProperties.some((property) => property.property === selectedProperty);

    const resolvedSiteUrl = isSelectedSiteValid
        ? selectedSite
        : validSites[0] || (siteInventoryError ? selectedSite : '');

    const matchedProperty = matchPropertyToSite(resolvedSiteUrl, validProperties);
    const hasGa4Properties = validProperties.length > 0;

    if (resolvedSiteUrl) {
        // PRIORITY 1: user has EXPLICITLY paired this site with a property in their
        // workspace setup. Respect the explicit pairing even when the property's
        // display name doesn't fuzzy-match the site domain (e.g., GA4 property
        // "bhagwadgeeta" paired with site "bhagavadgitaexplained.com" — different
        // names, same workspace). Without this, the dashboard incorrectly shows
        // "No GA4 property matches this site" despite the user having matched
        // them deliberately.
        if (isSelectedPropertyValid) {
            const explicitProperty = validProperties.find((property) => property.property === selectedProperty) || null;
            if (explicitProperty) {
                return {
                    resolvedSiteUrl,
                    resolvedPropertyId: selectedProperty,
                    matchedProperty: explicitProperty,
                    hasGa4Properties,
                    ga4Availability: 'available',
                    isSelectedSiteValid,
                    isSelectedPropertyValid,
                };
            }
        }

        // PRIORITY 2: fall back to fuzzy name matching (e.g., GA4 "antigravity"
        // automatically pairs with GSC "antigravity.codes" without explicit setup).
        if (matchedProperty?.property) {
            return {
                resolvedSiteUrl,
                resolvedPropertyId: matchedProperty.property,
                matchedProperty,
                hasGa4Properties,
                ga4Availability: 'available',
                isSelectedSiteValid,
                isSelectedPropertyValid,
            };
        }

        // PRIORITY 3: no explicit pairing AND no fuzzy match. Genuinely unmatched.
        return {
            resolvedSiteUrl,
            resolvedPropertyId: '',
            matchedProperty: null,
            hasGa4Properties,
            ga4Availability: hasGa4Properties ? 'site_unmatched' : propertyInventoryError ? 'inventory_error' : 'inventory_empty',
            isSelectedSiteValid,
            isSelectedPropertyValid,
        };
    }

    if (isSelectedPropertyValid) {
        return {
            resolvedSiteUrl: '',
            resolvedPropertyId: selectedProperty,
            matchedProperty: validProperties.find((property) => property.property === selectedProperty) || null,
            hasGa4Properties,
            ga4Availability: 'available',
            isSelectedSiteValid,
            isSelectedPropertyValid,
        };
    }

    return {
        resolvedSiteUrl: siteInventoryError ? selectedSite : '',
        resolvedPropertyId: '',
        matchedProperty: null,
        hasGa4Properties,
        ga4Availability: propertyInventoryError ? 'inventory_error' : 'inventory_empty',
        isSelectedSiteValid,
        isSelectedPropertyValid,
    };
}

export function getGa4AvailabilityCopy(
    availability: Ga4Availability,
    siteUrl?: string,
    propertyInventoryError?: string | null,
) {
    const siteLabel = siteUrl ? formatSiteLabel(siteUrl) : 'this site';

    switch (availability) {
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
