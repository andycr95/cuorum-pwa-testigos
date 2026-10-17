import { useState, useEffect } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePendingSync } from '../../hooks/usePendingSync';
import { onSyncStateChange, getLastSyncTime } from '../../services/syncService';
import {
  resolverEstadoEnvio,
  formatearHoraActual,
  type EstadoEnvio,
} from './estadoEnvioLogic';

export {
  resolverEstadoEnvio,
  formatearHoraActual,
  type EstadoEnvio,
};

export interface BarraEstadoEnvioProps {
  /** Sobrescribe el estado de conexión (útil para pruebas) */
  isOnline?: boolean;
  /** Sobrescribe el número de pendientes (útil para pruebas) */
  pendingCount?: number;
  /** Sobrescribe si la sincronización está en curso (útil para pruebas) */
  isSyncing?: boolean;
  /** Sobrescribe la hora de la última sincronización (útil para pruebas) */
  lastSyncTime?: string;
}

/**
 * BarraEstadoEnvio (CUO-207)
 *
 * Barra de estado fija bajo la cabecera (sin taparla).
 * Estados con colores accesibles WCAG AA (contraste > 4.5:1):
 * - «Guardado en el teléfono» (n pendientes): advertencia (warn-700 sobre warn-50)
 * - «Enviando…»: informativo (info-700 sobre info-50)
 * - «Enviado ✓ hh:mm»: éxito (ok-700 sobre ok-50)
 * - «Sin internet»: estado propio sin conexión (err-700 sobre err-50)
 */
export function BarraEstadoEnvio(props: BarraEstadoEnvioProps) {
  const onlineHook = useOnlineStatus();
  const pendingHook = usePendingSync(2000);

  const [syncingState, setSyncingState] = useState(false);
  const [syncTimeState, setSyncTimeState] = useState<string>(() => {
    return getLastSyncTime() || formatearHoraActual();
  });

  useEffect(() => {
    const unsubscribe = onSyncStateChange((syncing) => {
      setSyncingState(syncing);
      if (!syncing) {
        const t = getLastSyncTime();
        if (t) setSyncTimeState(t);
      }
    });
    return unsubscribe;
  }, []);

  const isOnline = props.isOnline !== undefined ? props.isOnline : onlineHook.isOnline;
  const pendingCount = props.pendingCount !== undefined ? props.pendingCount : pendingHook.pendingCount;
  const isSyncing = props.isSyncing !== undefined ? props.isSyncing : syncingState;
  const lastSyncTime = props.lastSyncTime !== undefined ? props.lastSyncTime : syncTimeState;

  const { estado, texto } = resolverEstadoEnvio({
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
  });

  return (
    <div
      data-testid="barra-estado-envio"
      data-estado={estado}
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 border-b flex items-center justify-center gap-2 text-xs font-bold transition-colors select-none ${
        estado === 'ENVIANDO'
          ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
          : estado === 'PENDIENTE'
          ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
          : estado === 'OFFLINE'
          ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
          : 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]'
      }`}
    >
      {/* Iconos vectoriales accesibles según el estado */}
      {estado === 'ENVIANDO' && (
        <svg
          data-testid="icono-enviando"
          className="w-4 h-4 animate-spin flex-shrink-0 text-[#1D4ED8]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}

      {estado === 'PENDIENTE' && (
        <svg
          data-testid="icono-pendiente"
          className="w-4 h-4 flex-shrink-0 text-[#B45309]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}

      {estado === 'OFFLINE' && (
        <svg
          data-testid="icono-offline"
          className="w-4 h-4 flex-shrink-0 text-[#B91C1C]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
        </svg>
      )}

      {estado === 'ENVIADO' && (
        <svg
          data-testid="icono-enviado"
          className="w-4 h-4 flex-shrink-0 text-[#15803D]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}

      <span data-testid="texto-estado-envio" className="truncate tracking-wide">
        {texto}
      </span>
    </div>
  );
}
