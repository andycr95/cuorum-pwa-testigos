import { useState, useEffect } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePendingSync } from '../../hooks/usePendingSync';
import { onSyncStateChange, getLastSyncTime, getLastSyncError } from '../../services/syncService';
import {
  resolverEstadoEnvio,
  formatearHoraActual,
  type EstadoEnvio,
} from './estadoEnvioLogic';

export { resolverEstadoEnvio, formatearHoraActual, type EstadoEnvio };

export interface BarraEstadoEnvioProps {
  isOnline?: boolean;
  pendingCount?: number;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  error?: string | null;
}

const ESTILOS: Record<EstadoEnvio, string> = {
  ENVIANDO: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  PENDIENTE: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  OFFLINE: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
  ENVIADO: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
  ONLINE: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
  NEUTRAL: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
  ERROR: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
};

export function BarraEstadoEnvio(props: BarraEstadoEnvioProps) {
  const onlineHook = useOnlineStatus();
  const pendingHook = usePendingSync(2000);
  const [syncingState, setSyncingState] = useState(false);
  const [syncTimeState, setSyncTimeState] = useState<string | null>(
    () => getLastSyncTime()
  );
  const [syncErrorState, setSyncErrorState] = useState<string | null>(
    () => getLastSyncError()
  );

  useEffect(() => {
    const handleSyncStatus = () => {
      setSyncTimeState(getLastSyncTime());
      setSyncErrorState(getLastSyncError());
    };
    window.addEventListener('cuorum:sync-status', handleSyncStatus);

    const unsub = onSyncStateChange((syncing) => {
      setSyncingState(syncing);
      if (!syncing) {
        setSyncTimeState(getLastSyncTime());
        setSyncErrorState(getLastSyncError());
      }
    });

    return () => {
      unsub();
      window.removeEventListener('cuorum:sync-status', handleSyncStatus);
    };
  }, []);

  const isOnline = props.isOnline !== undefined ? props.isOnline : onlineHook.isOnline;
  const pendingCount = props.pendingCount !== undefined ? props.pendingCount : pendingHook.pendingCount;
  const isSyncing = props.isSyncing !== undefined ? props.isSyncing : syncingState;
  const lastSyncTime = props.lastSyncTime !== undefined ? props.lastSyncTime : syncTimeState;
  const error = props.error !== undefined ? props.error : syncErrorState;

  const { estado, texto } = resolverEstadoEnvio({ isOnline, pendingCount, isSyncing, lastSyncTime, error });

  return (
    <div
      data-testid="barra-estado-envio"
      data-estado={estado}
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 border-b flex items-center justify-center gap-2 text-xs font-bold transition-colors select-none ${ESTILOS[estado]}`}
    >
      {estado === 'ENVIANDO' && (
        <svg data-testid="icono-enviando" className="w-4 h-4 animate-spin flex-shrink-0 text-[#1D4ED8]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
      )}
      {estado === 'PENDIENTE' && (
        <svg data-testid="icono-pendiente" className="w-4 h-4 flex-shrink-0 text-[#B45309]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round" /></svg>
      )}
      {estado === 'OFFLINE' && (
        <svg data-testid="icono-offline" className="w-4 h-4 flex-shrink-0 text-[#B91C1C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" /></svg>
      )}
      {estado === 'ERROR' && (
        <svg data-testid="icono-error" className="w-4 h-4 flex-shrink-0 text-[#B91C1C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" /></svg>
      )}
      {estado === 'ENVIADO' && (
        <svg data-testid="icono-enviado" className="w-4 h-4 flex-shrink-0 text-[#15803D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {(estado === 'ONLINE' || estado === 'NEUTRAL') && (
        <span data-testid="icono-online" className="w-2.5 h-2.5 rounded-full bg-[#15803D] flex-shrink-0" aria-hidden="true" />
      )}
      <span data-testid="texto-estado-envio" className="truncate tracking-wide">{texto}</span>
    </div>
  );
}
