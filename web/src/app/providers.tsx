'use client';

import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';

import { AttributionCapture } from '@/components/growth/AttributionCapture';
import { TooltipProvider } from '@/components/ui/Tooltip';

const Toaster = dynamic(() => import('@/components/ui/Toaster').then((m) => m.Toaster), { ssr: false });
const OfflineBanner = dynamic(() => import('@/components/OfflineBanner'), { ssr: false });
// Tawk.to chat: marketing pages and Support at desktop width only (components/ui/chatWidget.ts).
const ChatWidget = dynamic(() => import('@/components/shell/ChatWidget').then((m) => m.ChatWidget), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider>
        {children}
        <AttributionCapture />
        <Toaster />
        <OfflineBanner />
        <ChatWidget />
      </TooltipProvider>
    </SessionProvider>
  );
}
