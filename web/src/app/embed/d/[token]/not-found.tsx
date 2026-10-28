import { Suspense } from 'react';

import { DashboardGone } from '@/app/view/[token]/DashboardGone';

export default function EmbedNotFound() {
    return <Suspense fallback={null}><DashboardGone embed /></Suspense>;
}
