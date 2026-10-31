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
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold border-b transition-colors font-sans ${
        !isOnline
          ? 'bg-warn-50 text-warn-700 border-[#FDE68A] dark:bg-[#451A03] dark:text-[#FCD34D] dark:border-[#78350F]'
          : 'bg-ok-50 text-ok-700 border-[#BBF7D0] dark:bg-[#052E16] dark:text-[#86EFAC] dark:border-[#14532D]'
      }`}
    >
      {!isOnline ? (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728" />
            <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          </svg>
          <span>Sin conexión — los datos se guardarán localmente</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
          </svg>
          <span>Conexión restaurada</span>
        </>
      )}
    </div>
  );
}
