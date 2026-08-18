'use client';

import { Toaster } from 'sonner';
import { useIsMobile } from '@/lib/useIsMobile';

export default function ToastProvider() {
  // On mobile we anchor toasts to the top so they don't overlap the
  // MobileBottomBar (md:hidden, fixed bottom-0). Desktop keeps the
  // canonical bottom-right anchor.
  const isMobile = useIsMobile();
  return (
    <Toaster
      position={isMobile ? 'top-center' : 'bottom-right'}
      toastOptions={{
        style: {
          background: 'rgba(10, 10, 15, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#f0f0f0',
          fontSize: '13px',
          backdropFilter: 'blur(12px)',
        },
        className: 'toast-custom',
      }}
      richColors
      closeButton
      expand={false}
      duration={4000}
    />
  );
}
