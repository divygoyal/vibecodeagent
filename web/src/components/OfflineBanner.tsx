'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator !== 'undefined') return !navigator.onLine;
    return false;
  });
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 border-b px-4 py-2 text-meta font-medium ${
        isOffline
          ? 'border-down/20 bg-down-soft text-down'
          : 'border-up/20 bg-up-soft text-up'
      }`}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          You&apos;re offline. Some features may not work.
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5" />
          Back online
        </>
      )}
    </div>
  );
}
