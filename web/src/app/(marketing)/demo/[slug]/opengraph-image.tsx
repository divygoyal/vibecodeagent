import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { getDemoSites } from '@/lib/demo/catalog';

export const alt = 'Sample dashboard';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
    return getDemoSites().map((s) => ({ slug: s.key }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const site = getDemoSites().find((s) => s.key === slug);
    const host = site ? site.host.replace(/^www\./, '') : 'sample site';
    return marketingOgImage({ eyebrow: 'Live demo', title: `Sample dashboard: ${host}`, subtitle: 'Search Console and Analytics for one sample site. No sign-in.' });
}
