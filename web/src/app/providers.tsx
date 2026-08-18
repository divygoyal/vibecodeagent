'use client';

import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';

const ToastProvider = dynamic(() => import('@/components/Toast'), { ssr: false });
const OfflineBanner = dynamic(() => import('@/components/OfflineBanner'), { ssr: false });
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <ToastProvider />
      <OfflineBanner />
      <CommandPalette />
    </SessionProvider>
  );
}
