import { Suspense } from 'react';

import { DashboardGone } from './DashboardGone';

export default function ViewNotFound() {
    return <Suspense fallback={null}><DashboardGone /></Suspense>;
}
