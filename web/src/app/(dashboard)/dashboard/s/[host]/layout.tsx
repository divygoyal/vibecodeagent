import { SiteRouteGuard } from './SiteRouteGuard';

/** /dashboard/s/[host]/…: the site pages (DESIGN 4.2–4.3). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return <SiteRouteGuard>{children}</SiteRouteGuard>;
}
