import { NextResponse } from 'next/server';

import {
    QUERY_CHART_TYPES,
    QUERY_COMPARE_MODES,
    QUERY_DIMENSION_META,
    QUERY_METRIC_META,
} from '@/lib/analyticsQueryMeta';
import type { AnalyticsQueryMetaResponse } from '@/types/analyticsWorkspace';

export const dynamic = 'force-static';

export async function GET() {
    const response: AnalyticsQueryMetaResponse = {
        metrics: QUERY_METRIC_META,
        dimensions: QUERY_DIMENSION_META,
        compareModes: QUERY_COMPARE_MODES,
        chartTypes: QUERY_CHART_TYPES,
    };

    return NextResponse.json(response);
}
