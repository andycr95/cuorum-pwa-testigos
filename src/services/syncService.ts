import { api } from './api';
import { jornadaService } from './jornadaService';
import {
  getPendientes,
  marcarSincronizados,
  marcarRechazados,
  logSync,
  getIncidenciasPendientes,
  marcarIncidenciasSincronizadas,
  marcarIncidenciasError,
  getJornadasPendientes,
  saveJornada,
} from '../db/indexeddb';

/**
 * Servicio de Sincronización Offline-First
 *
 * Mejoras v2:
 * - Verificación de conectividad REAL (no navigator.onLine que es poco confiable)
 * - Backoff exponencial en fallos: 30s → 1min → 2min → 4min → 8min
 * - Sincronización de incidencias/novedades de mesa
 * - Sincronización de jornadas electorales (checkin / apertura)
 * - Respuesta enriquecida con validación del servidor
 */

import {
  procesarRespuestaSync,
  getLastSyncTime,
  setLastSyncTime,
  clearLastSyncTime,
  getLastSyncError,
  setLastSyncError,
  clearLastSyncError,
  type ItemConId,
  type ResultadoProcesamientoSync,
} from './syncResponseLogic';

export {
  procesarRespuestaSync,
  getLastSyncTime,
  setLastSyncTime,
  clearLastSyncTime,
  getLastSyncError,
  setLastSyncError,
  clearLastSyncError,
  type ItemConId,
  type ResultadoProcesamientoSync,
};

let syncInProgress = false;
let backoffMs = 0;
let nextRetryAt = 0;
const MAX_BACKOFF_MS = 8 * 60 * 1000; // 8 minutos

type SyncListener = (syncing: boolean) => void;
const syncListeners: Set<SyncListener> = new Set();

