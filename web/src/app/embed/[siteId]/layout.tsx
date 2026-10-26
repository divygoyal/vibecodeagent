import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_NAME} live visitors`,
  description: `Real-time visitors, powered by ${BRAND_NAME}`,
};

/** Chrome-less embed (DESIGN 2.1): light by default, `?theme=dark` for dark (set before paint by the theme script). */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-canvas text-fg">
      {children}
    </div>
  );
}
