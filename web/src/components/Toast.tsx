'use client';

import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
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
