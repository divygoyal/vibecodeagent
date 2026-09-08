import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_NAME} Globe — Real-Time Visitors`,
  description: `Real-time visitor globe powered by ${BRAND_NAME}`,
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-screen bg-[#080c18] overflow-hidden">
      {children}
    </div>
  );
}
