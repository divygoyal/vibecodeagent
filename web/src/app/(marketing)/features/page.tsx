import { permanentRedirect } from 'next/navigation';

/**
 * /features was folded into the home page (DESIGN 4.4). This page only exists
 * until next.config.ts carries `{ source: '/features', destination: '/#product', permanent: true }`.
 */
export default function FeaturesPage() {
    permanentRedirect('/#product');
}
