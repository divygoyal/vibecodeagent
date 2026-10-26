import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { toolBySlug } from '@/components/marketing/tools/catalog';

const tool = toolBySlug('hreflang-validator');

export const alt = `${tool.title}, a free SEO tool`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Free tool', title: tool.title, subtitle: tool.short });
}
