import { useState, useEffect } from 'react';

export function setSimulatedOnlineStatus(online: boolean) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cuorum:online-status', { detail: { isOnline: online } }));
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<{ isOnline: boolean }>;
      if (custom.detail && typeof custom.detail.isOnline === 'boolean') {
        setIsOnline(custom.detail.isOnline);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cuorum:online-status', handleCustom);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cuorum:online-status', handleCustom);
    };
  }, []);

  return { isOnline };
}
