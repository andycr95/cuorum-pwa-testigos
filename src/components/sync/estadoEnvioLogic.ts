export type EstadoEnvio = 'ENVIANDO' | 'PENDIENTE' | 'OFFLINE' | 'ENVIADO';

export interface ResolverEstadoEnvioParams {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: string;
}

export interface ResultadoEstadoEnvio {
  estado: EstadoEnvio;
  texto: string;
}

/**
 * Formatea la hora actual como hh:mm en formato 24h
 */
export function formatearHoraActual(fecha = new Date()): string {
  return fecha.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Determina el estado de envío y el texto correspondiente (CUO-207)
 * - isSyncing -> 'Enviando…'
 * - pendingCount > 0 -> 'Guardado en el teléfono (n pendientes)'
 * - !isOnline -> 'Sin internet' (como estado propio)
 * - isOnline -> 'Enviado ✓ hh:mm'
 */
export function resolverEstadoEnvio({
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncTime,
}: ResolverEstadoEnvioParams): ResultadoEstadoEnvio {
  if (isSyncing) {
    return {
      estado: 'ENVIANDO',
      texto: 'Enviando…',
    };
  }

  if (pendingCount > 0) {
    const sufijo = pendingCount === 1 ? '1 pendiente' : `${pendingCount} pendientes`;
    return {
      estado: 'PENDIENTE',
      texto: `Guardado en el teléfono (${sufijo})`,
    };
  }

  if (!isOnline) {
    return {
      estado: 'OFFLINE',
      texto: 'Sin internet',
    };
  }

  return {
    estado: 'ENVIADO',
    texto: `Enviado ✓ ${lastSyncTime}`,
  };
}
