import { useState, useEffect, useRef } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      setShowRestored(false);
    } else if (wasOffline.current) {
      wasOffline.current = false;
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  if (isOnline && !showRestored) return null;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-white text-xs font-bold transition-all duration-300 ${
        !isOnline
          ? 'bg-amber-500 shadow-lg shadow-amber-500/30'
          : 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
      }`}
    >
      {!isOnline ? (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728" />
            <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          </svg>
          <span>Sin conexion — los datos se guardaran localmente</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
          </svg>
          <span>Conexion restaurada</span>
        </>
      )}
    </div>
  );
}
