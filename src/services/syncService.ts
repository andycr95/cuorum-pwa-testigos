import { api } from './api';
import {
  getPendientes,
  marcarSincronizados,
  logSync,
  getIncidenciasPendientes,
  marcarIncidenciasSincronizadas,
} from '../db/indexeddb';

/**
 * Servicio de Sincronización Offline-First
 *
 * Mejoras v2:
 * - Verificación de conectividad REAL (no navigator.onLine que es poco confiable)
 * - Backoff exponencial en fallos: 30s → 1min → 2min → 4min → 8min
 * - Sincronización de incidencias/novedades de mesa
 * - Respuesta enriquecida con validación del servidor
 */

let syncInProgress = false;
let backoffMs = 0;
let nextRetryAt = 0;
const MAX_BACKOFF_MS = 8 * 60 * 1000; // 8 minutos

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
  /** Respuesta de validación del servidor (si el backend la provee) */
  validacionServidor?: {
    alertas?: string[];
    aceptados?: number;
    rechazados?: number;
  };
  error?: string;
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
      error: 'Sync en progreso',
    };
  }

  syncInProgress = true;

  try {
    const { resultados, fotos } = await getPendientes();
    const incidencias = await getIncidenciasPendientes();

    if (resultados.length === 0 && fotos.length === 0 && incidencias.length === 0) {
      syncInProgress = false;
      return {
        success: true,
        resultadosSincronizados: 0,
        fotosSincronizadas: 0,
        incidenciasSincronizadas: 0,
      };
    }

    let resultadosSinc = 0;
    let fotosSinc = 0;
    let incidenciasSinc = 0;
    let validacionServidor: SyncResultado['validacionServidor'];

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

      const fotosMetadata: { mesaId: string; testigoId: string; capturedAt: string; deviceId: string }[] = [];
      for (const foto of fotos) {
        formData.append('fotos', foto.blob, `e14_${foto.mesaId}.jpg`);
        fotosMetadata.push({
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

      await marcarSincronizados(
        resultados.map((r) => r.id),
        fotos.map((f) => f.id),
      );

      resultadosSinc = resultados.length;
      fotosSinc = fotos.length;
    }

    // ─── Sync incidencias ──────────────────────────────────────────
    // Endpoint separado: POST /testigos/incidencias
    // Si el backend aún no lo implementa, el catch previene romper el sync principal

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

        await api.post(`/testigos/incidencias`, incFormData, {
          headers: { 'Content-Type': undefined },
        });

        await marcarIncidenciasSincronizadas(incidencias.map((i) => i.id));
        incidenciasSinc = incidencias.length;
        console.log(`[Sync] Incidencias: ${incidenciasSinc} enviadas`);
      } catch (incError) {
        console.warn('[Sync] Error sincronizando incidencias:', incError);
      }
    }

    await logSync('batch_sync', resultadosSinc + fotosSinc + incidenciasSinc, true);

    // Reset backoff en éxito
    backoffMs = 0;
    nextRetryAt = 0;

    console.log(
      `[Sync] Completado: ${resultadosSinc} resultados, ${fotosSinc} fotos, ${incidenciasSinc} incidencias`,
    );

    syncInProgress = false;
    return {
      success: true,
      resultadosSincronizados: resultadosSinc,
      fotosSincronizadas: fotosSinc,
      incidenciasSincronizadas: incidenciasSinc,
      validacionServidor,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sync] Error:', msg);
    await logSync('batch_sync', 0, false, msg);

    // Backoff exponencial: 30s → 1min → 2min → 4min → 8min
    backoffMs = Math.min(backoffMs === 0 ? 30_000 : backoffMs * 2, MAX_BACKOFF_MS);
    nextRetryAt = Date.now() + backoffMs;
    console.log(`[Sync] Próximo reintento en ${backoffMs / 1000}s`);

    syncInProgress = false;
    return {
      success: false,
      resultadosSincronizados: 0,
      fotosSincronizadas: 0,
      incidenciasSincronizadas: 0,
      error: msg,
    };
  }
}

export async function getEstadoSync() {
  const { resultados, fotos } = await getPendientes();
  const incidencias = await getIncidenciasPendientes();
  const online = await verificarConectividadReal();

  return {
    online,
    syncEnProgreso: syncInProgress,
    pendientes: {
      resultados: resultados.length,
      fotos: fotos.length,
      incidencias: incidencias.length,
      total: resultados.length + fotos.length + incidencias.length,
    },
  };
}