export function onSyncStateChange(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncState(syncing: boolean) {
  for (const listener of syncListeners) {
    try {
      listener(syncing);
    } catch {
      // Ignorar errores en callbacks
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cuorum:sync-state', { detail: { syncing } }));
    window.dispatchEvent(new CustomEvent('cuorum:sync-status'));
  }
}

/**
 * Flag para pausar el auto-sync de fondo durante guardado manual.
 * Previene race condition: el poller podría enviar resultados parciales
 * (sin la foto E-14) si dispara entre los writes individuales a IndexedDB.
 */
let autoSyncPaused = false;

export function pauseAutoSync() {
  autoSyncPaused = true;
}

export function resumeAutoSync() {
  autoSyncPaused = false;
}

/**
 * Verifica conectividad REAL mediante un probe HTTP.
 *
 * navigator.onLine es poco confiable: puede reportar `true` en una
 * red que no tiene salida a internet (WiFi sin internet, EDGE saturado).
 * Este probe hace un fetch real con timeout de 3s — cualquier respuesta
 * HTTP (incluso 4xx) confirma que hay conectividad real.
 */
export async function verificarConectividadReal(): Promise<boolean> {
  if (!navigator.onLine) return false; // Corte rápido si el browser sabe que está offline

  try {
    await api.get(`/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    // Timeout, ECONNREFUSED, o sin respuesta = sin conectividad real
    return false;
  }
}

export interface SyncResultado {
  success: boolean;
  resultadosSincronizados: number;
  fotosSincronizadas: number;
  incidenciasSincronizadas: number;
  jornadasSincronizadas?: number;
  /** Respuesta de validación del servidor (si el backend la provee) */
  validacionServidor?: {
    alertas?: string[];
    aceptados?: number;
    rechazados?: number;
  };
  error?: string;
}

export async function sincronizarJornadas(): Promise<number> {
  const pendientes = await getJornadasPendientes();
  let sincronizadas = 0;

  for (const j of pendientes) {
    if (!j.mesaId) continue;

    try {
      const estadosConCheckin = ['CHECKIN', 'ABIERTA', 'EN_CONTEO', 'CERRADA', 'FIRMADA'];
      if (j.checkinAt && estadosConCheckin.includes(j.estado)) {
        try {
          await jornadaService.checkin(j.mesaId, j.checkinLat ?? 0, j.checkinLng ?? 0);
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status !== 400 && status !== 409) throw err;
        }
      }

      if (j.aperturaAt && j.aperturaChecklist) {
        try {
          await jornadaService.apertura(j.mesaId, j.aperturaChecklist, j.aperturaObservaciones);
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status !== 400 && status !== 409) throw err;
        }
      }

      await saveJornada({
        ...j,
        synced: 1,
        updatedAt: new Date().toISOString(),
      });
      sincronizadas++;
    } catch (err) {
      console.warn(`[Sync] Error sincronizando jornada de mesa ${j.mesaId}:`, err);
    }
  }

  return sincronizadas;
}

export function iniciarMonitoreoConexion() {
  // Intentar sync cuando se recupera la conexión — reset backoff
  window.addEventListener('online', () => {
    if (autoSyncPaused) return; // Guardado manual en progreso — no interferir
    console.log('[Sync] Conexión detectada. Reseteando backoff e iniciando sync...');
    backoffMs = 0;
    nextRetryAt = 0;
    sincronizar();
  });

  // Poll cada 30s — respeta el backoff exponencial en fallos
  setInterval(async () => {
    if (syncInProgress) return;
    if (autoSyncPaused) return; // Guardado manual en progreso — no interferir
    if (Date.now() < nextRetryAt) return; // En espera de backoff

    const online = await verificarConectividadReal();
    if (online) {
      sincronizar();
    }
  }, 30_000);

  // Sync inicial al arrancar la app
  verificarConectividadReal().then((online) => {
    if (online) sincronizar();
  });
}

export async function sincronizar(): Promise<SyncResultado> {
  if (syncInProgress) {
    return {
      success: false,
      resultadosSincronizados: 0,
      fotosSincronizadas: 0,
      incidenciasSincronizadas: 0,
      jornadasSincronizadas: 0,
      error: 'Sync en progreso',
    };
  }

  syncInProgress = true;
  notifySyncState(true);

  try {
    const jornadasPendientes = await getJornadasPendientes();
    const { resultados, fotos } = await getPendientes();
    const incidencias = await getIncidenciasPendientes();

    if (
      resultados.length === 0 &&
      fotos.length === 0 &&
      incidencias.length === 0 &&
      jornadasPendientes.length === 0
    ) {
      syncInProgress = false;
      notifySyncState(false);
      return {
        success: true,
        resultadosSincronizados: 0,
        fotosSincronizadas: 0,
        incidenciasSincronizadas: 0,
        jornadasSincronizadas: 0,
      };
    }

    let resultadosSinc = 0;
    let fotosSinc = 0;
    let incidenciasSinc = 0;
    let jornadasSinc = 0;
    let validacionServidor: SyncResultado['validacionServidor'];

    // ─── Sync jornadas (checkin / apertura) ───────────────────────
    if (jornadasPendientes.length > 0) {
      jornadasSinc = await sincronizarJornadas();
    }

    let tieneRechazosTotal = false;
    let rechazadosCountTotal = 0;

    // ─── Sync resultados de mesa y fotos E-14 ─────────────────────

    if (resultados.length > 0 || fotos.length > 0) {
      console.log(`[Sync] Enviando: ${resultados.length} resultados, ${fotos.length} fotos`);

      const formData = new FormData();

      formData.append(
        'resultados',
        JSON.stringify(
          resultados.map(({ synced: _s, syncAttempts: _a, lastSyncError: _e, ...data }) => data),
        ),
      );

      const fotosMetadata: { id?: string; mesaId: string; testigoId: string; capturedAt: string; deviceId: string }[] = [];
      for (const foto of fotos) {
        formData.append('fotos', foto.blob, `e14_${foto.mesaId}.jpg`);
        fotosMetadata.push({
          id: foto.id,
          mesaId: foto.mesaId,
          testigoId: foto.testigoId,
          capturedAt: foto.capturedAt,
          deviceId: foto.deviceId,
        });
      }
      formData.append('fotosMetadata', JSON.stringify(fotosMetadata));

      const response = await api.post(`/testigos/sync`, formData, {
        headers: { 'Content-Type': undefined },
      });

      // Parsear validación del servidor si el backend la provee
      if (response.data && typeof response.data === 'object') {
        validacionServidor = {
          alertas: response.data.alertas ?? [],
          aceptados: response.data.aceptados,
          rechazados: response.data.rechazados,
        };
      }

      const resProc = procesarRespuestaSync(resultados, response.data, 'resultado');
      const fotoProc = procesarRespuestaSync(fotos, response.data, 'foto');

      if (resProc.acceptedIds.length > 0 || fotoProc.acceptedIds.length > 0) {
        await marcarSincronizados(resProc.acceptedIds, fotoProc.acceptedIds);
      }

      if (resProc.rejectedItems.length > 0 || fotoProc.rejectedItems.length > 0) {
        await marcarRechazados(resProc.rejectedItems, fotoProc.rejectedItems);
        tieneRechazosTotal = true;
        rechazadosCountTotal += resProc.rejectedItems.length + fotoProc.rejectedItems.length;
      }

      resultadosSinc = resProc.acceptedIds.length;
      fotosSinc = fotoProc.acceptedIds.length;
    }

    // ─── Sync incidencias ──────────────────────────────────────────
    // Endpoint separado: POST /testigos/incidencias
    let incidenciasError: string | null = null;

    if (incidencias.length > 0) {
      try {
        const incFormData = new FormData();

        const incMetadata = incidencias.map(
          ({ synced: _s, syncAttempts: _a, lastSyncError: _e, fotoBlob: _f, ...data }) => data,
        );
        incFormData.append('incidencias', JSON.stringify(incMetadata));

        // Mapeo foto↔incidencia: el backend necesita saber qué ID corresponde
        // a cada archivo subido (por orden de inserción en el FormData)
        const fotosIds: string[] = [];
        incidencias.forEach((inc) => {
          if (inc.fotoBlob) {
            incFormData.append('fotosIncidencias', inc.fotoBlob, `inc_${inc.id}.jpg`);
            fotosIds.push(inc.id);
          }
        });
        incFormData.append('fotosIncidenciasIds', JSON.stringify(fotosIds));

        const incResponse = await api.post(`/testigos/incidencias`, incFormData, {
          headers: { 'Content-Type': undefined },
        });

        const incProc = procesarRespuestaSync(incidencias, incResponse.data, 'incidencia');
        if (incProc.acceptedIds.length > 0) {
          await marcarIncidenciasSincronizadas(incProc.acceptedIds);
        }
        if (incProc.rejectedItems.length > 0) {
          await marcarIncidenciasError(incProc.rejectedItems);
          tieneRechazosTotal = true;
          rechazadosCountTotal += incProc.rejectedItems.length;
        }
        incidenciasSinc = incProc.acceptedIds.length;
        console.log(`[Sync] Incidencias: ${incidenciasSinc} enviadas`);
      } catch (incError: any) {
        console.warn('[Sync] Error sincronizando incidencias:', incError);
        const msg = incError instanceof Error ? incError.message : 'Error al sincronizar incidencias';
        incidenciasError = msg;
        await marcarIncidenciasError(incidencias.map((i) => ({ id: i.id, error: msg })));
        tieneRechazosTotal = true;
        rechazadosCountTotal += incidencias.length;
      }
    }

    const huboFallos = tieneRechazosTotal || incidenciasError !== null;

    if (huboFallos) {
      const errorMsg =
        incidenciasError ||
        (rechazadosCountTotal === 1
          ? '1 elemento rechazado por el servidor'
          : `${rechazadosCountTotal} elementos rechazados por el servidor`);
      setLastSyncError(errorMsg);
      await logSync('batch_sync', resultadosSinc + fotosSinc + incidenciasSinc + jornadasSinc, false, errorMsg);
    } else {
      setLastSyncError(null);
      await logSync('batch_sync', resultadosSinc + fotosSinc + incidenciasSinc + jornadasSinc, true);
      // Reset backoff en éxito completo
      backoffMs = 0;
      nextRetryAt = 0;

      const horaEnvio = new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setLastSyncTime(horaEnvio);
    }

    console.log(
      `[Sync] Completado: ${resultadosSinc} resultados, ${fotosSinc} fotos, ${incidenciasSinc} incidencias, ${jornadasSinc} jornadas (fallos: ${huboFallos ? 'sí' : 'no'})`,
    );

    syncInProgress = false;
    notifySyncState(false);

    return {
      success: !huboFallos,
      resultadosSincronizados: resultadosSinc,
      fotosSincronizadas: fotosSinc,
      incidenciasSincronizadas: incidenciasSinc,
      jornadasSincronizadas: jornadasSinc,
      validacionServidor,
      ...(huboFallos ? { error: getLastSyncError() || 'Error en sincronización' } : {}),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sync] Error:', msg);
    setLastSyncError(msg);
    await logSync('batch_sync', 0, false, msg);

    // Backoff exponencial: 30s → 1min → 2min → 4min → 8min
    backoffMs = Math.min(backoffMs === 0 ? 30_000 : backoffMs * 2, MAX_BACKOFF_MS);
    nextRetryAt = Date.now() + backoffMs;
    console.log(`[Sync] Próximo reintento en ${backoffMs / 1000}s`);

    syncInProgress = false;
    notifySyncState(false);
    return {
      success: false,
      resultadosSincronizados: 0,
      fotosSincronizadas: 0,
      incidenciasSincronizadas: 0,
      jornadasSincronizadas: 0,
      error: msg,
    };
  }
}

export const sincronizarTodo = sincronizar;

export async function getEstadoSync() {
  const { resultados, fotos } = await getPendientes();
  const incidencias = await getIncidenciasPendientes();
  const jornadasPendientes = await getJornadasPendientes();
  const online = await verificarConectividadReal();

  return {
    online,
    syncEnProgreso: syncInProgress,
    pendientes: {
      resultados: resultados.length,
      fotos: fotos.length,
      incidencias: incidencias.length,
      jornadas: jornadasPendientes.length,
      total:
        resultados.length +
        fotos.length +
        incidencias.length +
        jornadasPendientes.length,
    },
  };
}
