'use client';

import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';

import { TooltipProvider } from '@/components/ui/Tooltip';

const Toaster = dynamic(() => import('@/components/ui/Toaster').then((m) => m.Toaster), { ssr: false });
const OfflineBanner = dynamic(() => import('@/components/OfflineBanner'), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider>
        {children}
        <Toaster />
        <OfflineBanner />
      </TooltipProvider>
    </SessionProvider>
  );
}
