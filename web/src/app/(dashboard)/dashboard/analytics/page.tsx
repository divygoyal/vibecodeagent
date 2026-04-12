'use client';

import { Loader2 } from 'lucide-react';
import { AnalyticsIntelligenceCards } from '@/components/analytics/AnalyticsIntelligenceCards';
import SharedOverviewClient from '@/components/share-overview/openpanel/SharedOverviewClient';
import { useAnalyticsIntelligenceData } from '@/lib/useAnalyticsIntelligenceData';
import { useRegistration } from '../layout';
import { useAnalyticsContext } from './layout';

export default function AnalyticsPage() {
    const { selectedSite } = useRegistration();
    const { selectedProperty, range, setRange, hasGoogleConnection, openShareDashboard } = useAnalyticsContext();
    const { data: analyticsData } = useAnalyticsIntelligenceData(selectedProperty, hasGoogleConnection, range);

    if (!selectedProperty) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
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
