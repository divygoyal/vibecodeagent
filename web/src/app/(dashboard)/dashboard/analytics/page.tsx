'use client';

import { useEffect, useState } from 'react';
import { AnalyticsIntelligenceCards } from '@/components/analytics/AnalyticsIntelligenceCards';
import { AnalyticsSubpageEmptyState } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import SharedOverviewClient from '@/components/share-overview/openpanel/SharedOverviewClient';
import { getGa4AvailabilityCopy } from '@/lib/dashboardSelection';
import { useAnalyticsIntelligenceData } from '@/lib/useAnalyticsIntelligenceData';
import { useAnalyticsContext } from './layout';

const ANALYTICS_INTELLIGENCE_BOOT_DELAY_MS = 1_200;

export default function AnalyticsPage() {
    const {
        selectedProperty,
        selectedSite,
        range,
        setRange,
        hasGoogleConnection,
        ga4Availability,
        propertyInventoryError,
        openShareDashboard,
    } = useAnalyticsContext();
    const [intelligenceEnabled, setIntelligenceEnabled] = useState(false);
    const ga4AvailabilityCopy = getGa4AvailabilityCopy(ga4Availability, selectedSite, propertyInventoryError);

    useEffect(() => {
        if (!selectedProperty || !hasGoogleConnection || intelligenceEnabled) {
            return;
        }

        const timer = window.setTimeout(() => {
            setIntelligenceEnabled(true);
        }, ANALYTICS_INTELLIGENCE_BOOT_DELAY_MS);

        return () => window.clearTimeout(timer);
    }, [hasGoogleConnection, intelligenceEnabled, selectedProperty]);

    const { data: analyticsData } = useAnalyticsIntelligenceData(
        selectedProperty,
        hasGoogleConnection && intelligenceEnabled,
        range,
    );

    if (!selectedProperty) {
        return (
            <AnalyticsSubpageEmptyState
                title={ga4AvailabilityCopy.title}
                description={ga4AvailabilityCopy.description}
            />
        );
    }

    return (
        <div className="space-y-4">
            <SharedOverviewClient
                mode="dashboard"
                propertyId={selectedProperty}
                siteUrl={selectedSite || undefined}
                initialRange={range}
                onRangeChange={setRange}
                onShareDashboard={openShareDashboard}
            />

            {analyticsData?.kpis ? (
                <AnalyticsIntelligenceCards
                    kpis={analyticsData.kpis}
                    traffic={analyticsData.traffic || []}
                    channels={analyticsData.channels || []}
                />
            ) : null}
        </div>
    );
}
