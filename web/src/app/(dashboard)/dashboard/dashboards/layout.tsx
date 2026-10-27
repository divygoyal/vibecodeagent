import type { Metadata } from 'next';

import { BRAND_NAME } from '@/lib/brand';

// A layout with child pages repeats the root template so the children keep "| TrafficClaw".
export const metadata: Metadata = { title: { default: 'Dashboards', template: `%s | ${BRAND_NAME}` } };

/** Server layout so this client page gets its own document title. */
export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
