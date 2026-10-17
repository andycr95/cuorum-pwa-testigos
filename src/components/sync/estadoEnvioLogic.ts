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

export function formatearHoraActual(fecha = new Date()): string {
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function resolverEstadoEnvio(p: ResolverEstadoEnvioParams): ResultadoEstadoEnvio {
  if (p.isSyncing) return { estado: 'ENVIANDO', texto: 'Enviando…' };
  if (p.pendingCount > 0) {
    const suf = p.pendingCount === 1 ? '1 pendiente' : `${p.pendingCount} pendientes`;
    return { estado: 'PENDIENTE', texto: `Guardado en el teléfono (${suf})` };
  }
  if (!p.isOnline) return { estado: 'OFFLINE', texto: 'Sin internet' };
  return { estado: 'ENVIADO', texto: `Enviado ✓ ${p.lastSyncTime}` };
}
