import type { Metadata } from 'next';

import { BRAND_NAME } from '@/lib/brand';

import { SiteRouteGuard } from './SiteRouteGuard';

/** Overview title; section layouts (traffic, search, pages, actions) add their name. */
export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
    const { host } = await params;
    // Repeats the root template so the section pages keep "| TrafficClaw".
    return { title: { default: `Overview · ${decodeURIComponent(host)}`, template: `%s | ${BRAND_NAME}` } };
}

/** /dashboard/s/[host]/…: the site pages (DESIGN 4.2–4.3). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return <SiteRouteGuard>{children}</SiteRouteGuard>;
}
